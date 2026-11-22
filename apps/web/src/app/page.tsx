import Link from "next/link";
import { listTargets } from "@/lib/targets";
import { KosList } from "@/components/KosList";

export const dynamic = "force-dynamic";

export default async function Page() {
  let targets = [] as Awaited<ReturnType<typeof listTargets>>;
  let error: string | null = null;

  try {
    targets = await listTargets();
  } catch (err) {
    error = err instanceof Error ? err.message : "Could not reach the database";
  }

  return (
    <main style={{ minHeight: "100vh", padding: "clamp(20px, 4vw, 32px) clamp(16px, 3.5vw, 28px) 56px" }}>
      <div style={{ maxWidth: 1304, margin: "0 auto" }}>
        {error ? (
          <p style={{ color: "var(--danger)", fontFamily: "var(--mono)", fontSize: 13 }}>
            {error}
          </p>
        ) : (
          <KosList targets={targets} />
        )}
        <footer style={{
          marginTop: 40, display: "flex", gap: 16, justifyContent: "center",
          fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase",
        }}>
          <Link href="/terms" style={{ color: "var(--muted)" }}>Terms</Link>
          <Link href="/privacy" style={{ color: "var(--muted)" }}>Privacy</Link>
        </footer>
      </div>
    </main>
  );
}
