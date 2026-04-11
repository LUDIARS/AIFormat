# npm scripts クロスプラットフォーム記法

package.json の scripts を Windows (cmd.exe) と Linux/macOS (bash) の両方で動作させるためのルール。

## チェック対象

package.json の `"scripts"` フィールド内の全コマンド。

## 禁止パターン

### 1. `&` によるバックグラウンド実行
```json
// NG
"dev": "npm run a & npm run b & wait"

// OK
"dev": "concurrently \"npm run a\" \"npm run b\""
```

### 2. シングルクォート
```json
// NG
"build": "cargo watch -x 'run --features web-server'"

// OK
"build": "cargo watch -x \"run --features web-server\""
```

### 3. `cd dir &&` によるディレクトリ移動
```json
// NG
"server": "cd src-tauri && cargo run"

// OK（--workdir を使用）
"server": "cargo watch --workdir src-tauri -x \"run\""
```

### 4. bash 専用の変数操作
```json
// NG
"start": "export FOO=bar && node index.js"
"start": "set -a && . ./.env && node index.js"
"start": "FOO=$(pwd) node index.js"

// OK
"start": "dotenv-cli -- node index.js"
```

## 修正時の推奨ツール

| 用途 | ツール |
|------|--------|
| 並列実行 | `concurrently` |
| 環境変数 | `dotenv-cli` |
| 作業ディレクトリ | 各ツールの `--workdir` / `--cwd` オプション |

## 適用タイミング

- package.json の scripts を新規追加・変更するとき
- 既存プロジェクトで Windows 対応が必要になったとき
