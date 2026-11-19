// synced-from: LUDIARS/Revisor src/praesidium/files.mjs @ b2c86e9
// (写すのは mayHoldObjectiveC とその補助関数だけ)
//
// 小文字の `.m` が Objective-C か (MATLAB・Octave・Mathematica の `.m` ではないか) の判定。
// Revisor の Praesidium (files.mjs の trackedSources) は、C 系の印 (指令 `#` `%:` `??=`、本体の `{` `<%` `??<`、
// `_Pragma` / `__pragma`、`@import`) がどこにも無い小文字の `.m` をソースとして扱わない。規則表も同じ `.m` を
// 読まないように、判定をここに写す。Revisor が変わったらここも直す (cpp-rules.test.mjs が綴りを確かめる)。
// praesidium.json に単位として載っている `.m` は印が無くても Praesidium が読むが、規則表は praesidium.json を読まないので
// その `.m` は読まない (印の無い Objective-C の単位は、検査する本体を持たない)。

/** 判定が要るのは小文字の `.m` だけ (`.M` は clang / GCC で常に Objective-C++)。 */
export const AMBIGUOUS_SOURCE = /\.m$/;
const LINE_SPLICE = /(?:\\|\?\?\/)[ \t\f\v]*(?:\r\n|\n\r|\r|\n)/g;
const C_FAMILY_DIRECTIVE = /#|<%|%:|\?\?[=<]|\b(?:_Pragma|__pragma)\b/;
const OPEN_BRACE = 0x7b;
const AT_SIGN = 0x40;
const SPLICE_SPACE = new Set([0x20, 0x09, 0x0b, 0x0c]);

/** ファイルの中身 (Buffer) に C 系の印があるか。 */
export function mayHoldObjectiveC(bytes) {
  const text = bytes.toString("latin1").replace(LINE_SPLICE, "");
  if (C_FAMILY_DIRECTIVE.test(text) || hasTokenByte(bytes, OPEN_BRACE)) return true;
  // `@import` may be split by a comment, so `@` and `import` count anywhere.
  return /\bimport\b/.test(text) && hasTokenByte(bytes, AT_SIGN);
}

function hasTokenByte(bytes, byte) {
  for (let at = bytes.indexOf(byte); at !== -1; at = bytes.indexOf(byte, at + 1)) {
    if (mayBeToken(bytes, at)) return true;
  }
  return false;
}

// Non-ASCII bytes that are not well-formed UTF-8 cannot stand outside a comment or a
// literal, so a `{` or `@` right after such bytes is no token (Shift_JIS, GBK, Big5).
// GCC decodes UTF-8 across a line splice, so bytes right after one may continue a character.
function mayBeToken(bytes, at) {
  let start = at;
  while (start > 0 && bytes[start - 1] >= 0x80) start -= 1;
  return start === at || followsLineSplice(bytes, start) || looseUtf8(bytes, start, at);
}

function followsLineSplice(bytes, end) {
  let at = end;
  if (bytes[at - 1] === 0x0a) at -= bytes[at - 2] === 0x0d ? 2 : 1;
  else if (bytes[at - 1] === 0x0d) at -= 1;
  else return false;
  while (SPLICE_SPACE.has(bytes[at - 1])) at -= 1;
  return bytes[at - 1] === 0x5c || (bytes[at - 1] === 0x2f && bytes[at - 2] === 0x3f && bytes[at - 3] === 0x3f);
}

// Lead and continuation bytes only; overlong and out-of-range forms pass, which counts
// more bytes as UTF-8 and so keeps more files (fail closed).
function looseUtf8(bytes, start, end) {
  for (let at = start; at < end;) {
    const lead = bytes[at];
    const length = lead >= 0xf8 ? 0 : lead >= 0xf0 ? 4 : lead >= 0xe0 ? 3 : lead >= 0xc0 ? 2 : 0;
    if (length === 0 || at + length > end) return false;
    for (let next = at + 1; next < at + length; next += 1) if (bytes[next] > 0xbf) return false;
    at += length;
  }
  return true;
}
