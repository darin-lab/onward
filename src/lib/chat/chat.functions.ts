import { createServerFn } from "@tanstack/react-start";
import { CHAT_EMOJI } from "@/lib/chat/types";

const realtime = () => import("@/lib/chat/realtime.server");
import type {
  ChatSearchHit,
  ChatBootstrap,
  ChatMessageInfo,
  ChatPin,
  ChatPollInput,
  ChatPollResult,
  ChatSettings,
  ChatStatus,
} from "@/lib/chat/types";

const str = (value: unknown, max: number) => (typeof value === "string" ? value.slice(0, max) : "");

/** Never throws: tells the page whether to show the Chat button at all. */
export const chatStatus = createServerFn({ method: "GET" }).handler(async (): Promise<ChatStatus> => {
  try {
    const { currentViewer } = await import("@/lib/board/darin.server");
    const viewer = await currentViewer();
    if (!viewer) return { allowed: false };
    const { chatSql, hasChatAccess, loadDirectory } = await import("@/lib/chat/chat.server");
    const sql = await chatSql();
    if (!(await hasChatAccess(sql, viewer.personId))) return { allowed: false };
    const people = await loadDirectory(sql);
    const me = people.find((p) => p.id === viewer.personId);
    return {
      allowed: true,
      me: {
        personId: viewer.personId,
        name: viewer.name,
        title: me?.title ?? "Technician",
        role: viewer.role,
      },
    };
  } catch {
    return { allowed: false };
  }
});

export const chatBootstrap = createServerFn({ method: "GET" }).handler(async (): Promise<ChatBootstrap> => {
  const s = await import("@/lib/chat/chat.server");
  const { viewer, sql } = await s.requireChat();
  const swept = await s.sweepIfDue(sql);
  const before = (await sql.query<{ status: string }>("select status from chat_presence where person_id = $1", [viewer.personId]))[0]?.status;
  await s.signInForToday(sql, viewer.personId);
  if (swept || before !== "online") await (await realtime()).pingEveryone({ type: "presence" });
  await s.cleanupPhotos(sql);
  const people = await s.loadDirectory(sql);
  const me = people.find((p) => p.id === viewer.personId);
  return {
    me: { personId: viewer.personId, name: viewer.name, title: me?.title ?? "Technician", role: viewer.role },
    people,
    rooms: await s.buildRooms(sql, viewer),
    presence: await s.buildPresence(sql),
    avatars: await s.loadAvatars(sql),
    meetUrl: await s.getSetting(sql, "meet_url", ""),
    gifEnabled: Boolean(process.env.GIPHY_API_KEY?.trim()),
    dnd: await s.loadDnd(sql, viewer.personId),
    vapidPublicKey: process.env.VAPID_PUBLIC_KEY?.trim() ?? "",
    serverTime: new Date().toISOString(),
  };
});

export const chatPoll = createServerFn({ method: "POST" })
  .validator((input: unknown): ChatPollInput => {
    const d = (input ?? {}) as Partial<ChatPollInput>;
    return {
      roomId: typeof d.roomId === "string" && d.roomId ? d.roomId : null,
      after: Number.isFinite(d.after) ? Number(d.after) : 0,
      since: typeof d.since === "string" && d.since ? d.since : null,
    };
  })
  .handler(async ({ data }): Promise<ChatPollResult> => {
    const startedAt = new Date().toISOString();
    const s = await import("@/lib/chat/chat.server");
    const { viewer, sql } = await s.requireChat();
    await s.touchPresence(sql, viewer.personId);
    if (await s.sweepIfDue(sql)) await (await realtime()).pingEveryone({ type: "presence" });
    const rooms = await s.buildRooms(sql, viewer);
    let messages: ChatMessageInfo[] = [];
    let changed: ChatMessageInfo[] = [];
    let typing: string[] = [];
    let pins: ChatPin[] = [];
    if (data.roomId && rooms.some((r) => r.id === data.roomId)) {
      const out = await s.listMessages(sql, viewer, data.roomId, data.after, data.since);
      messages = out.messages;
      changed = out.changed;
      typing = await s.typingIn(sql, data.roomId, viewer.personId);
      pins = await s.listPins(sql, data.roomId, viewer);
    }
    return {
      rooms,
      presence: await s.buildPresence(sql),
      messages,
      changed,
      typing,
      pins,
      avatarStamp: await s.avatarStamp(sql),
      meetUrl: await s.getSetting(sql, "meet_url", ""),
      serverTime: startedAt,
    };
  });

const GIF_HOST = /^https:\/\/media[0-9]*\.giphy\.com\//;
const FILE_TYPES: Record<string, string> = {
  pdf: "application/pdf", doc: "application/msword", xls: "application/vnd.ms-excel", csv: "text/csv", txt: "text/plain",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export const chatSend = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const d = (input ?? {}) as { roomId?: unknown; body?: unknown; photo?: unknown; gif?: unknown; file?: unknown; replyTo?: unknown };
    const body = str(d.body, 2000).trim();
    const photo = typeof d.photo === "string" && d.photo.startsWith("data:image/") ? d.photo : "";
    if (photo.length > 300_000) throw new Error("Photo is too large");
    const gif = typeof d.gif === "string" && GIF_HOST.test(d.gif) && d.gif.length < 600 ? d.gif : "";
    let file: { name: string; mime: string; data: string } | null = null;
    const f = d.file as { name?: unknown; data?: unknown } | null | undefined;
    if (f && typeof f.name === "string" && typeof f.data === "string") {
      const name = f.name.replace(/[^\w .()\-]/g, "_").slice(0, 120) || "file";
      const mime = FILE_TYPES[name.split(".").pop()?.toLowerCase() ?? ""];
      if (!mime) throw new Error("That file type isn't supported. Use PDF, Word, Excel, CSV or text.");
      if (f.data.length > 2_200_000) throw new Error("File is too large (limit about 1.5 MB)");
      file = { name, mime, data: f.data };
    }
    if (!body && !photo && !gif && !file) throw new Error("Nothing to send");
    const replyTo = Number.isFinite(Number(d.replyTo)) && Number(d.replyTo) > 0 ? Number(d.replyTo) : null;
    return { roomId: str(d.roomId, 200), body, photo, gif, file, replyTo };
  })
  .handler(async ({ data }) => {
    const s = await import("@/lib/chat/chat.server");
    const { viewer, sql } = await s.requireChat();
    const rooms = await s.buildRooms(sql, viewer);
    const room = rooms.find((r) => r.id === data.roomId);
    if (!room || !room.canPost) throw new Error("Not allowed");
    let photoId: string | null = null;
    if (data.photo) {
      photoId = `p_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      await sql.query("insert into chat_photos (id, data) values ($1, $2)", [photoId, data.photo]);
    }
    let fileId: string | null = null;
    if (data.file) {
      fileId = `f_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      await sql.query("insert into chat_files (id, name, mime, size, data) values ($1, $2, $3, $4, $5)",
        [fileId, data.file.name, data.file.mime, Math.round(data.file.data.length * 0.75), data.file.data]);
    }
    let replyTo: number | null = null;
    if (data.replyTo) {
      const ok = await sql.query("select 1 from chat_messages where id = $1 and room_id = $2", [data.replyTo, room.id]);
      if (ok.length) replyTo = data.replyTo;
    }
    const directory = await s.loadDirectory(sql);
    const mentioned = s.findMentions(data.body, directory).filter((id) => id !== viewer.personId);
    const rows = await sql.query<{ id: number }>(
      "insert into chat_messages (room_id, author_id, body, photo_id, mentions, reply_to, gif_url, file_id) values ($1, $2, $3, $4, $5, $6, $7, $8) returning id",
      [room.id, viewer.personId, data.body, photoId, mentioned.length ? `,${mentioned.join(",")},` : "", replyTo, data.gif || null, fileId],
    );
    const id = Number(rows[0].id);
    await sql.query(
      `insert into chat_members (room_id, person_id, last_read_id) values ($1, $2, $3)
       on conflict (room_id, person_id) do update set last_read_id = greatest(chat_members.last_read_id, $3)`,
      [room.id, viewer.personId, id],
    );
    await sql.query("update chat_presence set typing_room = null where person_id = $1", [viewer.personId]);
    // Like AIM: messaging someone who is away gets their away message back, once per message text.
    if (room.kind === "dm") {
      const other = room.members.find((m) => m !== viewer.personId);
      if (other) {
        const away = await sql.query<{ away_message: string | null }>(
          "select away_message from chat_presence where person_id = $1", [other]);
        const note = away[0]?.away_message?.trim();
        if (note) {
          const text = `Auto-response: ${note}`;
          const last = await sql.query<{ body: string }>(
            "select body from chat_messages where room_id = $1 and author_id = $2 and body like 'Auto-response:%' order by id desc limit 1",
            [room.id, other]);
          if (last[0]?.body !== text) {
            await sql.query("insert into chat_messages (room_id, author_id, body) values ($1, $2, $3)", [room.id, other, text]);
          }
        }
      }
    }
    const people = await s.loadDirectory(sql);
    await s.pushToRoom(
      sql,
      { id: room.id, kind: room.kind, name: room.name },
      people.find((p) => p.id === viewer.personId),
      data.body,
      Boolean(photoId),
      mentioned,
      data.gif ? "Sent a GIF" : data.file ? `Sent ${data.file.name}` : "",
    );
    const rt = await realtime();
    await rt.pingUsers(await rt.roomAudience(sql, room.id), { type: "room", roomId: room.id });
    return { ok: true as const, id };
  });

export const chatDelete = createServerFn({ method: "POST" })
  .validator((input: unknown) => ({ id: Number((input as { id?: unknown })?.id) }))
  .handler(async ({ data }) => {
    const { requireChat } = await import("@/lib/chat/chat.server");
    const { viewer, sql } = await requireChat();
    if (!Number.isFinite(data.id)) throw new Error("Bad message");
    // Only the author hides their own message; Darin and Arun may hide any.
    const rows = await sql.query(
      `update chat_messages set deleted_at = now(), deleted_by = $2
        where id = $1 and deleted_at is null and ($3 or author_id = $2) returning room_id`,
      [data.id, viewer.personId, viewer.role === "owner"],
    );
    if (rows.length > 0) {
      const roomId = (rows[0] as { room_id: string }).room_id;
      const rt = await realtime();
      await rt.pingUsers(await rt.roomAudience(sql, roomId), { type: "room", roomId });
    }
    return { ok: rows.length > 0 };
  });

export const chatReact = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const d = (input ?? {}) as { id?: unknown; emoji?: unknown };
    const emoji = str(d.emoji, 8);
    if (!(CHAT_EMOJI as readonly string[]).includes(emoji)) throw new Error("Pick one of the reactions");
    return { id: Number(d.id), emoji };
  })
  .handler(async ({ data }) => {
    const s = await import("@/lib/chat/chat.server");
    const { viewer, sql } = await s.requireChat();
    if (!Number.isFinite(data.id)) throw new Error("Bad message");
    const found = await sql.query<{ room_id: string }>(
      "select room_id from chat_messages where id = $1 and deleted_at is null", [data.id]);
    const roomId = found[0]?.room_id;
    if (!roomId) return { ok: false as const };
    const rooms = await s.buildRooms(sql, viewer);
    if (!rooms.some((r) => r.id === roomId)) throw new Error("Not allowed");
    const removed = await sql.query(
      "delete from chat_reactions where message_id = $1 and person_id = $2 and emoji = $3 returning message_id",
      [data.id, viewer.personId, data.emoji]);
    if (removed.length === 0) {
      await sql.query(
        "insert into chat_reactions (message_id, person_id, emoji) values ($1, $2, $3) on conflict do nothing",
        [data.id, viewer.personId, data.emoji]);
    }
    await sql.query("update chat_messages set touched_at = now() where id = $1", [data.id]);
    const rt = await realtime();
    await rt.pingUsers(await rt.roomAudience(sql, roomId), { type: "room", roomId });
    return { ok: true as const };
  });

export const chatSearch = createServerFn({ method: "POST" })
  .validator((input: unknown) => ({ q: str((input as { q?: unknown })?.q, 80).trim() }))
  .handler(async ({ data }): Promise<ChatSearchHit[]> => {
    if (data.q.length < 2) return [];
    const s = await import("@/lib/chat/chat.server");
    const { viewer, sql } = await s.requireChat();
    const rooms = await s.buildRooms(sql, viewer);
    if (rooms.length === 0) return [];
    const people = await s.loadDirectory(sql);
    const like = "%" + data.q.replace(/[\\%_]/g, (c) => "\\" + c) + "%";
    const rows = await sql.query<{ id: number; room_id: string; author_id: string; body: string; created_at: string }>(
      `select id, room_id, author_id, body, created_at from chat_messages
        where room_id = any($1::text[]) and deleted_at is null and body ilike $2
        order by id desc limit 40`,
      [rooms.map((r) => r.id), like],
    );
    const byId = new Map(rooms.map((r) => [r.id, r]));
    return rows.map((r) => {
      const room = byId.get(r.room_id)!;
      const title = room.kind === "dm"
        ? room.members.filter((m) => m !== viewer.personId).map((m) => people.find((p) => p.id === m)?.name ?? m).join(" & ") || "Direct message"
        : room.name;
      return {
        id: Number(r.id),
        roomId: r.room_id,
        roomTitle: title,
        authorId: r.author_id,
        text: r.body.slice(0, 160),
        createdAt: new Date(r.created_at).toISOString(),
      };
    });
  });

export const chatRead = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const d = (input ?? {}) as { roomId?: unknown; upTo?: unknown };
    return { roomId: str(d.roomId, 200), upTo: Number(d.upTo) || 0 };
  })
  .handler(async ({ data }) => {
    const { requireChat } = await import("@/lib/chat/chat.server");
    const { viewer, sql } = await requireChat();
    await sql.query(
      `update chat_members set last_read_id = greatest(last_read_id, $3)
        where room_id = $1 and person_id = $2`,
      [data.roomId, viewer.personId, data.upTo],
    );
    // Direct messages show "Seen", so tell the other person their screen should refresh.
    const room = await sql.query<{ kind: string }>("select kind from chat_rooms where id = $1", [data.roomId]);
    if (room[0]?.kind === "dm") {
      const rt = await realtime();
      await rt.pingUsers(await rt.roomAudience(sql, data.roomId), { type: "room", roomId: data.roomId });
    }
    return { ok: true as const };
  });

export const chatOpenDm = createServerFn({ method: "POST" })
  .validator((input: unknown) => ({ personId: str((input as { personId?: unknown })?.personId, 100) }))
  .handler(async ({ data }) => {
    const { requireChat, loadDirectory } = await import("@/lib/chat/chat.server");
    const { viewer, sql } = await requireChat();
    const people = await loadDirectory(sql);
    if (!people.some((p) => p.id === data.personId) || data.personId === viewer.personId) {
      throw new Error("Pick someone else");
    }
    const [a, b] = [viewer.personId, data.personId].sort();
    const id = `dm_${a}__${b}`;
    await sql.query(
      "insert into chat_rooms (id, kind, name, audience, created_by) values ($1, 'dm', null, 'members', $2) on conflict (id) do nothing",
      [id, viewer.personId],
    );
    for (const pid of [a, b]) {
      await sql.query(
        "insert into chat_members (room_id, person_id) values ($1, $2) on conflict (room_id, person_id) do nothing",
        [id, pid],
      );
    }
    return { roomId: id };
  });

export const chatCreateRoom = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const d = (input ?? {}) as { kind?: unknown; name?: unknown; audience?: unknown; members?: unknown };
    const kind = d.kind === "channel" ? "channel" : "group";
    const name = str(d.name, 60).trim();
    if (!name) throw new Error("Give it a name");
    const members = Array.isArray(d.members) ? d.members.map((m) => str(m, 100)).filter(Boolean).slice(0, 50) : [];
    return { kind, name, audience: d.audience === "managers" ? "managers" : "everyone", members } as const;
  })
  .handler(async ({ data }) => {
    const { requireChat, loadDirectory } = await import("@/lib/chat/chat.server");
    const { viewer, sql } = await requireChat();
    if (data.kind === "channel" && viewer.role !== "owner") throw new Error("Not allowed");
    const people = await loadDirectory(sql);
    const known = new Set(people.map((p) => p.id));
    const id = `${data.kind === "channel" ? "ch" : "gr"}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    await sql.query(
      "insert into chat_rooms (id, kind, name, audience, created_by) values ($1, $2, $3, $4, $5)",
      [id, data.kind, data.name, data.kind === "channel" ? data.audience : "members", viewer.personId],
    );
    if (data.kind === "group") {
      const everyone = new Set([viewer.personId, ...data.members.filter((m) => known.has(m))]);
      for (const pid of everyone) {
        await sql.query("insert into chat_members (room_id, person_id) values ($1, $2) on conflict do nothing", [id, pid]);
      }
    }
    return { roomId: id };
  });

export const chatPresence = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const s = (input as { status?: unknown })?.status;
    const status = s === "offline" || s === "under_car" || s === "with_client" ? s : "online";
    return { status } as const;
  })
  .handler(async ({ data }) => {
    const { requireChat } = await import("@/lib/chat/chat.server");
    const { viewer, sql } = await requireChat();
    await sql.query(
      `insert into chat_presence (person_id, status, signed_in_day, last_seen)
       values ($1, $2, (now() at time zone 'America/Los_Angeles')::date, now())
       on conflict (person_id) do update set status = $2,
         signed_in_day = (now() at time zone 'America/Los_Angeles')::date, last_seen = now()`,
      [viewer.personId, data.status],
    );
    await (await realtime()).pingEveryone({ type: "presence" });
    return { ok: true as const };
  });

export const chatAway = createServerFn({ method: "POST" })
  .validator((input: unknown) => ({ away: str((input as { away?: unknown })?.away, 80).trim() }))
  .handler(async ({ data }) => {
    const { requireChat } = await import("@/lib/chat/chat.server");
    const { viewer, sql } = await requireChat();
    await sql.query(
      `insert into chat_presence (person_id, away_message, last_seen) values ($1, $2, now())
       on conflict (person_id) do update set away_message = $2, last_seen = now()`,
      [viewer.personId, data.away || null],
    );
    await (await realtime()).pingEveryone({ type: "presence" });
    return { ok: true as const };
  });

export const chatTyping = createServerFn({ method: "POST" })
  .validator((input: unknown) => ({ roomId: str((input as { roomId?: unknown })?.roomId, 200) }))
  .handler(async ({ data }) => {
    const { requireChat } = await import("@/lib/chat/chat.server");
    const { viewer, sql } = await requireChat();
    await sql.query(
      `insert into chat_presence (person_id, last_seen, typing_room, typing_at) values ($1, now(), $2, now())
       on conflict (person_id) do update set last_seen = now(), typing_room = $2, typing_at = now()`,
      [viewer.personId, data.roomId],
    );
    const rt = await realtime();
    await rt.pingUsers((await rt.roomAudience(sql, data.roomId)).filter((id) => id !== viewer.personId), { type: "typing", roomId: data.roomId });
    return { ok: true as const };
  });

export const chatSetAvatar = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const avatar = (input as { avatar?: unknown })?.avatar;
    if (avatar !== null && (typeof avatar !== "string" || !avatar.startsWith("data:image/") || avatar.length > 40_000)) {
      throw new Error("Picture is too large");
    }
    return { avatar: avatar as string | null };
  })
  .handler(async ({ data }) => {
    const { requireChat } = await import("@/lib/chat/chat.server");
    const { viewer, sql } = await requireChat();
    await sql.query(
      `insert into chat_profiles (person_id, avatar, updated_at) values ($1, $2, now())
       on conflict (person_id) do update set avatar = $2, updated_at = now()`,
      [viewer.personId, data.avatar],
    );
    await (await realtime()).pingEveryone({ type: "presence" });
    return { ok: true as const };
  });

/** One photo's picture. Photos load on demand so polling stays small. */
export const chatPhoto = createServerFn({ method: "POST" })
  .validator((input: unknown) => ({ id: str((input as { id?: unknown })?.id, 100) }))
  .handler(async ({ data }) => {
    const s = await import("@/lib/chat/chat.server");
    const { viewer, sql } = await s.requireChat();
    const rows = await sql.query<{ data: string; expired_at: string | null; room_id: string }>(
      `select p.data, p.expired_at, m.room_id
         from chat_photos p join chat_messages m on m.photo_id = p.id where p.id = $1 limit 1`,
      [data.id],
    );
    const row = rows[0];
    if (!row || row.expired_at || !row.data) return { data: "" };
    const rooms = await s.buildRooms(sql, viewer);
    if (!rooms.some((r) => r.id === row.room_id)) return { data: "" };
    return { data: row.data };
  });

export const chatKeepPhoto = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const d = (input ?? {}) as { id?: unknown; keep?: unknown };
    return { id: str(d.id, 100), keep: d.keep !== false };
  })
  .handler(async ({ data }) => {
    const { requireChatOwner } = await import("@/lib/chat/chat.server");
    const { viewer, sql } = await requireChatOwner();
    await sql.query("update chat_photos set keep = $2, kept_by = $3 where id = $1 and expired_at is null", [
      data.id,
      data.keep,
      data.keep ? viewer.personId : null,
    ]);
    return { ok: true as const };
  });

export const chatMute = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const d = (input ?? {}) as { roomId?: unknown; muted?: unknown };
    return { roomId: str(d.roomId, 200), muted: d.muted === true };
  })
  .handler(async ({ data }) => {
    const { requireChat } = await import("@/lib/chat/chat.server");
    const { viewer, sql } = await requireChat();
    // A person (direct message) can never be muted; only channels and group chats.
    await sql.query("update chat_members set muted = $3 where room_id = $1 and person_id = $2 and room_id in (select id from chat_rooms where kind <> 'dm')", [
      data.roomId,
      viewer.personId,
      data.muted,
    ]);
    return { ok: true as const };
  });

export const chatSettingsGet = createServerFn({ method: "GET" }).handler(async (): Promise<ChatSettings> => {
  const s = await import("@/lib/chat/chat.server");
  const { sql } = await s.requireChatOwner();
  const access = await sql.query<{ person_id: string }>("select person_id from chat_access order by added_at");
  return {
    meetUrl: await s.getSetting(sql, "meet_url", ""),
    pushPreview: (await s.getSetting(sql, "push_preview", "full")) === "neutral" ? "neutral" : "full",
    everyone: (await s.getSetting(sql, "everyone", "false")) === "true",
    access: access.map((a) => a.person_id),
  };
});

export const chatSettingsSave = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const d = (input ?? {}) as Record<string, unknown>;
    const meetUrl = typeof d.meetUrl === "string" ? d.meetUrl.trim().slice(0, 300) : undefined;
    if (meetUrl && !/^https:\/\//i.test(meetUrl)) throw new Error("The meeting link must start with https://");
    return {
      meetUrl,
      pushPreview: d.pushPreview === "neutral" ? "neutral" : d.pushPreview === "full" ? "full" : undefined,
      everyone: typeof d.everyone === "boolean" ? d.everyone : undefined,
      addAccess: typeof d.addAccess === "string" ? d.addAccess.slice(0, 100) : undefined,
      removeAccess: typeof d.removeAccess === "string" ? d.removeAccess.slice(0, 100) : undefined,
    };
  })
  .handler(async ({ data }) => {
    const s = await import("@/lib/chat/chat.server");
    const { viewer, sql } = await s.requireChatOwner();
    if (data.meetUrl !== undefined) await s.setSetting(sql, "meet_url", data.meetUrl);
    if (data.pushPreview) await s.setSetting(sql, "push_preview", data.pushPreview);
    if (data.everyone !== undefined) await s.setSetting(sql, "everyone", data.everyone ? "true" : "false");
    if (data.addAccess) {
      await sql.query(
        "insert into chat_access (person_id, added_by) values ($1, $2) on conflict (person_id) do nothing",
        [data.addAccess, viewer.personId],
      );
    }
    // Darin always keeps access so he cannot lock himself out.
    if (data.removeAccess && data.removeAccess !== "darin") {
      await sql.query("delete from chat_access where person_id = $1", [data.removeAccess]);
    }
    return { ok: true as const };
  });

export const chatPushSubscribe = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const d = (input ?? {}) as { endpoint?: unknown; p256dh?: unknown; auth?: unknown };
    const endpoint = str(d.endpoint, 1000);
    const p256dh = str(d.p256dh, 300);
    const auth = str(d.auth, 100);
    if (!endpoint.startsWith("https://") || !p256dh || !auth) throw new Error("Bad subscription");
    return { endpoint, p256dh, auth };
  })
  .handler(async ({ data }) => {
    const { requireChat } = await import("@/lib/chat/chat.server");
    const { viewer, sql } = await requireChat();
    await sql.query(
      `insert into chat_push (endpoint, person_id, p256dh, auth) values ($1, $2, $3, $4)
       on conflict (endpoint) do update set person_id = $2, p256dh = $3, auth = $4`,
      [data.endpoint, viewer.personId, data.p256dh, data.auth],
    );
    return { ok: true as const };
  });

export const chatPushUnsubscribe = createServerFn({ method: "POST" })
  .validator((input: unknown) => ({ endpoint: str((input as { endpoint?: unknown })?.endpoint, 1000) }))
  .handler(async ({ data }) => {
    const { requireChat } = await import("@/lib/chat/chat.server");
    const { viewer, sql } = await requireChat();
    await sql.query("delete from chat_push where endpoint = $1 and person_id = $2", [data.endpoint, viewer.personId]);
    return { ok: true as const };
  });

/** A listen-only pass for the real-time connection; null when real-time isn't set up. */
export const chatRealtimeToken = createServerFn({ method: "POST" }).handler(async () => {
  const { requireChat } = await import("@/lib/chat/chat.server");
  const { viewer } = await requireChat();
  const token = await (await realtime()).createToken(viewer.personId);
  return { token: (token ?? null) as Record<string, unknown> | null };
});

/** Edit your own message. Mentions are recomputed; the message shows "(edited)". */
export const chatEdit = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const d = (input ?? {}) as { id?: unknown; body?: unknown };
    const body = str(d.body, 2000).trim();
    if (!body) throw new Error("A message can't be empty");
    return { id: Number(d.id), body };
  })
  .handler(async ({ data }) => {
    const s = await import("@/lib/chat/chat.server");
    const { viewer, sql } = await s.requireChat();
    const directory = await s.loadDirectory(sql);
    const mentioned = s.findMentions(data.body, directory).filter((id) => id !== viewer.personId);
    const rows = await sql.query<{ room_id: string }>(
      `update chat_messages set body = $3, mentions = $4, edited_at = now(), touched_at = now()
        where id = $1 and author_id = $2 and deleted_at is null returning room_id`,
      [data.id, viewer.personId, data.body, mentioned.length ? `,${mentioned.join(",")},` : ""],
    );
    if (rows[0]) {
      const rt = await realtime();
      await rt.pingUsers(await rt.roomAudience(sql, rows[0].room_id), { type: "room", roomId: rows[0].room_id });
    }
    return { ok: rows.length > 0 };
  });

/** Darin and Arun pin or unpin a message in any room they can see. */
export const chatPin = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const d = (input ?? {}) as { id?: unknown; pinned?: unknown };
    return { id: Number(d.id), pinned: d.pinned !== false };
  })
  .handler(async ({ data }) => {
    const { requireChatOwner } = await import("@/lib/chat/chat.server");
    const { viewer, sql } = await requireChatOwner();
    const rows = await sql.query<{ room_id: string }>(
      `update chat_messages set pinned_at = case when $2 then now() else null end,
              pinned_by = case when $2 then $3 else null end, touched_at = now()
        where id = $1 and deleted_at is null returning room_id`,
      [data.id, data.pinned, viewer.personId],
    );
    if (rows[0]) {
      const rt = await realtime();
      await rt.pingUsers(await rt.roomAudience(sql, rows[0].room_id), { type: "room", roomId: rows[0].room_id });
    }
    return { ok: rows.length > 0 };
  });

/** One attached file, loaded on demand like photos. */
export const chatFile = createServerFn({ method: "POST" })
  .validator((input: unknown) => ({ id: str((input as { id?: unknown })?.id, 100) }))
  .handler(async ({ data }) => {
    const s = await import("@/lib/chat/chat.server");
    const { viewer, sql } = await s.requireChat();
    const rows = await sql.query<{ name: string; mime: string; data: string; expired_at: string | null; room_id: string }>(
      `select f.name, f.mime, f.data, f.expired_at, m.room_id
         from chat_files f join chat_messages m on m.file_id = f.id where f.id = $1 limit 1`,
      [data.id],
    );
    const row = rows[0];
    if (!row || row.expired_at || !row.data) return { data: "", name: "", mime: "" };
    const rooms = await s.buildRooms(sql, viewer);
    if (!rooms.some((r) => r.id === row.room_id)) return { data: "", name: "", mime: "" };
    return { data: row.data, name: row.name, mime: row.mime };
  });

/** GIPHY search, run on the server so the key never reaches the phone. */
export const chatGifSearch = createServerFn({ method: "POST" })
  .validator((input: unknown) => ({ q: str((input as { q?: unknown })?.q, 80).trim() }))
  .handler(async ({ data }): Promise<{ gifs: { id: string; url: string; preview: string }[] }> => {
    const { requireChat } = await import("@/lib/chat/chat.server");
    await requireChat();
    const key = process.env.GIPHY_API_KEY?.trim();
    if (!key) return { gifs: [] };
    const base = data.q ? "https://api.giphy.com/v1/gifs/search" : "https://api.giphy.com/v1/gifs/trending";
    const url = `${base}?api_key=${encodeURIComponent(key)}&limit=24&rating=g&lang=en${data.q ? `&q=${encodeURIComponent(data.q)}` : ""}`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (!res.ok) return { gifs: [] };
      const json = (await res.json()) as { data?: { id: string; images?: Record<string, { url?: string }> }[] };
      const gifs = (json.data ?? []).flatMap((g) => {
        const full = g.images?.fixed_height?.url ?? g.images?.original?.url;
        const preview = g.images?.fixed_width_small?.url ?? g.images?.fixed_height_small?.url ?? full;
        return full && preview && GIF_HOST.test(full) ? [{ id: g.id, url: full, preview }] : [];
      });
      return { gifs };
    } catch {
      return { gifs: [] };
    }
  });

/** Quiet hours (Pacific hours 0-23). Null turns them off. */
export const chatDndSave = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const d = (input ?? {}) as { start?: unknown; end?: unknown };
    const hour = (v: unknown) => (v === null || v === undefined || v === "" ? null : Math.min(23, Math.max(0, Math.floor(Number(v)))));
    const start = hour(d.start);
    const end = hour(d.end);
    return start === null || end === null || Number.isNaN(start) || Number.isNaN(end) ? { start: null, end: null } : { start, end };
  })
  .handler(async ({ data }) => {
    const { requireChat } = await import("@/lib/chat/chat.server");
    const { viewer, sql } = await requireChat();
    await sql.query(
      `insert into chat_profiles (person_id, dnd_start, dnd_end) values ($1, $2, $3)
       on conflict (person_id) do update set dnd_start = $2, dnd_end = $3`,
      [viewer.personId, data.start, data.end],
    );
    return { ok: true as const };
  });
