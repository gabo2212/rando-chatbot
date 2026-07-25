# Discord worker (Gateway + @mention AI)

This process must **not** run on Vercel serverless. Deploy it to Railway, Fly.io, Render, Cloud Run, or a VPS.

Vercel hosts the Next.js app (slash commands + `/api/integrations/discord/mention-reply`).  
This worker holds the Discord **Gateway** connection so `@mentions` can be answered with RANDO AI.

## Env

```env
DISCORD_BOT_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_WORKER_SECRET=          # must match the web app
WEB_APP_URL=https://chatbot-ecru-two-16.vercel.app
PORT=8787
```

## Discord Developer Portal

1. **Bot → Privileged Gateway Intents → Message Content Intent** → enable (required to read `@bot …` text)
2. Enable intents used by this worker: Guilds, Guild Messages, Message Content, Guild Voice States
3. Invite the bot with Send Messages + Read Message History (+ Use Application Commands)
4. Set Interactions Endpoint URL on the web app:
   `https://<your-web-domain>/api/integrations/discord/interactions`

## Commands

```bash
# from repo root
npm install -w @chatbot/discord-worker
npm run register-commands -w @chatbot/discord-worker   # once / when slash commands change
npm run dev -w @chatbot/discord-worker                 # local gateway + @mention replies
```

## @mention flow

1. User: `@HennenBot what's up`
2. Worker receives `MESSAGE_CREATE`, strips the mention
3. Worker POSTs to `{WEB_APP_URL}/api/integrations/discord/mention-reply` with `Authorization: Bearer $DISCORD_WORKER_SECRET`
4. Web app runs the same OpenAI / AI SDK stack as `/api/ai` (no Discord tool confirmations)
5. Worker replies in-channel (splits at 2000 chars)

## Slash `/chat`

Handled on Vercel (no worker required). Ephemeral AI reply via deferred interaction + follow-up webhook.

## Health

```bash
curl -H "Authorization: Bearer $DISCORD_WORKER_SECRET" http://localhost:8787/health
```

## Deploy (example: long-running Node)

```bash
cd apps/discord-worker
# set env vars on the host, then:
npm start -w @chatbot/discord-worker
```

Or with Docker from repo root:

```bash
docker build -f apps/discord-worker/Dockerfile -t rando-discord-worker .
docker run --env-file apps/web/.env -e WEB_APP_URL=https://chatbot-ecru-two-16.vercel.app -p 8787:8787 rando-discord-worker
```
