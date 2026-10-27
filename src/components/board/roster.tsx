import { useEffect, useState, type ReactNode } from "react";
import { Link, Navigate } from "@tanstack/react-router";
import { format } from "date-fns";
import {
  companyPoll,
  featuredWeek,
  formatHours,
  formatMoney,
  formatRecord,
  isOwnerViewer,
  peopleInLens,
  priorWeekISO,
  shopRecord,
  weekRangeLabel,
  type WeekLog,
} from "@/lib/board/model";
import { pinAssignments, setPersonPin } from "@/lib/board/pin.functions";
import { pullMonthSales } from "@/lib/board/dashboard.functions";
import { useBoard } from "@/lib/board/store";
import { CompanyPoll } from "@/components/board/poll";
import { ManagerSnapshot } from "@/components/board/tech-view";
import { BrickPhone, CallComposer, CallReview, pendingCalls } from "@/components/board/phone-call";
import { CashDesk, CashRequest, Bills } from "@/components/board/cash";
import { Button, Card, fieldClass } from "@/components/board/ui";
import { cn } from "@/lib/cn";

export function Roster() {
  const techs = useBoard((state) => state.techs);
  const shops = useBoard((state) => state.shops);
  const storedWeeks = useBoard((state) => state.weeks);
  const lens = useBoard((state) => state.lens);
  const viewer = useBoard((state) => state.viewer);
  const prior = priorWeekISO();
  const weeks = storedWeeks;
  const visible = peopleInLens(techs, lens);
  const shop = shops.find((item) => item.id === lens);
  const manager = techs.find((person) => person.shopId === lens && person.kind === "manager");
  const looking = techs.find((person) => person.id === viewer);
  const [monthCars, setMonthCars] = useState<Record<string, number>>({});
  useEffect(() => {
    let cancel = false;
    void loadMonthSales().then((result) => {
      if (!cancel) setMonthCars(result.cars);
    });
    return () => {
      cancel = true;
    };
  }, []);
  if (looking?.kind === "technician") {
    return <Navigate to="/t/$techId" params={{ techId: looking.id }} />;
  }

  const shopOrder = ["fremont", "campbell", "san-ramon", "san-jose", "castro-valley"];
  const ordered =
    lens === "owner"
      ? [...visible].sort(
          (a, b) => shopOrder.indexOf(a.shopId) - shopOrder.indexOf(b.shopId),
        )
      : visible;

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
        {ordered.map((tech, index) => {
          const week = featuredWeek(weeks, tech.id);
          const home = shops.find((item) => item.id === tech.shopId);
          const crewRecord = shopRecord(techs, weeks, tech.shopId);
          const monthCount = monthCars[tech.shopId];
          const shopLine =
            monthCount == null ? crewRecord : { ...crewRecord, wins: monthCount };
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
                  </div>
                  <div className="text-right">
                    <p className="font-display text-2xl leading-none font-semibold whitespace-nowrap tabular-nums">
                      {tech.kind === "manager"
                        ? formatRecord(shopLine)
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
                  <div className="mt-4 text-center">
                    <MonthSales shopId={tech.shopId} />
                    <ManagerSnapshot tech={tech} weeks={weeks} />
                  </div>
                ) : null}
                </Link>
                {tech.kind === "technician" && week ? (
                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                    <div>
                      <dt className="text-muted">Cars</dt>
                      <dd className="tabular-nums text-ink">
                        {week.cars == null ? "—" : formatHours(week.cars)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">Recs / RO</dt>
                      <dd className="tabular-nums text-ink">
                        {week.recsPerVehicle == null ? "—" : formatMoney(week.recsPerVehicle)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">Efficiency</dt>
                      <dd className="tabular-nums text-ink">
                        {week.efficiency == null ? "—" : `${formatHours(week.efficiency)}%`}
                      </dd>
                    </div>
                  </dl>
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
    </div>
  );
}

export function ToolsMenu() {
  const viewer = useBoard((state) => state.viewer);
  const techs = useBoard((state) => state.techs);
  const shops = useBoard((state) => state.shops);
  const calls = useBoard((state) => state.calls ?? []);
  const person = techs.find((tech) => tech.id === viewer);
  const owner = isOwnerViewer(viewer);
  const manager = person?.kind === "manager" ? person : null;
  const queue = manager ? pendingCalls(calls, manager.id) : [];
  const [open, setOpen] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [emptyNote, setEmptyNote] = useState(false);
  const [panel, setPanel] = useState<"call" | "cash" | "pins" | "emails" | "habits" | null>(null);
  if (!owner && !manager) return null;
  const items = owner
    ? ([
        ["call", "Call reflection"],
        ["cash", "Cash Transfer"],
        ["pins", "Pin editor"],
        ["emails", "Emails"],
        ["habits", "Habits"],
      ] as const)
    : ([
        ["call", "Call reflection"],
        ["cash", "Cash Transfer"],
      ] as const);
  const waiting = queue[0];

  return (
    <div className="relative text-left">
      <span className="relative inline-flex">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className={cn(
            "inline-flex min-h-12 items-center gap-2 rounded-md bg-raised px-3 font-display text-sm tracking-wide text-ink uppercase italic shadow-border",
            open && "text-honey",
          )}
        >
          <Toolbox />
          Tools
        </button>
        {queue.length > 0 ? (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-honey px-1 text-[10px] font-semibold text-white">
            {queue.length}
          </span>
        ) : null}
      </span>
      {open ? (
        <div className="absolute right-0 z-30 mt-2 w-max max-w-[min(100vw-2.5rem,16rem)] rounded-md bg-surface p-1 shadow-border">
          {items.map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={cn(
                "flex items-center justify-end gap-2 rounded px-2 py-2 text-right font-display text-sm tracking-wide text-ink uppercase italic whitespace-nowrap",
                (panel === id || (id === "call" && queue.length > 0)) && "text-honey",
              )}
              onClick={() => {
                setOpen(false);
                if (id === "call" && manager) {
                  if (queue.length === 0) setEmptyNote(true);
                  else setReviewing(true);
                  return;
                }
                setPanel(id);
              }}
            >
              {id === "call" ? <BrickPhone /> : null}
              {id === "cash" ? <Bills /> : null}
              {label}
              {id === "call" && queue.length > 0 ? (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-honey px-1 text-[10px] font-semibold text-white">
                  {queue.length}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
      {panel ? (
        <ToolPopup
          title={items.find(([id]) => id === panel)?.[1] ?? "Tools"}
          onClose={() => setPanel(null)}
        >
          {panel === "call" && owner ? <CallComposer /> : null}
          {panel === "cash" && owner ? <CashDesk /> : null}
          {panel === "cash" && manager ? (
            <CashRequest embedded managerId={manager.id} shopId={manager.shopId} />
          ) : null}
          {panel === "pins" ? (
            <Card>
              <PinList />
            </Card>
          ) : null}
          {panel === "emails" ? <EmailList /> : null}
          {panel === "habits" ? <CategoryEditor /> : null}
        </ToolPopup>
      ) : null}
      {reviewing && waiting && manager ? (
        <CallReview
          key={waiting.id}
          call={waiting}
          person={manager}
          shopName={shops.find((shop) => shop.id === manager.shopId)?.name ?? manager.shopId}
          index={1}
          total={queue.length}
          onDone={() => {
            if (queue.length <= 1) setReviewing(false);
          }}
        />
      ) : null}
      {emptyNote ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-xs rounded-md bg-surface px-6 py-5 text-center shadow-border">
            <p className="font-display text-lg tracking-wide text-ink uppercase italic">
              No call reflections today.
            </p>
            <button
              type="button"
              className="mt-4 font-display text-sm tracking-wide text-honey uppercase italic"
              onClick={() => setEmptyNote(false)}
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ToolPopup({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-auto bg-black/70 p-4 pt-16">
      <div className="w-full max-w-lg rounded-md bg-canvas p-4 shadow-border">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="font-display text-lg tracking-wide text-ink uppercase italic">{title}</p>
          <button
            type="button"
            className="font-display text-sm tracking-wide text-honey uppercase italic"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Toolbox() {
  return (
    <svg viewBox="0 0 36 28" className="h-5 w-7" aria-hidden="true">
      <path d="M11 8 V6 a3 3 0 0 1 3-3 h8 a3 3 0 0 1 3 3 v2" fill="none" stroke="#f4f4f4" strokeWidth="1.6" />
      <rect x="1" y="8" width="34" height="17" rx="2" fill="#8a1c16" stroke="#f4f4f4" strokeWidth="1" />
      <rect x="14" y="12" width="8" height="5" rx="1" fill="#d7d7d7" />
      <rect x="1" y="14" width="34" height="3" fill="#5c100c" />
    </svg>
  );
}

let monthSalesRequest: Promise<{ sales: Record<string, number>; cars: Record<string, number> }> | null =
  null;

function loadMonthSales() {
  if (!monthSalesRequest) {
    monthSalesRequest = pullMonthSales()
      .then((result) => (result.ok ? { sales: result.sales, cars: result.cars } : { sales: {}, cars: {} }))
      .catch(() => ({ sales: {}, cars: {} }));
  }
  return monthSalesRequest;
}

function MonthSales({ shopId }: { shopId: string }) {
  const [total, setTotal] = useState<number | null>(null);
  useEffect(() => {
    let cancel = false;
    void loadMonthSales().then((result) => {
      if (!cancel) setTotal(result.sales[shopId] ?? null);
    });
    return () => {
      cancel = true;
    };
  }, [shopId]);
  return (
    <p className="min-h-12 text-center text-sm text-ink">
      <span className="block text-muted">{format(new Date(), "MMMM")} Sales</span>
      <span className="mt-1 block font-display text-xl font-semibold tabular-nums">
        {total == null || total <= 0 ? "—" : formatMoney(total)}
      </span>
    </p>
  );
}

function SavedWeekLine({ techId }: { techId: string }) {
  const weeks = useBoard((state) => state.weeks);
  const week = featuredWeek(weeks, techId);
  if (!week) return null;
  const bits = [
    week.totalSales != null ? formatMoney(week.totalSales) : null,
    week.sellThrough != null ? `${formatHours(week.sellThrough)}% sell through` : null,
    week.averageRepairOrder != null ? `${formatMoney(week.averageRepairOrder)} ARO` : null,
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
  const [pins, setPins] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const people = [
    { id: "darin", name: "Darin Dinis" },
    { id: "arun", name: "Arun" },
    ...techs.map((person) => ({ id: person.id, name: person.name })),
  ];

  useEffect(() => {
    void pinAssignments()
      .then((rows) => {
        const next: Record<string, string> = {};
        for (const row of rows) next[row.personId] = row.pin;
        setPins(next);
      })
      .catch(() => setPins({}));
  }, []);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">PINs</p>
      {people.map((person) => (
        <PinRow
          key={person.id}
          personId={person.id}
          name={person.name}
          currentPin={pins[person.id] ?? ""}
          onSaved={(pin) => {
            setPins((current) => ({ ...current, [person.id]: pin }));
            setNote(`${person.name} saved.`);
          }}
          onFailed={(reason) => setNote(reason)}
        />
      ))}
      {note ? <p className="text-sm text-muted">{note}</p> : null}
    </div>
  );
}

function EmailList() {
  const techs = useBoard((state) => state.techs);
  const shops = useBoard((state) => state.shops);
  const updateTech = useBoard((state) => state.updateTech);
  return (
    <Card>
      <h3 className="text-xl">Email</h3>
      <ul className="mt-4 space-y-3">
        {techs.map((person) => {
          const shop = shops.find((item) => item.id === person.shopId);
          return (
            <li key={person.id} className="flex items-center gap-3">
              <label className="min-w-0 flex-1 text-sm text-ink" htmlFor={`email-${person.id}`}>
                {person.name}
                <span className="block text-xs text-muted">{shop?.name}</span>
              </label>
              <input
                id={`email-${person.id}`}
                type="email"
                inputMode="email"
                autoComplete="off"
                value={person.email ?? ""}
                onChange={(event) => updateTech(person.id, { email: event.target.value.trim() })}
                placeholder="name@gmail.com"
                className="min-h-11 w-56 rounded-md bg-raised px-3 text-ink shadow-border"
              />
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function PinRow({
  personId,
  name,
  currentPin,
  onSaved,
  onFailed,
}: {
  personId: string;
  name: string;
  currentPin: string;
  onSaved: (pin: string) => void;
  onFailed: (reason: string) => void;
}) {
  const [pin, setPin] = useState(currentPin);
  if (pin === "" && currentPin) setPin(currentPin);
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
          onSaved(pin);
        });
      }}
    >
      <label className="min-w-0 flex-1 text-sm text-ink" htmlFor={`pin-${personId}`}>
        {name}
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
      <Button type="submit" tone="quiet" disabled={pin.length !== 4 || pin === currentPin}>
        Save
      </Button>
    </form>
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
