# SRE・運用規約 (SRE / Operations)

LUDIARS 全リポジトリ共通の **運用にあたって気をつける観点** を、サービスの種類別に
定める。あわせて **異常を検知したときの Issue 報告** の運用を定める。

可観測性の基盤は Vestigium (ログ収集) + Concordia (横断監視 / error-detection)。
コード側のログ規約は [`RULE_CODE.md`](./RULE_CODE.md) §15。

---

## 1. サービス種別ごとの運用 watchpoint

各リポジトリは、自分の種別に該当する観点を `spec/` 以下 (例: `spec/operations.md`)
に運用方針として残す。

### 1.1 Web サービス
- **可用性 / ヘルスチェック**: 死活エンドポイント、起動失敗の検知。
- **依存の外部化**: PostgreSQL / Redis は共有インフラ前提。接続断・TTL 失効
  (Redis 7日) からの復帰。
- **マイグレーション**: 冪等に流れること ([`RULE.md`](./RULE.md) §2)。CREATE INDEX は
  ALTER の後 (既存 DB で no such column を出さない)。
- **レート制限 / 濫用対策**、認証境界の監視 (Cernere)。
- **バックアップ / リストア** 方針。
- **ポート競合**: ホスト port は PORT-MAP に従い、既知の squat (Dropbox 17500 等)
  を避ける。

### 1.2 ローカルアプリ (デスクトップ / CLI / 常駐)
- **クラッシュ復帰 / 自動再起動**、多重起動・古いプロセス残留の検知。
- **ローカルデータ破損対策**: SQLite migration の immutability、書き込み中断耐性。
- **オフライン動作** とオンライン復帰時の同期。
- **自動更新** とロールバック。
- **センシティブ情報の保護** ([`RULE_DATA_SCHEMA.md`](./RULE_DATA_SCHEMA.md) §3、
  GPS / 長期 WS / MQTT は Tailscale で閉じる)。
- 常駐プロセスのリソースリーク (§ コード §10) の長時間監視。

### 1.3 ゲーム (クライアント)
- **フレーム budget / メモリ / GC スパイク** の監視。
- **セーブデータ破損対策** とバックアップ世代。
- **アセットロード失敗時のフォールバック** (欠損アセットでクラッシュさせない)。
- プラットフォーム別の互換 (CRT / ビルド構成。例: KS は Release 必須)。

### 1.4 共有ライブラリ / 基盤層
- **後方互換**: 公開 API の破壊的変更は consumer へ周知し、リンク/ビルドを確認
  ([`RULE_TEST.md`](./RULE_TEST.md) consumer テスト)。
- バージョニングと変更履歴。

### 1.5 P2P / リアルタイム通信
- NAT 越え / fallback 経路 (IPv4 fallback、dual-stack の罠)、bootstrap 経路と
  データプレーンの分離 (Cloudflare Tunnel は UDP を通さない等)。
- 接続の生存監視 (ping/pong)、再接続。

---

## 2. Issue 報告

運用中に検知した異常 / 障害 / 不安定挙動は **GitHub Issue に記録** して追跡する。

- **検知したら起票する**: 監視 (Concordia / error-watch) や手動で見つけた異常は、
  握って終わらせず Issue にする。
- **起票内容**: 重大度ラベル / 事象と再現手順 / 影響範囲 / 関連ログ (Vestigium)
  へのポインタ / 暫定対応の有無。
- **撤去・暫定対応の tracker**: 過剰ログや一時 workaround を入れたら、撤去条件を
  Issue に明記して追跡する (スキル `verbose-logging-bootstrap` と同じ運用、
  [`RULE_CODE.md`](./RULE_CODE.md) §20)。
- 自動修正 (AUTOFIX) の対象範囲・対象外は [`REVIEW.md`](./REVIEW.md) に従う。
  設計判断 / 大型実装を要するものは Issue に残して人間に委ねる。

---

## なぜ？

- 「気をつける観点」をサービス種別で固定化することで、Web の運用知をゲームに
  押し付ける/ローカルアプリにクラウド SRE を求める、といったミスマッチを避ける。
- 異常を Issue に集約することで、検知 → 原因 → 修正 → 撤去のループが追跡可能に
  なり、同じ障害の再発と「直したつもり」を防ぐ。
