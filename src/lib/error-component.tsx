import { useEffect } from "react";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";

const FALLBACK_MESSAGE = "An unexpected error occurred. Try reloading the page.";

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return FALLBACK_MESSAGE;
}

function staleBundle(message: string) {
  return /dynamically imported module|module script failed|Importing a module script failed/i.test(message);
}

export function AppErrorComponent({ error }: ErrorComponentProps) {
  const message = errorMessage(error);
  useEffect(() => {
    if (!staleBundle(message)) return;
    const key = "onward-reload";
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    window.location.reload();
  }, [message]);

  return (
    <main
      className={
        "flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center " +
        "bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50"
      }
    >
      <span className="text-red-500" aria-hidden="true">
        <TriangleAlert className="size-10" strokeWidth={2} />
      </span>
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="max-w-md text-sm break-words text-zinc-500 dark:text-zinc-400">{message}</p>
      {staleBundle(message) ? (
        <button
          type="button"
          className="mt-2 text-sm underline"
          onClick={() => {
            sessionStorage.removeItem("onward-reload");
            window.location.reload();
          }}
        >
          Reload
        </button>
      ) : null}
    </main>
  );
}