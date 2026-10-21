import { createServerFn } from "@tanstack/react-start";
import { DAY_FIELDS, type DayFieldKey } from "@/lib/board/model";
import { owners } from "@/lib/board/owners";

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
  wentWell?: string;
  didNotGoWell?: string;
};

export const mailDayReport = createServerFn({ method: "POST" })
  .validator((input: unknown): MailInput => {
    const data = input as Partial<MailInput>;
    if (!data || typeof data.shopId !== "string" || typeof data.date !== "string") {
      throw new Error("Invalid report");
    }
    return {
      shopId: data.shopId,
      shopName: typeof data.shopName === "string" ? data.shopName : data.shopId,
      date: data.date,
      values: data.values ?? {},
      notes: data.notes ?? {},
      wentWell: typeof data.wentWell === "string" ? data.wentWell : "",
      didNotGoWell: typeof data.didNotGoWell === "string" ? data.didNotGoWell : "",
    };
  })
  .handler(async ({ data }) => {
    const user = process.env.GMAIL_USER?.trim();
    const pass = process.env.GMAIL_APP_PASSWORD?.trim();
    const manager = managers[data.shopId];
    const to = [...owners.map((owner) => owner.email), manager].filter(
      (email): email is string => Boolean(email),
    );
    if (!user || !pass) {
      return { ok: false as const, reason: "not-configured" as const };
    }
    const lines = DAY_FIELDS.map((field) => {
      const value = data.values[field.key]?.trim() || "—";
      const note = data.notes?.[field.key]?.trim();
      const block = [`${field.label}`, value];
      if (note) block.push("", "How will you grow that number tomorrow?", note);
      return block.join("\n");
    });
    const wentWell = data.wentWell?.trim() || "—";
    const didNot = data.didNotGoWell?.trim() || "—";
    const when = readableDate(data.date);
    const text = [
      "End of Day Report",
      data.shopName,
      when,
      "",
      ...lines.flatMap((block) => [block, ""]),
      "What went well",
      wentWell,
      "",
      "What did not go so well?",
      didNot,
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
        rows: DAY_FIELDS.map((field) => ({
          label: field.label,
          value: data.values[field.key]?.trim() || "—",
          note: data.notes?.[field.key]?.trim() || "",
        })),
        wentWell,
        didNot,
      }),
    });
    return { ok: true as const };
  });

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
  rows,
  wentWell,
  didNot,
}: {
  shopName: string;
  when: string;
  rows: { label: string; value: string; note: string }[];
  wentWell: string;
  didNot: string;
}) {
  const body = rows
    .map((row) => {
      const note = row.note
        ? `<p style="margin:8px 0 0;font-size:13px;line-height:1.45;color:#5c564e;">How will you grow that number tomorrow?<br>${escapeHtml(row.note)}</p>`
        : "";
      return `<tr>
        <td style="padding:12px 0;border-bottom:1px solid #e6e0d6;vertical-align:top;">
          <p style="margin:0;font-size:13px;color:#5c564e;">${escapeHtml(row.label)}</p>
          <p style="margin:2px 0 0;font-size:18px;font-weight:700;color:#1e1a16;">${escapeHtml(row.value)}</p>
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
              </td>
            </tr>
            <tr>
              <td style="padding:8px 22px 22px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${body}</table>
                ${noteBlock("What went well", wentWell)}
                ${noteBlock("What did not go so well?", didNot)}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
