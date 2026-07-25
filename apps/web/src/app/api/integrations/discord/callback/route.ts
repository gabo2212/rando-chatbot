import { NextResponse } from "next/server";

import { exchangeCodeForUser } from "@/lib/integrations/discord/service";
import { toPublicDiscordError } from "@/lib/integrations/discord/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const err = url.searchParams.get("error");

  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookies = Object.fromEntries(
    cookieHeader
      .split(";")
      .map((c) => c.trim())
      .filter(Boolean)
      .map((c) => {
        const i = c.indexOf("=");
        return [c.slice(0, i), decodeURIComponent(c.slice(i + 1))];
      }),
  );

  const expectedState = cookies.discord_oauth_state;
  const verifier = cookies.discord_oauth_verifier;
  const userId = cookies.discord_oauth_uid;
  const base = process.env.BETTER_AUTH_URL || "http://localhost:3001";
  const settings = `${base}/settings?discord=`;

  const clear = (res: NextResponse) => {
    for (const name of ["discord_oauth_state", "discord_oauth_verifier", "discord_oauth_uid"]) {
      res.cookies.set(name, "", { httpOnly: true, path: "/", maxAge: 0 });
    }
    return res;
  };

  if (err) {
    return clear(NextResponse.redirect(`${settings}denied`));
  }
  if (!code || !state || !expectedState || state !== expectedState || !verifier || !userId) {
    return clear(NextResponse.redirect(`${settings}invalid_state`));
  }

  try {
    await exchangeCodeForUser(userId, code, verifier);
    return clear(NextResponse.redirect(`${settings}connected`));
  } catch (error) {
    const pub = toPublicDiscordError(error);
    console.error("discord oauth callback", pub.code, pub.message);
    return clear(NextResponse.redirect(`${settings}error`));
  }
}
