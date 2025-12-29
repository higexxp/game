import { CATALOG } from "./catalog";
import { GAME_STATE_VERSION, type GameState, type Shelf, type Staffing } from "./types";

export function createEmptyShelf(): Shelf {
  return {
    S1: null, S2: null, S3: null, S4: null,
    S5: null, S6: null, S7: null, S8: null,
    S9: null, S10: null, S11: null, S12: null,
  };
}

export function defaultStaffing(): Staffing {
  // MVPの初期値（後からバイトシフト最適化ゲーに育つ）
  return {
    morning: 1,
    noon: 2,
    evening: 2,
    night: 1,
  };
}

export function newGameState(seed = Date.now() | 0): GameState {
  return {
    version: GAME_STATE_VERSION,
    rngSeed: seed,

    day: 1,
    timeSlot: "morning",

    cash: 300000,
    shopName: "aiops-kaneko mart",

    catalog: CATALOG,
    inventory: {},
    pendingOrders: [],
    shelf: createEmptyShelf(),

    staffing: defaultStaffing(),

    lastReport: null,
  };
}
