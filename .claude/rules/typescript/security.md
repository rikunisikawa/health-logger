---
paths:
  - "frontend/**/*.ts"
  - "frontend/**/*.tsx"
---
# TypeScript フロントエンド セキュリティルール

## strict モードの維持

`frontend/tsconfig.json` の `strict: true` を絶対に緩めない。

```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true  // ← 削除・false 化禁止
  }
}
```

型チェックコマンド:
```bash
npx tsc --noEmit --project frontend/tsconfig.json
```

## 環境変数の参照

`process.env` を直接使わず `import.meta.env.VITE_*` 経由で参照する。

```typescript
// OK
const apiUrl = import.meta.env.VITE_API_URL as string;

// NG
const apiUrl = process.env.REACT_APP_API_URL;
```

## Amplify Auth の使用

`aws-amplify/auth` からサブパスインポートする（バンドルサイズ削減のため）。

```typescript
// OK
import { fetchAuthSession, signIn, signOut } from "aws-amplify/auth";

// NG: バンドル全体をインポート
import Amplify from "aws-amplify";
```

## IndexedDB の操作

`useOfflineQueue` フック以外で IndexedDB を直接操作しない。

```typescript
// OK: フック経由
const { addToQueue, flushQueue } = useOfflineQueue();

// NG: コンポーネントで直接操作
const db = await openDB("health-logger", 1, ...);
```

## XSS 防止

- ユーザー入力をそのまま `dangerouslySetInnerHTML` に渡さない
- API レスポンスの文字列を DOM に直接挿入しない
- Recharts のカスタムツールチップでサニタイズを忘れない

## シークレット管理

- `.env.local` に API キーを書かない（Vite は `VITE_` プレフィックスをバンドルに埋め込む）
- Cognito の Client ID・User Pool ID は公開情報なので `VITE_*` での管理は OK
- Cognito の Client Secret はフロントエンドに持たない（SPA は secret なし）
