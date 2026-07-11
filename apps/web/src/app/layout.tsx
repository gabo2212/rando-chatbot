import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";

import "../index.css";
import Providers from "@/components/providers";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "RANDO",
  description: "Endless pursuit — AI chat",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`${geistMono.variable} bg-black font-mono text-white antialiased`}>
        <Providers>
          <div className="h-svh min-h-0">{children}</div>
        </Providers>
      </body>
    </html>
  );
}
