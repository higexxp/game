# ビジュアル店舗 (GUI) 仕様

## 概要

`/gui` ルートで提供されるビジュアル店舗画面。Pixi.js を用いて、コンビニ店内の客・店員の動きをリアルタイムに2Dアニメーションで描画する。

メイン実装: `src/components/StoreGuiView.tsx`

## 描画方式

- **PIXI.Sprite** ベース（`PIXI.Graphics` は廃止済み）
- スプライト画像は `/public/sprites/` に配置
- `PIXI.Texture.from()` による遅延ロードを使用
- ピンク fallback（Graphics 代替表示）は廃止

### スプライト一覧

| ファイル | 用途 |
|----------|------|
| `person_idle.png` | 客（通常状態） |
| `person_lost.png` | 客（困惑状態） |
| `person_orange.png` | 客（欠品時） |
| `clerk_idle.png` | 店員 |

### スプライト基準

- アンカー: `anchor(0.5, 1.0)` — 足元基準
- 配置ヘルパー:

```typescript
const placePerson = (sp: PIXI.Sprite, footX: number, footY: number) => {
  sp.x = footX;
  sp.y = footY + sp.height;
};
```

## レイヤー構成

`world.sortableChildren = true` で zIndex による前後関係を管理。

| レイヤー | 内容 | zIndex |
|----------|------|--------|
| floorLayer | 背景・床 | 最背面 |
| actorLayer | 客 | 中間 |
| staffLayer | 店員 | 中間〜前面 |
| itemLayer | 商品アイコン | 前面 |
| uiLayer | UI 要素 | 最前面 |

## 客 (Actor) の行動フェーズ

客は以下のフェーズを順に遷移する。

```
toShelf → toQueue → waitQueue → toCounter → checkout → exit
                                    ↗
              oosPause (欠品時) ──→ exit
```

| フェーズ | 説明 |
|---------|------|
| `toShelf` | 入口から棚へ移動 |
| `toQueue` | 棚からレジ列へ移動 |
| `waitQueue` | レジ列で待機 |
| `toCounter` | レジ台へ移動（会計開始位置） |
| `checkout` | 会計処理中 |
| `oosPause` | 欠品検出、困惑アニメーション |
| `exit` | 退店 |

### 欠品時の挙動

- 在庫がない場合、客の tint がオレンジ色に変化
- `person_orange.png` スプライトに切り替え
- 周囲を見回すアニメーション後、退店

### 吹き出し表現

| アイコン | 意味 |
|---------|------|
| ❓ | 欠品・在庫切れ |
| 🛍️ | 買い物中 |
| 💢 | 待ち時間による不満 |

## レジシステム

- レジ台: **2台**（独立したキュー）
- 客は **ETA（予想待ち時間）** ベースで短い列を選択

### レジ列ロジック

1. 客が `toQueue` フェーズに入ると、2つのレジのETAを比較
2. ETA が短い方の列に並ぶ
3. 列の間隔はリアルな距離感を保持（押し出し防止）
4. 待ち時間が長いと別のレジに移る可能性あり（遅延付き）

### 会計処理

- 店員の busy/idle 状態で制御
- 処理速度はスタッフ数とスキルから算出
- 完了時:
  - 客がショッピングバッグを持つアニメーション（スケール）
  - チャイム音・レジ音の SE
  - 売上金額のフローティングテキスト表示

## GUI 専用シミュレーション (guiSim)

GUI モードでは独自のシミュレーションロジックを使用する。

### 需要計算

```typescript
demand = floor((baseDemand(timeSlot) + rand() × 6) × capMul)
```

| 時間帯 | baseDemand |
|--------|-----------|
| morning | 5 |
| noon | 10 |
| evening | 8 |
| night | 4 |

### スタッフ効果

```
capMul = 0.85 + staff^0.45 × 0.25
```

- 1人: 約 ×1.1
- 5人: 約 ×1.6

### 棚在庫

GUI モードでは棚ごとに在庫数を直接管理（SKU単位ではなくシンプルな棚ID）。

デフォルト棚:
- `shelf_a`, `shelf_b`, `shelf_c` — 棚
- `island_1`, `island_2` — アイランド什器

初期在庫: 各棚 8〜10 個

### 乱数

mulberry32 アルゴリズムを使用（コアゲームの xorshift32 とは別実装）。

## GUI Zustand ストア (guiStore)

| 状態 | 説明 |
|------|------|
| `day` | 現在の日数 |
| `timeSlot` | 現在の時間帯 |
| `rngSeed` | 乱数シード（初期値: 123456789） |
| `shelfStock` | 棚ごとの在庫数 |
| `staffByTime` | 時間帯別スタッフ数 |
| `lastReport` | 直前のレポート（接客数・離脱数） |

| アクション | 説明 |
|-----------|------|
| `advanceTime()` | 1時間帯分のシミュレーション実行＆時間を進める |
| `setStaff(slot, n)` | スタッフ数設定（0〜10） |
| `setShelfStock(shelfId, qty)` | 棚在庫を設定（0〜999） |
| `decShelfStock(shelfId, qty)` | 棚在庫を減少 |
| `restockAll(qtyEach)` | 全棚を一括補充（デバッグ用） |

## 店員表示の注意事項

- スプライトの preload 完了前に描画すると空テクスチャになる
- 初期スタッフ描画は preload 完了後に実行する必要がある
- 時間帯変更時は自動的に再描画されるため問題なし
