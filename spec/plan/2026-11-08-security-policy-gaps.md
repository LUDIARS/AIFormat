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
| T-1 | **解消 (2026-11-08)**: RULE_AI_SECURITY §3.2 に配布形態ごとの最低線を追加。旧: 全体方針が無かった (本書 §3.2 で新設)。ゲーム・ローカルアプリのレビュー観点はあるが、配布物の署名・起動時の完全性検査・難読化の基準は未定 | AIFormat `game/` / `local-app/` |
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
| V-2 | **解消 (2026-11-08)**: RULE_AI_SECURITY §3.4 に「lockfile はコミットし意図した変更だけで更新、副作用の churn は戻す」と定めた。旧: lockfile の方針が矛盾している。レビュー観点は「lockfile をコミットし凍結インストール」、運用メモは「package-lock の差分はコミットしない」 | AIFormat `common/REVIEW_VULNERABILITY.md` §2 |
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
| D-5 | **解消 (2026-11-08)**: RULE / HARNESS / RULE_CODE / RULE_TECH_STACK / FORMAT_AUTH を Excubitor Vault に更新。旧: AIFormat `RULE.md` §7 と `HARNESS.md` §1 がシークレットの経路を `@cernere/env-cli` + Infisical と書いており、現行の Excubitor Vault と食い違う | Cr `plan/secrets-runtime.md` (履歴扱い) |
| D-6 | オプトアウトと権限付きのデータ閲覧は Cr にあるが、不審判定 (I-5) とつないで利用者単位でデータ閲覧・提供を一括停止する **ロックダウン** と、その解除手順が無い | Cr `data/schema.md` (`user_data_optouts`) |

### 2.7 管理者アクセス (loopback 限定) の攻撃耐性

「管理用の入口は loopback だけ」は広く使われる方針だが、それだけでは攻撃耐性として
**不十分** である。loopback に届く経路は外部ネットワーク以外にも多く、その多くを
接続元アドレスでは区別できないためである。[`RULE_AI_SECURITY.md`](../../RULE_AI_SECURITY.md)
§3.1.2 の 7 条件で補う。主な攻撃経路と、Excubitor の現行実装 (`src/security/local-browser-guard.ts` /
`browser-allowlist.ts`) での対応状況は次のとおり。

| 攻撃経路 | 内容 | 防ぐ条件 | Ex 現行 |
|----------|------|----------|---------|
| ブラウザからの CSRF | 悪意あるページが `http://127.0.0.1:<port>` へ form POST / fetch する | 3 | 対応 (Origin・Sec-Fetch-Site・JSON 必須) |
| DNS rebinding | 攻撃者ドメインを 127.0.0.1 に解決させ、同一 origin として読む | 3 | 対応 (Host が loopback 名であることを検査) |
| 転送経路 | Tunnel・`tailscale serve`・リバースプロキシ・SSH 転送が外部要求を loopback へ渡す | 2 | 一部 (allowlist 外の Host は拒否。転送側が Host を loopback に書き換える設定は防げない。`X-Forwarded-*` の拒否は無い) |
| 同じマシンの他プロセス | マルウェア・汚染された npm 依存・AI エージェントが curl 等で直接呼ぶ (Origin を付けなければブラウザ向けの検査を通る) | 4 / 6 | **未対応** (loopback かつ Origin 無しの要求は認証なしで通る) |
| 同じホスト上の SSRF | 別サービスの SSRF 脆弱性を踏み台に loopback の管理口を叩く | 4 | **未対応** (同上) |
| ポートの乗っ取り | 管理サービスが止まっている間に別プロセスが同じポートで待ち受け、クライアントの資格情報を受け取る | 4 (相互認証) | 未確認 |
| 別の OS ユーザー | 共用マシンの別ユーザーが loopback に届く | 4 | **未対応** |
| リモートデスクトップ・遠隔管理ツール | 遠隔操作がマシン上の直接操作として見える | 本人証明 (§3.1) | 対象外 (ツール側の保護) |

| # | 不足 | 根拠 |
|---|------|------|
| A-1 | loopback の管理口 (`/api/*`・`/mcp`) は `localBrowserGuard` だけで守られ認証が無く、同じマシン上のプロセス・SSRF・別 OS ユーザーから管理操作ができる (最重要)。操作者も自己申告の `x-excubitor-actor` header で記録しており、監査で主体を確かめられない。secret-agent の `/api/v1/secrets/resolve` だけは token 認証がある | Ex `src/security/local-browser-guard.ts` / `src/index.ts` |
| A-2 | `X-Forwarded-*` 付きの要求を拒否しておらず、転送経路を管理ポートに向けた設定ミスを検知できない | 同上 |
| A-3 | 破壊的な管理操作 (削除・権限変更・Vault の登録と紐付けの変更) に、プロセスから代行できない在席確認が無い。Vault は値を返す API・画面を持たない設計 (取り出しは対象外) だが、同じ OS ユーザーなら復号できることは許容済み | Ex `spec/feature/vault.md` |
| A-4 | AI エージェントが管理口に届き、人と同じ管理権限で操作できる。AI 用に絞った資格情報が無い | — |
| A-5 | 転送ツール (Tunnel / `tailscale serve`) の転送先に管理ポートが含まれていないかを点検する仕組みが無い | — |

## 3. 着手状況 (2026-11-08)

依頼者の指示 (2026-11-08「不足分を着手。ただし今の AI ワークフローが著しく非効率になってはならない」) により、
作業系統ごとに Actio へ登録した。全タスク共通の制約: 資格情報は自動配布・自動付与し日常操作に人の確認を
挟まない / 在席確認は頻度の低い高影響操作に限る / 新しい強制は「観測 → 計測 → 強制」の順で入れる。

| Actio | 系統 | 項目 |
|-------|------|------|
| actio:32574229-741a-4b7d-9804-986af3cc9e6f | AIFormat 文書 | D-5 / V-2 / T-1 (本変更で解消) |
| actio:74bf9f19-101b-40f1-ab13-09dfe3b61c1b | Excubitor 管理 API | A-1〜A-5 |
| actio:dbd553af-8d6b-48d7-9f60-8d7f60e1ff2b | Cernere 本人介在証明 | I-5 / D-6 / I-3 |
| actio:ccad6260-2d65-4ac1-8167-1c50cdc3ee44 | Cernere 監査ログ | I-1 / P-2 / D-1 / D-2 |
| actio:8ff003ec-f081-4a04-a6f7-47127c98f93a | 経路の保全 | Z-1 / Z-2 / P-1 |
| actio:e3dfd86e-9615-405f-b972-115c9c20ed8b | 横断の残り | V-1 / V-3 / V-4 / V-5 / P-3 / D-3 / D-4 / T-2 |

## 4. 次の一手

不足ごとに担当リポジトリが違うため、着手するものを人間が選び、選んだものを Actio に登録してから
進める。AIFormat 内で閉じるもの (V-2 の方針決定、D-5 の記述更新、T-1 の基準) は AIFormat の
変更で、Cr / Ex の実装を伴うもの (Z-1・Z-2・I-1・I-3・I-5・P-1・P-2・D-1〜D-3・D-6・A-1〜A-5) は
各リポジトリのタスクで扱う。
