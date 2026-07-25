import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/integrations/discord/auth-guard";
import { listGuildChannels } from "@/lib/integrations/discord/service";
import { listChannelsSchema } from "@/lib/integrations/discord/schemas";
import { toPublicDiscordError } from "@/lib/integrations/discord/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const url = new URL(request.url);
    const typesRaw = url.searchParams.get("types");
    const parsed = listChannelsSchema.safeParse({
      guildId: url.searchParams.get("guildId"),
      types: typesRaw ? typesRaw.split(",") : undefined,
    });
    if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 });
    const channels = await listGuildChannels(user.id, parsed.data.guildId, parsed.data.types);
    return NextResponse.json({ channels });
  } catch (error) {
    const pub = toPublicDiscordError(error);
    return NextResponse.json({ error: pub.message, code: pub.code }, { status: pub.status });
  }
}
