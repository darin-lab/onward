import { useState } from "react";
import { Button, Card, fieldClass } from "@/components/board/ui";
import { mailPhoneReply } from "@/lib/board/mail-call.functions";
import type { PhoneCall, Tech } from "@/lib/board/model";
import { isOwnerViewer } from "@/lib/board/model";
import { useBoard } from "@/lib/board/store";
import { cn } from "@/lib/cn";

const MAX_AUDIO = 4 * 1024 * 1024;

export function pendingCalls(calls: PhoneCall[], personId: string) {
  const actor = personId === "owner" ? "darin" : personId;
  const ownerPreview =
    import.meta.env.DEV && (personId === "owner" || personId === "darin" || personId === "arun");
  return calls.filter((call) => {
    if (call.answers.some((answer) => answer.personId === actor || answer.personId === personId)) {
      return false;
    }
    if (call.managerId === personId || call.managerId === actor) return true;
    return ownerPreview && Boolean(call.sample);
  });
}

export function pendingCall(calls: PhoneCall[], personId: string) {
  return pendingCalls(calls, personId)[0] ?? null;
}

export function sampleReflections(): PhoneCall[] {
  const audio = toneClip();
  return [
    {
      id: "sample-call-1",
      managerId: "israel",
      question: "How did you handle the wait time on this visit?",
      audio,
      audioName: "sample-call.wav",
      createdAt: new Date().toISOString(),
      answers: [],
      sample: true,
    },
    {
      id: "sample-call-2",
      managerId: "israel",
      question: "What would you do differently on the recommendation you made?",
      audio,
      audioName: "sample-call.wav",
      createdAt: new Date().toISOString(),
      answers: [],
      sample: true,
    },
  ];
}

export function CallReview({
  call,
  person,
  shopName,
  index = 1,
  total = 1,
  lead,
  onDone,
}: {
  call: PhoneCall;
  person: Tech;
  shopName: string;
  index?: number;
  total?: number;
  lead?: string;
  onDone?: () => void;
}) {
  const answerCall = useBoard((state) => state.answerCall);
  const [text, setText] = useState("");
  const [played, setPlayed] = useState(!call.audio);
  const [sending, setSending] = useState(false);
  const ready = text.trim().length > 0 && played && !sending;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/75 p-4 text-left sm:items-center">
      <div className="w-full max-w-sm">
        {lead ? (
          <>
            <p className="mb-3 text-center font-display text-2xl text-zinc-100">{lead}</p>
            <p className="mb-16 text-center text-sm text-zinc-300">
              Call reflection{total > 1 ? ` ${index} of ${total}` : ""}
            </p>
          </>
        ) : (
          <p className="mb-20 text-center font-display text-sm tracking-[0.18em] text-zinc-300 uppercase">
            Call reflection{total > 1 ? ` ${index} of ${total}` : ""}
          </p>
        )}
        <div className="relative mx-auto w-[min(100%,280px)]">
          <div className="absolute -top-10 left-1/2 h-10 w-1.5 -translate-x-1/2 rounded-t-full bg-zinc-500" />
          <div className="absolute -top-14 left-1/2 h-5 w-1.5 origin-bottom -translate-x-1/2 -rotate-12 rounded-full bg-zinc-400" />
          <div className="rounded-[2rem] border-4 border-zinc-700 bg-zinc-900 px-4 pt-5 pb-4 shadow-[inset_0_0_0_2px_#3f3f46,0_20px_50px_rgba(0,0,0,.45)]">
            <div className="mx-auto mb-3 h-2 w-16 rounded-full bg-zinc-800 shadow-inner" />
            <div className="mb-1 flex items-center justify-between px-1">
              <span className="h-2 w-2 rounded-full bg-red-600" />
              <p className="font-display text-xs tracking-[0.2em] text-zinc-500 uppercase">Onward</p>
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
            </div>
            <div className="relative rounded-2xl bg-[#d7d3cb] p-3 text-[#1a1916] shadow-[inset_0_0_0_3px_#2a2a28]">
              <div
                className="pointer-events-none absolute inset-0 rounded-2xl opacity-40"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(0deg, rgba(0,0,0,.45) 0 1px, transparent 1px 3px)",
                }}
              />
              <div className="relative">
                {call.audio ? (
                  <audio
                    controls
                    src={call.audio}
                    className="w-full"
                    onPlay={() => setPlayed(true)}
                  />
                ) : (
                  <p className="text-sm">No clip was attached.</p>
                )}
                <p className="mt-3 text-left text-base leading-snug font-medium">{call.question}</p>
              </div>
              <span className="absolute -bottom-3 left-8 h-4 w-4 rotate-45 bg-[#d7d3cb]" />
            </div>
            <label className="mt-5 block text-xs tracking-wide text-zinc-400 uppercase" htmlFor="call-reply">
              Your reply
            </label>
            <textarea
              id="call-reply"
              value={text}
              onChange={(event) => setText(event.target.value)}
              className={cn(fieldClass, "mt-2 min-h-24 bg-zinc-800 py-2 text-zinc-100")}
            />
            <Button
              className="mt-3 w-full"
              disabled={!ready}
              onClick={() => {
                if (person.id !== call.managerId || !ready) return;
                setSending(true);
                const answer = text.trim();
                answerCall(call.id, {
                  personId: person.id,
                  name: person.name,
                  shopName,
                  text: answer,
                  at: new Date().toISOString(),
                });
                void mailPhoneReply({
                  data: {
                    shopId: person.shopId,
                    shopName,
                    managerName: person.name,
                    question: call.question,
                    answer,
                    audio: call.audio,
                    audioName: call.audioName,
                  },
                }).finally(() => onDone?.());
              }}
            >
              Send
            </Button>
            {!played ? (
              <p className="mt-2 text-center text-xs text-zinc-500">Play the clip, then send your reply.</p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export function CallBell() {
  const viewer = useBoard((state) => state.viewer);
  const techs = useBoard((state) => state.techs);
  const calls = useBoard((state) => state.calls ?? []);
  const shops = useBoard((state) => state.shops);
  const [open, setOpen] = useState(false);
  const person = techs.find((item) => item.id === viewer);
  const queue = pendingCalls(calls, person?.id ?? viewer);
  const call = queue[0];
  if (!call) return null;
  const actor = person ?? ownerStandIn(viewer, techs, call);
  if (!actor) return null;
  const shopName = shops.find((shop) => shop.id === actor.shopId)?.name ?? actor.shopId;
  return (
    <>
      <span className="relative inline-flex">
        <button
          type="button"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-raised text-ink"
          aria-label="Call reflection"
          onClick={() => setOpen(true)}
        >
          <PhoneMark />
        </button>
        <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-honey px-1 text-[10px] font-semibold text-white">
          {queue.length}
        </span>
      </span>
      {open ? (
        <CallReview
          key={call.id}
          call={call}
          person={actor}
          shopName={shopName}
          index={1}
          total={queue.length}
          onDone={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

export function BrickPhone() {
  return (
    <svg viewBox="0 0 36 56" className="h-12 w-8" aria-hidden="true">
      <path d="M18 1.5v7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M21 3.5l4-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <rect x="6" y="8" width="24" height="46" rx="5" fill="#18181b" stroke="currentColor" strokeWidth="1.6" />
      <rect x="12" y="12" width="12" height="3" rx="1.5" fill="currentColor" opacity="0.45" />
      <rect x="10" y="18" width="16" height="10" rx="1.5" fill="#d7d3cb" />
      <circle cx="13" cy="36" r="1.3" fill="currentColor" />
      <circle cx="18" cy="36" r="1.3" fill="currentColor" />
      <circle cx="23" cy="36" r="1.3" fill="currentColor" />
      <circle cx="13" cy="41" r="1.3" fill="currentColor" />
      <circle cx="18" cy="41" r="1.3" fill="currentColor" />
      <circle cx="23" cy="41" r="1.3" fill="currentColor" />
      <circle cx="13" cy="46" r="1.3" fill="currentColor" />
      <circle cx="18" cy="46" r="1.3" fill="currentColor" />
      <circle cx="23" cy="46" r="1.3" fill="currentColor" />
    </svg>
  );
}

export function CallComposer() {
  const addCall = useBoard((state) => state.addCall);
  const calls = useBoard((state) => state.calls ?? []);
  const techs = useBoard((state) => state.techs);
  const shops = useBoard((state) => state.shops);
  const [question, setQuestion] = useState("");
  const [audio, setAudio] = useState("");
  const [audioName, setAudioName] = useState("");
  const [note, setNote] = useState("");
  const [trimming, setTrimming] = useState(false);
  const managers = techs.filter((person) => person.kind === "manager");
  const [managerId, setManagerId] = useState(managers[0]?.id ?? "");

  return (
    <Card>
      <h3 className="text-xl">Call reflection</h3>
      <p className="mt-2 text-sm text-muted">
        Pick one manager. Only that manager can play it, and only before their end of day
        report. The clip is removed as soon as they reply.
      </p>
      <label className="mt-4 block text-sm text-ink" htmlFor="call-manager">
        Manager
        <select
          id="call-manager"
          value={managerId}
          onChange={(event) => setManagerId(event.target.value)}
          className={cn(fieldClass, "mt-2")}
        >
          {managers.map((person) => {
            const shop = shops.find((item) => item.id === person.shopId);
            return (
              <option key={person.id} value={person.id}>
                {person.name}
                {shop ? ` · ${shop.name}` : ""}
              </option>
            );
          })}
        </select>
      </label>
      <label className="mt-4 block text-sm text-ink" htmlFor="call-question">
        What would you like to ask?
        <textarea
          id="call-question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          className={cn(fieldClass, "mt-2 min-h-24 py-2")}
        />
      </label>
      <label className="mt-4 block text-sm text-ink" htmlFor="call-audio">
        Sound clip
        <input
          id="call-audio"
          type="file"
          accept="audio/*"
          className="mt-2 block w-full text-sm text-muted"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            setAudio("");
            setAudioName("");
            if (file.size <= MAX_AUDIO) {
              const reader = new FileReader();
              reader.onload = () => {
                setAudio(String(reader.result ?? ""));
                setAudioName(file.name);
                setNote("");
              };
              reader.readAsDataURL(file);
              return;
            }
            setTrimming(true);
            setNote("That clip is long. Keeping the last minute.");
            void lastMinute(file)
              .then((clip) => {
                setAudio(clip.dataUrl);
                setAudioName(clip.name);
                setNote("Only the last minute was kept.");
              })
              .catch(() => {
                setNote("That clip could not be shortened. Try a shorter file.");
              })
              .finally(() => setTrimming(false));
          }}
        />
      </label>
      <Button
        className="mt-4"
        disabled={!question.trim() || !audio || !managerId || trimming}
        onClick={() => {
          const manager = managers.find((person) => person.id === managerId);
          addCall({
            id: `call-${Date.now()}`,
            managerId,
            question: question.trim(),
            audio,
            audioName,
            createdAt: new Date().toISOString(),
            answers: [],
          });
          setQuestion("");
          setAudio("");
          setAudioName("");
          setNote(`Waiting on ${manager?.name ?? "that manager"}.`);
        }}
      >
        Send call reflection
      </Button>
      {note ? <p className="mt-3 text-sm text-muted">{note}</p> : null}
      {calls.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {calls.map((call) => {
            const manager = techs.find((person) => person.id === call.managerId);
            const done = call.answers.length > 0;
            return (
              <li key={call.id} className="text-sm text-muted">
                <span className="text-ink">{call.question}</span>
                {` · ${manager?.name ?? "Manager"} · ${done ? "replied" : "waiting"}`}
              </li>
            );
          })}
        </ul>
      ) : null}
    </Card>
  );
}

function PhoneMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <rect x="7" y="2" width="10" height="20" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 1.2v2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <rect x="9" y="6" width="6" height="5" rx="0.5" fill="currentColor" />
    </svg>
  );
}

async function lastMinute(file: File) {
  const ctx = new AudioContext();
  try {
    const decoded = await ctx.decodeAudioData((await file.arrayBuffer()).slice(0));
    const rate = 16000;
    const start = Math.max(0, decoded.duration - 60);
    const length = Math.max(1, Math.ceil((decoded.duration - start) * rate));
    const offline = new OfflineAudioContext(1, length, rate);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start(0, start);
    const rendered = await offline.startRendering();
    const wav = encodeWav(rendered);
    const blob = new Blob([wav], { type: "audio/wav" });
    const dataUrl = await readBlob(blob);
    const base = file.name.replace(/\.[^.]+$/, "") || "call";
    return { dataUrl, name: `${base}-last-minute.wav` };
  } finally {
    await ctx.close();
  }
}

function readBlob(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function encodeWav(buffer: AudioBuffer) {
  const samples = buffer.getChannelData(0);
  const dataSize = samples.length * 2;
  const out = new ArrayBuffer(44 + dataSize);
  const view = new DataView(out);
  const write = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, dataSize, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }
  return out;
}

function ownerStandIn(viewer: string, techs: Tech[], call: PhoneCall): Tech | null {
  if (!import.meta.env.DEV || !isOwnerViewer(viewer)) return null;
  const manager = techs.find((item) => item.id === call.managerId);
  return {
    id: viewer === "owner" ? "darin" : viewer,
    name: viewer === "owner" ? "Darin Dinis" : "Arun",
    role: "Owner",
    kind: "manager",
    shopId: manager?.shopId ?? "fremont",
    email: "",
  };
}

function toneClip() {
  const rate = 8000;
  const count = rate * 2;
  const dataSize = count * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const write = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, dataSize, true);
  for (let i = 0; i < count; i += 1) {
    const sample = Math.sin((2 * Math.PI * 440 * i) / rate) * 0.25;
    view.setInt16(44 + i * 2, sample * 0x7fff, true);
  }
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:audio/wav;base64,${btoa(binary)}`;
}
