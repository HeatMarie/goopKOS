import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/auth";
import { KOS_COMMAND } from "@/lib/discord";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One-off: register (or update) the /kos slash command with Discord. Watcher
 * key required. Runs here so the client secret never leaves Vercel.
 *
 * Uses POST, which creates or updates a single command by name. A bulk PUT
 * would also delete the Activity's "Launch" entry-point command.
 */
export async function POST(req: Request): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const id = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID;
  const secret = process.env.DISCORD_CLIENT_SECRET;
  if (!id || !secret) {
    return NextResponse.json({ error: "discord client id/secret not configured" }, { status: 503 });
  }

  const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"),
    },
    body: new URLSearchParams({ grant_type: "client_credentials", scope: "applications.commands.update" }),
  });
  const token = (await tokenRes.json()) as { access_token?: string; error?: string };
  if (!tokenRes.ok || !token.access_token) {
    return NextResponse.json({ step: "token", status: tokenRes.status, error: token.error }, { status: 502 });
  }

  const cmdRes = await fetch(`https://discord.com/api/v10/applications/${id}/commands`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token.access_token}` },
    body: JSON.stringify(KOS_COMMAND),
  });
  const cmd = (await cmdRes.json()) as Record<string, unknown>;
  if (!cmdRes.ok) {
    return NextResponse.json({ step: "register", status: cmdRes.status, discord: cmd }, { status: 502 });
  }
  return NextResponse.json({ ok: true, command: cmd.name, id: cmd.id });
}
