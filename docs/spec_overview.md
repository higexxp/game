# コンビニ経営ゲーム — システム仕様書

## プロジェクト概要

コンビニ（コンビニエンスストア）の経営をシミュレーションするブラウザゲーム。
プレイヤーは店長として、商品の発注・棚割り・スタッフ配置を行い、売上と利益の最大化を目指す。

## 技術スタック

| カテゴリ | 技術 | バージョン |
|----------|------|-----------|
| フレームワーク | Next.js (App Router) | 16.0.10 |
| UI ライブラリ | React | 19.2.1 |
| 言語 | TypeScript | 5.x |
| 状態管理 | Zustand | 5.0.9 |
| 2D 描画 | Pixi.js | 8.14.3 |
| ストレージ | IndexedDB | — |

## ディレクトリ構成

```
src/
├── app/                    # Next.js ページ
│   ├── page.tsx            # トップページ
│   ├── game/page.tsx       # テキストベース経営画面
│   ├── gui/page.tsx        # ビジュアル店舗画面
│   ├── save/page.tsx       # セーブ・ロード画面
│   └── layout.tsx          # ルートレイアウト
│
├── components/             # React コンポーネント
│   ├── GameView.tsx        # 経営画面メイン
│   ├── StoreGuiView.tsx    # ビジュアル店舗 (Pixi.js)
│   └── SaveManager.tsx     # セーブ管理 UI
│
├── game/                   # ゲームロジック
│   ├── core/               # シミュレーション・型定義
│   │   ├── types.ts        # GameState 等の型定義
│   │   ├── catalog.ts      # 商品カタログ (10商品)
│   │   ├── newGame.ts      # 初期状態生成
│   │   ├── actions.ts      # ユーザー操作
│   │   ├── inventory.ts    # 在庫管理 (FIFO)
│   │   ├── simulateDay.ts  # 1日一括シミュレーション
│   │   ├── simulateTick.ts # 時間帯別シミュレーション
│   │   ├── time.ts         # 時間帯定義
│   │   └── rng.ts          # 乱数生成 (xorshift32)
│   ├── save/               # 永続化
│   │   ├── types.ts        # セーブデータ型
│   │   ├── indexedDbSaveRepository.ts
│   │   └── idb.ts          # IndexedDB ラッパー
│   └── store/
│       └── gameStore.ts    # Zustand ストア
│
├── gui/                    # ビジュアル店舗専用ロジック
│   ├── core/
│   │   ├── guiSim.ts       # GUI 向けシミュレーション
│   │   └── time.ts         # 時間ユーティリティ
│   └── store/
│       └── guiStore.ts     # GUI 用 Zustand ストア
│
└── public/sprites/         # スプライト画像
    ├── person_idle.png
    ├── person_lost.png
    ├── person_orange.png
    └── clerk_idle.png
```

## 画面一覧

| パス | 画面名 | 概要 |
|------|--------|------|
| `/` | トップ | デフォルトランディングページ |
| `/game` | 経営画面 | テキストベースで発注・棚割り・シミュレーションを操作 |
| `/gui` | ビジュアル店舗 | Pixi.js で客の動きをリアルタイム描画 |
| `/save` | セーブ管理 | 3スロットのセーブ・ロード・JSON インポート/エクスポート |

## 関連ドキュメント

- [ゲームコア仕様](./spec_game_core.md) — 状態・シミュレーション・在庫・需要の詳細
- [GUI 仕様](./spec_gui.md) — ビジュアル店舗の描画・アクター・アニメーション
- [セーブシステム仕様](./spec_save.md) — 永続化・スロット・インポート/エクスポート
