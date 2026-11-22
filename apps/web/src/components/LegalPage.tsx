import Link from "next/link";

/** Shared frame for the Terms and Privacy pages. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <main style={{ minHeight: "100vh", padding: "clamp(20px, 4vw, 32px) clamp(16px, 3.5vw, 28px) 56px" }}>
      <article
        style={{
          maxWidth: 720, margin: "0 auto", background: "var(--panel)", border: "1px solid var(--line)",
          borderRadius: 9, padding: "clamp(20px, 4vw, 36px)", display: "flex", flexDirection: "column", gap: 14,
          fontSize: 15, lineHeight: 1.65, color: "var(--text-2)",
        }}
      >
        <Link href="/" style={{ fontSize: 13, textDecoration: "none" }}>← Back to the list</Link>
        <h1 style={{
          margin: 0, fontFamily: "var(--display)", fontSize: 26, letterSpacing: "0.06em",
          color: "#ffe3f6", textShadow: "0 0 10px rgba(255, 47, 180, 0.6)",
        }}>
          {title}
        </h1>
        <span className="micro">Last updated {updated}</span>
        {children}
      </article>
    </main>
  );
}

export function H2({ children }: { children: React.ReactNode }) {
  return <h2 style={{ margin: "14px 0 0", fontFamily: "var(--display)", fontSize: 17, color: "var(--accent-2)" }}>{children}</h2>;
}

export const p: React.CSSProperties = { margin: 0 };
export const ul: React.CSSProperties = { margin: 0, paddingLeft: 22, display: "flex", flexDirection: "column", gap: 6 };
