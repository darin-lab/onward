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
      return note ? `${field.label}: ${value}\nHow will you grow that number tomorrow? ${note}` : `${field.label}: ${value}`;
    });
    lines.push("", `What went well: ${data.wentWell?.trim() || "—"}`, `What did not go so well? ${data.didNotGoWell?.trim() || "—"}`);
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
      text: [`End of Day Report`, data.shopName, data.date, "", ...lines].join("\n"),
    });
    return { ok: true as const };
  });
