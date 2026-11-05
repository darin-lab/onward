import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { pinSignIn, pinSignOut, pinStatus } from "@/lib/board/pin.functions";
import { fieldClass } from "@/components/board/ui";
import { techReviewStage, focusReview } from "@/lib/board/model";
import { useBoard } from "@/lib/board/store";
import { ToolsMenu } from "@/components/board/roster";
import { startViewAs, stopViewAs } from "@/lib/board/view-as";

type Session = { personId: string; role: string; name: string };

export function Shell({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void pinStatus()
      .then((next) => {
        applySession(next);
        setSession(next);
      })
      .catch(() => {
        applySession(null);
        setSession(null);
      })
      .finally(() => setReady(true));
  }, []);

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <div className="h-1.5 bg-honey" />
      <div className="mx-auto w-full max-w-3xl px-5 pt-5 pb-24">
        {ready && session ? (
          <>
            <ViewAsBanner />
            <header className="mb-8 flex items-start justify-between gap-4">
              <Link to="/" className="shrink-0">
                <Logo />
              </Link>
              <div className="text-right">
                <div className="flex items-center justify-end gap-3">
                  <ReviewAlert />
                  <ToolsMenu />
                  <div>
                    {session.role === "owner" ? <ViewAsPicker ownerId={session.personId} /> : null}
                    <p className="text-sm text-ink">{session.name}</p>
                    <button
                      type="button"
                      className="text-xs text-muted underline-offset-4 hover:underline"
                      onClick={() => {
                        void pinSignOut().then(() => {
                          applySession(null);
                          setSession(null);
                        });
                      }}
                    >
                      Sign out
                    </button>
                  </div>
                </div>
              </div>
            </header>
            {children}
          </>
        ) : (
          <PinGate
            ready={ready}
            onSignedIn={(next) => {
              applySession(next);
              setSession(next);
            }}
          />
        )}
      </div>
    </div>
  );
}

/** Darin and Arun: look at the app as any manager or technician, view only. */
function ViewAsPicker({ ownerId }: { ownerId: string }) {
  const techs = useBoard((state) => state.techs);
  const shops = useBoard((state) => state.shops);
  const viewer = useBoard((state) => state.viewer);
  const viewAs = useBoard((state) => state.viewAs);
  const shopName = (id: string) => shops.find((shop) => shop.id === id)?.name ?? id;
  const managers = techs.filter((tech) => tech.kind === "manager");
  const crew = techs.filter((tech) => tech.kind === "technician");
  return (
    <select
      aria-label="View the app as"
      value={viewAs ? viewer : ownerId}
      onChange={(event) => {
        const next = event.target.value;
        if (next === ownerId) stopViewAs();
        else startViewAs(ownerId, next);
      }}
      className="mb-1 max-w-40 rounded-md bg-raised px-2 py-1 text-xs text-ink shadow-border"
    >
      <option value={ownerId}>View as: me</option>
      <optgroup label="Managers">
        {managers.map((person) => (
          <option key={person.id} value={person.id}>
            {person.name} · {shopName(person.shopId)}
          </option>
        ))}
      </optgroup>
      <optgroup label="Technicians">
        {crew.map((person) => (
          <option key={person.id} value={person.id}>
            {person.name} · {shopName(person.shopId)}
          </option>
        ))}
      </optgroup>
    </select>
  );
}

function ViewAsBanner() {
  const viewAs = useBoard((state) => state.viewAs);
  const person = useBoard((state) => state.techs.find((tech) => tech.id === state.viewer));
  if (!viewAs || !person) return null;
  return (
    <div className="sticky top-0 z-40 -mx-5 mb-4 flex items-center justify-between gap-3 bg-[#ffd400] px-5 py-2 text-sm text-[#2a2200]">
      <span>
        Viewing as <strong>{person.name}</strong>. View only: nothing saves, sends or clears.
      </span>
      <button type="button" onClick={stopViewAs} className="shrink-0 font-semibold underline underline-offset-4">
        Exit
      </button>
    </div>
  );
}

function ReviewAlert() {
  const techs = useBoard((state) => state.techs);
  const weeks = useBoard((state) => state.weeks);
  const viewer = useBoard((state) => state.viewer);
  const [open, setOpen] = useState(false);
  const manager = techs.find((tech) => tech.id === viewer && tech.kind === "manager");
  const crew = techs.filter((tech) => tech.kind === "technician" && tech.shopId === manager?.shopId);
  const waiting = weeks.filter(
    (week) => techReviewStage(week) === "manager" && crew.some((tech) => tech.id === week.techId),
  );
  if (!manager || waiting.length === 0) return null;
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="relative inline-flex min-h-12 items-center rounded-md bg-honey px-3 font-display text-sm tracking-wide text-honey-fg uppercase italic"
      >
        Tech reviews
        <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-white px-1 text-[10px] font-semibold text-honey">
          {waiting.length}
        </span>
      </button>
      {open ? (
        <div className="absolute right-0 z-30 mt-2 w-max max-w-[min(100vw-2.5rem,16rem)] rounded-md bg-surface p-1 shadow-border">
          {waiting.map((week) => {
            const tech = crew.find((item) => item.id === week.techId);
            if (!tech) return null;
            return (
              <Link
                key={`${week.techId}-${week.weekStart}`}
                to="/t/$techId"
                params={{ techId: tech.id }}
                onClick={() => {
                  focusReview(tech.id, week.weekStart);
                  setOpen(false);
                }}
                className="block rounded px-3 py-2 text-right text-sm text-ink"
              >
                {tech.name}
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function Logo() {
  return (
    <img src="/driven-logo.png" alt="Driven Auto Care" className="h-11 w-auto brightness-0 invert" />
  );
}

function applySession(session: { personId: string; role: string } | null) {
  if (session) {
    // Calls and cash are only listed for a signed-in person.
    void import("@/lib/board/shared").then((shared) => shared.refreshRecords());
  }
  if (!session) {
    useBoard.setState({ viewer: "guest", lens: "owner" });
    return;
  }
  if (session.role === "owner") {
    useBoard.setState({ viewer: session.personId, lens: "owner" });
    return;
  }
  useBoard.getState().setViewer(session.personId);
}

function PinGate({
  ready,
  onSignedIn,
}: {
  ready: boolean;
  onSignedIn: (session: Session) => void;
}) {
  const [pin, setPin] = useState("");
  const [failed, setFailed] = useState(false);
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col items-center justify-center text-center">
      <Logo />
      <h1 className="mt-8 text-4xl text-ink">Driven Onward</h1>
      <p className="mt-3 text-muted">Enter your PIN</p>
      {ready ? (
        <form
          className="mt-6 w-full"
          onSubmit={(event) => {
            event.preventDefault();
            void pinSignIn({ data: { pin } })
              .then((result) => {
                if (!result.ok) {
                  setFailed(true);
                  return;
                }
                setFailed(false);
                setPin("");
                onSignedIn(result.session);
              })
              .catch(() => setFailed(true));
          }}
        >
          <input
            autoFocus
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            value={pin}
            onChange={(event) => {
              setFailed(false);
              setPin(event.target.value.replace(/\D/g, "").slice(0, 4));
            }}
            placeholder="PIN"
            aria-label="PIN"
            className={fieldClass + " text-center text-2xl tracking-[0.3em]"}
          />
          <button
            type="submit"
            className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-md bg-honey px-5 font-display text-sm font-semibold tracking-wide text-honey-fg uppercase italic"
          >
            Open
          </button>
          {failed ? <p className="mt-3 text-sm text-honey">That PIN did not match.</p> : null}
        </form>
      ) : null}
    </div>
  );
}
