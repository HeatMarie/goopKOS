local ADDON_NAME, KOS = ...

-- Click or hover a player and see whether they are on the KOS list:
--  * their mouseover tooltip gets a "KOS list" line
--  * targeting someone on the list prints one chat line (once per person
--    per minute, so tabbing around doesn't spam you)
--
-- Read-only: we only add a line to the tooltip text and print to chat. No
-- fields are written onto Blizzard frames (see Nameplates.lua on taint).

local TARGET_COOLDOWN = 60
local COLOR = "|cffff7a18"

local function lastSeen(t)
  local s = time() - (t or 0)
  if s < 3600 then return math.max(1, math.floor(s / 60)) .. "m ago" end
  if s < 86400 then return math.floor(s / 3600) .. "h ago" end
  return math.floor(s / 86400) .. "d ago"
end

--- One-line description used by both the tooltip and the target message.
function KOS:DescribeListed(r)
  return r.count .. (r.count == 1 and " report" or " reports")
    .. (r.last and r.last > 0 and (", last " .. lastSeen(r.last)) or "")
    .. (r.zone and (" in " .. r.zone) or "")
end

local function unitResult(unit)
  if not unit or not UnitExists(unit) or not UnitIsPlayer(unit) then return nil end
  local name = KOS.FullName(unit)
  if not name or (issecretvalue and issecretvalue(name)) then return nil end
  return KOS:Lookup(name)
end

KOS.tip = { mode = "none", fired = 0, unit = nil, name = nil, found = nil, err = nil }

local function onTooltip(tooltip)
  if tooltip ~= GameTooltip then return end
  local tip = KOS.tip
  tip.fired = tip.fired + 1
  local ok, _, unit = pcall(tooltip.GetUnit, tooltip)
  if not ok or not unit or (issecretvalue and issecretvalue(unit)) then unit = nil end
  -- The tooltip may not hand back a unit token; the mouse is over one then.
  if not unit and UnitExists("mouseover") then unit = "mouseover" end
  tip.unit = unit
  if not unit then return end
  tip.name = unit and UnitExists(unit) and KOS.FullName(unit) or nil
  local r = unitResult(unit)
  tip.found = r and true or false
  if r then
    tooltip:AddLine(COLOR .. "KOS list: " .. KOS:DescribeListed(r) .. "|r")
    tooltip:Show()
  elseif UnitExists(unit) and UnitIsPlayer(unit) and KOS.IsEnemyFaction(unit) then
    -- Say so for enemies, so a missing line can't mean "addon not working".
    tooltip:AddLine("|cff9d9d9dNot on KOS list|r")
    tooltip:Show()
  end
end

if TooltipDataProcessor and TooltipDataProcessor.AddTooltipPostCall and Enum and Enum.TooltipDataType then
  KOS.tip.mode = "TooltipDataProcessor"
  TooltipDataProcessor.AddTooltipPostCall(Enum.TooltipDataType.Unit, onTooltip)
elseif GameTooltip and GameTooltip.HookScript then
  KOS.tip.mode = "OnTooltipSetUnit"
  GameTooltip:HookScript("OnTooltipSetUnit", onTooltip)
end

local warned = {}
local f = CreateFrame("Frame")
f:RegisterEvent("PLAYER_TARGET_CHANGED")
f:SetScript("OnEvent", function()
  local r = unitResult("target")
  if not r then return end
  local key = r.name:lower()
  if warned[key] and time() - warned[key] < TARGET_COOLDOWN then return end
  warned[key] = time()
  KOS.Say(r.name .. " is on the KOS list: " .. KOS:DescribeListed(r))
end)

-- Right-click a player > "Add to KOS list". Uses Blizzard's supported menu
-- hook (Menu.ModifyMenu), which only appends an entry and doesn't touch the
-- unit frames. Only offered for enemy-faction players, like /kos on a target.
local MENU_TAGS = {
  "MENU_UNIT_PLAYER", "MENU_UNIT_ENEMY_PLAYER", "MENU_UNIT_TARGET",
  "MENU_UNIT_FOCUS", "MENU_UNIT_PARTY", "MENU_UNIT_RAID_PLAYER",
}

local function addMenuEntry(owner, root, contextData)
  local unit = contextData and contextData.unit
  if not unit or not UnitExists(unit) or not UnitIsPlayer(unit) then return end
  if UnitIsUnit and UnitIsUnit(unit, "player") then return end
  if not KOS.IsEnemyFaction(unit) then return end
  local name = KOS.FullName(unit)
  if not name or (issecretvalue and issecretvalue(name)) then return end

  KOS.menuBuilt = (KOS.menuBuilt or 0) + 1
  local listed = KOS:Lookup(name)
  root:CreateDivider()
  root:CreateTitle("GoopKOS")
  root:CreateButton(listed and "Add another KOS report" or "Add to KOS list", function()
    KOS:Record(name, "ganked", nil, unit)
  end)
end

if Menu and Menu.ModifyMenu then
  for _, tag in ipairs(MENU_TAGS) do
    pcall(Menu.ModifyMenu, tag, addMenuEntry)
  end
end
