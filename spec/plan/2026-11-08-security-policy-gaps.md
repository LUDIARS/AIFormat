# セキュリティ対応ポリシーの現状と不足

- 日付: 2026-11-08
- 状態: 調査 (未着手の項目は未登録)
- 対象: [`RULE_AI_SECURITY.md`](../../RULE_AI_SECURITY.md) §3 のゼロトラスト + 5 本柱
- 根拠: Cernere / Excubitor の spec の記述。コードと本番の設定は確認していないため、
  「spec に記述が無い」は「実装が無い」と同じではない。着手前に実装を確認する。

## 1. Cernere (Cr) で担保済みのもの

| 柱 | 担保 | 根拠 (Cernere spec) |
|----|------|------|
| ゼロトラスト | 常時接続セッションによる継続検証、切断時の即時失効、破壊的操作の 4 層防御 | `interface/security_design.md` |
| ゼロトラスト | workload token は TTL 60 秒・毎回 introspection・認可結果をキャッシュしない・完全一致 grant | `feature/workload-authority.md` |
| 本人証明 | パスキー、MFA (TOTP / SMS / Email)、Google OIDC、端末セッションと失効、運用者によるパスキー回復 | `plan/passkey-default-authentication.md` / `feature/mfa-authenticator.md` |
| 本人証明 | 新しい端末からのサインインをメールコードで追加確認 | `feature/identity-verification.md` |
| 本人証明 | 企業 SSO (Cloudflare Access のアサーション検証)、Cernere の OIDC プロバイダ | `feature/cloudflare-enterprise-sso.md` / `feature/edge-assertion-login.md` / `feature/oidc-provider.md` |
| 本人証明 | サービス間の service token (EdDSA、宛先・scope 付き)、workload の Ed25519 鍵登録 | `feature/service-token.md` / `feature/workload-authority.md` |
| データ保存 | 個人データの単一情報源、サービス×カテゴリ単位のオプトアウト | `data/schema.md` (`user_data_optouts`) |
| データ保存 | TOTP 共有鍵の AES-256-GCM 保存、OIDC 署名鍵の暗号化保存、token の hash 保存 | `data/schema/mfa-authenticator.md` / `data/README.md` |

Excubitor 側では、拠点間 mesh の Ed25519 要求署名 (method・path・本文ハッシュ・nonce・宛先を
束縛) と peer ごとの既定拒否が spec 化されている (`spec/feature/security-mesh-cr-auth.md`)。

## 2. 不足

### 2.1 ゼロトラスト

| # | 不足 | 根拠 |
|---|------|------|
| Z-1 | Cr の一般認証の待受は平文 HTTP で、TLS は workload 専用ポートだけ。経路の暗号化は前段の proxy 任せ | Cr `feature/workload-authority.md` |
| Z-2 | Ex mesh の `cr-v1` 方式は Ex 側の実装仕様のみで、Cr との相互接続と運用移行が未実施。現状は legacy-monitor | Ex `spec/feature/security-mesh-cr-auth.md` |
| Z-3 | 各サービスの受信側で「既定拒否・要求ごとの検証」を確かめる共通チェックが無い (Cr 以外のサービスの実装は未確認) | — |

### 2.2 本人証明

| # | 不足 | 根拠 |
|---|------|------|
| I-1 | 監査ログ `operation_logs` に主体の種類 (人 / サービス / workload / AI) の列が無く、AI の操作を人と区別できない | Cr `data/schema.md` |
| I-2 | AI エージェントを主体として扱う方針が workload grant (`ai-spawn` / `ai-inject`) 以外に無い。AI がどの資格情報で動くかの一般規約が無い | Cr `feature/workload-authority.md` |
| I-3 | 重要操作の再認証 (step-up: 直近の認証の強さと時刻の要求) が spec に見当たらない | — |
| I-4 | 端末確認はフィンガープリント + メールコードで、端末の正当性 (attestation) は扱わない (spec は「物理端末の識別ではない」と明記) | Cr `plan/passkey-default-authentication.md` |
| I-5 | 主戦略 (§3.1.1) が未整備。現行はサインイン時の `new_ip` 判定とメールコード確認だけで、**接続中の WS セッションと新しい接続の近さ (endpoint / 推定地理) を比べる監視、不審の通知・マーキング・権限の引き下げ、再認証による解除** の spec・実装が無い。既存 spec の「Geolocation API は取得しない」とは、ブラウザ位置ではなく IP からの推定地理を使う点で両立させる (推定方法・近さの閾値・保持期間を spec で決める) | Cr `feature/identity-verification.md` / `interface/security_design.md` §1.1 |

### 2.3 解析耐性

| # | 不足 | 根拠 |
|---|------|------|
| T-1 | 全体方針が無かった (本書 §3.2 で新設)。ゲーム・ローカルアプリのレビュー観点はあるが、配布物の署名・起動時の完全性検査・難読化の基準は未定 | AIFormat `game/` / `local-app/` |
| T-2 | Cr 経由で利用者ごとの短命 token を配る標準手順 (クライアントに secret を埋めない代わり) が未整理 | — |

### 2.4 経路の保全証明

| # | 不足 | 根拠 |
|---|------|------|
| P-1 | サービス間の token は bearer のまま。mTLS / DPoP による送信者束縛は「別 phase」「設計 doc を分けて起こす」で未着手 | Cr `plan/auth-hardening-followups-2026-07.md` B-3 / `plan/project-authentication.md` |
| P-2 | 監査ログに改ざん検知 (連鎖ハッシュ・外部複製) が無い。書き込み失敗も `console.error` 止まり | Cr `interface/security_design.md` §3.4 |
| P-3 | リリース成果物の checksum・署名・provenance の運用が無い (レビュー観点のみ) | AIFormat `common/REVIEW_VULNERABILITY.md` §2 |
| P-4 | Cr のリレー (ユーザーセッション間の中継) にメッセージ単位の完全性保証が無い | Cr `interface/security_design.md` §4 |

### 2.5 脆弱性・感染対策

| # | 不足 | 根拠 |
|---|------|------|
| V-1 | 依存 CVE の定期走査がゲートになっていない (`deps-sweep` スキルは手動・Dependabot alert 頼み)。SBOM も無い | — |
| V-2 | lockfile の方針が矛盾している。レビュー観点は「lockfile をコミットし凍結インストール」、運用メモは「package-lock の差分はコミットしない」 | AIFormat `common/REVIEW_VULNERABILITY.md` §2 |
| V-3 | シークレット履歴走査は設計のみで未実装 | AIFormat `script_design/SECRET_HISTORY.md` |
| V-4 | 開発端末・拠点の感染対策 (端末保護・隔離手順・再構築の基準) の規定が無い | — |
| V-5 | Ex security report は記録の器で、走査を自動で回す仕組みは無い | Ex `spec/feature/security-reports.md` |

### 2.6 データ保存

| # | 不足 | 根拠 |
|---|------|------|
| D-1 | 保持期間が「アカウント削除まで」以外ほぼ定義されていない。`operation_logs` などの保持期間・削除が未定 | Cr `data/schema.md` |
| D-2 | `operation_logs.params` を jsonb でそのまま保存しており、マスクの規定が無い | Cr `data/schema.md` |
| D-3 | アカウント削除・オプトアウトを各サービスのサービス固有データとキャッシュへ伝播させる手順が無い | — |
| D-4 | バックアップの暗号化・保持・削除の規定が無い | — |
| D-5 | AIFormat `RULE.md` §7 と `HARNESS.md` §1 がシークレットの経路を `@cernere/env-cli` + Infisical と書いており、現行の Excubitor Vault と食い違う | Cr `plan/secrets-runtime.md` (履歴扱い) |
| D-6 | オプトアウトと権限付きのデータ閲覧は Cr にあるが、不審判定 (I-5) とつないで利用者単位でデータ閲覧・提供を一括停止する **ロックダウン** と、その解除手順が無い | Cr `data/schema.md` (`user_data_optouts`) |

## 3. 次の一手

不足ごとに担当リポジトリが違うため、着手するものを人間が選び、選んだものを Actio に登録してから
進める。AIFormat 内で閉じるもの (V-2 の方針決定、D-5 の記述更新、T-1 の基準) は AIFormat の
変更で、Cr / Ex の実装を伴うもの (Z-1・Z-2・I-1・I-3・I-5・P-1・P-2・D-1〜D-3・D-6) は各リポジトリの
タスクで扱う。
