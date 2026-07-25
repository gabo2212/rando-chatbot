import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile, unlink, readdir, stat } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const STAGE_TTL_MS = 30 * 60 * 1000;
const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = new Set(["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"]);

type Meta = {
  userId: string;
  contentType: string;
  fileName: string;
  createdAt: number;
  expiresAt: number;
};

function stageRoot() {
  return path.join(os.tmpdir(), "rando-discord-stage");
}

function assetPaths(assetId: string) {
  const id = assetId.replace(/^staged:/, "");
  const dir = path.join(stageRoot(), id);
  return {
    id,
    dir,
    bin: path.join(dir, "file.bin"),
    meta: path.join(dir, "meta.json"),
  };
}

export function isStagedAssetId(id: string) {
  return id.startsWith("staged:");
}

export async function stageDiscordImage(input: {
  userId: string;
  fileName: string;
  contentType: string;
  data: Buffer;
}): Promise<{ assetId: string; expiresAt: string }> {
  const contentType = (input.contentType || "application/octet-stream").toLowerCase();
  let resolvedType = contentType;
  if (!ALLOWED.has(resolvedType)) {
    const ext = path.extname(input.fileName).toLowerCase();
    const byExt =
      ext === ".png"
        ? "image/png"
        : ext === ".webp"
          ? "image/webp"
          : ext === ".gif"
            ? "image/gif"
            : ext === ".jpg" || ext === ".jpeg"
              ? "image/jpeg"
              : null;
    if (!byExt) throw new Error("Only png, jpeg, gif, and webp images can be staged for Discord.");
    resolvedType = byExt;
  }
  if (input.data.length > MAX_BYTES) throw new Error("Image exceeds 8MB.");

  const id = randomBytes(16).toString("base64url");
  const { dir, bin, meta } = assetPaths(id);
  await mkdir(dir, { recursive: true });
  const now = Date.now();
  const record: Meta = {
    userId: input.userId,
    contentType: resolvedType,
    fileName: input.fileName,
    createdAt: now,
    expiresAt: now + STAGE_TTL_MS,
  };
  await writeFile(bin, input.data);
  await writeFile(meta, JSON.stringify(record), "utf8");
  return { assetId: `staged:${id}`, expiresAt: new Date(record.expiresAt).toISOString() };
}

export async function readStagedDiscordImage(
  userId: string,
  assetId: string,
): Promise<{ name: string; data: Buffer; contentType: string }> {
  if (!isStagedAssetId(assetId)) throw new Error("Not a staged asset id.");
  const { bin, meta, dir } = assetPaths(assetId);
  let raw: string;
  try {
    raw = await readFile(meta, "utf8");
  } catch {
    throw new Error("Staged image expired or missing. Re-attach the file and try again.");
  }
  const record = JSON.parse(raw) as Meta;
  if (record.userId !== userId) throw new Error("Staged image does not belong to this user.");
  if (Date.now() > record.expiresAt) {
    await unlink(bin).catch(() => undefined);
    await unlink(meta).catch(() => undefined);
    await unlink(dir).catch(() => undefined);
    throw new Error("Staged image expired. Re-attach the file and try again.");
  }
  const data = await readFile(bin);
  const ext =
    record.contentType.includes("png")
      ? "png"
      : record.contentType.includes("webp")
        ? "webp"
        : record.contentType.includes("gif")
          ? "gif"
          : "jpg";
  return {
    name: record.fileName || `image.${ext}`,
    data,
    contentType: record.contentType,
  };
}

/** Best-effort cleanup of expired stage dirs (called opportunistically). */
export async function sweepStagedDiscordImages() {
  const root = stageRoot();
  let entries: string[] = [];
  try {
    entries = await readdir(root);
  } catch {
    return;
  }
  const now = Date.now();
  for (const id of entries) {
    const { meta, bin, dir } = assetPaths(id);
    try {
      const record = JSON.parse(await readFile(meta, "utf8")) as Meta;
      if (now <= record.expiresAt) continue;
      await unlink(bin).catch(() => undefined);
      await unlink(meta).catch(() => undefined);
      await unlink(dir).catch(() => undefined);
    } catch {
      try {
        const st = await stat(dir);
        if (now - st.mtimeMs > STAGE_TTL_MS) {
          await unlink(bin).catch(() => undefined);
          await unlink(meta).catch(() => undefined);
          await unlink(dir).catch(() => undefined);
        }
      } catch {
        /* ignore */
      }
    }
  }
}

export function hashStagedPayload(ids: string[]) {
  return createHash("sha256").update(ids.join("|")).digest("hex");
}
