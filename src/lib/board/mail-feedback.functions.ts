import { owners } from "@/lib/board/owners";

type DigestItem = {
  about: "darin" | "arun";
  authorName: string;
  authorRole: string;
  shopName: string;
  at: string;
  helped: string;
  better: string;
  need: string;
};

const FIRST = { darin: "Darin", arun: "Arun" } as const;

/** Server-only. One formatted email with the week's feedback, to Darin and Arun. */
export async function sendFeedbackDigestMail(data: {
  weekStart: string;
  items: DigestItem[];
  missing: { name: string; shopName: string; left: string[] }[];
}) {
  const user = process.env.GMAIL_USER?.trim();
  const pass = process.env.GMAIL_APP_PASSWORD?.trim();
  if (!user || !pass) return { ok: false as const, reason: "not-configured" };
  const nodemailer = await import("nodemailer");
  const transport = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
  });
  const week = new Date(`${data.weekStart}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
  const questions = (first: string) => [
    `What did ${first} do this week that helped you?`,
    `What could ${first} do better?`,
    `What do you need from ${first} right now?`,
  ];
  const section = (about: "darin" | "arun") => {
    const first = FIRST[about];
    const list = data.items.filter((item) => item.about === about);
    const [q1, q2, q3] = questions(first);
    const html = list.length
      ? list
          .map(
            (item) => `<div style="border:1px solid #e5e5e5;border-radius:8px;padding:12px 14px;margin:10px 0">
              <p style="margin:0 0 6px;font-weight:bold">${escapeHtml(item.authorName)} <span style="font-weight:normal;color:#666">· ${escapeHtml(item.authorRole)} · ${escapeHtml(item.shopName)}</span></p>
              <p style="margin:8px 0 2px;color:#c4161c;font-weight:bold">${escapeHtml(q1)}</p><p style="margin:0;white-space:pre-wrap">${escapeHtml(item.helped)}</p>
              <p style="margin:8px 0 2px;color:#c4161c;font-weight:bold">${escapeHtml(q2)}</p><p style="margin:0;white-space:pre-wrap">${escapeHtml(item.better)}</p>
              <p style="margin:8px 0 2px;color:#c4161c;font-weight:bold">${escapeHtml(q3)}</p><p style="margin:0;white-space:pre-wrap">${escapeHtml(item.need)}</p>
            </div>`,
          )
          .join("")
      : `<p style="color:#666">No feedback this time.</p>`;
    const text = list.length
      ? list
          .map((item) =>
            [`${item.authorName} (${item.authorRole}, ${item.shopName})`, q1, item.helped, q2, item.better, q3, item.need, ""].join("\n"),
          )
          .join("\n")
      : "No feedback this time.\n";
    return {
      html: `<h2 style="margin:24px 0 4px;border-bottom:3px solid #c4161c;padding-bottom:4px">Feedback for ${first} (${list.length})</h2>${html}`,
      text: `FEEDBACK FOR ${first.toUpperCase()} (${list.length})\n\n${text}`,
    };
  };
  const darin = section("darin");
  const arun = section("arun");
  const missingHtml = data.missing.length
    ? `<p style="margin:16px 0 0;padding:10px 12px;background:#fff4d6;border-radius:6px">Still missing: ${data.missing
        .map((person) => `${escapeHtml(person.name)} (${escapeHtml(person.shopName)}) owes ${escapeHtml(person.left.join(" and "))}`)
        .join("; ")}</p>`
    : "";
  const missingText = data.missing.length
    ? `Still missing: ${data.missing.map((person) => `${person.name} (${person.shopName}) owes ${person.left.join(" and ")}`).join("; ")}\n\n`
    : "";
  await transport.sendMail({
    from: user,
    to: owners.map((owner) => owner.email).join(", "),
    subject: `Feedback — week of ${week} (${data.items.length})`,
    text: `Feedback — week of ${week}\n\n${missingText}${darin.text}\n${arun.text}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:620px">
      <h1 style="margin:0 0 4px;font-size:22px">Feedback — week of ${escapeHtml(week)}</h1>
      <p style="margin:0;color:#555">${data.items.length} received.</p>
      ${missingHtml}${darin.html}${arun.html}
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
