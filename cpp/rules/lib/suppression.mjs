/** RULE_CODE_CPP §C9.4 の形式の抑制注釈 (NOLINT / NOLINTNEXTLINE / NOLINTBEGIN・END) の解決。 */

const compiledLists = new Map();

/** `a, b*` の check 名リスト (glob) を項目の配列にする。同じ文字列は 1 回だけ分ける。 */
function compileList(list) {
  let compiled = compiledLists.get(list);
  if (!compiled) {
    compiled = list.split(",").map((s) => s.trim()).filter(Boolean);
    if (compiledLists.size > 4096) compiledLists.clear();
    compiledLists.set(list, compiled);
  }
  return compiled;
}

/**
 * `*` だけを特別な文字とする glob (`*` は任意の長さの文字列) が文字列全体に一致するか。
 * 正規表現 (`*` → `.*`) にすると `*` の並びで後戻りが指数的に増える (`**********x` で数十秒)。
 * ここでは最後に読んだ `*` にだけ戻るので、glob と文字列の長さの積に比例する時間で済む。
 */
function globMatches(glob, text) {
  let g = 0;
  let t = 0;
  let star = -1; // 最後に読んだ `*` の位置
  let resume = 0; // その `*` が飲み込んだ文字列の終わり
  while (t < text.length) {
    if (g < glob.length && glob[g] === "*") {
      star = g++;
      resume = t;
    } else if (g < glob.length && glob[g] === text[t]) {
      g++;
      t++;
    } else if (star >= 0) {
      g = star + 1;
      t = ++resume;
    } else {
      return false;
    }
  }
  while (g < glob.length && glob[g] === "*") g++;
  return g === glob.length;
}

export function checkListMatches(list, check) {
  return compileList(list).some((item) => globMatches(item, check));
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
