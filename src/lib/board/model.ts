import { addDays, format, parseISO, startOfWeek, subWeeks } from "date-fns";
import { isOwnerEmail } from "@/lib/board/owners";

export type PersonKind = "manager" | "technician";

export type Category = {
  id: string;
  name: string;
  hint: string;
  kind: PersonKind;
};

export type Shop = {
  id: string;
  name: string;
  address: string;
};

export type Tech = {
  id: string;
  name: string;
  role: string;
  email: string;
  kind: PersonKind;
  shopId: string;
};

export type WeekResult = "win" | "loss" | "draw";

export type Boomerang = {
  id: string;
  ro: string;
  note: string;
};

export type WeekLog = {
  techId: string;
  weekStart: string;
  hours: number;
  billedHours: number | null;
  cars: number | null;
  recsPerVehicle: number | null;
  totalSales: number | null;
  sellThrough: number | null;
  averageRepairOrder: number | null;
  hoursPerRepairOrder: number | null;
  salesPerBilledHour: number | null;
  grossProfit: number | null;
  efficiency: number | null;
  billedNote: string;
  carsNote: string;
  recsNote: string;
  efficiencyNote: string;
  result: WeekResult | null;
  boomerangs: Boomerang[] | null;
  scores: Record<string, number>;
  working: string;
  practice: string;
  submitted?: boolean;
};

export const DAY_FIELDS = [
  { key: "productivity", label: "Productivity" },
  { key: "efficiency", label: "Efficiency" },
  { key: "proficiency", label: "Proficiency" },
  { key: "elr", label: "ELR" },
  { key: "spbh", label: "SPBH" },
  { key: "hpro", label: "HPRO" },
  { key: "hoursPerDay", label: "Hours Per Day" },
  { key: "billedHours", label: "Billed Hours" },
  { key: "workHours", label: "Work Hours" },
  { key: "serviceHours", label: "Service Hours" },
  { key: "availableHours", label: "Available Hours" },
  { key: "laborSales", label: "Labor Sales" },
  { key: "totalSales", label: "Total Sales" },
  { key: "carCount", label: "Car Count" },
  { key: "creditCardPayments", label: "Credit Card Payments" },
  { key: "cashCheckPayments", label: "Cash/Check Payments" },
] as const;

export type DayFieldKey = (typeof DAY_FIELDS)[number]["key"];

export type DayReport = {
  shopId: string;
  date: string;
  values: Partial<Record<DayFieldKey, string>>;
  notes?: Partial<Record<DayFieldKey, string>>;
  submitted?: boolean;
};

export const LEVELS = [
  { score: 1, word: "Starting" },
  { score: 2, word: "Practicing" },
  { score: 3, word: "Steady" },
  { score: 4, word: "Strong" },
  { score: 5, word: "Showing others" },
] as const;

export { seedCategories, seedShops, seedTechs, seedWeeks } from "@/lib/board/seed";

export function categoriesFor(categories: Category[], kind: PersonKind) {
  return categories.filter((category) => category.kind === kind);
}

export function peopleInLens(techs: Tech[], lens: string) {
  if (lens === "owner") return techs.filter((person) => person.kind === "manager");
  return techs.filter((person) => person.kind === "technician" && person.shopId === lens);
}

export function isOwnerViewer(viewer: string) {
  return viewer === "owner" || isOwnerEmail(viewer);
}

export function canReview(viewer: string, person: Tech, techs: Tech[]) {
  if (person.kind === "manager") return isOwnerViewer(viewer);
  const manager = techs.find(
    (item) => item.kind === "manager" && item.shopId === person.shopId,
  );
  return viewer === manager?.id;
}

export function canViewReview(viewer: string, person: Tech, techs: Tech[]) {
  if (isOwnerViewer(viewer) || viewer === person.id) return true;
  if (person.kind !== "technician") return false;
  const manager = techs.find(
    (item) => item.kind === "manager" && item.shopId === person.shopId,
  );
  return viewer === manager?.id;
}

export function hoursLabel(kind: PersonKind) {
  return kind === "manager" ? "Hours in the shop" : "Hours on the work";
}

export function mondayISO(date: Date) {
  return format(startOfWeek(date, { weekStartsOn: 1 }), "yyyy-MM-dd");
}

export function priorWeekISO(now = new Date()) {
  const day = now.getDay();
  if (day === 0 || day === 5 || day === 6) return mondayISO(now);
  return mondayISO(subWeeks(now, 1));
}

export function currentWeekISO(now = new Date()) {
  return mondayISO(now);
}

export function addWeekISO(weekStart: string, weeks = 1) {
  return format(addDays(parseISO(weekStart), 7 * weeks), "yyyy-MM-dd");
}

export function weekRangeLabel(weekStart: string) {
  const start = parseISO(weekStart);
  const end = addDays(start, 3);
  if (start.getMonth() === end.getMonth()) {
    return `${format(start, "MMMM d")}–${format(end, "d")}`;
  }
  return `${format(start, "MMM d")} – ${format(end, "MMM d")}`;
}

export function shortWeekLabel(weekStart: string) {
  return format(parseISO(weekStart), "MMM d");
}

export type WeekRelation = "last" | "current" | "earlier";

export function weekRelation(weekStart: string, now = new Date()): WeekRelation {
  if (weekStart === priorWeekISO(now)) return "last";
  if (weekStart === currentWeekISO(now)) return "current";
  return "earlier";
}

export function relationLabel(relation: WeekRelation) {
  if (relation === "last") return "Last week";
  if (relation === "current") return "This week, still open";
  return "Earlier week";
}

export function weeksFor(weeks: WeekLog[], techId: string) {
  return weeks
    .filter((week) => week.techId === techId)
    .slice()
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

export function featuredWeek(weeks: WeekLog[], techId: string, now = new Date()) {
  const list = weeksFor(weeks, techId);
  const prior = priorWeekISO(now);
  return list.find((week) => week.weekStart === prior) ?? list.at(-1) ?? null;
}

export function nextWeekToLog(existing: string[], now = new Date()) {
  const current = currentWeekISO(now);
  if (existing.length === 0) return priorWeekISO(now);
  const latest = [...existing].sort().at(-1);
  if (!latest) return priorWeekISO(now);
  const next = addWeekISO(latest, 1);
  if (next > current) return null;
  return next;
}

export function levelWord(score: number | undefined) {
  if (score == null || Number.isNaN(score)) return "Not marked";
  const rounded = Math.min(5, Math.max(1, Math.round(score)));
  return LEVELS.find((level) => level.score === rounded)?.word ?? "Steady";
}

export function shiftWord(current: number | undefined, previous: number | undefined) {
  if (current == null) return "Not marked yet";
  if (previous == null) return "First mark";
  const delta = current - previous;
  if (delta >= 1) return "Moved forward";
  if (delta <= -1) return current >= 4 ? "Still strong" : "Room to practice";
  return "Holding";
}

export function formatMoney(amount: number) {
  if (!Number.isFinite(amount)) return "$0";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatHours(hours: number) {
  if (!Number.isFinite(hours)) return "0";
  const rounded = Math.round(hours * 100) / 100;
  return String(rounded);
}

export function clampHours(hours: number) {
  if (!Number.isFinite(hours)) return 0;
  return Math.min(80, Math.max(0, Math.round(hours * 100) / 100));
}

export function recentHoursAverage(list: WeekLog[], beforeWeek: string) {
  const prior = list.filter((week) => week.weekStart < beforeWeek).slice(-4);
  if (prior.length === 0) return null;
  const sum = prior.reduce((total, week) => total + week.hours, 0);
  return sum / prior.length;
}

export function hoursStory(hours: number, average: number | null) {
  if (average == null) {
    return "First week of hours on record. Later weeks will show your rhythm, not a target.";
  }
  const label = formatHours(Math.round(average * 10) / 10);
  const delta = hours - average;
  if (Math.abs(delta) < 2) {
    return `Close to your recent rhythm of about ${label} hours. A familiar pace.`;
  }
  if (delta > 0) {
    return `Fuller than your recent rhythm of about ${label} hours. Notice what that pace asked of you, and what still felt good.`;
  }
  return `Lighter than your recent rhythm of about ${label} hours. A lighter week can be recovery, learning, or a different mix of jobs.`;
}

export function weekShape(rows: { name: string; score: number }[]) {
  if (rows.length === 0) return "";
  const top = rows.reduce((best, row) => (row.score > best.score ? row : best));
  const low = rows.reduce((best, row) => (row.score < best.score ? row : best));
  if (top.score === low.score) {
    return `Even across the habits — ${levelWord(top.score).toLowerCase()} in each one.`;
  }
  const leaders = rows.filter((row) => row.score === top.score);
  const lead =
    leaders.length === 1
      ? `${leaders[0]?.name ?? "One habit"} is leading`
      : "Several habits are leading";
  if (low.score >= 4) {
    return `${lead}. The rest of the week is right there with them.`;
  }
  return `${lead}. ${low.name} is the kindest place to put attention.`;
}

export function numberStory(values: number[], label: string) {
  if (values.length < 2) return "One week so far. Each new week lengthens this line.";
  const first = values[0] ?? 0;
  const last = values[values.length - 1] ?? 0;
  if (first === 0 && last === 0) return `${label} has stayed quiet across these weeks.`;
  if (last > first) return `${label} has climbed across these weeks.`;
  if (last < first) return `${label} has eased across these weeks. The shape is there to learn from.`;
  return `${label} has held steady across these weeks.`;
}

export function slugify(name: string) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return base || "tech";
}

export function uniqueTechId(techs: Tech[], name: string) {
  const base = slugify(name);
  const taken = new Set(techs.map((tech) => tech.id));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

export function blankWeek(
  techId: string,
  weekStart: string,
  categoryIds: string[],
  previous: WeekLog | null,
): WeekLog {
  const scores: Record<string, number> = {};
  for (const id of categoryIds) {
    scores[id] = previous?.scores[id] ?? 3;
  }
  return {
    techId,
    weekStart,
    hours: previous?.hours ?? 0,
    billedHours: previous?.billedHours ?? null,
    cars: previous?.cars ?? null,
    recsPerVehicle: previous?.recsPerVehicle ?? null,
    totalSales: null,
    sellThrough: null,
    averageRepairOrder: null,
    hoursPerRepairOrder: null,
    salesPerBilledHour: null,
    grossProfit: null,
    efficiency: null,
    billedNote: "",
    carsNote: "",
    recsNote: "",
    efficiencyNote: "",
    result: null,
    boomerangs: null,
    scores,
    working: "",
    practice: "",
  };
}

export type RecordLine = { wins: number; losses: number; draws: number; played: number };

export function emptyRecord(): RecordLine {
  return { wins: 0, losses: 0, draws: 0, played: 0 };
}

export function recordOf(weeks: WeekLog[]): RecordLine {
  const record = emptyRecord();
  for (const week of weeks) {
    if (week.cars != null) record.wins += Math.max(0, Math.round(week.cars));
    record.losses += week.boomerangs?.length ?? 0;
  }
  record.played = record.wins + record.losses;
  return record;
}

export function addRecords(records: RecordLine[]): RecordLine {
  return records.reduce((sum, record) => ({
    wins: sum.wins + record.wins,
    losses: sum.losses + record.losses,
    draws: sum.draws + record.draws,
    played: sum.played + record.played,
  }), emptyRecord());
}

export function formatRecord(record: RecordLine) {
  return `${record.wins}-${record.losses}`;
}

export function shopRecord(techs: Tech[], weeks: WeekLog[], shopId: string) {
  const crew = techs.filter((person) => person.shopId === shopId && person.kind === "technician");
  return addRecords(crew.map((person) => recordOf(weeksFor(weeks, person.id))));
}

export type PollRow = {
  tech: Tech;
  record: RecordLine;
  rank: number | null;
  billed: number | null;
};

export function reviewsReady(techs: Tech[], weeks: WeekLog[], weekStart: string) {
  const crew = techs.filter((person) => person.kind === "technician");
  if (crew.length === 0) return false;
  return crew.every((person) => {
    const week = weeks.find((item) => item.techId === person.id && item.weekStart === weekStart);
    return week != null && week.billedHours != null && week.cars != null && week.recsPerVehicle != null;
  });
}

export function peerRanks(techs: Tech[], weeks: WeekLog[], weekStart: string, techId: string) {
  if (!reviewsReady(techs, weeks, weekStart)) return null;
  const crew = techs.filter((person) => person.kind === "technician");
  const value = (
    id: string,
    key: "billedHours" | "cars" | "recsPerVehicle" | "efficiency",
  ) => weeks.find((item) => item.techId === id && item.weekStart === weekStart)?.[key] ?? null;
  const place = (
    key: "billedHours" | "cars" | "recsPerVehicle" | "efficiency",
  ) => {
    if (crew.some((person) => value(person.id, key) == null)) return undefined;
    const ordered = [...crew].sort(
      (a, b) =>
        (value(b.id, key) ?? 0) - (value(a.id, key) ?? 0) || a.name.localeCompare(b.name),
    );
    return ordered.findIndex((person) => person.id === techId) + 1;
  };
  return {
    total: crew.length,
    billedHours: place("billedHours"),
    cars: place("cars"),
    recsPerVehicle: place("recsPerVehicle"),
    efficiency: place("efficiency"),
  };
}

export function managerRanks(techs: Tech[], weeks: WeekLog[], weekStart: string, techId: string) {
  const crew = techs.filter((person) => person.kind === "manager");
  const value = (
    id: string,
    key:
      | "totalSales"
      | "sellThrough"
      | "averageRepairOrder"
      | "hoursPerRepairOrder"
      | "recsPerVehicle"
      | "salesPerBilledHour"
      | "grossProfit",
  ) => weeks.find((item) => item.techId === id && item.weekStart === weekStart)?.[key] ?? null;
  const place = (
    key:
      | "totalSales"
      | "sellThrough"
      | "averageRepairOrder"
      | "hoursPerRepairOrder"
      | "recsPerVehicle"
      | "salesPerBilledHour"
      | "grossProfit",
  ) => {
    if (crew.length === 0 || crew.some((person) => value(person.id, key) == null)) return undefined;
    const ordered = [...crew].sort(
      (a, b) => (value(b.id, key) ?? 0) - (value(a.id, key) ?? 0) || a.name.localeCompare(b.name),
    );
    return ordered.findIndex((person) => person.id === techId) + 1;
  };
  return {
    total: crew.length,
    totalSales: place("totalSales"),
    sellThrough: place("sellThrough"),
    averageRepairOrder: place("averageRepairOrder"),
    hoursPerRepairOrder: place("hoursPerRepairOrder"),
    recsPerVehicle: place("recsPerVehicle"),
    salesPerBilledHour: place("salesPerBilledHour"),
    grossProfit: place("grossProfit"),
  };
}

export function companyPoll(techs: Tech[], weeks: WeekLog[]): PollRow[] {
  const rows: PollRow[] = techs
    .filter((person) => person.kind === "technician")
    .map((tech) => {
      const latest = featuredWeek(weeks, tech.id);
      return {
        tech,
        record: recordOf(weeksFor(weeks, tech.id)),
        rank: null,
        billed: latest?.billedHours ?? null,
      };
    });
  const weekStart = priorWeekISO();
  const ready = reviewsReady(techs, weeks, weekStart);
  const ranked = rows
    .filter((row) => row.billed != null)
    .sort((a, b) => (b.billed ?? 0) - (a.billed ?? 0) || a.tech.name.localeCompare(b.tech.name));
  if (ready) {
    ranked.forEach((row, index) => {
      row.rank = index + 1;
    });
  }
  const waiting = rows
    .filter((row) => row.billed == null)
    .sort((a, b) => a.tech.name.localeCompare(b.tech.name));
  return [...ranked, ...waiting];
}

export function resultStory(result: WeekResult | null) {
  if (result === "win") return "This week counted. Keep the part that made it so available next week.";
  if (result === "draw") return "A steady week. Holding is a kind of progress. One small nudge is enough.";
  if (result === "loss") {
    return "A week to practice. It stays on the record so the pattern is visible. It is not a warning, and nobody is on notice.";
  }
  return "The manager hasn't marked this week yet.";
}
