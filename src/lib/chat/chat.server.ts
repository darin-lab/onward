// Server-only helpers for Driven Chat. Nothing here is imported by client
// code; the server functions in chat.functions.ts load it with a dynamic
// import, the same way the rest of the app loads its *.server.ts files.
import type { Viewer } from "@/lib/board/darin.server";
import type {
  ChatMessageInfo,
  ChatPerson,
  ChatPresence,
  ChatRoomInfo,
} from "@/lib/chat/types";

type Sql = Awaited<ReturnType<typeof import("@/lib/db").getSql>>;

const OWNER_TITLES: Record<string, string> = { darin: "Area Manager", arun: "CEO" };

export async function chatSql(): Promise<Sql> {
  const { getSql } = await import("@/lib/db");
  return getSql();
}

type BoardJson = {
  techs?: { id: string; name?: string; kind?: string; shopId?: string }[];
  shops?: { id: string; name?: string }[];
};

let directoryCache: { at: number; people: ChatPerson[] } | null = null;

/** Darin, Arun and everyone on the board, with their shop. Cached for a minute. */
export async function loadDirectory(sql: Sql): Promise<ChatPerson[]> {
  if (directoryCache && Date.now() - directoryCache.at < 60_000) return directoryCache.people;
  const rows = await sql.query<{ data: string }>("select data from board_state where id = $1", ["main"]);
  const raw = rows[0]?.data;
  const board: BoardJson = raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : {};
  const shops = new Map((board.shops ?? []).map((shop) => [shop.id, shop.name ?? shop.id]));
  const people: ChatPerson[] = [
    { id: "darin", name: "Darin Dinis", role: "owner", title: OWNER_TITLES.darin, shopId: "", shopName: "" },
    { id: "arun", name: "Arun", role: "owner", title: OWNER_TITLES.arun, shopId: "", shopName: "" },
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
  directoryCache = { at: Date.now(), people };
  return people;
}

/** Chat is open to someone listed in chat_access, or to everyone once the switch is on. */
export async function hasChatAccess(sql: Sql, personId: string): Promise<boolean> {
  const rows = await sql.query<{ n: number }>(
    `select (select count(*) from chat_access where person_id = $1)
          + (select count(*) from chat_settings where key = 'everyone' and value = 'true') as n`,
    [personId],
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

/** The signed-in person, only if they may use chat. Every chat function starts here. */
export async function requireChat() {
  const { requireViewer } = await import("@/lib/board/darin.server");
  const viewer = await requireViewer();
  const sql = await chatSql();
  if (!(await hasChatAccess(sql, viewer.personId))) throw new Error("Not allowed");
  return { viewer, sql };
}

export async function requireChatOwner() {
  const ctx = await requireChat();
  if (ctx.viewer.role !== "owner") throw new Error("Not allowed");
  return ctx;
}

export async function getSetting(sql: Sql, key: string, fallback = ""): Promise<string> {
  const rows = await sql.query<{ value: string }>("select value from chat_settings where key = $1", [key]);
  return rows[0]?.value ?? fallback;
}

export async function setSetting(sql: Sql, key: string, value: string) {
  await sql.query(
    "insert into chat_settings (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value",
    [key, value],
  );
}

type RoomRow = {
  id: string;
  kind: "channel" | "group" | "dm";
  name: string | null;
  audience: "everyone" | "managers" | "members";
  is_member: boolean;
  last_read_id: number;
  muted: boolean;
  unread: number;
  last_id: number | null;
  last_author: string | null;
  last_body: string | null;
  last_photo: string | null;
  last_at: Date | string | null;
};

type RoomFacts = Pick<RoomRow, "kind" | "audience" | "is_member">;

/** Channels the viewer's role allows, plus whatever else they belong to. Owners can read all. */
export function canSeeRoom(room: RoomFacts, viewer: Viewer) {
  if (viewer.role === "owner") return true;
  if (room.kind === "channel") {
    return room.audience === "everyone" || (room.audience === "managers" && viewer.role === "manager");
  }
  return room.is_member;
}

/** Owners may read every conversation, but only post where they take part. */
export function canPostRoom(room: RoomFacts, viewer: Viewer) {
  if (room.kind === "channel") {
    return room.audience === "everyone" || viewer.role === "manager" || viewer.role === "owner";
  }
  return room.is_member;
}

export function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return new Date(value).toISOString();
}

async function roomRows(sql: Sql, personId: string): Promise<RoomRow[]> {
  return sql.query<RoomRow>(
    `select r.id, r.kind, r.name, r.audience,
            (m.person_id is not null) as is_member,
            coalesce(m.last_read_id, 0) as last_read_id,
            coalesce(m.muted, false) as muted,
            (select count(*) from chat_messages x
               where x.room_id = r.id and x.deleted_at is null
                 and x.author_id <> $1 and x.id > coalesce(m.last_read_id, 0)) as unread,
            lm.id as last_id, lm.author_id as last_author, lm.body as last_body,
            lm.photo_id as last_photo, lm.created_at as last_at
       from chat_rooms r
       left join chat_members m on m.room_id = r.id and m.person_id = $1
       left join lateral (
         select id, author_id, body, photo_id, created_at from chat_messages
          where room_id = r.id and deleted_at is null order by id desc limit 1
       ) lm on true`,
    [personId],
  );
}

/**
 * Gives the viewer a read marker in every channel they can see, set to "now",
 * so a new person is not greeted by a pile of old unread messages.
 */
async function joinVisibleChannels(sql: Sql, viewer: Viewer, rows: RoomRow[]) {
  for (const room of rows) {
    if (room.kind !== "channel" || room.is_member || !canSeeRoom(room, viewer)) continue;
    await sql.query(
      `insert into chat_members (room_id, person_id, last_read_id)
       values ($1, $2, coalesce((select max(id) from chat_messages where room_id = $1), 0))
       on conflict (room_id, person_id) do nothing`,
      [room.id, viewer.personId],
    );
    room.is_member = true;
    room.last_read_id = room.last_id ?? 0;
    room.unread = 0;
  }
}

/** Every room the viewer may see, with unread counts, newest first. */
export async function buildRooms(sql: Sql, viewer: Viewer): Promise<ChatRoomInfo[]> {
  const rows = await roomRows(sql, viewer.personId);
  await joinVisibleChannels(sql, viewer, rows);
  const visible = rows.filter((room) => canSeeRoom(room, viewer));
  const members = await sql.query<{ room_id: string; person_id: string }>(
    `select m.room_id, m.person_id from chat_members m
       join chat_rooms r on r.id = m.room_id where r.kind <> 'channel'`,
  );
  const byRoom = new Map<string, string[]>();
  for (const row of members) {
    const list = byRoom.get(row.room_id) ?? [];
    list.push(row.person_id);
    byRoom.set(row.room_id, list);
  }
  return visible.map((room) => ({
    id: room.id,
    kind: room.kind,
    name: room.name ?? (room.kind === "group" ? "Group chat" : ""),
    audience: room.audience,
    members: byRoom.get(room.id) ?? [],
    unread: Number(room.unread ?? 0),
    muted: Boolean(room.muted),
    canPost: canPostRoom(room, viewer),
    last:
      room.last_id != null
        ? {
            id: Number(room.last_id),
            authorId: room.last_author ?? "",
            text: room.last_body ?? "",
            photo: Boolean(room.last_photo),
            at: iso(room.last_at) ?? new Date().toISOString(),
          }
        : null,
  }));
}

export async function buildPresence(sql: Sql): Promise<ChatPresence> {
  const rows = await sql.query<{ person_id: string; status: string; fresh: boolean }>(
    `select person_id, status, (last_seen > now() - interval '90 seconds') as fresh from chat_presence`,
  );
  const out: ChatPresence = {};
  for (const row of rows) {
    // Someone who closed the app shows offline; otherwise the status they picked.
    const picked = row.status === "under_car" || row.status === "with_client" ? row.status : row.status === "offline" ? "offline" : "online";
    out[row.person_id] = { state: row.fresh ? picked : "offline" };
  }
  return out;
}

export async function touchPresence(sql: Sql, personId: string) {
  await sql.query(
    `insert into chat_presence (person_id, last_seen) values ($1, now())
     on conflict (person_id) do update set last_seen = now()`,
    [personId],
  );
}

type MessageRow = {
  id: number;
  room_id: string;
  author_id: string;
  body: string;
  photo_id: string | null;
  created_at: Date | string;
  deleted_at: Date | string | null;
  deleted_by: string | null;
  expired_at: Date | string | null;
  keep: boolean | null;
  has_photo_row: boolean | null;
};

function toMessage(row: MessageRow, viewer: Viewer): ChatMessageInfo {
  const deleted = row.deleted_at != null;
  const owner = viewer.role === "owner";
  const hide = deleted && !owner;
  const hasPhoto = Boolean(row.photo_id) && !hide;
  return {
    id: Number(row.id),
    roomId: row.room_id,
    authorId: row.author_id,
    body: hide ? "" : row.body,
    photoId: hasPhoto ? row.photo_id : null,
    photoState: !hasPhoto ? "none" : row.expired_at || !row.has_photo_row ? "expired" : "ok",
    createdAt: iso(row.created_at) ?? "",
    deleted,
    deletedBy: owner ? row.deleted_by : null,
    deletedAt: owner ? iso(row.deleted_at) : null,
    kept: Boolean(row.keep),
  };
}

const MESSAGE_SELECT = `select m.id, m.room_id, m.author_id, m.body, m.photo_id, m.created_at,
       m.deleted_at, m.deleted_by, p.expired_at, p.keep, (p.id is not null) as has_photo_row
  from chat_messages m left join chat_photos p on p.id = m.photo_id`;

/**
 * Messages for one room. after = 0 means "the latest 60"; otherwise only newer
 * ones. changed lists messages hidden since the last poll so open screens drop
 * (or, for Darin and Arun, cross out) a deleted message without a reload.
 */
export async function listMessages(
  sql: Sql,
  viewer: Viewer,
  roomId: string,
  after: number,
  since: string | null,
): Promise<{ messages: ChatMessageInfo[]; changed: ChatMessageInfo[] }> {
  const owner = viewer.role === "owner";
  const hideDeleted = owner ? "" : "and m.deleted_at is null";
  let rows: MessageRow[];
  if (after <= 0) {
    rows = await sql.query<MessageRow>(
      `${MESSAGE_SELECT} where m.room_id = $1 ${hideDeleted} order by m.id desc limit 60`,
      [roomId],
    );
    rows.reverse();
  } else {
    rows = await sql.query<MessageRow>(
      `${MESSAGE_SELECT} where m.room_id = $1 and m.id > $2 ${hideDeleted} order by m.id asc limit 100`,
      [roomId, after],
    );
  }
  let changed: MessageRow[] = [];
  if (since && after > 0) {
    changed = await sql.query<MessageRow>(
      `${MESSAGE_SELECT} where m.room_id = $1 and m.deleted_at > $2 and m.id <= $3 limit 100`,
      [roomId, since, after],
    );
  }
  return {
    messages: rows.map((row) => toMessage(row, viewer)),
    changed: changed.map((row) => toMessage(row, viewer)),
  };
}

export async function typingIn(sql: Sql, roomId: string, personId: string): Promise<string[]> {
  const rows = await sql.query<{ person_id: string }>(
    `select person_id from chat_presence
      where typing_room = $1 and typing_at > now() - interval '6 seconds' and person_id <> $2`,
    [roomId, personId],
  );
  return rows.map((row) => row.person_id);
}

export async function avatarStamp(sql: Sql): Promise<string> {
  const rows = await sql.query<{ stamp: string | null }>(
    "select coalesce(max(updated_at)::text, '') as stamp from chat_profiles",
  );
  return String(rows[0]?.stamp ?? "") + ":" + String((await sql.query<{ n: number }>("select count(*) as n from chat_profiles"))[0]?.n ?? 0);
}

export async function loadAvatars(sql: Sql): Promise<Record<string, string>> {
  const rows = await sql.query<{ person_id: string; avatar: string | null }>(
    "select person_id, avatar from chat_profiles where avatar is not null",
  );
  const out: Record<string, string> = {};
  for (const row of rows) if (row.avatar) out[row.person_id] = row.avatar;
  return out;
}

/** Blank the picture of every photo past 30 days unless Darin or Arun kept it. */
export async function cleanupPhotos(sql: Sql) {
  const last = await getSetting(sql, "last_cleanup", "");
  if (last && Date.now() - new Date(last).getTime() < 60 * 60 * 1000) return;
  await setSetting(sql, "last_cleanup", new Date().toISOString());
  await sql.query(
    `update chat_photos set data = '', expired_at = now()
      where keep = false and expired_at is null and created_at < now() - interval '30 days'`,
  );
}

type PushPayload = { title: string; body: string; roomId: string; tag: string };

/**
 * Sends a notification to every phone or computer that belongs to someone in the
 * room, except the author and anyone who muted the room. Never throws: a push
 * problem must not stop a message from being sent.
 */
export async function pushToRoom(
  sql: Sql,
  room: { id: string; kind: string; name: string | null },
  author: ChatPerson | undefined,
  body: string,
  hasPhoto: boolean,
) {
  try {
    const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
    const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
    if (!publicKey || !privateKey) return;
    const subs = await sql.query<{ endpoint: string; p256dh: string; auth: string }>(
      `select p.endpoint, p.p256dh, p.auth
         from chat_members m
         join chat_push p on p.person_id = m.person_id
        where m.room_id = $1 and m.muted = false and m.person_id <> $2`,
      [room.id, author?.id ?? ""],
    );
    if (subs.length === 0) return;
    const preview = (await getSetting(sql, "push_preview", "full")) === "full";
    const who = author?.name ?? "Someone";
    const text = body.trim() || (hasPhoto ? "Sent a photo" : "New message");
    const title = room.kind === "dm" ? who : (room.name ?? "Driven Chat");
    const payload: PushPayload = {
      title: preview ? title : "Driven Chat",
      body: preview
        ? room.kind === "dm"
          ? text.slice(0, 120)
          : `${who}: ${text.slice(0, 120)}`
        : `New message from ${who}`,
      roomId: room.id,
      tag: `room-${room.id}`,
    };
    const webpush = (await import("web-push")).default;
    webpush.setVapidDetails(process.env.VAPID_SUBJECT?.trim() || "https://drivenonward.com", publicKey, privateKey);
    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify(payload),
            { TTL: 60 * 60 * 12, urgency: "high" },
          );
        } catch (error) {
          const status = (error as { statusCode?: number }).statusCode;
          // The phone or browser forgot this subscription; stop sending to it.
          if (status === 404 || status === 410) {
            await sql.query("delete from chat_push where endpoint = $1", [sub.endpoint]).catch(() => undefined);
          }
        }
      }),
    );
  } catch (error) {
    console.error("[chat] push failed:", error instanceof Error ? error.message : error);
  }
}
