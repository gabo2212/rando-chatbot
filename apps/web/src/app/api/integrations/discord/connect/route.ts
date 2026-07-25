import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/integrations/discord/auth-guard";
import { createOAuthState, createPkcePair, buildUserAuthorizeUrl } from "@/lib/integrations/discord/oauth";
import { getDiscordConfig } from "@/lib/integrations/discord/schemas";
import { toPublicDiscordError } from "@/lib/integrations/discord/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const cfg = getDiscordConfig();
    if (!cfg.ready) {
      return NextResponse.json(
        { error: "Discord is not configured", missing: cfg.missing },
        { status: 503 },
      );
    }

    const state = createOAuthState();
    const pkce = createPkcePair();
    const url = buildUserAuthorizeUrl({ state, codeChallenge: pkce.challenge });

    const res = NextResponse.redirect(url);
    res.cookies.set("discord_oauth_state", state, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 600,
    });
    res.cookies.set("discord_oauth_verifier", pkce.verifier, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 600,
    });
    res.cookies.set("discord_oauth_uid", user.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 600,
    });
    return res;
  } catch (error) {
    const pub = toPublicDiscordError(error);
    return NextResponse.json({ error: pub.message, code: pub.code }, { status: pub.status });
  }
}
