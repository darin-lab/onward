import { createServerFn } from "@tanstack/react-start";
import type { Category, DayReport, PhoneCall, Shop, Tech, WeekLog } from "@/lib/board/model";

export type BoardSnapshot = {
  shops: Shop[];
  categories: Category[];
  techs: Tech[];
  weeks: WeekLog[];
  dayReports: DayReport[];
  calls: PhoneCall[];
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
    sampleCrew: Boolean(data.sampleCrew),
    prelaunchCleared: Boolean(data.prelaunchCleared),
  };
}

export const loadBoard = createServerFn({ method: "GET" }).handler(async () => {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const rows = await sql.query<{ data: string }>(
    "select data from board_state where id = $1",
    ["main"],
  );
  const raw = rows[0]?.data;
  if (!raw) return null;
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  return asSnapshot(parsed);
});

export const saveBoard = createServerFn({ method: "POST" })
  .validator((input: unknown) => asSnapshot(input))
  .handler(async ({ data }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await sql.query(
      `insert into board_state (id, data, updated_at)
       values ($1, $2, now())
       on conflict (id) do update set data = excluded.data, updated_at = now()`,
      ["main", JSON.stringify(data)],
    );
    return { ok: true as const };
  });
