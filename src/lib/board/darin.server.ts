import { createHash, timingSafeEqual } from "node:crypto";

const COOKIE = "onward-pin";

async function secret() {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const rows = await sql.query<{ secret: string }>("select secret from app_secret where id = $1", ["main"]);
  return rows[0]?.secret ?? "";
}

async function readSession() {
  const { getCookie } = await import("@tanstack/react-start/server");
  const raw = getCookie(COOKIE);
  if (!raw) throw new Error("Not allowed");
  const [personId, expText, mac] = raw.split(".");
  const exp = Number(expText);
  const key = await secret();
  if (!personId || !mac || !key || !Number.isFinite(exp) || exp < Date.now()) throw new Error("Not allowed");
  const expected = createHash("sha256").update(`${key}:${personId}:${exp}`).digest("hex");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("Not allowed");
  return personId;
}

export async function requireDarin() {
  const personId = await readSession();
  if (personId !== "darin") throw new Error("Not allowed");
  return { personId, name: "Darin Dinis", email: "darin@drivenautocare.com", place: "Region" };
}

export async function requireReceiptUser() {
  const personId = await readSession();
  if (personId === "darin") return { personId, name: "Darin Dinis", email: "darin@drivenautocare.com", place: "Region" };
  if (personId === "arun") return { personId, name: "Arun", email: "arun@drivenautocare.com", place: "CEO" };
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const rows = await sql.query<{ data: string }>("select data from board_state where id = $1", ["main"]);
  const raw = rows[0]?.data;
  const board = raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : { techs: [], shops: [] };
  const person = (board.techs ?? []).find(
    (tech: { id: string; kind?: string; name?: string; email?: string; shopId?: string }) => tech.id === personId,
  );
  if (!person || person.kind !== "manager") throw new Error("Not allowed");
  const shopEmails: Record<string, string> = {
    "san-ramon": "sanramon@drivenautocare.com",
    "castro-valley": "castrovalley@drivenautocare.com",
    fremont: "fremont@drivenautocare.com",
    campbell: "campbell@drivenautocare.com",
    "san-jose": "sanjose@drivenautocare.com",
  };
  const shop = (board.shops ?? []).find((item: { id: string; name?: string }) => item.id === person.shopId);
  return {
    personId,
    name: person.name || "Manager",
    email: person.email || shopEmails[person.shopId ?? ""] || "",
    place: shop?.name || "Shop",
  };
}
