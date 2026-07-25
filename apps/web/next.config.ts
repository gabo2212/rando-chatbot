import "@chatbot/env/web";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  reactCompiler: true,
  transpilePackages: ["shiki"],
  // Keep Discord Gateway/native optional deps out of the Turbopack graph.
  serverExternalPackages: [
    "discord.js",
    "@discordjs/ws",
    "@discordjs/rest",
    "zlib-sync",
    "bufferutil",
    "utf-8-validate",
  ],
  async rewrites() {
    return [
      { source: "/presentation", destination: "/presentation/index.html" },
      { source: "/presentation/", destination: "/presentation/index.html" },
      { source: "/presentation/discord", destination: "/presentation/discord.html" },
      { source: "/presentation/discord/", destination: "/presentation/discord.html" },
    ];
  },
  async headers() {
    return [
      {
        source: "/drive",
        headers: [
          {
            key: "Permissions-Policy",
            value:
              "accelerometer=*, gyroscope=*, magnetometer=*, autoplay=*",
          },
        ],
      },
      {
        source: "/games/:path*",
        headers: [
          {
            key: "Permissions-Policy",
            value:
              "accelerometer=*, gyroscope=*, magnetometer=*, autoplay=*",
          },
        ],
      },
    ];
  },
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
