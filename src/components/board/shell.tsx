import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { pinSignIn, pinSignOut, pinStatus } from "@/lib/board/pin.functions";
import { fieldClass } from "@/components/board/ui";
import { useBoard } from "@/lib/board/store";
import { CashBell } from "@/components/board/cash";
import { ToolsMenu } from "@/components/board/roster";

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
            <header className="mb-8 flex items-start justify-between gap-4">
              <Link to="/" className="shrink-0">
                <Logo />
              </Link>
              <div className="text-right">
                <div className="flex items-center justify-end gap-3">
                  <CashBell />
                  <ToolsMenu />
                  <div>
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

function Logo() {
  return (
    <img src="/driven-logo.png" alt="Driven Auto Care" className="h-11 w-auto brightness-0 invert" />
  );
}

function applySession(session: { personId: string; role: string } | null) {
  if (!session) {
    useBoard.setState({ viewer: "guest", lens: "owner" });
    return;
  }
  if (session.role === "owner") {
    useBoard.setState({ viewer: "owner", lens: "owner" });
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
