import { useEffect, useState } from "react";
import { addDays, format, parseISO } from "date-fns";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  DAY_FIELDS,
  DAY_PROMPTS,
  END_OF_DAY_WAIT,
  endOfDayOpen,
  focusReview,
  isOwnerViewer,
  mondayISO,
  shopClock,
  techReviewStage,
  weekRangeLabel,
  type DayFieldKey,
  type DayPromptKey,
  type DayReport,
} from "@/lib/board/model";
import { pullShopRange } from "@/lib/board/dashboard.functions";
import { getDayReport, submitDayReport } from "@/lib/board/records.functions";
import { useBoard } from "@/lib/board/store";
import { refreshCalls, refreshFeedback, refreshWeeks } from "@/lib/board/shared";
import { FeedbackPopup, type FeedbackFor } from "@/components/board/feedback";
import { viewingAs, writable } from "@/lib/board/view-as";
import { CallReview, pendingCalls } from "@/components/board/phone-call";
import { Button, Card, fieldClass } from "@/components/board/ui";
import { cn } from "@/lib/cn";

function todayISO() {
  return shopClock().day;
}

const BEST_MONTH: Record<string, { label: string; values: Partial<Record<DayFieldKey, string>> }> = {
  fremont: {
    label: "Oct. 25",
    values: {
      productivity: "73.9%",
      efficiency: "105.4%",
      proficiency: "81.0%",
      elr: "$226.31",
      spbh: "$434.17",
      hpro: "3.2",
      hoursPerDay: "17.8",
      billedHours: "15.8",
      workHours: "14.4",
      serviceHours: "15.0",
      availableHours: "19.5",
      laborSales: "$3,570.76",
      totalSales: "$6,850.55",
      carCount: "4.9",
    },
  },
  campbell: {
    label: "Apr. 26",
    values: {
      productivity: "80.1%",
      efficiency: "86.7%",
      proficiency: "69.5%",
      elr: "$251.41",
      spbh: "$441.08",
      hpro: "3.0",
      hoursPerDay: "13.5",
      billedHours: "12.0",
      workHours: "13.9",
      serviceHours: "13.9",
      availableHours: "17.3",
      laborSales: "$3,022.48",
      totalSales: "$5,302.78",
      carCount: "3.9",
    },
  },
  "san-ramon": {
    label: "Jun. 25",
    values: {
      productivity: "84.2%",
      efficiency: "115.1%",
      proficiency: "97.4%",
      elr: "$198.92",
      spbh: "$320.24",
      hpro: "2.9",
      hoursPerDay: "21.1",
      billedHours: "19.9",
      workHours: "17.2",
      serviceHours: "17.3",
      availableHours: "20.4",
      laborSales: "$3,958.15",
      totalSales: "$6,372.21",
      carCount: "6.9",
    },
  },
  "san-jose": {
    label: "May 26",
    values: {
      productivity: "72.1%",
      efficiency: "73.7%",
      proficiency: "68.7%",
      elr: "$216.35",
      spbh: "$425.77",
      hpro: "3.4",
      hoursPerDay: "12.7",
      billedHours: "12.7",
      workHours: "13.4",
      serviceHours: "17.3",
      availableHours: "18.5",
      laborSales: "$2,755.75",
      totalSales: "$5,423.25",
      carCount: "3.8",
    },
  },
  "castro-valley": {
    label: "Jul. 26",
    values: {
      productivity: "85.6%",
      efficiency: "85.2%",
      proficiency: "79.6%",
      elr: "$214.51",
      spbh: "$360.13",
      hpro: "3.0",
      hoursPerDay: "10.5",
      billedHours: "9.4",
      workHours: "10.1",
      serviceHours: "11.0",
      availableHours: "11.7",
      laborSales: "$2,006.27",
      totalSales: "$3,368.20",
      carCount: "3.1",
    },
  },
};

const GOALS: Partial<Record<DayFieldKey, { label: string; low: number; high?: number }>> = {
  productivity: { label: "85% – 90%", low: 85 },
  efficiency: { label: "100% – 150%", low: 100, high: 150 },
  proficiency: { label: "100%", low: 100 },
  elr: { label: "$250.00", low: 250 },
  spbh: { label: "$400.00", low: 400 },
  hpro: { label: "3.00", low: 3 },
  hoursPerDay: { label: "20.00", low: 20 },
};

const ENTERED: DayFieldKey[] = ["workHours", "serviceHours", "availableHours"];

/** What each number means, behind the ? next to its name. Numbers without text get no ?. */
const ABOUT: Partial<Record<DayFieldKey, string>> = {
  elr: "ELR (Effective Labor Rate): am I making enough dollars per billed hour to ensure strong sales and gross profit?",
  hpro: "HPRO (Hours Per Repair Order): am I identifying additional recommendations on every car and selling them?",
  spbh: "SPBH (Sales Per Billed Hour): am I adding in parts and sublets that add value to our customers and ensure strong sales and gross profit?",
  productivity:
    "Work hours ÷ available hours. How much of the techs' available time was spent working on cars. Goal: 85–90%.",
  efficiency:
    "Billed hours ÷ service hours. How the hours we billed compare with the time spent doing the work. Over 100% means the work got done faster than it was billed. Goal: 100–150%.",
  proficiency:
    "Billed hours ÷ available hours. How many billed hours we got out of the techs' available time. It's productivity and efficiency together. Goal: 100%.",
  hoursPerDay: "Billed hours for the day. Goal: 20.",
  billedHours: "Billed hours: the labor hours billed on all jobs that closed today.",
  workHours: "Work hours: the actual time clocked in Shop-Ware that a technician spent on any job today.",
  serviceHours: "Service hours: the actual time clocked in Shop-Ware that a technician spent on jobs that closed today.",
  availableHours: "Available hours: the actual time clocked in Workforce by technicians today.",
  laborSales: "The labor part of today's sales, not counting parts.",
  totalSales: "Everything sold today, parts and labor.",
  carCount: "Repair orders closed today.",
  creditCardPayments: "Card payments taken today.",
  cashCheckPayments: "Cash and check payments taken today.",
};

function AboutTip({ id, label, text }: { id: string; label: string; text: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      const target = event.target as Node | null;
      if (target && document.getElementById(id)?.contains(target)) return;
      setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open, id]);
  return (
    <span id={id} className="relative inline-flex">
      <button
        type="button"
        aria-label={`What ${label} means`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="-my-2 inline-flex size-11 items-center justify-center"
      >
        <span className="inline-flex size-5 items-center justify-center rounded-full text-xs font-semibold text-muted shadow-border">
          ?
        </span>
      </button>
      {open ? (
        <span
          role="note"
          className="absolute top-full left-0 z-30 mt-1 w-72 max-w-[80vw] rounded-md bg-raised p-3 text-sm leading-snug text-ink shadow-border"
        >
          {text}
        </span>
      ) : null}
    </span>
  );
}

/** These three also show a week-to-date number from the dashboard, and their note opens only when that is below goal. */
const WEEKLY = ["productivity", "efficiency", "proficiency"] as const;
type WeeklyKey = (typeof WEEKLY)[number];
const isWeekly = (key: DayFieldKey): key is WeeklyKey => (WEEKLY as readonly string[]).includes(key);

function readNumber(raw: string | undefined) {
  if (!raw?.trim()) return null;
  const value = Number(raw.replace(/[$,%\s,]/g, ""));
  return Number.isFinite(value) ? value : null;
}

function asPercent(part: number | null, whole: number | null) {
  if (part == null || whole == null || whole === 0) return "";
  return `${(Math.round((part / whole) * 1000) / 10).toFixed(1)}%`;
}

const MIN_NOTE = 13;

function longEnough(value: string | undefined) {
  return (value?.trim().length ?? 0) >= MIN_NOTE;
}

function belowGoal(key: DayFieldKey, raw: string | undefined) {
  const goal = GOALS[key];
  const value = readNumber(raw);
  if (!goal || value == null) return false;
  if (value < goal.low) return true;
  return goal.high != null && value > goal.high;
}

export function DayReportForm({ shopId }: { shopId: string }) {
  const shop = useBoard((state) => state.shops.find((item) => item.id === shopId));
  const managerId = useBoard(
    (state) => state.techs.find((person) => person.kind === "manager" && person.shopId === shopId)?.id,
  );
  const navigate = useNavigate();
  const viewer = useBoard((state) => state.viewer);
  const techs = useBoard((state) => state.techs);
  const calls = useBoard((state) => state.calls ?? []);
  const weeks = useBoard((state) => state.weeks);
  const feedbackDue = useBoard((state) => state.feedbackDue);
  const feedbackLeft = useBoard((state) => state.feedbackLeft);
  const [feedbackFor, setFeedbackFor] = useState<FeedbackFor | null>(null);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState("");
  const [date, setDate] = useState(todayISO);
  const [saved, setSaved] = useState<DayReport | null>(null);
  const [draft, setDraft] = useState<Partial<Record<DayFieldKey, string>>>({});
  const [notes, setNotes] = useState<Partial<Record<DayFieldKey, string>>>({});
  const [answers, setAnswers] = useState<Partial<Record<DayPromptKey, string>>>({});
  // Before 5 PM today's report stays closed, so no early snapshot of the numbers.
  const [open, setOpen] = useState(() => endOfDayOpen(date));
  // Darin and Arun can look at End of Day any time; sending still waits for 5 PM.
  const owner = isOwnerViewer(viewer);
  const previewing = owner && !open;
  useEffect(() => {
    setOpen(endOfDayOpen(date));
    const timer = window.setInterval(() => setOpen(endOfDayOpen(date)), 30_000);
    return () => window.clearInterval(timer);
  }, [date]);

  useEffect(() => {
    // A call reflection sent while this page was closed has to show up here.
    void refreshCalls().catch(() => undefined);
    void refreshWeeks().catch(() => undefined);
    void refreshFeedback().catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancel = false;
    setSaved(null);
    setDraft({});
    setNotes({});
    setAnswers({});
    void getDayReport({ data: { shopId, date } })
      .then((report) => {
        if (cancel || !report) return;
        setSaved(report);
        setDraft(report.values ?? {});
        setNotes(report.notes ?? {});
        setAnswers(report.answers ?? {});
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, [shopId, date]);

  // Week to date comes straight from the dashboard: Monday through this day.
  // The work week is Monday to Thursday, so a report on Friday to Sunday shows Monday to Thursday.
  const [dashWeek, setDashWeek] = useState<Partial<Record<WeeklyKey, string>>>({});
  useEffect(() => {
    let cancel = false;
    setDashWeek({});
    const day = parseISO(date);
    const start = mondayISO(day);
    const end = [1, 2, 3, 4].includes(day.getDay()) ? date : format(addDays(parseISO(start), 3), "yyyy-MM-dd");
    void pullShopRange({ data: { shopId, start, end } })
      .then((result) => {
        if (!cancel && result.ok) setDashWeek(result.rates);
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, [shopId, date]);

  const submitted = Boolean(saved?.submitted);
  const best = BEST_MONTH[shopId];
  const productivity = asPercent(readNumber(draft.workHours), readNumber(draft.availableHours));
  // Efficiency is billed hours divided by service hours.
  const efficiency = asPercent(readNumber(draft.billedHours), readNumber(draft.serviceHours));
  const proficiency = asPercent(readNumber(draft.billedHours), readNumber(draft.availableHours));
  const shown: Partial<Record<DayFieldKey, string>> = {
    ...draft,
    productivity,
    efficiency,
    proficiency,
  };
  // A sent report keeps the week-to-date numbers it was sent with.
  const savedWeek = (key: WeeklyKey) => (draft as Record<string, string | undefined>)[`${key}Wtd`]?.trim() ?? "";
  const week = Object.fromEntries(
    WEEKLY.map((key) => [key, (submitted && savedWeek(key)) || dashWeek[key] || ""]),
  ) as Record<WeeklyKey, string>;
  // Productivity, efficiency and proficiency ask for a note only when the week so far is below goal.
  const needsNote = (key: DayFieldKey) =>
    isWeekly(key) ? belowGoal(key, week[key]) : belowGoal(key, shown[key]);
  const notesReady = DAY_FIELDS.every((field) => !needsNote(field.key) || longEnough(notes[field.key]));
  const promptsReady = DAY_PROMPTS.every((prompt) => longEnough(answers[prompt.key]));
  const ready = notesReady && promptsReady;

  useEffect(() => {
    if (submitted || !(open || owner)) return;
    let cancel = false;
    void pullShopRange({ data: { shopId, start: date, end: date } }).then((result) => {
      if (cancel || !result.ok) return;
      setDraft((current) => {
        const next = { ...current };
        for (const [key, value] of Object.entries(result.fields)) {
          const field = key as DayFieldKey;
          if (!next[field]?.trim()) next[field] = value;
        }
        return next;
      });
    });
    return () => {
      cancel = true;
    };
  }, [shopId, date, submitted, open, owner]);

  if (!open && !owner) {
    return (
      <div>
        <Link to="/" className="inline-flex min-h-11 items-center text-sm text-honey">
          Back to {shop?.name ?? "the shop"}
        </Link>
        <h1 className="mt-3 text-4xl text-ink">End of Day Report</h1>
        <p className="mt-2 text-muted">{shop?.name}</p>
        <Card className="mt-6">
          <p className="font-display text-2xl text-ink">{END_OF_DAY_WAIT}</p>
          <p className="mt-2 text-sm text-muted">
            Come back after 5 so the report has the whole day's numbers.
          </p>
        </Card>
      </div>
    );
  }

  const person = techs.find((item) => item.id === viewer);
  const waiting = person?.kind === "manager" ? pendingCalls(calls, person.id)[0] : null;
  if (waiting && person) {
    return (
      <CallReview
        key={waiting.id}
        call={waiting}
        person={person}
        shopName={shop?.name ?? person.shopId}
        index={1}
        total={pendingCalls(calls, person.id).length}
        lead="Let's take care of these first."
      />
    );
  }

  // Tech reviews Darin or Arun sent to this manager come before the report.
  // There is no skip.
  const owed =
    person?.kind === "manager"
      ? weeks
          .filter((week) => techReviewStage(week) === "manager")
          .map((week) => ({ week, tech: techs.find((item) => item.id === week.techId) }))
          .filter(
            (row): row is { week: typeof row.week; tech: NonNullable<typeof row.tech> } =>
              row.tech?.kind === "technician" && row.tech.shopId === person.shopId,
          )
          .sort((a, b) => a.week.weekStart.localeCompare(b.week.weekStart))
      : [];
  if (owed.length > 0) {
    return (
      <div>
        <h1 className="mt-3 text-4xl text-ink">End of Day Report</h1>
        <p className="mt-2 text-muted">{shop?.name}</p>
        <Card className="mt-6">
          <p className="font-display text-2xl text-ink">Let's take care of these first.</p>
          <p className="mt-2 text-sm text-muted">
            Finish and send {owed.length === 1 ? "this tech check-in" : "these tech check-ins"}, then the
            report opens.
          </p>
          <ul className="mt-5 space-y-3">
            {owed.map(({ week, tech }) => (
              <li key={`${tech.id}-${week.weekStart}`}>
                <Link
                  to="/t/$techId"
                  params={{ techId: tech.id }}
                  onClick={() => focusReview(tech.id, week.weekStart)}
                  className="flex min-h-12 items-center justify-between gap-3 rounded-md bg-raised px-4 shadow-border"
                >
                  <span className="text-ink">{tech.name}</span>
                  <span className="text-sm text-honey">{weekRangeLabel(week.weekStart)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    );
  }

  // On Wednesday a manager sends feedback for both Arun and Darin before the report.
  if (person?.kind === "manager" && feedbackDue) {
    return (
      <div>
        <h1 className="mt-3 text-4xl text-ink">End of Day Report</h1>
        <p className="mt-2 text-muted">{shop?.name}</p>
        <Card className="mt-6">
          <p className="font-display text-2xl text-ink">One more thing first.</p>
          <p className="mt-2 text-sm text-muted">
            It's Wednesday. Send feedback for {feedbackLeft.length > 1 ? "both Arun and Darin" : "one more"}, then
            the report opens.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            {feedbackLeft.includes("arun") ? (
              <Button onClick={() => setFeedbackFor("arun")}>Feedback · Arun</Button>
            ) : null}
            {feedbackLeft.includes("darin") ? (
              <Button onClick={() => setFeedbackFor("darin")}>Feedback · Darin</Button>
            ) : null}
          </div>
        </Card>
        {feedbackFor ? (
          <FeedbackPopup about={feedbackFor} fromName={person.name} onClose={() => setFeedbackFor(null)} />
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <Link to="/" className="inline-flex min-h-11 items-center text-sm text-honey">
        Back to {shop?.name ?? "the shop"}
      </Link>
      <h1 className="mt-3 text-4xl text-ink">End of Day Report</h1>
      <p className="mt-2 text-muted">{shop?.name}</p>
      {previewing ? (
        <p className="mt-3 rounded-md bg-raised px-3 py-2 text-sm text-ink shadow-border">
          Preview. Managers can open this at 5 PM; until then the numbers are from earlier in the day.
        </p>
      ) : null}

      <Card className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="text-sm text-muted" htmlFor="report-date">
            Date
          </label>
          <input
            id="report-date"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className={cn(fieldClass, "min-h-9 w-40 px-2")}
          />
        </div>
        <ul className="mt-2 divide-y divide-line">
            <li className="hidden items-center justify-end gap-3 py-1.5 sm:flex">
              <span className="w-28 text-right text-xs text-muted">Goal</span>
              <span className="w-36 text-right text-xs leading-snug text-muted">
                {best ? `Best Month - ${best.label} (daily avg)` : ""}
              </span>
              <span className="w-28" />
            </li>
          {DAY_FIELDS.map((field) => {
            const value = shown[field.key] ?? "";
            const low = belowGoal(field.key, value);
            const wtd = isWeekly(field.key) ? week[field.key] : "";
            const wtdTone = wtd ? (belowGoal(field.key, wtd) ? "#ff4d4d" : "#3DDC84") : undefined;
            const ask = needsNote(field.key);
            const entered = ENTERED.includes(field.key);
            const tone =
              GOALS[field.key] && readNumber(value) != null ? (low ? "#ff4d4d" : "#3DDC84") : undefined;
            return (
              <li key={field.key} className="py-1.5">
                {/* Phone: name on top, then Goal / Best month / Today side by side with small captions.
                    Wider screens: one line, under the column headings. */}
                <div
                  className={cn(
                    "grid gap-x-3 gap-y-0.5 sm:flex sm:items-center",
                    best ? "grid-cols-3" : "grid-cols-2",
                  )}
                >
                  <span className={cn("flex min-w-0 items-center sm:flex-1", best ? "col-span-3" : "col-span-2")}>
                    <label className="min-w-0 text-sm text-ink" htmlFor={field.key}>
                      {field.label}
                    </label>
                    {ABOUT[field.key] ? (
                      <AboutTip id={`about-${field.key}`} label={field.label} text={ABOUT[field.key] ?? ""} />
                    ) : null}
                  </span>
                  <span className="flex flex-col text-xs whitespace-nowrap text-muted sm:w-28 sm:shrink-0 sm:text-right">
                    <span className="text-[10px] tracking-wide uppercase sm:hidden">Goal</span>
                    {GOALS[field.key]?.label ?? (
                      <span className="sm:hidden" aria-hidden="true">
                        —
                      </span>
                    )}
                  </span>
                  {best ? (
                    <span className="flex flex-col text-sm tabular-nums text-muted sm:w-36 sm:shrink-0 sm:text-right">
                      <span className="text-[10px] tracking-wide uppercase sm:hidden">Best · {best.label}</span>
                      {best.values[field.key] ?? ""}
                    </span>
                  ) : (
                    <span className="hidden sm:block sm:w-36 sm:shrink-0" />
                  )}
                  <span className="flex flex-col items-end sm:contents">
                    <span className="text-[10px] tracking-wide text-muted uppercase sm:hidden">Today</span>
                  {entered ? (
                    <input
                      id={field.key}
                      inputMode="decimal"
                      value={draft[field.key] ?? ""}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, [field.key]: event.target.value }))
                      }
                      className={cn(fieldClass, "min-h-9 w-24 shrink-0 px-2 text-right tabular-nums sm:w-28")}
                      style={{ color: tone }}
                    />
                  ) : (
                    <span
                      className="flex min-h-9 shrink-0 items-center justify-end text-right text-sm tabular-nums text-ink sm:w-28 sm:px-2"
                      style={{ color: tone }}
                    >
                      {value || "—"}
                    </span>
                  )}
                  </span>
                </div>
                {isWeekly(field.key) ? (
                  <p className="mt-0.5 flex items-baseline justify-end gap-2 pr-2 tabular-nums">
                    <span className="text-xs text-muted">Week to date</span>
                    <span className="text-base font-semibold" style={{ color: wtdTone }}>
                      {wtd || "—"}
                    </span>
                  </p>
                ) : null}
                {ask ? (
                  <textarea
                    id={`${field.key}-why`}
                    value={notes[field.key] ?? ""}
                    onChange={(event) =>
                      setNotes((current) => ({ ...current, [field.key]: event.target.value }))
                    }
                    placeholder="How will you grow that number tomorrow?"
                    className={cn(fieldClass, "mt-1.5 min-h-16 w-full py-2")}
                  />
                ) : null}
                {ask && !longEnough(notes[field.key]) ? (
                  <p className="mt-1 text-xs text-muted">13 characters minimum</p>
                ) : null}
              </li>
            );
          })}
        </ul>
        {DAY_PROMPTS.map((prompt) => (
          <label key={prompt.key} className="mt-4 block text-sm text-ink" htmlFor={prompt.key}>
            {prompt.label}
            <textarea
              id={prompt.key}
              value={answers[prompt.key] ?? ""}
              onChange={(event) =>
                setAnswers((current) => ({ ...current, [prompt.key]: event.target.value }))
              }
              className={cn(fieldClass, "mt-1.5 min-h-24 w-full py-2")}
            />
            {longEnough(answers[prompt.key]) ? null : (
              <span className="mt-1 block text-xs text-muted">13 characters minimum</span>
            )}
          </label>
        ))}
      </Card>

      <Button
        className="mt-6 w-full text-base"
        disabled={sending || !ready || previewing}
        onClick={() => {
          if (sending || !ready || previewing) return;
          setSending(true);
          setProblem("");
          void writable(() => submitDayReport({
              data: {
                shopId,
                date,
                values: {
                  ...shown,
                  // Saved with the report so the email and later views show the week so far.
                  ...Object.fromEntries(WEEKLY.map((key) => [`${key}Wtd`, week[key]])),
                },
                notes: Object.fromEntries(
                  Object.entries(notes).filter(([key]) => needsNote(key as DayFieldKey)),
                ),
                answers,
              },
            }))
            .then((result) => {
              if (!result.mailed) {
                setSending(false);
                setProblem("Saved, but the email did not go out. Press Submit again to resend it.");
                return;
              }
              // Leave the page only after the email has gone out.
              if (window.history.length > 1) window.history.back();
              else if (managerId) navigate({ to: "/t/$techId", params: { techId: managerId } });
              else navigate({ to: "/" });
            })
            .catch((error: unknown) => {
              setSending(false);
              const reason = error instanceof Error ? error.message : "";
              if (viewingAs()) {
                setProblem("View only. Nothing was sent.");
                return;
              }
              if (reason.includes("feedback")) {
                setProblem("It's Wednesday. Send feedback for Arun and Darin first.");
                void refreshFeedback().catch(() => undefined);
                return;
              }
              if (reason.includes("tech check-in")) {
                setProblem("Finish your tech check-ins first.");
                void refreshWeeks().catch(() => undefined);
                return;
              }
              setProblem("That report did not send. Check the notes and try again.");
            });
        }}
      >
        Submit
      </Button>
      {problem ? <p className="mt-3 text-sm text-honey">{problem}</p> : null}
      <p className="mt-3 text-sm text-muted">
        {previewing
          ? "Preview only. Submitting opens at 5 PM."
          : ready
            ? "Submit when the day is filled in."
            : "Each note needs at least 13 characters."}
      </p>
    </div>
  );
}
