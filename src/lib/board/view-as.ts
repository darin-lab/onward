import { useBoard } from "@/lib/board/store";

/**
 * Darin and Arun can look at the app as any manager or technician. That view
 * is read-only: nothing is saved, sent or marked read while it is on, so
 * reminders, call reflections and review notices stay exactly as they were.
 */
export function viewingAs() {
  return useBoard.getState().viewAs != null;
}

export function startViewAs(ownerId: string, personId: string) {
  if (personId === ownerId) {
    stopViewAs();
    return;
  }
  useBoard.setState({ viewAs: ownerId });
  useBoard.getState().setViewer(personId);
}

/** Leaving the view reloads, so nothing typed while viewing can save later. */
export function stopViewAs() {
  if (typeof window !== "undefined") window.location.reload();
}

/** Run a save or send, unless this is a view-only look as someone else. */
export function writable<T>(work: () => Promise<T>): Promise<T> {
  if (viewingAs()) return Promise.reject(new Error("View only"));
  return work();
}
