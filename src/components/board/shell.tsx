import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { pinSignIn, pinSignOut, pinStatus } from "@/lib/board/pin.functions";
import { useBoard } from "@/lib/board/store";
import { fieldClass } from "@/components/board/ui";

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <div className="h-1.5 bg-honey" />
      <div className="mx-auto w-full max-w-3xl px-5 pt-5 pb-24">
        <Header />
        {children}
      </div>
    </div>
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

function Header() {
  const [name, setName] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void pinStatus()
      .then((session) => {
        applySession(session);
        setName(session?.name ?? null);
      })
      .catch(() => applySession(null))
      .finally(() => setReady(true));
  }, []);

  return (
    <header className="mb-8 flex items-start justify-between gap-4">
      <Link to="/" className="shrink-0">
        <img
          src="/driven-logo.png"
          alt="Driven Auto Care"
          className="h-11 w-auto brightness-0 invert"
        />
      </Link>
      {ready ? (
        name ? (
          <div className="text-right">
            <p className="text-sm text-ink">{name}</p>
            <button
              type="button"
              className="text-xs text-muted underline-offset-4 hover:underline"
              onClick={() => {
                void pinSignOut().then(() => {
                  applySession(null);
                  setName(null);
                });
              }}
            >
              Sign out
            </button>
          </div>
        ) : (
          <PinSignIn
            onSignedIn={(session) => {
              applySession(session);
              setName(session.name);
            }}
          />
        )
      ) : null}
    </header>
  );
}

function PinSignIn({
  onSignedIn,
}: {
  onSignedIn: (session: { personId: string; role: string; name: string }) => void;
}) {
  const [pin, setPin] = useState("");
  const [failed, setFailed] = useState(false);
  return (
    <form
      className="w-28"
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
        inputMode="numeric"
        autoComplete="off"
        maxLength={4}
        value={pin}
        onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
        placeholder="PIN"
        aria-label="PIN"
        className={fieldClass}
      />
      {failed ? <p className="mt-1 text-xs text-honey">That PIN did not match.</p> : null}
    </form>
  );
}
