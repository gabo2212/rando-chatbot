# Discord Developer Portal setup

1. Create an application at https://discord.com/developers/applications
2. **OAuth2 → Redirects**: add
   - `http://localhost:3001/api/integrations/discord/callback`
   - `https://<production-domain>/api/integrations/discord/callback`
3. Copy **Client ID** → `DISCORD_CLIENT_ID`
4. Copy **Client Secret** → `DISCORD_CLIENT_SECRET`
5. **Bot** tab → Reset Token → `DISCORD_BOT_TOKEN` (never expose to the browser)
6. **General Information** → Public Key → `DISCORD_PUBLIC_KEY`
7. **Interactions Endpoint URL** → `https://<production-domain>/api/integrations/discord/interactions`
8. Set `DISCORD_REDIRECT_URI` to the matching callback URL
9. Set a strong `DISCORD_ENCRYPTION_KEY` (passphrase or 64-char hex)
10. Optional worker: set `DISCORD_WORKER_SECRET` and deploy `apps/discord-worker`

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

## Register slash commands

```bash
npm install -w @chatbot/discord-worker
DISCORD_BOT_TOKEN=... DISCORD_CLIENT_ID=... npm run register-commands -w @chatbot/discord-worker
```
