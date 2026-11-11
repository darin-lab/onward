import { useEffect, useMemo, useRef, useState } from "react";
import { useChat, startChat, stopChat, setOpen, openRoom, openDm, createRoom, sendMessage, deleteMessage,
  noteTyping, muteRoom, setStatus, setAway, compressPhoto, saveAvatar, enablePush, pushSupport, roomTitle, setSound } from "@/lib/chat/client";
import { chatKeepPhoto, chatPhoto, chatSettingsGet, chatSettingsSave } from "@/lib/chat/chat.functions";
import { useBoard } from "@/lib/board/store";
import type { ChatMessageInfo, ChatPerson, ChatRoomInfo, ChatSettings, ChatState } from "@/lib/chat/types";

const dot: Record<ChatState, string> = {
  online: "bg-green-500", under_car: "bg-sky-400", with_client: "bg-purple-500", offline: "bg-neutral-600",
};
const statusLabel: Record<ChatState, string> = {
  online: "Online", offline: "Offline", under_car: "Under a Car", with_client: "With a Client",
};

function Avatar({ person, size = 32 }: { person?: ChatPerson; size?: number }) {
  const src = useChat((s) => (person ? s.avatars[person.id] : undefined));
  const initials = (person?.name ?? "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const style = { width: size, height: size };
  return src ? (
    <img src={src} alt="" style={style} className="shrink-0 rounded-sm object-cover" />
  ) : (
    <span style={style} className="flex shrink-0 items-center justify-center rounded-sm bg-raised text-xs font-semibold text-muted">
      {initials}
    </span>
  );
}

/** The little yellow sticky note that means "this person left an away message". */
function PostIt({ text }: { text: string }) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" role="img" aria-label={`Away message: ${text}`} className="shrink-0">
      <title>{text}</title>
      <path d="M2 2h12v8l-4 4H2z" fill="#fef08a" stroke="#eab308" strokeWidth="0.8" />
      <path d="M10 14v-4h4" fill="#fde047" stroke="#eab308" strokeWidth="0.8" />
      <path d="M4.5 5.5h7M4.5 8h4" stroke="#ca8a04" strokeWidth="0.9" strokeLinecap="round" />
    </svg>
  );
}

function Dot({ id }: { id: string }) {
  const state = useChat((s) => s.presence[id]?.state ?? "offline");
  return <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${dot[state]}`} title={statusLabel[state]} />;
}

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const dayLabel = (iso: string) => new Date(iso).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });

export function ChatButton() {
  const status = useChat((s) => s.status);
  const open = useChat((s) => s.open);
  const unread = useChat((s) => s.rooms.reduce((n, r) => n + (r.muted ? 0 : r.unread), 0));
  useEffect(() => { void startChat(); return () => stopChat(); }, []);
  useEffect(() => { document.title = unread > 0 ? `(${unread}) Driven Onward` : document.title.replace(/^\(\d+\) /, ""); }, [unread]);
  const viewAs = useBoard((s) => s.viewAs);
  if (!status?.allowed || viewAs) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(!open)}
        className="relative rounded-sm border border-white/15 px-3 py-1.5 text-xs uppercase tracking-wide text-ink hover:bg-raised">
        Chat
        {unread > 0 ? (
          <span className="absolute -right-2 -top-2 min-w-5 rounded-full bg-honey px-1.5 text-center text-[11px] font-bold leading-5 text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>
      <ChatPopup />
      {open ? <ChatPanel /> : null}
    </>
  );
}

function ChatPopup() {
  const popup = useChat((s) => s.popup);
  const open = useChat((s) => s.open);
  useEffect(() => {
    if (!popup) return;
    const t = setTimeout(() => useChat.setState({ popup: null }), 7000);
    return () => clearTimeout(t);
  }, [popup]);
  if (!popup || open) return null;
  return (
    <button type="button" onClick={() => void openRoom(popup.roomId)}
      className="fixed bottom-5 right-5 z-50 max-w-xs rounded-sm border border-white/15 bg-surface p-3 text-left shadow-lg">
      <p className="text-[11px] uppercase tracking-wide text-honey">{popup.title}</p>
      <p className="mt-1 text-sm text-ink">{popup.text}</p>
    </button>
  );
}

function ChatPanel() {
  const activeRoom = useChat((s) => s.activeRoom);
  const [view, setView] = useState<"main" | "new" | "settings">("main");
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-canvas sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[400px] sm:border-l sm:border-white/10">
      <div className="h-1 bg-honey" />
      {view === "new" ? <NewRoom onDone={() => setView("main")} /> :
        view === "settings" ? <Settings onDone={() => setView("main")} /> :
        activeRoom ? <RoomView /> : <BuddyList onNew={() => setView("new")} onSettings={() => setView("settings")} />}
    </div>
  );
}

function Header({ title, onBack, right }: { title: string; onBack?: () => void; right?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 border-b border-white/10 px-3 py-3">
      {onBack ? <button type="button" onClick={onBack} className="px-2 text-lg text-muted hover:text-ink" aria-label="Back">‹</button> : null}
      <h2 className="min-w-0 flex-1 truncate pr-3 font-display text-lg uppercase italic text-ink">{title}</h2>
      {right}
      <button type="button" onClick={() => setOpen(false)} className="px-2 text-lg text-muted hover:text-ink" aria-label="Close chat">✕</button>
    </div>
  );
}

function BuddyList({ onNew, onSettings }: { onNew: () => void; onSettings: () => void }) {
  const boot = useChat((s) => s.boot)!;
  const rooms = useChat((s) => s.rooms);
  const presence = useChat((s) => s.presence);
  const sound = useChat((s) => s.sound);
  const me = boot.me;
  const owner = me.role === "owner";
  const people = boot.people;
  const mine = (r: ChatRoomInfo) => r.members.includes(me.personId);
  const channels = rooms.filter((r) => r.kind === "channel");
  const groups = rooms.filter((r) => r.kind === "group" && mine(r));
  const dms = rooms.filter((r) => r.kind === "dm" && mine(r) && r.last);
  const others = rooms.filter((r) => r.kind !== "channel" && !mine(r));
  const owners = people.filter((p) => p.role === "owner");
  const shops = useMemo(() => {
    const map = new Map<string, ChatPerson[]>();
    for (const p of people.filter((x) => x.role !== "owner")) {
      const key = p.shopName || "Other";
      map.set(key, [...(map.get(key) ?? []), p]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [people]);
  // Each shop lists its manager first, then technicians in roster order, whatever their status.
  const byRole = (list: ChatPerson[]) => [...list.filter((p) => p.role === "manager"), ...list.filter((p) => p.role !== "manager")];
  const rank = (id: string) => ((presence[id]?.state ?? "offline") === "offline" ? 2 : presence[id]?.state === "online" ? 0 : 1);
  const sorted = (list: ChatPerson[]) => [...list].sort((a, b) => rank(a.id) - rank(b.id) || a.name.localeCompare(b.name));
  const roomRow = (r: ChatRoomInfo, prefix = "") => (
    <button key={r.id} type="button" onClick={() => void openRoom(r.id)}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-raised">
      <span className="min-w-0 flex-1 truncate text-ink">{prefix}{roomTitle(r, me.personId, boot.people)}</span>
      {r.muted ? <span className="text-[10px] text-muted">muted</span> : null}
      {r.unread > 0 ? <span className="rounded-full bg-honey px-1.5 text-[11px] font-bold text-white">{r.unread}</span> : null}
    </button>
  );
  const group = (label: string, body: React.ReactNode) => (
    <section className="py-2">
      <p className="px-3 pb-1 text-left text-[11px] font-bold uppercase tracking-widest text-ink">{label}</p>
      {body}
    </section>
  );
  const personRow = (p: ChatPerson) => {
    const self = p.id === me.personId;
    return (
      <button key={p.id} type="button" disabled={self} onClick={() => void openDm(p.id)}
        className={`flex w-full items-center gap-2 px-3 py-1.5 text-left ${self ? "cursor-default" : "hover:bg-raised"}`}>
        <Avatar person={p} size={28} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-sm text-ink">{p.name}{self ? " (you)" : ""}</span>
            <Dot id={p.id} />
            {presence[p.id]?.away ? <PostIt text={presence[p.id].away} /> : null}
          </span>
          <span className="block truncate text-[11px] text-muted">
            {presence[p.id]?.state === "under_car" || presence[p.id]?.state === "with_client"
              ? statusLabel[presence[p.id].state]
              : p.title}
          </span>
        </span>
      </button>
    );
  };
  const folder = (label: string, list: ChatPerson[], fixed = false) => (
    <PeopleFolder key={label} label={label} list={fixed ? list : sorted(list)} render={personRow} />
  );
  // Management keeps a set order (Arun, then Darin) whatever their status.
  const management = ["arun", "darin"].map((id) => owners.find((p) => p.id === id)).filter((p): p is ChatPerson => Boolean(p));
  return (
    <>
      <Header title="Driven Chat" right={
        <>
          <button type="button" onClick={onNew} className="shrink-0 rounded-sm border border-white/15 px-2 py-1 text-xs text-ink hover:bg-raised">+ New</button>
          {owner ? <button type="button" onClick={onSettings} className="px-2 text-sm text-muted hover:text-ink" aria-label="Chat settings">⚙</button> : null}
        </>
      } />
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <ProfilePicture />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-ink">{me.name}</p>
          <select value={presence[me.personId]?.state ?? "online"} onChange={(e) => void setStatus(e.target.value as ChatState)}
            className="mt-0.5 rounded-sm border border-white/15 bg-surface px-1.5 py-0.5 text-xs text-ink" aria-label="Your status">
            <option value="online">Online</option>
            <option value="under_car">Under a Car</option>
            <option value="with_client">With a Client</option>
            <option value="offline">Offline</option>
          </select>
          <AwayInput value={presence[me.personId]?.away ?? ""} />
        </div>
        <button type="button" onClick={() => setSound(!sound)} className="text-xs text-muted hover:text-ink">{sound ? "Sound on" : "Sound off"}</button>
      </div>
      <NotifyCard />
      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        {group("Channels", channels.map((r) => roomRow(r, "# ")))}
        {groups.length ? group("Group chats", groups.map((r) => roomRow(r))) : null}
        {dms.length ? group("Recent direct messages", dms.map((r) => roomRow(r))) : null}
        {folder("Management", management, true)}
        {shops.map(([shop, list]) => folder(shop, byRole(list), true))}
        {owner && others.length ? group("All conversations (read-only)", others.map((r) => roomRow(r)))
        : null}
      </div>
      <p className="border-t border-white/10 px-3 py-2 text-[11px] text-muted">
        Messages are company records.
      </p>
    </>
  );
}

function PeopleFolder({ label, list, render }: { label: string; list: ChatPerson[]; render: (p: ChatPerson) => React.ReactNode }) {
  const presence = useChat((s) => s.presence);
  const [open, setOpen] = useState(true);
  const online = list.filter((p) => (presence[p.id]?.state ?? "offline") !== "offline").length;
  return (
    <section className="py-1">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-raised">
        <span className="w-3 text-[10px] text-muted">{open ? "▼" : "▶"}</span>
        <span className="text-[11px] font-bold uppercase tracking-widest text-ink">{label}</span>
        <span className="text-[11px] text-muted">({online}/{list.length})</span>
      </button>
      {open ? list.map(render) : null}
    </section>
  );
}

function AwayInput({ value }: { value: string }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const commit = () => { if (text.trim() !== value) void setAway(text); };
  return (
    <input value={text} maxLength={80} placeholder="Away message (optional)" aria-label="Away message"
      onChange={(e) => setText(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      className="mt-1 w-full rounded-sm border border-white/15 bg-surface px-1.5 py-0.5 text-xs text-ink" />
  );
}

function ProfilePicture() {
  const boot = useChat((s) => s.boot)!;
  const has = useChat((s) => Boolean(s.avatars[boot.me.personId]));
  const me = boot.people.find((p) => p.id === boot.me.personId);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const pick = (f?: File) => {
    if (!f) return;
    setBusy(true);
    void saveAvatar(f).finally(() => setBusy(false));
  };
  return (
    <div className="flex w-14 shrink-0 flex-col items-center gap-0.5">
      <button type="button" onClick={() => input.current?.click()} title="Change your picture" className="relative">
        <Avatar person={me} size={40} />
        <span className="absolute -bottom-1 -right-1 rounded-full bg-raised px-1 text-[10px] leading-4 text-ink">{busy ? "…" : "✎"}</span>
      </button>
      <button type="button" onClick={() => input.current?.click()} className="text-[10px] text-muted underline-offset-2 hover:underline">
        {has ? "Change" : "Add photo"}
      </button>
      {has ? (
        <button type="button" onClick={() => void saveAvatar(null)} className="text-[10px] text-muted underline-offset-2 hover:underline">Remove</button>
      ) : null}
      <input ref={input} type="file" accept="image/*" hidden
        onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
    </div>
  );
}

function NotifyCard() {
  const [state, setState] = useState<"idle" | "on" | "denied" | "unavailable">("idle");
  const support = pushSupport();
  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") setState("on");
  }, []);
  if (state === "on") return null;
  return (
    <div className="border-b border-white/10 bg-surface px-3 py-2 text-xs text-muted">
      {support === "needs-home-screen" ? (
        <>On iPhone, notifications only work once Driven Onward is on your Home Screen: tap Share, then <b className="text-ink">Add to Home Screen</b>, open it from there, and come back here.</>
      ) : support === "unsupported" ? (
        <>This browser can't show notifications. Chrome, Edge, Safari or the Home Screen app can.</>
      ) : (
        <div className="flex items-center gap-2">
          <span className="flex-1">Get a notification on this device when someone messages you.</span>
          <button type="button" className="rounded-sm bg-honey px-2 py-1 text-white"
            onClick={() => void enablePush().then(setState)}>Turn on</button>
        </div>
      )}
      {state === "denied" ? <p className="mt-1 text-honey">Notifications are blocked. Allow them in this site's browser settings, then try again.</p> : null}
      {state === "unavailable" && support === "ok" ? <p className="mt-1 text-honey">Notifications aren't set up on the server yet.</p> : null}
    </div>
  );
}

const photoCache = new Map<string, string>();
function Photo({ m, owner }: { m: ChatMessageInfo; owner: boolean }) {
  const [src, setSrc] = useState(photoCache.get(m.photoId ?? "") ?? "");
  const [big, setBig] = useState(false);
  const [kept, setKept] = useState(m.kept);
  useEffect(() => {
    if (!m.photoId || m.photoState !== "ok" || src) return;
    void chatPhoto({ data: { id: m.photoId } }).then((r) => { photoCache.set(m.photoId!, r.data); setSrc(r.data); });
  }, [m.photoId, m.photoState, src]);
  if (!m.photoId) return null;
  if (m.photoState === "expired") return <p className="mt-1 text-xs italic text-muted">photo expired</p>;
  return (
    <div className="mt-1">
      {src ? <img src={src} alt="" onClick={() => setBig(true)} className="max-h-60 cursor-zoom-in rounded-sm" /> : <div className="h-24 w-32 animate-pulse rounded-sm bg-raised" />}
      {owner ? (
        <button type="button" className="mt-1 text-[11px] text-muted underline"
          onClick={() => { const next = !kept; setKept(next); void chatKeepPhoto({ data: { id: m.photoId!, keep: next } }); }}>
          {kept ? "Kept past 30 days (undo)" : "Keep past 30 days"}
        </button>
      ) : null}
      {big ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4" onClick={() => setBig(false)}>
          <img src={src} alt="" className="max-h-full max-w-full" />
        </div>
      ) : null}
    </div>
  );
}

function RoomView() {
  const boot = useChat((s) => s.boot)!;
  const rooms = useChat((s) => s.rooms);
  const roomId = useChat((s) => s.activeRoom)!;
  const messages = useChat((s) => s.messages);
  const typing = useChat((s) => s.typing);
  const meetUrl = useChat((s) => s.meetUrl);
  const room = rooms.find((r) => r.id === roomId);
  const me = boot.me;
  const owner = me.role === "owner";
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState("");
  const [busy, setBusy] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const person = (id: string) => boot.people.find((p) => p.id === id);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages.length, typing.length]);
  if (!room) return <Header title="Chat" onBack={() => void openRoom(null)} />;
  const title = roomTitle(room, me.personId, boot.people);
  const submit = async () => {
    if ((!text.trim() && !photo) || busy) return;
    setBusy("sending");
    try { await sendMessage(text.trim(), photo); setText(""); setPhoto(""); setBusy(""); }
    catch (e) { setBusy(e instanceof Error ? e.message : "Couldn't send"); }
  };
  return (
    <>
      <Header title={(room.kind === "channel" ? "# " : "") + title} onBack={() => void openRoom(null)}
        right={room.kind === "dm" ? undefined : (
          <button type="button" className="shrink-0 text-[11px] text-muted underline-offset-2 hover:underline"
            onClick={() => void muteRoom(room.id, !room.muted)}>{room.muted ? "Unmute" : "Mute"}</button>
        )} />
      {room.id === "all-managers" && meetUrl ? (
        <a href={meetUrl} target="_blank" rel="noreferrer" className="block bg-honey px-3 py-2 text-center text-sm font-semibold text-white">Join meeting</a>
      ) : null}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {messages.map((m, i) => {
          const a = person(m.authorId);
          const mineMsg = m.authorId === me.personId;
          const newDay = i === 0 || dayLabel(messages[i - 1].createdAt) !== dayLabel(m.createdAt);
          return (
            <div key={m.id}>
              {newDay ? <p className="mb-2 text-center text-[11px] uppercase tracking-widest text-muted">{dayLabel(m.createdAt)}</p> : null}
              <div className="flex gap-2">
                <Avatar person={a} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted"><span className="text-ink">{a?.name ?? m.authorId}</span> · {time(m.createdAt)}</p>
                  {m.deleted ? (
                    <>
                      <p className="whitespace-pre-wrap break-words text-sm text-muted line-through">{m.body || "(photo)"}</p>
                      <p className="text-[11px] italic text-muted">Deleted by {person(m.deletedBy ?? "")?.name ?? m.deletedBy}, {m.deletedAt ? time(m.deletedAt) : ""}</p>
                    </>
                  ) : (
                    <p className={`whitespace-pre-wrap break-words text-sm ${m.body.startsWith("Auto-response:") ? "italic text-muted" : "text-ink"}`}>{m.body}</p>
                  )}
                  {!m.deleted ? <Photo m={m} owner={owner} /> : null}
                  {!m.deleted && (mineMsg || owner) ? (
                    <button type="button" className="text-[11px] text-muted hover:text-honey"
                      onClick={() => { if (confirm("Delete this message for everyone?")) void deleteMessage(m.id); }}>Delete</button>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
        {typing.length ? <p className="text-xs italic text-muted">{typing.map((id) => person(id)?.name ?? "Someone").join(", ")} typing…</p> : null}
        <div ref={endRef} />
      </div>
      {room.canPost ? (
        <div className="border-t border-white/10 p-3">
          {photo ? (
            <div className="mb-2 flex items-center gap-2">
              <img src={photo} alt="" className="h-14 rounded-sm" />
              <button type="button" className="text-xs text-muted underline" onClick={() => setPhoto("")}>Remove</button>
            </div>
          ) : null}
          {busy && busy !== "sending" ? <p className="mb-1 text-xs text-honey">{busy}</p> : null}
          <div className="flex items-end gap-2">
            <button type="button" onClick={() => fileRef.current?.click()} className="px-1 pb-2 text-lg text-muted hover:text-ink" aria-label="Add photo">📷</button>
            <input ref={fileRef} type="file" accept="image/*" hidden
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void compressPhoto(f).then(setPhoto).catch((err) => setBusy(err.message)); }} />
            <textarea value={text} rows={1} maxLength={2000} placeholder="Type a message"
              onChange={(e) => { setText(e.target.value); noteTyping(); }}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void submit(); } }}
              className="max-h-28 min-w-0 flex-1 resize-none rounded-sm border border-white/15 bg-surface px-2 py-2 text-sm text-ink" />
            <button type="button" onClick={() => void submit()} disabled={busy === "sending"} className="rounded-sm bg-honey px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Send</button>
          </div>
        </div>
      ) : (
        <p className="border-t border-white/10 p-3 text-center text-xs text-muted">You're viewing this conversation. Only its members can post.</p>
      )}
    </>
  );
}

function NewRoom({ onDone }: { onDone: () => void }) {
  const boot = useChat((s) => s.boot)!;
  const owner = boot.me.role === "owner";
  const [kind, setKind] = useState<"group" | "channel">("group");
  const [name, setName] = useState("");
  const [audience, setAudience] = useState<"everyone" | "managers">("everyone");
  const [picked, setPicked] = useState<string[]>([]);
  const [err, setErr] = useState("");
  const people = boot.people.filter((p) => p.id !== boot.me.personId);
  return (
    <>
      <Header title="New chat" onBack={onDone} />
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3 text-sm">
        {owner ? (
          <div className="flex gap-2">
            {(["group", "channel"] as const).map((k) => (
              <button key={k} type="button" onClick={() => setKind(k)}
                className={`flex-1 rounded-sm border px-2 py-1.5 ${kind === k ? "border-honey text-ink" : "border-white/15 text-muted"}`}>
                {k === "group" ? "Group chat" : "Channel"}
              </button>
            ))}
          </div>
        ) : null}
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder={kind === "group" ? "Group name" : "Channel name"}
          className="w-full rounded-sm border border-white/15 bg-surface px-2 py-2 text-ink" />
        {kind === "channel" ? (
          <select value={audience} onChange={(e) => setAudience(e.target.value as "everyone" | "managers")}
            className="w-full rounded-sm border border-white/15 bg-surface px-2 py-2 text-ink">
            <option value="everyone">Everyone</option>
            <option value="managers">Managers and owners</option>
          </select>
        ) : (
          <div className="space-y-1">
            <p className="text-xs text-muted">Add people</p>
            {people.map((p) => (
              <label key={p.id} className="flex items-center gap-2 py-1">
                <input type="checkbox" checked={picked.includes(p.id)}
                  onChange={(e) => setPicked(e.target.checked ? [...picked, p.id] : picked.filter((x) => x !== p.id))} />
                <span className="text-ink">{p.name}</span>
                <span className="text-xs text-muted">{p.shopName || p.title}</span>
              </label>
            ))}
          </div>
        )}
        {err ? <p className="text-honey">{err}</p> : null}
      </div>
      <div className="border-t border-white/10 p-3">
        <button type="button" className="w-full rounded-sm bg-honey py-2 font-semibold text-white"
          onClick={() => {
            if (kind === "group" && picked.length === 0) return setErr("Pick at least one person.");
            void createRoom(kind, name, picked, audience).then(onDone).catch((e) => setErr(e instanceof Error ? e.message : "Couldn't create it"));
          }}>Create</button>
      </div>
    </>
  );
}

function Settings({ onDone }: { onDone: () => void }) {
  const boot = useChat((s) => s.boot)!;
  const [s, setS] = useState<ChatSettings | null>(null);
  const [meet, setMeet] = useState("");
  const [msg, setMsg] = useState("");
  const load = () => void chatSettingsGet().then((r) => { setS(r); setMeet(r.meetUrl); });
  useEffect(load, []);
  const save = (patch: Parameters<typeof chatSettingsSave>[0]["data"]) =>
    void chatSettingsSave({ data: patch }).then(() => { setMsg("Saved"); load(); }).catch((e) => setMsg(e instanceof Error ? e.message : "Couldn't save"));
  if (!s) return <Header title="Chat settings" onBack={onDone} />;
  const candidates = boot.people.filter((p) => !s.access.includes(p.id));
  return (
    <>
      <Header title="Chat settings" onBack={onDone} />
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-3 text-sm text-ink">
        <section>
          <p className="mb-1 text-xs uppercase tracking-widest text-muted">Meeting link (All Managers)</p>
          <div className="flex gap-2">
            <input value={meet} onChange={(e) => setMeet(e.target.value)} placeholder="https://meet.google.com/…"
              className="min-w-0 flex-1 rounded-sm border border-white/15 bg-surface px-2 py-1.5" />
            <button type="button" className="rounded-sm bg-honey px-3 text-white" onClick={() => save({ meetUrl: meet })}>Save</button>
          </div>
        </section>
        <section>
          <p className="mb-1 text-xs uppercase tracking-widest text-muted">Notification text</p>
          <select value={s.pushPreview} onChange={(e) => save({ pushPreview: e.target.value as "full" | "neutral" })}
            className="w-full rounded-sm border border-white/15 bg-surface px-2 py-2">
            <option value="full">Show who and what (lock screen)</option>
            <option value="neutral">Only "New message from …"</option>
          </select>
        </section>
        <section>
          <p className="mb-1 text-xs uppercase tracking-widest text-muted">Who can see Chat</p>
          <label className="flex items-center gap-2 pb-2">
            <input type="checkbox" checked={s.everyone} onChange={(e) => {
              if (!e.target.checked || confirm("Turn Chat on for everyone?")) save({ everyone: e.target.checked });
            }} />
            Everyone (launch switch)
          </label>
          {s.access.map((id) => (
            <div key={id} className="flex items-center justify-between py-0.5">
              <span>{boot.people.find((p) => p.id === id)?.name ?? id}</span>
              {id !== "darin" ? <button type="button" className="text-xs text-muted underline" onClick={() => save({ removeAccess: id })}>Remove</button> : null}
            </div>
          ))}
          <select value="" onChange={(e) => e.target.value && save({ addAccess: e.target.value })}
            className="mt-2 w-full rounded-sm border border-white/15 bg-surface px-2 py-2">
            <option value="">Add a person…</option>
            {candidates.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </section>
        {msg ? <p className="text-xs text-muted">{msg}</p> : null}
      </div>
    </>
  );
}
