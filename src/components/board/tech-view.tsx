import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, ThumbsUp } from "lucide-react";
import { HabitChart, HoursChart } from "@/components/board/charts";
import { CompanyPoll } from "@/components/board/poll";
import { Button, Card, fieldClass } from "@/components/board/ui";
import { cn } from "@/lib/cn";
import { flushSharedBoard } from "@/lib/board/shared";
import { mailManagerReview } from "@/lib/board/mail-manager.functions";
import { pullShopRange, type ShopPull } from "@/lib/board/dashboard.functions";
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
  isWeekLocked,
  managerRanks,
  levelWord,
  nextWeekToLog,
  peerRanks,
  priorWeekISO,
  relationLabel,
  shiftWord,
  shopRecord,
  techReviewStage,
  takeFocusedReview,
  weekRangeLabel,
  weekRelation,
  weeksFor,
  type Tech,
  type WeekLog,
} from "@/lib/board/model";
import { MANAGER_LEVELS, managerTier } from "@/lib/board/rubric";
import { useBoard } from "@/lib/board/store";

function thursdayOf(monday: string) {
  const [year, month, day] = monday.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 2026, (month ?? 1) - 1, day ?? 1));
  date.setUTCDate(date.getUTCDate() + 3);
  return date.toISOString().slice(0, 10);
}

function applySheet(week: WeekLog, sheet: ShopPull["week"] | null) {
  if (!sheet) return week;
  const keep = (incoming: number | null, kept: number | null) => incoming ?? kept;
  const cars = keep(sheet.cars, week.cars);
  const recsPerVehicle = keep(sheet.recsPerVehicle, week.recsPerVehicle);
  return {
    ...week,
    totalSales: keep(sheet.totalSales, week.totalSales),
    sellThrough: keep(sheet.sellThrough, week.sellThrough),
    averageRepairOrder: keep(sheet.averageRepairOrder, week.averageRepairOrder),
    hoursPerRepairOrder: keep(sheet.hoursPerRepairOrder, week.hoursPerRepairOrder),
    recsPerVehicle,
    totalRecommendations: null,
    salesPerBilledHour: keep(sheet.salesPerBilledHour, week.salesPerBilledHour),
    billedHours: keep(sheet.billedHours, week.billedHours),
    cars,
    grossProfit: week.grossProfit,
  };
}

function storedWeek(week: WeekLog) {
  return (
    useBoard.getState().weeks.find(
      (item) => item.techId === week.techId && item.weekStart === week.weekStart,
    ) ?? week
  );
}

function patchWeek(week: WeekLog, patch: Partial<WeekLog>) {
  useBoard.getState().upsertWeek({ ...storedWeek(week), ...patch });
}

function typedGrossProfit() {
  const input = document.getElementById("gross-profit");
  if (!(input instanceof HTMLInputElement)) return undefined;
  const raw = input.value.trim();
  if (raw === "") return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.round(parsed * 100) / 100;
}

function typedNote(id: string) {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLTextAreaElement)) return undefined;
  return el.value;
}

function reviewFrozen(week: WeekLog) {
  return Boolean(week.submitted && week.darinReady && week.arunReady) || isWeekLocked(week.weekStart);
}

function mondayOf(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 2026, (month ?? 1) - 1, day ?? 1));
  const weekday = date.getUTCDay();
  const back = weekday === 0 ? 6 : weekday - 1;
  date.setUTCDate(date.getUTCDate() - back);
  return date.toISOString().slice(0, 10);
}

export function TechView({ tech }: { tech: Tech }) {
  const weeks = useBoard((state) => state.weeks);
  const techs = useBoard((state) => state.techs);
  const startWeek = useBoard((state) => state.startWeek);
  const list = weeksFor(weeks, tech.id);
  const featured = featuredWeek(weeks, tech.id);
  const [picked, setPicked] = useState<string | null>(() => takeFocusedReview(tech.id));
  const active = list.find((week) => week.weekStart === picked) ?? featured;
  const index = active ? list.findIndex((week) => week.weekStart === active.weekStart) : -1;
  const previous = index > 0 ? list[index - 1] : null;
  const next = index >= 0 && index < list.length - 1 ? list[index + 1] : null;
  const upcoming = nextWeekToLog(list.map((week) => week.weekStart));
  const viewer = useBoard((state) => state.viewer);
  const [reviewing, setReviewing] = useState(false);
  const canLog = canReview(viewer, tech, techs);
  const boardReady = useBoard((state) => state.boardReady);
  const canOpenUpcoming = Boolean(canLog && upcoming && upcoming !== active?.weekStart);
  const openLater = () => {
    if (next) {
      setPicked(next.weekStart);
      return;
    }
    if (!upcoming || !canLog) return;
    if (!list.some((week) => week.weekStart === upcoming)) startWeek(tech.id, upcoming);
    setPicked(upcoming);
    if (tech.kind === "manager" && !isWeekLocked(upcoming)) setReviewing(true);
  };
  useEffect(() => {
    if (!boardReady || !canLog || !isOwnerViewer(viewer) || tech.kind !== "technician") return;
    const last = priorWeekISO();
    const have = new Set(
      useBoard.getState().weeks.filter((week) => week.techId === tech.id).map((week) => week.weekStart),
    );
    if (!have.has(last)) startWeek(tech.id, last);
    setPicked((current) => current ?? last);
  }, [boardReady, canLog, tech.id, tech.kind, viewer, startWeek]);
  useEffect(() => {
    if (!reviewing) return;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [reviewing]);
  const locked = Boolean(
    active && tech.kind === "manager" && active.submitted && active.darinReady && active.arunReady,
  );
  const stage = tech.kind === "technician" ? techReviewStage(active) : "draft";
  const finished = tech.kind === "technician" && stage === "locked";
  const owner = isOwnerViewer(viewer);
  const editNumbers = tech.kind === "technician" && owner && !finished;
  const editNotes = tech.kind === "technician" && !owner && canReview(viewer, tech, techs) && stage === "manager";
  const writing =
    tech.kind === "manager"
      ? canReview(viewer, tech, techs) && !locked && reviewing
      : editNumbers || editNotes;
  const visible = canViewReview(viewer, tech, techs);
  const [sheet, setSheet] = useState<ShopPull["week"] | null>(null);
  const sheetRef = useRef<ShopPull["week"] | null>(null);

  useEffect(() => {
    if (tech.kind !== "manager" || !visible) return;
    const weekStart = active?.weekStart ?? priorWeekISO();
    let cancel = false;
    sheetRef.current = null;
    setSheet(null);
    const monday = mondayOf(weekStart);
    const end = thursdayOf(monday);
    void pullShopRange({ data: { shopId: tech.shopId, start: monday, end } }).then((result) => {
      if (cancel || !result.ok) return;
      sheetRef.current = result.week;
      setSheet(result.week);
    });
    return () => {
      cancel = true;
    };
  }, [tech.id, tech.kind, tech.shopId, active?.weekStart, visible]);

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

      {active ? (
        <WeekSwitcher
          week={active}
          hasPrevious={Boolean(previous) || Boolean(active && canLog && priorWeekISO() < active.weekStart)}
          hasNext={Boolean(next) || canOpenUpcoming}
          onPrevious={() => {
            if (previous) {
              setPicked(previous.weekStart);
              return;
            }
            const last = priorWeekISO();
            if (!active || !canLog || last >= active.weekStart) return;
            if (!list.some((week) => week.weekStart === last)) startWeek(tech.id, last);
            setPicked(last);
            if (tech.kind === "manager" && !isWeekLocked(last)) setReviewing(true);
          }}
          onNext={openLater}
        />
      ) : null}
      {finished ? <p className="mt-2 text-center text-sm text-muted">This review is finished.</p> : null}
      {locked ? <p className="mt-2 text-center text-sm text-muted">This review is finished.</p> : null}

      {tech.kind === "technician" && active ? (
        <WeekWork
          list={list}
          week={active}
          writing={editNumbers || editNotes}
          numbers={editNumbers}
          service={editNotes}
          notes={editNotes}
          detail={visible}
        />
      ) : null}
      {tech.kind === "technician" && !owner && stage === "draft" ? (
        <p className="mt-6 text-sm text-muted">Waiting on the numbers.</p>
      ) : null}

      {visible && active ? (
        tech.kind === "technician" ? (
          <>
            <TechNotes week={active} writing={editNotes} />
            {writing ? null : (
              <>
                <Habits list={list} week={active} kind={tech.kind} />
                <History list={list} week={active} kind={tech.kind} />
              </>
            )}
          </>
        ) : (
          <>
            <ManagerWeek week={active} writing={writing} sheet={reviewFrozen(active) ? null : sheet} />
            {writing ? (
              <HabitMarks week={active} kind={tech.kind} />
            ) : (
              <Habits list={list} week={active} kind={tech.kind} />
            )}
            <ManagerNotes week={active} writing={writing} />
            {writing ? null : <ManagerArcs list={list} week={active} />}
          </>
        )
      ) : null}

      {!visible && tech.kind === "manager" ? <PrivateReview tech={tech} /> : null}

      {tech.kind === "manager" ? <CrewGlance shopId={tech.shopId} /> : null}
      {tech.kind === "technician" && !writing ? <CompanyPoll highlightId={tech.id} /> : null}

      {tech.kind === "technician" && active && (editNumbers || editNotes) ? (
        <LeadWriter
          tech={tech}
          week={active}
          upcoming={upcoming}
          actor={editNotes ? "manager" : "owner"}
          onStart={(weekStart) => {
            startWeek(tech.id, weekStart);
            setPicked(weekStart);
          }}
          onDone={() => window.history.back()}
        />
      ) : null}
      {writing && tech.kind === "manager" ? (
        <LeadWriter
          tech={tech}
          week={active}
          upcoming={upcoming}
          capture={(current) => {
            const signed = Boolean(current.submitted && current.darinReady && current.arunReady);
            let next =
              signed || isWeekLocked(current.weekStart) ? current : applySheet(current, sheetRef.current);
            const typed = typedGrossProfit();
            if (typed !== undefined && !signed) next = { ...next, grossProfit: typed };
            const working = typedNote("working");
            const practice = typedNote("practice");
            if (working !== undefined) next = { ...next, working };
            if (practice !== undefined) next = { ...next, practice };
            return next;
          }}
          onStart={(weekStart) => {
            startWeek(tech.id, weekStart);
            setPicked(weekStart);
          }}
          onDone={() => setReviewing(false)}
        />
      ) : null}
      {tech.kind === "manager" && isOwnerViewer(viewer) && !reviewing && !locked ? (
        <Button
          className="mt-10 w-full text-base"
          onClick={() => {
            const weekStart = active?.weekStart ?? priorWeekISO();
            if (!list.some((week) => week.weekStart === weekStart)) startWeek(tech.id, weekStart);
            setPicked(weekStart);
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
    <div className="text-center">
      <p className="mt-3 text-base text-ink">{tech.name}</p>
      <p className="mt-1 text-sm text-muted">{tech.role}</p>
      <div className="mt-3 space-y-1 text-sm tabular-nums text-ink">
        <p>{week?.sellThrough == null ? "—" : `${formatHours(week.sellThrough)}% sell through`}</p>
        <p>{week?.averageRepairOrder == null ? "—" : `${formatMoney(week.averageRepairOrder)} ARO`}</p>
      </div>
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
  const techs = useBoard((state) => state.techs);
  const weeks = useBoard((state) => state.weeks);
  const crew = techs.filter((person) => person.shopId === shopId && person.kind === "technician");
  const poll = companyPoll(techs, weeks);
  return (
    <Card className="mt-6">
      <h2 className="text-2xl">Technicians</h2>
      <ul className="mt-4 space-y-3">
        {crew.map((person) => {
          const week = featuredWeek(weeks, person.id);
          const standing = poll.find((row) => row.tech.id === person.id);
          return (
            <li key={person.id}>
              <Link
                to="/t/$techId"
                params={{ techId: person.id }}
                className="block"
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className="text-ink">
                    {person.name}{" "}
                    <span className="text-sm tabular-nums text-muted">
                      {formatRecord(standing?.record ?? { wins: 0, losses: 0, draws: 0, played: 0 })}
                    </span>
                  </span>
                  <span className="tabular-nums text-muted">
                    {week?.billedHours != null ? `${formatHours(week.billedHours)} billed` : "—"}
                  </span>
                </span>
                <span className="mt-1 grid grid-cols-3 gap-2 text-sm">
                  <span>
                    <span className="block text-muted">Cars</span>
                    <span className="tabular-nums text-ink">
                      {week?.cars == null ? "—" : formatHours(Math.round(week.cars))}
                    </span>
                  </span>
                  <span>
                    <span className="block text-muted">Recs / RO</span>
                    <span className="tabular-nums text-ink">
                      {week?.recsPerVehicle == null ? "—" : formatMoney(week.recsPerVehicle)}
                    </span>
                  </span>
                  <span>
                    <span className="block text-muted">Efficiency</span>
                    <span className="tabular-nums text-ink">
                      {week?.efficiency == null ? "—" : `${formatHours(week.efficiency)}%`}
                    </span>
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
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

function ManagerWeek({
  week,
  writing,
  sheet,
}: {
  week: WeekLog;
  writing: boolean;
  sheet: ShopPull["week"] | null;
}) {
  const techs = useBoard((state) => state.techs);
  const weeks = useBoard((state) => state.weeks);
  const ranks = managerRanks(techs, weeks, week.weekStart, week.techId);
  const shown = sheet ? applySheet(week, sheet) : week;
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
    goal?: string;
    met?: (n: number) => boolean;
    edit?: boolean;
  }[] = [
    {
      id: "total-sales",
      label: "Total sales",
      value: shown.totalSales,
      max: 1000000,
      rank: ranks.totalSales,
      text: shown.totalSales == null ? "—" : formatMoney(shown.totalSales),
      goal: "Goal $32,000",
      met: (n) => n >= 32000,
    },
    {
      id: "sell-through",
      label: "Sell through percentage",
      value: shown.sellThrough,
      max: 100,
      rank: ranks.sellThrough,
      text: shown.sellThrough == null ? "—" : `${formatHours(shown.sellThrough)}%`,
      goal: "Goal 25–30%",
      met: (n) => n >= 25 && n <= 30,
    },
    {
      id: "average-ro",
      label: "ARO",
      value: shown.averageRepairOrder,
      max: 20000,
      rank: ranks.averageRepairOrder,
      text: shown.averageRepairOrder == null ? "—" : formatMoney(shown.averageRepairOrder),
      goal: "Goal $1,200",
      met: (n) => n >= 1200,
    },
    {
      id: "hours-per-ro",
      label: "Hours per repair order",
      value: shown.hoursPerRepairOrder,
      max: 40,
      rank: ranks.hoursPerRepairOrder,
      text: shown.hoursPerRepairOrder == null ? "—" : formatHours(shown.hoursPerRepairOrder),
      goal: "Goal 3",
      met: (n) => n >= 3,
    },
    {
      id: "recs-per-car",
      label: "Recommendation per car",
      value: shown.recsPerVehicle,
      max: 200000,
      rank: ranks.recsPerVehicle,
      text: shown.recsPerVehicle == null ? "—" : formatMoney(shown.recsPerVehicle),
      goal: "Goal $2,800",
      met: (n) => n >= 2800,
    },
    {
      id: "sales-per-hour",
      label: "Sales per billed hour",
      value: shown.salesPerBilledHour,
      max: 2000,
      rank: ranks.salesPerBilledHour,
      text: shown.salesPerBilledHour == null ? "—" : formatMoney(shown.salesPerBilledHour),
      goal: "Goal $400",
      met: (n) => n >= 400,
    },
    {
      id: "gross-profit",
      label: "Gross profit",
      value: week.grossProfit,
      max: 100000,
      rank: ranks.grossProfit,
      text: week.grossProfit == null ? "—" : formatMoney(week.grossProfit),
      edit: true,
    },
  ];
  const sales = fields[0];
  const rest = fields.slice(1);
  return (
    <Card className="mt-6">
      {sales ? (
        <div>
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm text-muted">{sales.label}</p>
            {sales.goal ? <p className="shrink-0 text-xs text-muted">{sales.goal}</p> : null}
          </div>
          <p
            className="mt-1 font-display text-3xl font-semibold tabular-nums"
            style={{ color: sales.met ? goalColor(sales.value, sales.met) : undefined }}
          >
            {sales.text}
          </p>
          <RankLine rank={sales.rank} total={ranks.total} />
        </div>
      ) : null}
      <ul className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5">
        {rest.map((field) => (
          <li key={field.id}>
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm text-muted">{field.label}</p>
              {field.goal ? <p className="shrink-0 text-xs text-muted">{field.goal}</p> : null}
            </div>
            {writing && field.edit ? (
              <DecimalField
                key={`${week.weekStart}-${field.id}`}
                id={field.id}
                label=""
                value={field.value}
                max={field.max}
                onCommit={(grossProfit) => patchWeek(week, { grossProfit })}
              />
            ) : (
              <p
                className="mt-1 font-display text-2xl font-semibold tabular-nums"
                style={{ color: field.met ? goalColor(field.value, field.met) : undefined }}
              >
                {field.text}
              </p>
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
    { key: "averageRepairOrder", title: "ARO", format: formatMoney },
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
  detail = true,
  numbers,
  service,
  notes,
}: {
  list: WeekLog[];
  week: WeekLog;
  writing: boolean;
  detail?: boolean;
  numbers?: boolean;
  service?: boolean;
  notes?: boolean;
}) {
  const editNumbers = numbers ?? writing;
  const editService = service ?? writing;
  const editNotes = notes ?? writing;
  const techs = useBoard((state) => state.techs);
  const weeks = useBoard((state) => state.weeks);
  const upsertWeek = useBoard((state) => state.upsertWeek);
  const ranks = peerRanks(techs, weeks, week.weekStart, week.techId);
  return (
    <>
    <Card className="mt-6">
      <div className="flex items-baseline gap-3">
        <p className="text-sm text-muted">Billed hours</p>
        <p className="text-xs text-muted">Goal 40</p>
      </div>
      {editNumbers ? (
        <DecimalField
          key={`${week.weekStart}-billed`}
          id="billed"
          label=""
          value={week.billedHours}
          max={80}
          onCommit={(billedHours) =>
            upsertWeek({
              ...week,
              billedHours,
              ...techFigures({
                billedHours,
                billedPerRo: week.hoursPerRepairOrder,
                totalRecommendations: week.totalRecommendations ?? null,
                serviceHours: week.serviceHours ?? null,
              }),
            })
          }
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
      {detail ? (
      <MissNote
        id="billed-why"
        show={week.billedHours != null && week.billedHours < 40}
        writing={editNotes}
        value={week.billedNote ?? ""}
        onChange={(billedNote) => upsertWeek({ ...week, billedNote })}
      />
      ) : null}
      <div className="mt-5 grid grid-cols-2 gap-4">
        <div>
          <p className="text-sm text-muted">BH/RO</p>
          {editNumbers ? (
            <DecimalField
              key={`${week.weekStart}-bhro`}
              id="bhro"
              label=""
              value={week.hoursPerRepairOrder}
              max={40}
              onCommit={(billedPerRo) =>
                upsertWeek({
                  ...week,
                  hoursPerRepairOrder: billedPerRo,
                  ...techFigures({
                    billedHours: week.billedHours,
                    billedPerRo,
                    totalRecommendations: week.totalRecommendations ?? null,
                    serviceHours: week.serviceHours ?? null,
                  }),
                })
              }
            />
          ) : (
            <p className="mt-1 font-display text-3xl font-semibold tabular-nums">
              {week.hoursPerRepairOrder == null ? "—" : formatHours(week.hoursPerRepairOrder)}
            </p>
          )}
        </div>
        <div>
          <p className="text-sm text-muted">Service hours</p>
          {editService ? (
            <DecimalField
              key={`${week.weekStart}-service`}
              id="service-hours"
              label=""
              value={week.serviceHours ?? null}
              max={80}
              onCommit={(serviceHours) =>
                upsertWeek({
                  ...week,
                  serviceHours,
                  ...techFigures({
                    billedHours: week.billedHours,
                    billedPerRo: week.hoursPerRepairOrder,
                    totalRecommendations: week.totalRecommendations ?? null,
                    serviceHours,
                  }),
                })
              }
            />
          ) : (
            <p className="mt-1 font-display text-3xl font-semibold tabular-nums">
              {week.serviceHours == null ? "—" : formatHours(week.serviceHours)}
            </p>
          )}
        </div>
        <div>
          <p className="text-sm text-muted">Total recommendations</p>
          {editNumbers ? (
            <DecimalField
              key={`${week.weekStart}-recs`}
              id="recs"
              label=""
              value={week.totalRecommendations ?? null}
              max={200000}
              onCommit={(totalRecommendations) =>
                upsertWeek({
                  ...week,
                  totalRecommendations,
                  ...techFigures({
                    billedHours: week.billedHours,
                    billedPerRo: week.hoursPerRepairOrder,
                    totalRecommendations,
                    serviceHours: week.serviceHours ?? null,
                  }),
                })
              }
            />
          ) : (
            <p className="mt-1 font-display text-3xl font-semibold tabular-nums">
              {week.totalRecommendations == null ? "—" : formatMoney(week.totalRecommendations)}
            </p>
          )}
        </div>
        <div>
          <div className="flex items-baseline gap-2">
            <p className="text-sm text-muted">Cars</p>
            <p className="text-xs text-muted">Goal 14</p>
          </div>
          <p
            className="mt-1 font-display text-3xl font-semibold tabular-nums"
            style={{ color: goalColor(week.cars == null ? null : Math.round(week.cars), (n) => n >= 14) }}
          >
            {week.cars == null ? "—" : formatHours(Math.round(week.cars))}
          </p>
          <RankLine rank={ranks?.cars} total={ranks?.total} />
          {detail ? (
            <MissNote
              id="cars-why"
              show={week.cars != null && Math.round(week.cars) < 14}
              writing={editNotes}
              value={week.carsNote ?? ""}
              onChange={(carsNote) => upsertWeek({ ...week, carsNote })}
            />
          ) : null}
        </div>
        <div>
          <div className="flex items-baseline gap-2">
            <p className="text-sm text-muted">Recommendations per vehicle</p>
            <p className="shrink-0 text-xs text-muted">Goal $2,500</p>
          </div>
          <p
            className="mt-1 font-display text-3xl font-semibold tabular-nums"
            style={{ color: goalColor(week.recsPerVehicle, (n) => n >= 2500) }}
          >
            {week.recsPerVehicle == null ? "—" : formatMoney(week.recsPerVehicle)}
          </p>
          <RankLine rank={ranks?.recsPerVehicle} total={ranks?.total} />
          {detail ? (
            <MissNote
              id="recs-why"
              show={week.recsPerVehicle != null && week.recsPerVehicle < 2500}
              writing={editNotes}
              value={week.recsNote ?? ""}
              onChange={(recsNote) => upsertWeek({ ...week, recsNote })}
            />
          ) : null}
        </div>
        <div>
          <div className="flex items-baseline gap-2">
            <p className="text-sm text-muted">Efficiency</p>
            <p className="shrink-0 text-xs text-muted">Goal 100–150%</p>
          </div>
          <p
            className="mt-1 font-display text-3xl font-semibold tabular-nums"
            style={{ color: goalColor(week.efficiency, (n) => n >= 100 && n <= 150) }}
          >
            {week.efficiency == null ? "—" : `${formatHours(week.efficiency)}%`}
          </p>
          <RankLine rank={ranks?.efficiency} total={ranks?.total} />
          {detail ? (
            <MissNote
              id="eff-why"
              show={week.efficiency != null && (week.efficiency < 100 || week.efficiency > 150)}
              writing={editNotes}
              value={week.efficiencyNote ?? ""}
              onChange={(efficiencyNote) => upsertWeek({ ...week, efficiencyNote })}
            />
          ) : null}
        </div>
      </div>
      {ranks == null ? (
        <p className="mt-4 text-sm text-muted">
          Rank shows under each number once every technician's week is in.
        </p>
      ) : null}
      {detail ? <Boomerangs week={week} writing={editNotes} /> : null}
    </Card>
    {editNumbers || editService || editNotes ? null : (
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
      placeholder="What can we do to grow this number"
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

function TechNotes({ week, writing }: { week: WeekLog; writing: boolean }) {
  const upsertWeek = useBoard((state) => state.upsertWeek);
  if (!writing && !week.working && !week.practice) return null;
  return (
    <div className="mt-6 space-y-3">
      {writing || week.working ? (
        <Card>
          <label className="block text-sm text-honey" htmlFor="went-well">
            What went well
          </label>
          {writing ? (
            <textarea
              id="went-well"
              value={week.working}
              onChange={(event) => upsertWeek({ ...week, working: event.target.value })}
              placeholder="Name something real from the week."
              className={cn(fieldClass, "mt-3 min-h-28 py-3")}
            />
          ) : (
            <p className="mt-3 text-lg leading-snug text-ink">{week.working}</p>
          )}
        </Card>
      ) : null}
      {writing || week.practice ? (
        <Card>
          <label className="block text-sm text-honey" htmlFor="work-on">
            What we need to work on
          </label>
          {writing ? (
            <textarea
              id="work-on"
              value={week.practice}
              onChange={(event) => upsertWeek({ ...week, practice: event.target.value })}
              placeholder="The habit to practice next."
              className={cn(fieldClass, "mt-3 min-h-28 py-3")}
            />
          ) : (
            <p className="mt-3 text-lg leading-snug text-ink">{week.practice}</p>
          )}
        </Card>
      ) : null}
    </div>
  );
}

function ManagerNotes({ week, writing }: { week: WeekLog; writing: boolean }) {
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
              onChange={(event) => patchWeek(week, { working: event.target.value })}
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
              onChange={(event) => patchWeek(week, { practice: event.target.value })}
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
  const levels = kind === "manager" ? MANAGER_LEVELS : LEVELS;
  return (
    <Card className="mt-6">
      <h2 className="text-2xl">Habits</h2>
      <p className="mt-2 text-sm text-muted">
        {kind === "manager"
          ? "Rate the pattern for the week, not one moment."
          : "Second to the numbers. One mark for the week."}
      </p>
      <ul className="mt-5 space-y-6">
        {categories.map((category) => {
          const score = week.scores[category.id];
          const tier = kind === "manager" ? managerTier(category.id, score) : null;
          return (
            <li key={category.id}>
              <p className="text-ink">{category.name}</p>
              <p className="mt-1 text-sm text-muted">{category.hint}</p>
              <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label={category.name}>
                {levels.map((level) => {
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
                          ...storedWeek(week),
                          scores: { ...storedWeek(week).scores, [category.id]: level.score },
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
              {tier ? (
                <div className="mt-3 rounded-xl bg-raised p-3">
                  <p className="text-sm leading-snug text-ink">{tier.description}</p>
                  <ul className="mt-2 space-y-1">
                    {tier.behaviors.map((behavior) => (
                      <li key={behavior} className="text-sm text-muted">
                        {behavior}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
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

  return (
    <Card className="mt-6">
      <h2 className="text-2xl">How the habits landed</h2>
      <p className="mt-2 text-sm text-muted">
        {kind === "manager"
          ? "Needs Improvement through Exceptional. This is the pattern for the week, not one moment."
          : "Starting, Practicing, Steady, Strong, or Showing others. This is where the habit is this week, not a score against anyone else."}
      </p>
      <ul className="mt-5 space-y-5">
        {rows.map((row) => (
          <li key={row.id}>
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <p className="text-ink">{row.name}</p>
                <p className="text-sm text-muted">{row.hint}</p>
              </div>
              <p className="shrink-0 text-sm text-honey">{levelWord(row.score, kind)}</p>
            </div>
            <div
              className="mt-2 flex gap-1.5"
              role="img"
              aria-label={`${row.name}: ${levelWord(row.score, kind)}`}
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
            {kind === "manager" && managerTier(row.id, row.score) ? (
              <p className="mt-2 text-sm leading-snug text-ink">
                {managerTier(row.id, row.score)?.description}
              </p>
            ) : null}
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

function recsFromTotal(total: number | null, cars: number | null) {
  if (total == null || cars == null || cars <= 0) return null;
  return Math.round((total / cars) * 100) / 100;
}

function techFigures(input: {
  billedHours: number | null;
  billedPerRo: number | null;
  totalRecommendations: number | null;
  serviceHours: number | null;
}) {
  const cars =
    input.billedHours != null && input.billedPerRo != null && input.billedPerRo > 0
      ? Math.round(input.billedHours / input.billedPerRo)
      : null;
  const efficiency =
    input.billedHours != null && input.serviceHours != null && input.serviceHours > 0
      ? Math.round((input.billedHours / input.serviceHours) * 1000) / 10
      : null;
  const recsPerVehicle = recsFromTotal(input.totalRecommendations, cars);
  return {
    ...(cars != null ? { cars } : {}),
    ...(recsPerVehicle != null ? { recsPerVehicle } : {}),
    ...(efficiency != null ? { efficiency } : {}),
  };
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
  const focused = useRef(false);
  useEffect(() => {
    if (focused.current) return;
    setText(value == null ? "" : formatHours(value));
  }, [value]);
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
        onFocus={() => {
          focused.current = true;
        }}
        onChange={(event) => {
          const nextText = event.target.value;
          setText(nextText);
          if (nextText.trim() === "") {
            onCommit(null);
            return;
          }
          const parsed = Number(nextText);
          if (Number.isNaN(parsed)) return;
          onCommit(Math.min(max, Math.max(0, Math.round(parsed * 100) / 100)));
        }}
        onBlur={() => {
          focused.current = false;
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
  onDone,
  actor,
  capture,
}: {
  tech: Tech;
  week: WeekLog | null;
  upcoming: string | null;
  onStart: (weekStart: string) => void;
  onDone: () => void;
  actor?: "owner" | "manager";
  capture?: (week: WeekLog) => WeekLog;
}) {
  const upsertWeek = useBoard((state) => state.upsertWeek);
  const removeTech = useBoard((state) => state.removeTech);
  const categories = categoriesFor(useBoard((state) => state.categories), tech.kind);
  const navigate = useNavigate();
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");
  const [confirming, setConfirming] = useState(false);

  const latestWeek = () => {
    if (!week) return null;
    return (
      useBoard.getState().weeks.find(
        (item) => item.techId === week.techId && item.weekStart === week.weekStart,
      ) ?? week
    );
  };
  const keep = async (next: WeekLog, leave: boolean) => {
    upsertWeek(next);
    const saved = await flushSharedBoard();
    if (!saved) throw new Error("save failed");
    if (leave) onDone();
  };

  return (
    <div className="mt-10 space-y-4 border-t border-line pt-8">
      {actor === "owner" ? (
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

      {week && tech.kind === "technician" && actor === "manager" ? (
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

      {week && actor ? (
        <div className="space-y-3">
          <p className="text-sm text-muted">
            {actor === "owner"
              ? techReviewStage(week) === "manager"
                ? "With the manager. You can still change the numbers until they submit."
                : "Enter billed hours, BH/RO, and total recommendations. Submit sends it to the manager."
              : "Add service hours and every note, then submit."}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Button
              disabled={sending}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                const latest = latestWeek();
                if (!latest || sending) return;
                setSending(true);
                setNotice("");
                void keep(latest, false)
                  .then(() => setNotice("Saved."))
                  .catch(() => setNotice("Not saved. Try again."))
                  .finally(() => setSending(false));
              }}
            >
              Save
            </Button>
            <Button
              disabled={sending}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                const latest = latestWeek();
                if (!latest || sending) return;
                setSending(true);
                void keep(latest, true).catch(() => {
                  setSending(false);
                  setNotice("Not saved. Try again.");
                });
              }}
            >
              Save & exit
            </Button>
          </div>
          <button
            type="button"
            disabled={sending}
            onClick={() => {
              const latest = latestWeek();
              if (!latest || sending) return;
              if (actor === "owner") {
                if (
                  latest.billedHours == null ||
                  latest.hoursPerRepairOrder == null ||
                  latest.totalRecommendations == null
                ) {
                  setNotice("Add billed hours, BH/RO, and total recommendations first.");
                  return;
                }
                setSending(true);
                void keep({ ...latest, reviewStage: "manager" }, false).finally(() => {
                  setSending(false);
                  setNotice("Sent to the manager.");
                });
                return;
              }
              const gaps = managerGaps(latest);
              if (gaps.length > 0) {
                setNotice(`Still need ${gaps.join(", ")}.`);
                return;
              }
              setConfirming(true);
            }}
            className="w-full animate-pulse rounded-md bg-honey px-5 py-4 font-display text-lg font-semibold tracking-wide text-honey-fg uppercase italic shadow-[0_0_28px_rgba(196,34,48,0.9)]"
          >
            Submit
          </button>
          {notice ? <p className="text-sm text-muted">{notice}</p> : null}
          {confirming ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
              <div className="w-full max-w-sm rounded-md bg-surface px-6 py-6 text-center shadow-border">
                <p className="font-display text-2xl tracking-wide text-ink uppercase italic">
                  you for reals right now?
                </p>
                <div className="mt-6 grid gap-3">
                  <button
                    type="button"
                    className="min-h-11 rounded-md bg-honey font-display text-sm font-semibold tracking-wide text-honey-fg uppercase italic"
                    onClick={() => {
                      const latest = latestWeek();
                      if (!latest) return;
                      setConfirming(false);
                      setSending(true);
                      void keep({ ...latest, reviewStage: "locked", submitted: true }, true);
                    }}
                  >
                    i am for reals
                  </button>
                  <button
                    type="button"
                    className="min-h-11 font-display text-sm tracking-wide text-muted uppercase italic"
                    onClick={() => setConfirming(false)}
                  >
                    nope
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : week && tech.kind === "manager" ? (
        <ManagerSignOff
          tech={tech}
          week={week}
          sending={sending}
          setSending={setSending}
          onKeep={keep}
          onDone={onDone}
          capture={capture}
        />
      ) : null}

      {actor === "owner" ? (
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
      ) : null}
    </div>
  );
}

function ManagerSignOff({
  tech,
  week,
  sending,
  setSending,
  onKeep,
  onDone,
  capture,
}: {
  tech: Tech;
  week: WeekLog;
  sending: boolean;
  setSending: (value: boolean) => void;
  onKeep: (next: WeekLog, leave: boolean) => Promise<void>;
  onDone: () => void;
  capture?: (week: WeekLog) => WeekLog;
}) {
  const viewer = useBoard((state) => state.viewer);
  const shops = useBoard((state) => state.shops);
  const categories = categoriesFor(useBoard((state) => state.categories), "manager");
  const [asking, setAsking] = useState<"darin" | "arun" | null>(null);
  const [savedNote, setSavedNote] = useState("");
  const latest = () => {
    const current =
      useBoard.getState().weeks.find(
        (item) => item.techId === week.techId && item.weekStart === week.weekStart,
      ) ?? week;
    return capture ? capture(current) : current;
  };
  const save = (leave: boolean) => {
    if (sending) return;
    setSending(true);
    setSavedNote("");
    void onKeep(latest(), leave)
      .then(() => {
        if (leave) return;
        setSending(false);
        setSavedNote("Saved.");
      })
      .catch(() => {
        setSending(false);
        setSavedNote("Not saved. Try again.");
      });
  };
  const approve = (who: "darin" | "arun") => {
    setAsking(null);
    setSending(true);
    setSavedNote("");
    const current = latest();
    void onKeep(
      {
        ...current,
        darinReady: who === "darin" ? true : current.darinReady,
        arunReady: who === "arun" ? true : current.arunReady,
      },
      false,
    )
      .then(() => setSavedNote("Saved."))
      .catch(() => setSavedNote("Not saved. Try again."))
      .finally(() => setSending(false));
  };
  const both = Boolean(week.darinReady && week.arunReady);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Button
          disabled={sending}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => save(false)}
        >
          Save
        </Button>
        <Button
          disabled={sending}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => save(true)}
        >
          Save & exit
        </Button>
        <ReadyMark
          label="Darin"
          ready={Boolean(week.darinReady)}
          mine={viewer === "darin"}
          disabled={sending}
          onAsk={() => setAsking("darin")}
        />
        <ReadyMark
          label="Arun"
          ready={Boolean(week.arunReady)}
          mine={viewer === "arun"}
          disabled={sending}
          onAsk={() => setAsking("arun")}
        />
      </div>
      {both ? (
        <button
          type="button"
          disabled={sending}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (sending) return;
            setSending(true);
            const current = latest();
            const saved = {
              ...current,
              darinReady: true,
              arunReady: true,
              submitted: true,
              reviewStage: "locked" as const,
            };
            void onKeep(saved, false)
              .then(() => {
                const shop = shops.find((item) => item.id === tech.shopId);
                void mailManagerReview({
                  data: {
                    shopId: tech.shopId,
                    managerName: tech.name,
                    managerEmail: tech.email ?? "",
                    shopName: shop?.name ?? tech.shopId,
                    weekLabel: weekRangeLabel(current.weekStart),
                    rows: reviewRows(saved),
                    notes: [
                      { label: "What's already working", value: saved.working ?? "" },
                      { label: "What to practice next", value: saved.practice ?? "" },
                    ],
                    habits: categories.map((category) => ({
                      name: category.name,
                      word: levelWord(saved.scores[category.id], "manager"),
                    })),
                  },
                });
                onDone();
              })
              .catch(() => {
                setSending(false);
                setSavedNote("Not saved. Try again.");
              });
          }}
          className="relative w-full overflow-hidden rounded-md bg-gradient-to-r from-amber-200 via-yellow-100 to-amber-400 px-5 py-4 font-display text-lg font-semibold tracking-wide text-zinc-900 uppercase italic shadow-[0_0_28px_rgba(250,204,21,0.9)]"
        >
          <span className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 animate-[shine_1.8s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/80 to-transparent" />
          Submit
        </button>
      ) : (
        <p className="text-sm text-muted">Both names turn green before submit. Turning one green saves the review.</p>
      )}
      {savedNote ? <p className="text-sm text-muted">{savedNote}</p> : null}
      {asking ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-sm rounded-md bg-surface px-6 py-6 text-center shadow-border">
            <p className="font-display text-2xl tracking-wide text-ink uppercase italic">
              is this review as complete as it can be?
            </p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                className="min-h-11 rounded-md bg-honey font-display text-sm font-semibold tracking-wide text-honey-fg uppercase italic"
                onClick={() => approve(asking)}
              >
                yes
              </button>
              <button
                type="button"
                className="min-h-11 font-display text-sm tracking-wide text-muted uppercase italic"
                onClick={() => setAsking(null)}
              >
                no
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ReadyMark({
  label,
  ready,
  mine,
  disabled,
  onAsk,
}: {
  label: string;
  ready: boolean;
  mine: boolean;
  disabled: boolean;
  onAsk: () => void;
}) {
  if (ready) {
    return (
      <button
        type="button"
        disabled
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-emerald-500 px-3 font-display text-sm font-semibold tracking-wide text-white uppercase italic"
      >
        <ThumbsUp className="size-4" />
        {label}!
      </button>
    );
  }
  return (
    <button
      type="button"
      disabled={!mine || disabled}
      onClick={onAsk}
      className={cn(
        "min-h-11 rounded-md px-3 font-display text-sm font-semibold tracking-wide uppercase italic",
        mine ? "bg-raised text-ink shadow-border" : "cursor-not-allowed bg-raised text-muted opacity-40",
      )}
    >
      {label}?
    </button>
  );
}

function reviewRows(week: WeekLog) {
  return [
    { label: "Total sales", value: week.totalSales == null ? "—" : formatMoney(week.totalSales) },
    { label: "Sell through percentage", value: week.sellThrough == null ? "—" : `${formatHours(week.sellThrough)}%` },
    { label: "ARO", value: week.averageRepairOrder == null ? "—" : formatMoney(week.averageRepairOrder) },
    { label: "Hours per repair order", value: week.hoursPerRepairOrder == null ? "—" : formatHours(week.hoursPerRepairOrder) },
    { label: "Recommendation per car", value: week.recsPerVehicle == null ? "—" : formatMoney(week.recsPerVehicle) },
    { label: "Sales per billed hour", value: week.salesPerBilledHour == null ? "—" : formatMoney(week.salesPerBilledHour) },
    { label: "Gross profit", value: week.grossProfit == null ? "—" : formatMoney(week.grossProfit) },
  ];
}

function managerGaps(week: WeekLog) {
  const gaps: string[] = [];
  if (week.serviceHours == null) gaps.push("service hours");
  if (!week.working?.trim()) gaps.push("what went well");
  if (!week.practice?.trim()) gaps.push("what we need to work on");
  if (week.billedHours != null && week.billedHours < 40 && !(week.billedNote ?? "").trim()) {
    gaps.push("the billed hours note");
  }
  if (week.cars != null && Math.round(week.cars) < 14 && !(week.carsNote ?? "").trim()) {
    gaps.push("the cars note");
  }
  if (week.recsPerVehicle != null && week.recsPerVehicle < 2500 && !(week.recsNote ?? "").trim()) {
    gaps.push("the recommendations note");
  }
  if (
    week.efficiency != null &&
    (week.efficiency < 100 || week.efficiency > 150) &&
    !(week.efficiencyNote ?? "").trim()
  ) {
    gaps.push("the efficiency note");
  }
  for (const item of week.boomerangs ?? []) {
    if (!item.ro.trim() || !item.note.trim()) gaps.push("each boomerang");
  }
  return gaps;
}
