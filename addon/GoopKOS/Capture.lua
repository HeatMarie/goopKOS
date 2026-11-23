local ADDON_NAME, KOS = ...

local DEBOUNCE    = 5    -- same target + kind inside this window is one incident
local MAX_NOTE    = 150  -- keeps a serialized incident inside one addon message
local PRUNE_DAYS  = 30

-- englishRace (4th return of GetPlayerInfoByGUID) -> faction. Races missing
-- here (Pandaren, Dracthyr, anything new) resolve to nil and fail safe.
local RACE_FACTION = {
  Human = "Alliance", Dwarf = "Alliance", NightElf = "Alliance", Gnome = "Alliance",
  Draenei = "Alliance", Worgen = "Alliance", VoidElf = "Alliance",
  LightforgedDraenei = "Alliance", DarkIronDwarf = "Alliance", KulTiran = "Alliance",
  Mechagnome = "Alliance",
  Orc = "Horde", Scourge = "Horde", Tauren = "Horde", Troll = "Horde",
  BloodElf = "Horde", Goblin = "Horde", Nightborne = "Horde",
  HighmountainTauren = "Horde", MagharOrc = "Horde", ZandalariTroll = "Horde",
  Vulpera = "Horde",
}

--- True only if the other player is on the opposite faction from whoever is
--- logged in right now. Duel opponents and same-side players fail this.
local function isEnemyFaction(unit, guid)
  local mine = UnitFactionGroup("player")
  if mine ~= "Alliance" and mine ~= "Horde" then return false end

  local theirs
  if unit then
    theirs = UnitFactionGroup(unit)
  elseif guid then
    local _, _, _, race = GetPlayerInfoByGUID(guid)
    theirs = race and RACE_FACTION[race]
  end

  if theirs ~= "Alliance" and theirs ~= "Horde" then return false end
  return theirs ~= mine
end
KOS.IsEnemyFaction = isEnemyFaction

-- Every chat line goes through here, so the voice stays in one place.
local GOOP = "|cff7dff3aGoop|r "
function KOS.Say(text) print(GOOP .. text) end
local say = KOS.Say

KOS.VERSION = (C_AddOns and C_AddOns.GetAddOnMetadata and C_AddOns.GetAddOnMetadata(ADDON_NAME, "Version"))
  or (GetAddOnMetadata and GetAddOnMetadata(ADDON_NAME, "Version")) or "0"

local function classColored(name, class)
  local c = class and RAID_CLASS_COLORS and RAID_CLASS_COLORS[class]
  if c and c.colorStr then return "|c" .. c.colorStr .. name .. "|r" end
  return name
end

local function ago(t)
  local s = time() - (t or 0)
  if s < 60 then return "just now" end
  if s < 3600 then return math.floor(s / 60) .. "m ago" end
  if s < 86400 then return math.floor(s / 3600) .. "h ago" end
  return math.floor(s / 86400) .. "d ago"
end

local LIST_MAX = 20   -- chat lines; the rest is summed up as "+N more"

--- /kos list: one line per person, most kills first, then most recent.
--- Kills are counted from incidents, same as the website's count(*).
function KOS:PrintList()
  local byName, people = {}, {}
  for _, e in ipairs(GoopKOSDB.incidents) do
    if e.name then
      local key = e.name:lower()
      local p = byName[key]
      if not p then
        p = { name = e.name, count = 0, back = 0, last = 0 }
        byName[key] = p
        people[#people + 1] = p
      end
      if e.kind == "revenge" then
        p.back = p.back + 1
      else
        p.count = p.count + 1
      end
      if e.kind ~= "revenge" and (e.occurredAt or 0) >= p.last then
        p.last, p.by = e.occurredAt or 0, e.reportedBy
        p.class = e.class or p.class
        p.level = e.level or p.level
      end
    end
  end

  -- Only ever gooped back, never a threat: not on the list.
  for i = #people, 1, -1 do
    if people[i].count == 0 then table.remove(people, i) end
  end

  if #people == 0 then
    say("the goop is empty. Nobody's earned it... yet.")
    return
  end
  table.sort(people, function(a, b)
    if a.count ~= b.count then return a.count > b.count end
    return a.last > b.last
  end)

  say(#people .. (#people == 1 and " gremlin" or " gremlins") .. " stuck in the goop:")
  for i = 1, math.min(#people, LIST_MAX) do
    local p = people[i]
    print("  " .. classColored(p.name, p.class)
      .. (p.level and (" (" .. p.level .. ")") or "")
      .. "  |cffff7a18x" .. p.count .. "|r"
      .. (p.back > 0 and ("  |cff7dff3a+" .. p.back .. " back|r") or "")
      .. "  |cff9d9d9d" .. ago(p.last) .. (p.by and (" by " .. p.by) or "") .. "|r")
  end
  if #people > LIST_MAX then
    print("  |cff9d9d9d...and " .. (#people - LIST_MAX) .. " more on the website|r")
  end
end

--- "First Last". Forever has surnames and UnitName drops them;
--- GetUnitName(unit, true) keeps them (and adds -Realm for other realms).
function KOS.FullName(unit)
  return (GetUnitName and GetUnitName(unit, true)) or UnitName(unit)
end

--- Rebuild the clientId index after a load or a bulk merge.
function KOS:ReindexIncidents()
  self.byClientId = {}
  for _, entry in ipairs(GoopKOSDB.incidents) do
    if entry.clientId then self.byClientId[entry.clientId] = entry end
  end
end

--- Add an incident that arrived from a friend. Returns true if it was new.
function KOS:Merge(entry)
  if type(entry) ~= "table" or not entry.clientId then return false end
  if self.byClientId[entry.clientId] then return false end
  table.insert(GoopKOSDB.incidents, entry)
  self.byClientId[entry.clientId] = entry
  return true
end

--- Names currently on the list, for the nameplate highlight.
function KOS:ActiveNames()
  local names = {}
  for _, entry in ipairs(GoopKOSDB.incidents) do
    if entry.name and entry.kind ~= "revenge" then names[entry.name:lower()] = true end
  end
  return names
end

--- lower -> proper-case name, for everyone listed or recently seen.
local function knownNames()
  local known = {}
  for _, entry in ipairs(GoopKOSDB.incidents) do
    if entry.name then known[entry.name:lower()] = entry.name end
  end
  for _, e in ipairs(KOS.RecentEnemies and KOS:RecentEnemies() or {}) do
    known[e.name:lower()] = e.name
  end
  return known
end

--- Split the text after "/kos add" into name and note. A pasted "First Last"
--- or chat-style "First-Last" stays whole when it matches someone listed or
--- recently seen; otherwise quote it: /kos add "First Last" note
local function splitNameAndNote(rest)
  local quoted, qnote = rest:match('^"(.-)"%s*(.*)$')
  if quoted then return quoted, qnote end

  local w1, w2, tail = rest:match("^(%S+)%s*(%S*)%s*(.-)$")
  if not w1 then return nil end
  local after = (w2 .. " " .. tail):match("^%s*(.-)%s*$")

  local known = knownNames()
  if w2 ~= "" and known[(w1 .. " " .. w2):lower()] then
    return known[(w1 .. " " .. w2):lower()], tail
  end
  local _, dashes = w1:gsub("%-", "")
  if dashes == 1 then
    local spaced = w1:gsub("%-", " ")
    return known[spaced:lower()] or spaced, after
  end
  return known[w1:lower()] or w1, after
end

--- /kos with no name, or the "Goop my target" key binding.
function KOS:LogTarget(note)
  if not UnitExists("target") or not UnitIsPlayer("target") or not isEnemyFaction("target") then
    say("goop needs an enemy player targeted. Or try /kos recent, /kos add Name, /kos list")
    return
  end
  KOS:Record(KOS.FullName("target"), "ganked", note, "target")
end

-- Key bindings (Bindings.xml). Esc > Options > Keybindings > AddOns > GoopKOS.
BINDING_HEADER_GOOPKOS      = "GoopKOS"
BINDING_NAME_GOOPKOS_TARGET = "Goop my target (KOS)"
BINDING_NAME_GOOPKOS_RECENT = "Who can I goop? (recent enemies)"
function GoopKOS_KosTarget() KOS:LogTarget(nil) end
BINDING_NAME_GOOPKOS_REVENGE = "Got revenge on my target"
function GoopKOS_ShowRecent() KOS:ShowRecent("ganked") end
function GoopKOS_Revenge() KOS:LogRevenge(nil) end

--- /kos revenge with no name, or the key binding. Works on a corpse too:
--- target the body and press it.
function KOS:LogRevenge(note)
  if not UnitExists("target") or not UnitIsPlayer("target") or not isEnemyFaction("target") then
    say("target the enemy you got (their body works), or /kos revenge Name")
    return
  end
  KOS:Record(KOS.FullName("target"), "revenge", note, "target")
end

--- known: optional { class, level } for when there is no live unit, e.g. a
--- click in the recent-enemies window after they've run off.
function KOS:Record(name, kind, note, unit, guid, known)
  if not name or name == "" then return end

  local now = time()
  local slot = name:lower() .. "|" .. kind
  self.recent = self.recent or {}
  if self.recent[slot] and (now - self.recent[slot]) < DEBOUNCE then return end
  self.recent[slot] = now

  GoopKOSDB.counter = (GoopKOSDB.counter or 0) + 1

  local class
  if unit then
    local _, eng = UnitClass(unit)
    class = eng
  elseif guid then
    local _, eng = GetPlayerInfoByGUID(guid)
    class = eng
  end
  if not class and known then class = known.class end

  local level = unit and UnitLevel(unit) or (known and known.level) or nil
  if level == -1 then level = nil end

  if note and #note > MAX_NOTE then note = note:sub(1, MAX_NOTE) end

  local entry = {
    clientId   = KOS.FullName("player") .. "-" .. now .. "-" .. GoopKOSDB.counter,
    name       = name,
    class      = class,
    level      = level,
    kind       = kind,
    note       = (note and note ~= "") and note or nil,
    zone       = GetZoneText(),
    occurredAt = now,
    reportedBy = KOS.FullName("player"),
  }

  table.insert(GoopKOSDB.incidents, entry)
  self.byClientId[entry.clientId] = entry

  if self.Broadcast then self:Broadcast(entry) end
  if self.RefreshNameplates then self:RefreshNameplates() end

  if kind == "revenge" then
    say("REVENGE! " .. name .. " got gooped back.")
  elseif kind == "killed_me" then
    say(name .. " killed you. Into the goop they go.")
  else
    say(name .. " got gooped.")
  end
end

local function prune()
  local cutoff = time() - PRUNE_DAYS * 86400
  local kept = {}
  for _, entry in ipairs(GoopKOSDB.incidents) do
    if (entry.occurredAt or 0) >= cutoff then kept[#kept + 1] = entry end
  end
  local dropped = #GoopKOSDB.incidents - #kept
  GoopKOSDB.incidents = kept
  if dropped > 0 then
    say(dropped .. " old splat" .. (dropped == 1 and "" or "s") .. " dried up (older than " .. PRUNE_DAYS .. " days)")
  end
end

-- No COMBAT_LOG_EVENT_UNFILTERED: Forever (Midnight rules) forbids addons
-- from registering it, and doing so shows the "blocked from an action"
-- popup the moment the UI loads. So deaths are not auto-logged.
local f = CreateFrame("Frame")
f:RegisterEvent("ADDON_LOADED")

f:SetScript("OnEvent", function(_, event, arg1)
  if event == "ADDON_LOADED" and arg1 == ADDON_NAME then
    GoopKOSDB = GoopKOSDB or {}
    GoopKOSDB.incidents = GoopKOSDB.incidents or {}
    GoopKOSDB.counter   = GoopKOSDB.counter or 0
    prune()
    KOS:ReindexIncidents()

    -- Site -> game: WebData.lua (written by the watcher, loaded before this
    -- file) carries web and Discord adds. Same clientId check as peer sync,
    -- so anything already held is skipped.
    local web = GoopKOSWebData and GoopKOSWebData.incidents
    if type(web) == "table" then
      local cutoff, added = time() - PRUNE_DAYS * 86400, 0
      for _, entry in ipairs(web) do
        if type(entry) == "table" and (entry.occurredAt or 0) >= cutoff and KOS:Merge(entry) then
          added = added + 1
        end
      end
      if added > 0 then
        say(added .. " fresh glob" .. (added == 1 and "" or "s") .. " oozed in from the website. /kos list to see who")
      end
    end
  end
end)

SLASH_GOOPKOS1 = "/kos"
SlashCmdList.GOOPKOS = function(msg)
  msg = msg and msg:match("^%s*(.-)%s*$") or ""

  if msg == "list" then
    KOS:PrintList()
    return
  end

  if msg == "recent" then
    KOS:ShowRecent("ganked")
    return
  end

  -- Probe: can addons read Blizzard's Death Recap here? Run right after dying.
  -- Your last few deaths from WoW's death recap, cleaned up: each name once
  -- with a count, split into enemy players, friendly players and mobs.
  if msg == "recap" or msg == "deaths" then
    local ids = KOS.RecapIds and KOS.RecapIds() or {}
    if #ids == 0 then
      say("no deaths on record yet. Lucky you.")
      return
    end
    local GROUPS = {
      { key = "enemy",    label = "|cffff4040enemy|r" },
      { key = "friendly", label = "|cff4fa3fffriendly|r" },
      { key = "unknown",  label = "|cffffd100player?|r" },
      { key = "mob",      label = "|cff9d9d9dmobs|r" },
    }
    say("your last " .. math.min(3, #ids) .. " death" .. (#ids == 1 and "" or "s") .. ", newest first:")
    for k = #ids, math.max(1, #ids - 2), -1 do
      local ok, events = pcall(C_DeathRecap.GetRecapEvents, ids[k])
      local byGroup, counts = {}, {}
      for _, ev in ipairs((ok and type(events) == "table") and events or {}) do
        local src = ev.sourceName
        local name = (src == nil) and "falling/environment"
          or ((issecretvalue and issecretvalue(src)) and "someone hidden" or tostring(src))
        local tag = KOS.RecapSourceTag(ev)
        local group = (src == nil and "mob") or (tag == "player, enemy" and "enemy")
          or (tag == "player" and "friendly") or (tag == "guid hidden" and "unknown") or "mob"
        byGroup[group] = byGroup[group] or {}
        if not counts[name] then
          counts[name] = 0
          table.insert(byGroup[group], name)
        end
        counts[name] = counts[name] + 1
      end
      local parts = {}
      for _, g in ipairs(GROUPS) do
        local names = byGroup[g.key]
        if names then
          local list = {}
          for _, n in ipairs(names) do
            list[#list + 1] = n .. (counts[n] > 1 and (" x" .. counts[n]) or "")
          end
          parts[#parts + 1] = g.label .. ": " .. table.concat(list, ", ")
        end
      end
      print("  " .. (#ids - k + 1) .. ". " .. (#parts > 0 and table.concat(parts, "  |cff666666·|r  ") or "nothing recorded"))
    end
    return
  end

  if msg == "plates off" or msg == "plates on" then
    GoopKOSDB.platesOff = (msg == "plates off") or nil
    say("nameplate badges " .. (GoopKOSDB.platesOff and "dried up (off)" or "gooey (on)") .. " — /reload to apply fully")
    if KOS.RefreshNameplates then KOS:RefreshNameplates() end
    return
  end

  if msg == "sync off" or msg == "sync on" then
    GoopKOSDB.syncOff = (msg == "sync off") or nil
    say("goop sharing " .. (GoopKOSDB.syncOff and "off" or "on") .. " — /reload to apply")
    return
  end

  if msg == "status" then
    local channel = KOS.SyncChannel and KOS:SyncChannel()
    say("splats: " .. #GoopKOSDB.incidents
      .. " | faction: " .. tostring(UnitFactionGroup("player"))
      .. " | guild: " .. tostring(GetGuildInfo("player"))
      .. " | sync channel: " .. (channel and ("goop channel #" .. channel) or "NOT in the goop channel"))
    return
  end

  -- /kos revenge (target) or /kos revenge Name [note]. "got" is the short form.
  local rest = msg:match("^revenge%s*(.*)$") or msg:match("^got%s*(.*)$")
  if rest then
    if rest == "" then
      KOS:LogRevenge(nil)
    else
      local name, note = splitNameAndNote(rest)
      if name and name ~= "" then KOS:Record(name, "revenge", note) end
    end
    return
  end

  if msg == "version" then
    say("you have GoopKOS " .. (KOS.VERSION or "?"))
    return
  end

  -- Manual add for someone you can't target, e.g. a friend without the addon
  -- reporting their ganker. No unit or GUID to check, so this skips the
  -- faction gate: typing the name out is the confirmation.
  if msg == "add" or msg:match("^add%s") then
    local name, note = splitNameAndNote(msg:match("^add%s+(.*)$") or "")
    if not name or name == "" then
      say('who are we gooping? /kos add Name [note]  or  /kos add "First Last" [note]')
      return
    end
    KOS:Record(name, "ganked", note)
    return
  end

  KOS:LogTarget(msg)
end
