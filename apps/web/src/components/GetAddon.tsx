"use client";

import { inDiscord, openExternal } from "@/components/DiscordActivity";
import { ADDON_VERSION } from "@/lib/addonVersion";

// Absolute, because inside Discord the page runs on discordsays.com and the
// download has to open in the viewer's own browser.
const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://goop-kos.vercel.app";
const ZIP = "/GoopKOS.zip";

const step: React.CSSProperties = { margin: 0, fontSize: 14, lineHeight: 1.6, color: "var(--text-2)" };
const code: React.CSSProperties = {
  fontFamily: "var(--mono)", fontSize: 12.5, color: "var(--accent-2)",
  background: "var(--field)", border: "1px solid var(--field-line)", borderRadius: 4, padding: "1px 6px", overflowWrap: "anywhere",
};

/** Download button and install steps for friends who don't have the addon yet. */
export function GetAddon({ onClose }: { onClose: () => void }) {
  function download(e: React.MouseEvent<HTMLAnchorElement>) {
    // Decide now: preventDefault after an await would be too late.
    if (!inDiscord()) return;
    e.preventDefault();
    openExternal(SITE + ZIP).catch((err) => console.error("[addon] open link failed", err));
  }

  return (
    <section
      style={{
        background: "var(--raised)", border: "1px solid var(--line)",
        borderLeft: "3px solid var(--accent-2)", borderRadius: 7, padding: "18px 20px",
        display: "flex", flexDirection: "column", gap: 14,
        boxShadow: "-6px 0 22px -12px var(--accent-2)",
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <h2 className="micro" style={{ margin: 0, color: "var(--accent-2)" }}>Get the GoopKOS addon</h2>
        <div style={{ display: "flex", gap: 10 }}>
          <a
            href={ZIP}
            download
            onClick={download}
            style={{
              background: "var(--accent-2)", color: "#00141a", textDecoration: "none",
              borderRadius: 6, fontSize: 13, fontWeight: 600, padding: "8px 16px",
              boxShadow: "var(--glow-2)",
            }}
          >
            Download GoopKOS v{ADDON_VERSION}
          </a>
          <button type="button" onClick={onClose} style={{
            background: "transparent", border: "1px solid var(--field-line)", color: "var(--text-2)",
            borderRadius: 6, fontFamily: "var(--body)", fontSize: 13, padding: "8px 14px", cursor: "pointer",
          }}>
            Close
          </button>
        </div>
      </div>

      <ol style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
        <li style={step}><strong>Close WoW</strong>, then download the zip above.</li>
        <li style={step}>
          Unzip it into <span style={code}>World of Warcraft\_forever_\Interface\AddOns</span>. You should end up
          with <span style={code}>AddOns\GoopKOS\GoopKOS.toc</span>, not a GoopKOS folder inside another one.
        </li>
        <li style={step}>Start WoW. At character select, click <strong>AddOns</strong> and make sure <strong>GoopKOS</strong> is ticked.</li>
        <li style={step}>
          Set a key: <strong>Esc → Options → Keybindings → AddOns → GoopKOS → “Goop my target (KOS)”</strong>.
          Or make a macro with <span style={code}>/kos</span> and drag it to your bar.
        </li>
      </ol>

      <p style={{ ...step, borderTop: "1px solid var(--line-soft)", paddingTop: 12 }}>
        <strong>Updating?</strong> Same steps: close WoW, unzip over the old GoopKOS folder and say yes to
        replace. Your list is kept. The addon tells you in chat when a friend has a newer version, and{" "}
        <span style={code}>/kos version</span> shows yours.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, borderTop: "1px solid var(--line-soft)", paddingTop: 12 }}>
        <span className="micro">Using it</span>
        <p style={step}>Target an enemy player and press your key: they go on everyone&apos;s list.</p>
        <p style={step}>Die to someone? A window pops up with enemies you just saw. Click your killer.</p>
        <p style={step}>
          <span style={code}>/kos recent</span> shows enemies you&apos;ve seen lately.{" "}
          <span style={code}>/kos add &quot;First Last&quot; why</span> adds someone by name.
        </p>
        <p style={step}>
          Got one of them back? Kill someone on the list and a <strong>Revenge?</strong> box pops up, or target
          their body and type <span style={code}>/kos revenge</span>. <span style={code}>/kos list</span> shows
          who&apos;s on it.
        </p>
        <p style={step}>Anyone on the list gets an orange <strong>[KOS]</strong> tag over their nameplate. It syncs with everyone else running it.</p>
      </div>
    </section>
  );
}
