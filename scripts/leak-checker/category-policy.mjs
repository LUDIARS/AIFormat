import { enabledBuiltinDetectors } from "./host-identifiers.mjs";

/**
 * 所見を種類ごとの扱い (advisory / enforce / off) で振り分ける。
 *
 * category の無い従来の語 (`keyword`) と、 非公開リポジトリ名から導いた語は従来どおり
 * ゲートを落とす。 新しい種類 (private-ip / local-path / machine-name / site-name) は
 * 辞書の `categories` で enforce にしたときだけゲートを落とし、 既定は advisory。
 */

const LEGACY_KIND = "keyword";

export function findingKinds(finding) {
  return Array.isArray(finding?.kinds) && finding.kinds.length > 0 ? finding.kinds : [LEGACY_KIND];
}

export function isEnforcedKind(kind, categories = {}) {
  return kind === LEGACY_KIND || categories[kind] === "enforce";
}

/** 1 行に複数の種類が当たったら、 どれか 1 つでも enforce ならゲート側に置く。 */
export function partitionFindings(findings, categories = {}) {
  const enforced = [];
  const advisory = [];
  for (const finding of findings) {
    (findingKinds(finding).some((kind) => isEnforcedKind(kind, categories)) ? enforced : advisory)
      .push(finding);
  }
  return { enforced, advisory };
}

/** `off` の種類の固定語を外す。 */
export function activeKeywords(keywords, categories = {}) {
  return keywords.filter((keyword) => !keyword.category || categories[keyword.category] !== "off");
}

export function activeDetectors(categories = {}) {
  return enabledBuiltinDetectors(categories);
}

/** 種類別の件数。 1 所見に複数の種類があればそれぞれに数える。 */
export function countByKind(findings) {
  const counts = {};
  for (const finding of findings) {
    for (const kind of findingKinds(finding)) counts[kind] = (counts[kind] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

/** リポジトリ別 × 種類別の件数。 値は持たず、 公開リポジトリ名 (伏せ字済み) だけを鍵にする。 */
export function countByRepositoryAndKind(findings) {
  const byRepository = {};
  for (const finding of findings) {
    const repository = finding.repository ?? "(unknown)";
    byRepository[repository] ??= {};
    for (const kind of findingKinds(finding)) {
      byRepository[repository][kind] = (byRepository[repository][kind] ?? 0) + 1;
    }
  }
  return Object.fromEntries(Object.entries(byRepository).sort(([left], [right]) => left.localeCompare(right)));
}
