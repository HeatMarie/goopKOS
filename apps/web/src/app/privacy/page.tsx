import type { Metadata } from "next";
import { H2, LegalPage, p, ul } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Privacy Policy · Kill on Sight" };

export default function Privacy() {
  return (
    <LegalPage title="Privacy Policy" updated="November 22, 2026">
      <p style={p}>
        GoopKOS is a small, fan-made kill-on-sight list run for one World of Warcraft Forever friend group.
        It has three parts: this website, a Discord app (the <code>/kos</code> command and the Activity), and a
        WoW addon. This page says what each part collects and what happens to it.
      </p>

      <H2>What we store</H2>
      <ul style={ul}>
        <li>
          <strong>Entries on the list:</strong> an in-game character name, and optionally that character&apos;s
          class, level, zone and a short note, plus when it was reported.
        </li>
        <li>
          <strong>Who reported it:</strong> the name shown as the reporter. That is your in-game character name
          (from the addon), whatever you type in &quot;Your name&quot; on the website, or your Discord server
          nickname or display name when you use <code>/kos add</code> or the Activity.
        </li>
      </ul>
      <p style={p}>
        We do <strong>not</strong> store Discord user IDs, email addresses, passwords, payment details or Discord
        access tokens.
      </p>

      <H2>Discord</H2>
      <p style={p}>
        When you use <code>/kos</code>, Discord sends us the command and your nickname or display name, which
        we use to credit the entry. In the Activity, if you choose to authorize the app (the &quot;identify&quot;
        permission), we read your Discord display name to fill in &quot;Your name&quot; on the add form. We
        don&apos;t read your messages, servers, friends or anything else.
      </p>

      <H2>The WoW addon</H2>
      <p style={p}>
        The addon keeps the list in your own WoW saved-variables file on your computer and shares entries with
        other GoopKOS players over an in-game addon channel. It has no internet access. One group member runs a
        small program on their own PC that uploads that file&apos;s entries to this site and brings website and
        Discord entries back into the game.
      </p>

      <H2>Your browser</H2>
      <p style={p}>
        The website remembers the name you last typed in &quot;Your name&quot; in your browser&apos;s local
        storage, so you don&apos;t retype it. There are no ads, analytics, tracking pixels or third-party
        cookies.
      </p>

      <H2>Who can see it</H2>
      <p style={p}>
        The list, including reporter names and notes, is visible to anyone with the link to this site or the
        Activity. Don&apos;t put real-world personal information in names or notes.
      </p>

      <H2>Where it lives and for how long</H2>
      <p style={p}>
        The website runs on Vercel and the list is stored in a Neon Postgres database; both may keep routine
        server logs. Entries stay until someone removes them. Copies inside the game addon drop off after 30 days.
        We never sell or share the data with anyone else.
      </p>

      <H2>Removing something</H2>
      <p style={p}>
        Any entry can be removed with the <strong>Remove</strong> button on the list. If you want something about
        you removed or have a question, ask Heat in the group&apos;s Discord server.
      </p>

      <H2>Changes</H2>
      <p style={p}>If this policy changes, the date at the top changes with it.</p>
    </LegalPage>
  );
}
