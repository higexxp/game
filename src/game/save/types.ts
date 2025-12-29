import type { GameState } from "@/game/core/types";

export type SaveSlotId = "A" | "B" | "C";
export const SAVE_SLOTS = ["A", "B", "C"] as const;

export type SaveMeta = {
  slotId: SaveSlotId;
  label: string;
  updatedAt: number; // epoch ms
  day: number;
  cash: number;
  shopName: string;
  version: number;
  summary?: string;
};

export type SaveData = {
  meta: SaveMeta;
  state: GameState;
};

export interface SaveRepository {
  listMetas(): Promise<SaveMeta[]>;
  load(slotId: SaveSlotId): Promise<SaveData | null>;
  save(data: SaveData): Promise<void>;
  remove(slotId: SaveSlotId): Promise<void>;
  exportJson(slotId: SaveSlotId): Promise<string>;
  importJson(json: string, slotId: SaveSlotId): Promise<void>;
  getLastUsedSlot(): Promise<SaveSlotId | null>;
  setLastUsedSlot(slotId: SaveSlotId): Promise<void>;
}
