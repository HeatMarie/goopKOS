import { timingSafeEqual } from "node:crypto";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** True when the request carries one of the configured watcher keys. */
export function isAuthorized(req: Request): boolean {
  const presented = req.headers.get("x-api-key");
  if (!presented) return false;
  const configured = (process.env.GOOPKOS_API_KEYS ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  if (configured.length === 0) return false;
  return configured.some((k) => safeEqual(k, presented));
}
