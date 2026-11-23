"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CLASS_IDS, className } from "@/lib/classes";
import { discordName } from "@/components/DiscordActivity";

const NAME_KEY = "goopkos.reporter";

function loadName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

function saveName(name: string): void {
  try {
    if (name) localStorage.setItem(NAME_KEY, name);
  } catch {
    /* private window or blocked storage: just don't remember */
  }
}

const field: React.CSSProperties = {
  width: "100%", background: "var(--field)", border: "1px solid var(--field-line)",
  borderRadius: 6, color: "var(--text)", fontFamily: "var(--body)",
  fontSize: 14, padding: "10px 12px", outline: "none",
};

function Label({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6, flex: "1 1 180px", minWidth: 0 }}>
      <span className="micro">{text}</span>
      {children}
    </label>
  );
}

/** The "Add to KOS" form. Posts to /api/manual and refreshes the list. */
export function AddTarget({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"ganked" | "killed_me" | "revenge">("killed_me");
  const [klass, setKlass] = useState("");
  const [zone, setZone] = useState("");
  const [note, setNote] = useState("");
  const [reporter, setReporter] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameIssue, setNameIssue] = useState<string | null>(null);

  // Remembered name first; inside Discord, the Discord name wins.
  useEffect(() => {
    setReporter(loadName());
    let live = true;
    discordName().then(({ name: n, error: why }) => {
      if (!live) return;
      if (n) setReporter(n);
      setNameIssue(why);
    });
    return () => {
      live = false;
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Who are we adding?");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/manual", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(), kind, class: klass || null,
          zone: zone.trim() || null, note: note.trim() || null,
          reportedBy: reporter.trim() || null,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `save failed (${res.status})`);
      }
      saveName(reporter.trim());
      router.refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "save failed");
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      style={{
        background: "var(--raised)", border: "1px solid var(--line)",
        borderLeft: "3px solid var(--accent)", borderRadius: 7, padding: "18px 20px",
        display: "flex", flexDirection: "column", gap: 16,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <h2 className="micro" style={{ margin: 0, color: "var(--accent)" }}>Add to the list</h2>
        <span style={{ fontSize: 12, color: "var(--dim)" }}>Full name as it shows in game, e.g. “Narshok Gristlebalm”</span>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
        <Label text="Name">
          <input style={field} value={name} onChange={(e) => setName(e.target.value)}
                 maxLength={64} autoFocus placeholder="First Last" />
        </Label>
        <Label text="What happened">
          <select style={field} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="killed_me">They killed one of us</option>
            <option value="ganked">Ganked / harassing us</option>
            <option value="revenge">We got revenge on them</option>
          </select>
        </Label>
        <Label text="Class (optional)">
          <select style={field} value={klass} onChange={(e) => setKlass(e.target.value)}>
            <option value="">Don't know</option>
            {CLASS_IDS.map((c) => <option key={c} value={c}>{className(c)}</option>)}
          </select>
        </Label>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
        <Label text="Where (optional)">
          <input style={field} value={zone} onChange={(e) => setZone(e.target.value)}
                 maxLength={80} placeholder="Tanaris" />
        </Label>
        <Label text="Your name (optional)">
          <input style={field} value={reporter} onChange={(e) => setReporter(e.target.value)}
                 maxLength={64} placeholder="So we know who reported it" />
          {nameIssue && (
            <span style={{ fontSize: 11.5, color: "var(--dim)" }}>
              Couldn&apos;t get your Discord name ({nameIssue})
            </span>
          )}
        </Label>
      </div>

      <Label text="Why (optional)">
        <input style={field} value={note} onChange={(e) => setNote(e.target.value)}
               maxLength={500} placeholder="Camped the Gadgetzan flight path for 20 minutes" />
      </Label>

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button type="submit" disabled={saving} style={{
          background: "var(--accent)", border: "1px solid var(--accent)", color: "var(--accent-ink)",
          borderRadius: 6, fontFamily: "var(--body)", fontSize: 13, fontWeight: 600,
          padding: "9px 18px", cursor: saving ? "wait" : "pointer", opacity: saving ? 0.7 : 1,
        }}>
          {saving ? "Adding…" : "Add to KOS"}
        </button>
        <button type="button" onClick={onClose} disabled={saving} style={{
          background: "transparent", border: "1px solid var(--field-line)", color: "var(--text-2)",
          borderRadius: 6, fontFamily: "var(--body)", fontSize: 13, padding: "9px 16px", cursor: "pointer",
        }}>
          Cancel
        </button>
        {error && <span role="alert" style={{ fontSize: 13, color: "var(--danger)" }}>{error}</span>}
      </div>
    </form>
  );
}

/** Two-step delete: first click arms it, second click removes. */
export function RemoveTarget({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  async function click() {
    if (!armed) {
      setArmed(true);
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/targets/${id}`, { method: "DELETE" }).catch(() => null);
    if (res && (res.ok || res.status === 404)) {
      router.refresh();
    } else {
      setBusy(false);
      setArmed(false);
    }
  }

  return (
    <button
      type="button"
      onClick={click}
      disabled={busy}
      aria-label={armed ? `Confirm removing ${name}` : `Remove ${name} from the list`}
      title={armed ? "Click again to remove for good" : "Remove from the list"}
      style={{
        background: armed ? "var(--danger-bg)" : "transparent",
        border: `1px solid ${armed ? "var(--danger)" : "var(--field-line)"}`,
        color: armed ? "var(--danger-ink)" : "var(--dim)",
        borderRadius: 6, fontFamily: "var(--body)", fontSize: 12, fontWeight: armed ? 600 : 500,
        padding: "5px 10px", cursor: busy ? "wait" : "pointer", whiteSpace: "nowrap",
      }}
    >
      {busy ? "Removing…" : armed ? "Confirm" : "Remove"}
    </button>
  );
}
