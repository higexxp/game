"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import * as PIXI from "pixi.js";
import { TIME_SLOT_LABEL, TIME_SLOTS, type TimeSlot } from "@/gui/core/time";
import { useGuiStore } from "@/gui/store/guiStore";

// ★SPRITE: person sprite helper
const makePersonSprite = (src: string) => {
  // Texture.from(url) は非同期ロードされ、ロード完了後に自動で描画される
  const tex = PIXI.Texture.from(src);
  const sp = new PIXI.Sprite(tex);

  // 足元基準（人の立ち位置）
  sp.anchor.set(0.5, 1.0);

  // とりあえず見やすい固定サイズ（必要なら後で調整）
  sp.width = 16 * 2;
  sp.height = 32 * 2;

  // ドットをにじませない（Pixi v8）
  try {
    const anyTex: any = sp.texture as any;
    const srcObj: any = anyTex?.source ?? anyTex?.baseTexture;
    if (srcObj) srcObj.scaleMode = PIXI.SCALE_MODES.NEAREST;
  } catch (e) {}

  return sp as any;
};

// ★SPRITE: place person by "foot" position (x,y = where feet touch the floor)
// We treat inputs as "footX/footY". With anchor(0.5,1.0), the sprite's top is y - height,
// so we set sprite.y = footY + height to match older "center-based" coordinates.
const placePerson = (sp: any, footX: number, footY: number) => {
  sp.x = footX;
  const h = (typeof sp.height === "number" && isFinite(sp.height)) ? sp.height : 0;
  sp.y = footY + h;
};




// ---- SFX (Web Audio) ----
type SfxCtx = { ctx: AudioContext; master: GainNode };

function ensureSfx(sfxRef: { current: SfxCtx | null }) {
  const A = (globalThis as any).AudioContext || (globalThis as any).webkitAudioContext;
  if (!A) return null;

  if (!sfxRef.current) {
    const ctx: AudioContext = new A();
    const master = ctx.createGain();
    master.gain.value = 0.08;
    master.connect(ctx.destination);
    sfxRef.current = { ctx, master };
  }
  const { ctx } = sfxRef.current;
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return sfxRef.current;
}

function playCheckoutSfx(sfxRef: { current: SfxCtx | null }, which: "L" | "R") {
  const sfx = ensureSfx(sfxRef);
  if (!sfx) return;

  const { ctx, master } = sfx;
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  const freq = which === "L" ? 660 : 740;
  osc.type = "square";
  osc.frequency.setValueAtTime(freq, now);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.6, now + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);

  osc.connect(gain);
  gain.connect(master);

  osc.start(now);
  osc.stop(now + 0.1);
}

function playCheckoutDoneSfx(sfxRef: { current: SfxCtx | null }, which: "L" | "R") {
  const sfx = ensureSfx(sfxRef);
  if (!sfx) return;

  const { ctx, master } = sfx;
  const now = ctx.currentTime;

  // 「チン」っぽく：短い2音（上がる）
  const base = which === "L" ? 880 : 930;

  const osc1 = ctx.createOscillator();
  const g1 = ctx.createGain();
  osc1.type = "sine";
  osc1.frequency.setValueAtTime(base, now);
  g1.gain.setValueAtTime(0.0001, now);
  g1.gain.exponentialRampToValueAtTime(0.7, now + 0.006);
  g1.gain.exponentialRampToValueAtTime(0.0001, now + 0.10);
  osc1.connect(g1);
  g1.connect(master);
  osc1.start(now);
  osc1.stop(now + 0.11);

  const osc2 = ctx.createOscillator();
  const g2 = ctx.createGain();
  osc2.type = "sine";
  osc2.frequency.setValueAtTime(base * 1.25, now + 0.07);
  g2.gain.setValueAtTime(0.0001, now + 0.07);
  g2.gain.exponentialRampToValueAtTime(0.6, now + 0.076);
  g2.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
  osc2.connect(g2);
  g2.connect(master);
  osc2.start(now + 0.07);
  osc2.stop(now + 0.17);
}

// ---- GUI helpers ----
type Rect = { id: string; x: number; y: number; w: number; h: number; kind: "shelf" | "counter" | "entrance" | "exit" };

function clamp(n: number, a: number, b: number) { return Math.max(a, Math.min(b, n)); }
function centerOf(r: Rect) { return { x: r.x + r.w / 2, y: r.y + r.h / 2 }; }

function pickLastProcessedSlot(rep: any, fallback: TimeSlot): TimeSlot {
  if (!rep?.servedByTime || !rep?.lostByTime) return fallback;
  let last: TimeSlot = "morning";
  for (const ts of TIME_SLOTS) {
    const s = rep.servedByTime[ts] ?? 0;
    const l = rep.lostByTime[ts] ?? 0;
    if (s + l > 0) last = ts;
  }
  return last;
}

// ★POLISH: thought bubble (emoji icon) + checkout wiggle
const ensureThoughtBubble = (a: any, layer: any) => {
  if (a.thoughtG) return a.thoughtG;

  const t = new PIXI.Text({
    text: "",
    style: new PIXI.TextStyle({
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
      fontSize: 16,
      fill: 0xffffff,
      align: "center",
      stroke: { color: 0x111827, width: 3, join: "round" },
    }),
  });
  t.anchor.set(0.5, 1.0);
  t.alpha = 0;
  layer.addChild(t);
  a.thoughtG = t;
  return t;
};

const setThought = (a: any, layer: any, emoji: string | null, alpha = 0.95) => {
  const t = ensureThoughtBubble(a, layer);
  if (!emoji) {
    t.alpha = 0;
    return;
  }
  if (t.text !== emoji) t.text = emoji;
  t.alpha = alpha;
};

const tickCheckoutWiggle = (a: any, dt: number) => {
  // checkout中の“軽いガサガサ”演出（袋/商品アイコンがあるなら揺らす）
  const anyA = a as any;
  anyA._wiggleT = (anyA._wiggleT ?? 0) + dt;

  // 人（丸）を少しだけ上下に揺らす（酔わない程度）
  if (a.g) {
    const baseY = (anyA._baseY ?? a.g.y);
    anyA._baseY = baseY;
    a.g.y = baseY + Math.sin(anyA._wiggleT * 12) * 0.6;
  }

  // アイコン（袋/商品）が a.iconG に居る想定：回転/上下
  if (anyA.iconG) {
    const baseRot = (anyA._iconBaseRot ?? anyA.iconG.rotation ?? 0);
    anyA._iconBaseRot = baseRot;
    anyA.iconG.rotation = baseRot + Math.sin(anyA._wiggleT * 16) * 0.08;
    const baseIy = (anyA._iconBaseY ?? anyA.iconG.y);
    anyA._iconBaseY = baseIy;
    anyA.iconG.y = baseIy + Math.sin(anyA._wiggleT * 14) * 0.8;
  }
};

// ★レジ周りの「重なり防止」：店員/会計客/列先頭のスポットを分離
const counterSpotsFromRect = (rect: { x: number; y: number; w: number; h: number }) => {
  const c = centerOf(rect);
  // ここは好みで微調整OK（右利き想定で、店員は左上、客は右下）
  const cashier = { x: c.x - 18, y: c.y - 10 };
  const customer = { x: c.x + 16, y: c.y + 8 };
  // 列の先頭は「会計客の少し後ろ」
  const queueHead = { x: customer.x, y: customer.y + 24 };
  return { c, cashier, customer, queueHead };
};


type CounterId = "counter_1" | "counter_2";
type Phase =
  | "toShelf"
  | "oosPause"
  | "oosReturn"
  | "toQueue"
  | "waitQueue"
  | "toCounter"
  | "checkout"
  | "toExit";
type LostPhase = "toQueueFront" | "uTurn" | "done";

type Actor = {
  g: PIXI.Graphics;
  kind: "served" | "lost";
  phase: Phase | LostPhase;

  targetShelfId?: string;
  queueIndex?: number; // spawn順（位置の安定用/保険）
  targetCounter?: CounterId;

  waitLeft?: number;
  checkoutLeft?: number;
  oosLeft?: number;

  // ★所持商品アイコン
  hasItem?: boolean;
  itemG?: PIXI.Graphics;
  itemCount?: number;

  // ★会計時：アイコン吸い込み
  itemMode?: "follow" | "suck";
  itemSuckT?: number;

  // ★会計後：袋アイコン
  bagG?: PIXI.Graphics;
  hasBag?: boolean;

  // ★FIFOキュー管理：到着してキュー配列に入ったか
  queued?: boolean;

  // ★リアル志向：レジ移動（迷い客）
  switchCooldown?: number; // 秒
  switchCount?: number; // 何回移動したか
  switchTintLeft?: number; // ★迷ってる表現（薄色の残り秒）
  lookAroundLeft?: number; // ★キョロキョロ中は移動停止（残り秒）
  emoteG?: PIXI.Graphics; // ★頭上の「？」など
};

type PopFx = { g: PIXI.Graphics; life: number; vx: number; vy: number };

function itemStyleForShelf(shelfId: string) {
  const map: Record<string, { fill: number; stroke: number; mark: string }> = {
    shelf_a: { fill: 0x60a5fa, stroke: 0x1e3a8a, mark: "A" },
    shelf_b: { fill: 0x34d399, stroke: 0x065f46, mark: "B" },
    shelf_c: { fill: 0xc084fc, stroke: 0x6b21a8, mark: "C" },
    island_1: { fill: 0xfb923c, stroke: 0x9a3412, mark: "1" },
    island_2: { fill: 0xf87171, stroke: 0x7f1d1d, mark: "2" },
  };
  return map[shelfId] ?? { fill: 0xfbbf24, stroke: 0x92400e, mark: "?" };
}

function makeItemIcon(shelfId: string): PIXI.Graphics {
  const st = itemStyleForShelf(shelfId);

  const g = new PIXI.Graphics();
  g.roundRect(-8, -7, 16, 14, 3).fill(st.fill).stroke({ width: 2, color: st.stroke });
  g.moveTo(-7, -1).lineTo(7, -1).stroke({ width: 2, color: st.stroke });

  const t = new PIXI.Text({
    text: st.mark,
    style: new PIXI.TextStyle({
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto",
      fontSize: 10,
      fill: 0x0b1220,
      fontWeight: "900",
    }),
  });
  t.anchor.set(0.5);
  t.x = 0;
  t.y = 4;
  g.addChild(t);

  return g;
}

function makeBagIcon(): PIXI.Graphics {
  const g = new PIXI.Graphics();
  g.roundRect(-8, -8, 16, 18, 3).fill(0xffffff);
  g.alpha = 0.75;
  g.stroke({ width: 2, color: 0x9ca3af });

  const h = new PIXI.Graphics();
  h.moveTo(-6, -8).lineTo(-3, -14).lineTo(-1, -8).stroke({ width: 2, color: 0x9ca3af });
  h.moveTo(6, -8).lineTo(3, -14).lineTo(1, -8).stroke({ width: 2, color: 0x9ca3af });
  g.addChild(h);

  (g as any).__baseScale = 1;
  return g;
}

function makeEmoteIcon(): PIXI.Graphics {
  const g = new PIXI.Graphics();
  // 吹き出し
  g.roundRect(-10, -14, 20, 18, 6).fill(0xffffff).stroke({ width: 2, color: 0x94a3b8 });
  // しっぽ
  g.moveTo(-2, 4).lineTo(0, 8).lineTo(2, 4).closePath().fill(0xffffff).stroke({ width: 2, color: 0x94a3b8 });

  const t = new PIXI.Text({
    text: "?",
    style: new PIXI.TextStyle({
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto",
      fontSize: 14,
      fill: 0x111827,
      fontWeight: "900",
    }),
  });
  t.anchor.set(0.5);
  t.x = 0;
  t.y = -6;
  g.addChild(t);

  return g;
}


export default function StoreGuiView() {
  const sfxRef = useRef<SfxCtx | null>(null);

  const hostRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<PIXI.Application | null>(null);

  // ★ Next.js対策：selectorで新規オブジェクトを返さない
  const day = useGuiStore((s) => s.day);
  const timeSlot = useGuiStore((s) => s.timeSlot);
  const rngSeed = useGuiStore((s) => s.rngSeed);
  const staffByTime = useGuiStore((s) => s.staffByTime);
  const shelfStock = useGuiStore((s) => s.shelfStock);
  const lastReport = useGuiStore((s) => s.lastReport);
  const advanceTime = useGuiStore((s) => s.advanceTime);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  // GUI tick ボタンを押した回数（初期表示は動かさない）
  const [tickSeq, setTickSeq] = useState(0);
  const onGuiNext = () => {
    ensureSfx(sfxRef);
    setTickSeq((n) => n + 1);
    advanceTime();
  };

  const layout: Rect[] = useMemo(() => ([
    { id: "entrance", x: 40,  y: 420, w: 80,  h: 60, kind: "entrance" },
    { id: "exit",     x: 860, y: 420, w: 80,  h: 60, kind: "exit" },

    { id: "counter_1", x: 640, y: 80,  w: 140, h: 90, kind: "counter" },
    { id: "counter_2", x: 810, y: 80,  w: 140, h: 90, kind: "counter" },

    { id: "shelf_a", x: 180, y: 80,  w: 110, h: 320, kind: "shelf" },
    { id: "shelf_b", x: 330, y: 80,  w: 110, h: 320, kind: "shelf" },
    { id: "shelf_c", x: 480, y: 80,  w: 110, h: 320, kind: "shelf" },

    { id: "island_1", x: 260, y: 430, w: 260, h: 70, kind: "shelf" },
    { id: "island_2", x: 560, y: 430, w: 240, h: 70, kind: "shelf" },
  ]), []);

  const displaySlot = pickLastProcessedSlot(lastReport, timeSlot);
  const served = lastReport?.servedByTime?.[displaySlot] ?? 0;
  const lost = lastReport?.lostByTime?.[displaySlot] ?? 0;

  const staffTotal = clamp(staffByTime?.[displaySlot] ?? 1, 1, 10);
  const staff1 = Math.max(1, Math.floor((staffTotal + 1) / 2));
  const staff2 = Math.max(0, staffTotal - staff1);

  // ★スタッフ能力（ゲーム性）：同じ人数でも処理速度が変わる
  // 0.80〜1.25 の範囲で変動（表示スロットごとに変わる）
  const slotIdx = TIME_SLOTS.indexOf(displaySlot as any);
  const hash1 = (rngSeed * 9301 + day * 49297 + (slotIdx + 1) * 233) >>> 0;
  const hash2 = (rngSeed * 7307 + day * 17137 + (slotIdx + 1) * 997) >>> 0;
  const staffSkill1 = 0.80 + ((hash1 % 46) / 100); // 0.80〜1.25
  const staffSkill2 = 0.80 + ((hash2 % 46) / 100); // 0.80〜1.25

  const serviceSpeed1 = Math.pow(staff1, 0.7) * staffSkill1;
  const serviceSpeed2 = Math.pow(Math.max(1, staff2), 0.7) * staffSkill2;
  useEffect(() => {

    // ★POLISH: money pop (floating sales amount)
    const moneyPops: Array<{
      g: PIXI.Text;
      vx: number;
      vy: number;
      life: number;
      age: number;
    }> = [];

    const formatYen = (n: number) => `¥${Math.round(n).toLocaleString("ja-JP")}`;

    const spawnMoneyPop = (x: number, y: number, amount: number) => {
      const t = new PIXI.Text({
        text: `+${formatYen(amount)}`,
        style: new PIXI.TextStyle({
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
          fontSize: 16,
          fontWeight: "700",
          fill: 0xfde047,
          stroke: { color: 0x111827, width: 4, join: "round" },
          dropShadow: true,
          dropShadowDistance: 2,
          dropShadowBlur: 0,
          dropShadowAngle: 0.9,
          dropShadowColor: 0x000000,
          dropShadowAlpha: 0.35,
        } as any),
      });
      t.anchor.set(0.5, 0.5);
      t.x = x;
      t.y = y - 6;
      t.alpha = 0.0;
      t.scale.set(0.9);

      (actorLayer as any).addChild(t);

      moneyPops.push({
        g: t,
        vx: (Math.random() - 0.5) * 10,
        vy: 38 + Math.random() * 10,
        life: 0.9,
        age: 0,
      });
    };

    const tickMoneyPops = (dt: number) => {
      for (let i = moneyPops.length - 1; i >= 0; i--) {
        const p = moneyPops[i];
        p.age += dt;

        p.g.x += p.vx * dt * 0.3;
        p.g.y -= p.vy * dt;

        const inT = 0.12;
        const outT = 0.25;

        if (p.age < inT) {
          p.g.alpha = Math.min(1, p.age / inT);
          const s = 0.9 + (p.age / inT) * 0.15;
          p.g.scale.set(s);
        } else {
          const left = p.life - (p.age - inT);
          const a = (left <= 0) ? 0 : Math.min(1, left / outT);
          p.g.alpha = a;
        }

        if (p.age >= (p.life + inT)) {
          try { p.g.destroy(); } catch (e) {}
          moneyPops.splice(i, 1);
        }
      }
    };


    if (!hostRef.current) return;

    if (appRef.current) {
      appRef.current.destroy(true);
      appRef.current = null;
    }

    const host = hostRef.current;
    const app = new PIXI.Application();

      // ★SPRITE: preload textures (ensure sprites actually render)
      const spritesReady = (async () => {
        try {
          const urls = [
            "/sprites/person_idle.png",
            "/sprites/person_lost.png",
            "/sprites/person_orange.png",
            "/sprites/clerk_idle.png",
          ];
          const A: any = (PIXI as any).Assets;
          if (A?.load) await A.load(urls);
        } catch (e) {
          // ignore (fallback rectangles will show if textures fail)
        }
      })();

    appRef.current = app;

    let cancelled = false;

    (async () => {
      await app.init({
        resizeTo: host,
        antialias: true,
        background: "#f6f6f6",
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });
      if (cancelled) return;

      host.appendChild(app.canvas);

      const world = new PIXI.Container();
      world.sortableChildren = true;
      app.stage.addChild(world);

      const floorLayer = new PIXI.Container();
      floorLayer.zIndex = 0;
      const staticLayer = new PIXI.Container();
      const shelfStockLayer = new PIXI.Container();
      shelfStockLayer.zIndex = 15;
      const staffLayer = new PIXI.Container();
      staffLayer.zIndex = 45;
      const actorLayer = new PIXI.Container();
      actorLayer.zIndex = 40;
      const itemLayer = new PIXI.Container();
      itemLayer.zIndex = 50;
      const fxLayer = new PIXI.Container();
      const uiLayer = new PIXI.Container();
      uiLayer.zIndex = 100;
      world.addChild(floorLayer);
      world.addChild(staticLayer);
      world.addChild(shelfStockLayer);
      world.addChild(staffLayer);
      world.addChild(actorLayer);
      world.addChild(itemLayer);
      world.addChild(fxLayer);
      world.addChild(uiLayer);

      world.sortChildren();
      const floor = new PIXI.Graphics();
      floor.rect(20, 20, 940, 520).fill(0xffffff).stroke({ width: 2, color: 0xdddddd });
      floorLayer.addChild(floor);

      const rectById = new Map(layout.map((r) => [r.id, r]));
      const entrance = rectById.get("entrance")!;
      const exit = rectById.get("exit")!;
      const counter1 = rectById.get("counter_1")!;
      const counter2 = rectById.get("counter_2")!;
      const shelfRects = layout.filter(r => r.kind === "shelf");
      const shelfIds = shelfRects.map(r => r.id);
      // ★Queue/Checkout positions (avoid entering behind staff)
      const CHECKOUT_PAD = 26; // レジ台の手前（外側）に会計位置を置く
      const QUEUE_PAD = 18;    // 会計位置からさらに後ろが列の基準

      const checkoutSpot1 = { x: centerOf(counter1).x, y: counter1.y + counter1.h + CHECKOUT_PAD };
      const checkoutSpot2 = { x: centerOf(counter2).x, y: counter2.y + counter2.h + CHECKOUT_PAD };
      const queueBase1 = { x: checkoutSpot1.x, y: checkoutSpot1.y + QUEUE_PAD };
      const queueBase2 = { x: checkoutSpot2.x, y: checkoutSpot2.y + QUEUE_PAD };
      // ★重要：ticker中に Zustand を更新しない（ローカル在庫）
      const localShelfStock = new Map<string, number>();
      for (const sid of shelfIds) localShelfStock.set(sid, shelfStock?.[sid] ?? 0);

      let staffDots1: PIXI.Graphics[] = [];
      let staffDots2: PIXI.Graphics[] = [];

      const clearContainer = (c: PIXI.Container) => {
        while (c.children.length) {
          const child = c.removeChildAt(c.children.length - 1);
          child.destroy();
        }
      };

      const drawStaffDots = (counter: Rect, staffN: number): PIXI.Graphics[] => {
        const dots: PIXI.Graphics[] = [];
        const staffR = 8;
        const staffGap = 18;
        const baseX = centerOf(counter).x - ((staffN - 1) * staffGap) / 2;
        const baseY = counter.y + counter.h / 2 + 6;
        for (let i = 0; i < staffN; i++) {
          const g = makePersonSprite("/sprites/clerk_idle.png");
          placePerson(g, baseX + i * staffGap, baseY);
          (g as any).__baseY = g.y;
          (g as any).__baseX = g.x;
          g.alpha = 1;
actorLayer.addChild(g);
          dots.push(g);
        }
        return dots;
      };

      const renderShelfStock = () => {
        clearContainer(shelfStockLayer);

        for (const r of shelfRects) {
          const qty = localShelfStock.get(r.id) ?? 0;

          const maxIcons = 8;
          const show = Math.min(maxIcons, qty);
          const padX = 10;
          const padY = 38;
          const iconW = 10;
          const iconH = 10;
          const gap = 3;

          for (let i = 0; i < show; i++) {
            const box = new PIXI.Graphics();
            const alpha = qty <= 2 ? 0.45 : 0.85;
            box.roundRect(0, 0, iconW, iconH, 2).fill(0x0f172a);
            box.alpha = alpha;
            box.x = r.x + padX + (i % 4) * (iconW + gap);
            box.y = r.y + padY + Math.floor(i / 4) * (iconH + gap);
            shelfStockLayer.addChild(box);
          }

          const txt = new PIXI.Text({
            text: `x${qty}`,
            style: new PIXI.TextStyle({
              fontFamily: "system-ui, -apple-system, Segoe UI, Roboto",
              fontSize: 12,
              fill: qty === 0 ? 0xef4444 : 0x111827,
              fontWeight: "700",
            }),
          });
          txt.x = r.x + padX;
          txt.y = r.y + 20;
          shelfStockLayer.addChild(txt);
        }
      };

      const drawStatic = () => {
        clearContainer(staticLayer);
        staffLayer.removeChildren();

        for (const r of layout) {
          const g = new PIXI.Graphics();
          const baseColor =
            r.kind === "shelf" ? 0xcbd5e1 :
            r.kind === "counter" ? 0xfde68a :
            r.kind === "entrance" ? 0xbbf7d0 : 0xfecaca;

          const strokeColor = selectedId === r.id ? 0x2563eb : 0x94a3b8;

          g.roundRect(r.x, r.y, r.w, r.h, 10).fill(baseColor).stroke({ width: 3, color: strokeColor });
          g.eventMode = "static";
          g.cursor = "pointer";
          g.on("pointertap", () => setSelectedId(r.id));
          staticLayer.addChild(g);

          const label = new PIXI.Text({
            text: r.id,
            style: new PIXI.TextStyle({
              fontFamily: "system-ui, -apple-system, Segoe UI, Roboto",
              fontSize: 14,
              fill: 0x111827,
            }),
          });
          label.x = r.x + 10;
          label.y = r.y + 8;
          staticLayer.addChild(label);
        }

        staffDots1 = drawStaffDots(counter1, staff1);
        staffDots2 = drawStaffDots(counter2, staff2);

      // ★SPRITE: redraw staff after preload (avoid pink fallback created before textures are ready)
      try {
        (spritesReady as any)?.then?.(() => {
          // staffLayer をクリアして描き直す（この時点では Texture.from が実体を指す）
          // ★SPRITE: staff draw after preload (avoid initial pink fallback)
          try {
            (spritesReady as any)?.then?.(() => {
              staffLayer.removeChildren();
              staffDots1 = drawStaffDots(counter1, staff1);
              staffDots2 = drawStaffDots(counter2, staff2);
            });
          } catch (e) {}
        });
      } catch (e) {}
      };

      // ---- actors & fx ----
      const actors: Actor[] = [];
      const pops: PopFx[] = [];

      // ★到着順キュー（FIFO）
      const q1: Actor[] = [];
      const q2: Actor[] = [];

      // ---- economy / counters (MVP) ----
      let totalSales = 0;
      let customersServed = 0;
      let customersSpawned = 0;
      const pricePerCheckout = 300; // MVP: fixed price per customer

      const qRef = (cid: CounterId) => (cid === "counter_1" ? q1 : q2);

      // ★押し合い防止：前の人に近づきすぎたら前進しない（waitQueue用）
      const applyNoPushInQueue = (cid: CounterId, me: Actor, tx: number, ty: number) => {
        const q = qRef(cid);
        const i = q.indexOf(me);
        if (i <= 0) return { tx, ty };

        const prev = q[i - 1];
        if (!prev?.g) return { tx, ty };

        // 列は下方向に伸びる想定：前の人の “少し後ろ” を越えない
        const sp = spacingFor(queueSizeFor(cid));
        const minGap = sp * 0.92; // ちょい詰め気味（好みで 0.85〜0.98）
        const limitY = prev.g.y + minGap;

        // 自分の目標が前すぎる（= 押し込もうとしてる）なら、目標を後ろに戻す
        if (ty < limitY) ty = limitY;

        // 横方向も近すぎる時は吸い寄せ過ぎない（軽く緩和）
        const dx = tx - prev.g.x;
        if (Math.abs(dx) < 2) tx = prev.g.x + Math.sign(dx || 1) * 2;

        return { tx, ty };
      };

      // ★キュー登録を保証（重なり防止）
      // - mode="tail": 最後尾に追加（通常の並び）
      // - mode="head": 先頭に追加（レジ前まで来たが埋まっていて戻された等）
      const ensureQueued = (cid: CounterId, a: Actor, mode: "tail" | "head" = "tail") => {
        const q = qRef(cid);
        if (q.includes(a)) return;
        if (mode === "head") q.unshift(a);
        else q.push(a);
        a.queued = true;
      };
      const qRemove = (cid: CounterId, a: Actor) => {
        const q = qRef(cid);
        const i = q.indexOf(a);
        if (i >= 0) q.splice(i, 1);
      };

      const spawnPop = (x: number, y: number) => {
        const g = new PIXI.Graphics();
        g.circle(0, 0, 6).fill(0x22c55e);
        g.x = x;
        g.y = y;
        fxLayer.addChild(g);
        pops.push({ g, life: 0.45, vx: (Math.random() - 0.5) * 20, vy: -40 - Math.random() * 30 });
      };

      const attachItemIcon = (a: Actor) => {
        if (a.itemG) return;
        const icon = makeItemIcon(a.targetShelfId ?? "unknown");
        icon.x = a.g.x;
        icon.y = a.g.y - 18;
        itemLayer.addChild(icon);
        a.itemG = icon;
        a.hasItem = true;
        a.itemCount = (a.itemCount ?? 0) + 1;
        a.itemMode = "follow";
        a.itemSuckT = 0;
      };

      const attachBagIcon = (a: Actor) => {
        if (a.bagG) return;
        const bag = makeBagIcon();
        bag.x = a.g.x;
        bag.y = a.g.y - 20;
        bag.alpha = 0.85;

        const nItems = Math.max(1, a.itemCount ?? 1);
        const bump = Math.min(8, Math.max(0, nItems - 1));
        const sc = 1 + 0.06 * bump;
        bag.scale.set(sc);
        (bag as any).__baseScale = sc;

        itemLayer.addChild(bag);
        a.bagG = bag;
        a.hasBag = true;
      };

      const destroyActor = (a: Actor) => {
        // キューに残ってたら除去
        if (a.targetCounter) qRemove(a.targetCounter, a);
        a.g.destroy();
        if (a.itemG) a.itemG.destroy();
        if (a.bagG) a.bagG.destroy();
        if (a.emoteG) a.emoteG.destroy();
      };

      const spawnServed = (n: number) => {
        const MAX_ANIM = 12;
        const count = Math.min(MAX_ANIM, Math.max(0, n));
        for (let i = 0; i < count; i++) {
          customersSpawned += 1;
          const g = makePersonSprite("/sprites/person_idle.png");
          placePerson(g, centerOf(entrance).x, centerOf(entrance).y);
          actorLayer.addChild(g);

          const targetShelfId =
            (selectedId && rectById.get(selectedId)?.kind === "shelf")
              ? selectedId
              : shelfIds[Math.abs((rngSeed + i * 991) | 0) % shelfIds.length] ?? "shelf_a";

          actors.push({ g, kind: "served", phase: "toShelf", targetShelfId, queueIndex: i, queued: false });
        }
        updateHud();
      };

      const spawnLost = (n: number) => {
        const MAX_ANIM = 10;
        const count = Math.min(MAX_ANIM, Math.max(0, n));
        for (let i = 0; i < count; i++) {
          customersSpawned += 1;
          const g = makePersonSprite("/sprites/person_lost.png");
          g.alpha = 0.55;
          g.x = centerOf(entrance).x;
          g.y = centerOf(entrance).y;
          actorLayer.addChild(g);

          actors.push({ g, kind: "lost", phase: "toQueueFront", queueIndex: i });
        }
        updateHud();
      };

      const clearActors = () => {
        for (const a of actors) destroyActor(a);
        actors.length = 0;
        for (const p of pops) p.g.destroy();
        pops.length = 0;
        q1.length = 0;
        q2.length = 0;
      };

      const startAnimationForThisTick = () => {
        clearActors();
        if (tickSeq <= 0) return;
        spawnLost(lost);
        spawnServed(served);
      };

      drawStatic();
      renderShelfStock();

      // ---- UI text (MVP) ----
      const hudText = new PIXI.Text({
        text: "",
        style: new PIXI.TextStyle({
          fontFamily: "monospace",
          fontSize: 14,
          fill: 0xffffff,
          stroke: 0x000000,
          strokeThickness: 4,
        }),
      });
      hudText.x = 12;
      hudText.y = 10;
      hudText.zIndex = 101;
      uiLayer.addChild(hudText);

      const updateHud = () => {
        hudText.text =
          `Sales: ¥${totalSales}\n` +
          `Served: ${customersServed}\n` +
          `Spawned: ${customersSpawned}`;
      };
      updateHud();

      startAnimationForThisTick();

      // ---- queue helpers ----
      const baseSpeed = 190;

      const moveToward = (g: PIXI.Graphics, tx: number, ty: number, dt: number, speedMul = 1) => {
        const dx = tx - g.x;
        const dy = ty - g.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 2.5) return true;
        const sp = baseSpeed * speedMul;
        const vx = (dx / dist) * sp;
        const vy = (dy / dist) * sp;
        g.x = clamp(g.x + vx * dt, 30, 950);
        g.y = clamp(g.y + vy * dt, 30, 530);
        return false;
      };

      // PR-1: Use checkoutSpot for toCounter/checkout to prevent entering counter area
      const spacingFor = (queueSize: number) => clamp(16 - Math.max(0, queueSize - 6) * 1.2, 9, 16);

      const queueBaseFor = (cid: CounterId) => cid === "counter_1" ? queueBase1 : queueBase2;
      const checkoutSpotFor = (cid: CounterId) => (cid === "counter_1" ? checkoutSpot1 : checkoutSpot2);
      // ★重要: 会計位置は「レジ台の外側」に固定（レジ内部・店員背後へ侵入しない）
      // counterPosFor は廃止し、checkoutSpot を唯一の真実にする
      const counterPosFor = (cid: CounterId) => checkoutSpotFor(cid);
      const serviceSpeedFor = (cid: CounterId) => cid === "counter_1" ? serviceSpeed1 : serviceSpeed2;

      // ★レジ占有：同時にcheckoutできるのは各レジ1人だけ
      const counterBusyFor = (cid: CounterId) =>
        actors.some((a) => a.kind === "served" && a.targetCounter === cid && a.phase === "checkout");

      const hasStaffFor = (cid: CounterId) => (cid === "counter_1" ? staff1 > 0 : staff2 > 0);

      const queueSizeFor = (cid: CounterId) => {

        const arrived = qRef(cid).length;
        const enRoute = actors.filter((a) => a.kind === "served" && a.targetCounter === cid && a.phase === "toQueue").length;
        return arrived + enRoute;
      };
      // ★ETA（到着予測時間）計算（待ち＋移動）
      const estimateEtaFor = (cid: CounterId, fromX?: number, fromY?: number) => {
        if (!hasStaffFor(cid)) return 1e9;
        const base = queueBaseFor(cid);
        const spacing = spacingFor(queueSizeFor(cid));
        const tailIndex = qRef(cid).length; // 到着済み末尾
        const tx = base.x;
        const ty = base.y + tailIndex * spacing;

        const dx = (fromX ?? centerOf(entrance).x) - tx;
        const dy = (fromY ?? centerOf(entrance).y) - ty;
        const dist = Math.hypot(dx, dy);

        const travel = dist / Math.max(1, baseSpeed);

        const qSize = queueSizeFor(cid); // 到着済み＋向かってる
        const sp = serviceSpeedFor(cid);
        const per = 0.55 / Math.max(0.5, sp); // 1人あたりの粗い時間
        const wait = qSize * per;

        return travel + wait;
      };


      const chooseCounter = (fromX?: number, fromY?: number): CounterId => {
        if (staff2 <= 0) return "counter_1";

        // ★ETA（到着予測時間）でレジ選択
        // - 移動: 現在地→レジ列末までの距離 / baseSpeed
        // - 待ち:（列の到着済み + 向かってる人数）/ 処理速度
        const baseSp = baseSpeed; // px/s

        const etaFor = (cid: CounterId) => {
          const base = queueBaseFor(cid);
          const spacing = spacingFor(queueSizeFor(cid));
          const tailIndex = qRef(cid).length; // 到着済み末尾

          // 列末（だいたいこの辺）へ向かう
          const tx = base.x;
          const ty = base.y + tailIndex * spacing;

          const dx = (fromX ?? centerOf(entrance).x) - tx;
          const dy = (fromY ?? centerOf(entrance).y) - ty;
          const dist = Math.hypot(dx, dy);

          const travel = dist / Math.max(1, baseSp);

          const qSize = queueSizeFor(cid); // 到着済み＋向かってる
          const sp = serviceSpeedFor(cid);

          // 1人あたりの処理時間の粗い近似（checkoutLeft ~ 0.55/sp を採用）
          const per = 0.55 / Math.max(0.5, sp);

          // 自分の前にいる人数分の待ち
          const wait = qSize * per;

          return travel + wait;
        };

                const e1 = estimateEtaFor("counter_1", fromX, fromY);
        const e2 = estimateEtaFor("counter_2", fromX, fromY);

        // ほぼ同じなら左優先（見た目の安定）
        if (Math.abs(e1 - e2) < 0.08) return "counter_1";
        return e1 <= e2 ? "counter_1" : "counter_2";
      };

      const queueRank = (a: Actor, cid: CounterId) => {
        const q = qRef(cid);
        const i = q.indexOf(a);
        return i >= 0 ? i : q.length; // 未投入は末尾扱い
      };

      // ---- staff busy ----
      let tAccum = 0;

      const setStaffIdle = (dots: PIXI.Graphics[]) => {
        for (const d of dots) {
          const bx = (d as any).__baseX ?? d.x;
          const by = (d as any).__baseY ?? d.y;
          d.x = bx;
          d.y = by;
          d.scale.set(1);
          d.alpha = 1;
        }
      };

      const setStaffBusy = (dots: PIXI.Graphics[], phaseOffset: number) => {
        for (let i = 0; i < dots.length; i++) {
          const d = dots[i];
          const bx = (d as any).__baseX ?? d.x;
          const by = (d as any).__baseY ?? d.y;
          const w = 9;
          const amp = 2.2;
          const sc = 1 + 0.04 * Math.sin(tAccum * 6 + i);
          d.x = bx;
          d.y = by + amp * Math.sin(tAccum * w + i + phaseOffset);
          d.scale.set(sc);
          d.alpha = 0.92 + 0.08 * Math.sin(tAccum * 7 + i);
        }
      };

      // ---- ticker ----
      app.ticker.add((t) => {
        if (cancelled) return;
        const dt = t.deltaMS / 1000;
        tickMoneyPops(dt);
        tAccum += dt;

        // fx update
        for (let i = pops.length - 1; i >= 0; i--) {
          const p = pops[i];
          p.life -= dt;
          p.g.x += p.vx * dt;
          p.g.y += p.vy * dt;
          p.g.alpha = clamp(p.life / 0.45, 0, 1);
          if (p.life <= 0) {
            p.g.destroy();
            pops.splice(i, 1);
          }
        }

        renderShelfStock();

        const qSize1 = queueSizeFor("counter_1");
        const qSize2 = queueSizeFor("counter_2");
        const qSpacing1 = spacingFor(qSize1);
        const qSpacing2 = spacingFor(qSize2);

        const busy1 = actors.some(a => a.kind === "served" && a.targetCounter === "counter_1" && a.phase === "checkout");
        const busy2 = actors.some(a => a.kind === "served" && a.targetCounter === "counter_2" && a.phase === "checkout");

        if (busy1) setStaffBusy(staffDots1, 0.0); else setStaffIdle(staffDots1);
        if (busy2) setStaffBusy(staffDots2, 1.3); else setStaffIdle(staffDots2);

        for (const a of actors) {
          // ★迷い客の見た目：一定時間だけ薄くする
          if (a.switchTintLeft && a.switchTintLeft > 0) {
            a.switchTintLeft = Math.max(0, a.switchTintLeft - dt);
            // 0.55〜0.95の間でふわっと戻す
            const k = a.switchTintLeft / 2.2; // 1→0
            a.g.alpha = 0.55 + (1 - k) * 0.40;
          } else {
            // servedの通常は不透明（lostは別でalpha制御してるので触らない）
            if (a.kind === "served") a.g.alpha = 1;
          }

          const g = a.g;          // ★移動停止：キョロキョロ中＋会計中（レジbusy）なら waitQueue は止める
          const freezeMove =
            (a.kind === "served" &&
              (a.phase === "waitQueue" && counterBusyFor(a.targetCounter as CounterId))) ||
            (a.kind === "served" &&
              (a.lookAroundLeft ?? 0) > 0 &&
              a.phase !== "oosPause" &&
              a.phase !== "oosReturn");
          const dtMove = freezeMove ? 0 : dt;

          // ★迷い客：バブル（？）＋キョロキョロ（分かりやすく）
          if ((a.lookAroundLeft ?? 0) > 0) {
            a.lookAroundLeft = Math.max(0, (a.lookAroundLeft ?? 0) - dt);

            // 見た目：しっかり目にキョロキョロ
            const idx = (a.queueIndex ?? 0) + (a.targetCounter === "counter_2" ? 17 : 0);
            g.rotation = Math.sin(tAccum * 13.0 + idx) * 0.22; // ←分かりやすく
            g.x += Math.sin(tAccum * 18.0 + idx) * 1.8;        // ←分かりやすく（微ズレ）
            // 薄色（既存tintがある場合はそれを優先しつつ、最低でも少し薄く）
            if (a.kind === "served") g.alpha = Math.min(g.alpha, 0.75);

            // バブル生成
            if (!a.emoteG) {
              const e = makeEmoteIcon();
              e.alpha = 0.95;
              // itemLayer に載せる（袋/商品と同じく上物）
              itemLayer.addChild(e);
              a.emoteG = e;
            }
            // 位置追従（頭上）
            a.emoteG.x = g.x;
            a.emoteG.y = g.y - 34 + Math.sin(tAccum * 10.0 + idx) * 1.2;

            // 終了時に片付け
            if ((a.lookAroundLeft ?? 0) <= 0.001) {
              if (a.emoteG) { a.emoteG.destroy(); a.emoteG = undefined; }
              if (a.kind === "served") g.rotation = 0;
            }
          } else {
            // 通常時：回転を戻す（servedのみ）
            if (a.kind === "served") g.rotation = 0;
            if (a.emoteG) { a.emoteG.destroy(); a.emoteG = undefined; }
          }

          // ★迷い客：キョロキョロ（薄色中だけ）
          if ((a.switchTintLeft ?? 0) > 0) {
            // 小さく左右に首振り＋微妙に揺れる
            const idx = (a.queueIndex ?? 0) + (a.targetCounter === "counter_2" ? 17 : 0);
            const wob = Math.sin(tAccum * 10.0 + idx) * 0.10;
            const nod = Math.sin(tAccum * 6.5 + idx) * 0.05;

            g.rotation = wob;
            g.x += Math.sin(tAccum * 12.0 + idx) * 0.8;
            g.y += nod * 0.8;
          } else {
            // 通常は回転を戻す（lostは別演出なので触らない）
            if (a.kind === "served") g.rotation = 0;
          }

          if ((g as any).destroyed) continue;

          // ★所持アイコン：follow / suck
          if (a.itemG) {
            if ((a.itemMode ?? "follow") === "follow") {
              a.itemG.x = g.x;
              a.itemG.y = g.y - 18;
              a.itemG.alpha = 1;
              a.itemG.scale.set(1);
            } else {
              const cid = a.targetCounter ?? "counter_1";
              const cp = counterPosFor(cid);
              const ix = a.itemG.x;
              const iy = a.itemG.y;

              a.itemSuckT = Math.min(1, (a.itemSuckT ?? 0) + dt * 3.0);
              const tt = a.itemSuckT;
              const ease = 1 - Math.pow(1 - tt, 3);

              a.itemG.x = ix + (cp.x - ix) * ease;
              a.itemG.y = iy + (cp.y - 6 - iy) * ease;

              const sc = 1 - 0.75 * ease;
              a.itemG.scale.set(sc);
              a.itemG.alpha = 1 - ease;

              if (tt >= 1) {
                a.itemG.destroy();
                a.itemG = undefined;
                a.hasItem = false;
              }
            }
          }

          // ★袋アイコン追従（会計後〜退出まで）：ぷるぷる揺れる
          if (a.bagG) {
            const idx = (a.queueIndex ?? 0) + (a.targetCounter === "counter_2" ? 17 : 0);

            const swayX = Math.sin(tAccum * 6.0 + idx) * 1.4;
            const bobY = Math.sin(tAccum * 9.5 + idx) * 1.8;

            a.bagG.x = g.x + swayX;
            a.bagG.y = g.y - 20 + bobY;

            a.bagG.rotation = Math.sin(tAccum * 8.0 + idx) * 0.14;

            const baseSc = (a.bagG as any).__baseScale ?? 1;
            const pulse = 1 + Math.sin(tAccum * 7.5 + idx) * 0.02;
            a.bagG.scale.set(baseSc * pulse);

            if (a.phase === "toExit") {
              a.bagG.alpha = Math.max(0, a.bagG.alpha - dt * 0.25);
            }
          }

          if (a.kind === "lost") {
            const midX = (queueBase1.x + queueBase2.x) / 2;
            const midY = Math.min(queueBase1.y, queueBase2.y) + 10;

            if (a.phase === "toQueueFront") {
              const ok = moveToward(g, midX, midY, dtMove, 1.05);
              if (ok) a.phase = "uTurn";
            } else if (a.phase === "uTurn") {
              const ok = moveToward(g, centerOf(entrance).x, centerOf(entrance).y, dtMove, 1.05);
              a.g.alpha = Math.max(0, a.g.alpha - dt * 0.8);
              if (ok || a.g.alpha <= 0.05) {
                a.phase = "done";
                destroyActor(a);
              }
            }
            continue;
          }

          const shelf = rectById.get(a.targetShelfId ?? "shelf_a") ?? entrance;

          // 1) 棚へ
          if (a.phase === "toShelf") {
            const ok = moveToward(g, centerOf(shelf).x, centerOf(shelf).y, dtMove, 1);
            if (ok) {
              const sid = a.targetShelfId ?? "shelf_a";
              const qty = localShelfStock.get(sid) ?? 0;

              if (qty > 0) {
                localShelfStock.set(sid, qty - 1);
                attachItemIcon(a);
                spawnPop(centerOf(shelf).x + (Math.random() - 0.5) * 20, centerOf(shelf).y - 10);

                a.targetCounter = chooseCounter(g.x, g.y);
                a.phase = "toQueue";
              } else {
                // ★Sprite/Graphics compatible: mark orange for oosPause
                if (typeof (g as any).clear === "function") {
                  (g as any).clear();
                  (g as any).circle(0, 0, 10).fill(0xf97316);
                } else if ((g as any).tint !== undefined) {
                  (g as any).tint = 0xf97316;
                }
                a.g.alpha = 0.9;
                a.phase = "oosPause";
                // ★欠品でもキョロキョロ（その場で迷う）
                a.lookAroundLeft = Math.max(a.lookAroundLeft ?? 0, 0.85);
                a.switchTintLeft = Math.max(a.switchTintLeft ?? 0, 1.10);

                a.oosLeft = 0.35;
              }
            }
            continue;
          }

          // 欠品一瞬停止
          if (a.phase === "oosPause") {
            a.oosLeft = Math.max(0, (a.oosLeft ?? 0) - dt);
            if ((a.oosLeft ?? 0) <= 0.001) a.phase = "oosReturn";
            continue;
          }

          // 欠品離脱
          if (a.phase === "oosReturn") {
            const ok = moveToward(g, centerOf(entrance).x, centerOf(entrance).y, dtMove, 1.1);
            a.g.alpha = Math.max(0, a.g.alpha - dt * 0.35);
            if (ok || a.g.alpha <= 0.05) destroyActor(a);
            continue;
          }

          // 2) レジ列（FIFO：到着順）
          const cid: CounterId = a.targetCounter ?? "counter_1";
          const base = queueBaseFor(cid);
          const spacing = (cid === "counter_1" ? qSpacing1 : qSpacing2);

          // まだ到着してない人は「末尾付近」を目指す（同じ座標に固まるのを避けるため spawn順で散らす）
          const tailIndex = qRef(cid).length + Math.min(4, (a.queueIndex ?? 0) % 3);

          // 到着済み(waitQueue)は queue配列の index が rank
          const rank = (a.phase === "waitQueue") ? queueRank(a, cid) : tailIndex;

          const qx = base.x;
          const qy = base.y + rank * spacing;

          const counterPos = counterPosFor(cid); // = checkoutSpotFor(cid)
          const exitPos = centerOf(exit);

          if (a.phase === "toQueue") {
            const ok = moveToward(g, qx, qy, dtMove, 1);
            if (ok) {
              a.phase = "waitQueue";
              if (!a.queued) {
                qRef(cid).push(a); // ★到着順で確定
                a.queued = true;
              }
              const sp = serviceSpeedFor(cid);
              a.waitLeft = 0.25 / sp; // 先頭判定は rank==0 で行う
            }
          } else if (a.phase === "waitQueue") {
            // ★waitQueue：必ずキューに入れる（重なり防止）
            ensureQueued(cid, a, "tail");
            a.queued = true;
            a.queueIndex = qRef(cid).indexOf(a);

            // 列が詰まったら自動で詰める（rankが変わる）
            const rr = queueRank(a, cid);

            // ★迷い客：一定確率でレジ移動（より早いなら）
            a.switchCooldown = Math.max(0, (a.switchCooldown ?? 0) - dt);
            a.switchCount = a.switchCount ?? 0;

            // 先頭は移動しない / 移動は最大1回 / クールダウン中は移動しない
            if (rr >= 1 && a.switchCount < 1 && (a.switchCooldown ?? 0) <= 0.001) {
              const switchRatePerSec = 0.70; // 1秒あたり25%（dtでスケール）
              const roll = Math.random();
              if (roll < switchRatePerSec * dt) {
                const other: CounterId = cid === "counter_1" ? "counter_2" : "counter_1";
                const etaNow = estimateEtaFor(cid, g.x, g.y);
                const etaOther = estimateEtaFor(other, g.x, g.y);

                // ETAが十分改善する場合のみ移動（意味のある“迷い”だけ）
                const improve = etaNow - etaOther;
                const minImprove = 0.45; // 0.45秒以上良くなるなら移動

                if (improve > minImprove) {
                  // 現在のキューから抜ける
                  const q = qRef(cid);
                  if (q[0] === a) q.shift(); else qRemove(cid, a);

                  // 別レジへ向かい直し
                  a.targetCounter = other;
                  a.phase = "toQueue";
                  a.queued = false;
                  a.waitLeft = 0;

                  a.switchCount = (a.switchCount ?? 0) + 1;
                  a.switchCooldown = 1.8; // しばらく迷わない
                  a.switchTintLeft = 2.2; // ★迷ってる感を少し残す
                  a.lookAroundLeft = 0.65; // ★キョロキョロ中は一瞬停止
                }
              }
            }

            const tgtY = base.y + rr * spacing;
            moveToward(g, qx, tgtY, dtMove, 0.75);

            a.waitLeft = Math.max(0, (a.waitLeft ?? 0) - dt);

            // ★先頭だけがレジへ
            if ((a.waitLeft ?? 0) <= 0.001 && rr === 0) {
              // ★無人レジなら進めない：有人レジへ誘導
              if (!hasStaffFor(cid)) {
                const other: CounterId = cid === "counter_1" ? "counter_2" : "counter_1";
                a.targetCounter = hasStaffFor(other) ? other : "counter_1";
                a.phase = "toQueue";
                a.queued = false;
                a.waitLeft = 0;
                a.lookAroundLeft = Math.max(a.lookAroundLeft ?? 0, 0.85);
                a.switchTintLeft = Math.max(a.switchTintLeft ?? 0, 1.10);
              } else {
                // キュー先頭から除去（安全に）
                const q = qRef(cid);
                if (q[0] === a) q.shift(); else qRemove(cid, a);
                a.phase = "toCounter";
              }
            }
          } else if (a.phase === "toCounter") {
            // ★レジが埋まってたらレジ前へ進ませない（前の人の精算が終わるまで待つ）
            if (counterBusyFor(a.targetCounter as CounterId)) {
              // 列の先頭へ戻して待機
              a.phase = "waitQueue";
              // ★レジ前に来ていたので、列の先頭（次）として扱う
              ensureQueued(cid, a, "head");
              a.queued = true;
              a.waitLeft = Math.max(a.waitLeft ?? 0, 0.12);
              break;
            }

            // ★会計位置へ（レジ台の外側 / checkoutSpot）
            const ok = moveToward(g, counterPos.x, counterPos.y, dtMove, 1.05);
            if (ok) {
              // ★無人レジならcheckout開始しない：有人レジへ誘導
              if (!hasStaffFor(cid)) {
                const other: CounterId = cid === "counter_1" ? "counter_2" : "counter_1";
                a.targetCounter = hasStaffFor(other) ? other : "counter_1";
                a.phase = "toQueue";
                a.queued = false;
                a.waitLeft = 0;
                a.lookAroundLeft = Math.max(a.lookAroundLeft ?? 0, 0.85);
                a.switchTintLeft = Math.max(a.switchTintLeft ?? 0, 1.10);
                break;
              }
              a.phase = "checkout";

              // ★会計開始：商品アイコンをレジへ吸い込み
              if (a.itemG) {
                a.itemMode = "suck";
                a.itemSuckT = 0;
              }

              const sp = serviceSpeedFor(cid);
              a.checkoutLeft = Math.max(0.55, 0.95 / Math.max(0.35, sp));

              playCheckoutSfx(sfxRef, cid === "counter_1" ? "L" : "R");
            }
          } else if (a.phase === "checkout") {
            // ★checkout中も会計位置に固定（レジ内部に入らない）
            g.x = counterPos.x;
            g.y = counterPos.y;
              a.checkoutLeft = Math.max(0, (a.checkoutLeft ?? 0) - dt);
              if ((a.checkoutLeft ?? 0) <= 0.001) {
                // ---- PR-2: Sales add on checkout complete ----
                totalSales += pricePerCheckout;
                customersServed += 1;
                updateHud();

                playCheckoutDoneSfx(sfxRef, cid === "counter_1" ? "L" : "R");
                attachBagIcon(a);
                a.phase = "toExit";
              }
            } else if (a.phase === "toExit") {
            const ok = moveToward(g, exitPos.x, exitPos.y, dtMove, 1.05);
            if (ok) destroyActor(a);
          }
        
          // ★列の重なり防止（waitQueue 全員に適用）
          // 前の人との最小間隔を強制し、押し合い・重なりを消す（移動実装に依存しない）
          if (a.kind === "served" && a.phase === "waitQueue") {
            const qc = (a.targetCounter as any) as CounterId;

            // ★会計中は列を完全に固定（位置補正もしない）
            const _busy = (typeof counterBusyFor === "function") ? counterBusyFor(qc) : false;
            if (_busy) {
              // no-op
            } else {
              const q = qRef(qc);
              const i = q.indexOf(a);
              if (i > 0) {
                const prev = q[i - 1];
                if (prev?.g) {
                  const minGap = 24; // 好みで 22〜28
                  const targetY = prev.g.y + minGap;

                  // ★「波」：前の人が動いた後、順位(i)に応じて遅れて詰め始める
                  const _dt = (typeof dt === "number") ? dt : 0.016;
                  const waveDelay = i * 0.05; // 1人あたり50ms遅延（好みで0.03〜0.08）

                  const anyA = (a as any);
                  if (targetY - a.g.y > 0.5) {
                    if (typeof anyA.queueDelayLeft !== "number") anyA.queueDelayLeft = waveDelay;
                    if (anyA.queueDelayLeft > 0) {
                      anyA.queueDelayLeft = Math.max(0, anyA.queueDelayLeft - _dt);
                    }
                    if (anyA.queueDelayLeft > 0) {
                      // まだ波の待ち時間中：位置固定
                      // no-op
                    } else {
                      // ★ゆっくり近づける（イージング）
                      const k = 1 - Math.exp(-_dt * 10); // 10は詰める速さ。小さいほどゆっくり
                      if (a.g.y < targetY) a.g.y = a.g.y + (targetY - a.g.y) * k;
                    }
                  } else {
                    // ほぼ到達しているなら遅延をリセット
                    anyA.queueDelayLeft = 0;
                  }

                  // Xは列の芯に揃える（左右の重なり見え防止）
                  a.g.x = prev.g.x;
                }
              } else {
                // 先頭は遅延不要
                (a as any).queueDelayLeft = 0;
              }
            }
          }


          // ★POLISH: update thought bubble
          // - wait too long -> 💢
          // - lookaround (OOS) -> ❓
          // - checkout -> 🛍️
          if (a.kind === "served") {
            const anyA = a as any;
            const _dt = (typeof dt === "number") ? dt : 0.016;

            // 待ち時間カウンタ（waitQueue中だけ加算。busyで停止してても「イライラ」は溜まる想定）
            if (a.phase === "waitQueue") {
              anyA._waitSec = (anyA._waitSec ?? 0) + _dt;
            } else {
              anyA._waitSec = 0;
            }

            const layer = (typeof actorLayer !== "undefined") ? (actorLayer as any) : null;

            if (layer) {
              // 位置は常に客の上
              const t = ensureThoughtBubble(anyA, layer);
              // ★destroy直後などで g が壊れていても落ちないように完全ガード
              try {
                const gg: any = (a as any).g;
                const x = gg?.x;
                const y = gg?.y;
                if (typeof x === "number" && typeof y === "number") {
                  t.x = x;
                  t.y = y - 18;
                } else {
                  t.alpha = 0;
                }
              } catch (e) {
                t.alpha = 0;
              }// 優先度：欠品(❓) > 会計中(🛍️) > 待ちすぎ(💢)
              const isLook = (anyA.lookAroundLeft ?? 0) > 0;
              const isCheckout = a.phase === "checkout";
              const isAngry = (a.phase === "waitQueue" && (anyA._waitSec ?? 0) >= 4.0);

              if (isLook) setThought(anyA, layer, "❓", 0.95);
              else if (isCheckout) setThought(anyA, layer, "🛍️", 0.90);
              else if (isAngry) setThought(anyA, layer, "💢", 0.92);
              else setThought(anyA, layer, null);
            }
          }

          // ★POLISH: checkout beep (subtle)
          if (a.kind === "served" && a.phase === "checkout") {
            const anyA = a as any;
            const _dt = (typeof dt === "number") ? dt : 0.016;
            anyA._beepT = (anyA._beepT ?? 0) - _dt;
            if (anyA._beepT <= 0) {
              // 既存の playSE があるなら使う（なければ何もしない）
              try { (playSE as any)?.("scan"); } catch(e) {}
              anyA._beepT = 0.9 + Math.random() * 0.6;
            }
          }
}
      });

    })();

    return () => {
      cancelled = true;
      if (appRef.current) {
        appRef.current.destroy(true);
        appRef.current = null;
      }
      if (hostRef.current) hostRef.current.innerHTML = "";
    };
  }, [
    layout,
    selectedId,
    day,
    timeSlot,
    rngSeed,
    staffByTime,
    shelfStock,
    lastReport,
    served,
    lost,
    displaySlot,
    tickSeq,
    staff1,
    staff2,
    serviceSpeed1,
    serviceSpeed2,
  ]);

  return (
    <div style={{ maxWidth: 1024, margin: "0 auto", padding: 16 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>店内GUI（レジFIFO）</h2>

        <button onClick={onGuiNext} style={{ padding: "10px 14px" }}>
          次の時間帯へ（GUI）
        </button>

        <div style={{ marginLeft: "auto", fontSize: 13 }}>
          Day <b>{day}</b> / 現在 {TIME_SLOT_LABEL[timeSlot]} / 表示 {TIME_SLOT_LABEL[displaySlot]} /
          対応 <b>{served}</b> / 離脱 <b>{lost}</b> / スタッフ L<b>{staff1}</b>・R<b>{staff2}</b> / スキル L<b>{staffSkill1.toFixed(2)}</b>・R<b>{staffSkill2.toFixed(2)}</b>
        </div>
      </div>

      <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
        レジ列は「到着順（FIFO）」で並びます。商品アイコン→吸い込み→会計完了SE→袋（ゆらゆら）まで実装済み。
      </div>

      <div
        ref={hostRef}
        style={{
          marginTop: 12,
          width: "100%",
          height: "70vh",
          minHeight: 420,
          borderRadius: 16,
          border: "1px solid #ddd",
          overflow: "hidden",
          touchAction: "none",
        }}
      />
    </div>
  );
}
