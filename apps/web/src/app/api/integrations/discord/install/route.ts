import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSessionUser } from "@/lib/integrations/discord/auth-guard";
import { getInstallUrl } from "@/lib/integrations/discord/service";
import { toPublicDiscordError } from "@/lib/integrations/discord/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  guildId: z.string().optional(),
  channelCreate: z.enum(["0", "1"]).optional(),
  voice: z.enum(["0", "1"]).optional(),
});

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const url = new URL(request.url);
    const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 });
    const result = await getInstallUrl(user.id, {
      guildId: parsed.data.guildId,
      channelCreate: parsed.data.channelCreate === "1",
      voice: parsed.data.voice === "1",
    });
    return NextResponse.json(result);
  } catch (error) {
    const pub = toPublicDiscordError(error);
    return NextResponse.json({ error: pub.message, code: pub.code }, { status: pub.status });
  }
}
