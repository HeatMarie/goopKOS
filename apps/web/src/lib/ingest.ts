import type { PoolClient } from "pg";
import { nameKey, type Incident } from "@goopkos/core";

/**
 * Upsert the target, then insert the incident keyed on clientId. Returns true
 * if the incident was new. Shared by the watcher upload and the web form so
 * both go through the same idempotent path. Call inside a transaction.
 */
export async function insertIncident(
  client: PoolClient,
  incident: Incident,
  source: "addon" | "web",
): Promise<boolean> {
  const targetRes = await client.query<{ id: string }>(
    `insert into kos_target (name, name_key, class, level, first_seen_at, last_seen_at)
     values ($1, $2, $3, $4, to_timestamp($5), to_timestamp($5))
     on conflict (name_key) do update set
       name         = excluded.name,
       class        = coalesce(excluded.class, kos_target.class),
       level        = coalesce(excluded.level, kos_target.level),
       first_seen_at = least(kos_target.first_seen_at, excluded.first_seen_at),
       last_seen_at  = greatest(kos_target.last_seen_at, excluded.last_seen_at)
     returning id`,
    [incident.name, nameKey(incident.name), incident.class, incident.level, incident.occurredAt],
  );

  const insertRes = await client.query(
    `insert into kos_incident
       (target_id, kind, note, zone, occurred_at, reported_by, source, client_id)
     values ($1, $2, $3, $4, to_timestamp($5), $6, $7, $8)
     on conflict (client_id) do nothing
     returning id`,
    [
      targetRes.rows[0]!.id,
      incident.kind,
      incident.note,
      incident.zone,
      incident.occurredAt,
      incident.reportedBy,
      source,
      incident.clientId,
    ],
  );

  return insertRes.rowCount === 1;
}
