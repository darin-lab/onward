import { createServerFn } from "@tanstack/react-start";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const assignedPins: Record<string, string> = {
  darin: "4816",
  arun: "2957",
  jon: "6148",
  david: "3702",
  israel: "8294",
  dillon: "1563",
  kevin: "7430",
  antonio: "5081",
  tim: "9264",
  jim: "3619",
  francisco: "1847",
  nathan: "6520",
  jeremiah: "4073",
  edgar: "8901",
  andre: "2758",
  duc: "6392",
};

async function ensureAssignedPins() {
  const key = await secret();
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  for (const [personId, pin] of Object.entries(assignedPins)) {
    await sql.query(
      `insert into staff_pins (person_id, pin_hash, pin_text) values ($1, $2, $3)
       on conflict (person_id) do update set pin_text = coalesce(staff_pins.pin_text, excluded.pin_text)`,
      [personId, digest(key, pin), pin],
    );
  }
}

type Session = { personId: string; role: "owner" | "manager" | "technician"; name: string };

const COOKIE = "onward-pin";
const owners = new Set(["darin", "arun"]);

function digest(secret: string, pin: string) {
  return createHash("sha256").update(`${secret}:${pin}`).digest("hex");
}

function sign(secret: string, personId: string, exp: number) {
  return createHash("sha256").update(`${secret}:${personId}:${exp}`).digest("hex");
}

async function secret() {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const rows = await sql.query<{ secret: string }>("select secret from app_secret where id = $1", ["main"]);
  if (rows[0]?.secret) return rows[0].secret;
  const next = randomBytes(32).toString("hex");
  await sql.query(
    "insert into app_secret (id, secret) values ($1, $2) on conflict (id) do nothing",
    ["main", next],
  );
  const again = await sql.query<{ secret: string }>("select secret from app_secret where id = $1", ["main"]);
  return again[0]?.secret ?? next;
}

async function readSession(): Promise<Session | null> {
  const { getCookie } = await import("@tanstack/react-start/server");
  const raw = getCookie(COOKIE);
  if (!raw) return null;
  const [personId, expText, mac] = raw.split(".");
  const exp = Number(expText);
  if (!personId || !mac || !Number.isFinite(exp) || exp < Date.now()) return null;
  const key = await secret();
  const expected = sign(key, personId, exp);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return describe(personId);
}

async function describe(personId: string): Promise<Session | null> {
  if (personId === "darin") return { personId, role: "owner", name: "Darin Dinis" };
  if (personId === "arun") return { personId, role: "owner", name: "Arun" };
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const rows = await sql.query<{ data: string }>("select data from board_state where id = $1", ["main"]);
  const raw = rows[0]?.data;
  if (!raw) return null;
  const board = typeof raw === "string" ? JSON.parse(raw) : raw;
  const person = (board.techs ?? []).find((tech: { id: string }) => tech.id === personId);
  if (!person) return null;
  return {
    personId,
    role: person.kind === "manager" ? "manager" : "technician",
    name: person.name,
  };
}

async function writeSession(personId: string) {
  const key = await secret();
  const exp = Date.now() + 1000 * 60 * 60 * 24 * 30;
  const { setCookie } = await import("@tanstack/react-start/server");
  setCookie(COOKIE, `${personId}.${exp}.${sign(key, personId, exp)}`, {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export const pinStatus = createServerFn({ method: "GET" }).handler(async () => readSession());

export const pinSignIn = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const pin = (input as { pin?: unknown })?.pin;
    if (typeof pin !== "string" || !/^\d{4}$/.test(pin)) throw new Error("Enter 4 digits");
    return { pin };
  })
  .handler(async ({ data }) => {
    await ensureAssignedPins();
    const key = await secret();
    const hash = digest(key, data.pin);
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql.query<{ person_id: string }>(
      "select person_id from staff_pins where pin_hash = $1",
      [hash],
    );
    let personId = rows[0]?.person_id ?? "";
    if (!personId && process.env.OWNER_PIN?.trim() === data.pin) personId = "darin";
    if (!personId) return { ok: false as const };
    const session = await describe(personId);
    if (!session) return { ok: false as const };
    await writeSession(personId);
    return { ok: true as const, session };
  });

export const pinSignOut = createServerFn({ method: "POST" }).handler(async () => {
  const { setCookie } = await import("@tanstack/react-start/server");
  setCookie(COOKIE, "", { path: "/", httpOnly: true, secure: true, sameSite: "lax", maxAge: 0 });
  return { ok: true as const };
});

export const pinAssignments = createServerFn({ method: "GET" }).handler(async () => {
  const session = await readSession();
  if (session?.role !== "owner") return [];
  await ensureAssignedPins();
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const rows = await sql.query<{ person_id: string; pin_text: string | null }>(
    "select person_id, pin_text from staff_pins",
  );
  return rows.map((row) => ({ personId: row.person_id, pin: row.pin_text ?? "" }));
});

export const setPersonPin = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const data = input as { personId?: unknown; pin?: unknown };
    if (typeof data.personId !== "string" || typeof data.pin !== "string" || !/^\d{4}$/.test(data.pin)) {
      throw new Error("Enter 4 digits");
    }
    return { personId: data.personId, pin: data.pin };
  })
  .handler(async ({ data }) => {
    const session = await readSession();
    if (session?.role !== "owner") return { ok: false as const, reason: "Sign in as an owner first." };
    if (!owners.has(data.personId)) {
      const person = await describe(data.personId);
      if (!person) return { ok: false as const, reason: "That person is not on the board." };
    }
    const key = await secret();
    const hash = digest(key, data.pin);
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const taken = await sql.query<{ person_id: string }>(
      "select person_id from staff_pins where pin_hash = $1 and person_id <> $2",
      [hash, data.personId],
    );
    if (taken.length > 0) return { ok: false as const, reason: "That PIN is already used." };
    if (process.env.OWNER_PIN?.trim() === data.pin && data.personId !== "darin") {
      return { ok: false as const, reason: "That PIN is already used." };
    }
    await sql.query(
      `insert into staff_pins (person_id, pin_hash, pin_text) values ($1, $2, $3)
       on conflict (person_id) do update set pin_hash = excluded.pin_hash, pin_text = excluded.pin_text`,
      [data.personId, hash, data.pin],
    );
    return { ok: true as const };
  });
