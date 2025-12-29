"use client";

import { create } from "zustand";
import type { GameState } from "@/game/core/types";
import { newGameState } from "@/game/core/newGame";
import { simulateTick } from "@/game/core/simulateTick";
import { assignShelf, placeOrder, renameShop, setStaffing } from "@/game/core/actions";
import type { TimeSlot } from "@/game/core/time";

type GameStore = {
  state: GameState;
  setState: (s: GameState) => void;

  newGame: () => void;
  nextTime: () => void;

  setShopName: (name: string) => void;
  assignShelf: (slotId: string, productId: string | null) => void;
  placeOrder: (items: Record<string, number>) => void;

  setStaff: (timeSlot: TimeSlot, staff: number) => void;
};

export const useGameStore = create<GameStore>((set, get) => ({
  state: newGameState(),

  setState: (s) => set({ state: s }),

  newGame: () => set({ state: newGameState(Date.now() | 0) }),

  nextTime: () => set({ state: simulateTick(get().state) }),

  setShopName: (name) => set({ state: renameShop(get().state, name) }),

  assignShelf: (slotId, productId) =>
    set({ state: assignShelf(get().state, slotId as any, productId) }),

  placeOrder: (items) =>
    set({ state: placeOrder(get().state, items) }),

  setStaff: (timeSlot, staff) =>
    set({ state: setStaffing(get().state, timeSlot, staff) }),
}));
