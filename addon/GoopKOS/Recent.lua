local ADDON_NAME, KOS = ...

-- Remembers the enemy players you've recently seen (target, mouseover, focus,
-- soft target, party targets, nameplates) so you can log one with a click
-- instead of typing a name.
-- When you die the window opens on its own: the killer is almost always
-- someone you just saw. Forever forbids the combat log, so this is the
-- closest we get to "who killed me".
--
-- Only our own frames and unit queries here; nothing touches the combat log
-- or Blizzard's frames.

local KEEP         = 8     -- enemies remembered / buttons in the window
local DEATH_WINDOW = 180   -- after a death, offer enemies seen in the last N seconds
local GOOP_GREEN   = "|cff7dff3a"

local recent = {}   -- newest first: { name, class, level, at }

local function remember(unit)
  if not UnitExists(unit) or not UnitIsPlayer(unit) or not KOS.IsEnemyFaction(unit) then return end
  local name = KOS.FullName(unit)
  if not name or (issecretvalue and issecretvalue(name)) then return end

  local _, class = UnitClass(unit)
  local level = UnitLevel(unit)
  if level == -1 then level = nil end

  local key = name:lower()
  for i = #recent, 1, -1 do
    if recent[i].name:lower() == key then table.remove(recent, i) end
  end
  table.insert(recent, 1, { name = name, class = class, level = level, at = time() })
  while #recent > KEEP do table.remove(recent) end
end

function KOS:RecentEnemies()
  return recent
end

-- Death recap: the "killed by" breakdown WoW keeps for your last death. It
-- lists everyone who hit you, so a Horde player shows up even when the
-- monster you were fighting landed the killing blow. Forever may hide some
-- or all of it (secret values, or no C_DeathRecap at all); anything we
-- can't read is skipped and the window falls back on who we saw.
local lastRecap = 0

local function readable(v)
  return v ~= nil and not (issecretvalue and issecretvalue(v))
end

--- Recap ids that still have events, oldest first. Ids keep counting up
--- across deaths and WoW drops old ones (seen in game: 1-17 empty, 18-30+
--- filled), so scan from a little before the newest we know of until a long
--- run of empty ids.
function KOS.RecapIds()
  local ids = {}
  if not C_DeathRecap or not C_DeathRecap.GetRecapEvents then return ids end
  local empty = 0
  for id = math.max(1, lastRecap - 40), lastRecap + 2000 do
    local ok, ev = pcall(C_DeathRecap.GetRecapEvents, id)
    if ok and type(ev) == "table" and #ev > 0 then
      ids[#ids + 1] = id
      empty = 0
    else
      empty = empty + 1
      if #ids > 0 and empty >= 25 then break end
    end
  end
  if ids[#ids] then lastRecap = ids[#ids] end
  return ids
end

--- "player, enemy" / "player" / nil for a recap event source, for /kos recap.
function KOS.RecapSourceTag(e)
  local guid = e.sourceGUID
  if not readable(guid) or type(guid) ~= "string" then return "guid hidden" end
  if not guid:match("^Player%-") then return nil end
  return KOS.IsEnemyFaction(nil, guid) and "player, enemy" or "player"
end

local function recapEnemies()
  local out = {}
  if not C_DeathRecap or not C_DeathRecap.GetRecapEvents then return out end

  local ids = KOS.RecapIds()
  local newest = ids[#ids]
  if not newest then return out end
  local ok, events = pcall(C_DeathRecap.GetRecapEvents, newest)
  if not ok or type(events) ~= "table" then return out end

  local seen = {}
  for _, e in ipairs(events) do
    local guid, name = e.sourceGUID, e.sourceName
    if readable(guid) and readable(name) and type(guid) == "string" and guid:match("^Player%-")
      and KOS.IsEnemyFaction(nil, guid) and not seen[name:lower()] then
      seen[name:lower()] = true
      local ok, _, class = pcall(GetPlayerInfoByGUID, guid)
      out[#out + 1] = { name = name, class = ok and class or nil, hitYou = true, at = time() }
    end
  end
  return out
end

local function label(e)
  local text = e.name .. (e.level and ("  (" .. e.level .. ")") or "") .. (e.hitYou and "  - hit you" or "")
  local c = e.class and RAID_CLASS_COLORS and RAID_CLASS_COLORS[e.class]
  if c and c.colorStr then return "|c" .. c.colorStr .. text .. "|r" end
  return text
end

local win

local function build()
  win = CreateFrame("Frame", nil, UIParent, "BasicFrameTemplateWithInset")
  win:SetSize(270, 48 + KEEP * 26)
  win:SetPoint("CENTER", 0, 140)
  win:SetFrameStrata("DIALOG")
  win:SetMovable(true)
  win:EnableMouse(true)
  win:RegisterForDrag("LeftButton")
  win:SetScript("OnDragStart", win.StartMoving)
  win:SetScript("OnDragStop", win.StopMovingOrSizing)

  win.heading = win:CreateFontString(nil, "OVERLAY", "GameFontHighlight")
  win.heading:SetPoint("TOP", 0, -5)

  win.buttons = {}
  for i = 1, KEEP do
    local b = CreateFrame("Button", nil, win, "UIPanelButtonTemplate")
    b:SetSize(240, 22)
    b:SetPoint("TOP", 0, -32 - (i - 1) * 26)
    b:SetScript("OnClick", function(self)
      KOS:Record(self.entry.name, win.kind, nil, nil, nil, self.entry)
      win:Hide()
    end)
    win.buttons[i] = b
  end

  win.empty = win:CreateFontString(nil, "OVERLAY", "GameFontDisable")
  win.empty:SetPoint("CENTER")
  win.empty:SetText("No enemies seen yet. The goop waits.")
  win:Hide()
end

--- Open the window. kind is what a click logs ("ganked" or "killed_me").
--- maxAge limits it to enemies seen in the last N seconds. Returns how many
--- are shown; with none and a maxAge, the window stays closed. first: extra
--- entries (from the death recap) listed ahead of the ones we saw.
function KOS:ShowRecent(kind, maxAge, first)
  if not win then build() end
  win.kind = kind
  win.heading:SetText(GOOP_GREEN .. (kind == "killed_me" and "Who gooped you?" or "Goop someone") .. "|r")

  local now, n, shown = time(), 0, {}
  local list = {}
  for _, e in ipairs(first or {}) do list[#list + 1] = e end
  for _, e in ipairs(recent) do list[#list + 1] = e end
  for _, e in ipairs(list) do
    if n < KEEP and not shown[e.name:lower()] and (not maxAge or (now - e.at) <= maxAge) then
      shown[e.name:lower()] = true
      n = n + 1
      local b = win.buttons[n]
      b.entry = e
      b:SetText(label(e))
      b:Show()
    end
  end
  for i = n + 1, KEEP do win.buttons[i]:Hide() end
  win.empty:SetShown(n == 0)

  if n == 0 and maxAge then
    win:Hide()
  else
    win:Show()
  end
  return n
end

-- Revenge prompt. When someone on the list drops dead near you while you're
-- in a fight, ask. Never auto-log: a groupmate or a guard may have done it,
-- and only you know. Unit queries only, same as above; no combat log.
local REVENGE_COMBAT = 15    -- seconds after leaving combat that a death still counts
local lastFight, asked, prompt = 0, {}, nil

local function buildPrompt()
  prompt = CreateFrame("Frame", nil, UIParent, "BasicFrameTemplateWithInset")
  prompt:SetSize(270, 100)
  prompt:SetPoint("CENTER", 0, 240)
  prompt:SetFrameStrata("DIALOG")
  prompt:SetMovable(true)
  prompt:EnableMouse(true)
  prompt:RegisterForDrag("LeftButton")
  prompt:SetScript("OnDragStart", prompt.StartMoving)
  prompt:SetScript("OnDragStop", prompt.StopMovingOrSizing)

  prompt.heading = prompt:CreateFontString(nil, "OVERLAY", "GameFontHighlight")
  prompt.heading:SetPoint("TOP", 0, -5)
  prompt.heading:SetText(GOOP_GREEN .. "Revenge?|r")

  prompt.text = prompt:CreateFontString(nil, "OVERLAY", "GameFontNormal")
  prompt.text:SetPoint("TOP", 0, -34)
  prompt.text:SetWidth(250)

  local yes = CreateFrame("Button", nil, prompt, "UIPanelButtonTemplate")
  yes:SetSize(118, 24)
  yes:SetPoint("BOTTOMLEFT", 12, 10)
  yes:SetText("Got 'em!")
  yes:SetScript("OnClick", function()
    local e = prompt.entry
    prompt:Hide()
    if e then KOS:Record(e.name, "revenge", nil, nil, nil, e) end
  end)

  local no = CreateFrame("Button", nil, prompt, "UIPanelButtonTemplate")
  no:SetSize(118, 24)
  no:SetPoint("BOTTOMRIGHT", -12, 10)
  no:SetText("Not me")
  no:SetScript("OnClick", function() prompt:Hide() end)
end

local function checkRevenge(unit)
  if not unit or not UnitExists(unit) or not UnitIsPlayer(unit) then return end
  local dead = UnitIsDeadOrGhost(unit)
  if issecretvalue and issecretvalue(dead) then return end
  if not dead or not KOS.IsEnemyFaction(unit) then return end
  if not UnitAffectingCombat("player") and time() - lastFight > REVENGE_COMBAT then return end

  local name = KOS.FullName(unit)
  if not name or (issecretvalue and issecretvalue(name)) then return end
  local key = name:lower()
  if not KOS:ActiveNames()[key] then return end
  if asked[key] and time() - asked[key] < 120 then return end
  asked[key] = time()

  local _, class = UnitClass(unit)
  local level = UnitLevel(unit)
  if level == -1 then level = nil end
  local e = { name = name, class = class, level = level }

  if not prompt then buildPrompt() end
  prompt.entry = e
  prompt.text:SetText(label(e) .. " is down!")
  prompt:Show()
  C_Timer.After(30, function()
    if prompt.entry == e then prompt:Hide() end
  end)
end

local f = CreateFrame("Frame")
f:RegisterEvent("PLAYER_REGEN_DISABLED")
f:RegisterEvent("PLAYER_REGEN_ENABLED")
f:RegisterEvent("UNIT_HEALTH")
f:RegisterEvent("PLAYER_TARGET_CHANGED")
f:RegisterEvent("UPDATE_MOUSEOVER_UNIT")
f:RegisterEvent("NAME_PLATE_UNIT_ADDED")
f:RegisterEvent("PLAYER_DEAD")
f:RegisterEvent("PLAYER_FOCUS_CHANGED")
f:RegisterEvent("UNIT_TARGET")
-- Soft targeting (action targeting) only exists in newer clients; an unknown
-- event name errors, so ask nicely.
pcall(f.RegisterEvent, f, "PLAYER_SOFT_ENEMY_CHANGED")

f:SetScript("OnEvent", function(_, event, unit)
  if event == "PLAYER_REGEN_DISABLED" or event == "PLAYER_REGEN_ENABLED" then
    lastFight = time()
  elseif event == "UNIT_HEALTH" then
    if unit and unit:match("^nameplate%d+$") then
      -- Anyone whose health is changing near you is in a fight near you:
      -- keep them fresh in the list, not just from when their plate appeared.
      remember(unit)
      checkRevenge(unit)
    elseif unit == "target" then
      checkRevenge(unit)
    end
  elseif event == "PLAYER_TARGET_CHANGED" then
    remember("target")
    checkRevenge("target")
  elseif event == "UPDATE_MOUSEOVER_UNIT" then
    remember("mouseover")
  elseif event == "NAME_PLATE_UNIT_ADDED" and unit then
    remember(unit)
  elseif event == "PLAYER_FOCUS_CHANGED" then
    remember("focus")
  elseif event == "PLAYER_SOFT_ENEMY_CHANGED" then
    remember("softenemy")
  elseif event == "UNIT_TARGET" then
    -- What your party or raid is targeting: they may see the ganker first.
    if unit and (unit:match("^party%d$") or unit:match("^raid%d+$")) then remember(unit .. "target") end
  elseif event == "PLAYER_DEAD" then
    -- Last look at every plate still up, then give the recap a moment to fill.
    for i = 1, 40 do remember("nameplate" .. i) end
    C_Timer.After(0.5, function()
      local ok, hitters = pcall(recapEnemies)
      KOS:ShowRecent("killed_me", DEATH_WINDOW, ok and hitters or nil)
    end)
  end
end)
