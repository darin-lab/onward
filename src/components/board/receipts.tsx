import { useEffect, useRef, useState } from "react";
import { addReceipt, listReceipts } from "@/lib/board/receipt.functions";
import { formatMoney } from "@/lib/board/model";
import { Button, fieldClass } from "@/components/board/ui";

type Waiting = { id: string; total: number; note: string; day: string; imageName: string | null };

export function ReceiptDesk() {
  const [total, setTotal] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [waiting, setWaiting] = useState<Waiting[]>([]);
  const library = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);

  const refresh = () => {
    void listReceipts()
      .then(setWaiting)
      .catch(() => setWaiting([]));
  };

  useEffect(() => {
    refresh();
  }, []);

  const amount = Number(total);
  const ready = Number.isFinite(amount) && amount > 0 && note.trim().length > 0 && file != null && !busy;

  return (
    <div>
      <label className="block text-sm text-ink" htmlFor="receipt-total">
        Total
        <input
          id="receipt-total"
          inputMode="decimal"
          value={total}
          onChange={(event) => setTotal(event.target.value)}
          className={`${fieldClass} mt-2`}
        />
      </label>
      <label className="mt-4 block text-sm text-ink" htmlFor="receipt-note">
        What was it for?
        <textarea
          id="receipt-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className={`${fieldClass} mt-2 min-h-24 py-2`}
        />
      </label>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button tone="quiet" onClick={() => library.current?.click()}>
          Add receipt
        </Button>
        <Button tone="quiet" onClick={() => camera.current?.click()}>
          Use camera
        </Button>
      </div>
      <input
        ref={library}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(event) => setFile(event.target.files?.[0] ?? null)}
      />
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => setFile(event.target.files?.[0] ?? null)}
      />
      {file ? <p className="mt-3 text-sm text-muted">{file.name}</p> : null}
      <Button
        className="mt-4"
        disabled={!ready}
        onClick={() => {
          if (!file || !ready) return;
          setBusy(true);
          setMessage("");
          void packFile(file)
            .then((packed) =>
              addReceipt({
                data: {
                  total: amount,
                  note: note.trim(),
                  image: packed.data,
                  imageType: packed.type,
                  imageName: packed.name,
                },
              }),
            )
            .then((result) => {
              setTotal("");
              setNote("");
              setFile(null);
              setMessage(
                result.mailed
                  ? "Saved and emailed to you and accounting."
                  : "Saved. The email did not go out. The receipt is still here.",
              );
              refresh();
            })
            .catch(() => setMessage("That receipt did not save."))
            .finally(() => setBusy(false));
        }}
      >
        {busy ? "Saving" : "Save receipt"}
      </Button>
      {message ? <p className="mt-3 text-sm text-muted">{message}</p> : null}
      {waiting.length > 0 ? (
        <ul className="mt-5 space-y-3">
          {waiting.map((item) => (
            <li key={item.id} className="text-sm">
              <p className="font-display text-lg font-semibold tabular-nums text-ink">{formatMoney(item.total)}</p>
              <p className="text-ink">{item.note}</p>
              <p className="text-muted">{item.day}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-5 text-sm text-muted">Nothing is waiting to send.</p>
      )}
    </div>
  );
}

export function ReceiptMark() {
  return (
    <svg viewBox="0 0 24 28" className="h-5 w-4" aria-hidden="true">
      <path d="M5 2 h14 a2 2 0 0 1 2 2 v21 l-2.2-1.4 -2.2 1.4 -2.2-1.4 -2.2 1.4 -2.2-1.4 -2.2 1.4 -2.2-1.4 V4 a2 2 0 0 1 2-2z" fill="#f4f4f4" />
      <path d="M8 8 h8 M8 12 h8 M8 16 h5" stroke="#1e1a16" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function readData(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result ?? "");
      const comma = raw.indexOf(",");
      resolve(comma >= 0 ? raw.slice(comma + 1) : raw);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function packFile(file: File) {
  if (file.type.startsWith("image/")) {
    const blob = await shrinkImage(file);
    return { data: await readData(blob), type: "image/jpeg", name: file.name.replace(/\.\w+$/, "") + ".jpg" };
  }
  if (file.size > 2_000_000) throw new Error("That file is too large");
  return { data: await readData(file), type: file.type || "application/pdf", name: file.name };
}

function shrinkImage(file: File) {
  return new Promise<Blob>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, 1400 / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext("2d");
      if (!context) {
        URL.revokeObjectURL(url);
        reject(new Error("Could not read that photo"));
        return;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url);
          if (!blob) reject(new Error("Could not read that photo"));
          else resolve(blob);
        },
        "image/jpeg",
        0.72,
      );
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that photo"));
    };
    image.src = url;
  });
}
