# セーブシステム仕様

## 概要

ゲームの状態をブラウザの IndexedDB に永続化するシステム。
3つのセーブスロットと JSON インポート/エクスポート機能を備える。

画面: `/save`
メイン実装: `src/components/SaveManager.tsx`, `src/game/save/`

## セーブスロット

| スロットID | 用途 |
|-----------|------|
| `A` | セーブスロット A |
| `B` | セーブスロット B |
| `C` | セーブスロット C |

最後に使用したスロットIDを別途記憶し、次回ロード時のデフォルト選択に使用する。

## データ構造

### SaveMeta

セーブデータのメタ情報。スロット一覧で概要を表示するために使用。

```typescript
type SaveMeta = {
  slotId: SaveSlotId;   // "A" | "B" | "C"
  label: string;        // 表示ラベル
  updatedAt: number;    // 更新日時 (epoch ms)
  day: number;          // ゲーム内日数
  cash: number;         // 所持金
  shopName: string;     // 店名
  version: number;      // データバージョン
  summary?: string;     // 任意のサマリ文
};
```

### SaveData

```typescript
type SaveData = {
  meta: SaveMeta;
  state: GameState;     // ゲーム全状態
};
```

## SaveRepository インターフェース

```typescript
interface SaveRepository {
  listMetas(): Promise<SaveMeta[]>;
  load(slotId: SaveSlotId): Promise<SaveData | null>;
  save(data: SaveData): Promise<void>;
  remove(slotId: SaveSlotId): Promise<void>;
  exportJson(slotId: SaveSlotId): Promise<string>;
  importJson(json: string, slotId: SaveSlotId): Promise<void>;
  getLastUsedSlot(): Promise<SaveSlotId | null>;
  setLastUsedSlot(slotId: SaveSlotId): Promise<void>;
}
```

### メソッド詳細

| メソッド | 説明 |
|---------|------|
| `listMetas()` | 全スロットのメタ情報を取得。`updatedAt` 降順でソート |
| `load(slotId)` | 指定スロットのデータを読み込み。空の場合は `null` |
| `save(data)` | データを保存（上書き） |
| `remove(slotId)` | 指定スロットのデータを削除 |
| `exportJson(slotId)` | 指定スロットのデータを JSON 文字列に変換 |
| `importJson(json, slotId)` | JSON 文字列をパースして指定スロットに保存 |
| `getLastUsedSlot()` | 最後に使用したスロットID を取得 |
| `setLastUsedSlot(slotId)` | 最後に使用したスロットID を記録 |

## IndexedDB 実装

`IndexedDbSaveRepository` クラスが `SaveRepository` を実装。

### ストア構成

| Object Store | 用途 |
|-------------|------|
| `saves` | セーブデータ本体（キー: `slotId`） |
| `kv` | Key-Value ストア（最終スロットID等） |

### JSON インポート時の処理

1. JSON をパース
2. `state` フィールドの存在を検証
3. メタ情報を再構築（ラベル・タイムスタンプ等）
4. 指定スロットに保存
5. 最終使用スロットを更新

### JSON エクスポート

- `SaveData`（meta + state）を `JSON.stringify` で文字列化
- ブラウザからファイルダウンロードとして提供
