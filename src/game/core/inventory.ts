import type { Inventory, InventoryLot } from "./types";

export function ensureLots(inv: Inventory, productId: string): InventoryLot[] {
  if (!inv[productId]) inv[productId] = [];
  return inv[productId];
}

export function totalQty(inv: Inventory, productId: string): number {
  const lots = inv[productId] ?? [];
  return lots.reduce((a, l) => a + l.qty, 0);
}

export function addLot(inv: Inventory, productId: string, qty: number, expiresDay: number) {
  if (qty <= 0) return;
  const lots = ensureLots(inv, productId);
  lots.push({ qty, expiresDay });
  // FIFOなので expiresDay順に軽く整列（同一日が多い想定）
  lots.sort((a, b) => a.expiresDay - b.expiresDay);
}

// FIFOで販売。売れた数量を返す
export function sellFIFO(inv: Inventory, productId: string, demandQty: number): number {
  if (demandQty <= 0) return 0;
  const lots = inv[productId] ?? [];
  let remain = demandQty;
  let sold = 0;

  for (const lot of lots) {
    if (remain <= 0) break;
    const take = Math.min(lot.qty, remain);
    lot.qty -= take;
    remain -= take;
    sold += take;
  }
  // 0になったロットを掃除
  inv[productId] = lots.filter(l => l.qty > 0);
  return sold;
}

// 期限切れ廃棄。廃棄数を返す
export function discardExpired(inv: Inventory, day: number): Record<string, number> {
  const wasted: Record<string, number> = {};
  for (const [pid, lots] of Object.entries(inv)) {
    let waste = 0;
    const keep: InventoryLot[] = [];
    for (const lot of lots) {
      // expiresDay < day なら期限切れ（dayの開始時に捨てる扱い）
      if (lot.expiresDay < day) waste += lot.qty;
      else keep.push(lot);
    }
    inv[pid] = keep;
    if (waste > 0) wasted[pid] = waste;
  }
  return wasted;
}
