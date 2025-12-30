# コンビニ経営ゲーム GUI 開発サマリー（引き継ぎ用）

## プロジェクト概要
- Next.js (App Router) + Pixi.js による **コンビニ経営ゲーム GUI**
- 画面エントリポイント: `/gui`
- メイン実装ファイル: `game/src/components/StoreGuiView.tsx`

## 現在の到達点（重要）
### 描画方式
- **PIXI.Graphics は廃止**
- 客・店員は **PIXI.Sprite** で描画
- スプライト画像は `/public/sprites` 配下
  - `person_idle.png`
  - `person_lost.png`
  - `person_orange.png`
  - `clerk_idle.png`

### スプライト基準
- `anchor(0.5, 1.0)`（足元基準）
- 人物配置は以下のヘルパーで統一

```ts
const placePerson = (sp: PIXI.Sprite, footX: number, footY: number) => {
  sp.x = footX;
  sp.y = footY + sp.height;
};
```

### 画像ロード
- ピンク fallback（Graphics 代替表示）は **完全廃止**
- `PIXI.Texture.from()` による遅延ロードを利用
- 初期表示時、ロード完了後に自動的に Sprite が表示される

### レイヤー
- `world.sortableChildren = true`
- zIndex による前後関係整理済み
  - floorLayer: 背面
  - actorLayer: 客
  - staffLayer: 店員
  - itemLayer / uiLayer: 前面

### 店員表示の注意点
- preload 完了前に描画すると空テクスチャになるため、
  **初期スタッフ描画は preload 完了後に実行**
- 時間帯変更時は再描画されるため問題なし

## 行動・状態管理（簡易）
### 客 (Actor)
- phase: `toShelf` / `toQueue` / `waitQueue` / `toCounter` / `checkout` / `oosPause` / `exit`
- 欠品時は tint（オレンジ）で表現

### 店員
- busy / idle 状態あり
- 会計処理速度は staff 数・skill から算出

## 現在の課題（次スレッドで継続）
### 1. レジ列の位置
- 列が **レジ内部・店員背後に侵入しない**ようにする必要あり
- 対策方針:
  - `checkoutSpot`: レジ台の外側（会計位置）
  - `queueBase`: checkoutSpot から後方にオフセット
  - `toCounter` の目的地は checkoutSpot を使用

### 2. 将来課題（未着手）
- 歩行アニメーション
- 複数商品購入
- スタッフ能力の視覚表現
- 売上金額のフローティング表示

## 開発運用方針
- GitHub 管理前提
- 推奨ブランチ:
  - `main`: 安定
  - `gui-experiment`: 試行錯誤
- Codex: 実装担当（PR単位）
- ChatGPT: 設計・レビュー・壁打ち

---

※ このドキュメントは「新しいスレッド・Codex・GitHub」いずれからでも
状況を即座に再現できることを目的とした引き継ぎ資料です。

