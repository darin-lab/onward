import type { Sql } from "@/lib/db";
import { SHOP_NAMES, rangeRows, valueOf, type Row } from "@/lib/board/dashboard.functions";
import { RECORD_METRICS, metricInfo, type RecordMetric, type RecordMoment, type ShopRecord } from "@/lib/board/hof";

/**
 * Each shop's best week from the dashboard history (Jan 2023 to Nov 15, 2026),
 * pulled Nov 16, 2026. Thin weeks (under $3,000 sales or 10 billed hours) were
 * left out of the rates, and proficiency weeks where available hours were
 * incomplete (over 200%) were skipped. Seeding never announces anything.
 */
const SEED: Record<string, Partial<Record<RecordMetric, [number, string]>>> = {
  fremont: {
    sales: [58795.43, "2025-12-15"], cars: [43, "2023-08-14"], billed: [152.56, "2023-10-09"], hpd: [38.14, "2023-10-09"],
    proficiency: [0.884, "2026-10-05"], elr: [258.262, "2025-12-22"], spbh: [852.112, "2026-04-27"], aro: [3094.496, "2025-12-15"],
    hpro: [5.045, "2026-06-01"], recPerCar: [5263.968, "2026-10-05"], sellthrough: [0.704, "2024-07-22"], day: [45648.92, "2025-12-18"],
  },
  campbell: {
    sales: [35027.27, "2025-04-28"], cars: [23, "2026-03-16"], billed: [121.2, "2024-05-20"], hpd: [30.3, "2024-05-20"],
    proficiency: [0.823, "2026-10-19"], elr: [294.545, "2026-04-27"], spbh: [588.997, "2025-10-20"], aro: [4629.585, "2025-09-22"],
    hpro: [10.6, "2025-09-22"], recPerCar: [9105.57, "2025-06-09"], sellthrough: [0.744, "2025-09-22"], day: [22142.92, "2026-01-28"],
  },
  "san-ramon": {
    sales: [31256.19, "2026-06-08"], cars: [39, "2024-08-19"], billed: [177.5, "2024-07-08"], hpd: [44.375, "2024-07-08"],
    proficiency: [0.684, "2026-11-02"], elr: [265.507, "2025-10-20"], spbh: [449.994, "2025-12-01"], aro: [1613.704, "2026-03-02"],
    hpro: [5.83, "2024-01-22"], recPerCar: [5045.973, "2025-09-15"], sellthrough: [0.666, "2025-11-03"], day: [17426.63, "2026-06-10"],
  },
  "san-jose": {
    sales: [33245.05, "2026-05-18"], cars: [24, "2026-08-17"], billed: [83.75, "2026-05-18"], hpd: [20.938, "2026-05-18"],
    proficiency: [1.178, "2026-10-19"], elr: [249.632, "2026-10-19"], spbh: [556.665, "2026-05-25"], aro: [1749.739, "2026-05-18"],
    hpro: [4.408, "2026-05-18"], recPerCar: [5211.283, "2026-05-18"], sellthrough: [0.508, "2026-10-26"], day: [18283.25, "2026-05-27"],
  },
  "castro-valley": {
    sales: [26007.11, "2026-10-12"], cars: [18, "2026-06-29"], billed: [54.65, "2026-08-10"], hpd: [13.663, "2026-08-10"],
    proficiency: [0.643, "2026-11-09"], elr: [251.707, "2026-05-25"], spbh: [954.055, "2026-06-08"], aro: [1915.448, "2026-06-08"],
    hpro: [4.783, "2026-05-25"], recPerCar: [4386.014, "2026-08-17"], sellthrough: [0.791, "2026-05-25"], day: [19726.03, "2026-06-11"],
  },
};

let ready: Promise<void> | null = null;

export async function hofSql(): Promise<Sql> {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  ready ??= (async () => {
    await sql.query(`create table if not exists shop_records (
      shop_id text not null,
      metric text not null,
      value double precision not null,
      period_start text not null,
      prev_value double precision,
      prev_start text,
      set_at timestamptz not null default now(),
      seeded boolean not null default false,
      primary key (shop_id, metric)
    )`);
    await sql.query(`create table if not exists dashboard_cache (
      id text primary key,
      data text not null,
      updated_at timestamptz not null default now()
    )`);
    const params: unknown[] = [];
    const tuples: string[] = [];
    for (const [shopId, metrics] of Object.entries(SEED)) {
      for (const [metric, pair] of Object.entries(metrics)) {
        if (!pair) continue;
        const n = params.length;
        tuples.push(`($${n + 1}, $${n + 2}, $${n + 3}, $${n + 4}, true)`);
        params.push(shopId, metric, pair[0], pair[1]);
      }
    }
    await sql.query(
      `insert into shop_records (shop_id, metric, value, period_start, seeded)
       values ${tuples.join(", ")} on conflict (shop_id, metric) do nothing`,
      params,
    );
  })().catch((error) => {
    ready = null;
    throw error;
  });
  await ready;
  return sql;
}

type RecordRow = {
  shop_id: string;
  metric: string;
  value: number;
  period_start: string;
  prev_value: number | null;
  prev_start: string | null;
  set_at: string;
  seeded: boolean;
};

function fromRow(row: RecordRow): ShopRecord & { seeded: boolean } {
  return {
    shopId: row.shop_id,
    metric: row.metric as RecordMetric,
    value: Number(row.value),
    start: row.period_start,
    prevValue: row.prev_value == null ? null : Number(row.prev_value),
    prevStart: row.prev_start,
    setAt: String(row.set_at),
    seeded: Boolean(row.seeded),
  };
}

export async function readRecords(sql: Sql) {
  const rows = await sql.query<RecordRow>("select * from shop_records");
  return rows.map(fromRow);
}

/** The week's numbers for one shop, in dashboard units. */
function weekValues(rows: Row[], shop: string) {
  const get = (key: string) => valueOf(rows, key, shop);
  const sales = get("sales");
  const cars = get("cars");
  const values: Partial<Record<RecordMetric, number | null>> = {
    sales,
    cars,
    billed: get("billed"),
    hpd: get("hpd"),
    proficiency: get("proficiency"),
    elr: get("elr"),
    spbh: get("spbh"),
    aro: sales != null && cars ? sales / cars : null,
    hpro: get("hpro"),
    recPerCar: get("recPerCar"),
    sellthrough: get("sellthrough"),
  };
  return values;
}

/** A rate only counts in a real week, and proficiency only when available hours look complete. */
function counts(metric: RecordMetric, value: number, values: Partial<Record<RecordMetric, number | null>>) {
  if (!Number.isFinite(value) || value <= 0) return false;
  const info = metricInfo(metric);
  if (info.kind !== "rate") return true;
  if ((values.sales ?? 0) < 3000 || (values.billed ?? 0) < 10) return false;
  if (metric === "proficiency" && value > 2) return false;
  return true;
}

async function raise(sql: Sql, shopId: string, metric: RecordMetric, value: number, start: string) {
  // Same week (or day) as the record: just move the number up. A new week: keep the old record as "prev".
  await sql.query(
    `update shop_records set
       prev_value = case when period_start = $4 then prev_value else value end,
       prev_start = case when period_start = $4 then prev_start else period_start end,
       value = $3, period_start = $4, set_at = now(), seeded = false
     where shop_id = $1 and metric = $2 and value < $3`,
    [shopId, metric, value, start],
  );
  await sql.query(
    `insert into shop_records (shop_id, metric, value, period_start) values ($1, $2, $3, $4)
     on conflict (shop_id, metric) do nothing`,
    [shopId, metric, value, start],
  );
}

/**
 * Week totals (sales, cars, billed hours) can set a record as soon as they pass it.
 * Rates only count once the week is over (final), so a big Monday can't fake one.
 */
export async function applyWeek(sql: Sql, weekStart: string, rows: Row[], final: boolean) {
  for (const [shopId, name] of Object.entries(SHOP_NAMES)) {
    const values = weekValues(rows, name);
    for (const info of RECORD_METRICS) {
      if (info.kind === "day") continue;
      if (info.kind === "rate" && !final) continue;
      const value = values[info.key];
      if (value == null || !counts(info.key, value, values)) continue;
      await raise(sql, shopId, info.key, value, weekStart);
    }
  }
}

export async function applyDay(sql: Sql, date: string, rows: Row[]) {
  for (const [shopId, name] of Object.entries(SHOP_NAMES)) {
    const value = valueOf(rows, "sales", name);
    if (value != null && value > 0) await raise(sql, shopId, "day", value, date);
  }
}

function addDays(iso: string, days: number) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Once per week: settle last week's rates (and totals) with the full week's numbers. */
export async function settleLastWeek(sql: Sql, thisMonday: string) {
  const lastMonday = addDays(thisMonday, -7);
  const id = `hof:settled:${lastMonday}`;
  const done = await sql.query("select 1 from dashboard_cache where id = $1", [id]);
  if (done.length > 0) return;
  const rows = await rangeRows(lastMonday, addDays(lastMonday, 6));
  await applyWeek(sql, lastMonday, rows, true);
  await sql.query(
    `insert into dashboard_cache (id, data, updated_at) values ($1, '1', now()) on conflict (id) do nothing`,
    [id],
  );
}

/**
 * What to celebrate for one shop: records broken this week (or this day), and
 * weekly rates that are ahead of the record so far. Nothing from the setup:
 * a seeded record, or one with nothing before it, is never announced.
 */
export function momentsFor(
  records: (ShopRecord & { seeded: boolean })[],
  shopId: string,
  weekStart: string,
  date: string,
  weekRows: Row[] | null,
): RecordMoment[] {
  const mine = records.filter((record) => record.shopId === shopId);
  const moments: RecordMoment[] = [];
  for (const record of mine) {
    if (record.seeded || record.prevValue == null) continue;
    const info = metricInfo(record.metric);
    const current = info.kind === "day" ? record.start === date : record.start === weekStart;
    if (!current) continue;
    moments.push({ metric: record.metric, kind: "new", value: record.value, oldValue: record.prevValue, oldStart: record.prevStart });
  }
  const name = SHOP_NAMES[shopId];
  if (weekRows && name) {
    const values = weekValues(weekRows, name);
    for (const info of RECORD_METRICS) {
      if (info.kind !== "rate") continue;
      const value = values[info.key];
      const record = mine.find((item) => item.metric === info.key);
      if (value == null || !record || !counts(info.key, value, values)) continue;
      if (value > record.value) {
        moments.push({ metric: info.key, kind: "pace", value, oldValue: record.value, oldStart: record.start });
      }
    }
  }
  return moments;
}
