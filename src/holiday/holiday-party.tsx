// Holiday Party RSVP: the snowflake button and its pop-ups.
// Temporary feature: see ./README.md for removal. Shell renders <HolidayParty />
// next to the Chat button; everything else lives in this folder.
import { Component, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useBoard } from "@/lib/board/store";
import { holidayAnswer, holidaySeen, holidayState } from "@/holiday/holiday.functions";
import { PARTY } from "@/holiday/types";
import type { HolidayPerson, HolidayState, RsvpAnswer } from "@/holiday/types";
import { printInvites } from "@/holiday/print";

type Active = Extract<HolidayState, { active: true }>;
type Panel = "invite" | "team" | "owner" | null;

const GOLD = "#A8842C";
const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Pinyon+Script&family=Jost:wght@400;500;600&display=swap";

const decided = (a: RsvpAnswer | null) => a === "yes" || a === "no";

function useHolidayFonts() {
  useEffect(() => {
    if (document.getElementById("holiday-fonts")) return;
    const link = document.createElement("link");
    link.id = "holiday-fonts";
    link.rel = "stylesheet";
    link.href = FONT_HREF;
    document.head.appendChild(link);
  }, []);
}

/** If anything in here breaks, hide it instead of taking the page header down with it. */
class HolidayBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error("[holiday] hidden after an error", error);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function HolidayParty() {
  return (
    <HolidayBoundary>
      <HolidayPartyInner />
    </HolidayBoundary>
  );
}

function HolidayPartyInner() {
  const [state, setState] = useState<Active | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const viewAs = useBoard((s) => s.viewAs);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const onDay = pathname.startsWith("/day/");
  const autoDone = useRef<{ invite: boolean; team: boolean }>({ invite: false, team: false });
  useHolidayFonts();

  const refresh = useCallback(async () => {
    try {
      const next = await holidayState();
      setState(next.active ? next : null);
      return next.active ? next : null;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, pathname]);

  // Pop-ups on their own: the invite on the first visit of the day, then the
  // team list for a manager on End of Day. Never while an owner is viewing as someone.
  useEffect(() => {
    if (!state || panel || viewAs) return;
    if (state.showInvite && !autoDone.current.invite) {
      autoDone.current.invite = true;
      setPanel("invite");
      return;
    }
    if (onDay && state.showTeam && !autoDone.current.team) {
      autoDone.current.team = true;
      setPanel("team");
    }
  }, [state, panel, viewAs, onDay]);

  if (!state) return null;

  const close = (kind: "invite" | "team" | null) => {
    setPanel(null);
    if (kind) void holidaySeen({ data: { kind } }).finally(() => void refresh());
    else void refresh();
  };

  const role = state.me.role;
  return (
    <>
      <style>{CSS}</style>
      <SnowButton
        answered={decided(state.me.answer)}
        sub={buttonSub(state)}
        onClick={() => setPanel(role === "owner" ? "owner" : role === "manager" ? "team" : "invite")}
      />
      {panel === "invite" ? (
        <InviteModal me={state.me} onSaved={setState} onClose={() => close("invite")} />
      ) : null}
      {panel === "team" ? (
        <TeamModal state={state} onSaved={setState} onClose={() => close("team")} />
      ) : null}
      {panel === "owner" ? <OwnerModal state={state} onSaved={setState} onClose={() => close(null)} /> : null}
    </>
  );
}

function buttonSub(state: Active) {
  const me = state.me;
  if (!decided(me.answer)) return "Please RSVP";
  if (me.role === "owner" || me.role === "manager") return "See RSVPs";
  return me.answer === "yes" ? `You are going · ${me.attending}` : "You replied";
}

function Flake({ size = 26, color, className }: { size?: number; color: string; className?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 44 44" fill="none" stroke={color}
      strokeWidth="2.4" strokeLinecap="round" className={className}>
      <path d="M22 3v38M3 22h38M8.6 8.6l26.8 26.8M35.4 8.6L8.6 35.4" />
      <path d="M17 6l5 5 5-5M17 38l5-5 5 5M6 17l5 5-5 5M38 17l-5 5 5 5" />
    </svg>
  );
}

function SnowButton({ answered, sub, onClick }: { answered: boolean; sub: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={`Holiday Party, ${sub}`}
      className={answered ? "hp-snowbtn hp-answered" : "hp-snowbtn hp-glowing"}>
      <Flake size={24} color={answered ? "#C9CFD8" : "#F3DC94"} />
      <span className="hp-snowtext">
        <span className="hp-snowtitle">Holiday Party</span>
        <span className="hp-snowsub">{sub}</span>
      </span>
    </button>
  );
}

/* ---------- shared pieces ---------- */

function Modal({ label, width, onClose, children }: { label: string; width: number; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = before;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  return (
    <div className="hp-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={label} className="hp-card" style={{ maxWidth: width }}>
        <button type="button" className="hp-x" aria-label="Close" onClick={onClose}>×</button>
        <div className="hp-frame1"><div className="hp-frame2">{children}</div></div>
      </div>
    </div>
  );
}

function Snow({ count = 26 }: { count?: number }) {
  const flakes = useMemo(() => {
    const out: CSSProperties[] = [];
    for (let i = 0; i < count; i++) {
      const size = 3 + ((i * 7) % 5);
      const dur = 7 + ((i * 13) % 7);
      out.push({
        left: `${(i * 37 + 11) % 100}%`, width: size, height: size,
        animationDuration: `${dur}s`, animationDelay: `-${((i * 1.7) % dur).toFixed(1)}s`,
        opacity: Math.min(1, 0.55 + ((i * 3) % 5) / 10),
      });
    }
    return out;
  }, [count]);
  return (
    <div aria-hidden="true" className="hp-snow">
      {flakes.map((style, i) => <span key={i} className="hp-flake" style={style} />)}
    </div>
  );
}

function Header({ big = true, line }: { big?: boolean; line?: string }) {
  return (
    <div className={big ? "hp-head hp-head-big" : "hp-head"}>
      <Snow />
      {big ? <Flake size={40} color={GOLD} className="hp-rel" /> : null}
      <div className="hp-rel hp-company">Driven Auto Care</div>
      <h2 className="hp-rel hp-script">Holiday Party</h2>
      {line ? <div className="hp-rel hp-headline">{line}</div> : null}
    </div>
  );
}

function Choice({ value, onPick, label }: { value: RsvpAnswer | null; onPick: (a: RsvpAnswer) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="hp-choice">
      {(["yes", "maybe", "no"] as const).map((a) => (
        <button key={a} type="button" aria-pressed={value === a} onClick={() => onPick(a)}
          className={`hp-pick ${value === a ? `hp-on-${a}` : ""}`}>
          {a === "yes" ? "Yes" : a === "maybe" ? "Maybe" : "No"}
        </button>
      ))}
    </div>
  );
}

function Stepper({ value, onChange, who, typed = false }: { value: number; onChange: (n: number) => void; who: string; typed?: boolean }) {
  const clamp = (n: number) => Math.max(1, Math.min(20, n));
  return (
    <div className="hp-stepper">
      <button type="button" className="hp-round" aria-label={`One fewer attending${who}`} onClick={() => onChange(clamp(value - 1))}>−</button>
      {typed ? (
        <input id="hp-count" type="number" inputMode="numeric" min={1} max={20} value={value} aria-label={`Number attending${who}`}
          className="hp-count-input" onChange={(e) => { const n = parseInt(e.target.value, 10); onChange(clamp(Number.isNaN(n) ? 1 : n)); }} />
      ) : (
        <span className="hp-count">{value}</span>
      )}
      <button type="button" className="hp-round hp-round-gold" aria-label={`One more attending${who}`} onClick={() => onChange(clamp(value + 1))}>+</button>
    </div>
  );
}

function useSaver(onSaved: (s: Active) => void) {
  const [error, setError] = useState("");
  const save = useCallback(async (personId: string, answer: RsvpAnswer, attending: number) => {
    setError("");
    try {
      const next = await holidayAnswer({ data: { personId, answer, attending } });
      if (next.active) onSaved(next);
      return true;
    } catch {
      setError("That did not save. Check your connection and try again.");
      return false;
    }
  }, [onSaved]);
  return { save, error };
}

/* ---------- the invite (everyone; technicians from the button) ---------- */

function InviteModal({ me, onSaved, onClose }: { me: HolidayPerson; onSaved: (s: Active) => void; onClose: () => void }) {
  const [step, setStep] = useState<"invite" | "yes" | "done">("invite");
  const [answer, setAnswer] = useState<RsvpAnswer | null>(me.answer);
  const [count, setCount] = useState(me.attending || 1);
  const [busy, setBusy] = useState(false);
  const { save, error } = useSaver(onSaved);
  const askedBefore = me.answer === "maybe";

  const send = async (a: RsvpAnswer, n: number) => {
    setBusy(true);
    const ok = await save(me.id, a, n);
    setBusy(false);
    if (ok) { setAnswer(a); setStep("done"); }
  };

  return (
    <Modal label="Holiday Party invitation" width={540} onClose={onClose}>
      <Header />
      <div className="hp-body">
        {step === "invite" ? (
          <>
            {askedBefore ? <div className="hp-pill">You said maybe before. Have you decided?</div> : null}
            {decided(me.answer) ? (
              <div className="hp-pill">Your answer: {me.answer === "yes" ? `Yes, ${me.attending} attending` : "No"}. You can change it.</div>
            ) : null}
            <p className="hp-italic">You and your family are invited to celebrate the season with the whole team.</p>
            <div className="hp-dateline"><span className="hp-rule" /><span className="hp-date">{PARTY.day}</span><span className="hp-rule" /></div>
            <div className="hp-details">
              <div className="hp-time">{PARTY.time}</div>
              <div className="hp-strong">{PARTY.place}</div>
              <div>{PARTY.address}</div>
            </div>
            <div className="hp-q">Will you be there?</div>
            <div className="hp-three">
              <button type="button" className="hp-btn hp-btn-gold" disabled={busy} onClick={() => setStep("yes")}>Yes</button>
              <button type="button" className="hp-btn hp-btn-silver" disabled={busy} onClick={() => void send("maybe", count)}>{askedBefore ? "Still maybe" : "Maybe"}</button>
              <button type="button" className="hp-btn hp-btn-plain" disabled={busy} onClick={() => void send("no", 1)}>No</button>
            </div>
            <div className="hp-note">Pick maybe and we will ask you again tomorrow.</div>
          </>
        ) : null}
        {step === "yes" ? (
          <>
            <p className="hp-italic hp-big">Wonderful! How many are attending?</p>
            <div className="hp-box">
              <label className="hp-strong" htmlFor="hp-count">Number attending, including you</label>
              <Stepper value={count} onChange={setCount} who="" typed />
              <div className="hp-note">Count yourself, plus any family coming with you.</div>
            </div>
            <div className="hp-two">
              <button type="button" className="hp-btn hp-btn-plain" onClick={() => setStep("invite")}>Back</button>
              <button type="button" className="hp-btn hp-btn-gold hp-grow" disabled={busy} onClick={() => void send("yes", count)}>
                {busy ? "Saving…" : "Send my RSVP"}
              </button>
            </div>
          </>
        ) : null}
        {step === "done" ? (
          <>
            <p className="hp-italic hp-bigger">
              {answer === "yes" ? "See you there!" : answer === "maybe" ? "No problem." : "We will miss you."}
            </p>
            <div className="hp-text">
              {answer === "yes"
                ? `We have you down for ${count} ${count === 1 ? "person" : "people"} on ${PARTY.day}, ${PARTY.time} at the Fremont shop.`
                : answer === "maybe"
                  ? "We will ask again tomorrow."
                  : "Thanks for letting us know. Happy holidays to you and your family."}
            </div>
            <button type="button" className="hp-btn hp-btn-dark hp-full" onClick={onClose}>Continue</button>
            {answer !== "maybe" ? (
              <button type="button" className="hp-link" onClick={() => setStep("invite")}>Change my answer</button>
            ) : null}
          </>
        ) : null}
        {error ? <div className="hp-error" role="alert">{error}</div> : null}
      </div>
    </Modal>
  );
}

/* ---------- managers: themselves + their technicians ---------- */

function TeamModal({ state, onSaved, onClose }: { state: Active; onSaved: (s: Active) => void; onClose: () => void }) {
  const [rows, setRows] = useState<HolidayPerson[]>(state.team);
  const { save, error } = useSaver(onSaved);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const waiting = state.team.filter((p) => !decided(p.answer)).length;
  const managerFirst = state.me.name.split(" ")[0] || state.me.name;

  const update = (id: string, patch: Partial<HolidayPerson>) => {
    const next = rows.map((p) => (p.id === id ? { ...p, ...patch } : p));
    setRows(next);
    const person = next.find((p) => p.id === id);
    if (!person?.answer) return;
    clearTimeout(timers.current[id]);
    const { answer, attending } = person;
    timers.current[id] = setTimeout(() => void save(id, answer, attending), patch.answer ? 0 : 500);
  };

  const decidedCount = rows.filter((p) => decided(p.answer)).length;
  const headcount = rows.reduce((sum, p) => sum + (p.answer === "yes" ? p.attending : 0), 0);
  const techs = rows.filter((p) => p.role === "technician");

  return (
    <Modal label="Holiday Party RSVPs for your team" width={920} onClose={onClose}>
      <Header big={false} line={`${PARTY.day} · ${PARTY.time} · ${PARTY.address}`} />
      <div className="hp-body hp-left">
        {waiting > 0 ? (
          <div className="hp-pill hp-center">Still waiting on {waiting} of your team. Have they decided?</div>
        ) : null}
        <p className="hp-italic hp-center">Families are welcome. Please let us know who on your team is coming.</p>
        <div className="hp-row hp-row-head" aria-hidden="true">
          <div>Invitation for</div><div>Coming?</div><div>Number attending</div><div className="hp-right">Paper invite</div>
        </div>
        <div className="hp-rows">
          {rows.map((p) => (
            <div key={p.id} className={decided(p.answer) ? "hp-row hp-person" : "hp-row hp-person hp-pending"}>
              <div>
                <div className="hp-name">{p.name}</div>
                <div className="hp-sub">{p.id === state.me.id ? "Shop Manager (you)" : p.title}</div>
              </div>
              <Choice value={p.answer} label={`Is ${p.name} coming?`} onPick={(a) => update(p.id, { answer: a })} />
              <div>
                {p.answer === "yes" ? (
                  <Stepper value={p.attending} who={` with ${p.name}`} onChange={(n) => update(p.id, { attending: n })} />
                ) : (
                  <span className="hp-sub">{p.answer === "no" ? "Not attending" : p.answer === "maybe" ? "Ask again tomorrow" : "No answer yet"}</span>
                )}
              </div>
              <div className="hp-right">
                {p.role === "technician" ? (
                  <button type="button" className="hp-btn-small" onClick={() => printInvites([p.name], managerFirst)}>
                    <PrinterIcon /> Print invite
                  </button>
                ) : null}
              </div>
            </div>
          ))}
          {techs.length === 0 ? <div className="hp-sub">No technicians are listed for your shop.</div> : null}
        </div>
        {error ? <div className="hp-error" role="alert">{error}</div> : null}
        <div className="hp-foot">
          <div className="hp-grow">
            <div className="hp-strong">{decidedCount} of {rows.length} decided · {headcount} attending so far</div>
            <div className="hp-sub">Anyone left on Maybe or blank shows up here again tomorrow at End of Day.</div>
          </div>
          {techs.length > 0 ? (
            <button type="button" className="hp-btn hp-btn-plain" onClick={() => printInvites(techs.map((t) => t.name), managerFirst)}>
              Print all invites (PDF)
            </button>
          ) : null}
          <button type="button" className="hp-btn hp-btn-gold" onClick={onClose}>Done</button>
        </div>
      </div>
    </Modal>
  );
}

function PrinterIcon() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9V3h12v6" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <path d="M6 14h12v7H6z" />
    </svg>
  );
}

/* ---------- Darin and Arun: their own RSVP + everyone ---------- */

const SHOP_ORDER = ["Fremont", "Campbell", "San Ramon", "San Jose", "Castro Valley"];

function OwnerModal({ state, onSaved, onClose }: { state: Active; onSaved: (s: Active) => void; onClose: () => void }) {
  const [mine, setMine] = useState({ answer: state.me.answer, attending: state.me.attending || 1 });
  const [shop, setShop] = useState("All");
  const { save, error } = useSaver(onSaved);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setMineAndSave = (answer: RsvpAnswer | null, attending: number, delay: number) => {
    setMine({ answer, attending });
    if (!answer) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(state.me.id, answer, attending), delay);
  };

  const everyone = state.everyone.map((p) => (p.id === state.me.id ? { ...p, ...mine } : p));
  let total = 0, nYes = 0, nMaybe = 0, nNo = 0, nNone = 0;
  for (const p of everyone) {
    if (p.answer === "yes") { nYes++; total += p.attending; }
    else if (p.answer === "maybe") nMaybe++;
    else if (p.answer === "no") nNo++;
    else nNone++;
  }
  const shopNames = Array.from(new Set<string>(everyone.filter((p) => p.role !== "owner").map((p) => p.shopName).filter(Boolean)))
    .sort((a, b) => (SHOP_ORDER.indexOf(a) + 99) % 100 - (SHOP_ORDER.indexOf(b) + 99) % 100 || a.localeCompare(b));
  const tabs = ["All", ...shopNames];
  const list = everyone
    .filter((p) => shop === "All" || p.shopName === shop)
    .sort((a, b) => {
      const ra = a.role === "owner" ? 0 : a.role === "manager" ? 1 : 2;
      const rb = b.role === "owner" ? 0 : b.role === "manager" ? 1 : 2;
      const sa = a.role === "owner" ? -1 : SHOP_ORDER.indexOf(a.shopName);
      const sb = b.role === "owner" ? -1 : SHOP_ORDER.indexOf(b.shopName);
      return (ra === 0 || rb === 0 ? ra - rb : sa - sb) || ra - rb || a.name.localeCompare(b.name);
    });

  return (
    <Modal label="Holiday Party RSVPs" width={1000} onClose={onClose}>
      <Header big={false} line={`${PARTY.day} · ${PARTY.time} · Fremont Shop, 40931 Albrae Street`} />
      <div className="hp-body hp-left">
        <div className="hp-owner-top">
          <div className="hp-panel">
            <div className="hp-between">
              <div className="hp-label">Your RSVP</div>
              <div className="hp-name">{state.me.name} · {state.me.title}</div>
            </div>
            <Choice value={mine.answer} label="Are you coming?" onPick={(a) => setMineAndSave(a, mine.attending, 0)} />
            {mine.answer === "yes" ? (
              <div className="hp-between">
                <div className="hp-text">Attending, including you</div>
                <Stepper value={mine.attending} who=" with you" onChange={(n) => setMineAndSave("yes", n, 500)} />
              </div>
            ) : null}
          </div>
          <div className="hp-panel hp-totals">
            <div className="hp-total">
              <div className="hp-total-num">{total}</div>
              <div className="hp-label hp-ink">Total attending</div>
              <div className="hp-sub">employees + family</div>
            </div>
            <div className="hp-counts">
              <div><strong>{nYes}</strong> Yes</div>
              <div><strong>{nMaybe}</strong> Maybe</div>
              <div><strong>{nNo}</strong> No</div>
              <div><strong>{nNone}</strong> No answer yet</div>
            </div>
          </div>
        </div>
        <div role="group" aria-label="Filter by shop" className="hp-tabs">
          {tabs.map((t) => (
            <button key={t} type="button" aria-pressed={shop === t} className={shop === t ? "hp-tab hp-tab-on" : "hp-tab"} onClick={() => setShop(t)}>{t}</button>
          ))}
        </div>
        <div className="hp-table">
          <div className="hp-trow hp-thead" aria-hidden="true">
            <div>Name</div><div>Shop</div><div>Role</div><div>Response</div><div className="hp-right">Attending</div>
          </div>
          <div className="hp-tbody">
            {list.map((p) => {
              const k = p.answer ?? "none";
              return (
                <div key={p.id} className="hp-trow">
                  <div className="hp-strong">{p.name}</div>
                  <div>{p.shopName}</div>
                  <div className="hp-sub">{p.title}</div>
                  <div><span className={`hp-tag hp-tag-${k}`}>{k === "yes" ? "Yes" : k === "maybe" ? "Maybe" : k === "no" ? "No" : "No answer"}</span></div>
                  <div className="hp-right hp-strong">{p.answer === "yes" ? p.attending : "—"}</div>
                </div>
              );
            })}
          </div>
        </div>
        {error ? <div className="hp-error" role="alert">{error}</div> : null}
        <div className="hp-foot">
          <div className="hp-grow hp-sub">Technician answers come from the technician or their manager.</div>
          <button type="button" className="hp-btn hp-btn-dark" onClick={onClose}>Done</button>
        </div>
      </div>
    </Modal>
  );
}

/* ---------- styles (scoped by the hp- prefix) ---------- */

const CSS = `
@keyframes hp-fall{0%{transform:translateY(-20px)}50%{transform:translateY(130px) translateX(10px)}100%{transform:translateY(280px) translateX(-6px)}}
@keyframes hp-glow{0%,100%{box-shadow:0 0 6px 1px rgba(228,201,121,.45)}50%{box-shadow:0 0 20px 6px rgba(228,201,121,.9)}}
@keyframes hp-flakeglow{0%,100%{filter:drop-shadow(0 0 2px rgba(255,236,170,.6))}50%{filter:drop-shadow(0 0 7px rgba(255,236,170,1))}}
.hp-snowbtn{display:inline-flex;align-items:center;gap:8px;min-height:48px;padding:0 14px 0 10px;border-radius:999px;font-family:'Jost',sans-serif;text-align:left;cursor:pointer}
.hp-snowbtn:focus-visible{outline:3px solid #9CC0FF;outline-offset:3px}
.hp-glowing{background:linear-gradient(180deg,#3A3322,#2A2618);border:1px solid #E4C979;color:#FFF6DA;animation:hp-glow 2.4s ease-in-out infinite}
.hp-glowing svg{animation:hp-flakeglow 2.4s ease-in-out infinite}
.hp-answered{background:#2C333D;border:1px solid #5B6573;color:#E3E7EC}
.hp-snowtext{display:flex;flex-direction:column;line-height:1.1}
.hp-snowtitle{font-size:13px;font-weight:600;letter-spacing:.04em;white-space:nowrap}
.hp-snowsub{font-size:11px;opacity:.9;white-space:nowrap}
@media (max-width:560px){.hp-snowtext{display:none}.hp-snowbtn{padding:0 11px}}
@media (prefers-reduced-motion:reduce){.hp-glowing,.hp-glowing svg,.hp-flake{animation:none}}
.hp-overlay{position:fixed;inset:0;z-index:70;background:rgba(17,22,30,.62);display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:24px 12px;box-sizing:border-box;font-family:'Jost',sans-serif;color:#20262E;text-align:center}
.hp-card{position:relative;width:100%;margin:auto 0;background:#F7F8FA;border-radius:6px;box-shadow:0 30px 80px rgba(0,0,0,.45);padding:10px;box-sizing:border-box}
.hp-frame1{border:1.5px solid ${GOLD};border-radius:3px;padding:6px}
.hp-frame2{border:1px solid #C9CFD8;border-radius:2px;overflow:hidden}
.hp-x{position:absolute;top:18px;right:18px;z-index:2;width:44px;height:44px;border-radius:50%;border:none;background:rgba(255,255,255,.7);color:#20262E;font-size:26px;line-height:1;cursor:pointer}
.hp-head{position:relative;overflow:hidden;background:linear-gradient(180deg,#C7CED8 0%,#E3E7EC 60%,#F7F8FA 100%);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:22px 16px 12px}
.hp-head-big{min-height:220px;padding-top:28px}
.hp-snow{position:absolute;inset:0}
.hp-flake{position:absolute;top:-10px;border-radius:50%;background:#fff;box-shadow:0 0 3px rgba(110,122,140,.7);animation-name:hp-fall;animation-timing-function:linear;animation-iteration-count:infinite}
.hp-rel{position:relative}
.hp-company{font-size:12px;font-weight:500;letter-spacing:.32em;text-transform:uppercase;color:#3B4552;margin-top:8px}
.hp-script{margin:0;font-family:'Pinyon Script',cursive;font-weight:400;font-style:normal;text-transform:none;letter-spacing:0;font-size:clamp(48px,11vw,74px);line-height:1.1;color:${GOLD};text-shadow:0 1px 0 rgba(255,255,255,.9)}
.hp-headline{font-size:14px;color:#20262E;letter-spacing:.03em;padding:0 8px}
.hp-body{padding:10px clamp(16px,4vw,36px) 28px;display:flex;flex-direction:column;align-items:center;gap:16px}
.hp-left{align-items:stretch}
.hp-center{text-align:center;align-self:center}
.hp-italic{margin:0;font-family:'Cormorant Garamond',serif;font-style:italic;font-size:22px;line-height:1.35;color:#20262E}
.hp-big{font-size:26px}.hp-bigger{font-size:30px}
.hp-pill{font-size:14px;color:#3B4552;background:#ECEFF3;border:1px solid #C9CFD8;border-radius:999px;padding:8px 18px}
.hp-dateline{display:flex;align-items:center;gap:14px}
.hp-rule{height:1px;width:44px;background:${GOLD}}
.hp-date{font-family:'Cormorant Garamond',serif;font-size:26px;font-weight:600}
.hp-details{display:flex;flex-direction:column;gap:3px;font-size:16px;color:#3B4552}
.hp-time{font-weight:500;letter-spacing:.08em;color:#20262E}
.hp-strong{font-weight:500;color:#20262E}
.hp-q{font-size:15px;font-weight:500;margin-top:4px}
.hp-three{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;width:100%}
.hp-two{display:flex;gap:10px;width:100%}
.hp-grow{flex-grow:1}
.hp-full{width:100%}
.hp-btn{min-height:52px;padding:0 18px;border-radius:4px;font-family:'Jost',sans-serif;font-size:16px;font-weight:600;letter-spacing:.05em;cursor:pointer}
.hp-btn:disabled{opacity:.6;cursor:default}
.hp-btn:focus-visible,.hp-pick:focus-visible,.hp-round:focus-visible,.hp-tab:focus-visible,.hp-btn-small:focus-visible,.hp-link:focus-visible,.hp-x:focus-visible{outline:3px solid #2F4A6B;outline-offset:2px}
.hp-btn-gold{border:1px solid #8A6A1F;background:linear-gradient(180deg,#E4C979,#C9A54A);color:#2A2008}
.hp-btn-silver{border:1px solid #9AA3AF;background:linear-gradient(180deg,#fff,#DDE2E8);color:#20262E}
.hp-btn-plain{border:1px solid #9AA3AF;background:#fff;color:#3B4552;font-weight:500}
.hp-btn-dark{border:1px solid #2F3A48;background:#2F3A48;color:#F7F8FA;font-weight:500}
.hp-note{font-size:13px;color:#4B5563}
.hp-text{font-size:16px;line-height:1.5;color:#3B4552}
.hp-link{background:none;border:none;padding:8px;font-family:'Jost',sans-serif;font-size:14px;color:#6E5414;text-decoration:underline;cursor:pointer}
.hp-box{display:flex;flex-direction:column;align-items:center;gap:12px;width:100%;padding:18px 14px;box-sizing:border-box;border:1px solid #C9CFD8;border-radius:4px;background:#fff}
.hp-stepper{display:flex;align-items:center;gap:12px}
.hp-round{width:44px;height:44px;border-radius:50%;border:1px solid #9AA3AF;background:#F7F8FA;color:#20262E;font-size:20px;cursor:pointer}
.hp-round-gold{border-color:#8A6A1F;background:#F3E7C4;color:#2A2008}
.hp-count{min-width:28px;text-align:center;font-family:'Cormorant Garamond',serif;font-size:26px;font-weight:600}
.hp-count-input{width:84px;height:54px;box-sizing:border-box;text-align:center;border:1.5px solid ${GOLD};border-radius:4px;background:#F7F8FA;color:#20262E;font-family:'Cormorant Garamond',serif;font-size:32px;font-weight:600}
.hp-error{font-size:14px;color:#9B1C1C;background:#FDECEC;border:1px solid #F3B4B4;border-radius:4px;padding:8px 12px}
.hp-choice{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
.hp-pick{min-height:44px;border-radius:4px;border:1px solid #9AA3AF;background:#fff;color:#3B4552;font-family:'Jost',sans-serif;font-size:15px;font-weight:500;cursor:pointer}
.hp-on-yes{background:#C9A54A;border-color:#8A6A1F;color:#2A2008;font-weight:600}
.hp-on-maybe{background:#DDE2E8;border-color:#5B6573;color:#20262E;font-weight:600}
.hp-on-no{background:#3B4552;border-color:#3B4552;color:#F7F8FA;font-weight:600}
.hp-row{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1.5fr) minmax(0,1fr) auto;gap:12px;align-items:center;text-align:left}
.hp-row-head{padding:0 14px;font-size:12px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:#4B5563}
.hp-rows{display:flex;flex-direction:column;gap:8px}
.hp-person{min-height:64px;padding:8px 14px;box-sizing:border-box;border-radius:4px;background:#fff;border:1px solid #C9CFD8}
.hp-pending{border:1px dashed ${GOLD}}
.hp-name{font-family:'Cormorant Garamond',serif;font-size:21px;font-weight:600;color:#20262E}
.hp-sub{font-size:13px;color:#4B5563}
.hp-right{text-align:right;justify-self:end}
.hp-btn-small{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 14px;border-radius:4px;border:1px solid #9AA3AF;background:#fff;color:#20262E;font-family:'Jost',sans-serif;font-size:14px;font-weight:500;cursor:pointer;white-space:nowrap}
.hp-foot{display:flex;align-items:center;flex-wrap:wrap;gap:12px;padding-top:14px;border-top:1px solid #C9CFD8;text-align:left}
@media (max-width:760px){.hp-row{grid-template-columns:1fr}.hp-row-head{display:none}.hp-right{justify-self:start;text-align:left}}
.hp-owner-top{display:grid;grid-template-columns:minmax(0,380px) minmax(0,1fr);gap:14px}
@media (max-width:760px){.hp-owner-top{grid-template-columns:1fr}}
.hp-panel{background:#fff;border:1px solid #C9CFD8;border-radius:4px;padding:14px 16px;display:flex;flex-direction:column;gap:10px;text-align:left}
.hp-between{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
.hp-label{font-size:12px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:#4B5563}
.hp-ink{color:#20262E}
.hp-totals{flex-direction:row;align-items:center;gap:24px;flex-wrap:wrap}
.hp-total{display:flex;flex-direction:column;align-items:center;padding-right:24px;border-right:1px solid #C9CFD8}
.hp-total-num{font-family:'Cormorant Garamond',serif;font-size:64px;font-weight:600;line-height:1;color:#8A6A1F}
.hp-counts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 24px;font-size:15px;flex-grow:1}
.hp-tabs{display:flex;gap:6px;flex-wrap:wrap}
.hp-tab{min-height:40px;padding:0 14px;border-radius:999px;border:1px solid #9AA3AF;background:#fff;color:#3B4552;font-family:'Jost',sans-serif;font-size:14px;cursor:pointer}
.hp-tab-on{background:#20262E;border-color:#20262E;color:#F7F8FA;font-weight:600}
.hp-table{border:1px solid #C9CFD8;border-radius:4px;background:#fff;overflow:hidden;text-align:left}
.hp-trow{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) 90px;gap:12px;align-items:center;padding:9px 16px;border-top:1px solid #E3E7EC;font-size:15px}
.hp-thead{border-top:none;background:#ECEFF3;font-size:12px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:#3B4552}
.hp-tbody{max-height:340px;overflow-y:auto}
@media (max-width:760px){.hp-trow{grid-template-columns:minmax(0,1fr) auto 40px}.hp-trow>div:nth-child(2),.hp-trow>div:nth-child(3){display:none}.hp-thead{display:none}}
.hp-tag{display:inline-block;padding:3px 12px;border-radius:999px;font-size:13px;font-weight:600}
.hp-tag-yes{background:#F3E7C4;color:#4A380B;border:1px solid #C9A54A}
.hp-tag-maybe{background:#E3E7EC;color:#20262E;border:1px solid #9AA3AF}
.hp-tag-no{background:#3B4552;color:#F7F8FA;border:1px solid #3B4552}
.hp-tag-none{background:#fff;color:#3B4552;border:1px dashed #767676}
`;
