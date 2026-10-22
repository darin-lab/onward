import { createServerFn } from "@tanstack/react-start";
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
  managerName: string;
  question: string;
  answer: string;
  audio?: string;
  audioName?: string;
};

export const mailPhoneReply = createServerFn({ method: "POST" })
  .validator((input: unknown): MailInput => {
    const data = input as Partial<MailInput>;
    if (!data || typeof data.shopId !== "string" || typeof data.question !== "string") {
      throw new Error("Invalid call");
    }
    return {
      shopId: data.shopId,
      shopName: typeof data.shopName === "string" ? data.shopName : data.shopId,
      managerName: typeof data.managerName === "string" ? data.managerName : "Manager",
      question: data.question,
      answer: typeof data.answer === "string" ? data.answer : "",
      audio: typeof data.audio === "string" ? data.audio : "",
      audioName: typeof data.audioName === "string" ? data.audioName : "",
    };
  })
  .handler(async ({ data }) => {
    const user = process.env.GMAIL_USER?.trim();
    const pass = process.env.GMAIL_APP_PASSWORD?.trim();
    const manager = managers[data.shopId];
    const to = [...new Set([...owners.map((owner) => owner.email), ...(manager ? [manager] : [])])];
    if (!user || !pass) return { ok: false as const, reason: "not-configured" as const };
    const nodemailer = await import("nodemailer");
    const transport = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user, pass },
    });
    const attachment = audioFile(data.audio ?? "", data.audioName ?? "");
    await transport.sendMail({
      from: user,
      to: to.join(", "),
      subject: `Call reflection — ${data.managerName} — ${data.shopName}`,
      text: ["Call reflection", data.shopName, data.managerName, "", "What would you like to ask?", data.question, "", "Reply", data.answer].join("\n"),
      html: callHtml(data),
      attachments: attachment ? [attachment] : [],
    });
    return { ok: true as const };
  });

function callHtml(data: MailInput) {
  const row = (label: string, value: string) =>
    `<tr><td style="padding:16px 18px 4px;font:600 12px Arial,sans-serif;letter-spacing:.04em;text-transform:uppercase;color:#8a8178;">${escapeHtml(label)}</td></tr>
     <tr><td style="padding:0 18px 16px;font:16px/1.45 Georgia,serif;color:#1e1a16;">${escapeHtml(value)}</td></tr>`;
  return `<!doctype html><html><body style="margin:0;background:#f6f1e8;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f1e8;padding:24px 12px;">
      <tr><td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fffdf8;border:1px solid #e4dccf;">
          <tr><td style="background:#121110;padding:18px 20px;font:600 20px Georgia,serif;color:#f6f1e8;">Call reflection</td></tr>
          <tr><td style="padding:8px 18px 0;font:14px Arial,sans-serif;color:#5c564f;">${escapeHtml(data.shopName)} · ${escapeHtml(data.managerName)}</td></tr>
          ${row("What would you like to ask?", data.question)}
          ${row("Reply", data.answer)}
        </table>
      </td></tr>
    </table>
  </body></html>`;
}

function audioFile(dataUrl: string, name: string) {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match || match[2].length > 6_000_000) return undefined;
  return {
    filename: name || "call.mp3",
    content: Buffer.from(match[2], "base64"),
    contentType: match[1],
  };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "\u0026amp;")
    .replace(/</g, "\u0026lt;")
    .replace(/>/g, "\u0026gt;")
    .replace(/"/g, "\u0026quot;");
}
