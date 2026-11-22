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

/** One pool per process, kept across hot reloads in dev. */
export const pool: Pool = globalThis.__kosPool ?? makePool();
if (process.env.NODE_ENV !== "production") globalThis.__kosPool = pool;
