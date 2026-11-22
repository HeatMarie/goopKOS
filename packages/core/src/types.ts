export const INCIDENT_KINDS = ["killed_me", "ganked"] as const;

export type IncidentKind = (typeof INCIDENT_KINDS)[number];

export function isIncidentKind(v: unknown): v is IncidentKind {
  return typeof v === "string" && (INCIDENT_KINDS as readonly string[]).includes(v);
}

/** One incident exactly as the addon writes it into SavedVariables. */
export interface RawIncident {
  clientId: string;
  name: string;
  kind: string;
  occurredAt: number;
  reportedBy: string;
  class?: string | null;
  level?: number | null;
  zone?: string | null;
  note?: string | null;
}

/** An incident after validation, ready to POST. */
export interface Incident {
  clientId: string;
  name: string;
  kind: IncidentKind;
  occurredAt: number;
  reportedBy: string;
  class: string | null;
  level: number | null;
  zone: string | null;
  note: string | null;
}

export interface Target {
  id: string;
  name: string;
  nameKey: string;
  class: string | null;
  level: number | null;
  status: "active" | "retired";
  firstSeenAt: string;
  lastSeenAt: string;
  kills: number;
  incidentCount: number;
  lastZone: string | null;
  lastNote: string | null;
  lastReportedBy: string | null;
  lastIncidentAt: string | null;
}

export interface IngestResult {
  received: number;
  inserted: number;
  duplicates: number;
  rejected: { clientId: string; reason: string }[];
}

const MAX_NAME = 64;
const MAX_NOTE = 500;
const MAX_ZONE = 80;

function clean(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().slice(0, max);
  return s.length > 0 ? s : null;
}

/**
 * Validate one raw incident. Returns the incident, or a reason string.
 * Everything crossing this boundary came off someone else's disk, so
 * nothing is trusted: types, lengths and enum membership all get checked.
 */
export function validateIncident(raw: unknown): Incident | { error: string } {
  if (typeof raw !== "object" || raw === null) return { error: "not an object" };
  const r = raw as Record<string, unknown>;

  const clientId = clean(r.clientId, 128);
  if (!clientId) return { error: "missing clientId" };

  const name = clean(r.name, MAX_NAME);
  if (!name) return { error: "missing name" };

  if (!isIncidentKind(r.kind)) return { error: `bad kind: ${String(r.kind)}` };

  const occurredAt = typeof r.occurredAt === "number" ? Math.floor(r.occurredAt) : NaN;
  if (!Number.isFinite(occurredAt) || occurredAt <= 0) return { error: "bad occurredAt" };

  const reportedBy = clean(r.reportedBy, MAX_NAME);
  if (!reportedBy) return { error: "missing reportedBy" };

  let level: number | null = null;
  if (typeof r.level === "number" && r.level >= 1 && r.level <= 100) {
    level = Math.floor(r.level);
  }

  let klass: string | null = null;
  if (typeof r.class === "string" && /^[A-Z_]{2,20}$/.test(r.class)) {
    klass = r.class;
  }

  return {
    clientId,
    name,
    kind: r.kind,
    occurredAt,
    reportedBy,
    class: klass,
    level,
    zone: clean(r.zone, MAX_ZONE),
    note: clean(r.note, MAX_NOTE),
  };
}

export function nameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}
