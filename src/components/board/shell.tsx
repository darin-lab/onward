import type { ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useBoard } from "@/lib/board/store";

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

function Header() {
  const viewer = useBoard((state) => state.viewer);
  const setViewer = useBoard((state) => state.setViewer);
  const techs = useBoard((state) => state.techs);
  const shops = useBoard((state) => state.shops);
  const navigate = useNavigate();
  const managers = techs.filter((person) => person.kind === "manager");
  const technicians = techs.filter((person) => person.kind === "technician");

  return (
    <header className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <Link to="/" className="shrink-0">
        <img
          src="/driven-logo.png"
          alt="Driven Auto Care"
          className="h-11 w-auto brightness-0 invert"
        />
      </Link>
      <div className="min-w-0 sm:max-w-xs sm:flex-1">
        <label className="block">
          <span className="mb-1 block text-xs text-muted">See it as</span>
          <select
            value={viewer || "owner"}
            onChange={(event) => {
              const next = event.target.value;
              setViewer(next);
              const person = techs.find((item) => item.id === next);
              if (person?.kind === "technician") {
                void navigate({ to: "/t/$techId", params: { techId: person.id } });
                return;
              }
              void navigate({ to: "/" });
            }}
            className="min-h-11 w-full rounded-md bg-raised px-3 text-sm text-ink shadow-border"
          >
            <option value="owner">You, all locations</option>
            <optgroup label="General managers">
              {managers.map((person) => {
                const shop = shops.find((item) => item.id === person.shopId);
                return (
                  <option key={person.id} value={person.id}>
                    {person.name}
                    {shop ? ` — ${shop.name}` : ""}
                  </option>
                );
              })}
            </optgroup>
            <optgroup label="Technicians">
              {technicians.map((person) => {
                const shop = shops.find((item) => item.id === person.shopId);
                return (
                  <option key={person.id} value={person.id}>
                    {person.name}
                    {shop ? ` — ${shop.name}` : ""}
                  </option>
                );
              })}
            </optgroup>
          </select>
        </label>
        <p className="mt-1 text-xs text-muted">A test look. The live board won't have this switch.</p>
      </div>
    </header>
  );
}