// Holiday Party RSVP, server side. Temporary feature: see ./README.md for removal.
import type { Viewer } from "@/lib/board/darin.server";
import type { HolidayPerson, HolidayState, RsvpAnswer } from "@/holiday/types";
import { HOLIDAY_END, HOLIDAY_START } from "@/holiday/types";

type Sql = Awaited<ReturnType<typeof import("@/lib/db").getSql>>;

type Row = {
  person_id: string;
  answer: RsvpAnswer | null;
  attending: number;
  prompt_day: string | null;
  team_prompt_day: string | null;
};

export function isActive(now = Date.now()) {
  return now >= Date.parse(HOLIDAY_START) && now < Date.parse(HOLIDAY_END);
}

/** Today's date in Pacific time, YYYY-MM-DD. */
export function pacificDay(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export async function holidaySql(): Promise<Sql> {
  const { getSql } = await import("@/lib/db");
  return getSql();
}

type BoardJson = {
  techs?: { id: string; name?: string; kind?: string; shopId?: string }[];
  shops?: { id: string; name?: string }[];
};

/** Darin, Arun and everyone on the board, with their shop. */
export async function loadPeople(sql: Sql) {
  const rows = await sql.query<{ data: string }>("select data from board_state where id = $1", ["main"]);
  const raw = rows[0]?.data;
  const board: BoardJson = raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : {};
  const shops = new Map((board.shops ?? []).map((shop) => [shop.id, shop.name ?? shop.id]));
  const people: Omit<HolidayPerson, "answer" | "attending">[] = [
    { id: "darin", name: "Darin Dinis", role: "owner", title: "Area Manager", shopId: "", shopName: "Region" },
    { id: "arun", name: "Arun", role: "owner", title: "CEO", shopId: "", shopName: "CEO" },
  ];
  for (const tech of board.techs ?? []) {
    if (!tech?.id || tech.id === "darin" || tech.id === "arun") continue;
    const manager = tech.kind === "manager";
    people.push({
      id: tech.id,
      name: tech.name || tech.id,
      role: manager ? "manager" : "technician",
      title: manager ? "Manager" : "Technician",
      shopId: tech.shopId ?? "",
      shopName: shops.get(tech.shopId ?? "") ?? "",
    });
  }
  return people;
}

async function loadRows(sql: Sql) {
  const rows = await sql.query<Row>(
    "select person_id, answer, attending, prompt_day, team_prompt_day from holiday_rsvp",
  );
  return new Map(rows.map((row) => [row.person_id, row]));
}

const decided = (answer: RsvpAnswer | null | undefined) => answer === "yes" || answer === "no";

export async function buildState(sql: Sql, viewer: Viewer): Promise<HolidayState> {
  const today = pacificDay();
  const people = await loadPeople(sql);
  const rows = await loadRows(sql);
  const withAnswers: HolidayPerson[] = people.map((person) => {
    const row = rows.get(person.id);
    return { ...person, answer: row?.answer ?? null, attending: Number(row?.attending ?? 1) };
  });
  const meRow = rows.get(viewer.personId);
  const me = withAnswers.find((p) => p.id === viewer.personId) ?? {
    id: viewer.personId,
    name: viewer.name,
    role: viewer.role,
    title: viewer.role === "owner" ? "Owner" : viewer.role === "manager" ? "Manager" : "Technician",
    shopId: viewer.shopId,
    shopName: "",
    answer: meRow?.answer ?? null,
    attending: Number(meRow?.attending ?? 1),
  };
  const team =
    viewer.role === "manager"
      ? [me, ...withAnswers.filter((p) => p.role === "technician" && p.shopId === viewer.shopId)]
      : [];
  return {
    active: true,
    today,
    me,
    showInvite: !decided(me.answer) && meRow?.prompt_day !== today,
    team,
    showTeam:
      viewer.role === "manager" && team.some((p) => !decided(p.answer)) && meRow?.team_prompt_day !== today,
    everyone: viewer.role === "owner" ? withAnswers : [],
  };
}

/** May this viewer answer for that person? Themselves always; a manager for their own shop's technicians. */
export async function canAnswerFor(sql: Sql, viewer: Viewer, personId: string) {
  if (personId === viewer.personId) return true;
  if (viewer.role !== "manager") return false;
  const people = await loadPeople(sql);
  const person = people.find((p) => p.id === personId);
  return Boolean(person && person.role === "technician" && person.shopId === viewer.shopId);
}

export async function saveAnswer(
  sql: Sql,
  personId: string,
  answer: RsvpAnswer,
  attending: number,
  by: string,
) {
  await sql.query(
    `insert into holiday_rsvp (person_id, answer, attending, answered_by, updated_at)
     values ($1, $2, $3, $4, now())
     on conflict (person_id) do update
       set answer = excluded.answer, attending = excluded.attending,
           answered_by = excluded.answered_by, updated_at = now()`,
    [personId, answer, attending, by],
  );
}

export async function markSeen(sql: Sql, personId: string, kind: "invite" | "team") {
  const column = kind === "team" ? "team_prompt_day" : "prompt_day";
  await sql.query(
    `insert into holiday_rsvp (person_id, ${column}) values ($1, $2)
     on conflict (person_id) do update set ${column} = excluded.${column}`,
    [personId, pacificDay()],
  );
}
