import { useState } from "react";
import { format } from "date-fns";
import { Button, Card, fieldClass } from "@/components/board/ui";
import { formatMoney, isOwnerViewer, type CashTransfer } from "@/lib/board/model";
import { useBoard } from "@/lib/board/store";
import { cn } from "@/lib/cn";

function readAmount(value: string) {
  const amount = Number(value.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100) / 100;
}

export function Bills() {
  return (
    <svg viewBox="0 0 36 28" className="h-5 w-7" aria-hidden="true">
      <rect x="4" y="8" width="28" height="16" rx="2" fill="#1f6b45" stroke="#d7efe2" strokeWidth="1" />
      <rect x="2" y="5" width="28" height="16" rx="2" fill="#248656" stroke="#e7f6ee" strokeWidth="1" />
      <rect x="0" y="2" width="28" height="16" rx="2" fill="#2f9e62" stroke="#f3fff8" strokeWidth="1" />
      <circle cx="14" cy="10" r="4.2" fill="none" stroke="#f4f4f4" strokeWidth="1.2" />
      <text x="14" y="12.4" textAnchor="middle" fontSize="6" fill="#f4f4f4">
        $
      </text>
    </svg>
  );
}

export function CashRequest({
  managerId,
  shopId,
  embedded = false,
}: {
  managerId: string;
  shopId: string;
  embedded?: boolean;
}) {
  const requestCash = useBoard((state) => state.requestCash);
  const transfers = useBoard((state) => state.cashTransfers ?? []);
  const shops = useBoard((state) => state.shops);
  const [open, setOpen] = useState(embedded);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const shop = shops.find((item) => item.id === shopId);
  const mine = transfers
    .filter((item) => item.managerId === managerId)
    .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  const ready = readAmount(amount);
  const form = (
    <Card className={embedded ? "mt-2" : "mt-4"}>
      <label className="block text-sm text-ink" htmlFor="cash-request">
        How much cash needs to be picked up?
        <input
          id="cash-request"
          inputMode="decimal"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          className={cn(fieldClass, "mt-2")}
        />
      </label>
      <Button
        className="mt-4"
        disabled={!ready}
        onClick={() => {
          if (!ready) return;
          requestCash({
            id: `cash-${Date.now()}`,
            shopId,
            managerId,
            requested: ready,
            pickedUp: null,
            requestedAt: new Date().toISOString(),
            pickedUpAt: null,
          });
          setAmount("");
          setNote("Request sent.");
          if (!embedded) setOpen(false);
        }}
      >
        Send request
      </Button>
      {note ? <p className="mt-3 text-sm text-muted">{note}</p> : null}
      <CashList items={mine} shopName={shop?.name ?? ""} />
    </Card>
  );
  if (embedded) return form;
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "inline-flex min-h-12 items-center gap-3 rounded-md bg-raised px-3 font-display text-sm tracking-wide text-ink uppercase italic shadow-border",
          open && "text-honey",
        )}
      >
        <Bills />
        Cash Transfer
      </button>
      {open ? form : null}
    </div>
  );
}

export function CashDesk() {
  const transfers = useBoard((state) => state.cashTransfers ?? []);
  const recordPickup = useBoard((state) => state.recordPickup);
  const techs = useBoard((state) => state.techs);
  const shops = useBoard((state) => state.shops);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const ordered = [...transfers].sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  const waiting = ordered.filter((item) => item.pickedUp == null);

  return (
    <Card className="mt-4">
      <p className="text-sm text-muted">Cash transfers</p>
      {waiting.length === 0 ? <p className="mt-3 text-sm text-ink">No pickups waiting.</p> : null}
      <ul className="mt-3 space-y-4">
        {ordered.map((item) => {
          const manager = techs.find((person) => person.id === item.managerId);
          const shop = shops.find((place) => place.id === item.shopId);
          const draft = amounts[item.id] ?? "";
          const ready = readAmount(draft);
          return (
            <li key={item.id} className="text-sm">
              <p className="text-ink">
                {shop?.name ?? "Shop"} · {manager?.name ?? "Manager"}
              </p>
              <p className="text-muted">
                {format(new Date(item.requestedAt), "MMM d, yyyy")} · Requested {formatMoney(item.requested)}
                {item.pickedUp != null ? ` · Picked up ${formatMoney(item.pickedUp)}` : ""}
              </p>
              {item.pickedUp == null ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    inputMode="decimal"
                    aria-label="Amount picked up"
                    placeholder="Amount picked up"
                    value={draft}
                    onChange={(event) =>
                      setAmounts((current) => ({ ...current, [item.id]: event.target.value }))
                    }
                    className={cn(fieldClass, "max-w-48")}
                  />
                  <Button
                    disabled={!ready}
                    onClick={() => {
                      if (!ready) return;
                      recordPickup(item.id, ready);
                    }}
                  >
                    Save pickup
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export function CashBell() {
  const viewer = useBoard((state) => state.viewer);
  const transfers = useBoard((state) => state.cashTransfers ?? []);
  const [open, setOpen] = useState(false);
  if (!isOwnerViewer(viewer)) return null;
  const waiting = transfers.filter((item) => item.pickedUp == null);
  if (waiting.length === 0 && !open) return null;
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-raised text-ink"
        aria-label="Cash transfer"
        onClick={() => setOpen((current) => !current)}
      >
        <Bills />
      </button>
      {waiting.length > 0 ? (
        <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-honey px-1 text-[10px] font-semibold text-white">
          {waiting.length}
        </span>
      ) : null}
      {open ? (
        <div className="absolute top-11 right-0 z-30 w-[min(100vw-2.5rem,24rem)] text-left">
          <CashDesk />
        </div>
      ) : null}
    </span>
  );
}

function CashList({ items, shopName }: { items: CashTransfer[]; shopName: string }) {
  if (items.length === 0) return null;
  return (
    <ul className="mt-4 space-y-2">
      {items.map((item) => (
        <li key={item.id} className="text-sm text-muted">
          <span className="text-ink">{format(new Date(item.requestedAt), "MMM d")}</span>
          {shopName ? ` · ${shopName}` : ""} · Requested {formatMoney(item.requested)}
          {item.pickedUp == null ? " · waiting" : ` · Picked up ${formatMoney(item.pickedUp)}`}
        </li>
      ))}
    </ul>
  );
}
