# 定期実行セットアップガイド（Windows / WSL）

`scripts/run-dev-env-review.sh` を定期実行するための設定手順。

---

## 方法 A: WSL の cron（推奨）

WSL 内の cron デーモンを使う方法。bash スクリプトをそのまま実行できる。

### 1. cron サービスを起動

```bash
# cron が動いているか確認
service cron status

# 動いていなければ起動
sudo service cron start
```

### 2. WSL 起動時に cron を自動起動する（任意）

WSL はウィンドウを閉じると停止するため、Windows 起動時に WSL+cron を自動起動したい場合は以下を設定する。

**Windows タスクスケジューラ**で以下のタスクを作成：

| 項目 | 値 |
|------|-----|
| トリガー | コンピューターの起動時 |
| 操作 | プログラムの開始 |
| プログラム | `C:\Windows\System32\wsl.exe` |
| 引数 | `sudo service cron start` |
| ユーザー | 現在のユーザー |

または PowerShell で登録：

```powershell
$action = New-ScheduledTaskAction -Execute "wsl.exe" -Argument "sudo service cron start"
$trigger = New-ScheduledTaskTrigger -AtStartup
Register-ScheduledTask -TaskName "WSL cron start" -Action $action -Trigger $trigger -RunLevel Highest
```

### 3. crontab を設定

```bash
crontab -e
```

以下を追記（毎月1日 AM 9:00 に実行）：

```cron
0 9 1 * * bash scripts/run-dev-env-review.sh --model haiku >> /tmp/dev-env-review.log 2>&1
```

> **パスは実際のリポジトリパスに変更してください**

### 4. 確認

```bash
# 登録内容を確認
crontab -l

# ログを確認（実行後）
tail -f /tmp/dev-env-review.log
```

---

## 方法 B: Windows タスクスケジューラ（WSL を直接呼び出す）

WSL 内の bash スクリプトを Windows タスクスケジューラから直接呼び出す方法。  
WSL が動いていなくても Windows が自動的に起動してくれる。

### PowerShell で登録

```powershell
# リポジトリパスを WSL 形式で指定（例）
$wslRepoPath = "/home/riku_nishikawa/dev/health-logger/health-logger"

$action = New-ScheduledTaskAction `
  -Execute "wsl.exe" `
  -Argument "-e bash -c `"cd $wslRepoPath && bash scripts/run-dev-env-review.sh --model haiku >> /tmp/dev-env-review.log 2>&1`""

# 毎月1日 AM 9:00
$trigger = New-ScheduledTaskTrigger -Weekly -WeeksInterval 4 -DaysOfWeek Monday -At "09:00"

Register-ScheduledTask `
  -TaskName "health-logger: Claude Code Dev Env Review" `
  -Action $action `
  -Trigger $trigger `
  -Description "Claude Code 開発環境の改善レポートを月次生成"
```

### GUI で登録する場合

1. `Win + R` → `taskschd.msc` → タスクスケジューラを開く
2. 「基本タスクの作成」をクリック
3. 名前: `health-logger: Claude Code Dev Env Review`
4. トリガー: 毎月（1日、9:00）
5. 操作: プログラムの開始
   - プログラム: `wsl.exe`
   - 引数: `-e bash -c "cd /home/riku_nishikawa/dev/health-logger/health-logger && bash scripts/run-dev-env-review.sh --model haiku"`

---

## 手動でテスト実行

定期実行の設定前に、まず手動で動作確認する。

```bash
# WSL 上で実行
cd ~/dev/health-logger/health-logger
bash scripts/run-dev-env-review.sh --dry-run    # ドライラン（Claude は起動しない）
bash scripts/run-dev-env-review.sh --model haiku  # 実際に実行
```
