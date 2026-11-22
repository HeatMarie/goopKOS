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
    if entry.name then names[entry.name:lower()] = true end
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

--- /kos with no name, or the "KOS my target" key binding.
function KOS:LogTarget(note)
  if not UnitExists("target") or not UnitIsPlayer("target") or not isEnemyFaction("target") then
    print("|cffff7a18KOS|r target an enemy player first, or use /kos recent, /kos add Name, /kos list")
    return
  end
  KOS:Record(KOS.FullName("target"), "ganked", note, "target")
end

-- Key bindings (Bindings.xml). Esc > Options > Keybindings > AddOns > GoopKOS.
BINDING_HEADER_GOOPKOS      = "GoopKOS"
BINDING_NAME_GOOPKOS_TARGET = "KOS my target"
BINDING_NAME_GOOPKOS_RECENT = "Show recent enemies"
function GoopKOS_KosTarget() KOS:LogTarget(nil) end
function GoopKOS_ShowRecent() KOS:ShowRecent("ganked") end

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

  print("|cffff7a18KOS|r " .. name .. " logged (" .. kind .. ")")
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
    print("|cffff7a18KOS|r pruned " .. dropped .. " entries older than " .. PRUNE_DAYS .. " days")
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
        print("|cffff7a18KOS|r " .. added .. " new from the website")
      end
    end
  end
end)

SLASH_GOOPKOS1 = "/kos"
SlashCmdList.GOOPKOS = function(msg)
  msg = msg and msg:match("^%s*(.-)%s*$") or ""

  if msg == "list" then
    print("|cffff7a18KOS|r " .. #GoopKOSDB.incidents .. " incidents on file")
    return
  end

  if msg == "recent" then
    KOS:ShowRecent("ganked")
    return
  end

  -- Probe: can addons read Blizzard's Death Recap here? Run right after dying.
  if msg == "recap" then
    if not C_DeathRecap then
      print("|cffff7a18KOS|r recap: C_DeathRecap does not exist in this client")
      return
    end
    local fns = {}
    for k in pairs(C_DeathRecap) do fns[#fns + 1] = tostring(k) end
    table.sort(fns)
    print("|cffff7a18KOS|r recap API: " .. table.concat(fns, ", "))
    local found = false
    for id = 1, 30 do
      local ok, events = pcall(C_DeathRecap.GetRecapEvents, id)
      if ok and type(events) == "table" and #events > 0 then
        found = true
        local seen = {}
        for i = 1, math.min(#events, 5) do
          local src = events[i].sourceName
          local secret = issecretvalue and issecretvalue(src)
          seen[#seen + 1] = secret and "<secret>" or tostring(src)
        end
        print("|cffff7a18KOS|r recap #" .. id .. " sources: " .. table.concat(seen, ", "))
      end
    end
    if not found then print("|cffff7a18KOS|r recap: no readable recap events") end
    return
  end

  if msg == "plates off" or msg == "plates on" then
    GoopKOSDB.platesOff = (msg == "plates off") or nil
    print("|cffff7a18KOS|r nameplate badges " .. (GoopKOSDB.platesOff and "OFF" or "ON") .. " — /reload to apply fully")
    if KOS.RefreshNameplates then KOS:RefreshNameplates() end
    return
  end

  if msg == "sync off" or msg == "sync on" then
    GoopKOSDB.syncOff = (msg == "sync off") or nil
    print("|cffff7a18KOS|r channel sync " .. (GoopKOSDB.syncOff and "OFF" or "ON") .. " — /reload to apply")
    return
  end

  if msg == "status" then
    local channel = KOS.SyncChannel and KOS:SyncChannel()
    print("|cffff7a18KOS|r incidents: " .. #GoopKOSDB.incidents
      .. " | faction: " .. tostring(UnitFactionGroup("player"))
      .. " | guild: " .. tostring(GetGuildInfo("player"))
      .. " | sync channel: " .. (channel and ("joined (#" .. channel .. ")") or "NOT joined"))
    return
  end

  -- Manual add for someone you can't target, e.g. a friend without the addon
  -- reporting their ganker. No unit or GUID to check, so this skips the
  -- faction gate: typing the name out is the confirmation.
  if msg == "add" or msg:match("^add%s") then
    local name, note = splitNameAndNote(msg:match("^add%s+(.*)$") or "")
    if not name or name == "" then
      print('|cffff7a18KOS|r usage: /kos add Name [note]  or  /kos add "First Last" [note]')
      return
    end
    KOS:Record(name, "ganked", note)
    return
  end

  KOS:LogTarget(msg)
end
