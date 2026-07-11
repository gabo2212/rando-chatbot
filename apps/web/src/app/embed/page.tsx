"use client";

import { useEffect, useState } from "react";

import { ChatPanel } from "@/components/chat/chat-panel";

export default function EmbedPage() {
  const [token, setToken] = useState<string | undefined>(undefined);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: string; token?: string } | null;
      if (data?.type === "auth-token" && typeof data.token === "string") {
        setToken(data.token);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <div className="flex h-svh min-h-0 flex-col bg-background">
      <ChatPanel embedToken={token} />
    </div>
  );
}
