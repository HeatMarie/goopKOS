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
      </div>
    </main>
  );
}
