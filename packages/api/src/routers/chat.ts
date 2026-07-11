import { chat, message } from "@chatbot/db";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";

import type { Context } from "../context";
import { protectedProcedure, router } from "../index";

function requireDb(ctx: Context) {
  if (!ctx.db) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database not configured",
    });
  }
  return ctx.db;
}

async function getOwnedChat(
  db: NonNullable<Context["db"]>,
  userId: string,
  chatId: string,
) {
  const [row] = await db
    .select()
    .from(chat)
    .where(and(eq(chat.id, chatId), eq(chat.userId, userId)));

  if (!row) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Chat not found",
    });
  }

  return row;
}

export const chatRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = requireDb(ctx);

    return db
      .select()
      .from(chat)
      .where(eq(chat.userId, ctx.session.user.id))
      .orderBy(desc(chat.updatedAt));
  }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = requireDb(ctx);
      const ownedChat = await getOwnedChat(db, ctx.session.user.id, input.id);
      const messages = await db
        .select()
        .from(message)
        .where(eq(message.chatId, input.id))
        .orderBy(asc(message.createdAt));

      return {
        ...ownedChat,
        messages,
      };
    }),

  create: protectedProcedure
    .input(z.object({ title: z.string().optional() }).optional())
    .mutation(async ({ ctx, input }) => {
      const db = requireDb(ctx);
      const id = crypto.randomUUID();
      const [newChat] = await db
        .insert(chat)
        .values({
          id,
          userId: ctx.session.user.id,
          ...(input?.title !== undefined ? { title: input.title } : {}),
        })
        .returning();

      return newChat;
    }),

  rename: protectedProcedure
    .input(z.object({ id: z.string(), title: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = requireDb(ctx);
      await getOwnedChat(db, ctx.session.user.id, input.id);

      const [updated] = await db
        .update(chat)
        .set({
          title: input.title,
          updatedAt: new Date(),
        })
        .where(
          and(eq(chat.id, input.id), eq(chat.userId, ctx.session.user.id)),
        )
        .returning();

      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = requireDb(ctx);
      await getOwnedChat(db, ctx.session.user.id, input.id);

      await db
        .delete(chat)
        .where(
          and(eq(chat.id, input.id), eq(chat.userId, ctx.session.user.id)),
        );

      return { success: true };
    }),
});
