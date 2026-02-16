# ゲームコア仕様

## GameState

ゲームの全状態を保持する中心的なデータ構造。

```typescript
type GameState = {
  version: number;       // データバージョン (現在: 5)
  rngSeed: number;       // 乱数シード (再現性確保)
  day: number;           // 現在の日数 (1始まり)
  timeSlot: TimeSlot;    // 現在の時間帯
  cash: number;          // 所持金 (円)
  shopName: string;      // 店名
  catalog: Product[];    // 商品カタログ
  inventory: Inventory;  // 在庫 (商品ID → ロット配列)
  pendingOrders: PendingOrder[]; // 未到着の発注
  shelf: Shelf;          // 棚割り (12スロット)
  staffing: Staffing;    // 時間帯別スタッフ人数
  lastReport: DayReport | null; // 直前の日次レポート
};
```

### 初期値

| 項目 | 初期値 |
|------|--------|
| 所持金 | ¥300,000 |
| 日数 | 1 |
| 時間帯 | morning |
| 店名 | "aiops-kaneko mart" |
| 在庫 | 空 |
| 棚 | 全スロット空 |
| スタッフ | 朝1 / 昼2 / 夕2 / 夜1 |

## 時間帯

1日は4つの時間帯で構成される。

| キー | ラベル |
|------|--------|
| `morning` | 朝 |
| `noon` | 昼 |
| `evening` | 夕 |
| `night` | 夜 |

時間帯は `morning → noon → evening → night` の順に進行し、`night` の次は翌日の `morning` に移る。

## 商品カタログ

全10商品。各商品は以下の属性を持つ。

```typescript
type Product = {
  id: string;
  name: string;
  price: number;           // 売価 (円)
  cost: number;            // 原価 (円)
  shelfLifeDays: number;   // 賞味期限 (日)
  baseDemand: number;      // 1日あたりベース需要
  demandByTime: Record<TimeSlot, number>; // 時間帯別需要係数
};
```

### 商品一覧

| ID | 商品名 | 売価 | 原価 | 粗利 | 期限 | ベース需要 |
|----|--------|------|------|------|------|-----------|
| `onigiri_salmon` | おにぎり（鮭） | ¥160 | ¥95 | ¥65 | 2日 | 18 |
| `onigiri_tuna` | おにぎり（ツナマヨ） | ¥150 | ¥90 | ¥60 | 2日 | 20 |
| `bento_karaage` | 弁当（唐揚げ） | ¥550 | ¥330 | ¥220 | 1日 | 10 |
| `bento_saba` | 弁当（鯖） | ¥520 | ¥310 | ¥210 | 1日 | 8 |
| `drink_tea` | 緑茶 500ml | ¥140 | ¥70 | ¥70 | 10日 | 22 |
| `drink_coffee` | コーヒー 500ml | ¥160 | ¥80 | ¥80 | 10日 | 16 |
| `snack_chips` | ポテチ | ¥180 | ¥95 | ¥85 | 30日 | 12 |
| `snack_choco` | チョコ | ¥150 | ¥80 | ¥70 | 30日 | 10 |
| `magazine_weekly` | 週刊誌 | ¥430 | ¥250 | ¥180 | 7日 | 6 |
| `magazine_manga` | 漫画雑誌 | ¥520 | ¥300 | ¥220 | 7日 | 5 |

### 時間帯別需要係数

| 商品 | 朝 | 昼 | 夕 | 夜 |
|------|-----|-----|-----|-----|
| おにぎり（鮭） | 1.3 | 1.0 | 0.7 | 0.5 |
| おにぎり（ツナマヨ） | 1.2 | 1.0 | 0.7 | 0.6 |
| 弁当（唐揚げ） | 0.3 | 1.7 | 1.1 | 0.4 |
| 弁当（鯖） | 0.25 | 1.6 | 1.05 | 0.35 |
| 緑茶 | 1.1 | 1.0 | 0.9 | 0.8 |
| コーヒー | 1.2 | 0.9 | 0.9 | 0.85 |
| ポテチ | 0.7 | 0.9 | 1.1 | 1.2 |
| チョコ | 0.8 | 0.9 | 1.1 | 1.2 |
| 週刊誌 | 1.3 | 0.9 | 0.7 | 0.4 |
| 漫画雑誌 | 1.2 | 0.9 | 0.7 | 0.4 |

## 在庫管理

### データ構造

```typescript
type InventoryLot = {
  qty: number;        // 数量
  expiresDay: number; // 期限日
};
type Inventory = Record<string, InventoryLot[]>;
```

在庫は商品IDごとにロット（数量＋期限日）の配列で管理する。ロットは期限日昇順でソートされる。

### 操作

| 関数 | 説明 |
|------|------|
| `addLot(inv, productId, qty, expiresDay)` | ロットを追加。期限日順にソート |
| `sellFIFO(inv, productId, demandQty)` | FIFO（先入先出）で販売。売れた数量を返す |
| `discardExpired(inv, day)` | `expiresDay < day` のロットを廃棄。廃棄数を返す |
| `totalQty(inv, productId)` | 商品の在庫合計数量を返す |

### FIFO 販売ロジック

1. ロット配列を先頭（最も古い）から走査
2. 各ロットから `min(ロット数量, 残り需要)` を販売
3. 数量が 0 になったロットは配列から除去
4. 実際に売れた合計数量を返す

### 廃棄ロジック

- 毎朝（`morning`）の冒頭で実行
- `expiresDay < 現在の day` のロットを全て廃棄
- 廃棄された数量は日次レポートの `wastedUnits` に計上

## 需要シミュレーション

### 需要計算式 (simulateTick)

```
demand = baseDemand × dayMultiplier × demandByTime[slot] × jitter × shelfMultiplier
```

| 要素 | 説明 |
|------|------|
| `baseDemand` | 商品ごとの1日あたり基本需要 |
| `dayMultiplier` | 曜日補正。土曜: ×1.10、日曜: ×1.15、平日: ×1.0 |
| `demandByTime[slot]` | 時間帯別の需要係数 |
| `jitter` | ランダムな揺らぎ `0.8 + rand() × 0.4`（±20%） |
| `shelfMultiplier` | 棚に陳列: ×1.15、未陳列: ×0.85 |

### 曜日の算出

`day = 1` を月曜として `(day - 1) % 7` で曜日を算出。5=土曜、6=日曜。

### スタッフとキャパシティ

- 1スタッフあたりのキャパシティ: **18人/時間帯** (`CAPACITY_PER_STAFF`)
- スタッフ人数 × 18 = その時間帯にさばける最大客数
- 来店客がキャパシティを超えると超過分が「離脱」（機会損失）

### 来店客数の推定

1. 全商品の需要（上記の式）を合算
2. 客単位に変換: `traffic = round(合計需要 / 1.4)` （1客あたり約1.4点の想定）
3. `served = min(traffic, capacity)`
4. `lost = traffic - served`
5. `servedRatio = served / traffic`
6. 各商品の最終需要に `servedRatio` を掛けて減衰

### シミュレーションの流れ (simulateTick)

1. **朝のみ**: 期限切れ廃棄 → 発注到着（原価支払い）
2. 来店客数の推定 → スタッフキャパシティで制限
3. 各商品の需要計算 → FIFO 販売
4. 売上を所持金に加算、レポート更新
5. 次の時間帯に進む（`night` の場合は翌日 `morning` へ）

## ユーザー操作 (Actions)

| 関数 | 説明 | 制約 |
|------|------|------|
| `renameShop(state, name)` | 店名変更 | 最大40文字 |
| `assignShelf(state, slot, productId)` | 棚スロットに商品を配置 | S1〜S12 の12スロット |
| `placeOrder(state, items)` | 商品を発注 | 翌日 (`day + 1`) に到着 |
| `setStaffing(state, slot, staff)` | 時間帯のスタッフ数設定 | 0〜6人 |

### 棚スロット

12個の棚スロット（`S1`〜`S12`）が存在する。各スロットには1種類の商品を配置可能（または `null` で空）。
棚に商品を配置すると需要が +15% される。

### 発注

- 発注した商品は翌日（`day + 1`）の朝に到着
- 到着時に原価が所持金から差し引かれる
- 賞味期限は `到着日 + shelfLifeDays` に設定される

## 日次レポート (DayReport)

```typescript
type DayReport = {
  day: number;
  byTime: Record<TimeSlot, number>;    // 時間帯別売上
  revenue: number;                      // 売上合計
  cost: number;                         // 原価合計（入荷分）
  grossProfit: number;                  // 粗利 (売上 - 原価)
  soldUnits: Record<string, number>;    // 商品別販売数
  stockouts: Record<string, number>;    // 商品別欠品数
  wastedUnits: Record<string, number>;  // 商品別廃棄数
  trafficByTime: Record<TimeSlot, number>;  // 時間帯別来店数
  servedByTime: Record<TimeSlot, number>;   // 時間帯別対応数
  lostByTime: Record<TimeSlot, number>;     // 時間帯別離脱数
};
```

レポートは1日の各時間帯で累積的に更新され、`night` の処理後に翌日へ移行するとリセット（`null`）される。

## 乱数生成

32ビット xorshift アルゴリズムを使用。

```typescript
function nextSeed(seed: number): number {
  let x = seed | 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return x | 0;
}
```

- シードを保持することで、同一シードから同一の結果を再現可能
- `rand01(seed)` は 0〜1 の浮動小数点数と更新後のシードを返す

## Zustand ストア (gameStore)

| アクション | 説明 |
|-----------|------|
| `newGame()` | 新しいゲームを開始（シードは `Date.now()` から生成） |
| `nextTime()` | `simulateTick` を実行して次の時間帯へ進む |
| `setShopName(name)` | 店名を変更 |
| `assignShelf(slotId, productId)` | 棚に商品を配置 |
| `placeOrder(items)` | 商品を発注 |
| `setStaff(timeSlot, staff)` | スタッフ人数を設定 |
| `setState(s)` | 状態を直接セット（セーブデータのロード用） |
