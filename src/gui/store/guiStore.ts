"use client";

import { create } from "zustand";
import { TIME_SLOTS, type TimeSlot, nextSlot } from "@/gui/core/time";
import { emptyReport, simulateOneSlot, type GuiReport } from "@/gui/core/guiSim";

export type GuiState = {
  day: number;
  timeSlot: TimeSlot;
  rngSeed: number;

  // /gui が本体なので、在庫は棚ごと（SKUは後回し）
  shelfStock: Record<string, number>;
  staffByTime: Record<TimeSlot, number>;

  lastReport: GuiReport;
};

export type GuiActions = {
  advanceTime: () => void;

  setStaff: (slot: TimeSlot, n: number) => void;

  setShelfStock: (shelfId: string, qty: number) => void;
  decShelfStock: (shelfId: string, qty?: number) => void;

  // デバッグ用
  restockAll: (qtyEach: number) => void;
};

const DEFAULT_SHELVES = [
  "shelf_a", "shelf_b", "shelf_c",
  "island_1", "island_2",
] as const;

function clampInt(n: number, a: number, b: number) {
  const x = Number.isFinite(n) ? Math.floor(n) : a;
  return Math.max(a, Math.min(b, x));
}

function defaultShelfStock() {
  // 初期在庫：見た目が楽しい程度に
  const base = 8;
  const stock: Record<string, number> = {};
  for (let i = 0; i < DEFAULT_SHELVES.length; i++) stock[DEFAULT_SHELVES[i]] = base + (i % 3);
  return stock;
}

function defaultStaffByTime(): Record<TimeSlot, number> {
  return {
    morning: 1,
    noon: 2,
    evening: 2,
    night: 1,
  };
}

export const useGuiStore = create<GuiState & GuiActions>((set, get) => ({
  day: 1,
  timeSlot: "morning",
  rngSeed: 123456789,

  shelfStock: defaultShelfStock(),
  staffByTime: defaultStaffByTime(),

  lastReport: emptyReport(),

  advanceTime: () => {
    const st = get();

    const slotBefore = st.timeSlot;

    // この“時間帯”を処理（= tick）
    const sim = simulateOneSlot({
      rngSeed: st.rngSeed,
      timeSlot: slotBefore,
      staffByTime: st.staffByTime,
      shelfIds: Object.keys(st.shelfStock),
      shelfStock: st.shelfStock,
    });

    set((prev) => {
      const rep: GuiReport = {
        servedByTime: { ...prev.lastReport.servedByTime },
        lostByTime: { ...prev.lastReport.lostByTime },
      };

      rep.servedByTime[slotBefore] = sim.served;
      rep.lostByTime[slotBefore] = sim.lost;

      const next = nextSlot(prev.timeSlot);

      // consumed を shelfStock に反映（本体在庫）
      const shelfStock = { ...prev.shelfStock };
      for (const c of sim.consumed) {
        shelfStock[c.shelfId] = Math.max(0, (shelfStock[c.shelfId] ?? 0) - c.qty);
      }

      return {
        rngSeed: sim.nextSeed,
        lastReport: rep,
        shelfStock,
        timeSlot: next.slot,
        day: prev.day + next.dayDelta,
      };
    });
  },

  setStaff: (slot, n) => {
    const nn = clampInt(n, 0, 10);
    set((prev) => ({ staffByTime: { ...prev.staffByTime, [slot]: nn } }));
  },

  setShelfStock: (shelfId, qty) => {
    const q = clampInt(qty, 0, 999);
    set((prev) => ({ shelfStock: { ...prev.shelfStock, [shelfId]: q } }));
  },

  decShelfStock: (shelfId, qty = 1) => {
    const d = clampInt(qty, 1, 999);
    set((prev) => ({
      shelfStock: {
        ...prev.shelfStock,
        [shelfId]: Math.max(0, (prev.shelfStock[shelfId] ?? 0) - d),
      },
    }));
  },

  restockAll: (qtyEach) => {
    const q = clampInt(qtyEach, 0, 999);
    set((prev) => {
      const s: Record<string, number> = {};
      for (const k of Object.keys(prev.shelfStock)) s[k] = q;
      return { shelfStock: s };
    });
  },
}));
