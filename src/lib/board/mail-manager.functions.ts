import { createServerFn } from "@tanstack/react-start";
import { owners } from "@/lib/board/owners";

type ReviewMail = {
  managerName: string;
  managerEmail: string;
  shopName: string;
  weekLabel: string;
  rows: { label: string; value: string }[];
  notes: { label: string; value: string }[];
  habits: { name: string; word: string }[];
};

const SHOP_EMAILS: Record<string, string> = {
  "san-ramon": "sanramon@drivenautocare.com",
  "castro-valley": "castrovalley@drivenautocare.com",
  fremont: "fremont@drivenautocare.com",
  campbell: "campbell@drivenautocare.com",
  "san-jose": "sanjose@drivenautocare.com",
};

export const mailManagerReview = createServerFn({ method: "POST" })
  .validator((input: unknown): ReviewMail & { shopId: string } => {
    const data = input as Partial<ReviewMail & { shopId: string }>;
    if (!data || typeof data.managerName !== "string" || typeof data.shopId !== "string") {
      throw new Error("Invalid review");
    }
    return {
      shopId: data.shopId,
      managerName: data.managerName,
      managerEmail: typeof data.managerEmail === "string" ? data.managerEmail : "",
      shopName: typeof data.shopName === "string" ? data.shopName : data.shopId,
      weekLabel: typeof data.weekLabel === "string" ? data.weekLabel : "",
      rows: Array.isArray(data.rows) ? data.rows : [],
      notes: Array.isArray(data.notes) ? data.notes : [],
      habits: Array.isArray(data.habits) ? data.habits : [],
    };
  })
  .handler(async ({ data }) => {
    const user = process.env.GMAIL_USER?.trim();
    const pass = process.env.GMAIL_APP_PASSWORD?.trim();
    const manager = data.managerEmail || SHOP_EMAILS[data.shopId] || "";
    const to = [...new Set([manager, ...owners.map((owner) => owner.email)].filter(Boolean))];
    if (!user || !pass) return { ok: false as const, reason: "not-configured" as const };
    const nodemailer = await import("nodemailer");
    const transport = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user, pass },
    });
    const text = [
      "Manager review",
      data.shopName,
      data.managerName,
      data.weekLabel,
      "",
      ...data.rows.flatMap((row) => [`${row.label}: ${row.value}`, ""]),
      ...data.notes.flatMap((note) => [note.label, note.value || "—", ""]),
      ...data.habits.flatMap((habit) => [`${habit.name}: ${habit.word}`]),
    ].join("\n");
    await transport.sendMail({
      from: user,
      to: to.join(", "),
      subject: `Manager Review — ${data.managerName} — ${data.weekLabel}`,
      text,
      html: reviewHtml(data),
    });
    return { ok: true as const };
  });

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "\u0026amp;")
    .replace(/</g, "\u0026lt;")
    .replace(/>/g, "\u0026gt;")
    .replace(/"/g, "\u0026quot;");
}

function reviewHtml(data: ReviewMail) {
  const rows = data.rows
    .map(
      (row) => `<tr>
        <td style="padding:10px 0;border-bottom:1px solid #e6e0d6;">
          <p style="margin:0;font-size:13px;color:#5c564e;">${escapeHtml(row.label)}</p>
          <p style="margin:2px 0 0;font-size:18px;font-weight:700;">${escapeHtml(row.value)}</p>
        </td>
      </tr>`,
    )
    .join("");
  const notes = data.notes
    .map(
      (note) => `<h2 style="margin:22px 0 6px;font-size:15px;">${escapeHtml(note.label)}</h2>
        <p style="margin:0;font-size:15px;line-height:1.5;white-space:pre-wrap;">${escapeHtml(note.value || "—")}</p>`,
    )
    .join("");
  const habits = data.habits
    .map(
      (habit) => `<p style="margin:0 0 8px;font-size:15px;"><strong>${escapeHtml(habit.name)}</strong> — ${escapeHtml(habit.word)}</p>`,
    )
    .join("");
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f6f1e8;font-family:Georgia, 'Times New Roman', serif;color:#1e1a16;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f1e8;padding:24px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fffdf8;border:1px solid #e6e0d6;border-radius:12px;">
          <tr><td style="background:#c42230;height:8px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td style="padding:22px;">
            <p style="margin:0;font-family:Arial, Helvetica, sans-serif;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#c42230;">Manager review</p>
            <h1 style="margin:6px 0 0;font-size:28px;line-height:1.1;">${escapeHtml(data.shopName)}</h1>
            <p style="margin:6px 0 0;font-size:16px;">${escapeHtml(data.managerName)}</p>
            <p style="margin:4px 0 16px;font-size:14px;color:#5c564e;">${escapeHtml(data.weekLabel)}</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
            ${notes}
            <h2 style="margin:22px 0 8px;font-size:15px;">Habits</h2>
            ${habits}
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}
