import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { HabitChart, HoursChart } from "@/components/board/charts";
import { Button, Card, fieldClass } from "@/components/board/ui";
import { cn } from "@/lib/cn";
import {
  LEVELS,
  canReview,
  canViewReview,
  categoriesFor,
  companyPoll,
  featuredWeek,
  formatHours,
  formatMoney,
  formatRecord,
  isOwnerViewer,
  managerRanks,
  levelWord,
  nextWeekToLog,
  peerRanks,
  relationLabel,
  shiftWord,
  shopRecord,
  weekRangeLabel,
  weekRelation,
  weekShape,
  weeksFor,
  type Tech,
  type WeekLog,
} from "@/lib/board/model";
import { CompanyPoll } from "@/components/board/poll";
import { useBoard } from "@/lib/board/store";

export function TechView({ tech }: { tech: Tech }) {
  const weeks = useBoard((state) => state.weeks);
  const techs = useBoard((state) => state.techs);
  const startWeek = useBoard((state) => state.startWeek);
  const list = weeksFor(weeks, tech.id);
  const featured = featuredWeek(weeks, tech.id);
  const [picked, setPicked] = useState<string | null>(null);
  const active = list.find((week) => week.weekStart === picked) ?? featured;
  const index = active ? list.findIndex((week) => week.weekStart === active.weekStart) : -1;
  const previous = index > 0 ? list[index - 1] : null;
  const next = index >= 0 && index < list.length - 1 ? list[index + 1] : null;
  const upcoming = nextWeekToLog(list.map((week) => week.weekStart));
  const viewer = useBoard((state) => state.viewer);
  const [reviewing, setReviewing] = useState(false);
  useEffect(() => {
    if (!reviewing) return;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [reviewing]);
  const writing = canReview(viewer, tech, techs) && (tech.kind !== "manager" || reviewing);
  const visible = canViewReview(viewer, tech, techs);

  return (
    <div className="rise">
      <PersonHeading tech={tech} />
      {tech.kind === "manager" ? (
        <Link
          to="/day/$shopId"
          params={{ shopId: tech.shopId }}
          className="mt-4 inline-flex min-h-11 items-center justify-center rounded-md bg-honey px-5 font-display text-sm font-semibold tracking-wide text-honey-fg uppercase italic"
        >
          End of Day Report
        </Link>
      ) : null}
      {isOwnerViewer(viewer) ? <EmailField tech={tech} /> : null}

      {visible ? (
      <>
      {active ? (
        <>
          {active ? (
          <WeekSwitcher
            week={active}
            hasPrevious={Boolean(previous)}
            hasNext={Boolean(next)}
            onPrevious={() => previous && setPicked(previous.weekStart)}
            onNext={() => next && setPicked(next.weekStart)}
          />
          ) : null}
          {tech.kind === "technician" && active ? (
            <>
              <WeekWork list={list} week={active} writing={writing} />
              <TechNotes week={active} />
            </>
          ) : active ? (
            <>
              <ManagerWeek week={active} writing={writing} />
              {writing ? (
                <HabitMarks week={active} kind={tech.kind} />
              ) : (
                <Habits list={list} week={active} kind={tech.kind} />
              )}
              <ManagerNotes week={active} writing={writing} />
              {writing ? null : <ManagerArcs list={list} week={active} />}
            </>
          ) : null}
          {tech.kind === "technician" && active && !writing ? (
            <>
              <Habits list={list} week={active} kind={tech.kind} />
              <History list={list} week={active} kind={tech.kind} />
            </>
          ) : null}
        </>
      ) : null}
      </>
      ) : (
        <PrivateReview tech={tech} />
      )}

      {tech.kind === "manager" ? <CrewGlance shopId={tech.shopId} /> : null}
      {tech.kind === "technician" && !writing ? <CompanyPoll highlightId={tech.id} /> : null}

      {writing ? (
        <LeadWriter
          tech={tech}
          week={active}
          upcoming={upcoming}
          onStart={(weekStart) => {
            startWeek(tech.id, weekStart);
            setPicked(weekStart);
          }}
        />
      ) : null}
      {tech.kind === "manager" && isOwnerViewer(viewer) && !reviewing ? (
        <Button
          className="mt-10 w-full text-base"
          onClick={() => {
            if (!active && upcoming) {
              startWeek(tech.id, upcoming);
              setPicked(upcoming);
            }
            setReviewing(true);
          }}
        >
          Review
        </Button>
      ) : null}
    </div>
  );
}

export function ManagerSnapshot({
  tech,
  weeks,
}: {
  tech: Tech;
  weeks: WeekLog[];
}) {
  const week = featuredWeek(weeks, tech.id);
  return (
    <div className="mt-4 text-center">
      <p className="text-base text-ink">{tech.name}</p>
      <p className="text-sm text-muted">{tech.role}</p>
      {week?.sellThrough != null ? (
        <p className="mt-2 text-sm tabular-nums text-ink">{formatHours(week.sellThrough)}% sell through</p>
      ) : null}
      {week?.averageRepairOrder != null ? (
        <p className="text-sm tabular-nums text-ink">
          {formatMoney(week.averageRepairOrder)} average repair order
        </p>
      ) : null}
    </div>
  );
}

function PersonHeading({ tech }: { tech: Tech }) {
  const shops = useBoard((state) => state.shops);
  const techs = useBoard((state) => state.techs);
  const weeks = useBoard((state) => state.weeks);
  const shop = shops.find((item) => item.id === tech.shopId);
  const standing = companyPoll(techs, weeks).find((row) => row.tech.id === tech.id);
  const crewRecord = shopRecord(techs, weeks, tech.shopId);
  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="text-4xl text-ink">
            {tech.kind === "manager" ? shop?.name : tech.name}
          </h1>
          {tech.kind === "technician" ? (
            <p className="font-display text-2xl font-semibold tabular-nums text-ink">
              {formatRecord(standing?.record ?? { wins: 0, losses: 0, draws: 0, played: 0 })}
            </p>
          ) : null}
        </div>
        {tech.kind === "manager" ? (
          <p className="font-display text-2xl font-semibold tabular-nums text-honey">
            {formatRecord(crewRecord)}
          </p>
        ) : standing?.rank ? (
          <p className="font-display text-2xl font-semibold tabular-nums text-honey">
            #{standing.rank}
          </p>
        ) : null}
      </div>
      <p className="mt-1 text-muted">
        {tech.kind === "manager" ? shop?.address : `${shop?.name} · ${tech.role}`}
      </p>
    </>
  );
}

function PrivateReview({ tech }: { tech: Tech }) {
  return (
    <p className="mt-6 text-muted">
      {tech.kind === "technician"
        ? "This review is only for this technician. Sign in with your PIN."
        : `This weekly review is only for ${tech.name} and the owner.`}
    </p>
  );
}

function CrewGlance({ shopId }: { shopId: string }) {
  const viewer = useBoard((state) => state.viewer);
  const techs = useBoard((state) => state.techs);
  const weeks = useBoard((state) => state.weeks);
  const shops = useBoard((state) => state.shops);
  const crew = techs.filter((person) => person.shopId === shopId && person.kind === "technician");
  const poll = companyPoll(techs, weeks);
  return (
    <Card className="mt-6">
      <h2 className="text-2xl">Technicians</h2>
      <ul className="mt-4 space-y-3">
        {crew.map((person) => {
          const week = featuredWeek(weeks, person.id);
          const standing = poll.find((row) => row.tech.id === person.id);
          const showNote = canViewReview(viewer, person, techs) && week?.practice;
          return (
            <li key={person.id}>
              <Link
                to="/t/$techId"
                params={{ techId: person.id }}
                className="flex items-baseline justify-between gap-3"
              >
                <span className="text-ink">
                  {person.name}{" "}
                  <span className="text-sm tabular-nums text-muted">
                    {formatRecord(standing?.record ?? { wins: 0, losses: 0, draws: 0, played: 0 })}
                  </span>
                </span>
                <span className="tabular-nums text-muted">
                  {week?.billedHours != null ? `${formatHours(week.billedHours)} billed` : "—"}
                </span>
              </Link>
              {showNote ? (
                <p className="mt-1 line-clamp-2 text-sm text-muted">{week.practice}</p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function EmailField({ tech }: { tech: Tech }) {
  const updateTech = useBoard((state) => state.updateTech);
  return (
    <Card className="mt-6">
      <label className="block text-sm text-muted" htmlFor="tech-email">
        Gmail
      </label>
      <input
        id="tech-email"
        type="email"
        inputMode="email"
        autoComplete="off"
        value={tech.email ?? ""}
        onChange={(event) => updateTech(tech.id, { email: event.target.value.trim() })}
        placeholder="name@gmail.com"
        className={cn(fieldClass, "mt-2")}
      />
    </Card>
  );
}

function WeekSwitcher({
  week,
  hasPrevious,
  hasNext,
  onPrevious,
  onNext,
}: {
  week: WeekLog;
  hasPrevious: boolean;
  hasNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <div className="mt-6 flex items-center justify-between gap-2">
      <button
        type="button"
        aria-label="Earlier week"
        disabled={!hasPrevious}
        onClick={onPrevious}
        className="inline-flex size-11 items-center justify-center rounded-full bg-surface text-ink shadow-border disabled:opacity-40"
      >
        <ChevronLeft className="size-5" />
      </button>
      <div className="text-center">
        <p className="text-sm text-honey">{relationLabel(weekRelation(week.weekStart))}</p>
        <p className="font-display text-xl font-semibold">{weekRangeLabel(week.weekStart)}</p>
      </div>
      <button
        type="button"
        aria-label="Later week"
        disabled={!hasNext}
        onClick={onNext}
        className="inline-flex size-11 items-center justify-center rounded-full bg-surface text-ink shadow-border disabled:opacity-40"
      >
        <ChevronRight className="size-5" />
      </button>
    </div>
  );
}

function ManagerWeek({ week, writing }: { week: WeekLog; writing: boolean }) {
  const upsertWeek = useBoard((state) => state.upsertWeek);
  const techs = useBoard((state) => state.techs);
  const weeks = useBoard((state) => state.weeks);
  const ranks = managerRanks(techs, weeks, week.weekStart, week.techId);
  const ranked = [
    ranks.totalSales,
    ranks.sellThrough,
    ranks.averageRepairOrder,
    ranks.hoursPerRepairOrder,
    ranks.recsPerVehicle,
    ranks.salesPerBilledHour,
    ranks.grossProfit,
  ].some((rank) => rank != null);
  const fields: {
    id: string;
    label: string;
    value: number | null;
    max: number;
    rank?: number;
    text: string;
    commit: (value: number | null) => void;
  }[] = [
    {
      id: "total-sales",
      label: "Total sales",
      value: week.totalSales,
      max: 1000000,
      rank: ranks.totalSales,
      text: week.totalSales == null ? "—" : formatMoney(week.totalSales),
      commit: (totalSales) => upsertWeek({ ...week, totalSales }),
    },
    {
      id: "sell-through",
      label: "Sell through percentage",
      value: week.sellThrough,
      max: 100,
      rank: ranks.sellThrough,
      text: week.sellThrough == null ? "—" : `${formatHours(week.sellThrough)}%`,
      commit: (sellThrough) => upsertWeek({ ...week, sellThrough }),
    },
    {
      id: "average-ro",
      label: "Average repair order",
      value: week.averageRepairOrder,
      max: 20000,
      rank: ranks.averageRepairOrder,
      text: week.averageRepairOrder == null ? "—" : formatMoney(week.averageRepairOrder),
      commit: (averageRepairOrder) => upsertWeek({ ...week, averageRepairOrder }),
    },
    {
      id: "hours-per-ro",
      label: "Hours per repair order",
      value: week.hoursPerRepairOrder,
      max: 40,
      rank: ranks.hoursPerRepairOrder,
      text: week.hoursPerRepairOrder == null ? "—" : formatHours(week.hoursPerRepairOrder),
      commit: (hoursPerRepairOrder) => upsertWeek({ ...week, hoursPerRepairOrder }),
    },
    {
      id: "recs-per-car",
      label: "Recommendation per car",
      value: week.recsPerVehicle,
      max: 20000,
      rank: ranks.recsPerVehicle,
      text: week.recsPerVehicle == null ? "—" : formatMoney(week.recsPerVehicle),
      commit: (recsPerVehicle) => upsertWeek({ ...week, recsPerVehicle }),
    },
    {
      id: "sales-per-hour",
      label: "Sales per billed hour",
      value: week.salesPerBilledHour,
      max: 2000,
      rank: ranks.salesPerBilledHour,
      text: week.salesPerBilledHour == null ? "—" : formatMoney(week.salesPerBilledHour),
      commit: (salesPerBilledHour) => upsertWeek({ ...week, salesPerBilledHour }),
    },
    {
      id: "gross-profit",
      label: "Gross profit",
      value: week.grossProfit,
      max: 100000,
      rank: ranks.grossProfit,
      text: week.grossProfit == null ? "—" : formatMoney(week.grossProfit),
      commit: (grossProfit) => upsertWeek({ ...week, grossProfit }),
    },
  ];
  const sales = fields[0];
  const rest = fields.slice(1);
  return (
    <Card className="mt-6">
      {sales ? (
        <div>
          <p className="text-sm text-muted">{sales.label}</p>
          {writing ? (
            <DecimalField
              key={`${week.weekStart}-${sales.id}`}
              id={sales.id}
              label=""
              value={sales.value}
              max={sales.max}
              onCommit={sales.commit}
            />
          ) : (
            <p className="mt-1 font-display text-3xl font-semibold tabular-nums">{sales.text}</p>
          )}
          <RankLine rank={sales.rank} total={ranks.total} />
        </div>
      ) : null}
      <ul className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5">
        {rest.map((field) => (
          <li key={field.id}>
            <p className="text-sm text-muted">{field.label}</p>
            {writing ? (
              <DecimalField
                key={`${week.weekStart}-${field.id}`}
                id={field.id}
                label=""
                value={field.value}
                max={field.max}
                onCommit={field.commit}
              />
            ) : (
              <p className="mt-1 font-display text-2xl font-semibold tabular-nums">{field.text}</p>
            )}
            <RankLine rank={field.rank} total={ranks.total} />
          </li>
        ))}
      </ul>
      {ranked ? null : (
        <p className="mt-4 text-sm text-muted">
          Rank shows under each number once every manager's week has that number.
        </p>
      )}
    </Card>
  );
}

function ManagerArcs({ list, week }: { list: WeekLog[]; week: WeekLog }) {
  const metrics: {
    key:
      | "totalSales"
      | "sellThrough"
      | "averageRepairOrder"
      | "hoursPerRepairOrder"
      | "recsPerVehicle"
      | "salesPerBilledHour"
      | "grossProfit";
    title: string;
    format: (value: number) => string;
  }[] = [
    { key: "totalSales", title: "Total sales", format: formatMoney },
    { key: "sellThrough", title: "Sell through percentage", format: (value) => `${formatHours(value)}%` },
    { key: "averageRepairOrder", title: "Average repair order", format: formatMoney },
    { key: "hoursPerRepairOrder", title: "Hours per repair order", format: formatHours },
    { key: "recsPerVehicle", title: "Recommendation per car", format: formatMoney },
    { key: "salesPerBilledHour", title: "Sales per billed hour", format: formatMoney },
    { key: "grossProfit", title: "Gross profit", format: formatMoney },
  ];
  const shown = metrics.filter((metric) => list.some((item) => item[metric.key] != null));
  if (shown.length === 0) return null;
  return (
    <Card className="mt-6">
      <h2 className="text-lg font-semibold text-ink">The longer arc</h2>
      <ul className="mt-2 grid gap-4 sm:grid-cols-2">
        {shown.map((metric) => (
          <li key={metric.key} className="py-3">
            <p className="text-sm text-muted">{metric.title}</p>
            <HoursChart
              weeks={list}
              selected={week.weekStart}
              metric={metric.key}
              format={metric.format}
              label={metric.title}
            />
          </li>
        ))}
      </ul>
    </Card>
  );
}

function WeekWork({
  list,
  week,
  writing,
}: {
  list: WeekLog[];
  week: WeekLog;
  writing: boolean;
}) {
  const techs = useBoard((state) => state.techs);
  const weeks = useBoard((state) => state.weeks);
  const upsertWeek = useBoard((state) => state.upsertWeek);
  const ranks = peerRanks(techs, weeks, week.weekStart, week.techId);
  return (
    <>
    <Card className="mt-6">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm text-muted">Billed hours</p>
        <p className="text-xs text-muted">Goal 40</p>
      </div>
      {writing ? (
        <DecimalField
          key={`${week.weekStart}-billed`}
          id="billed"
          label=""
          value={week.billedHours}
          max={80}
          onCommit={(billedHours) => upsertWeek({ ...week, billedHours })}
          met={(n) => n >= 40}
        />
      ) : (
        <p
          className="mt-2 font-display text-6xl leading-none font-semibold tabular-nums"
          style={{ color: goalColor(week.billedHours, (n) => n >= 40) }}
        >
          {week.billedHours == null ? "—" : formatHours(week.billedHours)}
        </p>
      )}
      <RankLine rank={ranks?.billedHours} total={ranks?.total} />
      <MissNote
        id="billed-why"
        show={week.billedHours != null && week.billedHours < 40}
        writing={writing}
        value={week.billedNote ?? ""}
        onChange={(billedNote) => upsertWeek({ ...week, billedNote })}
      />
      <div className="mt-5 grid grid-cols-2 gap-4">
        <div>
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm text-muted">Cars serviced</p>
            <p className="text-xs text-muted">Goal 14</p>
          </div>
          {writing ? (
            <DecimalField
              key={`${week.weekStart}-cars`}
              id="cars"
              label=""
              value={week.cars}
              max={200}
              onCommit={(cars) => upsertWeek({ ...week, cars })}
              met={(n) => n >= 14}
            />
          ) : (
            <p
              className="mt-1 font-display text-3xl font-semibold tabular-nums"
              style={{ color: goalColor(week.cars, (n) => n >= 14) }}
            >
              {week.cars == null ? "—" : formatHours(week.cars)}
            </p>
          )}
          <RankLine rank={ranks?.cars} total={ranks?.total} />
          <MissNote
            id="cars-why"
            show={week.cars != null && week.cars < 14}
            writing={writing}
            value={week.carsNote ?? ""}
            onChange={(carsNote) => upsertWeek({ ...week, carsNote })}
          />
        </div>
        <div>
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm text-muted">Recommendations per repair order</p>
            <p className="shrink-0 text-xs text-muted">Goal $2,500</p>
          </div>
          {writing ? (
            <DecimalField
              key={`${week.weekStart}-recs`}
              id="recs"
              label=""
              value={week.recsPerVehicle}
              max={20000}
              onCommit={(recsPerVehicle) => upsertWeek({ ...week, recsPerVehicle })}
              met={(n) => n >= 2500}
            />
          ) : (
            <p
              className="mt-1 font-display text-3xl font-semibold tabular-nums"
              style={{ color: goalColor(week.recsPerVehicle, (n) => n >= 2500) }}
            >
              {week.recsPerVehicle == null ? "—" : formatMoney(week.recsPerVehicle)}
            </p>
          )}
          <RankLine rank={ranks?.recsPerVehicle} total={ranks?.total} />
          <MissNote
            id="recs-why"
            show={week.recsPerVehicle != null && week.recsPerVehicle < 2500}
            writing={writing}
            value={week.recsNote ?? ""}
            onChange={(recsNote) => upsertWeek({ ...week, recsNote })}
          />
        </div>
        <div>
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm text-muted">Efficiency</p>
            <p className="shrink-0 text-xs text-muted">Goal 100–150%</p>
          </div>
          {writing ? (
            <DecimalField
              key={`${week.weekStart}-eff`}
              id="efficiency"
              label=""
              value={week.efficiency}
              max={200}
              onCommit={(efficiency) => upsertWeek({ ...week, efficiency })}
              met={(n) => n >= 100 && n <= 150}
            />
          ) : (
            <p
              className="mt-1 font-display text-3xl font-semibold tabular-nums"
              style={{ color: goalColor(week.efficiency, (n) => n >= 100 && n <= 150) }}
            >
              {week.efficiency == null ? "—" : `${formatHours(week.efficiency)}%`}
            </p>
          )}
          <RankLine rank={ranks?.efficiency} total={ranks?.total} />
          <MissNote
            id="eff-why"
            show={week.efficiency != null && (week.efficiency < 100 || week.efficiency > 150)}
            writing={writing}
            value={week.efficiencyNote ?? ""}
            onChange={(efficiencyNote) => upsertWeek({ ...week, efficiencyNote })}
          />
        </div>
      </div>
      {ranks == null ? (
        <p className="mt-4 text-sm text-muted">
          Rank shows under each number once every technician's week is in.
        </p>
      ) : null}
      <Boomerangs week={week} writing={writing} />
    </Card>
    {writing ? null : (
      <Card className="mt-6">
        <h2 className="text-lg font-semibold text-ink">Billed Hours</h2>
        <HoursChart
          weeks={list}
          selected={week.weekStart}
          metric="billedHours"
          format={formatHours}
          label="Billed hours"
        />
      </Card>
    )}
    </>
  );
}

function MissNote({
  id,
  show,
  writing,
  value,
  onChange,
}: {
  id: string;
  show: boolean;
  writing: boolean;
  value: string;
  onChange: (next: string) => void;
}) {
  if (!show) return null;
  if (!writing) {
    if (!value) return null;
    return <p className="mt-2 text-sm text-ink">{value}</p>;
  }
  return (
    <textarea
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder="Why it wasn't hit"
      className={cn(fieldClass, "mt-2 min-h-20 py-3")}
    />
  );
}

function Boomerangs({ week, writing }: { week: WeekLog; writing: boolean }) {
  const upsertWeek = useBoard((state) => state.upsertWeek);
  const list = week.boomerangs ?? null;
  const [ro, setRo] = useState("");
  const [note, setNote] = useState("");

  function save(next: WeekLog["boomerangs"]) {
    upsertWeek({ ...week, boomerangs: next });
  }

  function submit() {
    if (!ro.trim() && !note.trim()) return;
    save([...(list ?? []), { id: crypto.randomUUID(), ro: ro.trim(), note: note.trim() }]);
    setRo("");
    setNote("");
  }

  if (!writing) {
    if (list == null) return null;
    if (list.length === 0) {
      return (
        <div className="mt-6 border-t border-line pt-5">
          <h2 className="text-lg font-semibold text-ink">Boomerangs</h2>
          <p className="mt-2 text-sm text-muted">No boomerangs this week.</p>
        </div>
      );
    }
    return (
      <div className="mt-6 border-t border-line pt-5">
        <h2 className="text-lg font-semibold text-ink">Boomerangs</h2>
        <ul className="mt-4 space-y-3">
        {list.map((item) => (
          <li key={item.id}>
            <p className="text-sm text-muted">RO {item.ro || "—"}</p>
            <p className="mt-1 text-ink">{item.note || "No note yet."}</p>
          </li>
        ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="mt-6 border-t border-line pt-5">
      <h2 className="text-lg font-semibold text-ink">Boomerangs</h2>
      <p className="mt-1 text-sm text-muted">
        A vehicle that came back. Each car serviced counts as a win. Each boomerang counts as
        a loss. It is a note for next time, not a warning.
      </p>
      <button
        type="button"
        onClick={() => save([])}
        className={cn(
          "mt-3 inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium",
          list != null && list.length === 0 ? "bg-honey text-honey-fg" : "bg-raised text-muted",
        )}
      >
        None this week
      </button>
      <div className="mt-4 rounded-xl bg-raised p-3">
        <label className="block text-sm text-muted" htmlFor="boomerang-ro">
          RO number
        </label>
        <input
          id="boomerang-ro"
          value={ro}
          onChange={(event) => setRo(event.target.value)}
          className={cn(fieldClass, "mt-2")}
        />
        <label className="mt-3 block text-sm text-muted" htmlFor="boomerang-note">
          What happened
        </label>
        <textarea
          id="boomerang-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="What the car still needed."
          className={cn(fieldClass, "mt-2 min-h-24 py-3")}
        />
        <Button className="mt-3" disabled={!ro.trim() && !note.trim()} onClick={submit}>
          Submit
        </Button>
      </div>
      {list && list.length > 0 ? (
        <ul className="mt-4 space-y-4">
          {list.map((item) => (
            <li key={item.id} className="rounded-xl bg-raised p-3">
              <p className="text-sm text-muted">RO {item.ro || "—"}</p>
              <p className="mt-1 text-ink">{item.note || "No note yet."}</p>
              <button
                type="button"
                onClick={() => save(list.filter((row) => row.id !== item.id))}
                className="mt-2 min-h-11 text-sm text-muted"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
function RankLine({ rank, total }: { rank?: number; total?: number }) {
  if (rank == null || !total) return null;
  return (
    <p className="mt-1 text-sm tabular-nums text-muted">
      #{rank} of {total}
    </p>
  );
}

function TechNotes({ week }: { week: WeekLog }) {
  const upsertWeek = useBoard((state) => state.upsertWeek);
  return (
    <div className="mt-6 space-y-3">
      <Card>
        <label className="block text-sm text-honey" htmlFor="went-well">
          What went well
        </label>
        <p className="mt-1 text-sm text-muted">For the technician.</p>
        <textarea
          id="went-well"
          value={week.working}
          onChange={(event) => upsertWeek({ ...week, working: event.target.value })}
          placeholder="Name something real from the week."
          className={cn(fieldClass, "mt-3 min-h-28 py-3")}
        />
      </Card>
      <Card>
        <label className="block text-sm text-honey" htmlFor="work-on">
          What we need to work on
        </label>
        <p className="mt-1 text-sm text-muted">For the technician. One next step, not a verdict.</p>
        <textarea
          id="work-on"
          value={week.practice}
          onChange={(event) => upsertWeek({ ...week, practice: event.target.value })}
          placeholder="The habit to practice next."
          className={cn(fieldClass, "mt-3 min-h-28 py-3")}
        />
      </Card>
    </div>
  );
}

function ManagerNotes({ week, writing }: { week: WeekLog; writing: boolean }) {
  const upsertWeek = useBoard((state) => state.upsertWeek);
  if (!writing && !week.working && !week.practice) return null;
  return (
    <Card className="mt-6">
      {writing || week.working ? (
        <>
          <label className="block text-sm text-muted" htmlFor="working">
            What's already working
          </label>
          {writing ? (
            <textarea
              id="working"
              value={week.working}
              onChange={(event) => upsertWeek({ ...week, working: event.target.value })}
              className={cn(fieldClass, "mt-2 min-h-24 py-3")}
              placeholder="Name something real they can feel proud of."
            />
          ) : (
            <p className="mt-2 text-lg leading-snug text-ink">{week.working}</p>
          )}
        </>
      ) : null}
      {writing || week.practice ? (
        <>
          <label className={cn("block text-sm text-muted", writing || week.working ? "mt-5" : "")} htmlFor="practice">
            What to practice next
          </label>
          {writing ? (
            <textarea
              id="practice"
              value={week.practice}
              onChange={(event) => upsertWeek({ ...week, practice: event.target.value })}
              className={cn(fieldClass, "mt-2 min-h-28 py-3")}
              placeholder="One specific, kind next step."
            />
          ) : (
            <p className="mt-2 text-lg leading-snug text-ink">{week.practice}</p>
          )}
        </>
      ) : null}
    </Card>
  );
}

function Notes({ week }: { week: WeekLog }) {
  if (!week.practice && !week.working) {
    return (
      <p className="mt-6 text-muted">
        No written note for this week. The habits still tell the story.
      </p>
    );
  }
  return (
    <div className="mt-6 space-y-3">
      {week.practice ? (
        <Card>
          <p className="text-sm text-honey">What to practice</p>
          <blockquote className="mt-3 font-display text-2xl leading-snug font-medium text-ink">
            {week.practice}
          </blockquote>
        </Card>
      ) : null}
      {week.working ? (
        <Card>
          <p className="text-sm text-honey">Already working</p>
          <p className="mt-3 text-lg leading-snug">{week.working}</p>
        </Card>
      ) : null}
    </div>
  );
}

function HabitMarks({ week, kind }: { week: WeekLog; kind: Tech["kind"] }) {
  const categories = categoriesFor(useBoard((state) => state.categories), kind);
  const upsertWeek = useBoard((state) => state.upsertWeek);
  return (
    <Card className="mt-6">
      <h2 className="text-2xl">Habits</h2>
      <p className="mt-2 text-sm text-muted">Second to the numbers. One mark for the week.</p>
      <ul className="mt-5 space-y-4">
        {categories.map((category) => {
          const score = week.scores[category.id];
          return (
            <li key={category.id}>
              <p className="text-sm text-ink">{category.name}</p>
              <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label={category.name}>
                {LEVELS.map((level) => {
                  const on = score === level.score;
                  return (
                    <button
                      key={level.score}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      aria-label={level.word}
                      onClick={() =>
                        upsertWeek({
                          ...week,
                          scores: { ...week.scores, [category.id]: level.score },
                        })
                      }
                      className={cn(
                        "inline-flex min-h-11 items-center rounded-full px-3 text-sm font-medium",
                        on ? "bg-honey text-honey-fg" : "bg-raised text-muted",
                      )}
                    >
                      {level.word}
                    </button>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function Habits({
  list,
  week,
  kind,
}: {
  list: WeekLog[];
  week: WeekLog;
  kind: Tech["kind"];
}) {
  const categories = categoriesFor(useBoard((state) => state.categories), kind);
  const previous = list.filter((item) => item.weekStart < week.weekStart).at(-1) ?? null;
  const rows = categories.map((category) => ({
    ...category,
    score: week.scores[category.id],
    before: previous?.scores[category.id],
  }));
  const marked = rows.filter((row) => row.score != null) as {
    name: string;
    score: number;
  }[];

  return (
    <Card className="mt-6">
      <h2 className="text-2xl">How the habits landed</h2>
      <p className="mt-2 text-sm text-muted">
        Starting, Practicing, Steady, Strong, or Showing others. This is where the habit
        is this week, not a score against anyone else.
      </p>
      {weekShape(marked) ? <p className="mt-3 text-ink">{weekShape(marked)}</p> : null}
      <ul className="mt-5 space-y-5">
        {rows.map((row) => (
          <li key={row.id}>
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <p className="text-ink">{row.name}</p>
                <p className="text-sm text-muted">{row.hint}</p>
              </div>
              <p className="shrink-0 text-sm text-honey">{levelWord(row.score)}</p>
            </div>
            <div
              className="mt-2 flex gap-1.5"
              role="img"
              aria-label={`${row.name}: ${levelWord(row.score)}`}
            >
              {LEVELS.map((level) => (
                <span
                  key={level.score}
                  className={cn(
                    "h-2.5 flex-1 rounded-full",
                    row.score != null && level.score <= row.score ? "bg-honey" : "bg-line",
                  )}
                />
              ))}
            </div>
            <p className="mt-1.5 text-sm text-muted">{shiftWord(row.score, row.before)}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function History({
  list,
  week,
  kind,
}: {
  list: WeekLog[];
  week: WeekLog;
  kind: Tech["kind"];
}) {
  const categories = categoriesFor(useBoard((state) => state.categories), kind);
  const focus =
    categories.reduce<(typeof categories)[number] | null>((lowest, category) => {
      const score = week.scores[category.id] ?? 99;
      if (!lowest) return category;
      const lowScore = week.scores[lowest.id] ?? 99;
      return score < lowScore ? category : lowest;
    }, null) ?? categories[0];
  const [picked, setPicked] = useState<string | null>(null);
  const selected = categories.find((category) => category.id === picked) ?? focus;
  if (!selected) return null;

  return (
    <Card className="mt-6 min-w-0">
      <h2 className="text-2xl">The longer arc</h2>
      <p className="mt-2 text-sm text-muted">
        {selected.name}, across the weeks on record. The shape matters more than any one
        point.
      </p>
      <div
        role="radiogroup"
        aria-label="Which habit to plot"
        className="mt-4 flex gap-2 overflow-x-auto pb-1"
      >
        {categories.map((category) => {
          const on = category.id === selected.id;
          return (
            <button
              key={category.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setPicked(category.id)}
              className={cn(
                "min-h-11 shrink-0 rounded-full px-4 text-sm font-medium",
                on ? "bg-honey text-honey-fg" : "bg-raised text-muted",
              )}
            >
              {category.name}
            </button>
          );
        })}
      </div>
      <div className="mt-4">
        <HabitChart weeks={list} categoryId={selected.id} selected={week.weekStart} />
      </div>
    </Card>
  );
}

function goalColor(value: number | null, met: (n: number) => boolean) {
  if (value == null) return undefined;
  return met(value) ? "#3DDC84" : "#ff4d4d";
}

function DecimalField({
  id,
  label,
  value,
  max,
  onCommit,
  met,
}: {
  id: string;
  label: string;
  value: number | null;
  max: number;
  onCommit: (next: number | null) => void;
  met?: (n: number) => boolean;
}) {
  const [text, setText] = useState(value == null ? "" : formatHours(value));
  return (
    <>
      {label ? (
        <label className="mt-4 block text-sm text-muted" htmlFor={id}>
          {label}
        </label>
      ) : null}
      <input
        id={id}
        inputMode="decimal"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => {
          if (text.trim() === "") {
            onCommit(null);
            return;
          }
          if (Number.isNaN(Number(text))) {
            setText(value == null ? "" : formatHours(value));
            return;
          }
          const next = Math.min(max, Math.max(0, Math.round(Number(text) * 100) / 100));
          onCommit(next);
          setText(formatHours(next));
        }}
        className={cn(fieldClass, "mt-2 max-w-40 tabular-nums")}
        style={{ color: met ? goalColor(text.trim() === "" ? null : Number(text), met) : undefined }}
      />
    </>
  );
}

function LeadWriter({
  tech,
  week,
  upcoming,
  onStart,
}: {
  tech: Tech;
  week: WeekLog | null;
  upcoming: string | null;
  onStart: (weekStart: string) => void;
}) {
  const upsertWeek = useBoard((state) => state.upsertWeek);
  const removeTech = useBoard((state) => state.removeTech);
  const categories = categoriesFor(useBoard((state) => state.categories), tech.kind);
  const navigate = useNavigate();

  return (
    <div className="mt-10 space-y-4 border-t border-line pt-8">
      {tech.kind === "technician" ? (
        <>
          <h2 className="text-2xl">Write the week</h2>
          {upcoming ? (
            <Button onClick={() => onStart(upcoming)}>
              Start notes for {weekRangeLabel(upcoming)}
            </Button>
          ) : (
            <p className="text-sm text-muted">The newest week you can log is already here.</p>
          )}
        </>
      ) : null}

      {week && tech.kind === "technician" ? (
        <>
        <Card>
          <p className="text-sm text-honey">{relationLabel(weekRelation(week.weekStart))}</p>
          <h3 className="mt-1 text-xl">{weekRangeLabel(week.weekStart)}</h3>
          <ul className="mt-5 space-y-4">
            {categories.map((category) => {
              const score = week.scores[category.id];
              return (
                <li key={category.id}>
                  <p className="text-sm text-ink">{category.name}</p>
                  <div
                    className="mt-2 flex flex-wrap gap-2"
                    role="radiogroup"
                    aria-label={category.name}
                  >
                    {LEVELS.map((level) => {
                      const on = score === level.score;
                      return (
                        <button
                          key={level.score}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          aria-label={level.word}
                          onClick={() =>
                            upsertWeek({
                              ...week,
                              scores: { ...week.scores, [category.id]: level.score },
                            })
                          }
                          className={cn(
                            "inline-flex min-h-11 items-center rounded-full px-3 text-sm font-medium",
                            on ? "bg-honey text-honey-fg" : "bg-raised text-muted",
                          )}
                        >
                          {level.word}
                        </button>
                      );
                    })}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
        </>
      ) : null}

      {week ? (
        <>
        <Button
          className="w-full text-base"
          onClick={() => {
            if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
            const latest =
              useBoard.getState().weeks.find(
                (item) => item.techId === week.techId && item.weekStart === week.weekStart,
              ) ?? week;
            upsertWeek({ ...latest, submitted: true });
          }}
        >
          Submit
        </Button>
        <p className="text-sm text-muted">
          {week.submitted ? "This week is submitted." : "Submit when the week is filled in."}
        </p>
        </>
      ) : null}

      <button
        type="button"
        className="min-h-11 text-sm text-muted underline-offset-4 hover:underline"
        onClick={() => {
          if (!window.confirm(`Remove ${tech.name} from this board?`)) return;
          removeTech(tech.id);
          void navigate({ to: "/" });
        }}
      >
        Remove from the crew
      </button>
    </div>
  );
}
