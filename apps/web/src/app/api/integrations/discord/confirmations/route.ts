import { NextResponse } from "next/server";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { discordConfirmation } from "@chatbot/db";

import { requireSessionUser } from "@/lib/integrations/discord/auth-guard";
import { db } from "@/lib/db";
import { toPublicDiscordError } from "@/lib/integrations/discord/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const database = db();
    const rows = await database
      .select({
        id: discordConfirmation.id,
        actionType: discordConfirmation.actionType,
        payloadJson: discordConfirmation.payloadJson,
        expiresAt: discordConfirmation.expiresAt,
        createdAt: discordConfirmation.createdAt,
      })
      .from(discordConfirmation)
      .where(
        and(
          eq(discordConfirmation.userId, user.id),
          isNull(discordConfirmation.consumedAt),
          gt(discordConfirmation.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(discordConfirmation.createdAt))
      .limit(10);

    return NextResponse.json({
      confirmations: rows.map((r) => ({
        confirmationId: r.id,
        actionType: r.actionType,
        preview: JSON.parse(r.payloadJson) as Record<string, unknown>,
        expiresAt: r.expiresAt,
      })),
    });
  } catch (error) {
    const pub = toPublicDiscordError(error);
    return NextResponse.json({ error: pub.message, code: pub.code }, { status: pub.status });
  }
}
