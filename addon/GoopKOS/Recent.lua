local ADDON_NAME, KOS = ...

-- Remembers the enemy players you've recently seen (target, mouseover,
-- nameplates) so you can log one with a click instead of typing a name.
-- When you die the window opens on its own: the killer is almost always
-- someone you just saw. Forever forbids the combat log, so this is the
-- closest we get to "who killed me".
--
-- Only our own frames and unit queries here; nothing touches the combat log
-- or Blizzard's frames.

local KEEP         = 8     -- enemies remembered / buttons in the window
local DEATH_WINDOW = 120   -- after a death, offer enemies seen in the last N seconds
local ORANGE       = "|cffff7a18"

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

local function label(e)
  local text = e.name .. (e.level and ("  (" .. e.level .. ")") or "")
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
  win.empty:SetText("No enemy players seen yet")
  win:Hide()
end

--- Open the window. kind is what a click logs ("ganked" or "killed_me").
--- maxAge limits it to enemies seen in the last N seconds. Returns how many
--- are shown; with none and a maxAge, the window stays closed.
function KOS:ShowRecent(kind, maxAge)
  if not win then build() end
  win.kind = kind
  win.heading:SetText(ORANGE .. (kind == "killed_me" and "Who killed you?" or "Add to KOS") .. "|r")

  local now, n = time(), 0
  for _, e in ipairs(recent) do
    if not maxAge or (now - e.at) <= maxAge then
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

local f = CreateFrame("Frame")
f:RegisterEvent("PLAYER_TARGET_CHANGED")
f:RegisterEvent("UPDATE_MOUSEOVER_UNIT")
f:RegisterEvent("NAME_PLATE_UNIT_ADDED")
f:RegisterEvent("PLAYER_DEAD")

f:SetScript("OnEvent", function(_, event, unit)
  if event == "PLAYER_TARGET_CHANGED" then
    remember("target")
  elseif event == "UPDATE_MOUSEOVER_UNIT" then
    remember("mouseover")
  elseif event == "NAME_PLATE_UNIT_ADDED" and unit then
    remember(unit)
  elseif event == "PLAYER_DEAD" then
    KOS:ShowRecent("killed_me", DEATH_WINDOW)
  end
end)
