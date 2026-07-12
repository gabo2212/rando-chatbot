import "@chatbot/env/web";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  reactCompiler: true,
  transpilePackages: ["shiki"],
};

export default nextConfig;

// OpenNext Cloudflare helper is local/CF-only — skip on Vercel.
if (!process.env.VERCEL) {
  void import("@opennextjs/cloudflare")
    .then((mod) => {
      mod.initOpenNextCloudflareForDev();
    })
    .catch(() => {
      // Optional in environments without the Cloudflare toolchain.
    });
}
