import { createAuth } from "@chatbot/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import ChatPageClient from "./chat-page-client";

export default async function ChatPage({ params }: { params: Promise<{ chatId: string }> }) {
  const { chatId } = await params;

  const session = await createAuth().api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect("/login");
  }

  return <ChatPageClient chatId={chatId} />;
}
