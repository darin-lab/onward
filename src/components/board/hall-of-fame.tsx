import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { getHallOfFame } from "@/lib/board/hof.functions";
import { RECORD_METRICS, recordWhen, type ShopRecord } from "@/lib/board/hof";
import { useBoard } from "@/lib/board/store";
import { TrophyMark } from "@/components/board/ui";
import { cn } from "@/lib/cn";

export function HallOfFame() {
  const shops = useBoard((state) => state.shops);
  const [records, setRecords] = useState<ShopRecord[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [shopId, setShopId] = useState<string>(shops[0]?.id ?? "");

  useEffect(() => {
    let cancel = false;
    void getHallOfFame()
      .then((result) => {
        if (!cancel) setRecords(result.records);
      })
      .catch(() => {
        if (!cancel) setFailed(true);
      });
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    if (!shopId && shops[0]) setShopId(shops[0].id);
  }, [shops, shopId]);

  const shopName = (id: string) => shops.find((shop) => shop.id === id)?.name ?? id;
  const best = RECORD_METRICS.map((info) => {
    const top = (records ?? [])
      .filter((record) => record.metric === info.key)
      .sort((a, b) => b.value - a.value)[0];
    return { info, top };
  }).filter((item) => item.top);
  const mine = (records ?? []).filter((record) => record.shopId === shopId);

  return (
    <div>
      <Link to="/" className="text-sm text-muted">
        ← Back
      </Link>
      <p className="mt-4 font-display text-sm tracking-[0.12em] text-[#e2b33c] uppercase">Driven Onward</p>
      <h1 className="mt-1 text-4xl text-ink">Hall of Fame</h1>
      <p className="mt-2 text-muted">
        The best any shop has done in a week, from the shop dashboard. A record updates itself when it falls.
      </p>

      {failed ? <p className="mt-8 text-muted">The records did not load. Try again in a minute.</p> : null}
      {!records && !failed ? <p className="mt-8 text-muted">Loading records…</p> : null}

      {records ? (
        <>
          <h2 className="mt-10 text-2xl">Company records</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {best.map(({ info, top }) => (
              <li
                key={info.key}
                className="flex flex-col gap-1 rounded-2xl bg-surface p-4 shadow-[inset_0_0_0_1px_#4a3b12]"
              >
                <span className="flex items-center gap-2 text-sm text-muted">
                  <TrophyMark className="size-5" />
                  {info.title}
                </span>
                <span className="metal metal-gold font-display text-3xl font-semibold tabular-nums">
                  {info.format(top!.value)}
                </span>
                <span className="font-display text-lg font-semibold tracking-wide uppercase">{shopName(top!.shopId)}</span>
                <span className="text-xs text-muted">{recordWhen(top!)}</span>
              </li>
            ))}
          </ul>

          <h2 className="mt-12 text-2xl">Shop records</h2>
          <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Shop">
            {shops.map((shop) => (
              <button
                key={shop.id}
                type="button"
                aria-pressed={shop.id === shopId}
                onClick={() => setShopId(shop.id)}
                className={cn(
                  "min-h-11 rounded-full px-4 text-sm shadow-border",
                  shop.id === shopId ? "bg-honey text-white" : "bg-surface text-ink",
                )}
              >
                {shop.name}
              </button>
            ))}
          </div>
          <ul className="mt-4 space-y-2">
            {RECORD_METRICS.map((info) => {
              const record = mine.find((item) => item.metric === info.key);
              if (!record) return null;
              const company = best.find((item) => item.info.key === info.key)?.top;
              const holds = company?.shopId === shopId;
              return (
                <li
                  key={info.key}
                  className="flex min-h-14 items-center gap-3 rounded-2xl bg-surface px-4 py-2 shadow-border"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-ink">{info.title}</span>
                    <span className="block text-xs text-muted">{recordWhen(record)}</span>
                  </span>
                  {holds ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#241d0a] px-2 py-0.5 text-xs text-[#f0d68a] shadow-[inset_0_0_0_1px_#8a6a18]">
                      <TrophyMark className="size-3.5" />
                      Company record
                    </span>
                  ) : null}
                  <span className="font-display text-xl font-semibold tabular-nums">{info.format(record.value)}</span>
                </li>
              );
            })}
          </ul>
          <p className="mt-4 text-xs text-muted">
            Weeks run Monday to Sunday. Weeks under $3,000 in sales or 10 billed hours don't count toward the rates.
            Proficiency starts in late September 2026, when available hours began on the dashboard.
          </p>
        </>
      ) : null}
    </div>
  );
}
