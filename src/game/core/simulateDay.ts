import { CATALOG_MAP } from "./catalog";
import { rand01 } from "./rng";
import { addLot, discardExpired, sellFIFO, totalQty } from "./inventory";
import type { DayReport, GameState, PendingOrder } from "./types";

function dayOfWeek(day: number): number {
  // day=1 を月曜扱い（ざっくり）
  return (day - 1) % 7; // 0..6
}

function demandMultiplierByDay(day: number): number {
  const dow = dayOfWeek(day);
  // 土日を少し上げる（5=土,6=日）
  if (dow === 5) return 1.10;
  if (dow === 6) return 1.15;
  return 1.0;
}

function shelfMultiplier(isOnShelf: boolean): number {
  // 棚に出てると売れやすい（後で陳列場所ごとに変える）
  return isOnShelf ? 1.15 : 0.85;
}

function isProductOnShelf(state: GameState, productId: string): boolean {
  return Object.values(state.shelf).some(pid => pid === productId);
}

function popArrivals(state: GameState): PendingOrder[] {
  const today = state.day;
  const arrivals = state.pendingOrders.filter(o => o.arriveDay === today);
  state.pendingOrders = state.pendingOrders.filter(o => o.arriveDay !== today);
  return arrivals;
}

export function simulateOneDay(state: GameState): GameState {
  // 不変を壊さないよう shallow clone
  const next: GameState = structuredClone(state);

  // 1) 日の開始：期限切れ廃棄（朝イチで捨てる）
  const wastedStart = discardExpired(next.inventory, next.day);

  // 2) 入荷（到着日に原価を支払う）
  const arrivals = popArrivals(next);
  let arrivalCost = 0;
  for (const order of arrivals) {
    for (const [pid, qty] of Object.entries(order.items)) {
      const p = CATALOG_MAP[pid];
      if (!p) continue;
      arrivalCost += p.cost * qty;
      addLot(next.inventory, pid, qty, next.day + p.shelfLifeDays);
    }
  }
  next.cash -= arrivalCost;

  // 3) 需要→販売（FIFO）
  const soldUnits: Record<string, number> = {};
  const stockouts: Record<string, number> = {};
  let revenue = 0;

  let seed = next.rngSeed;
  const baseMul = demandMultiplierByDay(next.day);

  for (const p of next.catalog) {
    const onShelf = isProductOnShelf(next, p.id);

    // 乱数でブレ（±20%）
    const r = rand01(seed); seed = r.seed;
    const jitter = 0.8 + r.value * 0.4;

    const rawDemand = p.baseDemand * baseMul * jitter * shelfMultiplier(onShelf);
    const demand = Math.max(0, Math.round(rawDemand));

    const before = totalQty(next.inventory, p.id);
    const sold = sellFIFO(next.inventory, p.id, demand);
    const after = totalQty(next.inventory, p.id);

    soldUnits[p.id] = sold;
    revenue += sold * p.price;

    const miss = demand - sold;
    if (miss > 0) stockouts[p.id] = miss;

    //（デバッグしたい場合）
    void before; void after;
  }

  next.cash += revenue;

  // 4) 日の終わり：期限切れ廃棄（閉店後に棚卸しで捨てる、という扱い）
  //    ※「賞味期限当日中に売れる」設計にしたいので、ここでは day+1 開始時に捨てるのが本筋。
  //    MVPは朝イチ廃棄に寄せているので、終わり廃棄は入れない。
  //    代わりに朝イチ廃棄を report に含める。
  const wastedUnits = wastedStart;

  const cost = arrivalCost;
  const grossProfit = revenue - cost;

  const report: DayReport = {
    day: next.day,
    revenue,
    cost,
    grossProfit,
    soldUnits,
    stockouts,
    wastedUnits,
  };

  next.lastReport = report;

  // 5) 次の日へ
  next.day += 1;
  next.rngSeed = seed;

  return next;
}
