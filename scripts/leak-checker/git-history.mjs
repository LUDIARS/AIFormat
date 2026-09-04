import { runCommand } from "./github-repositories.mjs";
import { createTextScanner } from "./scanner.mjs";

/**
 * 公開済み履歴のコミットメッセージを読む。
 *
 * 作業ツリーの追跡ファイルだけを見る監査 (`github-public-leak-audit.mjs`) では
 * **コミットメッセージが対象外**で、USAGE にもそう書いてある。 ファイルを後から
 * 消してもメッセージは残るので、別の入口として要る。 2026-09-04 の点検で、
 * 未公開プロダクト名を件名に含む公開コミットが実際に見つかった。
 *
 * 見るのは**リモートに到達している ref だけ**。 ローカルにしかないコミットは
 * まだ公開されていないので、監査を落とす理由にならない — 直す先が履歴書き換えでは
 * なく「送る前に直す」になり、対処がまるで変わる。
 */

const RECORD_SEPARATOR = "\u0000";
const COMMIT_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;

/**
 * `git log -z` は 1 コミットを 1 レコードとして NUL で区切る。 区切りを `--format`
 * 側に埋め込めないのは、spawn が NUL を含む引数を拒むため。
 */
export function parseCommitLog(stdout) {
  if (typeof stdout !== "string") {
    throw new Error("Invalid git log output: expected text.");
  }
  const commits = [];
  for (const record of stdout.split(RECORD_SEPARATOR)) {
    if (!record.trim()) continue;
    const newline = record.indexOf("\n");
    const commit = (newline === -1 ? record : record.slice(0, newline)).trim();
    if (!COMMIT_PATTERN.test(commit)) {
      // 監査で未知のレコードを無視すると、形式変更や壊れた出力を「検出なし」と
      // 誤判定する。 読めない出力は fail closed にする。
      throw new Error("Invalid git log output: expected a full commit id.");
    }
    commits[commits.length] = {
      commit,
      message: newline === -1 ? "" : record.slice(newline + 1),
    };
  }
  return commits;
}

export function listPublishedCommitMessages(
  repositoryPath,
  { commandRunner = runCommand, remote = "origin", limit = 0 } = {},
) {
  const args = ["log", "-z", `--remotes=${remote}`, "--format=%H%n%B"];
  if (limit > 0) args[args.length] = `--max-count=${limit}`;
  return parseCommitLog(
    commandRunner("git", args, { cwd: repositoryPath, timeoutMs: 120_000 }),
  );
}

/**
 * 見つかった語そのものは返さない。 監査レポートは共有され得るので
 * 「どのコミットに、どの登録語 id が出たか」で足りる。 値を載せると
 * レポート自体が二次的な流出になる。
 */
export function scanCommitMessages(commits, keywords) {
  const scan = createTextScanner(keywords);
  const findings = [];
  for (const { commit, message } of commits) {
    const keywordIds = new Set();
    for (const finding of scan(`commit/${commit}`, message ?? "")) {
      for (const id of finding.keywordIds) keywordIds.add(id);
    }
    if (keywordIds.size > 0) {
      findings[findings.length] = { commit, keywordIds: [...keywordIds].sort() };
    }
  }
  return findings;
}
