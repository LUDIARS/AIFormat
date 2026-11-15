/**
 * RULE_CODE_CPP §C9.5 規則表: C/C++ の字句処理。
 *
 * コメントとリテラルの境界は Revisor の同期コピー (`native-lexer.mjs` / `languages.mjs`) で、
 * Praesidium と同じくコンパイラと同じ位置に引く。このファイルは、その出力から規則表が読む 3 つの
 * ビューを作るだけで、字句規則を持たない (直したい規則は Revisor へ PR を出す)。
 *
 * - logical: プリプロセッサが見る形 (native-lexer の logical 出力)。コメントとリテラルの中身を空白にし、
 *   行継続とブロックコメント内の改行を空白に畳み、ダイグラフを正規化する (`%:pragma` も `#pragma`)。
 *   抑制 pragma や禁止 API の呼び出しのように、行継続やコメントを挟んで書かれうるものを照合する規則が使う。
 * - code: logical の改行を原文の位置に戻したもの (行ごとに読む規則のため)。`#include` / `#include_next` /
 *   `#import` の header-name だけは原文に戻す (include 先を見る規則のため。中身はトークンにならない)。
 * - comments: 原文からリテラルの中身だけを空白にし、コメントを残したもの (NOLINT などの注釈を読む規則のため)。
 *
 * どのビューも原文と同じ長さなので、オフセットから行番号を引ける。logical では行継続とコメント内の改行が
 * 空白になるので、行は原文の \n で数える (`lineAt`)。字句解析は読み方ごとに 1 回だけ走らせる。
 */

import { nativeLanguage } from "./languages.mjs";
import { maskNativeCode } from "./native-lexer.mjs";

/** C17 と C23 の字句規則 (raw 文字列と import が無い。桁区切りは C23 だけ)。Revisor rules.mjs の C_LEXING と同じ。 */
export const C_READINGS = Object.freeze([
  Object.freeze({ name: "c17", rawStrings: false, digitSeparators: false, moduleImports: false }),
  Object.freeze({ name: "c23", rawStrings: false, digitSeparators: true, moduleImports: false }),
]);
/** C++ の字句規則。Revisor rules.mjs の CXX_LEXING と同じ。 */
export const CXX_READINGS = Object.freeze([
  Object.freeze({ name: "c++", rawStrings: true, digitSeparators: true, moduleImports: true }),
]);

/**
 * ファイルを読む字句規則の一覧。`.c` / `.m` は C、ヘッダと `.C` / `.M` (どちらの言語にもなる) は
 * C と C++ の全部、それ以外は C++ (Revisor の nativeLexing と同じ)。規則は各読み方で掛け、
 * finding を合算する (どの読み方でもコードを隠せないようにするため)。
 * C17 と C23 が違うのは `'` の読み方だけなので、`'` の無いソースは C17 だけで読む。
 */
export function nativeReadings(file, source) {
  const row = nativeLanguage(file);
  let readings;
  if (!row) readings = CXX_READINGS;
  else if (row.language === "header" || row.either) readings = [...C_READINGS, ...CXX_READINGS];
  else readings = row.language === "c" || row.language === "objective-c" ? C_READINGS : CXX_READINGS;
  if (!source.includes("'")) readings = readings.filter((r) => r.rawStrings || !r.digitSeparators);
  return readings;
}

/** 1 つの読み方で作る 3 つのビュー (先頭のコメント参照)。 */
export function nativeViews(source, reading) {
  const logical = maskNativeCode(source, {
    rawStrings: reading.rawStrings, digitSeparators: reading.digitSeparators, moduleImports: reading.moduleImports, logical: true,
  });
  return {
    logical,
    code: restoreHeaderNames(source, restoreLineBreaks(source, logical)),
    comments: blankLiteralsOnly(source, logical, reading),
  };
}

/** logical で空白に畳まれた改行 (\n と \r) を原文の位置に戻す。 */
function restoreLineBreaks(source, logical) {
  const parts = [];
  let last = 0;
  for (let at = 0; at < source.length; at++) {
    const ch = source[at];
    if ((ch === "\n" || ch === "\r") && logical[at] !== ch) {
      parts.push(logical.slice(last, at), ch);
      last = at + 1;
    }
  }
  if (!parts.length) return logical;
  parts.push(logical.slice(last));
  return parts.join("");
}

const HEADER_DIRECTIVE = /^[ \t\f\v]*#[ \t\f\v]*(?:include|include_next|import)[ \t\f\v]*([<"])/gm;

/** `#include <x>` / `#include "x"` の header-name を原文に戻す。改行か閉じ記号までで止まるので線形。 */
function restoreHeaderNames(source, masked) {
  const parts = [];
  let last = 0;
  for (const m of masked.matchAll(HEADER_DIRECTIVE)) {
    const open = m.index + m[0].length - 1;
    const close = m[1] === "<" ? ">" : "\"";
    let end = open + 1;
    while (end < masked.length && masked[end] === " ") end++;
    if (end < masked.length && masked[end] !== close && masked[end] !== "\n" && masked[end] !== "\r") continue;
    parts.push(masked.slice(last, open + 1), source.slice(open + 1, end));
    last = end;
  }
  if (!parts.length) return masked;
  parts.push(masked.slice(last));
  return parts.join("");
}

const RAW_PREFIXES = new Set(["R", "LR", "uR", "UR", "u8R"]);
const IDENTIFIER_CHAR = /[A-Za-z0-9_$\u0080-\uffff]/;
const RAW_DELIMITER = /[^\s()\\]{0,16}\(/y;
const SPLICE_CHAR = /[\\ \t\v\f\r\n]/;
const SPLICES = /^(?:\\[ \t\v\f]*(?:\r\n|\n\r|\n|\r))+$/;
const isLineBreak = (ch) => ch === "\n" || ch === "\r";

/**
 * 原文からリテラルの中身だけを空白にしたビュー。`logical` (native-lexer の出力) ではリテラルの中身と
 * コメントがどちらも空白で、リテラルの引用符だけが見えている。引用符を前から順に開き・閉じとして
 * 対にし、その間だけを空白にする (コメントと header-name・#error の文は原文のまま残る)。
 * logical では行継続も空白に畳まれているので、通常のリテラルは開いた後で最初に見える同じ引用符で閉じ、
 * 改行に出会えば閉じないまま終わっている。raw 文字列だけは中身の改行が残り、閉じの `)delim"` まで続く。
 * 1 回の走査で線形。
 */
function blankLiteralsOnly(source, logical, { rawStrings }) {
  const n = source.length;
  const parts = [];
  let last = 0;
  const blankRange = (from, to) => {
    if (to <= from) return;
    parts.push(source.slice(last, from), source.slice(from, to).replace(/[^\r\n]/g, " "));
    last = to;
  };
  // open の次から空白を飛ばした位置。
  const afterBlanks = (open) => {
    let k = open + 1;
    while (k < n && logical[k] === " ") k++;
    return k;
  };
  // raw 文字列なら閉じの引用符の位置、そうでなければ -1。lexer は区切りが正しく `)delim"` が後にあるときだけ
  // raw として扱い、中身を改行以外すべて空白にするので、次に見える文字が閉じの引用符になる。
  const rawEnd = (open) => {
    if (!rawStrings) return -1;
    // 接頭辞と引用符の間の行継続 (lexer は読み飛ばす。logical では空白)
    let prefixEnd = open;
    while (prefixEnd > 0 && logical[prefixEnd - 1] === " " && SPLICE_CHAR.test(source[prefixEnd - 1])) prefixEnd--;
    if (prefixEnd < open && !SPLICES.test(source.slice(prefixEnd, open))) prefixEnd = open;
    if (logical[prefixEnd - 1] !== "R") return -1;
    let start = prefixEnd;
    while (start > 0 && IDENTIFIER_CHAR.test(logical[start - 1])) start--;
    if (!RAW_PREFIXES.has(logical.slice(start, prefixEnd))) return -1;
    RAW_DELIMITER.lastIndex = open + 1;
    if (!RAW_DELIMITER.test(source)) return -1;
    const delimiter = source.slice(open + 1, RAW_DELIMITER.lastIndex - 1);
    let k = RAW_DELIMITER.lastIndex;
    while (k < n && (logical[k] === " " || isLineBreak(logical[k]))) k++;
    return logical[k] === "\"" && source.slice(k - delimiter.length - 1, k) === `)${delimiter}` ? k : -1;
  };

  let i = 0;
  while (i < n) {
    const ch = logical[i];
    if (ch !== "\"" && ch !== "'") { i++; continue; }
    const close = ch === "\"" ? rawEnd(i) : -1;
    if (close >= 0) {
      blankRange(i + 1, close);
      i = close + 1;
      continue;
    }
    const end = afterBlanks(i);
    if (logical[end] === ch) {
      blankRange(i + 1, end);
      i = end + 1;
    } else if (end >= n || isLineBreak(logical[end])) {
      blankRange(i + 1, end); // 閉じないリテラルは行末まで
      i = end;
    } else {
      i++; // 桁区切りの ' (1'000) は見える文字が続く
    }
  }
  if (!parts.length) return source;
  parts.push(source.slice(last));
  return parts.join("");
}
