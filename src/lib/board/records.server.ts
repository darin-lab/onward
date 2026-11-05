// Server-only storage for call reflections, cash pickups and End of Day
// reports. Each lives in its own table so none of them is ever part of the
// board_state row or a review save (see migrations/0006_records.sql).
import type { CashTransfer, DayReport, PhoneAnswer, PhoneCall } from "@/lib/board/model";

type Sql = Awaited<ReturnType<typeof import("@/lib/db").getSql>>;

export async function recordsSql(): Promise<Sql> {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  await ensureTables(sql);
  await importLegacy(sql);
  return sql;
}

let tablesReady: Promise<void> | null = null;

function ensureTables(sql: Sql) {
  // The 0006 migration creates these on deploy. This is a fallback for a
  // database the migrator has not reached yet.
  tablesReady ??= (async () => {
    await sql.query(`create table if not exists call_reflections (
      id text primary key,
      manager_id text not null,
      data text not null,
      audio text,
      created_at timestamptz not null default now(),
      answered_at timestamptz,
      mailed_at timestamptz
    )`);
    await sql.query(`create table if not exists cash_transfers (
      id text primary key,
      shop_id text not null,
      data text not null,
      requested_at text not null,
      updated_at timestamptz not null default now()
    )`);
    await sql.query(`create table if not exists day_reports (
      shop_id text not null,
      day text not null,
      data text not null,
      updated_at timestamptz not null default now(),
      mailed_at timestamptz,
      primary key (shop_id, day)
    )`);
  })().catch((error) => {
    tablesReady = null;
    throw error;
  });
  return tablesReady;
}

type CallData = {
  question: string;
  audioName: string;
  createdAt: string;
  answers: PhoneAnswer[];
  sample?: boolean;
};

export type CallRow = {
  id: string;
  manager_id: string;
  data: string;
  audio: string | null;
  answered_at: string | null;
  mailed_at: string | null;
};

export function callFromRow(row: CallRow, withAudio = false): PhoneCall & { hasAudio: boolean } {
  const data = JSON.parse(row.data) as CallData;
  return {
    id: row.id,
    managerId: row.manager_id,
    question: data.question,
    audio: withAudio ? (row.audio ?? "") : "",
    audioName: data.audioName ?? "",
    createdAt: data.createdAt,
    answers: Array.isArray(data.answers) ? data.answers : [],
    sample: data.sample,
    hasAudio: Boolean(row.audio),
  };
}

export async function insertCall(sql: Sql, call: PhoneCall) {
  const data: CallData = {
    question: call.question,
    audioName: call.audioName,
    createdAt: call.createdAt,
    answers: call.answers ?? [],
    sample: call.sample,
  };
  const answered = (call.answers ?? []).length > 0;
  await sql.query(
    `insert into call_reflections (id, manager_id, data, audio, answered_at, mailed_at)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (id) do nothing`,
    [
      call.id,
      call.managerId,
      JSON.stringify(data),
      answered ? null : call.audio || null,
      answered ? new Date().toISOString() : null,
      // A call answered under the old storage already had its email sent.
      answered ? new Date().toISOString() : null,
    ],
  );
}

export async function insertCash(sql: Sql, item: CashTransfer) {
  await sql.query(
    `insert into cash_transfers (id, shop_id, data, requested_at)
     values ($1, $2, $3, $4)
     on conflict (id) do nothing`,
    [item.id, item.shopId, JSON.stringify(item), item.requestedAt],
  );
}

export async function saveCash(sql: Sql, item: CashTransfer) {
  await sql.query(
    `update cash_transfers set data = $2, updated_at = now() where id = $1`,
    [item.id, JSON.stringify(item)],
  );
}

export async function insertDayReport(sql: Sql, report: DayReport, overwrite: boolean) {
  await sql.query(
    `insert into day_reports (shop_id, day, data)
     values ($1, $2, $3)
     on conflict (shop_id, day) do ${overwrite ? "update set data = excluded.data, updated_at = now()" : "nothing"}`,
    [report.shopId, report.date, JSON.stringify(report)],
  );
}

/**
 * One-time move: calls, cash and End of Day reports that were saved inside
 * board_state are copied into their own tables, then removed from the row so
 * board_state goes back to being small.
 */
async function importLegacy(sql: Sql) {
  const rows = await sql.query<{ data: string }>("select data from board_state where id = $1", ["main"]);
  const raw = rows[0]?.data;
  if (!raw) return;
  const board = (typeof raw === "string" ? JSON.parse(raw) : raw) as {
    calls?: PhoneCall[];
    cashTransfers?: CashTransfer[];
    dayReports?: DayReport[];
  };
  const calls = Array.isArray(board.calls) ? board.calls : [];
  const cash = Array.isArray(board.cashTransfers) ? board.cashTransfers : [];
  const reports = Array.isArray(board.dayReports) ? board.dayReports : [];
  if (calls.length === 0 && cash.length === 0 && reports.length === 0) return;
  for (const call of calls) {
    if (call?.id && call.managerId && !call.sample) await insertCall(sql, call);
  }
  for (const item of cash) {
    if (item?.id && item.shopId) await insertCash(sql, item);
  }
  for (const report of reports) {
    if (report?.shopId && report.date) await insertDayReport(sql, report, false);
  }
  await sql.query(
    `update board_state set data = $2, updated_at = now() where id = $1`,
    ["main", JSON.stringify({ ...board, calls: [], cashTransfers: [], dayReports: [] })],
  );
}

export const SHOP_NAMES: Record<string, string> = {
  fremont: "Fremont",
  campbell: "Campbell",
  "san-ramon": "San Ramon",
  "san-jose": "San Jose",
  "castro-valley": "Castro Valley",
};

/** Manager names and shops, read from the board, for emails and checks. */
export async function boardPeople(sql: Sql) {
  const rows = await sql.query<{ data: string }>("select data from board_state where id = $1", ["main"]);
  const raw = rows[0]?.data;
  const board = raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : {};
  const techs = (board.techs ?? []) as { id: string; name: string; kind: string; shopId: string }[];
  const shops = (board.shops ?? []) as { id: string; name: string }[];
  return {
    person: (id: string) => techs.find((tech) => tech.id === id) ?? null,
    shopName: (id: string) => shops.find((shop) => shop.id === id)?.name ?? SHOP_NAMES[id] ?? id,
  };
}

/** Tech reviews at this shop that Darin or Arun sent and the manager has not finished. */
export async function owedTechReviews(sql: Sql, shopId: string) {
  const rows = await sql.query<{ data: string }>("select data from board_state where id = $1", ["main"]);
  const raw = rows[0]?.data;
  const board = raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : {};
  const crew = new Set(
    ((board.techs ?? []) as { id: string; kind: string; shopId: string }[])
      .filter((tech) => tech.kind === "technician" && tech.shopId === shopId)
      .map((tech) => tech.id),
  );
  if (crew.size === 0) return 0;
  const weeks = await sql.query<{ tech_id: string; data: string }>("select tech_id, data from week_logs");
  return weeks.filter((row) => {
    if (!crew.has(row.tech_id)) return false;
    const week = (typeof row.data === "string" ? JSON.parse(row.data) : row.data) as { reviewStage?: string };
    return week.reviewStage === "manager";
  }).length;
}
