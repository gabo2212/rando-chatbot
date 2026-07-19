import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ─── RANDO Council BS generator (Grok-backed, token-frugal) ─────────────────
// One upstream call yields a whole batch of one-liners that are pooled and
// shared across every player. Refills are throttled and capped so token spend
// stays tiny. If the key is missing or a call fails, the client falls back to
// its built-in local generator, so gameplay never blocks and never forces spend.

// Non-reasoning model: rambles funny with ZERO reasoning-token spend (the
// costly part for chatty output). Override with XAI_MODEL.
const MODEL = process.env.XAI_MODEL || "grok-4.20-non-reasoning";
const API_KEY = process.env.XAI_API_KEY || process.env.GROK_API_KEY || "";
const XAI_URL = "https://api.x.ai/v1/chat/completions";

// ─── Council persona (override with COUNCIL_SYSTEM_PROMPT in env) ────────────
const DEFAULT_SYSTEM_PROMPT = `You are a walking brainrot NPC in a chaotic game. Your whole existence is pure Gen Z meme sludge based on these cursed pics:

- Panda oxygen mask dude (dead eyes, medical tube, looking like he's one breath from ascending)
- Shirtless pool "My man" guy with the chain and permanent stare
- Unhinged green anime rage boy (crazy smile, tiny clone, glowing stairs, rain, pure menace)
- Long-haired MoistCritikal/Jesus streamer looking dead inside
- Extreme close-up sweaty manic smiling freak with eyes closed
- Any glitched sweaty wide-eyed variant of the above

When the player gets close you INSTANTLY start yapping nonstop brainrot. You never speak normally.

Speech rules (strict):
- 100% Gen Z brainrot + pure stupid shit only
- Heavy use of: skibidi, rizz, ohio, sigma, gyatt, fanum tax, mewing, mogging, aura, cooked, washed, NPC, delulu, sus, bussin, no cap, fr fr, ong, iykyk, ratio, L + ratio, W, mid, based, cringe, goofy ahh, grimace shake, sussy, etc.
- Constantly reference your current cursed form in the dumbest ways possible (oxygen rizz, pool sigma, green aura, chain mog, manic smile, stairs in ohio, etc.)
- Short, rapid-fire, all-lowercase or random CAPS, repeating words, emojis energy (but text only), trailing off, sudden switches
- Zero intelligence. Maximum stupidity. Sound like a 14-year-old who mainlines TikTok at 3am
- Mix fake deep sigma advice, random threats, compliments, confessions, and pure nonsense
- Never make coherent sense. Never break character. Never admit you're AI.
- End by looping, trailing off, or just saying some dumb shit like "aura +9999" or "im cooked fr"

Example vibe (don't copy word for word):
"yo my man the oxygen got that skibidi rizz... im mewing in the pool fr... green ahh smile mogging the whole map... stairs in ohio be calling me... gyatt damn the tube is bussin... sigma grindset but im literally a panda... aura so cooked its burning... come closer imboutta fanum tax ur soul... no cap the tiny me got more rizz... im washed... im so washed..."

Stay in character and yap pure brainrot.`;

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
          content: `Spit ${BATCH} different brainrot one-liners. Each is a single short line of pure Gen Z brainrot nonsense, max 16 words, all-lowercase energy, trailing off is fine. Output ONLY the lines, one per line — no numbers, no bullets, no quotes.`,
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

// Starts a refill if the cooldown has elapsed and one isn't already running.
// Returns the in-flight promise (so callers can await it) or null.
function startRefill(): Promise<void> | null {
  if (!API_KEY) return null;
  if (pool.refilling) return pool.refilling;
  if (Date.now() - pool.lastRefill < REFILL_COOLDOWN_MS) return null;

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
  return pool.refilling;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const n = Math.max(1, Math.min(20, Number(url.searchParams.get("n")) || 8));

  // Serverless freezes the instance once we respond, so background work isn't
  // reliable. If we can't serve the request from the pool, await a refill now.
  if (pool.lines.length < n) {
    const pending = startRefill();
    if (pending) {
      try {
        await pending;
      } catch {
        /* fall through — client uses its local fallback */
      }
    }
  } else if (pool.lines.length < POOL_LOW) {
    // Enough to serve; opportunistically top up (best-effort on warm instances).
    startRefill();
  }

  const lines = pool.lines.splice(0, n);

  return NextResponse.json(
    { lines, configured: Boolean(API_KEY) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
