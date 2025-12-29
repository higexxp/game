import { CATALOG_MAP } from "./catalog";
import { rand01 } from "./rng";
import { sellFIFO, totalQty } from "./inventory";
import { TIME_SLOTS, type TimeSlot } from "./time";
import type { GameState } from "./types";

function nextSlot(slot: TimeSlot): TimeSlot | null {
  const idx = TIME_SLOTS.indexOf(slot);
  if (idx < 0 || idx === TIME_SLOTS.length - 1) return null;
  return TIME_SLOTS[idx + 1];
}

export function simulateTimeSlot(state: GameState): GameState {
  const next = structuredClone(state);

  let seed = next.rngSeed;
  let revenue = 0;

  for (const p of next.catalog) {
    const r = rand01(seed); seed = r.seed;
    const jitter = 0.8 + r.value * 0.4;

    const demand =
      p.baseDemand *
      p.demandByTime[next.timeSlot] *
      jitter;

    const sold = sellFIFO(next.inventory, p.id, Math.round(demand));
    revenue += sold * p.price;
  }

  next.cash += revenue;

  if (!next.lastReport) {
    next.lastReport = { day: next.day, byTime: { morning: 0, noon: 0, evening: 0, night: 0 }, revenue: 0 };
  }
  next.lastReport.byTime[next.timeSlot] += revenue;
  next.lastReport.revenue += revenue;

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
