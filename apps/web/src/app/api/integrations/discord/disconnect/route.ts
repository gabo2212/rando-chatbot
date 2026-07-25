import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/integrations/discord/auth-guard";
import { disconnectDiscord } from "@/lib/integrations/discord/service";
import { toPublicDiscordError } from "@/lib/integrations/discord/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await disconnectDiscord(user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const pub = toPublicDiscordError(error);
    return NextResponse.json({ error: pub.message, code: pub.code }, { status: pub.status });
  }
}
