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
    const who = await allowedShop(data.shopId);
    const sql = await sqlForRecords();
    const { insertDayReport, boardPeople, owedTechReviews } = await import("@/lib/board/records.server");
    if (who.role === "manager" && (await owedTechReviews(sql, data.shopId)) > 0) {
      throw new Error("Finish the tech check-ins waiting on you first");
    }
    if (who.role === "manager") {
      const { shopToday, feedbackLeftThisWeek } = await import("@/lib/board/records.server");
      if (shopToday().wednesday && (await feedbackLeftThisWeek(sql, who.personId)).length > 0) {
        throw new Error("Send feedback for Arun and Darin first");
      }
    }
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

/* ---------------- Feedback for Darin and Arun ---------------- */

const FEEDBACK_ABOUT = {
  darin: { name: "Darin Dinis", first: "Darin" },
  arun: { name: "Arun", first: "Arun" },
} as const;

type FeedbackAbout = keyof typeof FEEDBACK_ABOUT;

/**
 * What this person still owes: managers send feedback for both Arun and Darin
 * every week, and on Wednesday it is due before End of Day.
 */
export const feedbackStatus = createServerFn({ method: "GET" }).handler(async () => {
  const who = await viewer();
  if (who.role === "owner") return { left: [] as FeedbackAbout[], due: false };
  const sql = await sqlForRecords();
  const { shopToday, feedbackLeftThisWeek } = await import("@/lib/board/records.server");
  const left = await feedbackLeftThisWeek(sql, who.personId);
  return { left, due: who.role === "manager" && shopToday().wednesday && left.length > 0 };
});

export const submitFeedback = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const data = input as { about?: unknown; helped?: unknown; better?: unknown; need?: unknown };
    if (data.about !== "darin" && data.about !== "arun") throw new Error("Who is this for?");
    const text = (value: unknown) => (typeof value === "string" ? value.trim().slice(0, 4000) : "");
    const answers = { helped: text(data.helped), better: text(data.better), need: text(data.need) };
    if (Object.values(answers).some((answer) => answer.length < MIN_NOTE)) {
      throw new Error("Each answer needs 13 characters");
    }
    return { about: data.about as FeedbackAbout, ...answers };
  })
  .handler(async ({ data }) => {
    const who = await viewer();
    if (who.role === "owner") throw new Error("Not allowed");
    const sql = await sqlForRecords();
    const { shopToday } = await import("@/lib/board/records.server");
    const id = `fb-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    await sql.query(
      `insert into feedback (id, about, author_id, week_start, data) values ($1, $2, $3, $4, $5)`,
      [
        id,
        data.about,
        who.personId,
        shopToday().weekStart,
        JSON.stringify({ helped: data.helped, better: data.better, need: data.need }),
      ],
    );
    // Nothing is emailed one at a time: once the last manager's feedback is in,
    // everything goes to Darin and Arun in one email.
    await sendFeedbackDigest({ backup: false }).catch(() => undefined);
    return { ok: true as const };
  });

type FeedbackRow = { id: string; about: string; author_id: string; data: string; created_at: string };

/**
 * One email with every feedback not yet sent, to both Darin and Arun.
 * - backup false: only once every manager has sent feedback for both Darin and
 *   Arun this week (that's right after the last one comes in on Wednesday).
 * - backup true: the 9 PM Wednesday run sends whatever came in, naming any
 *   manager who didn't send theirs (out that day, no End of Day).
 * Feedback that arrives after the email (a tech on Friday) waits for the next one.
 */
export async function sendFeedbackDigest({ backup }: { backup: boolean }) {
  const sql = await sqlForRecords();
  const { boardPeople, feedbackLeftThisWeek, shopToday } = await import("@/lib/board/records.server");
  const pending = await sql.query<FeedbackRow>(
    "select id, about, author_id, data, created_at from feedback where mailed_at is null order by created_at",
  );
  if (pending.length === 0) return { ok: true as const, sent: false };

  const boardRows = await sql.query<{ data: string }>("select data from board_state where id = $1", ["main"]);
  const raw = boardRows[0]?.data;
  const board = raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : {};
  const managers = ((board.techs ?? []) as { id: string; name: string; kind: string; shopId: string }[]).filter(
    (person) => person.kind === "manager",
  );
  const missing: { name: string; shopId: string; left: FeedbackAbout[] }[] = [];
  for (const manager of managers) {
    const left = await feedbackLeftThisWeek(sql, manager.id);
    if (left.length > 0) missing.push({ name: manager.name, shopId: manager.shopId, left });
  }
  if (!backup && missing.length > 0) return { ok: true as const, sent: false };

  // Claim these rows first so two sends at the same moment can't both mail them.
  const ids = pending.map((row) => row.id);
  const claimed = await sql.query<{ id: string }>(
    "update feedback set mailed_at = now() where id = any($1) and mailed_at is null returning id",
    [ids],
  );
  const mine = new Set(claimed.map((row) => row.id));
  const rows = pending.filter((row) => mine.has(row.id));
  if (rows.length === 0) return { ok: true as const, sent: false };

  const people = await boardPeople(sql);
  const items = rows.map((row) => {
    const author = people.person(row.author_id);
    const answers = JSON.parse(row.data) as { helped: string; better: string; need: string };
    return {
      about: row.about as FeedbackAbout,
      authorName: author?.name ?? row.author_id,
      authorRole: author?.kind === "manager" ? "Manager" : "Technician",
      shopName: people.shopName(author?.shopId ?? ""),
      at: row.created_at,
      ...answers,
    };
  });
  const { sendFeedbackDigestMail } = await import("@/lib/board/mail-feedback.functions");
  try {
    const result = await sendFeedbackDigestMail({
      weekStart: shopToday().weekStart,
      items,
      missing: missing.map((person) => ({
        name: person.name,
        shopName: people.shopName(person.shopId),
        left: person.left.map((who) => FEEDBACK_ABOUT[who].first),
      })),
    });
    if (!result.ok) throw new Error(result.reason);
  } catch (error) {
    // Put them back so the next try includes them.
    await sql.query("update feedback set mailed_at = null where id = any($1)", [[...mine]]);
    return { ok: false as const, sent: false, reason: error instanceof Error ? error.message : "mail failed" };
  }
  return { ok: true as const, sent: true, count: rows.length };
}
