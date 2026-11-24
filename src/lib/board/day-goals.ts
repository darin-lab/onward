// End of Day goals, shared by the End of Day page and its email so both color numbers the same way.
import type { DayFieldKey } from "@/lib/board/model";

export type DayGoal = { label: string; low: number; high?: number };

const GOALS: Partial<Record<DayFieldKey, DayGoal>> = {
  productivity: { label: "85% – 90%", low: 85 },
  efficiency: { label: "100% – 150%", low: 100 },
  proficiency: { label: "100%", low: 100 },
  elr: { label: "$250.00", low: 250 },
  spbh: { label: "$400.00", low: 400 },
  hpro: { label: "3.00", low: 3 },
  hoursPerDay: { label: "20.00", low: 20 },
};

/** Shops with one technician get a lower billed-hours-per-day goal. */
const SHOP_GOALS: Record<string, Partial<Record<DayFieldKey, DayGoal>>> = {
  "san-jose": { hoursPerDay: { label: "10.00", low: 10 } },
  "castro-valley": { hoursPerDay: { label: "10.00", low: 10 } },
};

export function goalFor(key: DayFieldKey, shopId: string): DayGoal | undefined {
  return SHOP_GOALS[shopId]?.[key] ?? GOALS[key];
}

export function readNumber(raw: string | undefined) {
  if (!raw?.trim()) return null;
  const value = Number(raw.replace(/[$,%\s,]/g, ""));
  return Number.isFinite(value) ? value : null;
}

export function belowGoal(key: DayFieldKey, raw: string | undefined, shopId: string) {
  const goal = goalFor(key, shopId);
  const value = readNumber(raw);
  if (!goal || value == null) return false;
  // Anything at or above the goal is green, even past the top of a range like 100–150%.
  return value < goal.low;
}

/** "above" (green), "below" (red), or null when the number has no goal or is blank. */
export function goalTone(key: DayFieldKey, raw: string | undefined, shopId: string) {
  if (!goalFor(key, shopId) || readNumber(raw) == null) return null;
  return belowGoal(key, raw, shopId) ? ("below" as const) : ("above" as const);
}
