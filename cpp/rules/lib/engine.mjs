/** RULE_CODE_CPP §C9.5 規則表の実行: 規則をファイル 1 本と変更集合に掛け、finding (抜粋なし) を作る。 */

import { maskCommentsAndLiterals } from "./mask.mjs";
import { CXX_READINGS, nativeReadings, nativeViews } from "./native-mask.mjs";
import { GLOBAL_EXCLUDE, languageOf, normalizePath, PATHS } from "./paths.mjs";
import { isSuppressed } from "./suppression.mjs";
import { lineIndex } from "./syntax.mjs";

export const MAX_FINDINGS_PER_FILE = 200;

function makeContext(fields) {
  return {
    ...fields,
    maskedLines: fields.masked.split("\n"),
    commentLines: fields.comments.split("\n"),
  };
}

/**
 * 規則を掛けるコンテキストの一覧。CMake・シェーダ・JSON は 1 つ。C/C++ は字句規則の読み方 (C17 / C23 / C++) ごとに
 * 1 つずつ作り、呼び出し側が finding を合算する (native-mask.mjs の nativeReadings。どの読み方で掛けるかは contextsFor)。
 * masked = コメントとリテラルの中身を空白にしたもの、logical = プリプロセッサの論理行の形、
 * comments = リテラルの中身だけを空白にしたもの。どれも原文と同じ位置に改行があるので、行は lineAt で数える。
 * cxx = C++ の読み方 (raw 文字列と桁区切りがある)。
 */
export function scanContexts(file, source, lang, config) {
  if (lang !== "cpp") {
    const masked = maskCommentsAndLiterals(source, { language: lang });
    const comments = maskCommentsAndLiterals(source, { language: lang, keepComments: true });
    return [makeContext({ file, source, lang, config, masked, logical: masked, comments, lineAt: lineIndex(masked) })];
  }
  const lineAt = lineIndex(source);
  return nativeReadings(file, source).map((reading) => {
    const views = nativeViews(source, reading);
    return makeContext({
      file, source, lang, config, reading: reading.name, cxx: CXX_READINGS.includes(reading),
      masked: views.code, logical: views.logical, comments: views.comments, lineAt,
    });
  });
}

/**
 * 規則を掛けるコンテキスト。C にも当てはまる規則 (`files` が PATHS.native: 禁止 API・実行時ロード・抑制) は、
 * どの読み方でもコードを隠せないように全部の読み方で照合する (Praesidium の字句規則と同じ)。それ以外は C++ の規則
 * (C++ のソース・ヘッダの規則) なので、C++ の読み方があればそれだけで照合する。C の読み方は C++ の raw 文字列の
 * 中身をコードと読み、桁区切りの `'` から行末までを文字リテラルと読むので、C++ の規則に掛けると誤検出と
 * 抑制注釈の見落としになる。C++ の読み方の無いファイル (.c / .m) は、そのファイルの読み方の全部で照合する。
 */
export function contextsFor(rule, contexts) {
  if (rule.files === PATHS.native) return contexts;
  const cxx = contexts.filter((ctx) => ctx.cxx);
  return cxx.length ? cxx : contexts;
}

export function ruleEnabled(rule, config) {
  if (config.disable.has(rule.id) || config.disable.has(rule.name)) return false;
  return !rule.when || rule.when(config);
}

export function ruleApplies(rule, file, config) {
  if (!rule.files.test(file)) return false;
  if (rule.exclude && rule.exclude.test(file)) return false;
  if (rule.skip && rule.skip(file, config)) return false;
  return true;
}

/** pattern の一致を前から順に返す ({ line })。一致は原文の順に出るので、行は減らない (scanSource の打ち切りが使う)。 */
export function* patternHits(rule, ctx) {
  const text = rule.mask === "none" ? ctx.source : rule.mask === "comments" ? ctx.comments : rule.mask === "logical" ? ctx.logical : ctx.masked;
  const flags = new Set(rule.pattern.flags);
  flags.add("g");
  flags.add("d");
  const re = new RegExp(rule.pattern.source, [...flags].join(""));
  for (const m of text.matchAll(re)) {
    if (rule.filter && !rule.filter(m, ctx)) continue;
    const at = m.indices?.groups?.at?.[0] ?? m.index;
    yield { line: ctx.lineAt(at) };
  }
}

export function toAddedSet(addedLines) {
  if (addedLines === null || addedLines === undefined) return null;
  return addedLines instanceof Set ? addedLines : new Set(addedLines);
}

/**
 * 1 ファイルに単一ファイルの規則 (scope が added-lines / file) を掛ける。
 *
 * @param {object[]} rules 規則表
 * @param {string} file リポ相対パス
 * @param {string} source ファイル全体の内容
 * @param {{ addedLines?: Iterable<number>|null, config: object }} options
 *   addedLines: 追加行の行番号 (1 始まり)。null / 省略はファイル全体を追加行とみなす (新規ファイル・Write)。
 *   空なら (削除だけの変更) 何も報告しない。config: parseRepoConfig の結果。
 * @returns {{id: string, rule: string, file: string, line: number, severity: string, message: string}[]}
 */
export function scanSource(rules, file, source, { addedLines = null, config }) {
  const rel = normalizePath(file);
  if (GLOBAL_EXCLUDE.test(rel)) return [];
  const lang = languageOf(rel);
  if (!lang) return [];
  const added = toAddedSet(addedLines);
  if (added && added.size === 0) return [];
  const contexts = scanContexts(rel, String(source), lang, config);
  const findings = [];
  for (const rule of rules) {
    if (rule.scope === "changeset" || !ruleEnabled(rule, config) || !ruleApplies(rule, rel, config)) continue;
    // finding は規則と行の組で 1 件。読み方ごとに判定し、どれか 1 つの読み方で抑制されていなければ報告する。
    // 抑制の判定は読み方・規則・行の組ごとに 1 回だけ (1 行に一致が並んでも行の数に比例する)。
    const reported = new Set();
    const check = `cpp-rules-${rule.id}`;
    for (const ctx of contextsFor(rule, contexts)) {
      const judged = new Set();
      let shown = 0; // この読み方で見た、報告する行の数
      for (const hit of rule.check ? rule.check(ctx) : patternHits(rule, ctx)) {
        if (judged.has(hit.line)) continue;
        if (rule.scope === "added-lines" && added && !(hit.anyOf ?? [hit.line]).some((l) => added.has(l))) continue;
        judged.add(hit.line);
        if (!reported.has(hit.line)) {
          if (rule.suppressible !== false && isSuppressed(ctx, hit.line, check)) continue;
          reported.add(hit.line);
        }
        // pattern の一致は行の順に出る。この読み方で報告する行が上限を超えたら、以降の行の finding は下の打ち切りで
        // 必ず捨てられる (この規則だけで、それ以前の行に上限を超える finding がある) ので、一致を読み進めない。
        if (!rule.check && ++shown > MAX_FINDINGS_PER_FILE) break;
      }
    }
    for (const line of reported) {
      findings.push({ id: rule.id, rule: rule.name, file: rel, line, severity: rule.severity, message: rule.message });
    }
  }
  findings.sort((a, b) => a.line - b.line || a.id.localeCompare(b.id, "en", { numeric: true }));
  if (findings.length > MAX_FINDINGS_PER_FILE) {
    // 打ち切っても pass にはしない (Revisor の finding-limit と同じ)。
    const kept = findings.slice(0, MAX_FINDINGS_PER_FILE);
    kept.push({ id: "C9.5", rule: "finding-limit", file: rel, line: kept.at(-1).line, severity: "error", message: `finding が ${MAX_FINDINGS_PER_FILE} 件を超えたので以降を省略した` });
    return kept;
  }
  return findings;
}

/**
 * 変更集合に、単一ファイルの規則と変更集合の規則 (scope: changeset) を掛ける。
 *
 * @param {object[]} rules 規則表
 * @param {{file: string, source: string, addedLines?: Iterable<number>|null}[]} changes
 * @param {{ config: object, repoFiles?: string[] }} options repoFiles: リポの追跡ファイル一覧 (§C3.8 の既存ハーネス判定)
 */
export function scanChangeset(rules, changes, { config, repoFiles = [] }) {
  const normalized = [];
  for (const c of changes) {
    const file = normalizePath(c.file);
    if (GLOBAL_EXCLUDE.test(file)) continue;
    const lang = languageOf(file);
    if (!lang) continue;
    const addedLines = toAddedSet(c.addedLines);
    if (addedLines && addedLines.size === 0) continue;
    normalized.push({ file, source: String(c.source), lang, addedLines });
  }
  const findings = normalized.flatMap((c) => scanSource(rules, c.file, c.source, { addedLines: c.addedLines, config }));
  const cs = { changes: normalized, config, repoFiles: repoFiles.map(normalizePath) };
  for (const rule of rules) {
    if (rule.scope !== "changeset" || !ruleEnabled(rule, config)) continue;
    for (const hit of rule.check(cs)) {
      if (!ruleApplies(rule, hit.file, config)) continue;
      findings.push({ id: rule.id, rule: rule.name, file: hit.file, line: hit.line, severity: rule.severity, message: rule.message });
    }
  }
  return findings;
}
