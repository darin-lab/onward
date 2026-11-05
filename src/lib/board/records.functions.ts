import { createServerFn } from "@tanstack/react-start";
import {
  DAY_PROMPTS,
  type CashTransfer,
  type DayFieldKey,
  type DayPromptKey,
  type DayReport,
  type PhoneAnswer,
  type PhoneCall,
} from "@/lib/board/model";

// Request bodies over ~4.5 MB never reach a Vercel function. A trimmed
// 4-minute clip is about 2.6 MB as base64, so this leaves room.
const MAX_AUDIO_CHARS = 3_600_000;
const MIN_NOTE = 13;

async function viewer() {
  const { requireViewer } = await import("@/lib/board/darin.server");
  return requireViewer();
}

async function sqlForRecords() {
  const { recordsSql } = await import("@/lib/board/records.server");
  return recordsSql();
}

/* ---------------- Call reflection ---------------- */

export type CallListItem = PhoneCall & { hasAudio: boolean };

export const listCalls = createServerFn({ method: "GET" }).handler(async (): Promise<CallListItem[]> => {
  const who = await viewer();
  if (who.role === "technician") return [];
  const sql = await sqlForRecords();
  const { callFromRow } = await import("@/lib/board/records.server");
  await retryCallMail(sql).catch(() => undefined);
  type Row = import("@/lib/board/records.server").CallRow;
  const rows =
    who.role === "owner"
      ? await sql.query<Row>(
          `select id, manager_id, data, audio, answered_at, mailed_at
           from call_reflections order by created_at desc limit 40`,
        )
      : await sql.query<Row>(
          `select id, manager_id, data, audio, answered_at, mailed_at
           from call_reflections where manager_id = $1 and answered_at is null
           order by created_at`,
          [who.personId],
        );
  return rows.map((row) => callFromRow(row));
});

export const getCallAudio = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const id = (input as { id?: unknown })?.id;
    if (typeof id !== "string") throw new Error("Which call?");
    return { id };
  })
  .handler(async ({ data }) => {
    const who = await viewer();
    const sql = await sqlForRecords();
    const rows = await sql.query<{ manager_id: string; audio: string | null }>(
      "select manager_id, audio from call_reflections where id = $1",
      [data.id],
    );
    const row = rows[0];
    if (!row) return { audio: "" };
    if (who.role !== "owner" && who.personId !== row.manager_id) throw new Error("Not allowed");
    return { audio: row.audio ?? "" };
  });

export const createCall = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const data = input as { managerId?: unknown; question?: unknown; audio?: unknown; audioName?: unknown };
    const question = typeof data.question === "string" ? data.question.trim() : "";
    const audio = typeof data.audio === "string" ? data.audio : "";
    if (typeof data.managerId !== "string" || !data.managerId) throw new Error("Pick a manager");
    if (!question) throw new Error("Add a question");
    if (!audio.startsWith("data:audio/")) throw new Error("Attach a clip");
    if (audio.length > MAX_AUDIO_CHARS) throw new Error("That clip is too large");
    return {
      managerId: data.managerId,
      question,
      audio,
      audioName: typeof data.audioName === "string" ? data.audioName.slice(0, 120) : "call",
    };
  })
  .handler(async ({ data }) => {
    const who = await viewer();
    if (who.role !== "owner") throw new Error("Not allowed");
    const sql = await sqlForRecords();
    const { insertCall, boardPeople } = await import("@/lib/board/records.server");
    const people = await boardPeople(sql);
    if (people.person(data.managerId)?.kind !== "manager") throw new Error("Pick a manager");
    const call: PhoneCall = {
      id: `call-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      managerId: data.managerId,
      question: data.question,
      audio: data.audio,
      audioName: data.audioName,
      createdAt: new Date().toISOString(),
      answers: [],
    };
    await insertCall(sql, call);
    return { ok: true as const, id: call.id };
  });

export const answerCall = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const data = input as { id?: unknown; text?: unknown };
    const text = typeof data.text === "string" ? data.text.trim() : "";
    if (typeof data.id !== "string") throw new Error("Which call?");
    if (!text) throw new Error("Write a reply");
    return { id: data.id, text };
  })
  .handler(async ({ data }) => {
    const who = await viewer();
    const sql = await sqlForRecords();
    const rows = await sql.query<import("@/lib/board/records.server").CallRow>(
      "select id, manager_id, data, audio, answered_at, mailed_at from call_reflections where id = $1",
      [data.id],
    );
    const row = rows[0];
    if (!row) throw new Error("That call is gone");
    if (row.manager_id !== who.personId) throw new Error("Not allowed");
    if (!row.answered_at) {
      const { boardPeople } = await import("@/lib/board/records.server");
      const people = await boardPeople(sql);
      const stored = JSON.parse(row.data) as { answers?: PhoneAnswer[] };
      const answer: PhoneAnswer = {
        personId: who.personId,
        name: who.name,
        shopName: people.shopName(who.shopId),
        text: data.text,
        at: new Date().toISOString(),
      };
      await sql.query(
        `update call_reflections set data = $2, answered_at = now() where id = $1 and answered_at is null`,
        [data.id, JSON.stringify({ ...stored, answers: [...(stored.answers ?? []), answer] })],
      );
    }
    const mailed = await mailOneCall(sql, data.id).catch(() => false);
    return { ok: true as const, mailed };
  });

async function mailOneCall(sql: Awaited<ReturnType<typeof sqlForRecords>>, id: string) {
  const { callFromRow, boardPeople } = await import("@/lib/board/records.server");
  const rows = await sql.query<import("@/lib/board/records.server").CallRow>(
    `select id, manager_id, data, audio, answered_at, mailed_at from call_reflections
     where id = $1 and answered_at is not null and mailed_at is null`,
    [id],
  );
  const row = rows[0];
  if (!row) return true;
  const call = callFromRow(row, true);
  const answer = call.answers.at(-1);
  const people = await boardPeople(sql);
  const manager = people.person(call.managerId);
  const { sendCallMail } = await import("@/lib/board/mail-call.functions");
  const result = await sendCallMail({
    shopId: manager?.shopId ?? "",
    shopName: people.shopName(manager?.shopId ?? ""),
    managerName: manager?.name ?? answer?.name ?? "Manager",
    question: call.question,
    answer: answer?.text ?? "",
    audio: call.audio,
    audioName: call.audioName,
  });
  if (!result.ok) return false;
  // The clip is only kept until the email with it has gone out.
  await sql.query(`update call_reflections set mailed_at = now(), audio = null where id = $1`, [id]);
  return true;
}

async function retryCallMail(sql: Awaited<ReturnType<typeof sqlForRecords>>) {
  const rows = await sql.query<{ id: string }>(
    `select id from call_reflections where answered_at is not null and mailed_at is null order by answered_at limit 5`,
  );
  for (const row of rows) await mailOneCall(sql, row.id);
}

/* ---------------- Cash transfer ---------------- */

export const listCash = createServerFn({ method: "GET" }).handler(async (): Promise<CashTransfer[]> => {
  const who = await viewer();
  if (who.role === "technician") return [];
  const sql = await sqlForRecords();
  const rows =
    who.role === "owner"
      ? await sql.query<{ data: string }>(
          `select data from cash_transfers order by requested_at desc limit 60`,
        )
      : await sql.query<{ data: string }>(
          `select data from cash_transfers where shop_id = $1 order by requested_at desc limit 60`,
          [who.shopId],
        );
  return rows
    .map((row) => JSON.parse(row.data) as CashTransfer)
    .filter((item) => !item.deletedAt)
    .slice(0, 10);
});

function readAmount(value: unknown) {
  const amount = typeof value === "number" ? value : Number(String(value ?? "").replace(/[$,\s]/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter an amount");
  return Math.round(amount * 100) / 100;
}

export const requestCash = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const data = input as { shopId?: unknown; amount?: unknown };
    return { shopId: typeof data.shopId === "string" ? data.shopId : "", amount: readAmount(data.amount) };
  })
  .handler(async ({ data }) => {
    const who = await viewer();
    if (who.role === "technician") throw new Error("Not allowed");
    const shopId = who.role === "manager" ? who.shopId : data.shopId;
    const { SHOP_NAMES } = await import("@/lib/board/records.server");
    if (!SHOP_NAMES[shopId]) throw new Error("Pick a shop");
    const sql = await sqlForRecords();
    const item: CashTransfer = {
      id: `cash-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      shopId,
      managerId: who.personId,
      kind: "pickup",
      requested: data.amount,
      pickedUp: null,
      requestedAt: new Date().toISOString(),
      pickedUpAt: null,
    };
    const { insertCash } = await import("@/lib/board/records.server");
    await insertCash(sql, item);
    return { ok: true as const, item };
  });

async function loadCash(sql: Awaited<ReturnType<typeof sqlForRecords>>, id: string) {
  const rows = await sql.query<{ data: string }>("select data from cash_transfers where id = $1", [id]);
  if (!rows[0]) throw new Error("That entry is gone");
  return JSON.parse(rows[0].data) as CashTransfer;
}

export const recordPickup = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const data = input as { id?: unknown; amount?: unknown };
    if (typeof data.id !== "string") throw new Error("Which entry?");
    return { id: data.id, amount: readAmount(data.amount) };
  })
  .handler(async ({ data }) => {
    const who = await viewer();
    if (who.role !== "owner") throw new Error("Not allowed");
    const sql = await sqlForRecords();
    const item = await loadCash(sql, data.id);
    const next: CashTransfer = {
      ...item,
      pickedUp: data.amount,
      pickedUpAt: item.pickedUpAt ?? new Date().toISOString(),
      revisedAt: new Date().toISOString(),
    };
    const { saveCash } = await import("@/lib/board/records.server");
    await saveCash(sql, next);
    return { ok: true as const, item: next };
  });

export const deleteCash = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const id = (input as { id?: unknown })?.id;
    if (typeof id !== "string") throw new Error("Which entry?");
    return { id };
  })
  .handler(async ({ data }) => {
    const who = await viewer();
    if (who.role !== "owner") throw new Error("Not allowed");
    const sql = await sqlForRecords();
    const item = await loadCash(sql, data.id);
    const { saveCash } = await import("@/lib/board/records.server");
    await saveCash(sql, { ...item, deletedAt: new Date().toISOString() });
    return { ok: true as const };
  });

/* ---------------- End of Day ---------------- */

async function allowedShop(shopId: string) {
  const who = await viewer();
  if (who.role === "technician") throw new Error("Not allowed");
  if (who.role === "manager" && who.shopId !== shopId) throw new Error("Not allowed");
  return who;
}

export const getDayReport = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const data = input as { shopId?: unknown; date?: unknown };
    if (typeof data.shopId !== "string" || typeof data.date !== "string") throw new Error("Need a shop and a date");
    return { shopId: data.shopId, date: data.date };
  })
  .handler(async ({ data }): Promise<DayReport | null> => {
    await allowedShop(data.shopId);
    const sql = await sqlForRecords();
    const rows = await sql.query<{ data: string }>(
      "select data from day_reports where shop_id = $1 and day = $2",
      [data.shopId, data.date],
    );
    return rows[0] ? (JSON.parse(rows[0].data) as DayReport) : null;
  });

type DayInput = {
  shopId: string;
  date: string;
  values: Partial<Record<DayFieldKey, string>>;
  notes: Partial<Record<DayFieldKey, string>>;
  answers: Partial<Record<DayPromptKey, string>>;
};

function textMap<K extends string>(value: unknown): Partial<Record<K, string>> {
  const out: Partial<Record<K, string>> = {};
  if (!value || typeof value !== "object") return out;
  for (const [key, text] of Object.entries(value as Record<string, unknown>)) {
    if (typeof text === "string") out[key as K] = text.slice(0, 4000);
  }
  return out;
}

export const submitDayReport = createServerFn({ method: "POST" })
  .validator((input: unknown): DayInput => {
    const data = input as Partial<DayInput>;
    if (typeof data.shopId !== "string" || typeof data.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
      throw new Error("Need a shop and a date");
    }
    const answers = textMap<DayPromptKey>(data.answers);
    for (const prompt of DAY_PROMPTS) {
      if ((answers[prompt.key]?.trim().length ?? 0) < MIN_NOTE) throw new Error("Each answer needs 13 characters");
    }
    return {
      shopId: data.shopId,
      date: data.date,
      values: textMap<DayFieldKey>(data.values),
      notes: textMap<DayFieldKey>(data.notes),
      answers,
    };
  })
  .handler(async ({ data }) => {
    await allowedShop(data.shopId);
    const sql = await sqlForRecords();
    const { insertDayReport, boardPeople } = await import("@/lib/board/records.server");
    const report: DayReport = { ...data, submitted: true };
    await insertDayReport(sql, report, true);
    const people = await boardPeople(sql);
    const { sendDayReportMail } = await import("@/lib/board/mail-report.functions");
    let mailed = false;
    try {
      const result = await sendDayReportMail({ ...data, shopName: people.shopName(data.shopId) });
      mailed = result.ok;
    } catch {
      mailed = false;
    }
    if (mailed) {
      await sql.query("update day_reports set mailed_at = now() where shop_id = $1 and day = $2", [
        data.shopId,
        data.date,
      ]);
    }
    return { ok: true as const, mailed };
  });
