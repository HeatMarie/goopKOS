import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __kosPool: Pool | undefined;
}

function makePool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  return new Pool({
    connectionString,
    max: 5,
    ssl: connectionString.includes("localhost") ? undefined : { rejectUnauthorized: false },
  });
}

/**
 * One pool per process, kept across hot reloads in dev. Created on first use,
 * not at import: `next build` imports every route, and on Vercel the build
 * can run before DATABASE_URL exists.
 */
export function db(): Pool {
  if (!globalThis.__kosPool) globalThis.__kosPool = makePool();
  return globalThis.__kosPool;
}
