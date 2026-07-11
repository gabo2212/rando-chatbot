import { protectedProcedure, publicProcedure, router } from "../index";
import { chatRouter } from "./chat";

export const appRouter = router({
  healthCheck: publicProcedure.query(() => {
    return "OK";
  }),
  privateData: protectedProcedure.query(({ ctx }) => {
    return {
      message: "This is private",
      user: ctx.session.user,
    };
  }),
  chat: chatRouter,
});
export type AppRouter = typeof appRouter;
