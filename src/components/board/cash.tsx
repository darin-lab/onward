import { useState } from "react";
import { format } from "date-fns";
import { Button, fieldClass } from "@/components/board/ui";
import { formatMoney } from "@/lib/board/model";
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

export function CashPanel({
  owner,
  managerId,
  shopId,
}: {
  owner: boolean;
  managerId: string;
  shopId: string;
}) {
  const requestCash = useBoard((state) => state.requestCash);
  const updateCash = useBoard((state) => state.updateCash);
  const deleteCash = useBoard((state) => state.deleteCash);
  const transfers = useBoard((state) => state.cashTransfers ?? []);
  const shops = useBoard((state) => state.shops);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [place, setPlace] = useState(shopId);
  const [openId, setOpenId] = useState<string | null>(null);
  const [picked, setPicked] = useState("");
  const ready = readAmount(amount);
  const chosenShop = owner ? place : shopId;
  const rows = [...transfers]
    .filter((item) => (owner || item.shopId === shopId) && !item.deletedAt)
    .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))
    .slice(0, 10);

  return (
    <div>
      <Button tone={open ? "honey" : "quiet"} onClick={() => setOpen((current) => !current)}>
        Request a Pickup
      </Button>
      {open ? (
        <div className="mt-4">
          {owner ? (
            <label className="block text-sm text-ink">
              Shop
              <select
                value={chosenShop}
                onChange={(event) => setPlace(event.target.value)}
                className={cn(fieldClass, "mt-2")}
              >
                {shops.map((shop) => (
                  <option key={shop.id} value={shop.id}>
                    {shop.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="mt-3 block text-sm text-ink">
            Amount
            <input
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className={cn(fieldClass, "mt-2")}
            />
          </label>
          <Button
            className="mt-3"
            disabled={!ready || !chosenShop}
            onClick={() => {
              if (!ready || !chosenShop) return;
              requestCash({
                id: `cash-${Date.now()}`,
                shopId: chosenShop,
                managerId,
                kind: "pickup",
                requested: ready,
                pickedUp: null,
                requestedAt: new Date().toISOString(),
                pickedUpAt: null,
              });
              setAmount("");
              setOpen(false);
            }}
          >
            Submit
          </Button>
        </div>
      ) : null}
      <ul className="mt-5 space-y-2">
        {rows.length === 0 ? <li className="text-sm text-muted">No cash entries yet.</li> : null}
        {rows.map((item) => {
          const shop = shops.find((place) => place.id === item.shopId);
          const done = item.pickedUp != null;
          const pickupAmount = readAmount(picked);
          return (
            <li key={item.id}>
              <div className="flex items-start justify-between gap-3">
              <button
                type="button"
                className="flex min-w-0 items-center gap-2 text-left text-sm text-ink"
                onClick={() => {
                  if (!owner || done) return;
                  setOpenId(openId === item.id ? null : item.id);
                  setPicked(item.pickedUp == null ? "" : String(item.pickedUp));
                }}
              >
                <span
                  className={cn("h-2.5 w-2.5 shrink-0 rounded-full", done ? "bg-[#2f9e62]" : "bg-[#c42230]")}
                  aria-hidden="true"
                />
                <span className="min-w-0 truncate">
                  {format(new Date(item.requestedAt), "MMM d")}
                  {shop ? ` · ${shop.name}` : ""}
                  {" · "}
                  {item.kind === "dropoff" ? "Drop off" : "Pickup"} {formatMoney(item.requested)}
                  {done ? ` · ${formatMoney(item.pickedUp ?? 0)}` : ""}
                </span>
              </button>
              {owner ? (
                <button
                  type="button"
                  className="shrink-0 text-sm text-muted"
                  onClick={() => deleteCash(item.id)}
                >
                  Delete
                </button>
              ) : null}
              </div>
              {owner && openId === item.id && !done ? (
                <div className="mt-2 flex flex-wrap items-center gap-2 pl-5">
                  <input
                    inputMode="decimal"
                    aria-label="Amount picked up"
                    placeholder="Amount picked up"
                    value={picked}
                    onChange={(event) => setPicked(event.target.value)}
                    className={cn(fieldClass, "max-w-40")}
                  />
                  <Button
                    disabled={!pickupAmount}
                    onClick={() => {
                      if (!pickupAmount) return;
                      updateCash(item.id, item.requested, pickupAmount);
                      setOpenId(null);
                    }}
                  >
                    Save
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
