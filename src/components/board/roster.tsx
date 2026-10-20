import { useEffect, useState } from "react";
import { Link, Navigate } from "@tanstack/react-router";
import { format } from "date-fns";
import {
  categoriesFor,
  companyPoll,
  featuredWeek,
  formatHours,
  formatMoney,
  formatRecord,
  isOwnerViewer,
  peopleInLens,
  priorWeekISO,
  recordOf,
  shopRecord,
  weekRangeLabel,
  weekShape,
  weeksFor,
  type WeekLog,
} from "@/lib/board/model";
import { pinAssignments, setPersonPin } from "@/lib/board/pin.functions";
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
  const prior = priorWeekISO();
  const weeks = storedWeeks;
  const visible = peopleInLens(techs, lens);
  const shop = shops.find((item) => item.id === lens);
  const manager = techs.find((person) => person.shopId === lens && person.kind === "manager");
  const looking = techs.find((person) => person.id === viewer);
  if (looking?.kind === "technician") {
    return <Navigate to="/t/$techId" params={{ techId: looking.id }} />;
  }

  return (
    <div>
      {lens === "owner" ? null : (
        <p className="text-sm text-honey">Week of {weekRangeLabel(prior)}</p>
      )}
      {lens === "owner" ? (
        <>
          <h1 className="mt-2 text-4xl text-ink">Driven Onward</h1>
          <p className="mt-3 max-w-prose text-muted">
            Weekly feedback so you can see the progress and build on what is working.
          </p>
          <p className="mt-3 text-sm text-honey">Week of {weekRangeLabel(prior)}</p>
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

      {isOwnerViewer(viewer) ? (
        <details className="mt-10">
          <summary className="min-h-11 cursor-pointer text-sm text-muted">
            Rename shops, habits, and people. Set PINs.
          </summary>
          <div className="mt-4 space-y-4">
            <PinList />
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

function PinList() {
  const techs = useBoard((state) => state.techs);
  const [saved, setSaved] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const people = [
    { id: "darin", name: "Darin Dinis" },
    { id: "arun", name: "Arun" },
    ...techs.map((person) => ({ id: person.id, name: person.name })),
  ];

  useEffect(() => {
    void pinAssignments()
      .then((ids) => setSaved(ids))
      .catch(() => setSaved([]));
  }, []);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">PINs</p>
      {people.map((person) => (
        <PinRow
          key={person.id}
          personId={person.id}
          name={person.name}
          hasPin={saved.includes(person.id)}
          onSaved={() => {
            setSaved((current) => (current.includes(person.id) ? current : [...current, person.id]));
            setNote(`${person.name} saved.`);
          }}
          onFailed={(reason) => setNote(reason)}
        />
      ))}
      {note ? <p className="text-sm text-muted">{note}</p> : null}
    </div>
  );
}

function PinRow({
  personId,
  name,
  hasPin,
  onSaved,
  onFailed,
}: {
  personId: string;
  name: string;
  hasPin: boolean;
  onSaved: () => void;
  onFailed: (reason: string) => void;
}) {
  const [pin, setPin] = useState("");
  return (
    <form
      className="flex items-center gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void setPersonPin({ data: { personId, pin } }).then((result) => {
          if (!result.ok) {
            onFailed(result.reason);
            return;
          }
          setPin("");
          onSaved();
        });
      }}
    >
      <label className="min-w-0 flex-1 text-sm text-ink" htmlFor={`pin-${personId}`}>
        {name}
        {hasPin ? <span className="ml-2 text-muted">saved</span> : null}
      </label>
      <input
        id={`pin-${personId}`}
        inputMode="numeric"
        autoComplete="off"
        maxLength={4}
        value={pin}
        onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
        placeholder="4 digits"
        className="min-h-11 w-28 rounded-md bg-raised px-3 text-ink shadow-border"
      />
      <Button type="submit" tone="quiet" disabled={pin.length !== 4}>
        Save
      </Button>
    </form>
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
