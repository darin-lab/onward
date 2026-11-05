import { listWeeks, loadBoard, saveBoard, saveWeek, type BoardSnapshot } from "@/lib/board/board.functions";
import { feedbackStatus, listCalls, listCash } from "@/lib/board/records.functions";
import { isOwnerViewer, type WeekLog } from "@/lib/board/model";
import { seedCategories, seedShops } from "@/lib/board/seed";
import { useBoard } from "@/lib/board/store";
import { viewingAs, writable } from "@/lib/board/view-as";

function snapshot(): BoardSnapshot {
  const state = useBoard.getState();
  return {
    shops: state.shops,
    categories: state.categories,
    techs: state.techs,
    // The server keeps reviews, calls, cash and End of Day reports in their own
    // tables; the board save only carries shops, habits and the crew.
    weeks: [],
    dayReports: [],
    calls: [],
    cashTransfers: [],
    sampleCrew: state.sampleCrew,
    prelaunchCleared: true,
  };
}

function boardKey(next: BoardSnapshot) {
  return JSON.stringify([next.shops, next.categories, next.techs, next.sampleCrew]);
}

let ready = false;
let lastSaved = "";
let timer: ReturnType<typeof setTimeout> | null = null;

function scheduleSave() {
  if (!ready) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    // Only Darin and Arun change shops, habits and the crew, and never while
    // they are viewing the app as someone else.
    if (viewingAs() || !isOwnerViewer(useBoard.getState().viewer)) return;
    const next = snapshot();
    const encoded = boardKey(next);
    if (encoded === lastSaved) return;
    lastSaved = encoded;
    void saveBoard({ data: next }).catch(() => {
      lastSaved = "";
    });
  }, 400);
}

let connecting: Promise<void> | null = null;

export function connectSharedBoard() {
  if (!connecting) {
    connecting = connect().catch((error) => {
      connecting = null;
      throw error;
    });
  }
  return connecting;
}

async function connect() {
  const remote = await loadBoard();
  if (remote) {
    const { prelaunchCleared: _prelaunchCleared, ...rest } = remote;
    const managerEmails: Record<string, string> = {
      "san-ramon": "sanramon@drivenautocare.com",
      "castro-valley": "castrovalley@drivenautocare.com",
      fremont: "fremont@drivenautocare.com",
      campbell: "campbell@drivenautocare.com",
      "san-jose": "sanjose@drivenautocare.com",
    };
    const techs = rest.techs.map((tech) => {
      let next = tech;
      if (tech.id === "dillon" || tech.name === "Dillon Hurst") next = { ...next, name: "Dillon Horst" };
      if (tech.id === "kevin" || tech.name === "Kevin") next = { ...next, name: "Kevin Nguyen" };
      if (next.kind === "manager" && !next.email && managerEmails[next.shopId]) {
        next = { ...next, email: managerEmails[next.shopId] };
      }
      return next;
    });
    const named = techs.filter((tech) => tech.id !== "andre" && tech.name !== "Andre Pastores");
    const roster = named.some((tech) => tech.id === "duy")
      ? named
      : [
          ...named,
          {
            id: "duy",
            name: "Duy Nguyen",
            role: "Technician",
            email: "",
            kind: "technician" as const,
            shopId: "campbell",
          },
        ];
    const weeks = rest.weeks.filter((week) => week.techId !== "andre");
    const changed =
      roster.length !== rest.techs.length ||
      roster.some((tech, index) => {
        const previous = rest.techs[index];
        return tech.id !== previous?.id || tech.name !== previous?.name || tech.email !== (previous?.email ?? "");
      }) ||
      weeks.length !== rest.weeks.length;
    const categories = rest.categories.map((category) => {
      if (category.kind !== "manager") return category;
      const seed = seedCategories.find((item) => item.id === category.id);
      return seed ? { ...category, name: seed.name, hint: seed.hint } : category;
    });
    for (const seed of seedCategories.filter((item) => item.kind === "manager")) {
      if (!categories.some((category) => category.id === seed.id)) categories.push(seed);
    }
    const habitsChanged = categories.some((category, index) => {
      const previous = rest.categories[index];
      return category.name !== previous?.name || category.hint !== previous?.hint;
    });
    const shops = rest.shops.map((shop) => {
      const known = seedShops.find((item) => item.id === shop.id);
      return known ? { ...shop, address: known.address } : shop;
    });
    const addressChanged = shops.some((shop, index) => shop.address !== rest.shops[index]?.address);
    useBoard.setState({
      ...rest,
      shops,
      techs: roster,
      categories,
      weeks,
    });
    if (changed || habitsChanged || addressChanged) {
      await saveBoard({ data: snapshot() }).catch(() => undefined);
    }
  } else {
    useBoard.setState({ weeks: [] });
    await saveBoard({ data: snapshot() }).catch(() => undefined);
  }
  lastSaved = boardKey(snapshot());
  for (const week of useBoard.getState().weeks) synced.set(weekKey(week), JSON.stringify(week));
  ready = true;
  useBoard.setState({ boardReady: true, calls: [], cashTransfers: [], dayReports: [] });
  void refreshRecords();
  useBoard.subscribe(() => {
    scheduleSave();
    scheduleWeekSave();
  });
  startLiveWeeks();
}

/**
 * Pull reviews other people saved, so the leaderboard, ranks and the
 * manager's review notices update without a reload. A review with unsaved
 * edits on this page is left alone.
 */
export async function refreshWeeks() {
  if (!ready) return;
  const remote = await listWeeks();
  const state = useBoard.getState();
  const byKey = new Map(state.weeks.map((week) => [weekKey(week), week]));
  let changed = false;
  for (const week of remote) {
    const key = weekKey(week);
    const local = byKey.get(key);
    const encoded = JSON.stringify(week);
    if (local) {
      const seen = synced.get(key);
      // A blank week opened on this page but never saved is not an edit.
      const dirty = seen === undefined ? !untouched(local) : seen !== JSON.stringify(local);
      if (dirty || JSON.stringify(local) === encoded) continue;
      if ((local.updatedAt ?? "") > (week.updatedAt ?? "")) continue;
    }
    byKey.set(key, week);
    synced.set(key, encoded);
    changed = true;
  }
  if (changed) useBoard.setState({ weeks: [...byKey.values()] });
}

let live = false;

function startLiveWeeks() {
  if (live || typeof window === "undefined") return;
  live = true;
  const tick = () => {
    if (document.visibilityState !== "visible") return;
    void refreshWeeks().catch(() => undefined);
  };
  window.setInterval(tick, 30_000);
  window.addEventListener("focus", tick);
  document.addEventListener("visibilitychange", tick);
}

/** Pull this person's waiting call reflections and recent cash pickups. */
export async function refreshRecords() {
  const [calls, cash] = await Promise.all([
    listCalls().catch(() => null),
    listCash().catch(() => null),
  ]);
  if (calls) useBoard.setState({ calls });
  if (cash) useBoard.setState({ cashTransfers: cash });
  await refreshFeedback().catch(() => undefined);
}

/** Whether a manager still owes Wednesday feedback for Darin or Arun. */
export async function refreshFeedback() {
  const status = await feedbackStatus();
  useBoard.setState({ feedbackDue: Boolean(status?.due) });
  return status;
}

export async function refreshCalls() {
  const calls = await listCalls();
  useBoard.setState({ calls });
  return calls;
}

export async function refreshCash() {
  const cashTransfers = await listCash();
  useBoard.setState({ cashTransfers });
  return cashTransfers;
}

/* Reviews also save on their own a moment after an edit, one row at a time,
   so leaving the page without pressing Save does not lose the work. */
const synced = new Map<string, string>();
let weekTimer: ReturnType<typeof setTimeout> | null = null;

function weekKey(week: WeekLog) {
  return `${week.techId}:${week.weekStart}`;
}

function untouched(week: WeekLog) {
  return (
    week.billedHours == null &&
    week.cars == null &&
    week.totalRecommendations == null &&
    week.hoursPerRepairOrder == null &&
    week.grossProfit == null &&
    week.serviceHours == null &&
    !week.working &&
    !week.practice &&
    !week.billedNote &&
    !week.carsNote &&
    !week.recsNote &&
    !week.efficiencyNote &&
    week.boomerangs == null &&
    !week.reviewStage &&
    !week.darinReady &&
    !week.arunReady
  );
}

function scheduleWeekSave() {
  if (!ready) return;
  if (weekTimer) clearTimeout(weekTimer);
  weekTimer = setTimeout(() => {
    weekTimer = null;
    const state = useBoard.getState();
    if (state.viewAs) return;
    const person = state.techs.find((tech) => tech.id === state.viewer);
    if (!isOwnerViewer(state.viewer) && person?.kind !== "manager") return;
    for (const week of state.weeks) {
      const encoded = JSON.stringify(week);
      if (synced.get(weekKey(week)) === encoded) continue;
      if (!synced.has(weekKey(week)) && untouched(week)) continue;
      synced.set(weekKey(week), encoded);
      void storeWeek(week).catch(() => synced.delete(weekKey(week)));
    }
  }, 1500);
}

export async function flushSharedBoard() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (!ready) return false;
  if (viewingAs() || !isOwnerViewer(useBoard.getState().viewer)) return true;
  const next = snapshot();
  const encoded = boardKey(next);
  if (encoded === lastSaved) return true;
  lastSaved = encoded;
  try {
    await saveBoard({ data: next });
    return true;
  } catch {
    lastSaved = "";
    return false;
  }
}

/**
 * Saves one review. The server merges it with what is stored (see saveWeek),
 * so the week that comes back is the one to show.
 */
export async function storeWeek(week: WeekLog) {
  const sent = JSON.stringify(week);
  const result = await writable(() => saveWeek({ data: week }));
  const stored = result?.week;
  if (!result?.ok || !stored) return null;
  const current = useBoard
    .getState()
    .weeks.find((item) => item.techId === week.techId && item.weekStart === week.weekStart);
  // Don't overwrite something typed while the save was on its way.
  if (!current || JSON.stringify(current) === sent || result.locked) {
    synced.set(weekKey(stored), JSON.stringify(stored));
    useBoard.getState().upsertWeek(stored);
  }
  return stored;
}
