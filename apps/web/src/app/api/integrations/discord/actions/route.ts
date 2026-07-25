import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/integrations/discord/auth-guard";
import { confirmAndExecute, cancelJob, sendTestMessage } from "@/lib/integrations/discord/service";
import { confirmActionSchema } from "@/lib/integrations/discord/schemas";
import { toPublicDiscordError } from "@/lib/integrations/discord/errors";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("confirm"), confirmationId: z.string().min(1) }),
  z.object({ op: z.literal("cancel_job"), jobId: z.string().min(1) }),
  z.object({
    op: z.literal("test_message"),
    guildId: z.string().min(1),
    channelId: z.string().min(1),
  }),
]);

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const json = await request.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

    switch (parsed.data.op) {
      case "confirm": {
        confirmActionSchema.parse({ confirmationId: parsed.data.confirmationId });
        const result = await confirmAndExecute(user.id, parsed.data.confirmationId);
        return NextResponse.json({ ok: true, result });
      }
      case "cancel_job":
        return NextResponse.json(await cancelJob(user.id, parsed.data.jobId));
      case "test_message":
        return NextResponse.json(
          await sendTestMessage(user.id, parsed.data.guildId, parsed.data.channelId),
        );
    }
  } catch (error) {
    const pub = toPublicDiscordError(error);
    return NextResponse.json(
      {
        error: pub.message,
        code: pub.code,
        confirmationId: pub.confirmationId,
        preview: pub.preview,
      },
      { status: pub.status },
    );
  }
}
