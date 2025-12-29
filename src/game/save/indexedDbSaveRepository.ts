import type { SaveData, SaveMeta, SaveRepository, SaveSlotId } from "./types";
import { openDb, tx, stores } from "./idb";

const LAST_USED_SLOT_KEY = "lastUsedSlot";

function assertSlotId(v: any): v is SaveSlotId {
  return v === "A" || v === "B" || v === "C";
}

export class IndexedDbSaveRepository implements SaveRepository {
  async listMetas(): Promise<SaveMeta[]> {
    const db = await openDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(stores.STORE_SAVES, "readonly");
      const store = transaction.objectStore(stores.STORE_SAVES);

      const req = store.getAll();
      req.onsuccess = () => {
        const metas = (req.result ?? [])
          .map((r: any) => r?.meta)
          .filter(Boolean) as SaveMeta[];
        metas.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
        resolve(metas);
      };
      req.onerror = () => reject(req.error ?? new Error("Failed to list saves"));
    });
  }

  async load(slotId: SaveSlotId): Promise<SaveData | null> {
    const db = await openDb();
    const record = await tx<any>(db, stores.STORE_SAVES, "readonly", (store) => store.get(slotId));
    if (!record) return null;
    return { meta: record.meta as SaveMeta, state: record.state };
  }

  async save(data: SaveData): Promise<void> {
    const db = await openDb();
    await tx(db, stores.STORE_SAVES, "readwrite", (store) =>
      store.put({ slotId: data.meta.slotId, meta: data.meta, state: data.state })
    );
  }

  async remove(slotId: SaveSlotId): Promise<void> {
    const db = await openDb();
    await tx(db, stores.STORE_SAVES, "readwrite", (store) => store.delete(slotId));
  }

  async exportJson(slotId: SaveSlotId): Promise<string> {
    const data = await this.load(slotId);
    if (!data) throw new Error(`Slot ${slotId} is empty`);
    return JSON.stringify(data);
  }

  async importJson(json: string, slotId: SaveSlotId): Promise<void> {
    let parsed: any;
    try { parsed = JSON.parse(json); } catch { throw new Error("Invalid JSON"); }
    if (!parsed?.state) throw new Error("JSON does not contain state");

    const state = parsed.state;
    const now = Date.now();

    const meta: SaveMeta = {
      slotId,
      label: parsed?.meta?.label ?? `スロット${slotId}`,
      updatedAt: now,
      day: Number(state.day ?? 1),
      cash: Number(state.cash ?? 0),
      shopName: String(state.shopName ?? "My Store"),
      version: Number(state.version ?? 1),
      summary: parsed?.meta?.summary,
    };

    await this.save({ meta, state });
    await this.setLastUsedSlot(slotId);
  }

  async getLastUsedSlot(): Promise<SaveSlotId | null> {
    const db = await openDb();
    const rec = await tx<any>(db, stores.STORE_KV, "readonly", (store) => store.get(LAST_USED_SLOT_KEY));
    const v = rec?.value;
    return assertSlotId(v) ? v : null;
  }

  async setLastUsedSlot(slotId: SaveSlotId): Promise<void> {
    const db = await openDb();
    await tx(db, stores.STORE_KV, "readwrite", (store) => store.put({ key: LAST_USED_SLOT_KEY, value: slotId }));
  }
}
