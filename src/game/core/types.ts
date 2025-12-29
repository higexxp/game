import type { Product } from "./catalog";
import type { TimeSlot } from "./time";

export type InventoryLot = {
  qty: number;
  expiresDay: number;
};

export type Inventory = Record<string, InventoryLot[]>;

export type PendingOrder = {
  arriveDay: number;
  items: Record<string, number>;
};

export type DayReport = {
  day: number;

  // 時間帯別売上
  byTime: Record<TimeSlot, number>;

  // 1日累計
  revenue: number;
  cost: number;
  grossProfit: number;

  // 商品別
  soldUnits: Record<string, number>;
  stockouts: Record<string, number>;
  wastedUnits: Record<string, number>;

  // オペ（人員→行列→機会損失）
  trafficByTime: Record<TimeSlot, number>; // 来店（需要）人数の推定
  servedByTime: Record<TimeSlot, number>;  // さばけた人数
  lostByTime: Record<TimeSlot, number>;    // 行列離脱
};

export type ShelfSlotId =
  | "S1" | "S2" | "S3" | "S4"
  | "S5" | "S6" | "S7" | "S8"
  | "S9" | "S10" | "S11" | "S12";

export const SHELF_SLOTS: ShelfSlotId[] = [
  "S1","S2","S3","S4","S5","S6","S7","S8","S9","S10","S11","S12"
];

export type Shelf = Record<ShelfSlotId, string | null>;

export type Staffing = Record<TimeSlot, number>; // その時間帯のスタッフ人数

export type GameState = {
  version: number;
  rngSeed: number;

  day: number;
  timeSlot: TimeSlot;

  cash: number;
  shopName: string;

  catalog: Product[];
  inventory: Inventory;
  pendingOrders: PendingOrder[];
  shelf: Shelf;

  // 追加
  staffing: Staffing;

  lastReport: DayReport | null;
};

export const GAME_STATE_VERSION = 5;
