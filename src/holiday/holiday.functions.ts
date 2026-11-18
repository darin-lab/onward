// Holiday Party RSVP server functions. Temporary feature: see ./README.md for removal.
import { createServerFn } from "@tanstack/react-start";
import type { HolidayState, RsvpAnswer } from "@/holiday/types";

/** Never throws: an inactive state hides the button and pop-ups. */
export const holidayState = createServerFn({ method: "GET" }).handler(async (): Promise<HolidayState> => {
  try {
    const s = await import("@/holiday/holiday.server");
    if (!s.isActive()) return { active: false };
    const { currentViewer } = await import("@/lib/board/darin.server");
    const viewer = await currentViewer();
    if (!viewer) return { active: false };
    const sql = await s.holidaySql();
    return await s.buildState(sql, viewer);
  } catch {
    return { active: false };
  }
});

export const holidayAnswer = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const d = (input ?? {}) as { personId?: unknown; answer?: unknown; attending?: unknown };
    const answer = d.answer;
    if (answer !== "yes" && answer !== "maybe" && answer !== "no") throw new Error("Pick yes, maybe or no");
    const attending = Math.round(Number(d.attending));
    return {
      personId: typeof d.personId === "string" ? d.personId.slice(0, 200) : "",
      answer: answer as RsvpAnswer,
      attending: Number.isFinite(attending) ? Math.max(1, Math.min(20, attending)) : 1,
    };
  })
  .handler(async ({ data }) => {
    const s = await import("@/holiday/holiday.server");
    if (!s.isActive()) throw new Error("The RSVP is closed");
    const { requireViewer } = await import("@/lib/board/darin.server");
    const viewer = await requireViewer();
    const sql = await s.holidaySql();
    const personId = data.personId || viewer.personId;
    if (!(await s.canAnswerFor(sql, viewer, personId))) throw new Error("Not allowed");
    await s.saveAnswer(sql, personId, data.answer, data.attending, viewer.personId);
    return s.buildState(sql, viewer);
  });

export const holidaySeen = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const d = (input ?? {}) as { kind?: unknown };
    return { kind: d.kind === "team" ? ("team" as const) : ("invite" as const) };
  })
  .handler(async ({ data }) => {
    const s = await import("@/holiday/holiday.server");
    if (!s.isActive()) return { ok: false };
    const { requireViewer } = await import("@/lib/board/darin.server");
    const viewer = await requireViewer();
    await s.markSeen(await s.holidaySql(), viewer.personId, data.kind);
    return { ok: true };
  });
