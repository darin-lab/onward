import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <div className="h-1.5 bg-honey" />
      <div className="mx-auto w-full max-w-3xl px-5 pt-5 pb-24">
        <header className="mb-8">
          <Link to="/">
            <img
              src="/driven-logo.png"
              alt="Driven Auto Care"
              className="h-11 w-auto brightness-0 invert"
            />
          </Link>
        </header>
        {children}
      </div>
    </div>
  );
}
