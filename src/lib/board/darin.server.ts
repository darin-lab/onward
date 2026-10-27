import { createHash, timingSafeEqual } from "node:crypto";

const COOKIE = "onward-pin";

async function secret() {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const rows = await sql.query<{ secret: string }>("select secret from app_secret where id = $1", ["main"]);
  return rows[0]?.secret ?? "";
}

export async function requireDarin() {
  const { getCookie } = await import("@tanstack/react-start/server");
  const raw = getCookie(COOKIE);
  if (!raw) throw new Error("Not allowed");
  const [personId, expText, mac] = raw.split(".");
  const exp = Number(expText);
  const key = await secret();
  if (personId !== "darin" || !mac || !key || !Number.isFinite(exp) || exp < Date.now()) {
    throw new Error("Not allowed");
  }
  const expected = createHash("sha256").update(`${key}:${personId}:${exp}`).digest("hex");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("Not allowed");
  return { personId, name: "Darin Dinis" };
}
