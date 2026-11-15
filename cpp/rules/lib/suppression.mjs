/** RULE_CODE_CPP §C9.4 の形式の抑制注釈 (NOLINT / NOLINTNEXTLINE / NOLINTBEGIN・END) の解決。 */

import { escapeRegExp } from "./syntax.mjs";

const compiledLists = new Map();

/** `a, b*` の check 名リスト (glob) を正規表現の配列にする。同じ文字列は 1 回だけ組み立てる。 */
function compileList(list) {
  let compiled = compiledLists.get(list);
  if (!compiled) {
    compiled = list.split(",").map((s) => s.trim()).filter(Boolean)
      .map((item) => new RegExp(`^${item.split("*").map(escapeRegExp).join(".*")}$`));
    if (compiledLists.size > 4096) compiledLists.clear();
    compiledLists.set(list, compiled);
  }
  return compiled;
}

export function checkListMatches(list, check) {
  return compileList(list).some((re) => re.test(check));
}

const NOLINT = "NOLINT";
const NOLINT_KINDS = ["NEXTLINE", "BEGIN", "END"];
const WORD_CHAR = /\w/;

/**
 * 1 行の抑制注釈 `NOLINT[NEXTLINE|BEGIN|END](<list>)` を前から順に返す ({ kind, list })。
 * 正規表現 `/\bNOLINT(NEXTLINE|BEGIN|END)?\(([^)]*)\)/g` と同じものを取り出すが、後戻りしない:
 * 閉じの `)` は indexOf で前へ 1 回だけ探し、無ければその行に注釈はもう無い (後の `NOLINT(` も閉じられない)。
 * どの文字も一定回数しか読まないので行の長さに比例する (`NOLINT(` が閉じずに並ぶ長い行でも 2 乗にならない)。
 */
export function* nolintMarks(text) {
  let from = 0;
  for (;;) {
    const at = text.indexOf(NOLINT, from);
    if (at < 0) return;
    from = at + 1;
    if (at > 0 && WORD_CHAR.test(text[at - 1])) continue; // \b
    let open = at + NOLINT.length;
    const kind = NOLINT_KINDS.find((k) => text.startsWith(`${k}(`, open)) ?? "";
    open += kind.length;
    if (text[open] !== "(") continue;
    const close = text.indexOf(")", open + 1);
    if (close < 0) return;
    yield { kind, list: text.slice(open + 1, close) };
    from = close + 1;
  }
}

/**
 * 抑制注釈の索引。コンテキスト (ファイルと読み方) ごとに 1 回だけ全行を走査して作り、問い合わせは
 * 同じ行と前の行の注釈と、NOLINTBEGIN / END の二分探索で答える。finding ごとに前の全行を
 * 読み直さず、注釈の取り出しも後戻りしない (nolintMarks) ので、全体が入力の長さに比例する
 * (PostToolUse フックの 3 秒に収める)。
 */
function indexOf(ctx) {
  if (ctx.suppressionIndex) return ctx.suppressionIndex;
  const lines = ctx.commentLines;
  const marks = []; // NOLINTBEGIN / END を出現順に: { line (0 始まり), begin, list, text }
  const sameLine = new Map(); // 行 (0 始まり) → NOLINT(...) のリスト
  const nextLine = new Map(); // 行 (0 始まり) → NOLINTNEXTLINE(...) のリスト
  lines.forEach((text, i) => {
    if (!text.includes(NOLINT)) return;
    for (const { kind, list } of nolintMarks(text)) {
      if (kind === "BEGIN" || kind === "END") marks.push({ line: i, begin: kind === "BEGIN", list, text });
      else {
        const map = kind === "NEXTLINE" ? nextLine : sameLine;
        if (!map.has(i)) map.set(i, []);
        map.get(i).push(list);
      }
    }
  });
  const byCheck = new Map();
  ctx.suppressionIndex = {
    lines, sameLine, nextLine,
    /** check に一致する BEGIN / END だけを出現順に並べたもの (check ごとに 1 回だけ作る)。 */
    marksFor(check) {
      let list = byCheck.get(check);
      if (!list) {
        list = marks.filter((mark) => checkListMatches(mark.list, check));
        byCheck.set(check, list);
      }
      return list;
    },
  };
  return ctx.suppressionIndex;
}

/**
 * 規則表の finding の抑制は `// NOLINT(cpp-rules-<id>): <理由> (§<id>)` (同形式の NEXTLINE・BEGIN/END)。
 * 戻り値は抑制に使われた注釈の行テキスト (無ければ null)。注釈そのものの形式は §C9.4 の規則が検査する。
 * NOLINTBEGIN / END は、`line` より前にある check に一致する最後の注釈が BEGIN なら範囲の中とみなす。
 */
export function suppressionFor(ctx, line, check) {
  const index = indexOf(ctx);
  const same = index.sameLine.get(line - 1);
  if (same && same.some((list) => checkListMatches(list, check))) return index.lines[line - 1];
  const prev = index.nextLine.get(line - 2);
  if (prev && prev.some((list) => checkListMatches(list, check))) return index.lines[line - 2];
  const marks = index.marksFor(check);
  let lo = 0, hi = marks.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (marks[mid].line < line - 1) lo = mid + 1; else hi = mid;
  }
  const last = lo > 0 ? marks[lo - 1] : null;
  return last && last.begin ? last.text : null;
}

export const isSuppressed = (ctx, line, check) => suppressionFor(ctx, line, check) !== null;
