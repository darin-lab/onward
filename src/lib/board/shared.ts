import { loadBoard, saveBoard, type BoardSnapshot } from "@/lib/board/board.functions";
import { useBoard } from "@/lib/board/store";

function snapshot(): BoardSnapshot {
  const state = useBoard.getState();
  return {
    shops: state.shops,
    categories: state.categories,
    techs: state.techs,
    weeks: state.weeks,
    dayReports: state.dayReports,
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
    const { prelaunchCleared, ...rest } = remote;
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
    const clearWeeks = !prelaunchCleared;
    const changed = techs.some((tech, index) => {
      const previous = rest.techs[index];
      return tech.name !== previous?.name || tech.email !== (previous?.email ?? "");
    });
    useBoard.setState({
      ...rest,
      techs,
      weeks: clearWeeks ? [] : rest.weeks,
    });
    if (clearWeeks || changed) {
      await saveBoard({ data: snapshot() });
    }
  } else {
    useBoard.setState({ weeks: [] });
    await saveBoard({ data: snapshot() });
  }
  lastSaved = JSON.stringify(snapshot());
  ready = true;
  useBoard.subscribe(() => scheduleSave());
}
