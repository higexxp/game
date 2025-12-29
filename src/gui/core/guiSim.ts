import { TIME_SLOTS, type TimeSlot } from "./time";

export type GuiReport = {
  servedByTime: Record<TimeSlot, number>;
  lostByTime: Record<TimeSlot, number>;
};

export type GuiSimInput = {
  rngSeed: number;
  timeSlot: TimeSlot;
  staffByTime: Record<TimeSlot, number>;
  shelfIds: string[];
  shelfStock: Record<string, number>;
};

export type GuiSimOutput = {
  nextSeed: number;
  served: number;
  lost: number;
  // この時間帯で消費した棚（後で“本棚割り”に差し替えやすい）
  consumed: Array<{ shelfId: string; qty: number }>;
};

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function baseDemand(slot: TimeSlot) {
  switch (slot) {
    case "morning": return 5;
    case "noon": return 10;
    case "evening": return 8;
    case "night": return 4;
    default: return 6;
  }
}

// “/gui が本体”前提：この関数が唯一の需要生成源
export function simulateOneSlot(input: GuiSimInput): GuiSimOutput {
  const rand = mulberry32(input.rngSeed || 1);

  const staff = clamp(input.staffByTime[input.timeSlot] ?? 1, 1, 10);
  // スタッフが多いと取りこぼしが減る（雑だけど“経営感”が出る）
  const capMul = 0.85 + Math.pow(staff, 0.45) * 0.25; // 1人~1.1 / 5人~1.6 くらい

  const demand = Math.floor((baseDemand(input.timeSlot) + rand() * 6) * capMul);
  const shelfIds = input.shelfIds;
  const shelfStock = { ...input.shelfStock };

  let served = 0;
  let lost = 0;
  const consumedMap = new Map<string, number>();

  for (let i = 0; i < demand; i++) {
    const sid = shelfIds[Math.floor(rand() * shelfIds.length)] ?? shelfIds[0];
    const qty = shelfStock[sid] ?? 0;
    if (qty > 0) {
      shelfStock[sid] = qty - 1;
      served += 1;
      consumedMap.set(sid, (consumedMap.get(sid) ?? 0) + 1);
    } else {
      // 欠品＝離脱扱い（後で “別カウント” に分けてもOK）
      lost += 1;
    }
  }

  const consumed = Array.from(consumedMap.entries()).map(([shelfId, qty]) => ({ shelfId, qty }));

  // seed 更新（安定）
  const nextSeed = (input.rngSeed * 1664525 + 1013904223) >>> 0;

  return { nextSeed, served, lost, consumed };
}

export function emptyReport(): GuiReport {
  return {
    servedByTime: Object.fromEntries(TIME_SLOTS.map(s => [s, 0])) as Record<TimeSlot, number>,
    lostByTime: Object.fromEntries(TIME_SLOTS.map(s => [s, 0])) as Record<TimeSlot, number>,
  };
}
