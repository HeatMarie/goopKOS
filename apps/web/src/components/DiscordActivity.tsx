"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { DiscordSDK } from "@discord/embedded-app-sdk";

const REFRESH_MS = 60_000;
const PIP = 1; // LayoutModeTypeObject.PIP: the floating bubble

let sdkPromise: Promise<DiscordSDK | null> | null = null;
let namePromise: Promise<DiscordName> | null = null;

/** name: the display name, or null. error: why not, when it should have worked. */
export interface DiscordName {
  name: string | null;
  error: string | null;
}

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
      sdkPromise = import("@discord/embedded-app-sdk").then(async ({ DiscordSDK, RPCCloseCodes }) => {
        const sdk = new DiscordSDK(clientId);
        await sdk.ready();
        // Leaving the channel makes Discord shrink the Activity into a
        // floating picture-in-picture bubble. Nobody needs the list hovering
        // over other channels, so close instead; Launch brings it back.
        await sdk
          .subscribe("ACTIVITY_LAYOUT_MODE_UPDATE", ({ layout_mode }) => {
            if (layout_mode === PIP) sdk.close(RPCCloseCodes.CLOSE_NORMAL, "Closed when minimized");
          })
          .catch((err) => console.error("[activity] layout subscribe failed", err));
        return sdk;
      });
    }
  }
  return sdkPromise;
}

/**
 * Open a URL in the viewer's real browser when inside Discord (the Activity
 * frame can't download files itself). Returns false outside Discord, so the
 * caller falls back to a normal link.
 */
export async function openExternal(url: string): Promise<boolean> {
  const sdk = await discordSdk();
  if (!sdk) return false;
  await sdk.commands.openExternalLink({ url });
  return true;
}

function describe(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

/**
 * The viewer's Discord display name. Outside Discord: { name: null, error:
 * null }. The first call shows Discord's "Authorize" prompt once; the code it
 * returns is swapped for a token server-side (/api/discord/token), since that
 * needs the client secret. Any failure comes back as error, with the step.
 */
export function discordName(): Promise<DiscordName> {
  if (!namePromise) {
    namePromise = (async (): Promise<DiscordName> => {
      const sdk = await discordSdk();
      const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID;
      if (!sdk || !clientId) return { name: null, error: null };

      let code: string;
      try {
        ({ code } = await sdk.commands.authorize({
          client_id: clientId,
          response_type: "code",
          prompt: "none",
          scope: ["identify"],
        }));
      } catch (err) {
        return { name: null, error: `authorize: ${describe(err)}` };
      }

      const res = await fetch("/api/discord/token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const body = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string };
      if (!res.ok || !body.access_token) {
        return { name: null, error: body.error ?? `token: HTTP ${res.status}` };
      }

      try {
        const { user } = await sdk.commands.authenticate({ access_token: body.access_token });
        return { name: user.global_name || user.username, error: null };
      } catch (err) {
        return { name: null, error: `authenticate: ${describe(err)}` };
      }
    })().catch((err) => ({ name: null, error: describe(err) }));
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
