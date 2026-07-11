"use client";

import type { UIMessage } from "ai";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import ChatPanel from "@/components/chat/chat-panel";
import { trpc } from "@/utils/trpc";

export default function ChatPageClient({ chatId }: { chatId: string }) {
  const chatQuery = useQuery(trpc.chat.get.queryOptions({ id: chatId }));

  if (chatQuery.isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  if (chatQuery.isError || !chatQuery.data) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-sm text-muted-foreground">
        Chat not found.
      </div>
    );
  }

  const initialMessages: UIMessage[] = chatQuery.data.messages.map((msg) => ({
    id: msg.id,
    role: msg.role as UIMessage["role"],
    parts: (msg.parts ?? []) as UIMessage["parts"],
  }));

  return <ChatPanel chatId={chatId} initialMessages={initialMessages} />;
}
