# Discord worker (Gateway + voice)

This process must **not** run on Vercel serverless. Deploy it to Railway, Fly.io, Render, Cloud Run, or a VPS.

## Env

```env
DISCORD_BOT_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_WORKER_SECRET=
PORT=8787
```

## Commands

```bash
# from repo root
npm install -w @chatbot/discord-worker
npm run register-commands -w @chatbot/discord-worker   # once, after creating the Discord app
npm run dev -w @chatbot/discord-worker                 # local gateway
```

## Interactions endpoint (slash commands)

Set the Discord app Interactions Endpoint URL to:

```text
https://<your-web-domain>/api/integrations/discord/interactions
```

That route lives on the Next.js app and verifies `DISCORD_PUBLIC_KEY`. The worker is only required for Gateway/voice.

## Health

```bash
curl -H "Authorization: Bearer $DISCORD_WORKER_SECRET" http://localhost:8787/health
```
