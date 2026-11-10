import { createServerFn } from "@tanstack/react-start";
import type { CashTransfer, Category, DayReport, PhoneCall, Shop, Tech, WeekLog } from "@/lib/board/model";

export type BoardSnapshot = {
  shops: Shop[];
  categories: Category[];
  techs: Tech[];
  weeks: WeekLog[];
  dayReports: DayReport[];
  calls: PhoneCall[];
  cashTransfers: CashTransfer[];
  sampleCrew: boolean;
  prelaunchCleared?: boolean;
};

function asSnapshot(input: unknown): BoardSnapshot {
  if (!input || typeof input !== "object") throw new Error("Invalid board");
  const data = input as Partial<BoardSnapshot>;
  if (!Array.isArray(data.shops) || !Array.isArray(data.techs) || !Array.isArray(data.weeks)) {
    throw new Error("Invalid board");
  }
  return {
    shops: data.shops,
    categories: Array.isArray(data.categories) ? data.categories : [],
    techs: data.techs.map((tech) => ({ ...tech, email: tech.email ?? "" })),
    weeks: data.weeks,
    dayReports: Array.isArray(data.dayReports) ? data.dayReports : [],
    calls: Array.isArray(data.calls) ? data.calls : [],
    cashTransfers: Array.isArray(data.cashTransfers) ? data.cashTransfers : [],
    sampleCrew: Boolean(data.sampleCrew),
    prelaunchCleared: Boolean(data.prelaunchCleared),
  };
}

async function weekRows(sql: Awaited<ReturnType<typeof import("@/lib/db").getSql>>, read = true) {
  await sql.query(
    `create table if not exists week_logs (
      tech_id text not null,
      week_start text not null,
      data text not null,
      updated_at timestamptz not null default now(),
      primary key (tech_id, week_start)
    )`,
  );
  if (!read) return [];
  const rows = await sql.query<{ data: string }>("select data from week_logs");
  return rows.map((row) => (typeof row.data === "string" ? JSON.parse(row.data) : row.data) as WeekLog);
}

function overlayWeeks(weeks: WeekLog[], stored: WeekLog[]) {
  const byKey = new Map<string, WeekLog>();
  for (const week of weeks) byKey.set(`${week.techId}:${week.weekStart}`, week);
  for (const week of stored) {
    const key = `${week.techId}:${week.weekStart}`;
    const previous = byKey.get(key);
    if (!previous || (week.updatedAt ?? "") >= (previous.updatedAt ?? "")) byKey.set(key, { ...previous, ...week });
  }
  return [...byKey.values()];
}

export const loadBoard = createServerFn({ method: "POST" }).handler(async () => {
  // Moves any calls, cash and End of Day reports still inside board_state into
  // their own tables before the row is read, so the row stays small.
  const { recordsSql } = await import("@/lib/board/records.server");
  const sql = await recordsSql();
  const rows = await sql.query<{ data: string }>(
    "select data from board_state where id = $1",
    ["main"],
  );
  const raw = rows[0]?.data;
  if (!raw) return null;
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  const snapshot = asSnapshot(parsed);
  snapshot.weeks = overlayWeeks(snapshot.weeks, await weekRows(sql));
  snapshot.calls = [];
  snapshot.cashTransfers = [];
  snapshot.dayReports = [];
  return snapshot;
});

/**
 * A manager pressed "I've read my review" on their submitted review. Records the first time
 * only; this is what turns Darin's "Mgr" light green.
 */
export const markReviewSeen = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const weekStart = (input as { weekStart?: unknown })?.weekStart;
    if (typeof weekStart !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) throw new Error("Invalid week");
    return { weekStart };
  })
  .handler(async ({ data }) => {
    const { requireViewer } = await import("@/lib/board/darin.server");
    const viewer = await requireViewer();
    if (viewer.role !== "manager") return { ok: false as const, week: null };
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql.query<{ data: string }>(
      "select data from week_logs where tech_id = $1 and week_start = $2",
      [viewer.personId, data.weekStart],
    );
    if (!rows[0]) return { ok: false as const, week: null };
    const week = (typeof rows[0].data === "string" ? JSON.parse(rows[0].data) : rows[0].data) as WeekLog;
    if (!(week.submitted && week.darinReady && week.arunReady)) return { ok: false as const, week: null };
    if (week.managerSeenAt) return { ok: true as const, week };
    const next: WeekLog = { ...week, managerSeenAt: new Date().toISOString() };
    await sql.query(
      `update week_logs set data = $3, updated_at = now() where tech_id = $1 and week_start = $2`,
      [viewer.personId, data.weekStart, JSON.stringify(next)],
    );
    return { ok: true as const, week: next };
  });

/** Every saved review, for keeping open pages and the leaderboard current. */
export const listWeeks = createServerFn({ method: "GET" }).handler(async () => {
  const { requireViewer } = await import("@/lib/board/darin.server");
  await requireViewer();
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  return weekRows(sql);
});

/**
 * Saves only the board itself: shops, habits and the crew list. Reviews go
 * through saveWeek (week_logs), and calls, cash and End of Day reports have
 * their own tables, so none of them is part of this write. Owners only.
 */
export const saveBoard = createServerFn({ method: "POST" })
  .validator((input: unknown) => asSnapshot(input))
  .handler(async ({ data }) => {
    const { requireViewer } = await import("@/lib/board/darin.server");
    const viewer = await requireViewer();
    const { recordsSql } = await import("@/lib/board/records.server");
    const sql = await recordsSql();
    const rows = await sql.query<{ data: string }>(
      "select data from board_state where id = $1",
      ["main"],
    );
    const raw = rows[0]?.data;
    const saved = raw ? asSnapshot(typeof raw === "string" ? JSON.parse(raw) : raw) : null;
    if (saved && viewer.role !== "owner") throw new Error("Not allowed");
    const next: BoardSnapshot = {
      shops: data.shops,
      categories: data.categories,
      techs: data.techs,
      // Older reviews that were saved before week_logs existed stay as they were.
      weeks: saved?.weeks ?? [],
      dayReports: [],
      calls: [],
      cashTransfers: [],
      sampleCrew: data.sampleCrew,
      prelaunchCleared: true,
    };
    await sql.query(
      `insert into board_state (id, data, updated_at)
       values ($1, $2, now())
       on conflict (id) do update set data = excluded.data, updated_at = now()`,
      ["main", JSON.stringify(next)],
    );
    return { ok: true as const };
  });

function asWeek(input: unknown): WeekLog {
  if (!input || typeof input !== "object") throw new Error("Invalid week");
  const week = input as Partial<WeekLog>;
  if (typeof week.techId !== "string" || typeof week.weekStart !== "string") throw new Error("Invalid week");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week.weekStart)) throw new Error("Invalid week");
  return { ...(week as WeekLog), updatedAt: new Date().toISOString() };
}

const OWNER_TECH_FIELDS = ["billedHours", "hoursPerRepairOrder", "totalRecommendations", "cars"] as const;
const MANAGER_TECH_FIELDS = [
  "serviceHours",
  "billedNote",
  "carsNote",
  "recsNote",
  "efficiencyNote",
  "working",
  "practice",
  "boomerangs",
  "scores",
] as const;

function techFigures(week: WeekLog): WeekLog {
  const recsPerVehicle =
    week.totalRecommendations != null && week.cars != null && week.cars > 0
      ? Math.round((week.totalRecommendations / week.cars) * 100) / 100
      : null;
  const efficiency =
    week.billedHours != null && week.serviceHours != null && week.serviceHours > 0
      ? Math.round((week.billedHours / week.serviceHours) * 1000) / 10
      : null;
  return { ...week, recsPerVehicle, efficiency };
}

function stageRank(stage: WeekLog["reviewStage"]) {
  return stage === "locked" ? 2 : stage === "manager" ? 1 : 0;
}

/**
 * Two people can have the same review open. Each save carries only the parts
 * that person is allowed to change, merged onto what is already stored, so a
 * save from an older copy never wipes the other side's work:
 * - Technician review: Darin or Arun own billed hours, BH/RO, total
 *   recommendations and cars; the manager owns service hours, notes,
 *   boomerangs and habits. Once the manager confirms ("you for reals right now?" → "i am for reals") and locks it, it stays locked.
 * - Manager review: only Darin or Arun write it. Each can turn on only their
 *   own name, a green name stays green, and Submit needs both.
 */
function mergeForViewer(
  stored: WeekLog | null,
  incoming: WeekLog,
  viewer: { personId: string; role: string },
  kind: "manager" | "technician",
): WeekLog {
  const owner = viewer.role === "owner";
  if (kind === "manager") {
    if (!owner) throw new Error("Not allowed");
    if (stored && stored.submitted && stored.darinReady && stored.arunReady) return stored;
    const darinReady = Boolean(stored?.darinReady) || (viewer.personId === "darin" && Boolean(incoming.darinReady));
    const arunReady = Boolean(stored?.arunReady) || (viewer.personId === "arun" && Boolean(incoming.arunReady));
    const submitted = Boolean(incoming.submitted) && darinReady && arunReady;
    return {
      ...(stored ?? {}),
      ...incoming,
      darinReady,
      arunReady,
      submitted,
      reviewStage: submitted ? "locked" : "draft",
    };
  }
  if (stored && stageRank(stored.reviewStage) === 2) return stored;
  const base: WeekLog = stored ?? incoming;
  const next: WeekLog = { ...base, updatedAt: incoming.updatedAt };
  const fields = owner ? OWNER_TECH_FIELDS : MANAGER_TECH_FIELDS;
  const target = next as unknown as Record<string, unknown>;
  const source = incoming as unknown as Record<string, unknown>;
  for (const key of fields) target[key] = source[key] ?? (key === "scores" ? {} : null);
  if (owner && next.cars != null) next.cars = Math.round(next.cars);
  // The owner moves it to the manager; only the manager can lock it.
  const wanted = incoming.reviewStage;
  if (owner && wanted === "manager" && stageRank(base.reviewStage) < 1) next.reviewStage = "manager";
  if (!owner && wanted === "locked" && stageRank(base.reviewStage) === 1) {
    next.reviewStage = "locked";
    next.submitted = true;
  }
  if (!stored) next.reviewStage = owner && wanted === "manager" ? "manager" : "draft";
  return techFigures(next);
}

export const saveWeek = createServerFn({ method: "POST" })
  .validator((input: unknown) => asWeek(input))
  .handler(async ({ data }) => {
    const { requireViewer } = await import("@/lib/board/darin.server");
    const viewer = await requireViewer();
    if (viewer.role === "technician") throw new Error("Not allowed");
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await weekRows(sql, false);
    const board = await sql.query<{ data: string }>("select data from board_state where id = $1", ["main"]);
    const raw = board[0]?.data;
    const techs = raw ? (asSnapshot(typeof raw === "string" ? JSON.parse(raw) : raw).techs ?? []) : [];
    const person = techs.find((tech) => tech.id === data.techId);
    if (!person) throw new Error("That person is not on the board");
    if (viewer.role === "manager") {
      if (person.kind !== "technician" || person.shopId !== viewer.shopId) throw new Error("Not allowed");
    }
    const rows = await sql.query<{ data: string }>(
      "select data from week_logs where tech_id = $1 and week_start = $2",
      [data.techId, data.weekStart],
    );
    let stored: WeekLog | null = rows[0]
      ? ((typeof rows[0].data === "string" ? JSON.parse(rows[0].data) : rows[0].data) as WeekLog)
      : null;
    if (!stored && raw) {
      // A review saved before week_logs existed lives in board_state.
      const legacy = asSnapshot(typeof raw === "string" ? JSON.parse(raw) : raw).weeks;
      stored = legacy.find((week) => week.techId === data.techId && week.weekStart === data.weekStart) ?? null;
    }
    const week = mergeForViewer(stored, data, viewer, person.kind);
    if (week !== stored) {
      await sql.query(
        `insert into week_logs (tech_id, week_start, data, updated_at)
         values ($1, $2, $3, now())
         on conflict (tech_id, week_start) do update
         set data = excluded.data, updated_at = now()`,
        [week.techId, week.weekStart, JSON.stringify(week)],
      );
    }
    return { ok: true as const, week, locked: week === stored };
  });
