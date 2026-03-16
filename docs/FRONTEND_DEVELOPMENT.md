# フロントエンド開発ガイド

> 対象読者: 開発者
> React + TypeScript PWA のローカル開発・認証・型定義・PWA 構成を記載する。

---

## 開発環境のセットアップ

```bash
cd frontend
npm install
```

### ローカル開発サーバーの起動

```bash
npm run dev
```

`http://localhost:5173` でアクセスできる（Vite のデフォルトポート）。

### 本番ビルド

```bash
npm run build
# dist/ にビルド成果物が出力される
```

### 型チェックのみ実行

```bash
npx tsc --noEmit
```

---

## TypeScript strict モードの開発方針

`tsconfig.json` に `"strict": true` を設定している。この設定は緩めないこと。

strict モードで特に注意が必要な点:

**null / undefined の扱い**

```typescript
// NG: null かもしれない値を直接使う
const token = session.tokens?.idToken?.toString()
apiCall(token)  // token が null の可能性がある

// OK: 明示的に null チェックする
const token = session.tokens?.idToken?.toString() ?? null
if (!token) return
apiCall(token)
```

**環境変数のキャスト**

```typescript
// OK: VITE_ プレフィックスで参照し、as string でキャスト
const endpoint = import.meta.env.VITE_API_ENDPOINT as string

// NG: process.env を使わない（Vite では動作しない）
// NG: import.meta.env.VITE_XXX をキャストなしで string に渡す
```

---

## Amplify Auth の使い方

### 初期設定（main.tsx）

```typescript
import { Amplify } from 'aws-amplify'

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID as string,
      userPoolClientId: import.meta.env.VITE_COGNITO_CLIENT_ID as string,
      loginWith: {
        oauth: {
          domain: import.meta.env.VITE_COGNITO_DOMAIN as string,
          scopes: ['openid', 'email', 'profile'],
          redirectSignIn: [window.location.origin],
          redirectSignOut: [window.location.origin],
          responseType: 'code',
        },
      },
    },
  },
})
```

### useAuth フックの使い方

`frontend/src/hooks/useAuth.ts` に認証ロジックを集約している。

```typescript
import { useAuth } from './hooks/useAuth'

function App() {
  const { isAuthenticated, token, loading, signIn, signOut } = useAuth()

  if (loading) return <LoadingSpinner />
  if (!isAuthenticated) return <button onClick={signIn}>ログイン</button>

  // token は Cognito ID Token（API リクエストの Authorization ヘッダーに使用）
  return <HealthForm token={token!} />
}
```

**`useAuth` の内部動作**:
1. マウント時に `fetchAuthSession()` でセッション確認
2. `idToken` が存在すれば認証済みと判定（`accessToken` ではなく `idToken` を使用）
3. `signIn()` は `signInWithRedirect()` を呼び出し、Cognito Hosted UI にリダイレクト
4. Amplify ライブラリがトークンの自動リフレッシュを担当

### サブパスインポートの注意

```typescript
// OK: サブパスインポートを使う
import { fetchAuthSession, signInWithRedirect, signOut } from 'aws-amplify/auth'
import { Amplify } from 'aws-amplify'

// NG: 古い形式（バンドルサイズが増大する）
// import { Auth } from 'aws-amplify'
```

---

## useOfflineQueue フック

オフライン時に体調記録を IndexedDB に保存し、オンライン復帰後に自動送信する。

**`frontend/src/hooks/useOfflineQueue.ts`** に実装が集約されている。コンポーネントから IndexedDB を直接操作しないこと。

### 使い方

```typescript
import { useOfflineQueue } from './hooks/useOfflineQueue'

function HealthForm({ token, apiEndpoint }: Props) {
  const { enqueue, flush } = useOfflineQueue(apiEndpoint)

  // オフライン時: IndexedDB に保存
  const handleSubmit = async (record: HealthRecordInput) => {
    if (!navigator.onLine) {
      await enqueue(record, token)
      return
    }
    await fetch(`${apiEndpoint}/records`, { /* ... */ })
  }

  // オンライン復帰時: キューを送信
  useEffect(() => {
    const handleOnline = () => flush(token)
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [flush, token])
}
```

### 内部の仕組み

```
IndexedDB
  データベース名: health_logger_db (v2)
  オブジェクトストア: offline_queue
    キー: id (autoIncrement)
    インデックス: timestamp
    レコード: { url, body, token, timestamp }
```

**enqueue**: 記録を IndexedDB に追加する。
**flush**: IndexedDB の全エントリを順番に送信し、成功したものを削除する。失敗したものは次回の flush まで残る。

---

## PWA / Service Worker の仕組み

`frontend/public/sw.js` にサービスワーカーが定義されている。

**主な機能**:
- オフライン時の静的ファイルキャッシュ（App Shell パターン）
- Web Push 通知の受信処理

**登録方法（main.tsx）**:

```typescript
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
}
```

**Web Push 通知のフロー**:

```
ブラウザ → VAPID 公開鍵で購読作成 → POST /push/subscribe → DynamoDB 保存
↓（毎日スケジューラーから）
EventBridge → push_notify Lambda → DynamoDB スキャン → Web Push 送信
↓
ブラウザの Service Worker → 通知表示
```

VAPID 公開鍵は Amplify の環境変数 `VITE_VAPID_PUBLIC_KEY` から参照する。

---

## 型定義（types.ts）の拡張手順

`frontend/src/types.ts` に共有型定義を集約している。

**既存の型**:

```typescript
// 記録種別と入力モードの制約
type ItemType = 'slider' | 'checkbox' | 'number' | 'text'
type ItemMode = 'form' | 'event' | 'status'

// カスタム項目の設定
interface ItemConfig { ... }

// カスタム項目の値（記録時）
interface CustomFieldValue { ... }

// POST /records のリクエストボディ
interface HealthRecordInput { ... }

// GET /records/latest のレスポンス要素
// 注意: Athena はすべての値を string で返す
interface LatestRecord { ... }
```

**新しいカスタム項目の type を追加する場合**:

1. `types.ts` の `ItemType` に値を追加する
2. `lambda/create_record/models.py` の `CustomFieldValue.type` の `Literal` に追加する
3. `lambda/save_item_config/handler.py` の `ALLOWED_TYPES` に追加する

3ファイルを合わせて変更しないと、フロントエンドとバックエンドで型が食い違う。

---

## ローカルでの Cognito 設定

ローカル開発でも Cognito 認証を使うには、Terraform で callback_urls に `http://localhost:5173` を追加する必要がある。

**手順**:

1. `terraform/envs/prod/terraform.tfvars` に localhost を追加する:

```hcl
cognito_callback_urls = [
  "https://main.XXXX.amplifyapp.com",
  "http://localhost:5173"
]
```

2. terraform apply を実行する（ユーザーが確認してから）

3. `frontend/` に `.env.local` を作成する:

```
VITE_API_ENDPOINT=https://<api-id>.execute-api.ap-northeast-1.amazonaws.com
VITE_COGNITO_USER_POOL_ID=ap-northeast-1_XXXXXXXXX
VITE_COGNITO_CLIENT_ID=XXXXXXXXXXXXXXXXXXXXXXXXXX
VITE_COGNITO_DOMAIN=health-logger-prod.auth.ap-northeast-1.amazoncognito.com
VITE_VAPID_PUBLIC_KEY=BXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX...
```

これらの値は `terraform output` コマンドで確認できる。

`.env.local` は `.gitignore` に含まれているため、コミットされない。
