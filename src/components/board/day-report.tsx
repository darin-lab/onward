import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { DAY_FIELDS, type DayFieldKey } from "@/lib/board/model";
import { mailDayReport } from "@/lib/board/mail-report.functions";
import { useBoard } from "@/lib/board/store";
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
    label: "October 2025",
    values: {
      productivity: "73.9%",
      efficiency: "105.4%",
      proficiency: "81.0%",
      elr: "$226.31",
      spbh: "$434.17",
      hpro: "3.2",
      hoursPerDay: "17.8",
      billedHours: "284.0",
      workHours: "259.0",
      serviceHours: "269.5",
      availableHours: "350.7",
      laborSales: "$64,273.77",
      totalSales: "$123,309.89",
      carCount: "89",
    },
  },
  campbell: {
    label: "April 2026",
    values: {
      productivity: "80.1%",
      efficiency: "86.7%",
      proficiency: "69.5%",
      elr: "$251.41",
      spbh: "$441.08",
      hpro: "3.0",
      hoursPerDay: "13.5",
      billedHours: "216.4",
      workHours: "249.5",
      serviceHours: "249.6",
      availableHours: "311.6",
      laborSales: "$54,404.62",
      totalSales: "$95,450.11",
      carCount: "71",
    },
  },
  "san-ramon": {
    label: "June 2025",
    values: {
      productivity: "84.2%",
      efficiency: "115.1%",
      proficiency: "97.4%",
      elr: "$198.92",
      spbh: "$320.24",
      hpro: "2.9",
      hoursPerDay: "21.1",
      billedHours: "338.3",
      workHours: "292.1",
      serviceHours: "294.0",
      availableHours: "347.1",
      laborSales: "$67,288.47",
      totalSales: "$108,327.54",
      carCount: "117",
    },
  },
  "san-jose": {
    label: "May 2026",
    values: {
      productivity: "72.1%",
      efficiency: "73.7%",
      proficiency: "68.7%",
      elr: "$216.35",
      spbh: "$425.77",
      hpro: "3.4",
      hoursPerDay: "12.7",
      billedHours: "203.8",
      workHours: "213.7",
      serviceHours: "276.4",
      availableHours: "296.5",
      laborSales: "$44,092.00",
      totalSales: "$86,771.97",
      carCount: "60",
    },
  },
  "castro-valley": {
    label: "July 2026",
    values: {
      productivity: "85.6%",
      efficiency: "85.2%",
      proficiency: "79.6%",
      elr: "$214.51",
      spbh: "$360.13",
      hpro: "3.0",
      hoursPerDay: "10.5",
      billedHours: "168.35",
      workHours: "180.90",
      serviceHours: "197.51",
      availableHours: "211.38",
      laborSales: "$36,112.79",
      totalSales: "$60,627.52",
      carCount: "56",
    },
  },
};

const GOALS: Partial<Record<DayFieldKey, { label: string; low: number }>> = {
  productivity: { label: "85% – 90%", low: 85 },
  efficiency: { label: "100% – 150%", low: 100 },
  proficiency: { label: "100%", low: 100 },
  elr: { label: "$250.00", low: 250 },
  spbh: { label: "$400.00", low: 400 },
  hpro: { label: "3.00", low: 3 },
  hoursPerDay: { label: "20.00", low: 20 },
};

function readNumber(raw: string | undefined) {
  if (!raw?.trim()) return null;
  const value = Number(raw.replace(/[$,%\s,]/g, ""));
  return Number.isFinite(value) ? value : null;
}

function belowGoal(key: DayFieldKey, raw: string | undefined) {
  const goal = GOALS[key];
  const value = readNumber(raw);
  if (!goal || value == null) return false;
  return value < goal.low;
}

export function DayReportForm({ shopId }: { shopId: string }) {
  const shop = useBoard((state) => state.shops.find((item) => item.id === shopId));
  const reports = useBoard((state) => state.dayReports);
  const upsertDayReport = useBoard((state) => state.upsertDayReport);
  const [date, setDate] = useState(todayISO);
  const saved = reports.find((report) => report.shopId === shopId && report.date === date);
  const [draft, setDraft] = useState<Partial<Record<DayFieldKey, string>>>(saved?.values ?? {});
  const [notes, setNotes] = useState<Partial<Record<DayFieldKey, string>>>(saved?.notes ?? {});
  const [draftDate, setDraftDate] = useState(date);

  if (draftDate !== date) {
    setDraftDate(date);
    setDraft(saved?.values ?? {});
    setNotes(saved?.notes ?? {});
  }

  const submitted = Boolean(saved?.submitted);
  const [mailNote, setMailNote] = useState("");
  const best = BEST_MONTH[shopId];

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
              <span className="w-36 text-right text-xs whitespace-nowrap text-muted">
                {best ? `Best · ${best.label}` : ""}
              </span>
              <span className="w-28" />
            </li>
          {DAY_FIELDS.map((field) => {
            const low = belowGoal(field.key, draft[field.key]);
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
                  <input
                    id={field.key}
                    inputMode="decimal"
                    value={draft[field.key] ?? ""}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, [field.key]: event.target.value }))
                    }
                    className={cn(fieldClass, "min-h-9 w-28 shrink-0 px-2 text-right tabular-nums")}
                  />
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
              </li>
            );
          })}
        </ul>
      </Card>

      <Button
        className="mt-6 w-full text-base"
        onClick={() => {
          const report = {
            shopId,
            date,
            values: draft,
            notes,
            submitted: true,
          };
          upsertDayReport(report);
          setMailNote("Sending the copy…");
          void mailDayReport({
            data: { shopId, shopName: shop?.name ?? shopId, date, values: draft, notes },
          })
            .then((result) => {
              setMailNote(
                result.ok
                  ? "A copy was emailed to you, Arun, and the shop manager."
                  : "The report is saved. Email is not set up on the server yet.",
              );
            })
            .catch(() => {
              setMailNote("The report is saved. The email could not be sent.");
            });
        }}
      >
        Submit
      </Button>
      <p className="mt-3 text-sm text-muted">
        {mailNote || (submitted ? "This report is submitted." : "Submit when the day is filled in.")}
      </p>
    </div>
  );
}
