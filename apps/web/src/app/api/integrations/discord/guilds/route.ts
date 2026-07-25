import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSessionUser } from "@/lib/integrations/discord/auth-guard";
import { listAuthorizedGuilds, selectGuild } from "@/lib/integrations/discord/service";
import { toPublicDiscordError } from "@/lib/integrations/discord/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ guilds: await listAuthorizedGuilds(user.id) });
  } catch (error) {
    const pub = toPublicDiscordError(error);
    return NextResponse.json({ error: pub.message, code: pub.code }, { status: pub.status });
  }
}

const bodySchema = z.object({
  guildId: z.string().min(1),
  selectedChannelId: z.string().nullable().optional(),
  enabledCapabilities: z
    .object({
      sendMessages: z.boolean().optional(),
      imageBatches: z.boolean().optional(),
      channelCreate: z.boolean().optional(),
      channelDelete: z.boolean().optional(),
      voice: z.boolean().optional(),
    })
    .optional(),
});

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const json = await request.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    const result = await selectGuild({ userId: user.id, ...parsed.data });
    return NextResponse.json(result);
  } catch (error) {
    const pub = toPublicDiscordError(error);
    return NextResponse.json({ error: pub.message, code: pub.code }, { status: pub.status });
  }
}
