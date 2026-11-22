import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Discord Activity login, step 2 of 3: trade the one-time code from
 * sdk.commands.authorize() for an access token. This needs the client
 * secret, so it has to happen here and not in the browser. The page then
 * hands the token to sdk.commands.authenticate() to learn the viewer's name.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID;
  const secret = process.env.DISCORD_CLIENT_SECRET;
  if (!clientId || !secret) {
    return NextResponse.json({ error: "discord login not configured" }, { status: 503 });
  }

  let code: unknown;
  try {
    code = ((await req.json()) as { code?: unknown }).code;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (typeof code !== "string" || code.length > 200) {
    return NextResponse.json({ error: "missing code" }, { status: 400 });
  }

  const res = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: secret,
      grant_type: "authorization_code",
      code,
    }),
  });
  if (!res.ok) {
    console.error("[discord token]", res.status, (await res.text()).slice(0, 300));
    return NextResponse.json({ error: "token exchange failed" }, { status: 502 });
  }

  const { access_token } = (await res.json()) as { access_token?: string };
  return NextResponse.json({ access_token });
}
