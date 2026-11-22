"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const REFRESH_MS = 60_000;

/**
 * Turns the list page into a Discord Activity when Discord is hosting it.
 *
 * Discord loads Activities at <client_id>.discordsays.com and proxies "/" to
 * this app, adding frame_id and friends to the URL. Without frame_id we are a
 * normal web page and do nothing. Inside Discord we finish the SDK handshake
 * (or Discord keeps showing its loading screen), then re-render from the
 * server every minute so the list stays live while people watch it.
 *
 * No OAuth: the page only reads public data, so it never needs to know who
 * the viewer is.
 */
export function DiscordActivity() {
  const router = useRouter();

  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("frame_id")) return;

    const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID;
    if (!clientId) {
      console.error("[activity] NEXT_PUBLIC_DISCORD_CLIENT_ID is not set");
      return;
    }

    let timer: ReturnType<typeof setInterval> | undefined;
    let cancelled = false;

    import("@discord/embedded-app-sdk")
      .then(async ({ DiscordSDK }) => {
        const sdk = new DiscordSDK(clientId);
        await sdk.ready();
        if (cancelled) return;
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
