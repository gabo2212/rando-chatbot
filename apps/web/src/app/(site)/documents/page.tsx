"use client";

import { Loader2, UploadIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@chatbot/ui/components/button";
import { authClient } from "@/lib/auth-client";

type DocRow = { fileName: string; blobKey: string };

export default function DocumentsPage() {
  const { data: session, isPending } = authClient.useSession();
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/documents", { credentials: "include" });
      if (!res.ok) {
        setDocs([]);
        return;
      }
      const data = (await res.json()) as { documents: DocRow[] };
      setDocs(data.documents ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session?.user) {
      void refresh();
    } else if (!isPending) {
      setLoading(false);
    }
  }, [session?.user, isPending, refresh]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/documents", {
        method: "POST",
        body,
        credentials: "include",
      });
      const data = (await res.json()) as { error?: string; chunkCount?: number };
      if (!res.ok) {
        toast.error(data.error ?? "Upload failed");
        return;
      }
      toast.success(`Indexed ${data.chunkCount ?? 0} chunks from ${file.name}`);
      await refresh();
    } finally {
      setUploading(false);
    }
  };

  const onDelete = async (doc: DocRow) => {
    setDeletingKey(doc.blobKey);
    try {
      const res = await fetch("/api/documents", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blobKey: doc.blobKey }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Delete failed");
        return;
      }
      toast.success(`Removed ${doc.fileName}`);
      setDocs((prev) => prev.filter((d) => d.blobKey !== doc.blobKey));
    } finally {
      setDeletingKey(null);
    }
  };

  if (isPending) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="mx-auto flex max-w-lg flex-col px-4 py-16">
        <h1 className="font-mono text-2xl font-bold tracking-widest text-white">DOCUMENTS</h1>
        <div className="mt-3 flex items-center gap-2 opacity-50">
          <div className="h-px w-8 bg-white" />
          <span className="font-mono text-[10px] text-white">∞</span>
          <div className="h-px flex-1 bg-white" />
        </div>
        <p className="mt-4 font-mono text-xs tracking-wide text-white/50">
          Sign in to upload files for retrieval-augmented answers.
        </p>
        <Button className="mt-6 w-fit font-mono text-xs tracking-wider" render={<a href="/login" />}>
          SIGN IN
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col px-4 py-12">
      <h1 className="font-mono text-2xl font-bold tracking-widest text-white">DOCUMENTS</h1>
      <div className="mt-3 flex items-center gap-2 opacity-50">
        <div className="h-px w-8 bg-white" />
        <span className="font-mono text-[10px] text-white">∞</span>
        <div className="h-px flex-1 bg-white" />
        <span className="font-mono text-[9px] text-white">KNOWLEDGE.INDEX</span>
      </div>
      <p className="mt-4 max-w-md font-mono text-xs leading-relaxed tracking-wide text-white/50">
        Upload text files. RANDO embeds them locally with Ollama and can search them during chat.
      </p>

      <label className="mt-10 flex cursor-pointer flex-col items-start gap-3 border border-dashed border-white/30 bg-black/40 px-5 py-8 transition-colors hover:border-white/60">
        <div className="flex items-center gap-2 font-mono text-xs font-medium tracking-wider text-white">
          {uploading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <UploadIcon className="size-4" />
          )}
          {uploading ? "INDEXING…" : "CHOOSE A FILE"}
        </div>
        <p className="font-mono text-[10px] text-white/40">.txt, .md, and other text formats</p>
        <input
          type="file"
          className="sr-only"
          accept="*/*"
          disabled={uploading}
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
      </label>

      <div className="mt-10">
        <h2 className="font-mono text-[10px] font-medium tracking-[0.14em] text-white/40">
          INDEXED
        </h2>
        {loading ? (
          <p className="mt-4 font-mono text-xs text-white/40">Loading…</p>
        ) : docs.length === 0 ? (
          <p className="mt-4 font-mono text-xs text-white/40">No documents yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-white/10 border-t border-white/20">
            {docs.map((doc) => {
              const busy = deletingKey === doc.blobKey;
              return (
                <li
                  key={doc.blobKey}
                  className="flex items-center justify-between gap-3 py-3 font-mono text-xs"
                >
                  <span className="truncate tracking-wide text-white">{doc.fileName}</span>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-[10px] text-white/40">READY</span>
                    <button
                      type="button"
                      disabled={busy || uploading}
                      onClick={() => void onDelete(doc)}
                      className="text-[10px] tracking-wider text-white/40 transition-colors hover:text-white disabled:opacity-40"
                    >
                      {busy ? "…" : "[ DELETE ]"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
