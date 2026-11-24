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

-- Look: flat dark panel, thin green line on top, same palette as the site.
local FLAT = "Interface\\Buttons\\WHITE8x8"
local WIDTH, ROW_H, HEAD_H = 280, 28, 34
local ORANGE = "|cffff8a3d"   -- site --accent-3
local TITLE  = "|cfff3f0ff"   -- site --text
local CYAN   = "|cff2de2ff"   -- site --accent-2
-- Site palette as 0-1 floats: --bg, --field, --line, --accent, --accent-2, --text-3.
local C_BG, C_FIELD, C_LINE = { 0.04, 0.035, 0.12 }, { 0.086, 0.075, 0.216 }, { 0.165, 0.141, 0.322 }
local C_PINK, C_CYAN, C_DIM = { 1, 0.184, 0.706 }, { 0.176, 0.886, 1 }, { 0.635, 0.612, 0.769 }

--- A draggable dark panel with a green top line, a title and a close X.
local function makePanel(globalName, width, height, title)
  local p = CreateFrame("Frame", globalName, UIParent, "BackdropTemplate")
  p:SetSize(width, height)
  p:SetFrameStrata("DIALOG")
  p:SetClampedToScreen(true)
  p:SetMovable(true)
  p:EnableMouse(true)
  p:RegisterForDrag("LeftButton")
  p:SetScript("OnDragStart", p.StartMoving)
  p:SetScript("OnDragStop", p.StopMovingOrSizing)
  p:SetBackdrop({ bgFile = FLAT, edgeFile = FLAT, edgeSize = 1 })
  p:SetBackdropColor(C_BG[1], C_BG[2], C_BG[3], 0.96)
  p:SetBackdropBorderColor(C_LINE[1], C_LINE[2], C_LINE[3], 1)

  local line = p:CreateTexture(nil, "ARTWORK")
  line:SetColorTexture(C_PINK[1], C_PINK[2], C_PINK[3], 1)
  line:SetPoint("TOPLEFT", 1, -1)
  line:SetPoint("TOPRIGHT", -1, -1)
  line:SetHeight(2)

  p.title = p:CreateFontString(nil, "OVERLAY", "GameFontNormalLarge")
  p.title:SetPoint("TOPLEFT", 12, -11)
  p.title:SetText(title or "")

  local x = CreateFrame("Button", nil, p)
  x:SetSize(22, 22)
  x:SetPoint("TOPRIGHT", -5, -6)
  x.label = x:CreateFontString(nil, "OVERLAY", "GameFontNormal")
  x.label:SetPoint("CENTER")
  x.label:SetText("x")
  x.label:SetTextColor(C_DIM[1], C_DIM[2], C_DIM[3])
  x:SetScript("OnEnter", function(self) self.label:SetTextColor(1, 0.3, 0.43) end)   -- --danger
  x:SetScript("OnLeave", function(self) self.label:SetTextColor(C_DIM[1], C_DIM[2], C_DIM[3]) end)
  x:SetScript("OnClick", function() p:Hide() end)

  if globalName then tinsert(UISpecialFrames, globalName) end  -- Esc closes it
  return p
end

--- A flat button: dark fill, coloured text, lights up under the mouse.
local function flatButton(parent, text, r, g, b)
  local btn = CreateFrame("Button", nil, parent, "BackdropTemplate")
  btn:SetBackdrop({ bgFile = FLAT, edgeFile = FLAT, edgeSize = 1 })
  btn:SetBackdropColor(C_FIELD[1], C_FIELD[2], C_FIELD[3], 1)
  btn:SetBackdropBorderColor(r * 0.7, g * 0.7, b * 0.7, 1)
  btn.label = btn:CreateFontString(nil, "OVERLAY", "GameFontNormal")
  btn.label:SetPoint("CENTER")
  btn.label:SetText(text)
  btn.label:SetTextColor(r, g, b)
  btn:SetScript("OnEnter", function(self) self:SetBackdropColor(r * 0.25, g * 0.25, b * 0.25, 1) end)
  btn:SetScript("OnLeave", function(self) self:SetBackdropColor(C_FIELD[1], C_FIELD[2], C_FIELD[3], 1) end)
  return btn
end

local win

local function build()
  win = makePanel("GoopKOSRecentWindow", WIDTH, HEAD_H + 8 + KEEP * ROW_H, "")
  win:SetPoint("CENTER", 0, 140)

  win.buttons = {}
  for i = 1, KEEP do
    local b = CreateFrame("Button", nil, win)
    b:SetSize(WIDTH - 16, ROW_H - 3)
    b:SetPoint("TOP", 0, -HEAD_H - (i - 1) * ROW_H)

    b.bg = b:CreateTexture(nil, "BACKGROUND")
    b.bg:SetAllPoints()
    b.bg:SetColorTexture(C_FIELD[1], C_FIELD[2], C_FIELD[3], 1)

    b.hl = b:CreateTexture(nil, "HIGHLIGHT")
    b.hl:SetAllPoints()
    b.hl:SetColorTexture(C_CYAN[1], C_CYAN[2], C_CYAN[3], 0.16)

    b.stripe = b:CreateTexture(nil, "ARTWORK")   -- class colour
    b.stripe:SetPoint("TOPLEFT")
    b.stripe:SetPoint("BOTTOMLEFT")
    b.stripe:SetWidth(3)

    b.level = b:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
    b.level:SetPoint("RIGHT", -8, 0)
    b.level:SetJustifyH("RIGHT")

    b.tag = b:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
    b.tag:SetPoint("RIGHT", b.level, "LEFT", -8, 0)

    b.name = b:CreateFontString(nil, "OVERLAY", "GameFontHighlight")
    b.name:SetPoint("LEFT", 12, 0)
    b.name:SetPoint("RIGHT", b.tag, "LEFT", -6, 0)
    b.name:SetJustifyH("LEFT")
    b.name:SetWordWrap(false)

    b:SetScript("OnClick", function(self)
      KOS:Record(self.entry.name, win.kind, nil, nil, nil, self.entry)
      win:Hide()
    end)
    win.buttons[i] = b
  end

  win.empty = win:CreateFontString(nil, "OVERLAY", "GameFontDisable")
  win.empty:SetPoint("TOP", 0, -HEAD_H - 14)
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
  win.title:SetText(TITLE .. (kind == "killed_me" and "Who Killed You?" or "Goop someone") .. "|r")

  local now, n, shown = time(), 0, {}
  local list = {}
  for _, e in ipairs(first or {}) do
    -- Recap entries come from a GUID and have no level; borrow it (and the
    -- class, if missing) from the same player in the recently-seen list.
    if not e.level or not e.class then
      local key = e.name:lower()
      for _, r in ipairs(recent) do
        if r.name:lower() == key then
          e.level = e.level or r.level
          e.class = e.class or r.class
          break
        end
      end
    end
    list[#list + 1] = e
  end
  for _, e in ipairs(recent) do list[#list + 1] = e end
  for _, e in ipairs(list) do
    if n < KEEP and not shown[e.name:lower()] and (not maxAge or (now - e.at) <= maxAge) then
      shown[e.name:lower()] = true
      n = n + 1
      local b = win.buttons[n]
      b.entry = e
      local c = e.class and RAID_CLASS_COLORS and RAID_CLASS_COLORS[e.class]
      if c then
        b.stripe:SetColorTexture(c.r, c.g, c.b, 1)
        b.name:SetTextColor(c.r, c.g, c.b)
      else
        b.stripe:SetColorTexture(0.5, 0.5, 0.5, 1)
        b.name:SetTextColor(1, 1, 1)
      end
      b.name:SetText(e.name)
      b.tag:SetText(e.hitYou and (ORANGE .. "hit you|r") or "")
      b.level:SetText(e.level and ("|cffa29cc4" .. e.level .. "|r") or "|cff5a5580?|r")
      b:Show()
    end
  end
  for i = n + 1, KEEP do win.buttons[i]:Hide() end
  win.empty:SetShown(n == 0)
  win:SetHeight(HEAD_H + 8 + math.max(n, 2) * ROW_H)

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
  prompt = makePanel("GoopKOSRevengePrompt", WIDTH, 106, CYAN .. "Revenge?|r")
  prompt:SetPoint("CENTER", 0, 240)

  prompt.text = prompt:CreateFontString(nil, "OVERLAY", "GameFontNormal")
  prompt.text:SetPoint("TOP", 0, -38)
  prompt.text:SetWidth(WIDTH - 24)

  local yes = flatButton(prompt, "Got 'em!", C_CYAN[1], C_CYAN[2], C_CYAN[3])
  yes:SetSize(124, 26)
  yes:SetPoint("BOTTOMLEFT", 12, 12)
  yes:SetScript("OnClick", function()
    local e = prompt.entry
    prompt:Hide()
    if e then KOS:Record(e.name, "revenge", nil, nil, nil, e) end
  end)

  local no = flatButton(prompt, "Not me", C_DIM[1], C_DIM[2], C_DIM[3])
  no:SetSize(124, 26)
  no:SetPoint("BOTTOMRIGHT", -12, 12)
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

-- Battlegrounds and arenas: everyone is an enemy and deaths are constant, so
-- no tracking, death window or revenge prompt there. /kos recent still works.
local function inPvPInstance()
  local _, kind = IsInInstance()
  return kind == "pvp" or kind == "arena"
end

f:SetScript("OnEvent", function(_, event, unit)
  if inPvPInstance() then return end
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
