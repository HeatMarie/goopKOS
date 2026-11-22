import type { Metadata } from "next";
import Link from "next/link";
import { H2, LegalPage, p, ul } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Terms of Service · Kill on Sight" };

export default function Terms() {
  return (
    <LegalPage title="Terms of Service" updated="November 22, 2026">
      <p style={p}>
        GoopKOS is a free, fan-made tool for one World of Warcraft Forever friend group: a shared list of
        in-game characters to watch out for, available as this website, a Discord app and a WoW addon. By using
        any of them you agree to these terms.
      </p>

      <H2>Not official</H2>
      <p style={p}>
        GoopKOS is not made, endorsed or supported by Blizzard Entertainment or Discord. World of Warcraft is a
        trademark of Blizzard Entertainment.
      </p>

      <H2>Using it fairly</H2>
      <ul style={ul}>
        <li>Only add in-game characters, for things that happened in the game.</li>
        <li>Never add real names, contact details or other real-world personal information.</li>
        <li>No harassment, threats, slurs or hateful content in names or notes.</li>
        <li>Don&apos;t spam the list or the <code>/kos</code> command, or try to break the site.</li>
        <li>Follow Discord&apos;s Terms of Service and Blizzard&apos;s rules while using it.</li>
      </ul>

      <H2>Entries and removal</H2>
      <p style={p}>
        Anyone with the link can add or remove entries. Entries that break these terms can be removed at any
        time, and access can be taken away from people who misuse it.
      </p>

      <H2>No guarantees</H2>
      <p style={p}>
        GoopKOS is provided as-is, for fun, with no warranty. It may be wrong, go down, change or shut down at
        any time, and entries may be lost. Use it at your own risk; we aren&apos;t liable for anything that
        results from using it.
      </p>

      <H2>Privacy</H2>
      <p style={p}>
        What we collect and how it&apos;s used is in the <Link href="/privacy">Privacy Policy</Link>.
      </p>

      <H2>Changes and contact</H2>
      <p style={p}>
        These terms may change; the date at the top changes with them. Questions go to Heat in the group&apos;s
        Discord server.
      </p>
    </LegalPage>
  );
}
