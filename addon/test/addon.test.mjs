// Runs the real addon Lua (Capture.lua, Tooltip.lua) in a Lua interpreter with
// a tiny fake WoW API, so "is this player on the list?" is tested for real.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import fengari from "fengari";

const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;
const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "GoopKOS");
const src = (f) => readFileSync(join(dir, f), "utf8");

const PRELUDE = `
  printed = {}
  function print(...)
    local t = {}
    for i = 1, select("#", ...) do t[#t + 1] = tostring((select(i, ...))) end
    printed[#printed + 1] = (table.concat(t, " "):gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", ""))
  end

  now = 1000000
  function time() return now end

  -- units[token] = { name=, faction=, player= }
  units = { player = { name = "Me Myself", faction = "Alliance" } }
  function UnitExists(u) return units[u] ~= nil end
  function UnitIsPlayer(u) return units[u] and units[u].player ~= false end
  function GetUnitName(u) return units[u] and units[u].name end
  function UnitName(u) return units[u] and units[u].name end
  function UnitFactionGroup(u) return u == "player" and "Alliance" or (units[u] and units[u].faction) end
  function UnitClass() return "Rogue", "ROGUE" end
  function UnitLevel() return 60 end
  function GetZoneText() return "Barrens" end

  handlers = {}
  function CreateFrame()
    local f = {}
    function f:RegisterEvent() end
    function f:SetScript(kind, fn) handlers[#handlers + 1] = { kind = kind, fn = fn } end
    function f:HookScript() end
    return f
  end
  SlashCmdList = {}

  tooltipLines = {}
  GameTooltip = {
    tooltipUnit = nil,
    GetUnit = function(self) return "x", self.tooltipUnit end,
    AddLine = function(self, text) tooltipLines[#tooltipLines + 1] = text end,
    Show = function() end,
  }
  local hooks = {}
  function GameTooltip:HookScript(kind, fn) hooks[kind] = fn end
  function runTooltip() hooks.OnTooltipSetUnit(GameTooltip) end

  -- Fake Menu.ModifyMenu: remember the callbacks, let tests right-click.
  menuHooks = {}
  Menu = { ModifyMenu = function(tag, fn) menuHooks[tag] = fn end }
  function UnitIsUnit(a, b) return units[a] ~= nil and units[a] == units[b] end
  function rightClick(tag, unit)
    menuItems = {}
    local root = {
      CreateDivider = function() end,
      CreateTitle = function() end,
      CreateButton = function(_, label, fn) menuItems[#menuItems + 1] = { label = label, fn = fn } end,
    }
    menuHooks[tag](nil, root, { unit = unit })
  end

  function loadAddonFile(code, name)
    local fn = assert(load(code, name))
    fn("GoopKOS", KOS)
  end
`;

function boot() {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  const run = (code, name = "chunk") => {
    const status = lauxlib.luaL_loadbuffer(L, to_luastring(code), code.length, to_luastring(name));
    if (status !== lua.LUA_OK || lua.lua_pcall(L, 0, lua.LUA_MULTRET, 0) !== lua.LUA_OK) {
      throw new Error(to_jsstring(lua.lua_tostring(L, -1)));
    }
  };
  const getGlobalJson = (expr) => {
    run(`__out = (function() local t = ${expr}; return type(t) == "table" and #t or tostring(t) end)()`);
    lua.lua_getglobal(L, to_luastring("__out"));
    const v = lua.lua_isnumber(L, -1) ? lua.lua_tonumber(L, -1) : to_jsstring(lua.lua_tostring(L, -1));
    lua.lua_pop(L, 1);
    return v;
  };
  const printed = () => {
    const out = [];
    const n = getGlobalJson("printed");
    for (let i = 1; i <= n; i++) {
      run(`__s = printed[${i}]`);
      lua.lua_getglobal(L, to_luastring("__s"));
      out.push(to_jsstring(lua.lua_tostring(L, -1)));
      lua.lua_pop(L, 1);
    }
    return out;
  };

  run(PRELUDE, "prelude");
  run(`GoopKOSDB = { incidents = {}, counter = 0 }; KOS = {}`);
  // Files get their own chunk each; they take (ADDON_NAME, KOS) as varargs.
  for (const f of ["Capture.lua", "Tooltip.lua"]) {
    lua.lua_pushstring(L, to_luastring(src(f)));
    lua.lua_setglobal(L, to_luastring("__src"));
    run(`loadAddonFile(__src, "${f}")`, f);
  }
  // Capture.lua only builds its index when the addon loads.
  run(`KOS:ReindexIncidents()`);

  return {
    run,
    printed,
    clearPrinted: () => run(`printed = {}; tooltipLines = {}`),
    count: () => getGlobalJson("GoopKOSDB.incidents"),
    slash: (msg) => run(`SlashCmdList.GOOPKOS(${JSON.stringify(msg)})`),
    tooltip: () => {
      run(`tooltipLines = {}; runTooltip()`);
      const n = getGlobalJson("tooltipLines");
      const lines = [];
      for (let i = 1; i <= n; i++) {
        run(`__s = tooltipLines[${i}]`);
        lua.lua_getglobal(L, to_luastring("__s"));
        lines.push(to_jsstring(lua.lua_tostring(L, -1)));
        lua.lua_pop(L, 1);
      }
      return lines;
    },
    addIncident: (name, kind = "ganked") =>
      run(`table.insert(GoopKOSDB.incidents, { clientId = "${name}-${kind}-" .. #GoopKOSDB.incidents,
        name = "${name}", kind = "${kind}", zone = "Barrens", occurredAt = now - 120, reportedBy = "Friend" })`),
    setUnit: (token, name, faction = "Horde") =>
      run(`units["${token}"] = { name = "${name}", faction = "${faction}" }`),
    clearUnit: (token) => run(`units["${token}"] = nil`),
    targetChanged: () => run(`for _, h in ipairs(handlers) do if h.kind == "OnEvent" then h.fn(nil, "PLAYER_TARGET_CHANGED") end end`),
    rightClick: (tag, unit) => run(`rightClick("${tag}", "${unit}")`),
    menuLabels: () => {
      run(`__s = table.concat((function() local l = {} for _, i in ipairs(menuItems) do l[#l+1] = i.label end return l end)(), "|")`);
      lua.lua_getglobal(L, to_luastring("__s"));
      const v = to_jsstring(lua.lua_tostring(L, -1));
      lua.lua_pop(L, 1);
      return v ? v.split("|") : [];
    },
    clickMenuItem: (i = 1) => run(`menuItems[${i}].fn()`),
    advance: (s) => run(`now = now + ${s}`),
  };
}

test("Lookup: listed names are found, case-insensitively, with a report count", () => {
  const t = boot();
  t.addIncident("Rezzer Rrectem");
  t.addIncident("Rezzer Rrectem");
  t.run(`r = KOS:Lookup("rezzer RRECTEM")`);
  assert.equal(t.run(`assert(r and r.count == 2, "expected 2 reports")`), undefined);
});

test("Lookup: unknown names and revenge-only names are not on the list", () => {
  const t = boot();
  t.addIncident("Gooped Back", "revenge");
  t.run(`assert(KOS:Lookup("Nobody Atall") == nil)`);
  t.run(`assert(KOS:Lookup("Gooped Back") == nil, "revenge-only must not count")`);
  t.run(`assert(KOS:Lookup("") == nil and KOS:Lookup(nil) == nil)`);
});

test("/kos check Name: says on-list / not-on-list", () => {
  const t = boot();
  t.addIncident("Rezzer Rrectem");
  t.slash("check Rezzer Rrectem");
  t.slash("check Somebody Else");
  const out = t.printed();
  assert.match(out[0], /Rezzer Rrectem is on the KOS list: 1 report/);
  assert.match(out[1], /Somebody Else is not on the KOS list/);
});

test("/kos check never adds anyone (the bug where it gooped the target)", () => {
  const t = boot();
  t.setUnit("target", "Rezzer Rrectem");
  t.slash("check");
  t.slash("check Rezzer Rrectem");
  t.slash("check Nobody");
  assert.equal(t.count(), 0, "check must not record incidents");
});

test("/kos check with no name uses your target", () => {
  const t = boot();
  t.addIncident("Rezzer Rrectem");
  t.setUnit("target", "Rezzer Rrectem");
  t.slash("check");
  assert.match(t.printed()[0], /Rezzer Rrectem is on the KOS list/);
});

test("tooltip: listed enemy gets a KOS line, unlisted enemy says so, friendlies get nothing", () => {
  const t = boot();
  t.addIncident("Rezzer Rrectem");
  t.setUnit("mouseover", "Rezzer Rrectem");
  t.run(`GameTooltip.tooltipUnit = "mouseover"`);
  const lines = t.tooltip();
  assert.equal(lines.length, 1);
  assert.match(lines[0], /KOS list: 1 report/);

  t.setUnit("mouseover", "Innocent Bystander", "Horde");
  assert.deepEqual(t.tooltip(), ["|cff9d9d9dNot on KOS list|r"]);

  t.setUnit("mouseover", "Friendly Person", "Alliance");
  assert.deepEqual(t.tooltip(), [], "no line for your own faction");
});

test("targeting a listed player warns once, not on every re-target", () => {
  const t = boot();
  t.addIncident("Rezzer Rrectem");
  t.setUnit("target", "Rezzer Rrectem");
  t.targetChanged();
  t.targetChanged();
  assert.equal(t.printed().length, 1);
  assert.match(t.printed()[0], /Rezzer Rrectem is on the KOS list/);

  t.advance(120);
  t.targetChanged();
  assert.equal(t.printed().length, 2, "warns again after the cooldown");
});

test("targeting someone not on the list stays quiet", () => {
  const t = boot();
  t.addIncident("Rezzer Rrectem");
  t.setUnit("target", "Innocent Bystander");
  t.targetChanged();
  assert.deepEqual(t.printed(), []);
});

test("right-click an enemy player: menu offers Add, clicking it adds them", () => {
  const t = boot();
  t.setUnit("target", "Rezzer Rrectem", "Horde");
  t.rightClick("MENU_UNIT_ENEMY_PLAYER", "target");
  assert.deepEqual(t.menuLabels(), ["Add to KOS list"]);
  assert.equal(t.count(), 0, "just opening the menu adds nothing");

  t.clickMenuItem();
  assert.equal(t.count(), 1);
  t.run(`assert(KOS:Lookup("Rezzer Rrectem") ~= nil)`);
});

test("right-click someone already listed: offers another report", () => {
  const t = boot();
  t.addIncident("Rezzer Rrectem");
  t.setUnit("target", "Rezzer Rrectem", "Horde");
  t.rightClick("MENU_UNIT_ENEMY_PLAYER", "target");
  assert.deepEqual(t.menuLabels(), ["Add another KOS report"]);
});

test("right-click a friendly player: no menu entry", () => {
  const t = boot();
  t.setUnit("target", "Friendly Person", "Alliance");
  t.rightClick("MENU_UNIT_PLAYER", "target");
  assert.deepEqual(t.menuLabels(), []);
});

test("tooltip falls back to the mouseover unit when GetUnit gives none", () => {
  const t = boot();
  t.addIncident("Rezzer Rrectem");
  t.setUnit("mouseover", "Rezzer Rrectem");
  t.run(`GameTooltip.tooltipUnit = nil`);
  const lines = t.tooltip();
  assert.equal(lines.length, 1);
});

test("/kos debug reports and never adds anyone", () => {
  const t = boot();
  t.setUnit("target", "Rezzer Rrectem");
  t.slash("debug");
  assert.equal(t.count(), 0);
  assert.match(t.printed().join("\n"), /tooltip hook/);
});
