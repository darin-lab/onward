import { useState } from "react";
import { Button, fieldClass } from "@/components/board/ui";
import { submitFeedback } from "@/lib/board/records.functions";
import { refreshFeedback } from "@/lib/board/shared";
import { viewingAs, writable } from "@/lib/board/view-as";

export type FeedbackFor = "darin" | "arun";

const FIRST: Record<FeedbackFor, string> = { darin: "Darin", arun: "Arun" };
const MIN = 13;

/**
 * Feedback for Darin or Arun from a manager or technician. Names are shown:
 * it is emailed to both Darin and Arun with who sent it.
 */
export function FeedbackPopup({
  about,
  fromName,
  onClose,
}: {
  about: FeedbackFor;
  fromName: string;
  onClose: () => void;
}) {
  const first = FIRST[about];
  const [helped, setHelped] = useState("");
  const [better, setBetter] = useState("");
  const [need, setNeed] = useState("");
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState("");
  const [sent, setSent] = useState(false);
  const ready = [helped, better, need].every((answer) => answer.trim().length >= MIN);

  const question = (label: string, value: string, set: (next: string) => void) => (
    <label className="mt-4 block">
      <span className="text-sm text-honey">{label}</span>
      <textarea
        value={value}
        onChange={(event) => set(event.target.value)}
        rows={3}
        placeholder="At least 13 characters"
        className={`${fieldClass} mt-1 min-h-20 py-2`}
      />
    </label>
  );

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-auto bg-black/70 p-4 pt-16">
      <div className="w-full max-w-lg rounded-md bg-canvas p-4 shadow-border">
        <div className="flex items-center justify-between gap-3">
          <p className="font-display text-lg tracking-wide text-ink uppercase italic">Feedback · {first}</p>
          <button
            type="button"
            className="font-display text-sm tracking-wide text-honey uppercase italic"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        {sent ? (
          <p className="mt-6 mb-4 text-center text-ink">Sent. Thanks for the feedback.</p>
        ) : (
          <>
            <p className="mt-1 text-sm text-muted">
              From {fromName}. Goes to Darin and Arun.
            </p>
            {question(`What did ${first} do this week that helped you?`, helped, setHelped)}
            {question(`What could ${first} do better?`, better, setBetter)}
            {question(`What do you need from ${first} right now?`, need, setNeed)}
            {problem ? <p className="mt-3 text-sm text-honey">{problem}</p> : null}
            <Button
              className="mt-5 w-full"
              disabled={!ready || sending}
              onClick={() => {
                setSending(true);
                setProblem("");
                void writable(() =>
                  submitFeedback({ data: { about, helped, better, need } }),
                )
                  .then((result) => {
                    setSent(true);
                    if (!result.mailed) setProblem("Saved. The email will go out shortly.");
                    return refreshFeedback().catch(() => undefined);
                  })
                  .catch(() =>
                    setProblem(viewingAs() ? "View only. Nothing was sent." : "That didn't send. Try again."),
                  )
                  .finally(() => setSending(false));
              }}
            >
              Send
            </Button>
            {!ready ? (
              <p className="mt-2 text-center text-xs text-muted">Each answer needs at least 13 characters.</p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
