import { createServerFn } from "@tanstack/react-start";
import type { RecordMoment, ShopRecord } from "@/lib/board/hof";

async function signedIn() {
  const { requireViewer } = await import("@/lib/board/darin.server");
  return requireViewer();
}

/** Every shop's records, for the Hall of Fame page and the manager review. */
export const getHallOfFame = createServerFn({ method: "GET" }).handler(async () => {
  await signedIn();
  const { hofSql, readRecords, settleLastWeek } = await import("@/lib/board/hof.server");
  const { pacificWeek } = await import("@/lib/board/dashboard.functions");
  const sql = await hofSql();
  await settleLastWeek(sql, pacificWeek().start).catch(() => undefined);
  const records: ShopRecord[] = (await readRecords(sql)).map(({ seeded, ...record }) => ({
    ...record,
    announced: !seeded && record.prevValue != null,
  }));
  return { records };
});

function mondayOf(iso: string) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

/**
 * End of Day: bring the records up to date with this week so far and this day,
 * then say what this shop broke (or is on pace to break).
 */
export const checkShopRecords = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const data = input as { shopId?: unknown; date?: unknown };
    if (typeof data.shopId !== "string" || typeof data.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
      throw new Error("Need a shop and a date");
    }
    return { shopId: data.shopId, date: data.date };
  })
  .handler(async ({ data }): Promise<{ ok: boolean; moments: RecordMoment[] }> => {
    await signedIn();
    try {
      const { hofSql, readRecords, settleLastWeek, applyWeek, applyDay, momentsFor } = await import(
        "@/lib/board/hof.server"
      );
      const { pacificWeek, rangeRows } = await import("@/lib/board/dashboard.functions");
      const sql = await hofSql();
      const thisMonday = pacificWeek().start;
      await settleLastWeek(sql, thisMonday).catch(() => undefined);
      const weekStart = mondayOf(data.date);
      const [weekRows, dayRows] = await Promise.all([rangeRows(weekStart, data.date), rangeRows(data.date, data.date)]);
      // Only this week's totals can still move; an older week was settled when it ended.
      if (weekStart === thisMonday) await applyWeek(sql, weekStart, weekRows, false);
      await applyDay(sql, data.date, dayRows);
      const records = await readRecords(sql);
      return { ok: true, moments: momentsFor(records, data.shopId, weekStart, data.date, weekRows) };
    } catch {
      return { ok: false, moments: [] };
    }
  });
