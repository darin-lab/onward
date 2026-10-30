import { useEffect, useState, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { numberStory, shortWeekLabel, levelWord, type WeekLog } from "@/lib/board/model";

function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

type Point = {
  weekStart: string;
  label: string;
  value: number;
};

function ChartFrame({
  children,
  className,
}: {
  children: ReactNode;
  className: string;
}) {
  const mounted = useMounted();
  if (!mounted) return <div className={className} />;
  return <div className={className}>{children}</div>;
}

function Tip({
  active,
  label,
  value,
  suffix,
}: {
  active?: boolean;
  label?: string;
  value?: unknown;
  suffix: string;
}) {
  if (!active || !label) return null;
  const display =
    suffix === "text"
      ? String(value ?? "")
      : suffix === " h"
        ? `${typeof value === "number" ? value : Number(value)} h`
        : levelWord(typeof value === "number" ? value : Number(value));
  if (!display || display === "NaN") return null;
  return (
    <div className="rounded-xl bg-raised px-3 py-2 text-sm text-ink shadow-border">
      <p className="text-muted">{label}</p>
      <p className="font-medium tabular-nums">{display}</p>
    </div>
  );
}

function wholeAxis(value: number, format: (value: number) => string) {
  const rounded = Math.round(value);
  const sample = format(1000.5);
  if (sample.includes("$")) {
    return rounded.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    });
  }
  if (sample.includes("%")) return `${rounded}%`;
  return String(rounded);
}

function readTip(payload: unknown): { label?: string; value?: unknown } {
  if (!Array.isArray(payload) || payload.length === 0) return {};
  const row = payload[0] as { payload?: { label?: string }; value?: unknown } | undefined;
  return { label: row?.payload?.label, value: row?.value };
}

function Mark({
  cx,
  cy,
  weekStart,
  selected,
}: {
  cx?: number;
  cy?: number;
  weekStart?: string;
  selected: string;
}) {
  if (cx == null || cy == null || !Number.isFinite(cx) || !Number.isFinite(cy)) return null;
  const on = weekStart === selected;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={on ? 5 : 3}
      fill={on ? "var(--color-honey)" : "var(--color-canvas)"}
      stroke="var(--color-honey)"
      strokeWidth={2}
    />
  );
}

export function HoursChart({
  weeks,
  selected,
  metric = "billedHours",
  format = (value) => String(value),
  label = "This number",
  tall = false,
}: {
  weeks: WeekLog[];
  selected: string;
  metric?:
    | "hours"
    | "billedHours"
    | "cars"
    | "recsPerVehicle"
    | "totalSales"
    | "sellThrough"
    | "averageRepairOrder"
    | "hoursPerRepairOrder"
    | "salesPerBilledHour"
    | "grossProfit";
  format?: (value: number) => string;
  label?: string;
  tall?: boolean;
}) {
  const data: Point[] = weeks.flatMap((week) => {
    const value = week[metric];
    if (typeof value !== "number" || !Number.isFinite(value)) return [];
    return [{ weekStart: week.weekStart, label: shortWeekLabel(week.weekStart), value }];
  });
  if (data.length === 0) {
    return (
      <p className="mt-3 text-sm text-muted">
        Not on the chart yet. Each week you enter lengthens the line.
      </p>
    );
  }
  const story = numberStory(
    data.map((point) => point.value),
    label,
  );
  const maxHours = data.reduce((max, point) => Math.max(max, point.value), 0);
  const minHours = data.reduce((min, point) => Math.min(min, point.value), maxHours);
  const span = Math.max(maxHours * 0.2, maxHours - minHours, 1);
  const pad = Math.max(span * 0.35, 0.5);
  const yMin = Math.max(0, minHours - pad);
  const yMax = maxHours + pad;
  const axisLabels = [yMin, yMax, maxHours].map((value) => wholeAxis(value, format));
  const axisWidth = Math.max(36, ...axisLabels.map((text) => text.length * 9));
  const fillId = `arc-${metric}`;

  return (
    <div className="mt-3">
      <ChartFrame className={tall ? "h-52" : "h-36"}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
            <defs>
              <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-honey)" stopOpacity={0.32} />
                <stop offset="100%" stopColor="var(--color-honey)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="label"
              tick={{ fill: "var(--color-muted)", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              minTickGap={16}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={[yMin, yMax]}
              width={axisWidth}
              tick={{ fill: "var(--color-muted)", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(value: number) => wholeAxis(value, format)}
            />
            <Tooltip
              cursor={{ stroke: "var(--color-line)" }}
              content={(props) => {
                const tip = readTip(props.payload);
                const numeric = typeof tip.value === "number" ? tip.value : Number(tip.value);
                return (
                  <Tip
                    active={props.active}
                    label={tip.label}
                    value={Number.isFinite(numeric) ? format(numeric) : undefined}
                    suffix="text"
                  />
                );
              }}
              wrapperStyle={{ outline: "none" }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="var(--color-honey)"
              strokeWidth={2.5}
              fill={`url(#${fillId})`}
              isAnimationActive={false}
              dot={(props: { cx?: number; cy?: number; payload?: Point }) => (
                <Mark
                  key={props.payload?.weekStart}
                  cx={props.cx}
                  cy={props.cy}
                  weekStart={props.payload?.weekStart}
                  selected={selected}
                />
              )}
              activeDot={{ r: 6, fill: "var(--color-ink)", stroke: "var(--color-honey)" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartFrame>
      <p className="mt-2 text-sm text-muted">{story}</p>
    </div>
  );
}

export function HabitChart({
  weeks,
  categoryId,
  selected,
}: {
  weeks: WeekLog[];
  categoryId: string;
  selected: string;
}) {
  const data: Point[] = weeks.flatMap((week) => {
    const value = week.scores[categoryId];
    if (value == null) return [];
    return [{ weekStart: week.weekStart, label: shortWeekLabel(week.weekStart), value }];
  });
  if (data.length === 0) {
    return <p className="mt-4 text-sm text-muted">Not marked across these weeks yet.</p>;
  }
  const story = numberStory(
    data.map((point) => point.value),
    "This habit",
  );

  return (
    <div>
      <ChartFrame className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
            <defs>
              <linearGradient id="habitFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-honey)" stopOpacity={0.28} />
                <stop offset="100%" stopColor="var(--color-honey)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="label"
              tick={{ fill: "var(--color-muted)", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              minTickGap={20}
              interval={1}
            />
            <YAxis
              domain={[1, 5]}
              ticks={[1, 2, 3, 4, 5]}
              width={32}
              tick={{ fill: "var(--color-muted)", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ stroke: "var(--color-line)" }}
              content={(props) => {
                const tip = readTip(props.payload);
                return <Tip active={props.active} label={tip.label} value={tip.value} suffix="" />;
              }}
              wrapperStyle={{ outline: "none" }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="var(--color-honey)"
              strokeWidth={2.5}
              fill="url(#habitFill)"
              isAnimationActive={false}
              dot={(props: { cx?: number; cy?: number; payload?: Point }) => (
                <Mark
                  key={props.payload?.weekStart}
                  cx={props.cx}
                  cy={props.cy}
                  weekStart={props.payload?.weekStart}
                  selected={selected}
                />
              )}
              activeDot={{ r: 6, fill: "var(--color-ink)", stroke: "var(--color-honey)" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartFrame>
      <p className="mt-2 text-sm text-muted">{story}</p>
    </div>
  );
}
