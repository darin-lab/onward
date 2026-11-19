/**
 * Hall of Fame: each shop's best week (and best day) on the dashboard numbers.
 * Shared by the server and the pages. Values are kept in dashboard units:
 * proficiency and sell-through as fractions (0.884 = 88.4%), money in dollars.
 */

export type RecordMetric =
  | "sales"
  | "cars"
  | "billed"
  | "hpd"
  | "proficiency"
  | "elr"
  | "spbh"
  | "aro"
  | "hpro"
  | "recPerCar"
  | "sellthrough"
  | "day";

export type ShopRecord = {
  shopId: string;
  metric: RecordMetric;
  value: number;
  /** Monday of the record week, or the date for the best day. */
  start: string;
  prevValue: number | null;
  prevStart: string | null;
  setAt: string;
  /** Set after launch by beating a real earlier record (never one from the setup). */
  announced?: boolean;
};

type MetricInfo = {
  key: RecordMetric;
  label: string;
  /** How the Hall of Fame names the record. */
  title: string;
  /** total: adds up over the week, so a new high counts the moment it happens.
   *  rate: a ratio, so it only counts once the week is over. day: one day. */
  kind: "total" | "rate" | "day";
  format: (value: number) => string;
};

const money0 = (value: number) =>
  value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const pct = (value: number) => `${Math.round(value * 1000) / 10}%`;
const num = (places: number) => (value: number) =>
  value.toLocaleString("en-US", { maximumFractionDigits: places, minimumFractionDigits: 0 });

export const RECORD_METRICS: MetricInfo[] = [
  { key: "sales", label: "Sales", title: "Best sales week", kind: "total", format: money0 },
  { key: "day", label: "Sales in one day", title: "Best sales day", kind: "day", format: money0 },
  { key: "cars", label: "Car count", title: "Most cars in a week", kind: "total", format: num(0) },
  { key: "billed", label: "Billed hours", title: "Most billed hours in a week", kind: "total", format: num(1) },
  { key: "hpd", label: "Hours per day", title: "Best hours per day", kind: "rate", format: num(1) },
  { key: "proficiency", label: "Proficiency", title: "Best proficiency", kind: "rate", format: pct },
  { key: "elr", label: "ELR", title: "Best ELR", kind: "rate", format: money0 },
  { key: "spbh", label: "SPBH", title: "Best SPBH", kind: "rate", format: money0 },
  { key: "aro", label: "Average repair order", title: "Best average repair order", kind: "rate", format: money0 },
  { key: "hpro", label: "Hours per repair order", title: "Best hours per repair order", kind: "rate", format: num(1) },
  { key: "recPerCar", label: "Recommendations per car", title: "Best recommendations per car", kind: "rate", format: money0 },
  { key: "sellthrough", label: "Sell-through", title: "Best sell-through", kind: "rate", format: pct },
];

export function metricInfo(key: RecordMetric) {
  return RECORD_METRICS.find((metric) => metric.key === key)!;
}

/** "Week of Oct 12, 2026" or "Thu, Jun 11, 2026". */
export function recordWhen(record: Pick<ShopRecord, "metric" | "start">) {
  const [year, month, day] = record.start.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 2026, (month ?? 1) - 1, day ?? 1));
  if (record.metric === "day") {
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  }
  return `Week of ${date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}`;
}

/** A moment worth celebrating on End of Day. */
export type RecordMoment = {
  metric: RecordMetric;
  /** new: the record is broken. pace: a weekly rate is ahead of the record, counts when the week ends. */
  kind: "new" | "pace";
  value: number;
  oldValue: number | null;
  oldStart: string | null;
};

export function momentLine(shopName: string, moment: RecordMoment) {
  const info = metricInfo(moment.metric);
  const old =
    moment.oldValue != null && moment.oldStart
      ? ` The old record was ${info.format(moment.oldValue)} (${recordWhen({ metric: moment.metric, start: moment.oldStart }).replace(/^Week of/, "week of")}).`
      : "";
  if (moment.kind === "pace") {
    return `On pace for a ${shopName} record: ${info.label} this week is ${info.format(moment.value)}.${old} It counts if it holds through the end of the week.`;
  }
  const what = moment.metric === "day" ? "best sales day ever" : `${info.title.toLowerCase().replace(/^best /, "best ").replace(/^most /, "most ")} ever`;
  return `New ${shopName} record: ${what}, ${info.format(moment.value)}.${old}`;
}
