FROM node:22-bookworm-slim

WORKDIR /app

# Install workspace deps from repo root context
COPY package.json package-lock.json ./
COPY apps/discord-worker/package.json apps/discord-worker/
COPY packages/config/package.json packages/config/
COPY packages/env/package.json packages/env/

RUN npm install --workspace=@chatbot/discord-worker --include-workspace-root=false

COPY apps/discord-worker apps/discord-worker

WORKDIR /app/apps/discord-worker
ENV NODE_ENV=production
ENV PORT=8787
EXPOSE 8787

CMD ["npx", "tsx", "src/index.ts"]
