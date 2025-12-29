import type { GameState, PendingOrder, ShelfSlotId } from "./types";
import type { TimeSlot } from "./time";
import { CATALOG_MAP } from "./catalog";

export function placeOrder(state: GameState, items: Record<string, number>): GameState {
  const next: GameState = structuredClone(state);

  const sanitized: Record<string, number> = {};
  for (const [pid, qtyRaw] of Object.entries(items)) {
    const qty = Math.max(0, Math.floor(Number(qtyRaw) || 0));
    if (qty <= 0) continue;
    if (!CATALOG_MAP[pid]) continue;
    sanitized[pid] = qty;
  }

  const order: PendingOrder = { arriveDay: next.day + 1, items: sanitized };
  next.pendingOrders.push(order);
  return next;
}

export function assignShelf(state: GameState, slot: ShelfSlotId, productId: string | null): GameState {
  const next: GameState = structuredClone(state);
  next.shelf[slot] = productId;
  return next;
}

export function renameShop(state: GameState, name: string): GameState {
  const next: GameState = structuredClone(state);
  next.shopName = name.slice(0, 40);
  return next;
}

export function setStaffing(state: GameState, slot: TimeSlot, staff: number): GameState {
  const next: GameState = structuredClone(state);
  const n = Math.max(0, Math.min(6, Math.floor(Number(staff) || 0))); // 0..6
  next.staffing[slot] = n;
  return next;
}
