import { useState } from "react";
import { Link, Navigate } from "@tanstack/react-router";
import { format } from "date-fns";
import {
  addWeekISO,
  categoriesFor,
  companyPoll,
  featuredWeek,
  formatHours,
  formatMoney,
  formatRecord,
  peopleInLens,
  priorWeekISO,
  recordOf,
  shopRecord,
  weekRangeLabel,
  weekShape,
  weeksFor,
  type WeekLog,
} from "@/lib/board/model";
import { useBoard } from "@/lib/board/store";
import { CompanyPoll } from "@/components/board/poll";
import { ManagerSnapshot } from "@/components/board/tech-view";
import { Button, Card, fieldClass } from "@/components/board/ui";

export function Roster() {
  const techs = useBoard((state) => state.techs);
  const shops = useBoard((state) => state.shops);
  const storedWeeks = useBoard((state) => state.weeks);
  const categories = useBoard((state) => state.categories);
  const lens = useBoard((state) => state.lens);
  const viewer = useBoard((state) => state.viewer);
  const sampleCrew = useBoard((state) => state.sampleCrew);
  const prior = priorWeekISO();
  const preview = storedWeeks.length === 0 && lens === "owner";
  const weeks = preview ? previewWeeks(prior) : storedWeeks;
  const visible = peopleInLens(techs, lens);
  const shop = shops.find((item) => item.id === lens);
  const manager = techs.find((person) => person.shopId === lens && person.kind === "manager");
  const looking = techs.find((person) => person.id === viewer);
  if (looking?.kind === "technician") {
    return <Navigate to="/t/$techId" params={{ techId: looking.id }} />;
  }

  return (
    <div>
      <p className="text-sm text-honey">Week of {weekRangeLabel(prior)}</p>
      {lens === "owner" ? (
        <>
          <h1 className="mt-2 text-4xl text-ink">Driven Onward</h1>
          <p className="mt-3 max-w-prose text-muted">
            Weekly feedback so you can see the progress and build on what is working.
          </p>
          {preview ? (
            <p className="mt-3 text-sm text-honey">
              Sample of a few weeks, so you can see the page. Nothing here is saved.
            </p>
          ) : null}
        </>
      ) : (
        <>
          <h1 className="mt-2 text-4xl text-ink">{shop?.name ?? "Shop"}</h1>
          {looking?.kind === "manager" && manager ? (
            <Link
              to="/t/$techId"
              params={{ techId: manager.id }}
              className="mt-4 block rounded-2xl bg-surface p-4 shadow-border"
            >
              <p className="text-sm text-muted">Your week</p>
              <p className="mt-1 text-2xl text-ink">{manager.name}</p>
              <p className="text-sm text-muted">{manager.role}</p>
              <SavedWeekLine techId={manager.id} />
            </Link>
          ) : manager ? (
            <p className="mt-3 text-muted">{manager.name}</p>
          ) : (
            <p className="mt-3 text-muted">No manager is named yet.</p>
          )}
          <Link
            to="/day/$shopId"
            params={{ shopId: lens }}
            className="mt-4 inline-flex min-h-11 items-center justify-center rounded-md bg-honey px-5 font-display text-sm font-semibold tracking-wide text-honey-fg uppercase italic"
          >
            End of Day Report
          </Link>
        </>
      )}
      {sampleCrew && lens !== "owner" ? (
        <p className="mt-3 max-w-prose text-sm text-muted">
          Billed hours are from the sheet. Cars, recommendations per vehicle, and the record
          wait for the manager.
        </p>
      ) : null}

      <ul className="mt-8 grid gap-3 sm:grid-cols-2">
        {visible.map((tech, index) => {
          const week = featuredWeek(weeks, tech.id);
          const habitSet = categoriesFor(categories, tech.kind);
          const rows = habitSet.flatMap((category) => {
            const score = week?.scores[category.id];
            return score == null ? [] : [{ name: category.name, score }];
          });
          const home = shops.find((item) => item.id === tech.shopId);
          const crewRecord = shopRecord(techs, weeks, tech.shopId);
          const standing = companyPoll(techs, weeks).find((row) => row.tech.id === tech.id);
          const billed = week?.billedHours;
          return (
            <li key={tech.id} className="rise" style={{ animationDelay: `${index * 50}ms` }}>
              <div className="flex h-full flex-col rounded-2xl bg-surface p-4 shadow-border">
                <Link
                  to="/t/$techId"
                  params={{ techId: tech.id }}
                  className="block"
                >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-2xl text-ink">
                      {tech.kind === "manager" ? home?.name : tech.name}
                      {tech.kind === "technician" ? (
                        <span className="ml-2 text-sm font-normal tabular-nums text-muted">
                          {formatRecord(
                            standing?.record ?? { wins: 0, losses: 0, draws: 0, played: 0 },
                          )}
                        </span>
                      ) : null}
                    </h2>
                    <p className="text-sm text-muted">
                      {tech.kind === "manager" ? home?.address : home?.name}
                    </p>
                    {tech.kind === "manager" ? (
                      <MonthSales weeks={weeks} managerId={tech.id} />
                    ) : null}
                  </div>
                  <div className="text-right">
                    <p className="font-display text-2xl leading-none font-semibold whitespace-nowrap tabular-nums">
                      {tech.kind === "manager"
                        ? formatRecord(crewRecord)
                        : billed != null
                          ? formatHours(billed)
                          : "—"}
                    </p>
                    {tech.kind === "technician" ? (
                      <p className="mt-1 text-xs text-muted">billed</p>
                    ) : null}
                  </div>
                </div>
                {tech.kind === "manager" ? (
                  <ManagerSnapshot tech={tech} weeks={weeks} />
                ) : null}
                </Link>
                {tech.kind === "manager" ? (
                  <ShopReviews shopId={tech.shopId} weeks={weeks} />
                ) : null}
                {week?.practice || rows.length > 0 ? (
                  <p className="mt-3 line-clamp-3 text-sm text-muted">
                    {week?.practice || weekShape(rows)}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      {visible.length === 0 ? (
        <p className="mt-8 text-muted">No one is on this list yet.</p>
      ) : null}

      <CompanyPoll weeks={weeks} />

      {viewer === "owner" ? (
        <details className="mt-10">
          <summary className="min-h-11 cursor-pointer text-sm text-muted">
            Rename shops, habits, and people
          </summary>
          <div className="mt-4 space-y-4">
            <CrewTools />
          </div>
        </details>
      ) : null}
    </div>
  );
}

function MonthSales({ weeks, managerId }: { weeks: WeekLog[]; managerId: string }) {
  const now = new Date();
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const total = weeks.reduce((sum, week) => {
    if (week.techId !== managerId || week.totalSales == null) return sum;
    if (!week.weekStart.startsWith(stamp)) return sum;
    return sum + week.totalSales;
  }, 0);
  if (total <= 0) return null;
  return (
    <p className="mt-3 text-sm text-ink">
      <span className="text-muted">{format(now, "MMMM")} sales </span>
      <span className="font-display text-xl font-semibold tabular-nums">{formatMoney(total)}</span>
    </p>
  );
}

function previewWeeks(latest: string): WeekLog[] {
  const starts = [3, 2, 1, 0].map((back) => addWeekISO(latest, -back));
  const techs: Record<string, number[][]> = {
    antonio: [
      [36, 12, 2100, 104],
      [39, 13, 2400, 110],
      [42, 14, 2650, 116],
      [44, 15, 2800, 122],
    ],
    tim: [
      [30, 10, 1700, 96],
      [32, 11, 1850, 101],
      [34, 11, 2000, 108],
      [36, 12, 2100, 112],
    ],
    jim: [
      [34, 12, 2000, 100],
      [37, 13, 2300, 109],
      [39, 13, 2450, 114],
      [41, 14, 2600, 119],
    ],
    francisco: [
      [28, 10, 1600, 94],
      [30, 11, 1750, 99],
      [32, 11, 1850, 106],
      [33, 12, 1900, 111],
    ],
    nathan: [
      [32, 11, 1900, 102],
      [35, 12, 2100, 108],
      [37, 13, 2250, 113],
      [39, 13, 2400, 117],
    ],
    jeremiah: [
      [26, 9, 1500, 92],
      [28, 10, 1600, 98],
      [30, 10, 1700, 104],
      [31, 11, 1750, 109],
    ],
    edgar: [
      [31, 11, 1800, 101],
      [34, 12, 2000, 107],
      [36, 12, 2150, 112],
      [38, 13, 2300, 118],
    ],
    andre: [
      [24, 8, 1400, 90],
      [26, 9, 1500, 97],
      [28, 9, 1550, 103],
      [29, 10, 1600, 108],
    ],
    duc: [
      [35, 12, 2200, 105],
      [38, 13, 2400, 111],
      [40, 14, 2550, 116],
      [42, 14, 2700, 121],
    ],
  };
  const losses: Record<string, number[]> = {
    antonio: [1, 0, 0, 0],
    tim: [0, 1, 0, 1],
    jim: [0, 0, 1, 0],
    francisco: [1, 0, 1, 0],
    nathan: [0, 0, 0, 1],
    jeremiah: [1, 1, 0, 0],
    edgar: [0, 1, 0, 0],
    andre: [0, 0, 1, 1],
    duc: [0, 0, 0, 0],
  };
  const managers: Record<string, number[][]> = {
    jon: [
      [9800, 58, 390, 2.0, 1.6, 280, 5400],
      [11200, 61, 410, 2.1, 1.7, 300, 6100],
      [12100, 63, 425, 2.1, 1.8, 310, 6700],
      [13270, 64, 442, 2.1, 1.8, 322, 7400],
    ],
    david: [
      [4200, 48, 310, 1.4, 1.2, 210, 2200],
      [4600, 49, 320, 1.4, 1.3, 220, 2400],
      [4800, 50, 330, 1.5, 1.3, 226, 2600],
      [5096, 51, 340, 1.5, 1.4, 232, 2800],
    ],
    israel: [
      [24000, 62, 1380, 3.1, 1.9, 410, 14000],
      [27500, 64, 1440, 3.2, 2.0, 430, 15800],
      [29800, 66, 1480, 3.3, 2.0, 442, 17200],
      [31960, 68, 1522, 3.4, 2.1, 454, 18500],
    ],
    dillon: [
      [12400, 55, 920, 1.9, 1.5, 440, 6800],
      [14100, 57, 970, 2.0, 1.6, 460, 7600],
      [15400, 59, 1000, 2.0, 1.6, 480, 8400],
      [16601, 61, 1038, 2.1, 1.7, 495, 9100],
    ],
    kevin: [
      [10200, 58, 710, 1.6, 1.4, 410, 5600],
      [11400, 60, 740, 1.6, 1.5, 430, 6200],
      [12400, 62, 770, 1.7, 1.5, 445, 6800],
      [13481, 63, 793, 1.7, 1.6, 459, 7400],
    ],
  };
  const managerWeeks: WeekLog[] = Object.entries(managers).flatMap(([techId, rows]) =>
    rows.map((row, index) => ({
      techId,
      weekStart: starts[index] ?? latest,
      hours: 0,
      billedHours: null,
      cars: null,
      recsPerVehicle: row[4] ?? null,
      totalSales: row[0] ?? null,
      sellThrough: row[1] ?? null,
      averageRepairOrder: row[2] ?? null,
      hoursPerRepairOrder: row[3] ?? null,
      salesPerBilledHour: row[5] ?? null,
      grossProfit: row[6] ?? null,
      efficiency: null,
      billedNote: "",
      carsNote: "",
      recsNote: "",
      efficiencyNote: "",
      result: null,
      boomerangs: [],
      scores: {},
      working: "",
      practice: "",
      submitted: true,
    })),
  );
  return [
    ...Object.entries(techs).flatMap(([techId, rows]) =>
      rows.map((row, index) => ({
        techId,
        weekStart: starts[index] ?? latest,
        hours: 0,
        billedHours: row[0] ?? null,
        cars: row[1] ?? null,
        recsPerVehicle: row[2] ?? null,
        totalSales: null,
        sellThrough: null,
        averageRepairOrder: null,
        hoursPerRepairOrder: null,
        salesPerBilledHour: null,
        grossProfit: null,
        efficiency: row[3] ?? null,
        billedNote: "",
        carsNote: "",
        recsNote: "",
        efficiencyNote: "",
        result: null,
        boomerangs: Array.from({ length: losses[techId]?.[index] ?? 0 }, (_, loss) => ({
          id: `${techId}-${index}-${loss}`,
          ro: "1000",
          note: "Came back.",
        })),
        scores: { "t-talk": 3, "t-moving": 4, "t-team": 4, "t-safe": 5 },
        working: "",
        practice: "",
        submitted: true,
      })),
    ),
    ...managerWeeks,
  ];
}

function ShopReviews({ shopId, weeks }: { shopId: string; weeks: WeekLog[] }) {
  const techs = useBoard((state) => state.techs);
  const crew = techs
    .filter((person) => person.kind === "technician" && person.shopId === shopId)
    .map((person) => ({
      person,
      week: featuredWeek(weeks, person.id),
      record: recordOf(weeksFor(weeks, person.id)),
    }))
    .filter((row) => row.week != null);
  if (crew.length === 0) return null;
  return (
    <ul className="mt-4 space-y-3 border-t border-line pt-3">
      {crew.map((row) => (
        <li key={row.person.id}>
          <Link to="/t/$techId" params={{ techId: row.person.id }} className="block">
            <span className="flex items-baseline justify-between gap-2">
              <span className="text-ink">
                {row.person.name}{" "}
                <span className="text-sm tabular-nums text-muted">{formatRecord(row.record)}</span>
              </span>
              <span className="text-xs text-muted">
                {row.week ? weekRangeLabel(row.week.weekStart) : ""}
              </span>
            </span>
            <span className="mt-1 block text-sm tabular-nums text-muted">
              {[
                row.week?.billedHours != null ? `${formatHours(row.week.billedHours)} billed` : null,
                row.week?.cars != null ? `${formatHours(row.week.cars)} cars` : null,
                row.week?.recsPerVehicle != null ? formatMoney(row.week.recsPerVehicle) : null,
                row.week?.efficiency != null ? `${formatHours(row.week.efficiency)}%` : null,
              ]
                .filter(Boolean)
                .join(" · ") || "Review started"}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function SavedWeekLine({ techId }: { techId: string }) {
  const weeks = useBoard((state) => state.weeks);
  const week = featuredWeek(weeks, techId);
  if (!week) return null;
  const bits = [
    week.totalSales != null ? formatMoney(week.totalSales) : null,
    week.sellThrough != null ? `${formatHours(week.sellThrough)}% sell through` : null,
    week.averageRepairOrder != null ? `${formatMoney(week.averageRepairOrder)} average` : null,
    week.hoursPerRepairOrder != null ? `${formatHours(week.hoursPerRepairOrder)} hours per order` : null,
  ].filter(Boolean);
  return (
    <p className="mt-3 text-sm text-muted">
      Week of {weekRangeLabel(week.weekStart)}
      {bits.length > 0 ? ` · ${bits.join(" · ")}` : ""}
    </p>
  );
}

function CrewTools() {
  const lens = useBoard((state) => state.lens);
  return (
    <div className="space-y-4">
      {lens === "owner" ? null : <AddTech shopId={lens} />}
      <CategoryEditor />
      <ShopNames />
      <Restore />
    </div>
  );
}

function AddTech({ shopId }: { shopId: string }) {
  const addTech = useBoard((state) => state.addTech);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");

  return (
    <Card>
      <h3 className="text-xl">Add a technician</h3>
      <form
        className="mt-4 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim()) return;
          addTech(name, role, shopId);
          setName("");
          setRole("");
        }}
      >
        <label className="block text-sm text-muted" htmlFor="new-name">
          Name
        </label>
        <input
          id="new-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={fieldClass}
          placeholder="Jordan Lee"
          autoComplete="off"
        />
        <label className="block text-sm text-muted" htmlFor="new-role">
          Role
        </label>
        <input
          id="new-role"
          value={role}
          onChange={(event) => setRole(event.target.value)}
          className={fieldClass}
          placeholder="Service tech"
          autoComplete="off"
        />
        <Button type="submit" disabled={!name.trim()}>
          Add to this shop
        </Button>
      </form>
    </Card>
  );
}

function CategoryEditor() {
  const categories = useBoard((state) => state.categories);
  const lens = useBoard((state) => state.lens);
  const updateCategory = useBoard((state) => state.updateCategory);
  const groups =
    lens === "owner"
      ? [
          { title: "Habits for managers", kind: "manager" as const },
          { title: "Habits for technicians", kind: "technician" as const },
        ]
      : [{ title: "Habits for technicians", kind: "technician" as const }];

  return (
    <Card>
      <h3 className="text-xl">Habits you're tracking</h3>
      <p className="mt-2 text-sm text-muted">
        Rename them in your own words. Older weeks stay attached.
      </p>
      {groups.map((group) => (
        <div key={group.kind} className="mt-5">
          <h4 className="font-sans text-sm font-medium text-honey">{group.title}</h4>
          <ul className="mt-3 space-y-4">
            {categories
              .filter((category) => category.kind === group.kind)
              .map((category) => (
                <li key={category.id} className="space-y-2">
                  <label className="sr-only" htmlFor={`cat-${category.id}`}>
                    Habit
                  </label>
                  <input
                    id={`cat-${category.id}`}
                    value={category.name}
                    onChange={(event) =>
                      updateCategory(category.id, { name: event.target.value })
                    }
                    onBlur={() => {
                      if (!category.name.trim()) updateCategory(category.id, { name: "Habit" });
                    }}
                    className={fieldClass}
                  />
                  <label className="sr-only" htmlFor={`hint-${category.id}`}>
                    What this habit means
                  </label>
                  <input
                    id={`hint-${category.id}`}
                    value={category.hint}
                    onChange={(event) =>
                      updateCategory(category.id, { hint: event.target.value })
                    }
                    className={fieldClass}
                    placeholder="What this habit means"
                  />
                </li>
              ))}
          </ul>
        </div>
      ))}
    </Card>
  );
}

function ShopNames() {
  const lens = useBoard((state) => state.lens);
  const shops = useBoard((state) => state.shops);
  const updateShop = useBoard((state) => state.updateShop);
  if (lens !== "owner") return null;
  return (
    <Card>
      <h3 className="text-xl">Shop names</h3>
      <ul className="mt-4 space-y-3">
        {shops.map((shop) => (
          <li key={shop.id} className="space-y-2">
            <label className="sr-only" htmlFor={`shop-${shop.id}`}>
              Shop name
            </label>
            <input
              id={`shop-${shop.id}`}
              value={shop.name}
              onChange={(event) => updateShop(shop.id, { name: event.target.value })}
              className={fieldClass}
            />
            <label className="sr-only" htmlFor={`addr-${shop.id}`}>
              Address
            </label>
            <input
              id={`addr-${shop.id}`}
              value={shop.address}
              onChange={(event) => updateShop(shop.id, { address: event.target.value })}
              className={fieldClass}
            />
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Restore() {
  const restoreSample = useBoard((state) => state.restoreSample);
  return (
    <button
      type="button"
      className="min-h-11 text-sm text-muted underline-offset-4 hover:underline"
      onClick={() => {
        if (
          window.confirm(
            "Restore the sample shops? Edits saved in this browser will be replaced.",
          )
        ) {
          restoreSample();
        }
      }}
    >
      Restore the sample shops
    </button>
  );
}
