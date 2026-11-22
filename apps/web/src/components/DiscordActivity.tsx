"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { DiscordSDK } from "@discord/embedded-app-sdk";

const REFRESH_MS = 60_000;

let sdkPromise: Promise<DiscordSDK | null> | null = null;
let namePromise: Promise<string | null> | null = null;

function inDiscord(): boolean {
  return typeof window !== "undefined" && new URLSearchParams(window.location.search).has("frame_id");
}

/**
 * The SDK, once Discord has finished the handshake; null on the normal
 * website. Discord loads Activities at <client_id>.discordsays.com, proxies
 * "/" to this app and adds frame_id to the URL, which is how we tell.
 */
function discordSdk(): Promise<DiscordSDK | null> {
  if (!sdkPromise) {
    const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID;
    if (!inDiscord() || !clientId) {
      if (inDiscord()) console.error("[activity] NEXT_PUBLIC_DISCORD_CLIENT_ID is not set");
      sdkPromise = Promise.resolve(null);
    } else {
      sdkPromise = import("@discord/embedded-app-sdk").then(async ({ DiscordSDK }) => {
        const sdk = new DiscordSDK(clientId);
        await sdk.ready();
        return sdk;
      });
    }
  }
  return sdkPromise;
}

/**
 * The viewer's Discord display name, or null outside Discord or if they
 * decline. The first call shows Discord's "Authorize" prompt once; the code
 * it returns is swapped for a token server-side (/api/discord/token), since
 * that needs the client secret.
 */
export function discordName(): Promise<string | null> {
  if (!namePromise) {
    namePromise = (async () => {
      const sdk = await discordSdk();
      const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID;
      if (!sdk || !clientId) return null;

      const { code } = await sdk.commands.authorize({
        client_id: clientId,
        response_type: "code",
        prompt: "none",
        scope: ["identify"],
      });
      const res = await fetch("/api/discord/token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) return null;
      const { access_token } = (await res.json()) as { access_token?: string };
      if (!access_token) return null;

      const { user } = await sdk.commands.authenticate({ access_token });
      return user.global_name || user.username;
    })().catch((err) => {
      console.error("[activity] could not get Discord name", err);
      return null;
    });
  }
  return namePromise;
}

/**
 * Turns the list page into a Discord Activity when Discord is hosting it:
 * finishes the SDK handshake (or Discord keeps showing its loading screen),
 * then re-renders from the server every minute so the list stays live.
 * Does nothing on the normal website.
 */
export function DiscordActivity() {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    let cancelled = false;

    discordSdk()
      .then((sdk) => {
        if (!sdk || cancelled) return;
        document.documentElement.dataset.discord = "1";
        timer = setInterval(() => router.refresh(), REFRESH_MS);
      })
      .catch((err) => console.error("[activity] SDK handshake failed", err));

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [router]);

  return null;
}
