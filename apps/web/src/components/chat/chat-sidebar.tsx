"use client";

import { Button } from "@chatbot/ui/components/button";
import { cn } from "@chatbot/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileTextIcon, MenuIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import UserMenu from "@/components/user-menu";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const client = useQueryClient();
  const { data: session } = authClient.useSession();

  const chatsQuery = useQuery({
    ...trpc.chat.list.queryOptions(),
    enabled: !!session,
  });

  const createChat = useMutation(
    trpc.chat.create.mutationOptions({
      onSuccess: (chat) => {
        if (!chat) return;
        void client.invalidateQueries(trpc.chat.list.queryFilter());
        onNavigate?.();
        router.push(`/ai/${chat.id}`);
      },
      onError: (error) => {
        toast.error(error.message || "Could not create chat");
      },
    }),
  );

  const deleteChat = useMutation(
    trpc.chat.delete.mutationOptions({
      onSuccess: (_data, variables) => {
        void client.invalidateQueries(trpc.chat.list.queryFilter());
        if (pathname === `/ai/${variables.id}`) {
          router.push("/ai");
        }
      },
      onError: (error) => {
        toast.error(error.message || "Could not delete chat");
      },
    }),
  );

  const activeChatId = pathname.startsWith("/ai/") ? pathname.split("/ai/")[1] : undefined;

  return (
    <>
      <div className="flex items-center justify-between gap-2 border-b border-sidebar-border px-3 py-3">
        <Link
          href="/"
          onClick={onNavigate}
          className="-skew-x-12 transform font-mono text-lg font-bold tracking-widest text-white italic"
        >
          RANDO
        </Link>
        {session ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="New chat"
            disabled={createChat.isPending}
            onClick={() => createChat.mutate({})}
          >
            <PlusIcon className="size-4" />
          </Button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {!session ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">
            <Link href="/login" className="text-primary hover:underline">
              Sign in
            </Link>{" "}
            to save chat history.
          </p>
        ) : chatsQuery.isLoading ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">Loading chats…</p>
        ) : chatsQuery.data?.length ? (
          <ul className="flex flex-col gap-0.5">
            {chatsQuery.data.map((chat) => {
              const isActive = activeChatId === chat.id;
              return (
                <li key={chat.id} className="group relative">
                  <Link
                    href={`/ai/${chat.id}`}
                    onClick={onNavigate}
                    className={cn(
                      "block truncate border border-transparent px-2.5 py-2 pr-8 font-mono text-xs tracking-wide transition-colors",
                      isActive
                        ? "border-white/20 bg-white/10 text-white"
                        : "text-white/60 hover:border-white/10 hover:bg-white/5 hover:text-white",
                    )}
                  >
                    {chat.title || "NEW.CHAT"}
                  </Link>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Delete chat"
                    className="absolute top-1/2 right-1 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100"
                    disabled={deleteChat.isPending}
                    onClick={(e) => {
                      e.preventDefault();
                      deleteChat.mutate({ id: chat.id });
                    }}
                  >
                    <Trash2Icon className="size-3.5 text-muted-foreground" />
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-2 py-3 text-xs text-muted-foreground">No chats yet.</p>
        )}
      </div>

      <div className="mt-auto border-t border-sidebar-border p-2">
        <Link
          href="/documents"
          onClick={onNavigate}
          className="mb-2 flex items-center gap-2 border border-transparent px-2.5 py-2 font-mono text-[10px] tracking-wider text-white/60 transition-colors hover:border-white/20 hover:bg-white/5 hover:text-white"
        >
          <FileTextIcon className="size-3.5 shrink-0" />
          DOCUMENTS
        </Link>
        <UserMenu />
      </div>
    </>
  );
}

export default function ChatSidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <div className="flex shrink-0 items-center border-b border-border px-3 py-2 md:hidden">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={mobileOpen ? "Close sidebar" : "Open sidebar"}
          onClick={() => setMobileOpen((open) => !open)}
        >
          {mobileOpen ? <XIcon className="size-4" /> : <MenuIcon className="size-4" />}
        </Button>
        <span className="ml-2 -skew-x-12 transform font-mono text-sm font-bold tracking-widest text-white italic">
          RANDO
        </span>
      </div>

      {mobileOpen ? (
        <button
          type="button"
          aria-label="Close sidebar"
          className="fixed inset-0 z-40 bg-foreground/10 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <aside
        className={cn(
          "z-50 flex w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground",
          "fixed inset-y-0 left-0 transition-transform duration-200 md:static md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
          "top-12 md:top-0",
        )}
      >
        <SidebarContent onNavigate={() => setMobileOpen(false)} />
      </aside>
    </>
  );
}
