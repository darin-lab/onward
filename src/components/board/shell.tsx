import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { pinSignIn, pinSignOut, pinStatus } from "@/lib/board/pin.functions";
import { fieldClass } from "@/components/board/ui";
import { useBoard } from "@/lib/board/store";
import { ToolsMenu } from "@/components/board/roster";

type Session = { personId: string; role: string; name: string };

export function Shell({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [receiptMail, setReceiptMail] = useState(import.meta.env.DEV);

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

  if (receiptMail) return <ReceiptSample onClose={() => setReceiptMail(false)} />;

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

function ReceiptSample({ onClose }: { onClose: () => void }) {
  return (
    <div className="min-h-screen bg-[#ece7df] text-[#1e1a16]" style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>
      <div className="mx-auto max-w-[640px] bg-white">
        <div className="border-b border-[#e6e0d6] px-5 py-4" style={{ fontFamily: "Arial, sans-serif" }}>
          <p className="text-lg font-bold">Regional Manager - Receipts - 10-27-2026</p>
          <p className="mt-2 text-[13px] text-[#5c564e]">To: accounting@drivenautocare.com, darin@drivenautocare.com</p>
        </div>
        <div className="bg-[#f6f1e8] px-3 py-6">
          <div className="mx-auto max-w-[560px] overflow-hidden rounded-xl border border-[#e6e0d6] bg-[#fffdf8]">
            <div className="h-2 bg-[#c42230]" />
            <div className="px-5 pt-5 pb-2">
              <p className="text-[13px] tracking-[0.08em] text-[#5c564e] uppercase">Driven Auto Care</p>
              <h1 className="mt-1 text-[28px] font-semibold">Receipts</h1>
              <p className="mt-1 text-[15px] text-[#5c564e]">Tuesday, October 27, 2026</p>
            </div>
            <div className="px-5 pt-2 pb-5">
              <SampleReceipt amount="$18.42" note="Shop towels and wipes" />
              <SampleReceipt amount="$64.10" note="Lunch for the Campbell crew" />
              <p className="mt-4 text-lg font-bold">Total $82.52</p>
              <p className="mt-4 text-[13px] text-[#5c564e]">Attachments</p>
              <div className="mt-2 flex flex-wrap gap-3">
                <Attachment name="receipt-1.jpg" />
                <Attachment name="receipt-2.jpg" />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="px-5 py-4 text-center">
        <button type="button" className="text-sm text-[#5c564e] underline" onClick={onClose}>
          Back to the app
        </button>
      </div>
    </div>
  );
}

function SampleReceipt({ amount, note }: { amount: string; note: string }) {
  return (
    <div className="border-b border-[#e6e0d6] py-3.5">
      <p className="text-lg font-bold">{amount}</p>
      <p className="mt-1.5 text-[15px] leading-snug">{note}</p>
      <p className="mt-1.5 text-[13px] text-[#5c564e]">Darin Dinis</p>
      <div className="mt-2.5 h-24 w-24 rounded-lg border border-[#e6e0d6] bg-[#efe8dc]" />
    </div>
  );
}

function Attachment({ name }: { name: string }) {
  return (
    <div className="w-28 overflow-hidden rounded-md border border-[#e6e0d6] bg-white" style={{ fontFamily: "Arial, sans-serif" }}>
      <div className="h-16 bg-[#efe8dc]" />
      <p className="truncate px-2 py-1 text-[11px] text-[#5c564e]">{name}</p>
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
