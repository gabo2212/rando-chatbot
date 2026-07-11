# chatbot

This project was created with [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack), a modern TypeScript stack that combines Next.js, Self, TRPC, and more.

## Features

- **TypeScript** - For type safety and improved developer experience
- **Next.js** - Full-stack React framework
- **TailwindCSS** - Utility-first CSS for rapid UI development
- **Shared UI package** - shadcn/ui primitives live in `packages/ui`
- **tRPC** - End-to-end type-safe APIs
- **Authentication** - Better-Auth
- **Turborepo** - Optimized monorepo build system

## Getting Started

First, install the dependencies:

```bash
npm install
```

Copy env (defaults already point at local Docker services):

```bash
cp apps/web/.env.example apps/web/.env
# set NVIDIA_API_KEY + BETTER_AUTH_SECRET
```

Start local Postgres (pgvector) + Ollama embeddings:

```bash
npm run docker:up
```

This brings up:

- Postgres on `localhost:5433` → container `5432` (`rando` / `rando` / db `rando`) with `vector` enabled  
  (host `5432` is often taken by a system Postgres, so Compose maps **5433**)
- Ollama on `localhost:11434` and pulls `nomic-embed-text` (768-dim)

Push the schema:

```bash
npm run db:push
```

Then start the app (local Next.js — no Cloudflare login needed):

```bash
npm run dev
```

For Cloudflare/Alchemy deploy later: `npm run dev:cf` (requires `alchemy login`).

Open [http://localhost:3001](http://localhost:3001). Chat lives at `/ai`. Embed on other sites with:

```html
<script src="https://your-host/chat.js" data-token="optional-token"></script>
```

**Local services (no Neon / Voyage):**

| Var | Default |
|-----|---------|
| `DATABASE_URL` | `postgresql://rando:rando@127.0.0.1:5433/rando` |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434/v1` |
| `OLLAMA_EMBED_MODEL` | `nomic-embed-text` |

Still required for chat: `OPENAI_API_KEY` (model defaults to `gpt-5.6-luna`).

## UI Customization

React web apps in this stack share shadcn/ui primitives through `packages/ui`.

- Change design tokens and global styles in `packages/ui/src/styles/globals.css`
- Update shared primitives in `packages/ui/src/components/*`
- Adjust shadcn aliases or style config in `packages/ui/components.json` and `apps/web/components.json`

### Add more shared components

Run this from the project root to add more primitives to the shared UI package:

```bash
npx shadcn@latest add accordion dialog popover sheet table -c packages/ui
```

Import shared components like this:

```tsx
import { Button } from "@chatbot/ui/components/button";
```

### Add app-specific blocks

If you want to add app-specific blocks instead of shared primitives, run the shadcn CLI from `apps/web`.

## Deployment

### Cloudflare via Alchemy

- Target: web + server
- Dev: npm run dev
- Deploy: npm run deploy
- Destroy: npm run destroy

For more details, see the guide on [Deploying to Cloudflare with Alchemy](https://www.better-t-stack.dev/docs/guides/cloudflare-alchemy).

## Project Structure

```
chatbot/
├── apps/
│   └── web/         # Fullstack application (Next.js)
├── packages/
│   ├── ui/          # Shared shadcn/ui components and styles
│   ├── api/         # API layer / business logic
│   ├── auth/        # Authentication configuration & logic
```

## Available Scripts

- `npm run dev`: Start all applications in development mode
- `npm run build`: Build all applications
- `npm run dev:web`: Start only the web application
- `npm run check-types`: Check TypeScript types across all apps
