import { createAuth } from "@chatbot/auth";
import { env } from "@chatbot/env/server";

import { extractFileText } from "@/lib/extract-text";
import { deleteDocument, indexDocument, listUserDocuments } from "@/lib/rag";

export const maxDuration = 120;

type R2BucketLike = {
  put: (
    key: string,
    value: ArrayBuffer | string,
    options?: { httpMetadata?: { contentType?: string } },
  ) => Promise<unknown>;
  delete?: (key: string) => Promise<unknown>;
};

function getDocumentsBucket(): R2BucketLike | null {
  const bucket = env.DOCUMENTS_BUCKET as R2BucketLike | undefined;
  return bucket ?? null;
}

async function getSessionUser(request?: Request) {
  try {
    const headers =
      request?.headers ??
      (await (async () => {
        const { headers } = await import("next/headers");
        return headers();
      })());
    const session = await createAuth().api.getSession({ headers });
    return session?.user ?? null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const docs = await listUserDocuments(user.id);
    return Response.json({ documents: docs });
  } catch (error) {
    console.error(error);
    return Response.json(
      { error: "Database not configured or query failed" },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  const user = await getSessionUser(request);
  const form = await request.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return Response.json({ error: "No file provided" }, { status: 400 });
  }

  const extracted = await extractFileText(file);
  const text = extracted.text.trim();
  if (!text) {
    return Response.json(
      {
        error: "Could not extract any text from this file",
        warning: extracted.warning,
        method: extracted.method,
      },
      { status: 400 },
    );
  }

  const blobKey = `docs/${user?.id ?? "anon"}/${crypto.randomUUID()}-${file.name}`;
  const bucket = getDocumentsBucket();

  if (bucket) {
    try {
      await bucket.put(blobKey, await file.arrayBuffer(), {
        httpMetadata: { contentType: file.type || "application/octet-stream" },
      });
    } catch (error) {
      console.warn("R2 put failed; continuing with inline index", error);
    }
  }

  let chunkCount = 0;
  let indexed = false;

  if (user) {
    try {
      const result = await indexDocument({
        userId: user.id,
        fileName: file.name,
        blobKey: bucket ? blobKey : `inline:${blobKey}`,
        text,
      });
      chunkCount = result.chunkCount;
      indexed = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Indexing failed";
      console.error(error);
      // Still return extracted text so chat can use it immediately
      return Response.json({
        ok: true,
        fileName: file.name,
        blobKey,
        method: extracted.method,
        warning: extracted.warning ?? message,
        indexed: false,
        chunkCount: 0,
        text,
        excerpt: text.slice(0, 4000),
      });
    }
  }

  return Response.json({
    ok: true,
    fileName: file.name,
    blobKey,
    method: extracted.method,
    warning: extracted.warning,
    indexed,
    chunkCount,
    storedInR2: Boolean(bucket),
    text,
    excerpt: text.slice(0, 4000),
  });
}

export async function DELETE(request: Request) {
  const user = await getSessionUser(request);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let blobKey: string | null = null;
  try {
    const body = (await request.json()) as { blobKey?: string };
    blobKey = body.blobKey?.trim() || null;
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!blobKey) {
    return Response.json({ error: "blobKey is required" }, { status: 400 });
  }

  try {
    const result = await deleteDocument({ userId: user.id, blobKey });
    if (result.deletedCount === 0) {
      return Response.json({ error: "Document not found" }, { status: 404 });
    }

    const bucket = getDocumentsBucket();
    if (bucket?.delete && !blobKey.startsWith("inline:")) {
      try {
        await bucket.delete(blobKey);
      } catch (error) {
        console.warn("R2 delete failed; chunks already removed", error);
      }
    }

    return Response.json({ ok: true, deletedCount: result.deletedCount });
  } catch (error) {
    console.error(error);
    return Response.json(
      { error: "Database not configured or delete failed" },
      { status: 503 },
    );
  }
}
