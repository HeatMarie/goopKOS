import { db } from "@/lib/db";
import type { Target } from "@goopkos/core";

interface Row {
  id: string;
  name: string;
  name_key: string;
  class: string | null;
  level: number | null;
  status: string;
  first_seen_at: Date;
  last_seen_at: Date;
  kills: number;
  revenge: number;
  incident_count: number;
  last_zone: string | null;
  last_note: string | null;
  last_reported_by: string | null;
  last_incident_at: Date | null;
}

export async function listTargets(): Promise<Target[]> {
  const res = await db().query<Row>(
    `select
       t.id, t.name, t.name_key, t.class, t.level, t.status,
       t.first_seen_at, t.last_seen_at,
       count(i.id) filter (where i.kind = 'killed_me')::int as kills,
       count(i.id) filter (where i.kind = 'revenge')::int   as revenge,
       count(i.id)::int                                     as incident_count,
       (array_agg(i.zone        order by i.occurred_at desc)
          filter (where i.zone is not null))[1]             as last_zone,
       (array_agg(i.note        order by i.occurred_at desc)
          filter (where i.note is not null and i.kind <> 'revenge'))[1] as last_note,
       (array_agg(i.reported_by order by i.occurred_at desc)
          filter (where i.kind <> 'revenge'))[1]            as last_reported_by,
       max(i.occurred_at)                                   as last_incident_at
     from kos_target t
     left join kos_incident i on i.target_id = t.id
     group by t.id
     -- Someone we only ever got revenge on was never a threat: not listed.
     having count(i.id) = 0 or count(i.id) filter (where i.kind <> 'revenge') > 0
     order by kills desc, last_incident_at desc nulls last, t.name asc`,
  );

  return res.rows.map((r) => ({
    id: r.id,
    name: r.name,
    nameKey: r.name_key,
    class: r.class,
    level: r.level,
    status: r.status === "retired" ? "retired" : "active",
    firstSeenAt: r.first_seen_at.toISOString(),
    lastSeenAt: r.last_seen_at.toISOString(),
    kills: r.kills,
    revenge: r.revenge,
    incidentCount: r.incident_count,
    lastZone: r.last_zone,
    lastNote: r.last_note,
    lastReportedBy: r.last_reported_by,
    lastIncidentAt: r.last_incident_at ? r.last_incident_at.toISOString() : null,
  }));
}
