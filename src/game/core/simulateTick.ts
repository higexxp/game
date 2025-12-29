import { rand01 } from "./rng";
import { addLot, discardExpired, sellFIFO } from "./inventory";
import { TIME_SLOTS, type TimeSlot } from "./time";
import { CATALOG_MAP } from "./catalog";
import type { GameState, PendingOrder } from "./types";

function dayOfWeek(day: number): number {
  return (day - 1) % 7;
}

function demandMultiplierByDay(day: number): number {
  const dow = dayOfWeek(day);
  if (dow === 5) return 1.10;
  if (dow === 6) return 1.15;
  return 1.0;
}

function shelfMultiplier(isOnShelf: boolean): number {
  return isOnShelf ? 1.15 : 0.85;
}

function isProductOnShelf(state: GameState, productId: string): boolean {
  return Object.values(state.shelf).some((pid) => pid === productId);
}

function popArrivals(state: GameState): PendingOrder[] {
  const today = state.day;
  const arrivals = state.pendingOrders.filter((o) => o.arriveDay === today);
  state.pendingOrders = state.pendingOrders.filter((o) => o.arriveDay !== today);
  return arrivals;
}

function nextSlot(slot: TimeSlot): TimeSlot | null {
  const idx = TIME_SLOTS.indexOf(slot);
  if (idx < 0 || idx === TIME_SLOTS.length - 1) return null;
  return TIME_SLOTS[idx + 1];
}

// ざっくり「来店人数」を推定して、スタッフでさばける人数に制限する。
// servedRatio が 1 未満だと、その時間帯の販売が比例して減る（行列離脱の表現）。
function estimateTraffic(next: GameState, baseMul: number, seed: number): { traffic: number; seed: number } {
  // 需要（商品単位）から客数に変換する雑な式（後で改善しやすいように関数化）
  // だいたい「1客あたり1.4点買う」想定で割り算
  let demandUnits = 0;

  for (const p of next.catalog) {
    const r = rand01(seed); seed = r.seed;
    const jitter = 0.9 + r.value * 0.2; // 客数のブレは控えめ
    const onShelf = isProductOnShelf(next, p.id);

    const units =
      p.baseDemand *
      baseMul *
      p.demandByTime[next.timeSlot] *
      jitter *
      shelfMultiplier(onShelf);

    demandUnits += Math.max(0, units);
  }

  const traffic = Math.max(0, Math.round(demandUnits / 1.4));
  return { traffic, seed };
}

export function simulateTick(state: GameState): GameState {
  const next: GameState = structuredClone(state);

  if (!next.lastReport) {
    next.lastReport = {
      day: next.day,
      byTime: { morning: 0, noon: 0, evening: 0, night: 0 },
      revenue: 0,
      cost: 0,
      grossProfit: 0,
      soldUnits: {},
      stockouts: {},
      wastedUnits: {},
      trafficByTime: { morning: 0, noon: 0, evening: 0, night: 0 },
      servedByTime: { morning: 0, noon: 0, evening: 0, night: 0 },
      lostByTime: { morning: 0, noon: 0, evening: 0, night: 0 },
    };
  }

  // 朝に廃棄＆入荷（原価支払い）
  if (next.timeSlot === "morning") {
    const wasted = discardExpired(next.inventory, next.day);
    for (const [pid, qty] of Object.entries(wasted)) {
      next.lastReport.wastedUnits[pid] = (next.lastReport.wastedUnits[pid] ?? 0) + qty;
    }

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
    next.lastReport.cost += arrivalCost;
  }

  let seed = next.rngSeed;
  const baseMul = demandMultiplierByDay(next.day);

  // 人員→キャパ→離脱
  const staff = Math.max(0, Math.floor(next.staffing[next.timeSlot] ?? 0));
  const CAPACITY_PER_STAFF = 18; // 1時間帯あたりにさばける客数（MVP値、後で調整）
  const capacity = staff * CAPACITY_PER_STAFF;

  const t = estimateTraffic(next, baseMul, seed); seed = t.seed;
  const traffic = t.traffic;
  const served = traffic === 0 ? 0 : Math.min(traffic, capacity);
  const lost = Math.max(0, traffic - served);
  const servedRatio = traffic === 0 ? 1 : served / traffic;

  next.lastReport.trafficByTime[next.timeSlot] += traffic;
  next.lastReport.servedByTime[next.timeSlot] += served;
  next.lastReport.lostByTime[next.timeSlot] += lost;

  // この時間帯の販売（servedRatioで減衰）
  let slotRevenue = 0;

  for (const p of next.catalog) {
    const onShelf = isProductOnShelf(next, p.id);

    const r = rand01(seed); seed = r.seed;
    const jitter = 0.8 + r.value * 0.4;

    const demand =
      p.baseDemand *
      baseMul *
      p.demandByTime[next.timeSlot] *
      jitter *
      shelfMultiplier(onShelf);

    const effectiveDemand = Math.max(0, Math.round(demand * servedRatio));

    const sold = sellFIFO(next.inventory, p.id, effectiveDemand);
    const miss = effectiveDemand - sold;

    next.lastReport.soldUnits[p.id] = (next.lastReport.soldUnits[p.id] ?? 0) + sold;
    if (miss > 0) next.lastReport.stockouts[p.id] = (next.lastReport.stockouts[p.id] ?? 0) + miss;

    slotRevenue += sold * p.price;
  }

  next.cash += slotRevenue;

  next.lastReport.byTime[next.timeSlot] += slotRevenue;
  next.lastReport.revenue += slotRevenue;
  next.lastReport.grossProfit = next.lastReport.revenue - next.lastReport.cost;

  // 次の時間帯 or 翌日へ
  const ns = nextSlot(next.timeSlot);
  if (ns) {
    next.timeSlot = ns;
  } else {
    next.day += 1;
    next.timeSlot = "morning";
    next.lastReport = null;
  }

  next.rngSeed = seed;
  return next;
}
