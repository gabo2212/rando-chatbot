import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { documentChunk, EMBEDDING_DIMENSIONS } from "@chatbot/db";
import { env } from "@chatbot/env/server";
import { embed, embedMany } from "ai";
import { and, eq, sql } from "drizzle-orm";

import { db } from "./db";

const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 120;

const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434/v1";
const DEFAULT_OLLAMA_EMBED_MODEL = "nomic-embed-text";

function getOllamaConfig() {
  const baseURL =
    (env.OLLAMA_BASE_URL as string | undefined) ??
    process.env.OLLAMA_BASE_URL ??
    DEFAULT_OLLAMA_BASE_URL;
  const modelId =
    (env.OLLAMA_EMBED_MODEL as string | undefined) ??
    process.env.OLLAMA_EMBED_MODEL ??
    DEFAULT_OLLAMA_EMBED_MODEL;
  return { baseURL, modelId };
}

function getOllamaEmbeddingModel() {
  const { baseURL, modelId } = getOllamaConfig();
  // Ollama exposes an OpenAI-compatible /v1 API; no API key required locally.
  const ollama = createOpenAICompatible({
    name: "ollama",
    apiKey: "ollama",
    baseURL,
  });
  return ollama.textEmbeddingModel(modelId);
}

export function chunkText(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const chunks: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    const end = Math.min(start + CHUNK_SIZE, normalized.length);
    chunks.push(normalized.slice(start, end));
    if (end === normalized.length) break;
    start = Math.max(0, end - CHUNK_OVERLAP);
  }
  return chunks;
}

export async function indexDocument(params: {
  userId: string;
  fileName: string;
  blobKey: string;
  text: string;
}) {
  let model;
  try {
    model = getOllamaEmbeddingModel();
  } catch {
    throw new Error("Ollama embeddings are not available");
  }

  const chunks = chunkText(params.text);
  if (chunks.length === 0) {
    return { chunkCount: 0 };
  }

  let embeddings: number[][];
  try {
    const result = await embedMany({
      model,
      values: chunks,
    });
    embeddings = result.embeddings;
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    throw new Error(
      `Ollama embedding failed (${getOllamaConfig().modelId}). Is Ollama running and was the model pulled? ${message}`,
    );
  }

  const database = db();
  let written = 0;
  for (let i = 0; i < chunks.length; i++) {
    const embedding = embeddings[i];
    if (!embedding || embedding.length !== EMBEDDING_DIMENSIONS) {
      console.warn(
        `Skipping chunk ${i}: expected ${EMBEDDING_DIMENSIONS} dims, got ${embedding?.length ?? 0}`,
      );
      continue;
    }
    const id = crypto.randomUUID();
    const vectorStr = `[${embedding.join(",")}]`;
    await database.execute(sql`
      INSERT INTO document_chunk (id, user_id, file_name, blob_key, content, embedding, created_at)
      VALUES (
        ${id},
        ${params.userId},
        ${params.fileName},
        ${params.blobKey},
        ${chunks[i]},
        ${sql.raw(`'${vectorStr}'::vector`)},
        NOW()
      )
    `);
    written += 1;
  }

  return { chunkCount: written };
}

export async function searchDocuments(params: {
  userId: string;
  query: string;
  limit?: number;
}) {
  let model;
  try {
    model = getOllamaEmbeddingModel();
  } catch {
    return { results: [], note: "Ollama embeddings are not available" as const };
  }

  let embedding: number[];
  try {
    const result = await embed({
      model,
      value: params.query,
    });
    embedding = result.embedding;
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return {
      results: [],
      note: `Ollama embedding failed. Pull nomic-embed-text and ensure Ollama is up. ${message}` as const,
    };
  }

  if (embedding.length !== EMBEDDING_DIMENSIONS) {
    return {
      results: [],
      note: `Unexpected embedding size ${embedding.length}; expected ${EMBEDDING_DIMENSIONS}` as const,
    };
  }

  const vectorStr = `[${embedding.join(",")}]`;
  const limit = params.limit ?? 5;
  const database = db();

  const result = await database.execute(sql`
    SELECT
      id,
      file_name AS "fileName",
      content,
      (1 - (embedding <=> ${sql.raw(`'${vectorStr}'::vector`)}))::float AS similarity
    FROM document_chunk
    WHERE user_id = ${params.userId}
      AND embedding IS NOT NULL
      AND 1 - (embedding <=> ${sql.raw(`'${vectorStr}'::vector`)}) > 0.3
    ORDER BY embedding <=> ${sql.raw(`'${vectorStr}'::vector`)}
    LIMIT ${limit}
  `);

  const rawRows = Array.isArray(result)
    ? result
    : ((result as { rows?: unknown[] }).rows ?? []);

  const results = (
    rawRows as Array<{
      id: string;
      fileName: string;
      content: string;
      similarity: number;
    }>
  ).map((row) => ({
    id: row.id,
    fileName: row.fileName,
    content: row.content,
    similarity: row.similarity,
  }));

  return { results };
}

export async function listUserDocuments(userId: string) {
  const database = db();
  const rows = await database
    .selectDistinct({
      fileName: documentChunk.fileName,
      blobKey: documentChunk.blobKey,
    })
    .from(documentChunk)
    .where(eq(documentChunk.userId, userId));

  return rows;
}

export async function deleteDocument(params: {
  userId: string;
  blobKey: string;
}) {
  const database = db();
  const deleted = await database
    .delete(documentChunk)
    .where(
      and(
        eq(documentChunk.userId, params.userId),
        eq(documentChunk.blobKey, params.blobKey),
      ),
    )
    .returning({ id: documentChunk.id });

  return { deletedCount: deleted.length };
}
