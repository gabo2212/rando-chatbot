"use client";

import { DiscordConnectionCard } from "@/components/discord/discord-connection-card";
import { authClient } from "@/lib/auth-client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { toast } from "sonner";

function DiscordFlash() {
  const params = useSearchParams();
  useEffect(() => {
    const flag = params.get("discord");
    if (!flag) return;
    if (flag === "connected") toast.success("Discord account connected");
    else if (flag === "denied") toast.error("Discord authorization was denied");
    else if (flag === "invalid_state") toast.error("Discord OAuth state mismatch — try again");
    else if (flag === "error")
      toast.error(
        "Discord connection failed (invalid_client). Reset Client Secret in Discord portal, update .env, disable Public Client, restart dev server, try again.",
      );
  }, [params]);
  return null;
}

export default function SettingsPage() {
  const { data: session, isPending } = authClient.useSession();

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 lg:px-8">
      <Suspense fallback={null}>
        <DiscordFlash />
      </Suspense>
      <div>
        <h1 className="font-mono text-xl font-bold tracking-wide">Settings</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Connections and integrations for your RANDO account.
        </p>
      </div>

      {isPending ? (
        <p className="text-sm opacity-60">Loading…</p>
      ) : !session ? (
        <p className="text-sm">
          <Link href="/login" className="underline">
            Sign in
          </Link>{" "}
          to manage Discord and other connections.
        </p>
      ) : (
        <DiscordConnectionCard />
      )}
    </div>
  );
}
