"use client";

import React, { useMemo, useState } from "react";
import { useGameStore } from "@/game/store/gameStore";
import { SHELF_SLOTS } from "@/game/core/types";
import { TIME_SLOT_LABEL, TIME_SLOTS, type TimeSlot } from "@/game/core/time";
import { totalQty } from "@/game/core/inventory";

export default function GameView() {
  const { state, nextTime, newGame, setShopName, assignShelf, placeOrder, setStaff } = useGameStore();
  const [orderDraft, setOrderDraft] = useState<Record<string, number>>({});

  const pendingCount = useMemo(
    () => state.pendingOrders.reduce((a, o) => a + Object.values(o.items).reduce((x, q) => x + q, 0), 0),
    [state.pendingOrders]
  );

  const onOrderChange = (pid: string, v: string) => {
    const n = Math.max(0, Math.floor(Number(v) || 0));
    setOrderDraft((prev) => ({ ...prev, [pid]: n }));
  };

  const submitOrder = () => {
    placeOrder(orderDraft);
    setOrderDraft({});
  };

  const slotMetrics = state.lastReport
    ? {
        traffic: state.lastReport.trafficByTime[state.timeSlot] ?? 0,
        served: state.lastReport.servedByTime[state.timeSlot] ?? 0,
        lost: state.lastReport.lostByTime[state.timeSlot] ?? 0,
      }
    : { traffic: 0, served: 0, lost: 0 };

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: 16 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>コンビニ経営（人員＆行列）</h2>

        <button onClick={nextTime} style={{ padding: "10px 14px" }}>
          次の時間帯へ
        </button>
        <button onClick={newGame} style={{ padding: "10px 14px" }}>
          新規開始
        </button>

        <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Day</div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{state.day}</div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>時間帯</div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{TIME_SLOT_LABEL[state.timeSlot]}</div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>所持金</div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>¥{state.cash.toLocaleString()}</div>
        </div>
      </div>

      <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ fontSize: 12, opacity: 0.8 }}>店名</div>
        <input
          value={state.shopName}
          onChange={(e) => setShopName(e.target.value)}
          style={{ padding: "8px 10px", minWidth: 260 }}
        />
        <div style={{ fontSize: 12, opacity: 0.8 }}>
          明日入荷予定 合計: <b>{pendingCount}</b>
        </div>
      </div>

      {/* 人員 */}
      <div style={{ marginTop: 12, border: "1px solid #ddd", borderRadius: 16, padding: 12 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>人員（時間帯ごと）</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
          {TIME_SLOTS.map((ts: TimeSlot) => (
            <div key={ts} style={{ border: "1px solid #eee", borderRadius: 12, padding: 10 }}>
              <div style={{ fontSize: 12, opacity: 0.8 }}>{TIME_SLOT_LABEL[ts]}</div>
              <select
                value={state.staffing[ts] ?? 0}
                onChange={(e) => setStaff(ts, Number(e.target.value))}
                style={{ width: "100%", padding: "8px 10px", marginTop: 6 }}
              >
                {[0,1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}人</option>)}
              </select>
              {state.timeSlot === ts && state.lastReport ? (
                <div style={{ marginTop: 8, fontSize: 12, opacity: 0.85 }}>
                  来店: <b>{slotMetrics.traffic}</b> / 対応: <b>{slotMetrics.served}</b> / 離脱: <b>{slotMetrics.lost}</b>
                </div>
              ) : (
                <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>—</div>
              )}
            </div>
          ))}
        </div>
        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>
          ※ スタッフが少ない時間帯は「行列離脱」が発生し、売上が減ります（MVPは比例減衰）
        </div>
      </div>

      {/* 当日レポート */}
      <div style={{ marginTop: 12, border: "1px solid #ddd", borderRadius: 16, padding: 12 }}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>当日レポート（現在Dayの累計）</div>
        {state.lastReport ? (
          <div style={{ display: "grid", gap: 6 }}>
            <div>
              売上: <b>¥{state.lastReport.revenue.toLocaleString()}</b> /
              原価: <b>¥{state.lastReport.cost.toLocaleString()}</b> /
              粗利: <b>¥{state.lastReport.grossProfit.toLocaleString()}</b>
            </div>
            <div style={{ fontSize: 12, opacity: 0.85 }}>
              来店(推定): <b>{Object.values(state.lastReport.trafficByTime).reduce((a,b)=>a+b,0)}</b> /
              離脱: <b>{Object.values(state.lastReport.lostByTime).reduce((a,b)=>a+b,0)}</b>
            </div>
          </div>
        ) : (
          <div style={{ opacity: 0.7 }}>まだ当日レポートはありません（次の時間帯へ を押すと始まります）</div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12, marginTop: 12 }}>
        {/* 発注 */}
        <div style={{ border: "1px solid #ddd", borderRadius: 16, padding: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>発注（翌日入荷）</div>
          <div style={{ display: "grid", gap: 8 }}>
            {state.catalog.map((p) => (
              <div key={p.id} style={{ display: "grid", gridTemplateColumns: "1fr 90px 90px 110px", gap: 8, alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{p.name}</div>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>
                    売価¥{p.price} / 原価¥{p.cost} / 期限{p.shelfLifeDays}日
                  </div>
                </div>
                <div style={{ fontSize: 12, opacity: 0.85 }}>
                  在庫 <b>{totalQty(state.inventory, p.id)}</b>
                </div>
                <input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={orderDraft[p.id] ?? 0}
                  onChange={(e) => onOrderChange(p.id, e.target.value)}
                  style={{ padding: "8px 10px" }}
                />
                <div style={{ fontSize: 12, opacity: 0.85 }}>
                  目安粗利/個 <b>¥{(p.price - p.cost).toLocaleString()}</b>
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
            <button onClick={submitOrder} style={{ padding: "10px 14px" }}>
              発注する（翌日入荷）
            </button>
            <button onClick={() => setOrderDraft({})} style={{ padding: "10px 14px" }}>
              クリア
            </button>
          </div>
        </div>

        {/* 棚割り */}
        <div style={{ border: "1px solid #ddd", borderRadius: 16, padding: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>棚割り（棚に置くと需要補正 +15%）</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
            {SHELF_SLOTS.map((slot) => (
              <div key={slot} style={{ border: "1px solid #eee", borderRadius: 12, padding: 10 }}>
                <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>{slot}</div>
                <select
                  value={state.shelf[slot] ?? ""}
                  onChange={(e) => assignShelf(slot, e.target.value ? e.target.value : null)}
                  style={{ width: "100%", padding: "8px 10px" }}
                >
                  <option value="">（空）</option>
                  {state.catalog.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>
                  {state.shelf[slot] ? `在庫: ${totalQty(state.inventory, state.shelf[slot]!)}` : "在庫: -"}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 14, fontSize: 12, opacity: 0.7 }}>
        次の拡張候補：5分tick（疑似リアルタイム） or スタッフ賃金/人件費（粗利に効く）
      </div>
    </div>
  );
}
