import { createServerFn } from "@tanstack/react-start";
import type {
  ChatBootstrap,
  ChatMessageInfo,
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
  await s.touchPresence(sql, viewer.personId);
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
    const s = await import("@/lib/chat/chat.server");
    const { viewer, sql } = await s.requireChat();
    await s.touchPresence(sql, viewer.personId);
    const rooms = await s.buildRooms(sql, viewer);
    let messages: ChatMessageInfo[] = [];
    let changed: ChatMessageInfo[] = [];
    let typing: string[] = [];
    if (data.roomId && rooms.some((r) => r.id === data.roomId)) {
      const out = await s.listMessages(sql, viewer, data.roomId, data.after, data.since);
      messages = out.messages;
      changed = out.changed;
      typing = await s.typingIn(sql, data.roomId, viewer.personId);
    }
    return {
      rooms,
      presence: await s.buildPresence(sql),
      messages,
      changed,
      typing,
      avatarStamp: await s.avatarStamp(sql),
      meetUrl: await s.getSetting(sql, "meet_url", ""),
      serverTime: new Date().toISOString(),
    };
  });

export const chatSend = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const d = (input ?? {}) as { roomId?: unknown; body?: unknown; photo?: unknown };
    const body = str(d.body, 2000).trim();
    const photo = typeof d.photo === "string" && d.photo.startsWith("data:image/") ? d.photo : "";
    if (photo.length > 300_000) throw new Error("Photo is too large");
    if (!body && !photo) throw new Error("Nothing to send");
    return { roomId: str(d.roomId, 200), body, photo };
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
    const rows = await sql.query<{ id: number }>(
      "insert into chat_messages (room_id, author_id, body, photo_id) values ($1, $2, $3, $4) returning id",
      [room.id, viewer.personId, data.body, photoId],
    );
    const id = Number(rows[0].id);
    await sql.query(
      `insert into chat_members (room_id, person_id, last_read_id) values ($1, $2, $3)
       on conflict (room_id, person_id) do update set last_read_id = greatest(chat_members.last_read_id, $3)`,
      [room.id, viewer.personId, id],
    );
    await sql.query("update chat_presence set typing_room = null where person_id = $1", [viewer.personId]);
    const people = await s.loadDirectory(sql);
    await s.pushToRoom(
      sql,
      { id: room.id, kind: room.kind, name: room.name },
      people.find((p) => p.id === viewer.personId),
      data.body,
      Boolean(photoId),
    );
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
        where id = $1 and deleted_at is null and ($3 or author_id = $2) returning id`,
      [data.id, viewer.personId, viewer.role === "owner"],
    );
    return { ok: rows.length > 0 };
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
    const d = (input ?? {}) as { status?: unknown; away?: unknown };
    return { status: d.status === "away" ? "away" : "online", away: str(d.away, 80) } as const;
  })
  .handler(async ({ data }) => {
    const { requireChat } = await import("@/lib/chat/chat.server");
    const { viewer, sql } = await requireChat();
    await sql.query(
      `insert into chat_presence (person_id, status, away_message, last_seen) values ($1, $2, $3, now())
       on conflict (person_id) do update set status = $2, away_message = $3, last_seen = now()`,
      [viewer.personId, data.status, data.status === "away" ? data.away : null],
    );
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
    await sql.query("update chat_members set muted = $3 where room_id = $1 and person_id = $2", [
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
