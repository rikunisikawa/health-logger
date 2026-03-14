---
skill: typescript_react
purpose: React 18 + TypeScript 5 (strict) + Amplify Auth v6 による型安全なフロントエンド実装パターン
used_by: [frontend, testing]
---

## Purpose

health-logger フロントエンドを TypeScript strict モードで型安全に実装するためのパターン集。
Amplify Auth・オフラインキュー・Recharts を含む。

## Responsibilities

- コンポーネント・フックの型安全な実装
- Amplify Auth v6 の認証フロー
- API クライアントの型定義
- オフラインキュー（IndexedDB）の操作
- Recharts によるグラフ実装

## Patterns

### 型定義（types.ts）

```typescript
export interface HealthRecord {
  fatigue:    number;  // 0-10
  mood:       number;  // 0-10
  motivation: number;  // 0-10
  flags:      number;  // bitmask 0-63
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
}

// FLAGS ビットマスク
export const FLAGS = {
  POOR_SLEEP:   1,
  HEADACHE:     2,
  STOMACHACHE:  4,
  EXERCISE:     8,
  ALCOHOL:      16,
  CAFFEINE:     32,
} as const;
```

### API クライアント（api.ts）

```typescript
import { fetchAuthSession } from "aws-amplify/auth";

const API_URL = import.meta.env.VITE_API_URL as string;

async function getToken(): Promise<string> {
  const session = await fetchAuthSession();
  return session.tokens?.idToken?.toString() ?? "";
}

export async function postRecord(record: HealthRecord): Promise<void> {
  const token = await getToken();
  const res = await fetch(`${API_URL}/records`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify(record),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
}
```

### カスタムフック（useAuth.ts）

```typescript
import { useState, useEffect } from "react";
import { getCurrentUser, signOut } from "aws-amplify/auth";

export function useAuth() {
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCurrentUser()
      .then(u => setUserId(u.userId))
      .catch(() => setUserId(null))
      .finally(() => setLoading(false));
  }, []);

  return { userId, loading, signOut };
}
```

### Recharts グラフコンポーネント

```typescript
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

interface Props {
  data: Array<{ day: string; fatigue: number; mood: number }>;
}

export function TrendChart({ data }: Props) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <XAxis dataKey="day" />
        <YAxis domain={[0, 10]} />
        <Tooltip />
        <Line type="monotone" dataKey="fatigue" stroke="#ef4444" />
        <Line type="monotone" dataKey="mood"    stroke="#3b82f6" />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

### オフラインキュー確認パターン

```typescript
// useOfflineQueue フック経由のみ使用する
import { useOfflineQueue } from "../hooks/useOfflineQueue";

function HealthForm() {
  const { enqueue } = useOfflineQueue();

  const submit = async (record: HealthRecord) => {
    try {
      await postRecord(record);
    } catch {
      await enqueue(record);  // オフライン時はキューに積む
    }
  };
}
```

## 開発コマンド

```bash
cd frontend
npx tsc --noEmit     # 型チェック（エラーなし必須）
npm run build        # ビルド（成功必須）
npm run dev          # 開発サーバー
```

## Best Practices

- `strict: true` を維持（`tsconfig.json` を緩めない）
- `any` 型は使わない → `unknown` + 型ガード
- 環境変数: `import.meta.env.VITE_*` + `as string`
- Amplify Auth: `aws-amplify/auth` サブパスインポート
- IndexedDB: `useOfflineQueue` フック経由のみ
- コンポーネントは `components/`、ロジックは `hooks/` に分離

## Output Format

- 変更ファイルと変更内容の説明
- `npx tsc --noEmit` 結果（エラーなし確認）
- `npm run build` 結果（成功確認）
