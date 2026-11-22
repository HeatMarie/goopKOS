"use client";

import { useMemo, useState } from "react";
import type { Target } from "@goopkos/core";
import { classColor, className } from "@/lib/classes";
import { AddTarget, RemoveTarget } from "@/components/AddTarget";
import { GetAddon } from "@/components/GetAddon";

type Filter = "all" | "active" | "retired";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Everyone" },
  { id: "active", label: "Active" },
  { id: "retired", label: "Retired" },
];

function when(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function KosList({ targets }: { targets: Target[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [adding, setAdding] = useState(false);
  const [gettingAddon, setGettingAddon] = useState(false);

  const maxKills = useMemo(
    () => Math.max(1, ...targets.map((t) => t.kills)),
    [targets],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return targets.filter((t) => {
      if (filter !== "all" && t.status !== filter) return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        (t.lastZone ?? "").toLowerCase().includes(q) ||
        (t.lastNote ?? "").toLowerCase().includes(q) ||
        className(t.class).toLowerCase().includes(q)
      );
    });
  }, [targets, query, filter]);

  const wanted = useMemo(
    () => [...targets].sort((a, b) => b.kills - a.kills).slice(0, 3),
    [targets],
  );

  const rankColor = ["var(--accent)", "var(--accent-2)", "var(--accent-3)"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <header
        style={{
          display: "flex", flexWrap: "wrap", alignItems: "center", gap: 20,
          paddingBottom: 24, borderBottom: "1px solid var(--line)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none"
               stroke="var(--accent)" strokeWidth="1.6" aria-hidden="true"
               style={{ filter: "drop-shadow(0 0 6px rgba(255, 47, 180, 0.7))" }}>
            <circle cx="12" cy="12" r="8.2" />
            <path d="M12 1.6v5M12 17.4v5M1.6 12h5M17.4 12h5" />
            <circle cx="12" cy="12" r="2.1" fill="var(--accent)" stroke="none" />
          </svg>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <h1 style={{
              margin: 0, fontFamily: "var(--display)", fontSize: 23, fontWeight: 700,
              letterSpacing: "0.12em", textTransform: "uppercase", color: "#ffe3f6",
              textShadow: "0 0 6px rgba(255, 47, 180, 0.9), 0 0 18px rgba(255, 47, 180, 0.55)",
            }}>
              Kill on Sight
            </h1>
            <span style={{
              fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "0.14em",
              textTransform: "uppercase", color: "var(--accent-2)",
              textShadow: "0 0 8px rgba(45, 226, 255, 0.6)",
            }}>
              In Goop We Trust
            </span>
          </div>
        </div>

        <div style={{
          flex: "999 1 320px", minWidth: 0, display: "flex",
          justifyContent: "flex-end", gap: 12, flexWrap: "wrap",
        }}>
          <div style={{ position: "relative", flex: "1 1 240px", maxWidth: 420, minWidth: 0 }}>
            <label className="sr" htmlFor="kos-search">Search the list</label>
            <svg style={{ position: "absolute", left: 14, top: 13 }} width="16" height="16"
                 viewBox="0 0 24 24" fill="none" stroke="var(--dim)" strokeWidth="2" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.6-3.6" />
            </svg>
            <input
              id="kos-search"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, zone, or reason"
              style={{
                width: "100%", background: "var(--field)", border: "1px solid var(--field-line)",
                borderRadius: 6, color: "var(--text)", fontFamily: "var(--body)",
                fontSize: 14, padding: "11px 14px 11px 40px", outline: "none",
              }}
            />
          </div>
          <div style={{ display: "flex", gap: 12, flex: "0 0 auto", marginLeft: "auto" }}>
          <button
            type="button"
            onClick={() => setGettingAddon((g) => !g)}
            aria-expanded={gettingAddon}
            style={{
              flex: "0 0 auto", background: gettingAddon ? "var(--field)" : "transparent",
              border: "1px solid var(--accent-2)", color: "var(--accent-2)",
              borderRadius: 6, fontFamily: "var(--body)", fontSize: 13.5, fontWeight: 600,
              padding: "0 16px", cursor: "pointer", whiteSpace: "nowrap", minHeight: 42,
              boxShadow: gettingAddon ? "none" : "var(--glow-2)",
            }}
          >
            Get the addon
          </button>
          <button
            type="button"
            onClick={() => setAdding((a) => !a)}
            aria-expanded={adding}
            style={{
              flex: "0 0 auto", background: adding ? "var(--field)" : "var(--accent)",
              border: "1px solid var(--accent)", color: adding ? "var(--accent)" : "var(--accent-ink)",
              borderRadius: 6, fontFamily: "var(--body)", fontSize: 13.5, fontWeight: 600,
              padding: "0 16px", cursor: "pointer", whiteSpace: "nowrap", minHeight: 42,
              boxShadow: adding ? "none" : "var(--glow)",
            }}
          >
            {adding ? "Close" : "+ Add to KOS"}
          </button>
          </div>
        </div>
      </header>

      {gettingAddon && <GetAddon onClose={() => setGettingAddon(false)} />}
      {adding && <AddTarget onClose={() => setAdding(false)} />}

      <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <h2 className="micro" style={{ margin: 0, color: "var(--accent-2)" }}>Most wanted</h2>
          <span style={{ flex: 1, height: 1, background: "linear-gradient(90deg, var(--accent-2), transparent)", opacity: 0.5 }} />
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
          {wanted.map((t, i) => (
            <article key={t.id} style={{
              flex: "1 1 280px", minWidth: 0, background: "var(--raised)",
              border: "1px solid var(--line)", borderLeft: `3px solid ${rankColor[i]}`,
              borderRadius: 7, padding: "18px 20px",
              display: "flex", flexDirection: "column", gap: 12,
              boxShadow: `-6px 0 22px -12px ${rankColor[i]}`,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <span style={{
                  fontFamily: "var(--mono)", fontSize: 11, fontWeight: 600,
                  letterSpacing: "0.16em", color: rankColor[i],
                }}>
                  #{i + 1}
                </span>
                <span style={{
                  fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "0.1em",
                  textTransform: "uppercase", color: "var(--dim)",
                }}>
                  {t.lastZone ?? "unknown"}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
                <span style={{
                  fontFamily: "var(--display)", fontSize: 19, fontWeight: 600,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {t.name}
                </span>
                <span style={{
                  display: "flex", alignItems: "center", gap: 7,
                  fontSize: 12.5, color: "var(--text-3)",
                }}>
                  <span style={{
                    width: 7, height: 7, borderRadius: "50%",
                    background: classColor(t.class), flex: "0 0 auto",
                  }} />
                  {className(t.class)}{t.level ? ` · ${t.level}` : ""}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{
                  fontFamily: "var(--mono)", fontSize: 25, fontWeight: 600,
                  fontVariantNumeric: "tabular-nums", lineHeight: 1,
                }}>
                  {t.kills}
                </span>
                <span style={{
                  fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: "0.12em",
                  textTransform: "uppercase", color: "var(--muted)", lineHeight: 1.35,
                }}>
                  kills<br />on us
                </span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <div style={{
        display: "flex", flexWrap: "wrap", alignItems: "center",
        gap: 12, justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {FILTERS.map((f) => {
            const on = f.id === filter;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                style={{
                  background: on ? "var(--accent)" : "var(--field)",
                  border: `1px solid ${on ? "var(--accent)" : "var(--field-line)"}`,
                  color: on ? "var(--accent-ink)" : "var(--text-2)",
                  borderRadius: 6, fontFamily: "var(--body)", fontSize: 12.5,
                  fontWeight: on ? 600 : 500, padding: "8px 15px", cursor: "pointer",
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>
        <span style={{
          fontFamily: "var(--mono)", fontSize: 11.5, letterSpacing: "0.1em",
          textTransform: "uppercase", color: "var(--muted)",
        }}>
          {rows.length} shown · {targets.length} on the list
        </span>
      </div>

      <div style={{
        background: "var(--panel)", border: "1px solid var(--line)",
        borderRadius: 9, overflowX: "auto",
      }}>
        <table className="kos-table">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--line)" }}>
              <th scope="col" className="micro" style={{ textAlign: "left", padding: "14px 20px", whiteSpace: "nowrap" }}>Target</th>
              <th scope="col" className="micro" style={{ textAlign: "left", padding: "14px 16px" }}>Lvl</th>
              <th scope="col" className="micro" style={{ textAlign: "left", padding: "14px 16px", whiteSpace: "nowrap" }}>Last seen</th>
              <th scope="col" className="micro" style={{ textAlign: "left", padding: "14px 16px" }}>Kills</th>
              <th scope="col" className="micro" style={{ textAlign: "left", padding: "14px 16px" }}>Why they are on here</th>
              <th scope="col" className="micro" style={{ textAlign: "left", padding: "14px 20px", whiteSpace: "nowrap" }}>Added</th>
              <th scope="col" style={{ padding: "14px 20px 14px 0" }}><span className="sr">Remove</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} style={{ borderBottom: "1px solid var(--line-soft)" }}>
                <td className="c-target" style={{ padding: "15px 20px", minWidth: 190 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontFamily: "var(--display)", fontSize: 15, fontWeight: 600 }}>
                      {t.name}
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: "var(--text-3)" }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: classColor(t.class), flex: "0 0 auto" }} />
                      {className(t.class)}
                    </span>
                  </div>
                </td>
                <td className="c-lvl" data-label="Lvl" style={{ padding: "15px 16px", fontFamily: "var(--mono)", fontSize: 14, color: "var(--text-2)", fontVariantNumeric: "tabular-nums" }}>
                  {t.level ?? "—"}
                </td>
                <td className="c-zone" data-label="Seen" style={{ padding: "15px 16px", fontSize: 13.5, color: "var(--text-2)", whiteSpace: "nowrap" }}>
                  {t.lastZone ?? "—"}
                </td>
                <td className="c-kills" data-label="Kills" style={{ padding: "15px 16px", minWidth: 104 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 14, fontWeight: 600, fontVariantNumeric: "tabular-nums", minWidth: 14 }}>
                      {t.kills}
                    </span>
                    <span style={{ display: "block", width: 56, height: 4, borderRadius: 2, background: "var(--track)", overflow: "hidden" }}>
                      <span style={{
                        display: "block", height: "100%",
                        width: `${Math.round((t.kills / maxKills) * 100)}%`,
                        background: "linear-gradient(90deg, var(--accent), var(--accent-3))", borderRadius: 2,
                        boxShadow: "0 0 6px rgba(255, 47, 180, 0.6)",
                      }} />
                    </span>
                  </div>
                </td>
                <td className="c-note" style={{ padding: "15px 16px", fontSize: 13.5, color: "var(--text-2)", lineHeight: 1.5, minWidth: 300 }}>
                  {t.lastNote ?? <span style={{ color: "var(--dim)" }}>No reason recorded</span>}
                </td>
                <td className="c-added" style={{ padding: "15px 20px", whiteSpace: "nowrap" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    <span style={{ fontSize: 12.5, color: "var(--text-2)" }}>{t.lastReportedBy ?? "—"}</span>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--dim)" }}>
                      {when(t.lastIncidentAt)}
                    </span>
                  </div>
                </td>
                <td className="c-remove" style={{ padding: "15px 20px 15px 0", textAlign: "right" }}>
                  <RemoveTarget id={t.id} name={t.name} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p style={{ padding: "48px 20px", textAlign: "center", fontSize: 14, color: "var(--muted)", margin: 0 }}>
            {targets.length === 0
              ? "Nobody on the list yet. Go get ganked."
              : "No one on the list matches that. Lucky them."}
          </p>
        )}
      </div>
    </div>
  );
}
