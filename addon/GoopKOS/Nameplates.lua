local ADDON_NAME, KOS = ...

-- The payoff: anyone on the list gets a [KOS] badge over their nameplate,
-- so you never have to read the list while you are playing.
--
-- The badge is our own frame on the base nameplate, not a tweak to whatever
-- draws the health bar. Nameplate addons (EllesmereUI, Plater, ElvUI...)
-- replace or hide the default UnitFrame but still anchor to the base plate,
-- so this works with or without them.
--
-- Never write fields onto Blizzard's plate frames (plate.foo = ...) or call
-- setters on their regions. That taints them, and the next time Blizzard's
-- own code uses the plate for a protected action the game blocks it and
-- blames GoopKOS with the "blocked from an action" popup. Our badges live
-- in our own table, keyed by plate.

local BADGE_TEXT = "[KOS]"
local BADGE_SIZE = 14
local BADGE_Y    = 4     -- raise this if the badge sits on top of the name
local COLOR      = { 1.0, 0.48, 0.09 }

local names  = {}
local badges = setmetatable({}, { __mode = "k" })

local function enabled()
  return not (GoopKOSDB and GoopKOSDB.platesOff)
end

local function badgeFor(plate)
  if badges[plate] then return badges[plate] end

  local badge = CreateFrame("Frame", nil, plate)
  badge:SetSize(1, 1)
  badge:SetPoint("BOTTOM", plate, "TOP", 0, BADGE_Y)
  badge:SetFrameLevel(plate:GetFrameLevel() + 100)

  local text = badge:CreateFontString(nil, "OVERLAY")
  text:SetFont(STANDARD_TEXT_FONT, BADGE_SIZE, "OUTLINE")
  text:SetTextColor(COLOR[1], COLOR[2], COLOR[3])
  text:SetText(BADGE_TEXT)
  text:SetPoint("BOTTOM")

  badge:Hide()
  badges[plate] = badge
  return badge
end

function KOS:IsOnList(unit)
  local name = KOS.FullName(unit)
  if not name or (issecretvalue and issecretvalue(name)) then return false end
  return names[name:lower()] or false
end

function KOS:DecorateNameplate(unit)
  if not enabled() then return end
  local plate = C_NamePlate.GetNamePlateForUnit(unit)
  if not plate then return end
  -- Plates are recycled between units, so always set the state both ways.
  badgeFor(plate):SetShown(KOS:IsOnList(unit))
end

function KOS:RefreshNameplates()
  names = self:ActiveNames()
  if not enabled() then
    for _, badge in pairs(badges) do badge:Hide() end
    return
  end
  for _, plate in ipairs(C_NamePlate.GetNamePlates() or {}) do
    local unit = plate.namePlateUnitToken or (plate.UnitFrame and plate.UnitFrame.unit)
    if unit then KOS:DecorateNameplate(unit) end
  end
end

local f = CreateFrame("Frame")
f:RegisterEvent("PLAYER_LOGIN")
f:RegisterEvent("NAME_PLATE_UNIT_ADDED")
f:RegisterEvent("NAME_PLATE_UNIT_REMOVED")

f:SetScript("OnEvent", function(_, event, unit)
  if event == "PLAYER_LOGIN" then
    KOS:RefreshNameplates()
  elseif event == "NAME_PLATE_UNIT_ADDED" and unit then
    KOS:DecorateNameplate(unit)
  elseif event == "NAME_PLATE_UNIT_REMOVED" and unit then
    local plate = C_NamePlate.GetNamePlateForUnit(unit)
    if plate and badges[plate] then badges[plate]:Hide() end
  end
end)
