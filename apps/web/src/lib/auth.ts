import { timingSafeEqual } from "node:crypto";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function matches(presented: string | null, keys: string): boolean {
  if (!presented) return false;
  const configured = keys.split(",").map((k) => k.trim()).filter(Boolean);
  return configured.some((k) => safeEqual(k, presented));
}

/** True when the request carries one of the configured watcher keys. */
export function isAuthorized(req: Request): boolean {
  return matches(req.headers.get("x-api-key"), process.env.GOOPKOS_API_KEYS ?? "");
}

/**
 * Like isAuthorized, but also accepts the shared helper key that the GoopKOS
 * program hands to every install (see /api/helper/config). Use it only on
 * routes the helper needs: uploading incidents and reading the export.
 */
export function isHelperAuthorized(req: Request): boolean {
  return (
    isAuthorized(req) ||
    matches(req.headers.get("x-api-key"), process.env.GOOPKOS_HELPER_KEY ?? "")
  );
}
