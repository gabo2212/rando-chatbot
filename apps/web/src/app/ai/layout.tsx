import ChatSidebar from "@/components/chat/chat-sidebar";

export default function AiLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-black md:flex-row">
      <ChatSidebar />
      <div className="relative min-h-0 min-w-0 flex-1">
        <div className="pointer-events-none absolute top-0 left-0 z-10 hidden h-8 w-8 border-t border-l border-white/20 md:block" />
        <div className="pointer-events-none absolute top-0 right-0 z-10 hidden h-8 w-8 border-t border-r border-white/20 md:block" />
        {children}
      </div>
    </div>
  );
}
