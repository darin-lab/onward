import { loadBoard, saveBoard, saveWeek, type BoardSnapshot } from "@/lib/board/board.functions";
import type { WeekLog } from "@/lib/board/model";
import { sampleReflections } from "@/components/board/phone-call";
import { seedCategories, seedShops } from "@/lib/board/seed";
import { useBoard } from "@/lib/board/store";

function snapshot(): BoardSnapshot {
  const state = useBoard.getState();
  return {
    shops: state.shops,
    categories: state.categories,
    techs: state.techs,
    weeks: state.weeks,
    dayReports: state.dayReports,
    calls: state.calls ?? [],
    cashTransfers: state.cashTransfers ?? [],
    sampleCrew: state.sampleCrew,
    prelaunchCleared: true,
  };
}

let ready = false;
let lastSaved = "";
let timer: ReturnType<typeof setTimeout> | null = null;

function scheduleSave() {
  if (!ready) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    const next = snapshot();
    const encoded = JSON.stringify(next);
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
      await saveBoard({ data: snapshot() });
    }
  } else {
    useBoard.setState({ weeks: [] });
    await saveBoard({ data: snapshot() });
  }
  if (import.meta.env.DEV) {
    const fresh = sampleReflections();
    const current = useBoard.getState().calls ?? [];
    const rest = current.filter((call) => !call.sample && !fresh.some((item) => item.id === call.id));
    useBoard.setState({ calls: [...rest, ...fresh] });
  }
  lastSaved = JSON.stringify(snapshot());
  ready = true;
  useBoard.setState({ boardReady: true });
  useBoard.subscribe(() => scheduleSave());
}

export async function flushSharedBoard() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (!ready) return false;
  const next = snapshot();
  const encoded = JSON.stringify(next);
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

export async function storeWeek(week: WeekLog) {
  const result = await saveWeek({ data: week });
  const stored = result?.week;
  if (!result?.ok || !stored) return null;
  if ((week.grossProfit ?? null) !== (stored.grossProfit ?? null)) return null;
  if ((week.working ?? "") !== (stored.working ?? "")) return null;
  if ((week.practice ?? "") !== (stored.practice ?? "")) return null;
  useBoard.getState().upsertWeek(stored);
  return stored;
}
