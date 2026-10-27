import { createServerFn } from "@tanstack/react-start";

const ACCOUNTING = "accounting@drivenautocare.com";
const MAX_IMAGE = 2_500_000;

export type ReceiptRow = {
  id: string;
  total: number;
  note: string;
  image_data: string | null;
  image_type: string | null;
  image_name: string | null;
  submitter_id: string;
  submitter_email: string;
  submitter_name: string;
  day: string;
  created_at: string;
  mailed_at: string | null;
};

function pacificDay(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function money(amount: number) {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function readableDay(iso: string) {
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

export const addReceipt = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const data = input as { total?: unknown; note?: unknown; image?: unknown; imageType?: unknown; imageName?: unknown };
    const total = typeof data.total === "number" ? data.total : Number(data.total);
    const note = typeof data.note === "string" ? data.note.trim() : "";
    const image = typeof data.image === "string" ? data.image : "";
    const imageType = typeof data.imageType === "string" ? data.imageType : "";
    const imageName = typeof data.imageName === "string" ? data.imageName.slice(0, 120) : "receipt";
    if (!Number.isFinite(total) || total <= 0) throw new Error("Enter the total");
    if (!note) throw new Error("Say what it was for");
    if (!image || image.length > MAX_IMAGE) throw new Error("Add the receipt");
    if (!imageType.startsWith("image/") && imageType !== "application/pdf") throw new Error("Use a photo or a PDF");
    return { total: Math.round(total * 100) / 100, note, image, imageType, imageName };
  })
  .handler(async ({ data }) => {
    const { requireDarin } = await import("@/lib/board/darin.server");
    const session = await requireDarin();
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const id = crypto.randomUUID();
    const day = pacificDay();
    await sql.query(
      `insert into receipts
        (id, total, note, image_data, image_type, image_name, submitter_id, submitter_email, submitter_name, day)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        id,
        data.total,
        data.note,
        data.image,
        data.imageType,
        data.imageName,
        session.personId,
        "darin@drivenautocare.com",
        session.name,
        day,
      ],
    );
    return { ok: true as const, id, day };
  });

export const listReceipts = createServerFn({ method: "GET" }).handler(async () => {
  const { requireDarin } = await import("@/lib/board/darin.server");
  await requireDarin();
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const rows = await sql.query<{ id: string; total: string | number; note: string; day: string; image_name: string | null }>(
    `select id, total, note, day, image_name
     from receipts
     where mailed_at is null
     order by created_at desc`,
  );
  return rows.map((row) => ({
    id: row.id,
    total: Number(row.total),
    note: row.note,
    day: row.day,
    imageName: row.image_name,
  }));
});

function pacificClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    day: `${value("year")}-${value("month")}-${value("day")}`,
    hour: Number(value("hour")),
    minute: Number(value("minute")),
  };
}

function pacificWallTime(day: string, hour: number, minute: number) {
  const [year, month, date] = day.split("-").map(Number);
  const wall = new Date(Date.UTC(year, month - 1, date, hour, minute, 0));
  const offset = (instant: Date) => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(instant);
    const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
    const asUtc = Date.UTC(value("year"), value("month") - 1, value("day"), value("hour"), value("minute"), value("second"));
    return instant.getTime() - asUtc;
  };
  const first = new Date(wall.getTime() + offset(wall));
  return new Date(wall.getTime() + offset(first));
}

export async function sendDueReceipts(now = new Date()) {
  const clock = pacificClock(now);
  if (clock.hour !== 19 || clock.minute < 6 || clock.minute > 15) {
    return { ok: true as const, sent: 0 };
  }
  const cutoff = pacificWallTime(clock.day, 19, 6);
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const rows = await sql.query<ReceiptRow>(
    `select id, total, note, image_data, image_type, image_name, submitter_id, submitter_email, submitter_name, day, created_at, mailed_at
     from receipts
     where mailed_at is null and created_at < $1
     order by created_at`,
    [cutoff.toISOString()],
  );
  if (rows.length === 0) return { ok: true as const, sent: 0 };
  const user = process.env.GMAIL_USER?.trim();
  const pass = process.env.GMAIL_APP_PASSWORD?.trim();
  if (!user || !pass) return { ok: false as const, sent: 0, reason: "not-configured" as const };
  const people = [...new Set(rows.map((item) => item.submitter_email))];
  const to = [...new Set([ACCOUNTING, ...people])];
  const total = rows.reduce((sum, item) => sum + Number(item.total), 0);
  const when = readableDay(clock.day);
  const attachments = rows
    .filter((item) => item.image_data)
    .map((item, index) => ({
      filename: item.image_name || `receipt-${index + 1}`,
      content: Buffer.from(item.image_data ?? "", "base64"),
      contentType: item.image_type || "application/octet-stream",
      cid: `receipt-${index}`,
    }));
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
    subject: `Receipts — ${clock.day}`,
    text: receiptText(when, rows, total),
    html: receiptHtml(when, rows, total),
    attachments,
  });
  for (const row of rows) {
    await sql.query(`update receipts set mailed_at = now() where id = $1`, [row.id]);
  }
  return { ok: true as const, sent: 1 };
}

function receiptText(when: string, items: ReceiptRow[], total: number) {
  const lines = items.map((item, index) => `${index + 1}. ${money(Number(item.total))}\n${item.note}\n${item.submitter_name}`);
  return ["Receipts", when, "", ...lines.flatMap((line) => [line, ""]), `Total ${money(total)}`].join("\n");
}

function receiptHtml(when: string, items: ReceiptRow[], total: number) {
  const rows = items
    .map((item, index) => {
      const image =
        item.image_type?.startsWith("image/")
          ? `<img src="cid:receipt-${index}" alt="" style="display:block;max-width:100%;margin-top:10px;border-radius:8px;" />`
          : item.image_name
            ? `<p style="margin:8px 0 0;font-size:13px;color:#5c564e;">Attached: ${escapeHtml(item.image_name)}</p>`
            : "";
      return `<tr>
        <td style="padding:14px 0;border-bottom:1px solid #e6e0d6;">
          <p style="margin:0;font-size:18px;font-weight:700;color:#1e1a16;">${escapeHtml(money(Number(item.total)))}</p>
          <p style="margin:6px 0 0;font-size:15px;line-height:1.45;color:#1e1a16;white-space:pre-wrap;">${escapeHtml(item.note)}</p>
          <p style="margin:6px 0 0;font-size:13px;color:#5c564e;">${escapeHtml(item.submitter_name)}</p>
          ${image}
        </td>
      </tr>`;
    })
    .join("");
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f6f1e8;font-family:Georgia, 'Times New Roman', serif;color:#1e1a16;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f1e8;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fffdf8;border:1px solid #e6e0d6;border-radius:12px;overflow:hidden;">
            <tr><td style="background:#c42230;height:8px;font-size:0;line-height:0;">&nbsp;</td></tr>
            <tr>
              <td style="padding:22px 22px 8px;">
                <p style="margin:0;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#5c564e;">Driven Onward</p>
                <h1 style="margin:6px 0 0;font-size:28px;font-weight:600;">Receipts</h1>
                <p style="margin:6px 0 0;font-size:15px;color:#5c564e;">${escapeHtml(when)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 22px 18px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
                <p style="margin:16px 0 0;font-size:18px;font-weight:700;">Total ${escapeHtml(money(total))}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
