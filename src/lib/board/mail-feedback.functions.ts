import { owners } from "@/lib/board/owners";

export type FeedbackMail = {
  aboutName: string;
  authorName: string;
  authorRole: string;
  shopName: string;
  helped: string;
  better: string;
  need: string;
  aboutFirst: string;
};

/** Server-only. Sends one person's feedback to both Darin and Arun. */
export async function sendFeedbackMail(data: FeedbackMail) {
  const user = process.env.GMAIL_USER?.trim();
  const pass = process.env.GMAIL_APP_PASSWORD?.trim();
  if (!user || !pass) return { ok: false as const, reason: "not-configured" as const };
  const nodemailer = await import("nodemailer");
  const transport = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
  });
  const questions = [
    [`What did ${data.aboutFirst} do this week that helped you?`, data.helped],
    [`What could ${data.aboutFirst} do better?`, data.better],
    [`What do you need from ${data.aboutFirst} right now?`, data.need],
  ] as const;
  await transport.sendMail({
    from: user,
    to: owners.map((owner) => owner.email).join(", "),
    subject: `Feedback for ${data.aboutFirst} — ${data.authorName} — ${data.shopName}`,
    text: [
      `Feedback for ${data.aboutName}`,
      `From ${data.authorName} (${data.authorRole}, ${data.shopName})`,
      "",
      ...questions.flatMap(([question, answer]) => [question, answer, ""]),
    ].join("\n"),
    html: `<div style="font-family:Arial,sans-serif;max-width:560px">
      <h2 style="margin:0 0 4px">Feedback for ${escapeHtml(data.aboutName)}</h2>
      <p style="margin:0 0 18px;color:#555">From ${escapeHtml(data.authorName)} · ${escapeHtml(data.authorRole)} · ${escapeHtml(data.shopName)}</p>
      ${questions
        .map(
          ([question, answer]) =>
            `<p style="margin:14px 0 4px;color:#c4161c;font-weight:bold">${escapeHtml(question)}</p><p style="margin:0;white-space:pre-wrap">${escapeHtml(answer)}</p>`,
        )
        .join("")}
    </div>`,
  });
  return { ok: true as const };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
