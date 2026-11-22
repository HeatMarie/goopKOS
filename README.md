# GoopKOS

Shared kill-on-sight list for WoW Forever. Flag a Horde player in game with
one keypress; they show up on a page everyone can read.

```
addon/GoopKOS/     Lua addon — capture, peer sync, nameplate highlight
apps/watcher/      Node script that ships your saved data to the API
apps/web/          Next.js app — API routes and the list page
packages/core/     Shared types, the SavedVariables parser, the API client
db/schema.sql      Postgres tables
```

## Why there is a watcher

WoW addons cannot reach the network — no sockets, no HTTP, nothing. The only
way data leaves the game is that WoW writes the addon's table to a `.lua`
file on disk at logout or `/reload`. The watcher reads that file and posts it.
Only one person in the group needs to run it, because the addon syncs
incidents between everyone's clients in game first.

## Setup

### 1. Database

```bash
createdb goopkos
psql -d goopkos -f db/schema.sql
```

### 2. Web

```bash
pnpm install
cp apps/web/.env.example apps/web/.env
# set DATABASE_URL and GOOPKOS_API_KEYS
pnpm dev
```

`GOOPKOS_API_KEYS` is a comma-separated list — one key per person running a
watcher. Right now that is just you.

### 3. Addon

Copy `addon/GoopKOS/` into your WoW AddOns folder:

```
World of Warcraft\_forever_\Interface\AddOns\GoopKOS\
```

Forever may share retail's AddOns directory — if the addon does not appear at
character select, try `_retail_\Interface\AddOns\` instead.

`GoopKOS.toc` is set to `## Interface: 16001`, matching Forever. The sync
`PASSWORD` in `Sync.lua` is shared by everyone, so it ships inside the zip.

Friends get the addon from the **Get the addon** button on the list page,
which serves `apps/web/public/GoopKOS.zip` with install steps. After changing
anything in `addon/GoopKOS`, rebuild the zip (Windows) and commit it:

```bash
pnpm addon:zip
```

### 4. Watcher

```bash
cp apps/watcher/.env.example apps/watcher/.env
# set GOOPKOS_API_KEY to one of the keys from step 2
pnpm watch
```

Leave `GOOPKOS_SAVEDVARS` unset and it searches your drives for `GoopKOS.lua`
on startup. `pnpm --filter @goopkos/watcher find` just prints what it finds.

## Using it

| Command | What it does |
| --- | --- |
| `/kos` | Logs your current target as `ganked` |
| `/kos camped the flight path` | Same, with everything after the slash as the note |
| `/kos add Gankface camped Bob at the FP` | Logs someone by name without targeting them (`ganked`, rest is the note). A pasted "First Last" or "First-Last" stays whole if you've seen them; otherwise quote it: `/kos add "First Last"`. Skips the faction check |
| `/kos recent` | Opens a window of the last 8 enemy players you targeted, moused over or saw a nameplate for. Click one to log them as `ganked` |
| *dying* | The same window opens as "Who killed you?" with enemies seen in the last 2 minutes. Click one to log them as `killed_me` |
| *key bindings* | Esc → Options → Keybindings → AddOns → GoopKOS: "KOS my target" and "Show recent enemies" |
| `/kos list` | Prints how many incidents you are holding |

Until everyone runs the addon, the list page (and the Discord Activity) has
**+ Add to KOS** and a **Remove** button on each row. Both are open to anyone
with the link, by choice. Inside Discord the "Your name" box fills itself from
Discord once `DISCORD_CLIENT_SECRET` is set in Vercel.

Anyone on the list gets an orange `[KOS]` badge above their nameplate, which
is the actual point — you never have to read the list while you play. The
badge is its own frame on the base nameplate, so it shows with the default
nameplates or any nameplate addon.

## How sync works

The addon joins a password-protected chat channel and does two things: it
broadcasts each new incident, and twenty seconds after login it announces its
whole list. Anyone online merges what they are missing. So an incident logged
at 2am with nobody else on still propagates the next time that person overlaps
with *anyone* in the group — not just with whoever runs the watcher.

Every incident carries a `clientId` of `reporter-timestamp-counter`. The API
upserts on it, so re-sending the same file, or two people reporting the same
gossiped incident, lands exactly once. There is no merge logic anywhere.

## Not built yet

The Discord Activity. The plan is to serve the same Next.js app at a second
route wrapped in the Embedded App SDK, so the page runs inside Discord
instead of being screenshotted into it. That needs an app registered in the
Discord developer portal, the OAuth handshake, and URL mappings, since
Discord proxies an Activity's network calls rather than letting it hit the
API directly.

Also not built: the bot (`/kos check <name>` with autocomplete, the "added"
notification, parsing a `GoopKOS.lua` dragged into the channel).

## Found in game

- `UnitName` drops Forever surnames; `GetUnitName(unit, true)` returns
  "First Last". The addon uses the latter everywhere.
- Registering `COMBAT_LOG_EVENT_UNFILTERED` is forbidden in Forever and
  shows the "blocked from an action" popup at load, so deaths are not
  auto-logged. Nothing in the addon currently produces `killed_me`.
- Addons may not call `ChatFrame_RemoveChannel`, so the sync channel can show
  up in chat settings. Its messages never print.

## Untested

Everything that touches the WoW client. The Lua parses cleanly and the logic
is straightforward, but none of it has run in game. In particular:

- Where the `[KOS]` badge lands under a nameplate addon. It anchors to the top
  of the base plate; if it overlaps the name, raise `BADGE_Y` in
  `Nameplates.lua`.

The watcher, the parser, the schema and the ingest path have been run
end to end against a real Postgres.
