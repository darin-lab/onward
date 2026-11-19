import { useEffect, useRef, useState } from "react";

// One floating mic for every text box on the site. It appears while a text
// field is focused and types what you say at the cursor, using the phone's or
// browser's own speech recognition (nothing is uploaded to us).

type Rec = {
  continuous: boolean; interimResults: boolean; lang: string;
  start(): void; stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
};
type RecCtor = new () => Rec;
type Field = HTMLInputElement | HTMLTextAreaElement;

function recognitionCtor(): RecCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function dictatable(el: EventTarget | null): el is Field {
  if (!(el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement)) return false;
  if (el.readOnly || el.disabled || el.dataset.noVoice !== undefined) return false;
  if (el instanceof HTMLInputElement) {
    if (!["text", "search", ""].includes(el.type)) return false;
    if (["numeric", "decimal", "tel"].includes(el.inputMode)) return false;
  }
  if (el.autocomplete === "one-time-code") return false;
  return !/pin|pass|code/i.test(`${el.name} ${el.id}`);
}

function setValue(el: Field, value: string, caret: number) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  try { el.setSelectionRange(caret, caret); } catch { /* some input types have no caret */ }
}

export function VoiceInput() {
  const [supported, setSupported] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [listening, setListening] = useState(false);
  const [note, setNote] = useState("");
  const field = useRef<Field | null>(null);
  const rec = useRef<Rec | null>(null);
  const hideTimer = useRef<number | undefined>(undefined);
  const listeningRef = useRef(false);
  const prevPad = useRef("");

  useEffect(() => { setSupported(recognitionCtor() !== null); }, []);

  useEffect(() => {
    if (!supported) return;
    const place = () => {
      const el = field.current;
      if (!el || !el.isConnected) return setPos(null);
      const r = el.getBoundingClientRect();
      const size = 24;
      // Tucked inside the field's right edge: centered on one-line boxes, bottom corner on tall ones.
      const top = r.height > 52 ? r.bottom - size - 6 : r.top + (r.height - size) / 2;
      setPos({ top, left: Math.min(r.right - size - 6, window.innerWidth - size - 4) });
    };
    const onIn = (e: FocusEvent) => {
      if (!dictatable(e.target)) return;
      window.clearTimeout(hideTimer.current);
      if (field.current !== e.target && listeningRef.current) rec.current?.stop();
      if (field.current && field.current !== e.target) field.current.style.paddingRight = prevPad.current;
      if (field.current !== e.target) { prevPad.current = e.target.style.paddingRight; e.target.style.paddingRight = "34px"; }
      field.current = e.target;
      setNote("");
      place();
    };
    const onOut = () => {
      hideTimer.current = window.setTimeout(() => {
        if (listeningRef.current) return;
        if (field.current) field.current.style.paddingRight = prevPad.current;
        field.current = null;
        setPos(null);
      }, 250);
    };
    document.addEventListener("focusin", onIn);
    document.addEventListener("focusout", onOut);
    const id = window.setInterval(() => { if (field.current) place(); }, 300);
    return () => {
      document.removeEventListener("focusin", onIn);
      document.removeEventListener("focusout", onOut);
      window.clearInterval(id);
    };
  }, [supported]);

  const toggle = () => {
    const el = field.current;
    const Ctor = recognitionCtor();
    if (!el || !Ctor) return;
    if (listeningRef.current) { rec.current?.stop(); return; }
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    const before = el.value.slice(0, start);
    const after = el.value.slice(end);
    const lead = before && !/\s$/.test(before) ? " " : "";
    const r = new Ctor();
    r.continuous = true;
    r.interimResults = true;
    r.lang = "en-US";
    r.onresult = (e) => {
      let said = "";
      for (let i = 0; i < e.results.length; i++) said += e.results[i][0].transcript;
      let next = before + lead + said.trimStart() + after;
      const max = el.maxLength > 0 ? el.maxLength : Infinity;
      if (next.length > max) next = next.slice(0, max);
      setValue(el, next, Math.min(next.length, before.length + lead.length + said.trimStart().length));
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") setNote("Allow the microphone in your browser settings.");
      else if (e.error === "no-speech") setNote("Didn't hear anything.");
    };
    r.onend = () => { listeningRef.current = false; setListening(false); };
    rec.current = r;
    listeningRef.current = true;
    setListening(true);
    setNote("");
    try { r.start(); } catch { listeningRef.current = false; setListening(false); }
  };

  if (!supported || !pos) return null;
  return (
    <div style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 70 }} className="flex flex-row-reverse items-center gap-1">
      <button type="button" aria-label={listening ? "Stop dictation" : "Speak to type"} title={listening ? "Tap to stop" : "Speak to type"}
        onPointerDown={(e) => e.preventDefault()} onMouseDown={(e) => e.preventDefault()} onClick={toggle}
        className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${listening ? "animate-pulse bg-honey text-white" : "bg-transparent text-muted opacity-60 hover:opacity-100"}`}>
        🎤
      </button>
      {note ? <span className="whitespace-nowrap rounded-sm bg-surface px-2 py-1 text-[11px] text-ink shadow">{note}</span> : null}
    </div>
  );
}
