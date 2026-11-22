/** Canonical class colors, nudged where the original fails contrast on black. */
const COLORS: Record<string, string> = {
  WARRIOR: "#c79c6e",
  HUNTER: "#abd473",
  MAGE: "#5cc9f0",
  ROGUE: "#e8dc6b",
  SHAMAN: "#3b9dff",
  WARLOCK: "#a795d6",
  PRIEST: "#dadada",
  DRUID: "#ff9a4d",
  PALADIN: "#f58cba",
};

const NAMES: Record<string, string> = {
  WARRIOR: "Warrior",
  HUNTER: "Hunter",
  MAGE: "Mage",
  ROGUE: "Rogue",
  SHAMAN: "Shaman",
  WARLOCK: "Warlock",
  PRIEST: "Priest",
  DRUID: "Druid",
  PALADIN: "Paladin",
};

export function classColor(klass: string | null): string {
  return (klass && COLORS[klass]) || "#9a9ea8";
}

export function className(klass: string | null): string {
  if (!klass) return "Unknown";
  return NAMES[klass] ?? klass.charAt(0) + klass.slice(1).toLowerCase();
}

/** Class ids in display order, for pickers. */
export const CLASS_IDS = Object.keys(NAMES);
