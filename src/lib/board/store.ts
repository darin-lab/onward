import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  blankWeek,
  seedCategories,
  seedShops,
  seedTechs,
  seedWeeks,
  uniqueTechId,
  type Category,
  type Shop,
  type Tech,
  type WeekLog,
  type DayReport,
  type PhoneAnswer,
  type PhoneCall,
  type CashTransfer,
} from "@/lib/board/model";

type BoardState = {
  shops: Shop[];
  categories: Category[];
  techs: Tech[];
  weeks: WeekLog[];
  dayReports: DayReport[];
  calls: PhoneCall[];
  cashTransfers: CashTransfer[];
  lens: string;
  viewer: string;
  sampleCrew: boolean;
  setLens: (lens: string) => void;
  setViewer: (viewer: string) => void;
  updateTech: (id: string, patch: Partial<Pick<Tech, "name" | "role" | "email">>) => void;
  updateShop: (id: string, patch: Partial<Pick<Shop, "name" | "address">>) => void;
  addTech: (name: string, role: string, shopId: string) => string;
  removeTech: (id: string) => void;
  updateCategory: (id: string, patch: Partial<Pick<Category, "name" | "hint">>) => void;
  upsertWeek: (entry: WeekLog) => void;
  upsertDayReport: (entry: DayReport) => void;
  addCall: (entry: PhoneCall) => void;
  answerCall: (id: string, answer: PhoneAnswer) => void;
  requestCash: (entry: CashTransfer) => void;
  recordPickup: (id: string, amount: number) => void;
  updateCash: (id: string, requested: number, pickedUp: number | null) => void;
  deleteCash: (id: string) => void;
  startWeek: (techId: string, weekStart: string) => void;
  restoreSample: () => void;
};

const freshSample = () => ({
  shops: seedShops.map((shop) => ({ ...shop })),
  categories: seedCategories.map((category) => ({ ...category })),
  techs: seedTechs.map((tech) => ({ ...tech })),
  weeks: seedWeeks.map((week) => ({ ...week, scores: { ...week.scores } })),
  dayReports: [],
  sampleCrew: true,
});

export const useBoard = create<BoardState>()(
  persist(
    (set, get) => ({
      ...freshSample(),
      lens: "owner",
      viewer: "guest",
      calls: [],
      cashTransfers: [],
      setLens: (lens) => set({ lens }),
      setViewer: (viewer) => {
        const person = get().techs.find((tech) => tech.id === viewer);
        if (!person) {
          set({ viewer: "owner", lens: "owner" });
          return;
        }
        set({
          viewer: person.id,
          lens: person.kind === "manager" ? "owner" : "self",
        });
      },
      updateTech: (id, patch) =>
        set((state) => ({
          sampleCrew: false,
          techs: state.techs.map((tech) => (tech.id === id ? { ...tech, ...patch } : tech)),
        })),
      updateShop: (id, patch) =>
        set((state) => ({
          sampleCrew: false,
          shops: state.shops.map((shop) => (shop.id === id ? { ...shop, ...patch } : shop)),
        })),
      addTech: (name, role, shopId) => {
        const id = uniqueTechId(get().techs, name);
        set((state) => ({
          sampleCrew: false,
          techs: [
            ...state.techs,
            {
              id,
              name: name.trim(),
              role: role.trim() || "Technician",
              email: "",
              kind: "technician",
              shopId,
            },
          ],
        }));
        return id;
      },
      removeTech: (id) =>
        set((state) => ({
          sampleCrew: false,
          techs: state.techs.filter((tech) => tech.id !== id),
          weeks: state.weeks.filter((week) => week.techId !== id),
        })),
      updateCategory: (id, patch) =>
        set((state) => ({
          categories: state.categories.map((category) =>
            category.id === id ? { ...category, ...patch } : category,
          ),
        })),
      upsertWeek: (entry) =>
        set((state) => {
          const index = state.weeks.findIndex(
            (week) => week.techId === entry.techId && week.weekStart === entry.weekStart,
          );
          const weeks = state.weeks.slice();
          if (index >= 0) weeks[index] = entry;
          else weeks.push(entry);
          return { weeks };
        }),
      upsertDayReport: (entry) =>
        set((state) => {
          const index = state.dayReports.findIndex(
            (report) => report.shopId === entry.shopId && report.date === entry.date,
          );
          const dayReports = state.dayReports.slice();
          if (index >= 0) dayReports[index] = entry;
          else dayReports.push(entry);
          return { dayReports, sampleCrew: false };
        }),
      addCall: (entry) =>
        set((state) => ({
          calls: [...(state.calls ?? []).filter((call) => call.id !== entry.id), entry],
          sampleCrew: false,
        })),
      answerCall: (id, answer) =>
        set((state) => ({
          calls: (state.calls ?? []).map((call) => {
            if (call.id !== id || answer.personId !== call.managerId) return call;
            const answers = call.answers.some((item) => item.personId === answer.personId)
              ? call.answers
              : [...call.answers, answer];
            return { ...call, answers, audio: "" };
          }),
        })),
      requestCash: (entry) =>
        set((state) => ({
          cashTransfers: [...(state.cashTransfers ?? []).filter((item) => item.id !== entry.id), entry],
          sampleCrew: false,
        })),
      recordPickup: (id, amount) =>
        set((state) => ({
          cashTransfers: (state.cashTransfers ?? []).map((item) =>
            item.id === id && item.pickedUp == null
              ? { ...item, pickedUp: amount, pickedUpAt: new Date().toISOString() }
              : item,
          ),
        })),
      updateCash: (id, requested, pickedUp) =>
        set((state) => ({
          cashTransfers: (state.cashTransfers ?? []).map((item) =>
            item.id === id
              ? {
                  ...item,
                  requested,
                  pickedUp,
                  pickedUpAt: pickedUp == null ? null : item.pickedUpAt ?? new Date().toISOString(),
                  revisedAt: new Date().toISOString(),
                }
              : item,
          ),
        })),
      deleteCash: (id) =>
        set((state) => ({
          cashTransfers: (state.cashTransfers ?? []).map((item) =>
            item.id === id ? { ...item, deletedAt: new Date().toISOString() } : item,
          ),
        })),
      startWeek: (techId, weekStart) => {
        const state = get();
        const person = state.techs.find((tech) => tech.id === techId);
        const previous =
          state.weeks
            .filter((week) => week.techId === techId && week.weekStart < weekStart)
            .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
            .at(-1) ?? null;
        get().upsertWeek(
          blankWeek(
            techId,
            weekStart,
            state.categories
              .filter((category) => category.kind === (person?.kind ?? "technician"))
              .map((category) => category.id),
            previous,
          ),
        );
      },
      restoreSample: () => set({ ...freshSample(), lens: "owner" }),
    }),
    {
      name: "onward-board-v6",
      skipHydration: true,
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const known = new Map(seedShops.map((shop) => [shop.id, shop.address]));
        useBoard.setState({
          techs: state.techs.map((tech) => ({
            ...tech,
            name:
              tech.id === "dillon" || tech.name === "Dillon Hurst"
                ? "Dillon Horst"
                : tech.id === "kevin" || tech.name === "Kevin"
                  ? "Kevin Nguyen"
                  : tech.name,
            role: tech.role === "Shop manager" ? "General Manager" : tech.role,
            email: tech.email ?? "",
          })),
          shops: state.shops.map((shop) => ({
            ...shop,
            address: shop.address || known.get(shop.id) || "",
          })),
          categories: seedCategories,
          viewer: "guest",
          lens: "owner",
          dayReports: state.dayReports ?? [],
          calls: state.calls ?? [],
          cashTransfers: state.cashTransfers ?? [],
        });
      },
      partialize: (state) => ({
        shops: state.shops,
        categories: state.categories,
        techs: state.techs,
        weeks: state.weeks,
        dayReports: state.dayReports,
        calls: state.calls,
        cashTransfers: state.cashTransfers,
        lens: state.lens,
        viewer: state.viewer,
        sampleCrew: state.sampleCrew,
      }),
    },
  ),
);
