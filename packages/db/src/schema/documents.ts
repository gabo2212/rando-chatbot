import { index, pgTable, text, timestamp, vector } from "drizzle-orm/pg-core";

import { user } from "./auth";

/** nomic-embed-text via Ollama produces 768-dimensional vectors */
export const EMBEDDING_DIMENSIONS = 768;

export const documentChunk = pgTable(
  "document_chunk",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    fileName: text("file_name").notNull(),
    blobKey: text("blob_key").notNull(),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("document_chunk_embedding_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops"),
    ),
    index("document_chunk_user_id_idx").on(table.userId),
  ],
);
