import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { format, parseISO } from "date-fns";
import { pullWeekSales } from "@/lib/board/dashboard.functions";
import {
  companyPoll,
  formatHours,
  formatMoney,
  formatRecord,
  leaderboardMonth,
  monthHoursPerRo,
  monthName,
  monthRecsPerVehicle,
  type Tech,
  type WeekLog,
} from "@/lib/board/model";
import { useBoard } from "@/lib/board/store";
import { cn } from "@/lib/cn";

export function CompanyPoll({
  highlightId,
  weeks: weeksOverride,
}: {
  highlightId?: string;
  weeks?: WeekLog[];
}) {
  const techs = useBoard((state) => state.techs);
  const storedWeeks = useBoard((state) => state.weeks);
  const weeks = weeksOverride ?? storedWeeks;
  const shops = useBoard((state) => state.shops);
  const billed = companyPoll(techs, weeks);
  const month = leaderboardMonth(techs, weeks);
  const recs = recommendationsBoard(techs, weeks, month);
  const hpro = monthBoard(techs, weeks, month, (techId) => monthHoursPerRo(weeks, techId, month), (value) =>
    value.toFixed(2),
  );
  const label = monthName(month);

  return (
    <section className="mt-10">
      <h2 className="text-2xl">Leaderboard</h2>
      <div className="mt-4 grid gap-8 sm:grid-cols-2">
      {highlightId ? null : <ShopWeekBoard shops={shops} />}
      <Board
        metric={`Billed hours · ${label}`}
        rows={billed.map((row) => ({
          tech: row.tech,
          rank: row.rank,
          record: formatRecord(row.record),
          value: row.billed == null ? "—" : formatHours(row.billed),
          shopId: row.tech.shopId,
        }))}
        shops={shops}
        highlightId={highlightId}
      />
      <Board
        metric={`Recommendations per vehicle · ${label}`}
        rows={recs}
        shops={shops}
        highlightId={highlightId}
      />
      <Board
        metric={`Hours per repair order · ${label}`}
        rows={hpro}
        shops={shops}
        highlightId={highlightId}
      />
      </div>
    </section>
  );
}

/** A month leaderboard: highest first, techs with no number yet at the bottom. */
function monthBoard(
  techs: Tech[],
  weeks: WeekLog[],
  month: string,
  amountOf: (techId: string) => number | null,
  show: (value: number) => string,
) {
  const records = companyPoll(techs, weeks);
  const rows = techs
    .filter((person) => person.kind === "technician")
    .map((tech) => ({
      tech,
      amount: amountOf(tech.id),
      record: formatRecord(
        records.find((row) => row.tech.id === tech.id)?.record ?? { wins: 0, losses: 0, draws: 0, played: 0 },
      ),
    }))
    .sort((a, b) => (b.amount ?? -1) - (a.amount ?? -1) || a.tech.name.localeCompare(b.tech.name));
  let place = 0;
  return rows.map((row) => {
    const ranked = row.amount != null;
    if (ranked) place += 1;
    return {
      tech: row.tech,
      rank: ranked ? place : null,
      record: row.record,
      value: row.amount == null ? "—" : show(row.amount),
      shopId: row.tech.shopId,
    };
  });
}

function recommendationsBoard(techs: Tech[], weeks: WeekLog[], month: string) {
  const rows = techs
    .filter((person) => person.kind === "technician")
    .map((tech) => {
      const amount = monthRecsPerVehicle(weeks, tech.id, month);
      return {
        tech,
        amount,
        record: formatRecord(
          companyPoll(techs, weeks).find((row) => row.tech.id === tech.id)?.record ?? {
            wins: 0,
            losses: 0,
            draws: 0,
            played: 0,
          },
        ),
      };
    })
    .sort(
      (a, b) =>
        (b.amount ?? -1) - (a.amount ?? -1) || a.tech.name.localeCompare(b.tech.name),
    );
  let place = 0;
  return rows.map((row) => {
    const ranked = row.amount != null;
    if (ranked) place += 1;
    return {
      tech: row.tech,
      rank: ranked ? place : null,
      record: row.record,
      value: row.amount == null ? "—" : formatMoney(row.amount),
      shopId: row.tech.shopId,
    };
  });
}

function Board({
  metric,
  rows,
  shops,
  highlightId,
}: {
  metric: string;
  rows: { tech: Tech; rank: number | null; record: string; value: string; shopId: string }[];
  shops: { id: string; name: string }[];
  highlightId?: string;
}) {
  return (
    <section>
      <p className="text-sm text-muted">{metric}</p>
      <ol className="mt-4 space-y-2">
        {rows.map((row) => {
          const shopName = shops.find((shop) => shop.id === row.shopId)?.name ?? "";
          const highlight = row.tech.id === highlightId;
          return (
            <li key={row.tech.id}>
              <Link
                to="/t/$techId"
                params={{ techId: row.tech.id }}
                className={cn(
                  "flex min-h-14 items-center gap-3 rounded-2xl px-3 py-2",
                  highlight ? "bg-honey text-honey-fg" : "bg-surface shadow-border",
                )}
              >
                <span
                  className={cn(
                    "w-8 font-display text-2xl font-semibold tabular-nums",
                    // Top three in gold, silver and bronze, like the shop ranking.
                    row.rank === 1 && "metal metal-gold",
                    row.rank === 2 && "metal metal-silver",
                    row.rank === 3 && "metal metal-bronze",
                  )}
                >
                  {row.rank ?? "–"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="truncate text-base font-medium">{row.tech.name}</span>
                    <span
                      className={cn(
                        "shrink-0 text-xs tabular-nums",
                        highlight ? "text-honey-fg/80" : "text-muted",
                      )}
                    >
                      {row.record}
                    </span>
                  </span>
                  <span className={cn("block truncate text-sm", highlight ? "text-honey-fg/80" : "text-muted")}>
                    {shopName}
                  </span>
                </span>
                <span className="font-display text-xl font-semibold tabular-nums">{row.value}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function standingFor(techs: Tech[], weeks: Parameters<typeof companyPoll>[1], techId: string) {
  return companyPoll(techs, weeks).find((row) => row.tech.id === techId) ?? null;
}

/** Each shop's weekly sales goal. */
const WEEK_SALES_GOAL = 24000;

type WeekNumbers = { start: string; sales: Record<string, number>; cars: Record<string, number> };

/** Shops ranked by sales from Monday through today, from the dashboard, against the weekly goal. */
function ShopWeekBoard({ shops }: { shops: { id: string; name: string }[] }) {
  const [week, setWeek] = useState<WeekNumbers | null>(null);
  useEffect(() => {
    let cancel = false;
    let fresh = false;
    void pullWeekSales({ data: { cached: true } })
      .then((result) => {
        if (!cancel && !fresh && result.ok) setWeek(result);
      })
      .catch(() => undefined);
    void pullWeekSales({ data: { cached: false } })
      .then((result) => {
        if (cancel || !result.ok) return;
        fresh = true;
        setWeek(result);
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, []);

  const rows = shops
    .map((shop) => ({ shop, sales: week?.sales[shop.id] ?? null, cars: week?.cars[shop.id] ?? null }))
    .sort((a, b) => (b.sales ?? -1) - (a.sales ?? -1));
  const since = week ? format(parseISO(week.start), "EEE MMM d") : "Monday";
  const money = (value: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);

  return (
    <section>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm text-muted">Shop sales · This week so far ({since} – today)</p>
        <span className="shrink-0 font-display text-xs tracking-widest text-honey uppercase">Shops</span>
      </div>
      <ol className="mt-4 space-y-2">
        {rows.map((row, index) => {
          const rank = row.sales != null && row.sales > 0 ? index + 1 : null;
          const share = row.sales == null ? 0 : Math.min(row.sales / WEEK_SALES_GOAL, 1);
          const hit = row.sales != null && row.sales >= WEEK_SALES_GOAL;
          return (
            <li
              key={row.shop.id}
              className="relative flex min-h-14 items-center gap-3 overflow-hidden rounded-2xl bg-surface px-3 py-2 shadow-border"
            >
              <span
                aria-hidden="true"
                className="absolute inset-y-0 left-0"
                style={{ width: `${share * 100}%`, background: hit ? "rgba(61, 220, 132, 0.18)" : "rgba(225, 6, 0, 0.22)" }}
              />
              <span
                className={cn(
                  "relative w-10 font-display text-2xl font-semibold italic tabular-nums",
                  rank === 1 && "metal metal-gold",
                  rank === 2 && "metal metal-silver",
                  rank === 3 && "metal metal-bronze",
                )}
              >
                {rank ? `#${rank}` : "–"}
              </span>
              <span className="relative min-w-0 flex-1">
                <span className="block truncate font-display text-lg font-semibold tracking-wide uppercase">
                  {row.shop.name}
                </span>
                <span className="block truncate text-sm text-muted">
                  {row.cars != null ? `${row.cars} cars · ` : ""}
                  {hit
                    ? "Goal hit"
                    : `${money(Math.max(WEEK_SALES_GOAL - (row.sales ?? 0), 0))} to ${money(WEEK_SALES_GOAL)}`}
                </span>
              </span>
              <span
                className="relative font-display text-xl font-semibold tabular-nums"
                style={hit ? { color: "#3DDC84" } : undefined}
              >
                {row.sales == null ? "—" : money(row.sales)}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-xs text-muted">
        Monday to today, from the shop dashboard. Goal {money(WEEK_SALES_GOAL)} per shop. Starts over each Monday.
      </p>
    </section>
  );
}
