# 最終記録経過表示コンポーネント設計書

**コンポーネント名:** `LastRecordIndicator`
**配置:** HealthForm 上部（記録日時ピッカーの直上）
**優先度:** 高
**作成日:** 2026-03-21

---

## 1. 目的と制約

### 目的
ユーザーが最後に記録してから何日経ったかを示す小さなインジケーターで、記録の間隔を把握させ、「すぐに記録できた」「久しぶりの記録」という肯定的な実感を与える。

### 制約
- 既存の HealthForm スライダー・フラグ機能は変更しない
- 表示は控えめに。記録フローの邪魔をしない
- モバイルファースト（iPhone SE 程度の幅で読みやすい）
- 記録がない場合は表示しない

---

## 2. 表示パターン

### パターン① 本日既に記録済み
**表示条件:**
`latestDailyRecord.recorded_at` の日付が今日

**表示内容:**
```
🎯 今日 2回目の記録
```

**パターン変数:**
`N回目` = 同日の records 配列から同じ日付の record を数える

**スタイル:**
- 背景: 薄い成功色（緑系、例: `#e7f5f0`）
- テキスト: 通常サイズ（14-16px）
- 左寄せ、コンパクト

### パターン② 昨日から記録
**表示条件:**
`latestDailyRecord.recorded_at` の日付が昨日

**表示内容:**
```
👋 昨日ぶりの記録
```

**スタイル:**
- 背景: 薄い情報色（青系、例: `#e7f4f8`）
- テキスト: 通常サイズ（14-16px）
- 左寄せ、コンパクト

### パターン③ 2日以上経過
**表示条件:**
`latestDailyRecord.recorded_at` の日付が2日以上前

**表示内容:**
```
🎉 X日ぶりの記録です
```

**パターン変数:**
`X` = 今日の日付 - 前回記録の日付（日数）

**例:**
- 前回が3月18日、今日が3月21日 → `🎉 3日ぶりの記録です`

**スタイル:**
- 背景: やや強調する（薄いオレンジ系、例: `#fff3e0`）
- テキスト: やや大きめ（15-17px、semibold）
- 左寄せ

### パターン④ 記録がない場合
**表示条件:**
`latestDailyRecord` が undefined or null

**表示内容:**
何も表示しない

---

## 3. レイアウト仕様

### 基本構成
```
┌─────────────────────────────────────────┐
│ 🎯 今日 2回目の記録                      │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│ 🕐 記録日時 [datetime-local input]      │
└─────────────────────────────────────────┘
```

### 高さと余白
- **高さ:** 最小 36px（パディング含む）
- **横パディング:** 12-16px
- **縦パディング:** 8-10px
- **下マージン:** 12px（記録日時ピッカーまで）

### フォント
- **フォントファミリー:** システムフォント（既存 HealthForm に合わせる）
- **フォントサイズ:**
  - パターン①②: 14-15px（normal weight）
  - パターン③: 15-16px（semibold）
- **行の高さ:** 1.4

### モバイル対応
- **最小幅:** 320px（iPhone SE）でも折れない
- **単一行で表示** 結果を目指す（絵文字+テキスト）
- **タッチターゲット:** 最小 32px 高さ（アクセシビリティ）

---

## 4. 使用するデータ（Props）

### Props 構造
```typescript
interface LastRecordIndicatorProps {
  latestDailyRecord?: LatestRecord;
  records?: LatestRecord[];
}
```

### Props 詳細

#### `latestDailyRecord` (LatestRecord | undefined)
- **説明:** 最後の日次記録（get_latest Lambda の結果）
- **必須:** いいえ
- **データ型:** LatestRecord
- **使用フィールド:** `recorded_at` (ISO 8601 文字列)
- **例:** `"2026-03-20T14:30:00.000Z"`

#### `records` (LatestRecord[] | undefined)
- **説明:** 今日の記録一覧（パターン①で N回目を計算）
- **必須:** いいえ（パターン①で使う場合のみ）
- **データ型:** LatestRecord[]
- **フィルタ条件:** `recorded_at` が今日の日付のレコード
- **予期される数:** 1-3件（通常は1-2件）

### 計算ロジック

```typescript
/**
 * recorded_at (ISO 8601) から日数を計算
 * 例: "2026-03-20T14:30:00Z" → 3 (今日が2026-03-23の場合)
 */
function getDaysSince(recordedAt: string): number {
  const recordDate = new Date(recordedAt);
  const today = new Date();
  const diffTime = today.getTime() - recordDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

/**
 * recorded_at が今日かどうかを判定
 */
function isToday(recordedAt: string): boolean {
  const recordDate = new Date(recordedAt);
  const today = new Date();
  return (
    recordDate.getFullYear() === today.getFullYear() &&
    recordDate.getMonth() === today.getMonth() &&
    recordDate.getDate() === today.getDate()
  );
}

/**
 * recorded_at が昨日かどうかを判定
 */
function isYesterday(recordedAt: string): boolean {
  const recordDate = new Date(recordedAt);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return (
    recordDate.getFullYear() === yesterday.getFullYear() &&
    recordDate.getMonth() === yesterday.getMonth() &&
    recordDate.getDate() === yesterday.getDate()
  );
}

/**
 * 今日のレコード数を計算
 */
function countTodaysRecords(records: LatestRecord[]): number {
  return records.filter((r) => isToday(r.recorded_at)).length;
}
```

---

## 5. 表示パターンの判定フロー

```
latestDailyRecord 存在?
  ├─ いいえ
  │   └─ [表示なし]
  │
  └─ はい
      ├─ isToday(recorded_at)?
      │   ├─ はい
      │   │   └─ [パターン①] countTodaysRecords(records) を使用
      │   │
      │   └─ いいえ
      │       ├─ isYesterday(recorded_at)?
      │       │   ├─ はい
      │       │   │   └─ [パターン②]
      │       │   │
      │       │   └─ いいえ
      │       │       └─ [パターン③] getDaysSince(recorded_at) を使用
```

---

## 6. スタイル仕様

### 色定義

| パターン | 背景色 | テキスト色 | 備考 |
|---------|-------|----------|------|
| ① 今日 | `#e7f5f0` | `#0f5132` | Bootstrap success の薄版 |
| ② 昨日 | `#e7f4f8` | `#004085` | Bootstrap info の薄版 |
| ③ X日前 | `#fff3e0` | `#856404` | Bootstrap warning の薄版 |

### CSS class/style

```css
/* 基本コンテナ */
.last-record-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-radius: 4px;
  margin-bottom: 12px;
  font-size: 14px;
  line-height: 1.4;
  font-weight: 500;
}

/* パターン別 */
.last-record-indicator--today {
  background-color: #e7f5f0;
  color: #0f5132;
}

.last-record-indicator--yesterday {
  background-color: #e7f4f8;
  color: #004085;
}

.last-record-indicator--old {
  background-color: #fff3e0;
  color: #856404;
  font-weight: 600;
  font-size: 15px;
}
```

---

## 7. アクセシビリティ

### ARIA ラベル
```html
<div
  className="last-record-indicator last-record-indicator--today"
  role="status"
  aria-live="polite"
>
  🎯 今日 2回目の記録
</div>
```

- **role:** `status` （情報提示用）
- **aria-live:** `polite` （ページロード時に読み上げられるが、記録後の更新では割り込まない）

### 色以外の情報
- 絵文字で視覚的な識別 + テキストで意味を完全に伝える
- 色弱ユーザーでも意図が理解できる（例: 「今日」「昨日」の文言で判断可能）

---

## 8. 配置と統合

### HealthForm 内での配置
```tsx
export default function HealthForm({
  formItems,
  eventItems,
  statusItems,
  latestDailyRecord,
  records,  // 追加（パターン①で使用）
  onToast,
  onRecordsSubmitted
}: Props) {
  return (
    <div className="container py-3" style={{ maxWidth: '540px' }}>
      {/* ← ここに LastRecordIndicator を配置 */}
      <LastRecordIndicator
        latestDailyRecord={latestDailyRecord}
        records={records}
      />

      {/* 既存の記録日時ピッカー */}
      <div className="mb-3 p-3 rounded" style={{ ... }}>
        {/* ... */}
      </div>

      {/* 以下、既存コンポーネント */}
    </div>
  )
}
```

### App.tsx からの props 渡し
```tsx
// App.tsx
const [records, setRecords] = useState<LatestRecord[]>([]);

// get_latest Lambda の結果を records にセット
const handleLoadRecords = (newRecords: LatestRecord[]) => {
  setRecords(newRecords);
};

<HealthForm
  formItems={formItems}
  eventItems={eventItems}
  statusItems={statusItems}
  latestDailyRecord={latestDailyRecord}
  records={records}  // 追加
  onToast={handleToast}
  onRecordsSubmitted={handleRecordsSubmitted}
/>
```

---

## 9. 実装上の注意点

### タイムゾーン処理
- `recorded_at` は UTC (ISO 8601) で保存されているため、ブラウザのローカルタイムゾーンで日付を判定する際は `new Date(recordedAt)` でパース後、ローカル日付に変換
- 例（日本時間で AM 00:30 の記録を翌日と判定しないよう注意）

```typescript
const recordDate = new Date(recordedAt); // UTC をブラウザのTZで解釈
const today = new Date(); // ローカル日付を取得
```

### 日数計算の精度
- 24時間ごとに再計算（マウント時のみ）
- ユーザーが「記録する」ボタンを押した後、コンポーネントをリマウントして新しい記録を反映

### 複数レコード数の表示
- `records` 配列から今日の記録を filter して count
- 例: records = [`2026-03-21T08:00Z`, `2026-03-21T14:00Z`] → 2回目

---

## 10. デザインサンプル

### パターン① 今日 2回目
```
┌───────────────────────────────┐
│ 🎯 今日 2回目の記録            │
└───────────────────────────────┘
```
- 背景: `#e7f5f0` (薄緑)
- テキスト: `#0f5132` (濃緑)

### パターン② 昨日ぶり
```
┌───────────────────────────────┐
│ 👋 昨日ぶりの記録             │
└───────────────────────────────┘
```
- 背景: `#e7f4f8` (薄青)
- テキスト: `#004085` (濃青)

### パターン③ 3日ぶり
```
┌───────────────────────────────┐
│ 🎉 3日ぶりの記録です          │
└───────────────────────────────┘
```
- 背景: `#fff3e0` (薄オレンジ)
- テキスト: `#856404` (濃茶)
- **太字** & **やや大きい**

---

## 11. Definition of Done チェックリスト

- [x] インジケーターのレイアウトと表示パターンが定義されている（セクション 2-3, 6）
- [x] 3つの表示パターン（当日・昨日・X日前）の文言が決まっている（セクション 2）
- [x] 使用するデータ（props）が明示されている（セクション 4）

**追加項目:**
- [x] 配置（HealthForm 内どこに置くか）が明確（セクション 8）
- [x] スタイル（色・サイズ）が定義（セクション 6）
- [x] モバイル対応を考慮（セクション 3）
- [x] アクセシビリティ対応を検討（セクション 7）

---

## 12. 参考・関連ファイル

- `frontend/src/components/HealthForm.tsx` — 配置先コンポーネント
- `frontend/src/types.ts` — LatestRecord 型定義
- `frontend/src/api.ts` — get_latest Lambda の結果を取得
- `.claude/rules/typescript/security.md` — TypeScript 実装時の規約

