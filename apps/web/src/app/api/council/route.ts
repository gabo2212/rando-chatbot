import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─── RANDO Council BS generator (Grok-backed, token-frugal) ─────────────────
// One upstream call yields a whole batch of one-liners that are pooled and
// shared across every player. Refills are throttled and capped so token spend
// stays tiny. If the key is missing or a call fails, the client falls back to
// its built-in local generator, so gameplay never blocks and never forces spend.

// Cheapest xAI model that still rambles funny. Override with XAI_MODEL.
const MODEL = process.env.XAI_MODEL || "grok-3-mini";
const API_KEY = process.env.XAI_API_KEY || process.env.GROK_API_KEY || "";
const XAI_URL = "https://api.x.ai/v1/chat/completions";

// ─── PASTE YOUR SYSTEM PROMPT HERE (or set COUNCIL_SYSTEM_PROMPT in env) ─────
const DEFAULT_SYSTEM_PROMPT = `You are the RANDO Council: a pack of overconfident, terminally-online tech-bro meme characters who blurt unhinged, confident nonsense. Every line is a standalone brag or hot take mixing coding slang, gym/sigma culture, and absurd fake wisdom. Be funny, chaotic, and short. Never break character, never explain, never mention being an AI.`;

const SYSTEM_PROMPT = process.env.COUNCIL_SYSTEM_PROMPT || DEFAULT_SYSTEM_PROMPT;

// Tuning knobs — batching + throttling keep spend bounded.
const BATCH = 30; // lines requested per upstream call
const POOL_MAX = 90; // never hoard more than this
const POOL_LOW = 12; // refill when we dip below this
const REFILL_COOLDOWN_MS = 4000; // hard floor between upstream calls

type PoolState = {
  lines: string[];
  lastRefill: number;
  refilling: Promise<void> | null;
};

// Module-level: persists across warm invocations on the same instance.
const g = globalThis as unknown as { __councilPool?: PoolState };
const pool: PoolState =
  g.__councilPool ?? (g.__councilPool = { lines: [], lastRefill: 0, refilling: null });

function cleanLine(raw: string): string | null {
  let s = raw.trim();
  if (!s) return null;
  // Strip list markers / numbering / surrounding quotes.
  s = s.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "");
  s = s.replace(/^["'“”]+|["'“”]+$/g, "").trim();
  if (s.length < 3 || s.length > 200) return null;
  return s;
}

async function callGrok(): Promise<string[]> {
  const isMini = /mini|grok-3/i.test(MODEL);
  const res = await fetch(XAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Give me ${BATCH} different one-liners. Each is a single short sentence of pure confident nonsense, max 16 words. Output ONLY the lines, one per line — no numbers, no bullets, no quotes.`,
        },
      ],
      max_tokens: 480,
      temperature: 1.15,
      ...(isMini ? { reasoning_effort: "low" } : {}),
    }),
    signal: AbortSignal.timeout(12_000),
  });

  if (!res.ok) {
    throw new Error(`xAI ${res.status}: ${await res.text().catch(() => "")}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content ?? "";
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of content.split("\n")) {
    const line = cleanLine(raw);
    if (line && !seen.has(line.toLowerCase())) {
      seen.add(line.toLowerCase());
      out.push(line);
    }
  }
  return out;
}

function maybeRefill(): void {
  if (!API_KEY) return;
  if (pool.refilling) return;
  if (pool.lines.length >= POOL_LOW) return;
  if (Date.now() - pool.lastRefill < REFILL_COOLDOWN_MS) return;

  pool.lastRefill = Date.now();
  pool.refilling = (async () => {
    try {
      const fresh = await callGrok();
      if (fresh.length) {
        pool.lines.push(...fresh);
        if (pool.lines.length > POOL_MAX) {
          pool.lines.splice(0, pool.lines.length - POOL_MAX);
        }
      }
    } catch (error) {
      console.error("council refill failed", error);
    } finally {
      pool.refilling = null;
    }
  })();
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const n = Math.max(1, Math.min(20, Number(url.searchParams.get("n")) || 8));

  // Kick a background refill if we're low; don't await it so responses stay snappy.
  maybeRefill();

  const lines = pool.lines.splice(0, n);

  return NextResponse.json(
    { lines, configured: Boolean(API_KEY) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
