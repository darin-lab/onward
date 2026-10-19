import { Link } from "@tanstack/react-router";
import {
  companyPoll,
  featuredWeek,
  formatHours,
  formatMoney,
  formatRecord,
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
  const recs = recommendationsBoard(techs, weeks);

  return (
    <section className="mt-10">
      <h2 className="text-2xl">Leaderboard</h2>
      <div className="mt-4 grid gap-8 sm:grid-cols-2">
      <Board
        metric="Billed hours"
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
        metric="Recommendations per vehicle"
        rows={recs}
        shops={shops}
        highlightId={highlightId}
      />
      </div>
    </section>
  );
}

function recommendationsBoard(techs: Tech[], weeks: WeekLog[]) {
  const rows = techs
    .filter((person) => person.kind === "technician")
    .map((tech) => {
      const latest = featuredWeek(weeks, tech.id);
      return {
        tech,
        amount: latest?.recsPerVehicle ?? null,
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
                <span className="w-8 font-display text-2xl font-semibold tabular-nums">
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
