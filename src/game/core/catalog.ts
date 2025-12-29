import type { TimeSlot } from "./time";

export type Product = {
  id: string;
  name: string;
  price: number;         // 売価
  cost: number;          // 原価
  shelfLifeDays: number; // 期限（日）
  baseDemand: number;    // 1日あたりのベース需要
  demandByTime: Record<TimeSlot, number>; // 時間帯係数
};

export const CATALOG: Product[] = [
  { id: "onigiri_salmon", name: "おにぎり（鮭）", price: 160, cost: 95, shelfLifeDays: 2, baseDemand: 18,
    demandByTime: { morning: 1.3, noon: 1.0, evening: 0.7, night: 0.5 } },
  { id: "onigiri_tuna", name: "おにぎり（ツナマヨ）", price: 150, cost: 90, shelfLifeDays: 2, baseDemand: 20,
    demandByTime: { morning: 1.2, noon: 1.0, evening: 0.7, night: 0.6 } },

  { id: "bento_karaage", name: "弁当（唐揚げ）", price: 550, cost: 330, shelfLifeDays: 1, baseDemand: 10,
    demandByTime: { morning: 0.3, noon: 1.7, evening: 1.1, night: 0.4 } },
  { id: "bento_saba", name: "弁当（鯖）", price: 520, cost: 310, shelfLifeDays: 1, baseDemand: 8,
    demandByTime: { morning: 0.25, noon: 1.6, evening: 1.05, night: 0.35 } },

  { id: "drink_tea", name: "緑茶 500ml", price: 140, cost: 70, shelfLifeDays: 10, baseDemand: 22,
    demandByTime: { morning: 1.1, noon: 1.0, evening: 0.9, night: 0.8 } },
  { id: "drink_coffee", name: "コーヒー 500ml", price: 160, cost: 80, shelfLifeDays: 10, baseDemand: 16,
    demandByTime: { morning: 1.2, noon: 0.9, evening: 0.9, night: 0.85 } },

  { id: "snack_chips", name: "ポテチ", price: 180, cost: 95, shelfLifeDays: 30, baseDemand: 12,
    demandByTime: { morning: 0.7, noon: 0.9, evening: 1.1, night: 1.2 } },
  { id: "snack_choco", name: "チョコ", price: 150, cost: 80, shelfLifeDays: 30, baseDemand: 10,
    demandByTime: { morning: 0.8, noon: 0.9, evening: 1.1, night: 1.2 } },

  { id: "magazine_weekly", name: "週刊誌", price: 430, cost: 250, shelfLifeDays: 7, baseDemand: 6,
    demandByTime: { morning: 1.3, noon: 0.9, evening: 0.7, night: 0.4 } },
  { id: "magazine_manga", name: "漫画雑誌", price: 520, cost: 300, shelfLifeDays: 7, baseDemand: 5,
    demandByTime: { morning: 1.2, noon: 0.9, evening: 0.7, night: 0.4 } },
];

export const CATALOG_MAP: Record<string, Product> =
  Object.fromEntries(CATALOG.map((p) => [p.id, p]));
