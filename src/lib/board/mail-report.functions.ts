import { DAY_FIELDS, DAY_PROMPTS, type DayFieldKey, type DayPromptKey } from "@/lib/board/model";
import { owners } from "@/lib/board/owners";
import { goalFor, goalTone } from "@/lib/board/day-goals";

const managers: Record<string, string> = {
  "san-ramon": "sanramon@drivenautocare.com",
  "castro-valley": "castrovalley@drivenautocare.com",
  fremont: "fremont@drivenautocare.com",
  campbell: "campbell@drivenautocare.com",
  "san-jose": "sanjose@drivenautocare.com",
};

type MailInput = {
  shopId: string;
  shopName: string;
  date: string;
  values: Partial<Record<DayFieldKey, string>>;
  notes?: Partial<Record<DayFieldKey, string>>;
  answers?: Partial<Record<DayPromptKey, string>>;
  /** New shop records, one line each, shown at the top. */
  records?: string[];
};

export type DayReportMail = MailInput;

/**
 * Server-only. Emails an End of Day report to every manager, Darin and Arun.
 * Called from submitDayReport once the report is stored.
 */
export async function sendDayReportMail(data: DayReportMail) {
  const user = process.env.GMAIL_USER?.trim();
  const pass = process.env.GMAIL_APP_PASSWORD?.trim();
  const to = [
    ...new Set([...owners.map((owner) => owner.email), ...Object.values(managers)]),
  ];
  if (!user || !pass) {
    return { ok: false as const, reason: "not-configured" as const };
  }
  const lines = DAY_FIELDS.map((field) => {
    const value = data.values[field.key]?.trim() || "—";
    const note = data.notes?.[field.key]?.trim();
    const block = [`${field.label}`, value];
    const weekSoFar = (data.values as Record<string, string | undefined>)[`${field.key}Wtd`]?.trim();
    if (weekSoFar) block.push(`Week to date: ${weekSoFar}`);
    if (note) block.push("", "How will you grow that number tomorrow?", note);
    return block.join("\n");
  });
  const prompts = DAY_PROMPTS.map((prompt) => ({
    label: prompt.label,
    value: data.answers?.[prompt.key]?.trim() || "—",
  }));
  const when = readableDate(data.date);
  const text = [
    "End of Day Report",
    data.shopName,
    when,
    "",
    ...(data.records?.length ? ["SHOP RECORD", ...data.records, ""] : []),
    ...lines.flatMap((block) => [block, ""]),
    ...prompts.flatMap((prompt) => [prompt.label, prompt.value, ""]),
  ].join("\n");
  const nodemailer = await import("nodemailer");
  const transport = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
  });
  await transport.sendMail({
    from: user,
    to: to.join(", "),
    subject: `End of Day Report — ${data.shopName} — ${data.date}`,
    text,
    html: reportHtml({
      shopName: data.shopName,
      when,
      records: data.records ?? [],
      rows: DAY_FIELDS.map((field) => {
        const today = data.values[field.key]?.trim() || "";
        const wtd = (data.values as Record<string, string | undefined>)[`${field.key}Wtd`]?.trim() || "";
        return {
          label: field.label,
          goal: goalFor(field.key, data.shopId)?.label ?? "",
          value: today || "—",
          tone: goalTone(field.key, today, data.shopId),
          wtd,
          wtdTone: goalTone(field.key, wtd, data.shopId),
          note: data.notes?.[field.key]?.trim() || "",
        };
      }),
      prompts,
    }),
  });
  return { ok: true as const };
}

function readableDate(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

type Tone = "above" | "below" | null;

/** Green at or above goal, red below, like the End of Day page. Darker shades so they read on the light email. */
function toneColor(tone: Tone) {
  return tone === "above" ? "#1a7f37" : tone === "below" ? "#c42230" : "#1e1a16";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "\u0026amp;")
    .replace(/</g, "\u0026lt;")
    .replace(/>/g, "\u0026gt;")
    .replace(/"/g, "\u0026quot;");
}

function reportHtml({
  shopName,
  when,
  records,
  rows,
  prompts,
}: {
  shopName: string;
  when: string;
  records: string[];
  rows: {
    label: string;
    goal: string;
    value: string;
    tone: Tone;
    wtd: string;
    wtdTone: Tone;
    note: string;
  }[];
  prompts: { label: string; value: string }[];
}) {
  const body = rows
    .map((row) => {
      const note = row.note
        ? `<p style="margin:8px 0 0;font-size:13px;line-height:1.45;color:#5c564e;">How will you grow that number tomorrow?<br>${escapeHtml(row.note)}</p>`
        : "";
      const goal = row.goal ? ` <span style="color:#5c564e;">· Goal ${escapeHtml(row.goal)}</span>` : "";
      const wtd = row.wtd
        ? ` <span style="font-size:14px;font-weight:400;color:#5c564e;">· Week to date</span> <span style="font-size:14px;font-weight:700;color:${toneColor(row.wtdTone)};">${escapeHtml(row.wtd)}</span>`
        : "";
      return `<tr>
        <td style="padding:12px 0;border-bottom:1px solid #e6e0d6;vertical-align:top;">
          <p style="margin:0;font-size:13px;color:#5c564e;">${escapeHtml(row.label)}${goal}</p>
          <p style="margin:2px 0 0;font-size:18px;font-weight:700;color:${toneColor(row.tone)};">${escapeHtml(row.value)}${wtd}</p>
          ${note}
        </td>
      </tr>`;
    })
    .join("");
  const noteBlock = (title: string, copy: string) => `<h2 style="margin:22px 0 6px;font-size:15px;color:#1e1a16;">${escapeHtml(title)}</h2>
    <p style="margin:0;font-size:15px;line-height:1.5;color:#1e1a16;white-space:pre-wrap;">${escapeHtml(copy)}</p>`;
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f6f1e8;font-family:Georgia, 'Times New Roman', serif;color:#1e1a16;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f1e8;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fffdf8;border:1px solid #e6e0d6;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="background:#c42230;height:8px;font-size:0;line-height:0;">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:22px 22px 8px;">
                <p style="margin:0;font-family:Arial, Helvetica, sans-serif;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#c42230;">End of Day Report</p>
                <h1 style="margin:6px 0 0;font-size:28px;line-height:1.1;">${escapeHtml(shopName)}</h1>
                <p style="margin:6px 0 0;font-size:14px;color:#5c564e;">${escapeHtml(when)}</p>
                ${records
                  .map(
                    (line) =>
                      `<p style="margin:14px 0 0;padding:12px 14px;border-radius:8px;background:#fff4d6;border:1px solid #e2b33c;font-family:Arial, Helvetica, sans-serif;font-size:15px;line-height:1.45;color:#1e1a16;"><strong style="color:#8a6212;">Shop record.</strong> ${escapeHtml(line)}</p>`,
                  )
                  .join("")}
              </td>
            </tr>
            <tr>
              <td style="padding:8px 22px 22px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${body}</table>
                ${prompts.map((prompt) => noteBlock(prompt.label, prompt.value)).join("")}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
