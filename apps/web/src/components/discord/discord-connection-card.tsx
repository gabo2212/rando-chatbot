"use client";

import { Button } from "@chatbot/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@chatbot/ui/components/card";
import { Checkbox } from "@chatbot/ui/components/checkbox";
import { Label } from "@chatbot/ui/components/label";
import { Skeleton } from "@chatbot/ui/components/skeleton";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

type DiscordStatus = {
  configured: boolean;
  missingEnv: string[];
  connected: boolean;
  discordUser: { id: string; username: string; avatar: string | null } | null;
  guilds: Array<{
    id: string;
    name: string;
    icon: string | null;
    botInstalled: boolean;
    selectedChannelId: string | null;
    enabledCapabilities: {
      sendMessages?: boolean;
      imageBatches?: boolean;
      channelCreate?: boolean;
      channelDelete?: boolean;
      voice?: boolean;
    };
  }>;
};

type GuildRow = {
  id: string;
  name: string;
  icon: string | null;
  botInstalled: boolean;
  canManage: boolean;
  selectedChannelId: string | null;
  enabledCapabilities: DiscordStatus["guilds"][number]["enabledCapabilities"];
};

type ChannelRow = { id: string; name: string; type: string };

export function DiscordConnectionCard() {
  const [status, setStatus] = useState<DiscordStatus | null>(null);
  const [guilds, setGuilds] = useState<GuildRow[]>([]);
  const [selectedGuildId, setSelectedGuildId] = useState<string>("");
  const [channels, setChannels] = useState<ChannelRow[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<{
    confirmationId: string;
    preview: Record<string, unknown>;
  } | null>(null);
  const [caps, setCaps] = useState({
    sendMessages: true,
    imageBatches: true,
    channelCreate: false,
    channelDelete: false,
    voice: false,
  });

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/integrations/discord/status", { cache: "no-store" });
      if (res.status === 401) {
        setStatus(null);
        return;
      }
      const data = (await res.json()) as DiscordStatus;
      setStatus(data);
      if (data.connected) {
        const gRes = await fetch("/api/integrations/discord/guilds", { cache: "no-store" });
        if (gRes.ok) {
          const gData = (await gRes.json()) as { guilds: GuildRow[] };
          setGuilds(gData.guilds);
          const first = gData.guilds.find((g) => g.botInstalled) ?? gData.guilds[0];
          if (first) {
            setSelectedGuildId(first.id);
            setCaps({
              sendMessages: first.enabledCapabilities.sendMessages ?? true,
              imageBatches: first.enabledCapabilities.imageBatches ?? true,
              channelCreate: first.enabledCapabilities.channelCreate ?? false,
              channelDelete: first.enabledCapabilities.channelDelete ?? false,
              voice: first.enabledCapabilities.voice ?? false,
            });
            if (first.selectedChannelId) setSelectedChannelId(first.selectedChannelId);
          }
        }
        const cRes = await fetch("/api/integrations/discord/confirmations", { cache: "no-store" });
        if (cRes.ok) {
          const cData = (await cRes.json()) as {
            confirmations: Array<{ confirmationId: string; preview: Record<string, unknown> }>;
          };
          const firstConfirm = cData.confirmations[0];
          if (firstConfirm) {
            setPendingConfirm({
              confirmationId: firstConfirm.confirmationId,
              preview: firstConfirm.preview,
            });
          } else {
            setPendingConfirm(null);
          }
        }
      }
    } catch {
      toast.error("Failed to load Discord status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!selectedGuildId || !status?.connected) {
      setChannels([]);
      return;
    }
    const guild = guilds.find((g) => g.id === selectedGuildId);
    if (!guild?.botInstalled) {
      setChannels([]);
      return;
    }
    void (async () => {
      const res = await fetch(
        `/api/integrations/discord/channels?guildId=${encodeURIComponent(selectedGuildId)}&types=text,forum`,
      );
      if (!res.ok) return;
      const data = (await res.json()) as { channels: ChannelRow[] };
      setChannels(data.channels);
    })();
  }, [selectedGuildId, guilds, status?.connected]);

  async function disconnect() {
    setBusy(true);
    try {
      const res = await fetch("/api/integrations/discord/disconnect", { method: "POST" });
      if (!res.ok) throw new Error("Disconnect failed");
      toast.success("Discord disconnected");
      await refresh();
    } catch {
      toast.error("Could not disconnect Discord");
    } finally {
      setBusy(false);
    }
  }

  async function installBot() {
    setBusy(true);
    try {
      const qs = new URLSearchParams();
      if (selectedGuildId) qs.set("guildId", selectedGuildId);
      if (caps.channelCreate) qs.set("channelCreate", "1");
      if (caps.voice) qs.set("voice", "1");
      const res = await fetch(`/api/integrations/discord/install?${qs}`);
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error || "Install URL failed");
      window.open(data.url, "_blank", "noopener,noreferrer");
      toast.message("Finish installing the bot in Discord, then save this server.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Install failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveGuild() {
    if (!selectedGuildId) return;
    setBusy(true);
    try {
      const res = await fetch("/api/integrations/discord/guilds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guildId: selectedGuildId,
          selectedChannelId: selectedChannelId || null,
          enabledCapabilities: caps,
        }),
      });
      const data = (await res.json()) as { botInstalled?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error || "Save failed");
      toast.success(data.botInstalled ? "Server saved — bot detected" : "Server saved — install the bot next");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function testMessage() {
    if (!selectedGuildId || !selectedChannelId) {
      toast.error("Select a server and default channel first");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/integrations/discord/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op: "test_message",
          guildId: selectedGuildId,
          channelId: selectedChannelId,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Test failed");
      toast.success("Test message sent");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Test failed");
    } finally {
      setBusy(false);
    }
  }

  async function confirmPending() {
    if (!pendingConfirm) return;
    setBusy(true);
    try {
      const res = await fetch("/api/integrations/discord/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "confirm", confirmationId: pendingConfirm.confirmationId }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Confirm failed");
      toast.success("Discord action confirmed");
      setPendingConfirm(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Confirm failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Discord</CardTitle>
          <CardDescription>Loading connection…</CardDescription>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!status) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Discord</CardTitle>
          <CardDescription>Sign in to connect Discord.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-[#5865F2] text-sm font-bold text-white">
            D
          </span>
          Discord
        </CardTitle>
        <CardDescription>
          Connect your Discord account, install the bot in a server you manage, then ask the chatbot to act.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!status.configured && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
            Discord env not fully configured. Missing: {status.missingEnv.join(", ") || "unknown"}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          {status.connected && status.discordUser ? (
            <div className="flex w-full flex-wrap items-center gap-3 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-3">
              {status.discordUser.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={status.discordUser.avatar}
                  alt=""
                  className="h-10 w-10 rounded-full ring-2 ring-emerald-400/60"
                />
              ) : (
                <div className="h-10 w-10 rounded-full bg-emerald-500/30" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold tracking-wider text-black uppercase">
                    Connected
                  </span>
                  <span className="font-medium">{status.discordUser.username}</span>
                </div>
                <div className="text-muted-foreground text-xs">
                  Discord account linked · id {status.discordUser.id}
                </div>
              </div>
              <Button variant="outline" disabled={busy} onClick={() => void disconnect()}>
                Disconnect
              </Button>
            </div>
          ) : (
            <div className="w-full space-y-3">
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm">
                <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase">
                  Not connected
                </span>
                <span className="text-muted-foreground text-xs">
                  Authorize Discord, then you should land back here with a green Connected badge.
                </span>
              </div>
              <a href="/api/integrations/discord/connect">
                <Button disabled={!status.configured || busy}>Connect Discord</Button>
              </a>
              <p className="text-muted-foreground text-xs leading-relaxed">
                In the Discord Developer Portal → OAuth2 → Redirects, add exactly:
                <code className="ml-1 rounded bg-white/10 px-1 py-0.5 text-[11px]">
                  http://localhost:3001/api/integrations/discord/callback
                </code>
              </p>
            </div>
          )}
        </div>

        {status.connected && (
          <div className="space-y-4 border-t border-white/10 pt-4">
            <div className="space-y-2">
              <Label htmlFor="discord-guild">Server</Label>
              <select
                id="discord-guild"
                className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                value={selectedGuildId}
                onChange={(e) => setSelectedGuildId(e.target.value)}
              >
                <option value="">Select a server you manage…</option>
                {guilds.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                    {g.botInstalled ? " · bot installed" : " · install bot"}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={busy || !selectedGuildId} onClick={() => void installBot()}>
                Install Bot
              </Button>
              <Button disabled={busy || !selectedGuildId} onClick={() => void saveGuild()}>
                Save server & capabilities
              </Button>
              <Button
                variant="outline"
                disabled={busy || !selectedGuildId || !selectedChannelId}
                onClick={() => void testMessage()}
              >
                Send test message
              </Button>
            </div>

            <div className="space-y-2">
              <Label htmlFor="discord-channel">Default text channel</Label>
              <select
                id="discord-channel"
                className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                value={selectedChannelId}
                onChange={(e) => setSelectedChannelId(e.target.value)}
              >
                <option value="">Select channel…</option>
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    #{c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["sendMessages", "Send messages"],
                  ["imageBatches", "Image batches"],
                  ["channelCreate", "Create / update channels"],
                  ["channelDelete", "Delete channels (destructive)"],
                  ["voice", "Voice features (worker)"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={caps[key]}
                    onCheckedChange={(v) => setCaps((c) => ({ ...c, [key]: Boolean(v) }))}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
        )}

        {pendingConfirm && (
          <div className="space-y-2 rounded-md border border-[#5865F2]/50 bg-[#5865F2]/10 p-3">
            <div className="text-sm font-medium">Confirm Discord action</div>
            <p className="text-xs opacity-80">
              Image sends and other sensitive actions stay queued until you click Confirm below.
            </p>
            <pre className="overflow-auto text-xs whitespace-pre-wrap opacity-90">
              {JSON.stringify(pendingConfirm.preview, null, 2)}
            </pre>
            <div className="flex gap-2">
              <Button disabled={busy} onClick={() => void confirmPending()}>
                Confirm & send
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => setPendingConfirm(null)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
