"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowUpIcon, FileIcon, Loader2, PaperclipIcon, XIcon } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { toast } from "sonner";

import { Bubble, BubbleContent } from "@chatbot/ui/components/bubble";
import { Button } from "@chatbot/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbot/ui/components/dialog";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@chatbot/ui/components/input-group";
import { Message, MessageContent } from "@chatbot/ui/components/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@chatbot/ui/components/message-scroller";
import { cn } from "@chatbot/ui/lib/utils";

import { EscapeGamePanel } from "@/components/chat/escape-game-panel";
import { authClient } from "@/lib/auth-client";
import type { EscapeAction, PublicEscapeState } from "@/lib/escape-room/engine";
import { parseSlashCommand, getSlashHelpText } from "@/lib/escape-room/slash";
import { trpc } from "@/utils/trpc";

const Streamdown = dynamic(
  () => import("streamdown").then((mod) => ({ default: mod.Streamdown })),
  {
    loading: () => <span className="text-muted-foreground">…</span>,
    ssr: false,
  },
);

type ChatPanelProps = {
  chatId?: string;
  initialMessages?: UIMessage[];
  embedToken?: string;
};

type PendingFile = {
  id: string;
  file: File;
};

type IngestResponse = {
  ok?: boolean;
  error?: string;
  fileName?: string;
  excerpt?: string;
  text?: string;
  indexed?: boolean;
  chunkCount?: number;
  warning?: string;
  method?: string;
};

function MessageParts({
  message,
  isStreaming,
}: {
  message: UIMessage;
  isStreaming: boolean;
}) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <Bubble align="end" variant="default">
        <BubbleContent>
          {message.parts?.map((part, index) => {
            if (part.type === "text") {
              return (
                <span key={index} className="whitespace-pre-wrap">
                  {part.text}
                </span>
              );
            }
            return null;
          })}
        </BubbleContent>
      </Bubble>
    );
  }

  return (
    <MessageContent className="max-w-3xl text-sm leading-relaxed text-foreground">
      {message.parts?.map((part, index) => {
        if (part.type === "reasoning") {
          return (
            <p key={index} className="mb-2 text-xs leading-relaxed text-muted-foreground">
              {part.text}
            </p>
          );
        }
        if (part.type === "text") {
          return (
            <div
              key={index}
              className={cn(
                "prose prose-sm max-w-none dark:prose-invert",
                isStreaming && "streaming-caret",
              )}
            >
              <Streamdown isAnimating={isStreaming}>{part.text}</Streamdown>
            </div>
          );
        }
        return null;
      })}
    </MessageContent>
  );
}

async function ingestFile(file: File, embedToken?: string): Promise<IngestResponse> {
  const body = new FormData();
  body.append("file", file);
  const res = await fetch("/api/documents", {
    method: "POST",
    body,
    credentials: "include",
    headers: embedToken ? { Authorization: `Bearer ${embedToken}` } : undefined,
  });
  const data = (await res.json()) as IngestResponse;
  if (!res.ok && !data.excerpt && !data.text) {
    throw new Error(data.error ?? `Upload failed (${res.status})`);
  }
  return data;
}

function buildMessageWithAttachments(
  userText: string,
  ingested: Array<IngestResponse & { localName: string }>,
) {
  const blocks = ingested.map((item) => {
    const name = item.fileName ?? item.localName;
    const body = (item.excerpt ?? item.text ?? "").trim();
    const meta = [
      item.indexed ? `indexed:${item.chunkCount ?? 0} chunks` : "not-indexed",
      item.method ? `via:${item.method}` : null,
    ]
      .filter(Boolean)
      .join(", ");
    return [
      `--- ATTACHED FILE: ${name}${meta ? ` (${meta})` : ""} ---`,
      body.slice(0, 6000),
      `--- END FILE: ${name} ---`,
    ].join("\n");
  });

  const prompt = userText.trim() || "Please review the attached file(s).";
  return `${prompt}\n\n${blocks.join("\n\n")}`;
}

function titleFromPrompt(text: string) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return "New Chat";
  return cleaned.length > 48 ? `${cleaned.slice(0, 48)}…` : cleaned;
}

function localMessage(role: "user" | "assistant", text: string): UIMessage {
  return {
    id: crypto.randomUUID(),
    role,
    parts: [{ type: "text", text }],
  };
}

type EscapeApiResponse = {
  error?: string;
  message?: string;
  publicState?: PublicEscapeState | null;
  resumed?: boolean;
  active?: boolean;
};

async function escapeFetch(body: Record<string, unknown>): Promise<EscapeApiResponse> {
  const res = await fetch("/api/escape", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as EscapeApiResponse;
  if (!res.ok) {
    throw new Error(data.error ?? `Escape request failed (${res.status})`);
  }
  return data;
}

export function ChatPanel({ chatId, initialMessages, embedToken }: ChatPanelProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [escapeBusy, setEscapeBusy] = useState(false);
  const [escapeState, setEscapeState] = useState<PublicEscapeState | null>(null);
  const [restartOpen, setRestartOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const chatIdRef = useRef<string | undefined>(chatId);
  const createdThisSession = useRef(false);

  useEffect(() => {
    chatIdRef.current = chatId;
  }, [chatId]);

  const createChat = useMutation(
    trpc.chat.create.mutationOptions({
      onError: (error) => {
        toast.error(error.message || "Could not create chat");
      },
    }),
  );

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/ai",
        credentials: "include",
        headers: embedToken ? { Authorization: `Bearer ${embedToken}` } : undefined,
        prepareSendMessagesRequest: ({ messages, body, id, trigger, messageId }) => ({
          body: {
            ...body,
            id,
            messages,
            trigger,
            messageId,
            ...(chatIdRef.current ? { chatId: chatIdRef.current } : {}),
          },
        }),
      }),
    [embedToken],
  );

  const { messages, sendMessage, setMessages, status } = useChat({
    id: chatId,
    messages: initialMessages,
    transport,
  });

  useEffect(() => {
    if (!createdThisSession.current) return;
    if (!chatIdRef.current) return;
    if (chatId) return;
    if (status === "submitted" || status === "streaming" || uploading || escapeBusy) return;
    if (messages.length === 0) return;
    router.replace(`/ai/${chatIdRef.current}`);
  }, [status, uploading, escapeBusy, messages.length, chatId, router]);

  // Restore escape mode after refresh
  useEffect(() => {
    if (!chatId || !session?.user) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/escape?chatId=${encodeURIComponent(chatId)}`, {
          credentials: "include",
        });
        if (!res.ok) return;
        const data = (await res.json()) as EscapeApiResponse;
        if (!cancelled && data.active && data.publicState) {
          setEscapeState(data.publicState);
        }
      } catch {
        // ignore restore errors
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chatId, session?.user]);

  const isEscapeMode = Boolean(escapeState && escapeState.status === "playing");
  const showEscapePanel = Boolean(
    escapeState &&
      (escapeState.status === "playing" ||
        escapeState.status === "won" ||
        escapeState.status === "lost"),
  );

  const isSending =
    status === "submitted" || status === "streaming" || uploading || escapeBusy;
  const isEmpty = messages.length === 0 && !isSending;

  const ensureChat = async (prompt: string) => {
    if (chatIdRef.current) return chatIdRef.current;
    if (!session?.user) return undefined;

    const chat = await createChat.mutateAsync({ title: titleFromPrompt(prompt) });
    if (!chat?.id) {
      throw new Error("Could not create chat");
    }

    chatIdRef.current = chat.id;
    createdThisSession.current = true;
    await queryClient.invalidateQueries(trpc.chat.list.queryFilter());
    return chat.id;
  };

  const appendLocal = useCallback(
    (userText: string | null, assistantText: string) => {
      setMessages((prev) => {
        const next = [...prev];
        if (userText) next.push(localMessage("user", userText));
        next.push(localMessage("assistant", assistantText));
        return next;
      });
    },
    [setMessages],
  );

  const runEscapeStart = async () => {
    if (!session?.user) {
      toast.error("Sign in to play The Last Terminal");
      return;
    }
    setEscapeBusy(true);
    try {
      const id = await ensureChat("The Last Terminal");
      if (!id) throw new Error("Could not create chat");
      const data = await escapeFetch({ op: "start", chatId: id });
      if (data.publicState) setEscapeState(data.publicState);
      // Server already persisted messages; sync local UI (avoid duplicate if resumed spam)
      appendLocal("/escape", data.message ?? "Escape protocol online.");
      if (!chatId) router.replace(`/ai/${id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start escape room");
    } finally {
      setEscapeBusy(false);
    }
  };

  const runEscapeExit = async () => {
    const id = chatIdRef.current;
    if (!id) return;
    setEscapeBusy(true);
    try {
      const data = await escapeFetch({ op: "exit", chatId: id });
      setEscapeState(null);
      appendLocal("/exit", data.message ?? "Escape protocol paused.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not exit game");
    } finally {
      setEscapeBusy(false);
    }
  };

  const runEscapeRestart = async () => {
    const id = chatIdRef.current;
    if (!id) {
      await runEscapeStart();
      return;
    }
    setEscapeBusy(true);
    try {
      const data = await escapeFetch({ op: "restart", chatId: id });
      if (data.publicState) setEscapeState(data.publicState);
      appendLocal("/escape restart", data.message ?? "New run started.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not restart");
    } finally {
      setEscapeBusy(false);
    }
  };

  const runEscapeAct = async (text: string) => {
    const id = chatIdRef.current;
    if (!id) throw new Error("No chat");
    setEscapeBusy(true);
    try {
      const data = await escapeFetch({ op: "act", chatId: id, text });
      if (data.publicState) setEscapeState(data.publicState);
      appendLocal(text, data.message ?? "…");
    } finally {
      setEscapeBusy(false);
    }
  };

  const runEscapeAction = async (action: EscapeAction, label: string) => {
    const id = chatIdRef.current;
    if (!id) return;
    setEscapeBusy(true);
    try {
      const data = await escapeFetch({ op: "action", chatId: id, action, label });
      if (data.publicState) setEscapeState(data.publicState);
      appendLocal(label, data.message ?? "…");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed");
    } finally {
      setEscapeBusy(false);
    }
  };

  const addFiles = (list: FileList | null) => {
    if (!list?.length) return;
    const next = Array.from(list).map((file) => ({
      id: crypto.randomUUID(),
      file,
    }));
    setPending((prev) => [...prev, ...next]);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const text = input.trim();
    if ((!text && pending.length === 0) || isSending) return;

    // Slash commands — never send to the normal model
    const slash = text ? parseSlashCommand(text) : null;
    if (slash) {
      setInput("");
      setPending([]);
      if (slash.type === "help") {
        appendLocal("/help", getSlashHelpText());
        return;
      }
      if (slash.type === "escape") {
        await runEscapeStart();
        return;
      }
      if (slash.type === "escape_restart") {
        setRestartOpen(true);
        return;
      }
      if (slash.type === "exit") {
        await runEscapeExit();
        return;
      }
    }

    // Escape-room mode: interpret as game action
    if (isEscapeMode) {
      if (!text) return;
      setInput("");
      setPending([]);
      try {
        await runEscapeAct(text);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Game action failed");
      }
      return;
    }

    setUploading(true);
    try {
      const ingested: Array<IngestResponse & { localName: string }> = [];
      for (const item of pending) {
        try {
          const result = await ingestFile(item.file, embedToken);
          ingested.push({ ...result, localName: item.file.name });
          if (result.warning) toast.message(`${item.file.name}: ${result.warning}`);
          if (result.indexed) {
            toast.success(`${item.file.name} → ${result.chunkCount ?? 0} chunks`);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "Upload failed";
          toast.error(`${item.file.name}: ${message}`);
        }
      }

      const messageText =
        ingested.length > 0 ? buildMessageWithAttachments(text, ingested) : text;

      if (!messageText.trim()) return;

      try {
        await ensureChat(text || ingested[0]?.fileName || "New Chat");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not save chat";
        toast.error(message);
        return;
      }

      sendMessage({ text: messageText });
      setInput("");
      setPending([]);
    } finally {
      setUploading(false);
    }
  };

  const handlePromptKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      e.currentTarget.form?.requestSubmit();
    }
  };

  return (
    <MessageScrollerProvider>
      <div className="flex h-full min-h-0 w-full flex-col md:flex-row">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {showEscapePanel && escapeState ? (
            <div className="md:hidden">
              <EscapeGamePanel
                state={escapeState}
                busy={escapeBusy}
                onHint={() =>
                  void runEscapeAction({ type: "request_hint" }, "Get hint")
                }
                onExit={() => void runEscapeExit()}
                onSubmitCode={(code) =>
                  void runEscapeAction({ type: "submit_code", code }, "Enter code")
                }
                onPlayAgain={() => setRestartOpen(true)}
                onReturnToChat={() => void runEscapeExit()}
              />
            </div>
          ) : null}

          <main className="min-h-0 flex-1">
            {isEmpty && !showEscapePanel ? (
              <div className="flex h-full flex-col items-center justify-center px-4 pb-4">
                <h1 className="-skew-x-12 transform font-mono text-4xl font-bold tracking-widest text-white italic sm:text-5xl">
                  RANDO
                </h1>
                <div className="mt-4 flex w-48 items-center gap-2 opacity-50">
                  <div className="h-px flex-1 bg-white" />
                  <span className="font-mono text-[10px] text-white">∞</span>
                  <div className="h-px flex-1 bg-white" />
                </div>
                <p className="mt-3 font-mono text-xs tracking-wider text-white/50">
                  ASK ANYTHING. ATTACH FILES. /ESCAPE
                </p>
              </div>
            ) : (
              <MessageScroller>
                <MessageScrollerViewport>
                  <MessageScrollerContent
                    aria-busy={isSending}
                    className="mx-auto w-full max-w-3xl px-4 py-6"
                  >
                    {messages.map((message) => {
                      const isUser = message.role === "user";
                      const isStreaming =
                        status === "streaming" &&
                        message.role === "assistant" &&
                        message.id === messages.at(-1)?.id;

                      return (
                        <MessageScrollerItem
                          key={message.id}
                          scrollAnchor={isUser}
                          className="animate-message-in"
                        >
                          <Message align={isUser ? "end" : "start"}>
                            <MessageParts message={message} isStreaming={!!isStreaming} />
                          </Message>
                        </MessageScrollerItem>
                      );
                    })}
                    {(status === "submitted" || uploading || escapeBusy) && (
                      <MessageScrollerItem className="animate-message-in">
                        <Message align="start">
                          <MessageContent className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="size-3.5 animate-spin" />
                            <span>
                              {uploading
                                ? "Ingesting files…"
                                : escapeBusy
                                  ? "A.R.I.A. processing…"
                                  : "Thinking…"}
                            </span>
                          </MessageContent>
                        </Message>
                      </MessageScrollerItem>
                    )}
                    <MessageScrollerItem scrollAnchor />
                  </MessageScrollerContent>
                </MessageScrollerViewport>
                <MessageScrollerButton />
              </MessageScroller>
            )}
          </main>

          {isEscapeMode && escapeState && escapeState.suggestedActions.length > 0 ? (
            <div className="flex flex-wrap gap-2 border-t border-white/10 px-4 py-2">
              {escapeState.suggestedActions.map((item) => (
                <Button
                  key={item.label}
                  type="button"
                  variant="outline"
                  size="xs"
                  className="font-mono text-[9px] tracking-wide"
                  disabled={escapeBusy}
                  onClick={() => void runEscapeAction(item.action, item.label)}
                >
                  {item.label}
                </Button>
              ))}
            </div>
          ) : null}

          <footer className="shrink-0 px-4 py-3">
            <div className="mx-auto w-full max-w-3xl">
              {pending.length > 0 && !isEscapeMode ? (
                <ul className="mb-2 flex flex-wrap gap-2">
                  {pending.map((item) => (
                    <li
                      key={item.id}
                      className="flex max-w-full items-center gap-2 border border-white/20 bg-black/60 px-2 py-1 font-mono text-[10px] tracking-wide text-white/80"
                    >
                      <FileIcon className="size-3 shrink-0 opacity-60" />
                      <span className="truncate">{item.file.name}</span>
                      <button
                        type="button"
                        className="shrink-0 text-white/50 hover:text-white"
                        aria-label={`Remove ${item.file.name}`}
                        onClick={() =>
                          setPending((prev) => prev.filter((p) => p.id !== item.id))
                        }
                      >
                        <XIcon className="size-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}

              <form
                onSubmit={(e) => void handleSubmit(e)}
                onDragOver={(e) => {
                  e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (!isEscapeMode) addFiles(e.dataTransfer.files);
                }}
              >
                <InputGroup>
                  <InputGroupTextarea
                    name="prompt"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handlePromptKeyDown}
                    placeholder={
                      isEscapeMode
                        ? "WHAT DO YOU DO? (or /exit)"
                        : "MESSAGE RANDO… (/escape · /help)"
                    }
                    className="max-h-32 min-h-14"
                    rows={1}
                    autoComplete="off"
                    autoFocus
                    disabled={isSending}
                  />
                  <InputGroupAddon align="block-end" className="pt-1">
                    {!isEscapeMode ? (
                      <>
                        <input
                          ref={fileRef}
                          type="file"
                          className="sr-only"
                          multiple
                          onChange={(e) => {
                            addFiles(e.target.files);
                            e.target.value = "";
                          }}
                        />
                        <InputGroupButton
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          disabled={isSending}
                          aria-label="Attach files"
                          onClick={() => fileRef.current?.click()}
                        >
                          <PaperclipIcon />
                        </InputGroupButton>
                      </>
                    ) : null}
                    <InputGroupButton
                      type="submit"
                      variant="default"
                      size="icon-sm"
                      disabled={isSending || (!input.trim() && pending.length === 0)}
                      className="ml-auto"
                    >
                      {isSending ? <Loader2 className="animate-spin" /> : <ArrowUpIcon />}
                      <span className="sr-only">Send</span>
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
              </form>
              <p className="mt-2 font-mono text-[9px] tracking-wider text-white/35">
                {isEscapeMode
                  ? "THE LAST TERMINAL · type actions · /exit to pause"
                  : "PDF · DOCX · TXT · /escape for The Last Terminal"}
              </p>
            </div>
          </footer>
        </div>

        {showEscapePanel && escapeState ? (
          <div className="hidden md:flex md:h-full">
            <EscapeGamePanel
              state={escapeState}
              busy={escapeBusy}
              onHint={() => void runEscapeAction({ type: "request_hint" }, "Get hint")}
              onExit={() => void runEscapeExit()}
              onSubmitCode={(code) =>
                void runEscapeAction({ type: "submit_code", code }, "Enter code")
              }
              onPlayAgain={() => setRestartOpen(true)}
              onReturnToChat={() => void runEscapeExit()}
            />
          </div>
        ) : null}
      </div>

      <Dialog open={restartOpen} onOpenChange={setRestartOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>RESTART ESCAPE?</DialogTitle>
            <DialogDescription>
              This abandons your current run and starts The Locked Laboratory from scratch.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              className="font-mono text-xs"
              onClick={() => setRestartOpen(false)}
            >
              CANCEL
            </Button>
            <Button
              type="button"
              className="font-mono text-xs"
              disabled={escapeBusy}
              onClick={() => {
                setRestartOpen(false);
                void runEscapeRestart();
              }}
            >
              ABANDON & RESTART
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MessageScrollerProvider>
  );
}

export default ChatPanel;
