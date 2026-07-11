import alchemy from "alchemy";
import { Nextjs, R2Bucket } from "alchemy/cloudflare";
import { config } from "dotenv";

config({ path: "./.env" });
config({ path: "../../apps/web/.env" });

const app = await alchemy("chatbot");

const documents = await R2Bucket("documents", {
  empty: true,
});

export const web = await Nextjs("web", {
  cwd: "../../apps/web",
  bindings: {
    CORS_ORIGIN: alchemy.env.CORS_ORIGIN!,
    BETTER_AUTH_SECRET: alchemy.secret.env.BETTER_AUTH_SECRET!,
    BETTER_AUTH_URL: alchemy.env.BETTER_AUTH_URL!,
    DATABASE_URL: alchemy.secret.env.DATABASE_URL!,
    OPENAI_API_KEY: alchemy.secret.env.OPENAI_API_KEY!,
    OPENAI_MODEL: alchemy.env.OPENAI_MODEL!,
    OLLAMA_BASE_URL: alchemy.env.OLLAMA_BASE_URL!,
    OLLAMA_EMBED_MODEL: alchemy.env.OLLAMA_EMBED_MODEL!,
    DOCUMENTS_BUCKET: documents,
  },
  dev: {
    env: {
      PORT: "3001",
    },
  },
});

console.log(`Web    -> ${web.url}`);

await app.finalize();
