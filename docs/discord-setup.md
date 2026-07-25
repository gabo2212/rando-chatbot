# Discord Developer Portal setup

1. Create an application at https://discord.com/developers/applications
2. **OAuth2 → Redirects**: add
   - `http://localhost:3001/api/integrations/discord/callback`
   - `https://<production-domain>/api/integrations/discord/callback`
3. Copy **Client ID** → `DISCORD_CLIENT_ID`
4. Copy **Client Secret** → `DISCORD_CLIENT_SECRET`
5. **Bot** tab → Reset Token → `DISCORD_BOT_TOKEN` (never expose to the browser)
6. **Bot → Privileged Gateway Intents** → enable **Message Content Intent** (required for `@bot` prompts)
7. **General Information** → Public Key → `DISCORD_PUBLIC_KEY`
8. **Interactions Endpoint URL** → `https://<production-domain>/api/integrations/discord/interactions`
9. Set `DISCORD_REDIRECT_URI` to the matching callback URL
10. Set a strong `DISCORD_ENCRYPTION_KEY` (passphrase or 64-char hex)
11. Set `DISCORD_WORKER_SECRET` (shared with the Gateway worker) and deploy `apps/discord-worker`
12. On the worker host set `WEB_APP_URL=https://<production-domain>` (same secret as above)

## Bot permissions (MVP)

Bitwise value from `BASE_BOT_PERMISSIONS` (+ optional Manage Channels / Voice):

- View Channels
- Send Messages
- Embed Links
- Attach Files
- Read Message History
- Use Application Commands
- Optional: Manage Channels (channel create/update)
- Optional: Connect, Speak, Move/Mute/Deafen Members (voice)

**Never request Administrator.**

## @mention AI replies

Requires the **discord-worker** process (Gateway). Vercel alone cannot keep a Discord Gateway socket open.

```text
User @mentions bot in a guild channel
  → discord-worker (MESSAGE_CREATE)
  → POST /api/integrations/discord/mention-reply (Bearer DISCORD_WORKER_SECRET)
  → OpenAI via AI SDK (same model as website chat)
  → reply in channel
```

Slash `/chat` works on Vercel without the worker (ephemeral AI reply).

## Database

```bash
npm run db:push
# or apply packages/db/drizzle/0002_discord_integration.sql
```

## Local web

```bash
# apps/web/.env — fill Discord vars
npm run dev
# open http://localhost:3001/settings
```

## Local worker (@mentions)

```bash
# same DISCORD_BOT_TOKEN + DISCORD_WORKER_SECRET as web
# WEB_APP_URL=http://localhost:3001  (or your tunnel URL)
npm run dev -w @chatbot/discord-worker
```

Then in Discord: `@YourBot hello`

## Register slash commands

```bash
npm install -w @chatbot/discord-worker
DISCORD_BOT_TOKEN=... DISCORD_CLIENT_ID=... npm run register-commands -w @chatbot/discord-worker
```
