---
description: 現在の作業状態をテスト確認後に git stash + ログに保存する。長時間作業中の中間セーブポイント。
---

# /checkpoint — 作業チェックポイント

## 実行手順

### 1. テスト・型チェックを通す

```bash
pytest lambda/ -v
npx tsc --noEmit --project frontend/tsconfig.json
```

失敗がある場合はチェックポイントを作成する前に修正する。

### 2. 差分を確認

```bash
git diff --stat HEAD
git status --short
```

### 3. チェックポイントを作成

```bash
# 変更をスタッシュ（名前付き）
git stash push -m "checkpoint: <作業内容の説明>"

# ログに記録
echo "$(date '+%Y-%m-%d %H:%M') | checkpoint: <説明> | $(git rev-parse --short HEAD)" \
  >> .claude/checkpoints.log
```

### 4. チェックポイント一覧の確認

```bash
cat .claude/checkpoints.log
git stash list
```

## チェックポイントの復元

```bash
# 最新のチェックポイントを復元
git stash pop

# 特定のチェックポイントを復元（番号指定）
git stash apply stash@{N}
```

## 使いどころ

- 複数ファイルにまたがる大きな変更の途中で一時保存したいとき
- 実験的な変更を試す前に現在の状態を保存したいとき
- PR 作成前にクリーンな状態に戻したいとき
