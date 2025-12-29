"use client";

import React, { useEffect, useMemo, useState } from "react";
import { IndexedDbSaveRepository } from "@/game/save/indexedDbSaveRepository";
import { SAVE_SLOTS, type SaveData, type SaveMeta, type SaveSlotId } from "@/game/save/types";
import { useGameStore } from "@/game/store/gameStore";

function formatDate(ms?: number) {
  if (!ms) return "-";
  const d = new Date(ms);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${String(
    d.getHours()
  ).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function SaveManager() {
  const repo = useMemo(() => new IndexedDbSaveRepository(), []);
  const { state: gameState, setState: setGameState } = useGameStore();

  const [metas, setMetas] = useState<Record<SaveSlotId, SaveMeta | null>>({ A: null, B: null, C: null });
  const [lastUsed, setLastUsed] = useState<SaveSlotId | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>("");

  async function refresh() {
    const list = await repo.listMetas();
    const m: Record<SaveSlotId, SaveMeta | null> = { A: null, B: null, C: null };
    for (const meta of list) {
      if (meta.slotId === "A" || meta.slotId === "B" || meta.slotId === "C") m[meta.slotId] = meta;
    }
    setMetas(m);
    setLastUsed(await repo.getLastUsedSlot());
  }

  useEffect(() => {
    refresh().catch((e) => setMessage(String(e?.message ?? e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function buildSaveData(slotId: SaveSlotId): SaveData {
    const now = Date.now();
    return {
      meta: {
        slotId,
        label: `スロット${slotId}`,
        updatedAt: now,
        day: gameState.day,
        cash: gameState.cash,
        shopName: gameState.shopName,
        version: gameState.version,
        summary: `Day ${gameState.day} / ¥${gameState.cash.toLocaleString()}`,
      },
      state: gameState,
    };
  }

  async function doSave(slotId: SaveSlotId) {
    setBusy(true);
    setMessage("");
    try {
      await repo.save(buildSaveData(slotId));
      await repo.setLastUsedSlot(slotId);
      await refresh();
      setMessage(`保存しました（スロット${slotId}）`);
    } catch (e: any) {
      setMessage(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function doLoad(slotId: SaveSlotId) {
    setBusy(true);
    setMessage("");
    try {
      const data = await repo.load(slotId);
      if (!data) {
        setMessage(`スロット${slotId}は空です`);
        return;
      }
      setGameState(data.state);
      await repo.setLastUsedSlot(slotId);
      await refresh();
      setMessage(`ロードしました（スロット${slotId}）: ${data.meta.shopName} / Day ${data.meta.day}`);
    } catch (e: any) {
      setMessage(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function doDelete(slotId: SaveSlotId) {
    const ok = confirm(`スロット${slotId}を削除します。よろしいですか？`);
    if (!ok) return;

    setBusy(true);
    setMessage("");
    try {
      await repo.remove(slotId);
      await refresh();
      setMessage(`削除しました（スロット${slotId}）`);
    } catch (e: any) {
      setMessage(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function doExport(slotId: SaveSlotId) {
    setBusy(true);
    setMessage("");
    try {
      const json = await repo.exportJson(slotId);
      downloadText(`save_${slotId}.json`, json);
      setMessage(`書き出しました（スロット${slotId}）`);
    } catch (e: any) {
      setMessage(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function doImport(slotId: SaveSlotId, file: File | null) {
    if (!file) return;
    setBusy(true);
    setMessage("");
    try {
      const text = await file.text();
      await repo.importJson(text, slotId);
      await refresh();
      setMessage(`取り込みました（スロット${slotId}）`);
    } catch (e: any) {
      setMessage(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: 16 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>セーブ管理</h2>

      <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 12 }}>
        最後に使用したスロット: <b>{lastUsed ?? "-"}</b>
      </div>

      {message && (
        <div style={{ padding: 12, border: "1px solid #ddd", borderRadius: 12, marginBottom: 12 }}>
          {message}
        </div>
      )}

      <div style={{ display: "grid", gap: 12 }}>
        {SAVE_SLOTS.map((slotId) => {
          const meta = metas[slotId];
          return (
            <div key={slotId} style={{ border: "1px solid #ddd", borderRadius: 16, padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div style={{ fontSize: 16, fontWeight: 700 }}>
                  スロット{slotId} {lastUsed === slotId ? <span style={{ fontSize: 12 }}>（使用中）</span> : null}
                </div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>{formatDate(meta?.updatedAt)}</div>
              </div>

              <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.6 }}>
                {meta ? (
                  <>
                    <div>店名: <b>{meta.shopName}</b></div>
                    <div>Day: <b>{meta.day}</b> / 所持金: <b>¥{meta.cash.toLocaleString()}</b></div>
                    <div style={{ opacity: 0.8 }}>{meta.summary ?? ""}</div>
                  </>
                ) : (
                  <div style={{ opacity: 0.7 }}>空スロット</div>
                )}
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                <button disabled={busy} onClick={() => doSave(slotId)} style={{ padding: "8px 12px" }}>
                  保存
                </button>
                <button disabled={busy} onClick={() => doLoad(slotId)} style={{ padding: "8px 12px" }}>
                  ロード
                </button>
                <button disabled={busy || !meta} onClick={() => doExport(slotId)} style={{ padding: "8px 12px" }}>
                  書き出し
                </button>
                <label style={{ display: "inline-block" }}>
                  <input
                    disabled={busy}
                    type="file"
                    accept="application/json"
                    style={{ display: "none" }}
                    onChange={(e) => doImport(slotId, e.target.files?.[0] ?? null)}
                  />
                  <span
                    style={{
                      display: "inline-block",
                      padding: "8px 12px",
                      border: "1px solid #ccc",
                      borderRadius: 8,
                      cursor: busy ? "not-allowed" : "pointer",
                      opacity: busy ? 0.6 : 1,
                      userSelect: "none",
                    }}
                  >
                    取り込み
                  </span>
                </label>
                <button disabled={busy || !meta} onClick={() => doDelete(slotId)} style={{ padding: "8px 12px" }}>
                  削除
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 14, fontSize: 12, opacity: 0.7 }}>
        /game で遊びつつ、ここで保存/ロードできます。
      </div>
    </div>
  );
}
