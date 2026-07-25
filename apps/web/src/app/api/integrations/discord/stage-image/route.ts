import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/integrations/discord/auth-guard";
import {
  stageDiscordImage,
  sweepStagedDiscordImages,
} from "@/lib/integrations/discord/stage-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const data = Buffer.from(await file.arrayBuffer());
    const staged = await stageDiscordImage({
      userId: user.id,
      fileName: file.name,
      contentType: file.type || "application/octet-stream",
      data,
    });
    void sweepStagedDiscordImages();

    return NextResponse.json({
      ok: true,
      assetId: staged.assetId,
      fileName: file.name,
      expiresAt: staged.expiresAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stage failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
