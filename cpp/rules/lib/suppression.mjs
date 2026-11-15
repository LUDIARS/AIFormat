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

/**
 * 抑制注釈の索引。コンテキスト (ファイルと読み方) ごとに 1 回だけ全行を走査して作り、問い合わせは
 * 同じ行と前の行の注釈と、NOLINTBEGIN / END の二分探索で答える。finding ごとに前の全行を
 * 読み直さないので、行数と finding 数の積にならない (PostToolUse フックの 3 秒に収める)。
 */
function indexOf(ctx) {
  if (ctx.suppressionIndex) return ctx.suppressionIndex;
  const lines = ctx.commentLines;
  const marks = []; // NOLINTBEGIN / END を出現順に: { line (0 始まり), begin, list, text }
  const sameLine = new Map(); // 行 (0 始まり) → NOLINT(...) のリスト
  const nextLine = new Map(); // 行 (0 始まり) → NOLINTNEXTLINE(...) のリスト
  lines.forEach((text, i) => {
    if (!text.includes("NOLINT")) return;
    for (const m of text.matchAll(/\bNOLINT(NEXTLINE|BEGIN|END)?\(([^)]*)\)/g)) {
      if (m[1] === "BEGIN" || m[1] === "END") marks.push({ line: i, begin: m[1] === "BEGIN", list: m[2], text });
      else {
        const map = m[1] === "NEXTLINE" ? nextLine : sameLine;
        if (!map.has(i)) map.set(i, []);
        map.get(i).push(m[2]);
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
