// Browser side of Driven Chat: one store, adaptive polling, sounds, push.
import { create } from "zustand";
import {
  chatAway, chatBootstrap, chatCreateRoom, chatDelete, chatOpenDm, chatPoll, chatPresence, chatPushSubscribe,
  chatRead, chatSend, chatSetAvatar, chatStatus, chatTyping, chatMute,
} from "@/lib/chat/chat.functions";
import type { ChatState, ChatBootstrap, ChatMessageInfo, ChatPerson, ChatPresence, ChatRoomInfo, ChatStatus } from "@/lib/chat/types";

type Popup = { roomId: string; title: string; text: string } | null;

type State = {
  status: ChatStatus | null;
  boot: ChatBootstrap | null;
  rooms: ChatRoomInfo[];
  presence: ChatPresence;
  avatars: Record<string, string>;
  meetUrl: string;
  open: boolean;
  activeRoom: string | null;
  messages: ChatMessageInfo[];
  typing: string[];
  popup: Popup;
  sound: boolean;
  error: string;
};

export const useChat = create<State>(() => ({
  status: null, boot: null, rooms: [], presence: {}, avatars: {}, meetUrl: "",
  open: false, activeRoom: null, messages: [], typing: [], popup: null,
  sound: readSound(), error: "",
}));
const set = useChat.setState;
const get = useChat.getState;

function readSound() {
  try { return localStorage.getItem("chat-sound") !== "off"; } catch { return true; }
}
export function setSound(on: boolean) {
  try { localStorage.setItem("chat-sound", on ? "on" : "off"); } catch { /* ignore */ }
  set({ sound: on });
}

// ---------- sounds (browsers need one tap on the page before audio plays) ----------
const clips: Record<string, HTMLAudioElement> = {};
export function playSound(name: "signon" | "signoff" | "message" | "bell") {
  if (typeof Audio === "undefined" || !get().sound) return;
  try {
    const a = (clips[name] ??= new Audio(`/sounds/${name}.mp3`));
    a.currentTime = 0;
    void a.play().catch(() => undefined);
  } catch { /* ignore */ }
}

// ---------- polling ----------
let timer: ReturnType<typeof setTimeout> | null = null;
let started = false;
let lastId = 0;
let since: string | null = null;
let seeded = false;
let lastActivity = Date.now();
void lastActivity;
let inFlight = false;

function visible() { return typeof document !== "undefined" && document.visibilityState === "visible"; }

function schedule() {
  if (timer) clearTimeout(timer);
  if (!started || !visible()) return;
  const s = get();
  timer = setTimeout(() => void poll(), s.open && s.activeRoom ? 4000 : 15000);
}

export function roomTitle(room: ChatRoomInfo, meId: string, people: ChatPerson[]) {
  if (room.kind !== "dm") return room.name;
  const others = room.members.filter((m) => m !== meId);
  const names = (others.length ? others : room.members).map((m) => people.find((p) => p.id === m)?.name ?? m);
  return names.join(" & ");
}

function personName(id: string) {
  return get().boot?.people.find((p) => p.id === id)?.name ?? "Someone";
}

async function poll() {
  if (inFlight) return;
  inFlight = true;
  try {
    const { activeRoom } = get();
    const res = await chatPoll({ data: { roomId: activeRoom, after: lastId, since } });
    const prev = get();
    // Sign on / off sounds
    if (seeded) {
      for (const [id, p] of Object.entries(res.presence)) {
        if (id === prev.boot?.me.personId) continue;
        const before = prev.presence[id]?.state ?? "offline";
        if (before === "offline" && p.state !== "offline") playSound("signon");
        else if (before !== "offline" && p.state === "offline") playSound("signoff");
      }
    }
    // New messages in rooms other than the one being read
    if (seeded) {
      for (const room of res.rooms) {
        const old = prev.rooms.find((r) => r.id === room.id);
        const reading = prev.open && prev.activeRoom === room.id && visible();
        if (old && room.unread > old.unread && !reading && !room.muted && room.last) {
          playSound("message");
          set({
            popup: {
              roomId: room.id,
              title: roomTitle(room, prev.boot?.me.personId ?? "", prev.boot?.people ?? []),
              text: `${personName(room.last.authorId)}: ${room.last.text || "Sent a photo"}`.slice(0, 120),
            },
          });
        }
      }
    }
    let messages = prev.messages;
    if (activeRoom && activeRoom === get().activeRoom) {
      if (res.messages.length) {
        const have = new Set(messages.map((m) => m.id));
        messages = [...messages, ...res.messages.filter((m) => !have.has(m.id))];
        lastId = Math.max(lastId, ...res.messages.map((m) => m.id));
        const fromOthers = res.messages.some((m) => m.authorId !== prev.boot?.me.personId);
        if (fromOthers && seeded) playSound("message");
      }
      if (res.changed.length) {
        const map = new Map(res.changed.map((m) => [m.id, m]));
        messages = messages.map((m) => map.get(m.id) ?? m);
        if (prev.boot?.me.role !== "owner") messages = messages.filter((m) => !m.deleted);
      }
    }
    since = res.serverTime;
    if (res.avatarStamp !== avatarStampSeen) {
      if (avatarStampSeen) void refreshAvatars();
      avatarStampSeen = res.avatarStamp;
    }
    set({ rooms: res.rooms, presence: res.presence, messages, typing: res.typing, meetUrl: res.meetUrl, error: "" });
    seeded = true;
    // Mark the open room read
    const s = get();
    if (s.open && s.activeRoom && visible() && lastId > 0) {
      const room = s.rooms.find((r) => r.id === s.activeRoom);
      if (room && room.unread > 0) void chatRead({ data: { roomId: s.activeRoom, upTo: lastId } });
    }
  } catch {
    set({ error: "Can't reach chat right now." });
  } finally {
    inFlight = false;
    schedule();
  }
}
let avatarStampSeen = "";

async function refreshAvatars() {
  try {
    const b = await chatBootstrap();
    set({ avatars: b.avatars });
  } catch { /* ignore */ }
}

function onVisibility() {
  if (visible()) { lastActivity = Date.now(); void poll(); }
  else if (timer) clearTimeout(timer);
}
function onActivity() {
  lastActivity = Date.now();
}
function onWorkerMessage(e: MessageEvent) {
  if (e.data?.type === "open-room") void openRoom(String(e.data.roomId));
}

export async function startChat() {
  if (started) return;
  started = true;
  try {
    const status = await chatStatus();
    set({ status });
    if (!status.allowed) { started = false; return; }
    const boot = await chatBootstrap();
    avatarStampSeen = "";
    set({ boot, rooms: boot.rooms, presence: boot.presence, avatars: boot.avatars, meetUrl: boot.meetUrl });
    since = boot.serverTime;
    seeded = true;
    window.addEventListener("pointerdown", onActivity);
    window.addEventListener("keydown", onActivity);
    document.addEventListener("visibilitychange", onVisibility);
    navigator.serviceWorker?.addEventListener("message", onWorkerMessage);
    const wanted = new URLSearchParams(location.search).get("chat");
    if (wanted) void openRoom(wanted);
    // If notifications were already allowed, make sure this device is subscribed.
    if (typeof Notification !== "undefined" && Notification.permission === "granted") void enablePush(true);
    schedule();
  } catch {
    started = false;
  }
}

export function stopChat() {
  started = false;
  if (timer) clearTimeout(timer);
  window.removeEventListener("pointerdown", onActivity);
  window.removeEventListener("keydown", onActivity);
  document.removeEventListener("visibilitychange", onVisibility);
  lastId = 0; since = null; seeded = false;
  set({ status: null, boot: null, rooms: [], messages: [], activeRoom: null, open: false, popup: null });
}

export function setOpen(open: boolean) {
  set({ open, popup: open ? null : get().popup });
  if (open) void poll();
}

export async function openRoom(roomId: string | null) {
  lastId = 0;
  set({ activeRoom: roomId, messages: [], typing: [], open: true, popup: null });
  if (roomId) await poll();
}

export async function openDm(personId: string) {
  const { roomId } = await chatOpenDm({ data: { personId } });
  await openRoom(roomId);
}

export async function createRoom(kind: "group" | "channel", name: string, members: string[], audience: "everyone" | "managers") {
  const { roomId } = await chatCreateRoom({ data: { kind, name, members, audience } });
  await openRoom(roomId);
}

export async function sendMessage(body: string, photo: string) {
  const roomId = get().activeRoom;
  if (!roomId) return;
  await chatSend({ data: { roomId, body, photo } });
  lastActivity = Date.now();
  await poll();
}

export async function deleteMessage(id: number) {
  await chatDelete({ data: { id } });
  await poll();
}

let lastTyping = 0;
export function noteTyping() {
  const roomId = get().activeRoom;
  if (!roomId || Date.now() - lastTyping < 3000) return;
  lastTyping = Date.now();
  void chatTyping({ data: { roomId } });
}

export async function muteRoom(roomId: string, muted: boolean) {
  await chatMute({ data: { roomId, muted } });
  await poll();
}

export async function setAway(message: string) {
  const me = get().boot?.me.personId;
  const away = message.trim().slice(0, 80);
  if (me) set({ presence: { ...get().presence, [me]: { state: get().presence[me]?.state ?? "online", away } } });
  await chatAway({ data: { away } });
}

export async function setStatus(status: ChatState) {
  const me = get().boot?.me.personId;
  if (me) set({ presence: { ...get().presence, [me]: { state: status, away: get().presence[me]?.away ?? "" } } });
  await chatPresence({ data: { status } });
}

// ---------- images ----------
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => reject(new Error("That file isn't a picture"));
    img.src = url;
  });
}

function draw(img: HTMLImageElement, max: number, quality: number, square = false) {
  const canvas = document.createElement("canvas");
  if (square) {
    const side = Math.min(img.width, img.height);
    canvas.width = canvas.height = max;
    canvas.getContext("2d")!.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, max, max);
  } else {
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  }
  return canvas.toDataURL("image/jpeg", quality);
}

/** Shrinks a photo to about 80 KB before it is sent. */
export async function compressPhoto(file: File) {
  const img = await loadImage(file);
  let max = 1280;
  let out = draw(img, max, 0.7);
  for (let i = 0; i < 6 && out.length > 110_000; i += 1) {
    max = Math.round(max * 0.8);
    out = draw(img, max, 0.6);
  }
  return out;
}

export async function saveAvatar(file: File | null) {
  if (!file) { await chatSetAvatar({ data: { avatar: null } }); await refreshAvatars(); return; }
  const img = await loadImage(file);
  await chatSetAvatar({ data: { avatar: draw(img, 96, 0.8, true) } });
  await refreshAvatars();
}

// ---------- push ----------
function b64ToBytes(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export function pushSupport(): "ok" | "needs-home-screen" | "unsupported" {
  if (typeof window === "undefined") return "unsupported";
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua);
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone;
  if (ios && !standalone) return "needs-home-screen";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || typeof Notification === "undefined") return "unsupported";
  return "ok";
}

export async function enablePush(quiet = false): Promise<"on" | "denied" | "unavailable"> {
  try {
    if (pushSupport() !== "ok") return "unavailable";
    const key = get().boot?.vapidPublicKey;
    if (!key) return "unavailable";
    if (Notification.permission !== "granted") {
      if (quiet) return "unavailable";
      const result = await Notification.requestPermission();
      if (result !== "granted") return "denied";
    }
    const reg = await navigator.serviceWorker.register("/chat-sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: b64ToBytes(key),
    }));
    const json = sub.toJSON();
    await chatPushSubscribe({ data: { endpoint: sub.endpoint, p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" } });
    return "on";
  } catch {
    return "unavailable";
  }
}
