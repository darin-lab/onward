import { createServerFn } from "@tanstack/react-start";
import type { DayFieldKey } from "@/lib/board/model";

const API_URL =
  "https://script.google.com/macros/s/AKfycbwdRuQXY6Yqjl0uZw-dhEFWqaEW7kQYOOXtl5sQzLoFcpnKGy46hwMmURGo-Rn3D7QU/exec";
const PIN = "320320";

const SHOP_NAMES: Record<string, string> = {
  fremont: "Fremont",
  campbell: "Campbell",
  "san-ramon": "San Ramon",
  "san-jose": "San Jose",
  "castro-valley": "Castro Valley",
};

type Row = { key: string; values: Record<string, number | null> };

export type ShopPull = {
  fields: Partial<Record<DayFieldKey, string>>;
  week: {
    totalSales: number | null;
    sellThrough: number | null;
    averageRepairOrder: number | null;
    hoursPerRepairOrder: number | null;
    recsPerVehicle: number | null;
    salesPerBilledHour: number | null;
    billedHours: number | null;
    cars: number | null;
  };
};

function round(value: number, places = 2) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function asNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function money(value: number) {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function percent(value: number) {
  return `${round(value * 100, 1)}%`;
}

async function rangeRows(start: string, end: string): Promise<Row[]> {
  const first = await fetch(API_URL, {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ fn: "getRangeView", args: [start, end], pin: PIN }),
  });
  const location = first.headers.get("location");
  if (!location) throw new Error("Dashboard did not respond");
  const second = await fetch(location);
  const data = (await second.json()) as { ok?: { rows?: Row[] }; error?: string };
  if (data.error || !data.ok?.rows) throw new Error(data.error || "Dashboard had no rows");
  return data.ok.rows;
}

function valueOf(rows: Row[], key: string, shop: string) {
  return asNumber(rows.find((row) => row.key === key)?.values[shop]);
}

export function readShop(rows: Row[], shop: string): ShopPull {
  const sales = valueOf(rows, "sales", shop);
  const cars = valueOf(rows, "cars", shop);
  const sellthrough = valueOf(rows, "sellthrough", shop);
  const proficiency = valueOf(rows, "proficiency", shop);
  const fields: ShopPull["fields"] = {};
  const put = (key: DayFieldKey, text: string | null) => {
    if (text != null) fields[key] = text;
  };
  if (proficiency != null) put("proficiency", percent(proficiency));
  const elr = valueOf(rows, "elr", shop);
  const spbh = valueOf(rows, "spbh", shop);
  const labor = valueOf(rows, "labor", shop);
  const cc = valueOf(rows, "cc", shop);
  const cash = valueOf(rows, "cash", shop);
  const hpro = valueOf(rows, "hpro", shop);
  const hpd = valueOf(rows, "hpd", shop);
  const billed = valueOf(rows, "billed", shop);
  if (elr != null) put("elr", money(elr));
  if (spbh != null) put("spbh", money(spbh));
  if (hpro != null) put("hpro", String(round(hpro)));
  if (hpd != null) put("hoursPerDay", String(round(hpd)));
  if (billed != null) put("billedHours", String(round(billed)));
  if (labor != null) put("laborSales", money(labor));
  if (sales != null) put("totalSales", money(sales));
  if (cars != null) put("carCount", String(round(cars, 0)));
  if (cc != null) put("creditCardPayments", money(cc));
  if (cash != null) put("cashCheckPayments", money(cash));
  return {
    fields,
    week: {
      totalSales: sales == null ? null : round(sales),
      sellThrough: sellthrough == null ? null : round(sellthrough * 100, 1),
      averageRepairOrder: sales != null && cars ? round(sales / cars) : null,
      hoursPerRepairOrder: hpro == null ? null : round(hpro),
      recsPerVehicle: (() => {
        const recs = valueOf(rows, "recPerCar", shop);
        return recs == null ? null : round(recs);
      })(),
      salesPerBilledHour: spbh == null ? null : round(spbh),
      billedHours: billed == null ? null : round(billed),
      cars: cars == null ? null : round(cars, 0),
    },
  };
}

export const pullShopRange = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const data = input as { shopId?: unknown; start?: unknown; end?: unknown };
    if (typeof data.shopId !== "string" || typeof data.start !== "string" || typeof data.end !== "string") {
      throw new Error("Need a shop and a date");
    }
    if (!SHOP_NAMES[data.shopId]) throw new Error("Unknown shop");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.start) || !/^\d{4}-\d{2}-\d{2}$/.test(data.end)) {
      throw new Error("Need a date");
    }
    return { shopId: data.shopId, start: data.start, end: data.end };
  })
  .handler(async ({ data }) => {
    try {
      const rows = await rangeRows(data.start, data.end);
      return { ok: true as const, ...readShop(rows, SHOP_NAMES[data.shopId] ?? "") };
    } catch {
      return { ok: false as const };
    }
  });

function pacificMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  return { start, end };
}

export const pullMonthSales = createServerFn({ method: "GET" }).handler(async () => {
  const { start, end } = pacificMonth();
  try {
    const rows = await rangeRows(start, end);
    const sales: Record<string, number> = {};
    for (const [shopId, name] of Object.entries(SHOP_NAMES)) {
      const value = valueOf(rows, "sales", name);
      if (value != null) sales[shopId] = round(value);
    }
    return { ok: true as const, start, end, sales };
  } catch {
    return { ok: false as const, start, end, sales: {} };
  }
});
