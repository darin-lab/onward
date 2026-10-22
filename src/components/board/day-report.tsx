import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { DAY_FIELDS, DAY_PROMPTS, type DayFieldKey, type DayPromptKey } from "@/lib/board/model";
import { pullShopRange } from "@/lib/board/dashboard.functions";
import { mailDayReport } from "@/lib/board/mail-report.functions";
import { useBoard } from "@/lib/board/store";
import { CallReview, pendingCalls } from "@/components/board/phone-call";
import { isOwnerViewer } from "@/lib/board/model";
import { Button, Card, fieldClass } from "@/components/board/ui";
import { cn } from "@/lib/cn";

function todayISO() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
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
  const reports = useBoard((state) => state.dayReports);
  const upsertDayReport = useBoard((state) => state.upsertDayReport);
  const managerId = useBoard(
    (state) => state.techs.find((person) => person.kind === "manager" && person.shopId === shopId)?.id,
  );
  const navigate = useNavigate();
  const viewer = useBoard((state) => state.viewer);
  const techs = useBoard((state) => state.techs);
  const calls = useBoard((state) => state.calls ?? []);
  const [sending, setSending] = useState(false);
  const [date, setDate] = useState(todayISO);
  const saved = reports.find((report) => report.shopId === shopId && report.date === date);
  const [draft, setDraft] = useState<Partial<Record<DayFieldKey, string>>>(saved?.values ?? {});
  const [notes, setNotes] = useState<Partial<Record<DayFieldKey, string>>>(saved?.notes ?? {});
  const [answers, setAnswers] = useState<Partial<Record<DayPromptKey, string>>>(saved?.answers ?? {});
  const [draftDate, setDraftDate] = useState(date);

  if (draftDate !== date) {
    setDraftDate(date);
    setDraft(saved?.values ?? {});
    setNotes(saved?.notes ?? {});
    setAnswers(saved?.answers ?? {});
  }

  const submitted = Boolean(saved?.submitted);
  const best = BEST_MONTH[shopId];
  const productivity = asPercent(readNumber(draft.workHours), readNumber(draft.availableHours));
  const efficiency = asPercent(readNumber(draft.billedHours), readNumber(draft.serviceHours));
  const proficiency = asPercent(readNumber(draft.billedHours), readNumber(draft.availableHours));
  const shown: Partial<Record<DayFieldKey, string>> = {
    ...draft,
    productivity,
    efficiency,
    proficiency,
  };
  const notesReady = DAY_FIELDS.every(
    (field) => !belowGoal(field.key, shown[field.key]) || longEnough(notes[field.key]),
  );
  const promptsReady = DAY_PROMPTS.every((prompt) => longEnough(answers[prompt.key]));
  const ready = notesReady && promptsReady;

  useEffect(() => {
    if (submitted) return;
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
  }, [shopId, date, submitted]);

  const person = techs.find((item) => item.id === viewer);
  const queue = pendingCalls(calls, person?.id ?? viewer);
  const waiting = queue[0];
  const actor =
    person ??
    (waiting && import.meta.env.DEV && isOwnerViewer(viewer)
      ? {
          id: "darin",
          name: "Darin Dinis",
          role: "Owner",
          kind: "manager" as const,
          shopId: waiting.managerId ? techs.find((item) => item.id === waiting.managerId)?.shopId ?? shopId : shopId,
          email: "",
        }
      : null);
  if (waiting && actor && (person?.kind === "manager" || actor.role === "Owner")) {
    return (
      <CallReview
        key={waiting.id}
        call={waiting}
        person={actor}
        shopName={shop?.name ?? actor.shopId}
        index={1}
        total={queue.length}
      />
    );
  }

  return (
    <div>
      <Link to="/" className="inline-flex min-h-11 items-center text-sm text-honey">
        Back to {shop?.name ?? "the shop"}
      </Link>
      <h1 className="mt-3 text-4xl text-ink">End of Day Report</h1>
      <p className="mt-2 text-muted">{shop?.name}</p>

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
            <li className="flex items-center justify-end gap-3 py-1.5">
              <span className="w-28 text-right text-xs text-muted">Goal</span>
              <span className="w-36 text-right text-xs leading-snug text-muted">
                {best ? `Best Month - ${best.label} (daily avg)` : ""}
              </span>
              <span className="w-28" />
            </li>
          {DAY_FIELDS.map((field) => {
            const value = shown[field.key] ?? "";
            const low = belowGoal(field.key, value);
            const entered = ENTERED.includes(field.key);
            const tone =
              GOALS[field.key] && readNumber(value) != null ? (low ? "#ff4d4d" : "#3DDC84") : undefined;
            return (
              <li key={field.key} className="py-1.5">
                <div className="flex items-center gap-3">
                  <label className="min-w-0 flex-1 text-sm text-ink" htmlFor={field.key}>
                    {field.label}
                  </label>
                  <span className="w-28 shrink-0 text-right text-xs whitespace-nowrap text-muted">
                    {GOALS[field.key]?.label ?? ""}
                  </span>
                  <span className="w-36 shrink-0 text-right text-sm tabular-nums text-muted">
                    {best?.values[field.key] ?? ""}
                  </span>
                  {entered ? (
                    <input
                      id={field.key}
                      inputMode="decimal"
                      value={draft[field.key] ?? ""}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, [field.key]: event.target.value }))
                      }
                      className={cn(fieldClass, "min-h-9 w-28 shrink-0 px-2 text-right tabular-nums")}
                      style={{ color: tone }}
                    />
                  ) : (
                    <span
                      className="flex min-h-9 w-28 shrink-0 items-center justify-end px-2 text-right text-sm tabular-nums text-ink"
                      style={{ color: tone }}
                    >
                      {value || "—"}
                    </span>
                  )}
                </div>
                {low ? (
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
                {low && !longEnough(notes[field.key]) ? (
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
        disabled={sending || !ready}
        onClick={() => {
          if (sending || !ready) return;
          setSending(true);
          const report = {
            shopId,
            date,
            values: shown,
            notes,
            answers,
            submitted: true,
          };
          upsertDayReport(report);
          void mailDayReport({
            data: {
              shopId,
              shopName: shop?.name ?? shopId,
              date,
              values: shown,
              notes,
              answers,
            },
          });
          if (window.history.length > 1) window.history.back();
          else if (managerId) navigate({ to: "/t/$techId", params: { techId: managerId } });
          else navigate({ to: "/" });
        }}
      >
        Submit
      </Button>
      <p className="mt-3 text-sm text-muted">
        {ready ? "Submit when the day is filled in." : "Each note needs at least 13 characters."}
      </p>
    </div>
  );
}
