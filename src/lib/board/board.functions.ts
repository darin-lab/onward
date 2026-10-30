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

async function weekRows(sql: Awaited<ReturnType<typeof import("@/lib/db").getSql>>) {
  await sql.query(
    `create table if not exists week_logs (
      tech_id text not null,
      week_start text not null,
      data text not null,
      updated_at timestamptz not null default now(),
      primary key (tech_id, week_start)
    )`,
  );
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
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const rows = await sql.query<{ data: string }>(
    "select data from board_state where id = $1",
    ["main"],
  );
  const raw = rows[0]?.data;
  if (!raw) return null;
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  const snapshot = asSnapshot(parsed);
  snapshot.weeks = overlayWeeks(snapshot.weeks, await weekRows(sql));
  return snapshot;
});

function sealed(week: WeekLog) {
  return Boolean(week.submitted && week.darinReady && week.arunReady);
}

function mergeWeek(saved: WeekLog, incoming: WeekLog): WeekLog {
  if (sealed(saved) && !sealed(incoming)) return saved;
  if ((saved.updatedAt ?? "") > (incoming.updatedAt ?? "")) return saved;
  const next: WeekLog = { ...saved, ...incoming };
  if (sealed(incoming)) {
    next.submitted = true;
    next.darinReady = true;
    next.arunReady = true;
    next.reviewStage = "locked";
  }
  const numbers = [
    "hours",
    "billedHours",
    "cars",
    "totalRecommendations",
    "recsPerVehicle",
    "totalSales",
    "sellThrough",
    "averageRepairOrder",
    "hoursPerRepairOrder",
    "salesPerBilledHour",
    "grossProfit",
    "efficiency",
    "serviceHours",
  ] as const;
  for (const key of numbers) {
    if (incoming[key] == null && saved[key] != null) next[key] = saved[key];
  }
  const notes = ["billedNote", "carsNote", "recsNote", "efficiencyNote", "working", "practice"] as const;
  for (const key of notes) {
    if (!incoming[key] && saved[key]) next[key] = saved[key];
  }
  if ((!incoming.boomerangs || incoming.boomerangs.length === 0) && saved.boomerangs?.length) {
    next.boomerangs = saved.boomerangs;
  }
  if (saved.scores || incoming.scores) next.scores = { ...saved.scores, ...incoming.scores };
  if (sealed(saved)) {
    next.submitted = true;
    next.darinReady = true;
    next.arunReady = true;
    next.reviewStage = "locked";
  }
  return next;
}

function mergeWeeks(saved: WeekLog[], incoming: WeekLog[]) {
  const byKey = new Map<string, WeekLog>();
  for (const week of saved) byKey.set(`${week.techId}:${week.weekStart}`, week);
  for (const week of incoming) {
    const key = `${week.techId}:${week.weekStart}`;
    const previous = byKey.get(key);
    byKey.set(key, previous ? mergeWeek(previous, week) : week);
  }
  return [...byKey.values()];
}

function mergeCash(saved: CashTransfer[], incoming: CashTransfer[]) {
  const byId = new Map(saved.map((item) => [item.id, item]));
  for (const item of incoming) {
    const previous = byId.get(item.id);
    if (!previous) {
      byId.set(item.id, item);
      continue;
    }
    if (item.deletedAt) {
      byId.set(item.id, { ...previous, deletedAt: item.deletedAt });
      continue;
    }
    if (previous.deletedAt) continue;
    const incomingEdit = item.revisedAt ?? "";
    const savedEdit = previous.revisedAt ?? "";
    if (incomingEdit && incomingEdit >= savedEdit) {
      byId.set(item.id, item);
      continue;
    }
    if (previous.pickedUp == null && item.pickedUp != null) byId.set(item.id, item);
  }
  return [...byId.values()];
}

function mergeCalls(saved: PhoneCall[], incoming: PhoneCall[]) {
  const byId = new Map(saved.map((call) => [call.id, call]));
  for (const call of incoming) {
    const previous = byId.get(call.id);
    if (!previous || call.answers.length > previous.answers.length) byId.set(call.id, call);
  }
  return [...byId.values()];
}

export const saveBoard = createServerFn({ method: "POST" })
  .validator((input: unknown) => asSnapshot(input))
  .handler(async ({ data }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql.query<{ data: string }>(
      "select data from board_state where id = $1",
      ["main"],
    );
    const raw = rows[0]?.data;
    if (raw) {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      const saved = asSnapshot(parsed);
      data.calls = mergeCalls(saved.calls, data.calls);
      data.cashTransfers = mergeCash(saved.cashTransfers, data.cashTransfers);
      data.weeks = mergeWeeks(saved.weeks, data.weeks);
    }
    data.weeks = overlayWeeks(data.weeks, await weekRows(sql));
    await sql.query(
      `insert into board_state (id, data, updated_at)
       values ($1, $2, now())
       on conflict (id) do update set data = excluded.data, updated_at = now()`,
      ["main", JSON.stringify(data)],
    );
    return { ok: true as const, weeks: data.weeks };
  });

function asWeek(input: unknown): WeekLog {
  if (!input || typeof input !== "object") throw new Error("Invalid week");
  const week = input as Partial<WeekLog>;
  if (typeof week.techId !== "string" || typeof week.weekStart !== "string") throw new Error("Invalid week");
  return { ...(week as WeekLog), updatedAt: new Date().toISOString() };
}

export const saveWeek = createServerFn({ method: "POST" })
  .validator((input: unknown) => asWeek(input))
  .handler(async ({ data }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await sql.query(
      `insert into week_logs (tech_id, week_start, data, updated_at)
       values ($1, $2, $3, now())
       on conflict (tech_id, week_start) do update
       set data = excluded.data, updated_at = now()`,
      [data.techId, data.weekStart, JSON.stringify(data)],
    );
    const rows = await sql.query<{ data: string }>(
      "select data from board_state where id = $1",
      ["main"],
    );
    const raw = rows[0]?.data;
    if (raw) {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      const saved = asSnapshot(parsed);
      saved.weeks = overlayWeeks(mergeWeeks(saved.weeks, [data]), [data]);
      await sql.query(
        `insert into board_state (id, data, updated_at)
         values ($1, $2, now())
         on conflict (id) do update set data = excluded.data, updated_at = now()`,
        ["main", JSON.stringify(saved)],
      );
    }
    return { ok: true as const, week: data };
  });
