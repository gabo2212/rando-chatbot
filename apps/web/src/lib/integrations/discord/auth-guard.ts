import { createAuth } from "@chatbot/auth";

export async function requireSessionUser(request: Request) {
  const session = await createAuth().api.getSession({ headers: request.headers });
  if (!session?.user) return null;
  return session.user;
}
