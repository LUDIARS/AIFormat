/** RULE_CODE_CPP §C9.5 規則表: C/C++ ソース 1 本に掛ける、pattern で書けない検査。各関数は ctx を受けて { line, anyOf? }[] を返す。 */

import { OS_MACRO } from "./paths.mjs";
import { suppressionFor } from "./suppression.mjs";
import {
  classBodies, escapeRegExp, inExpressionPosition, matchAngle, matchClose, splitTopLevel,
} from "./syntax.mjs";

export const CALLABLE_PARAM = /^(?:Fn|F|Func|Function|Callback|Visitor|Pred|Predicate|Handler|Callable)\d*$/;

/** §C1.1: 呼び出す型引数 / 転送パックを持つ関数テンプレートに requires が無い。 */
export function checkUnconstrainedTemplate(ctx) {
  const text = ctx.masked;
  const hits = [];
  for (const m of text.matchAll(/\btemplate\s*</g)) {
    const open = m.index + m[0].length - 1;
    const close = matchAngle(text, open);
    if (close < 0) continue;
    const callables = [], packs = [];
    for (const param of splitTopLevel(text.slice(open + 1, close), ",", { angles: true })) {
      const p = param.trim();
      if (/^template\b/.test(p)) continue; // テンプレートテンプレート引数
      const hit = /^(?:typename|class)\s*(\.\.\.)?\s*([A-Za-z_]\w*)/.exec(p);
      if (!hit) continue; // concept で制約済み (`std::invocable F` 等) か非型引数
      if (hit[1]) packs.push(hit[2]);
      else if (CALLABLE_PARAM.test(hit[2])) callables.push(hit[2]);
    }
    if (!callables.length && !packs.length) continue;
    const after = text.slice(close + 1);
    if (/^\s*(?:concept|class|struct|union|using|friend\s+(?:class|struct))\b/.test(after)) continue;
    let end = close + 1, paren = 0;
    for (; end < text.length; end++) {
      const c = text[end];
      if (c === "(") paren++;
      else if (c === ")") paren--;
      else if ((c === "{" || c === ";") && paren === 0) break;
    }
    const decl = text.slice(close + 1, end);
    if (/\brequires\b/.test(decl)) continue;
    const forwarding = packs.some((p) => new RegExp(`\\b${escapeRegExp(p)}\\s*&&\\s*\\.\\.\\.`).test(decl));
    if (!callables.length && !forwarding) continue;
    const first = ctx.lineAt(m.index), last = ctx.lineAt(end);
    hits.push({ line: first, anyOf: range(first, last) });
  }
  return hits;
}

export function range(a, b) {
  const out = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
}

/** §C1.5: `I<Name>` の本体に非 static データメンバ。 */
export function checkInterfaceDataMember(ctx) {
  const hits = [];
  for (const cls of classBodies(ctx)) {
    if (!/^I[A-Z]\w*$/.test(cls.name)) continue;
    for (const member of cls.members) if (member.isData) hits.push({ line: member.line });
  }
  return hits;
}

/** §C2.4: vkCmdPushConstants / memcpy(mapped...) に渡す、このファイルで定義した型にレイアウト検査が無い。 */
export function checkGpuStructLayout(ctx) {
  const text = ctx.masked;
  const hits = [];
  for (const m of text.matchAll(/\b(?:vkCmdPushConstants\s*(?=\()|memcpy\s*(?=\(\s*mapped))/g)) {
    const open = m.index + m[0].length;
    const close = matchClose(text, open);
    if (close < 0) continue;
    for (const s of text.slice(open + 1, close).matchAll(/\bsizeof\s*\(\s*([A-Za-z_]\w*)\s*\)/g)) {
      let type = s[1];
      const definedHere = (t) => new RegExp(`\\b(?:struct|class)\\s+${escapeRegExp(t)}\\b\\s*(?:final\\s*)?(?::[^;{]*)?\\{`).test(text);
      if (!definedHere(type)) {
        const decl = new RegExp(`\\b([A-Za-z_][\\w:]*)\\s+${escapeRegExp(type)}\\s*[;{=(]`).exec(text);
        if (!decl) continue;
        type = decl[1].split("::").pop();
        if (!definedHere(type)) continue; // ヘッダ側の型は §C2.12 の reflection CTest が見る
      }
      const t = escapeRegExp(type);
      const sized = new RegExp(`static_assert\\s*\\(\\s*sizeof\\s*\\(\\s*${t}\\s*\\)`).test(text);
      const offsets = new RegExp(`offsetof\\s*\\(\\s*${t}\\s*,`).test(text);
      if (!sized || !offsets) hits.push({ line: ctx.lineAt(m.index) });
    }
  }
  return hits;
}

/** §C2.5: 許可の注釈 `NOLINT(cppcoreguidelines-pro-type-reinterpret-cast): <理由> (§C2.5)` の無い reinterpret_cast。 */
export function checkReinterpretCast(ctx) {
  const hits = [];
  for (const m of ctx.masked.matchAll(/\breinterpret_cast\s*</g)) {
    const line = ctx.lineAt(m.index);
    const note = suppressionFor(ctx, line, "cppcoreguidelines-pro-type-reinterpret-cast");
    if (note && /\(§C2\.5\)/.test(note)) continue;
    hits.push({ line });
  }
  return hits;
}

export const PRIM_TYPE = String.raw`(?:(?:const|volatile)\s+)*(?:(?:unsigned|signed)\s+)?(?:(?:std::)?(?:u?int(?:8|16|32|64)_t|u?int_(?:fast|least)(?:8|16|32|64)_t|size_t|ptrdiff_t|u?intptr_t)|long\s+long|long\s+double|int|long|short|char|char8_t|char16_t|char32_t|wchar_t|float|double|bool|unsigned|signed)`;
export const PRIM_CAST = new RegExp(String.raw`\(\s*${PRIM_TYPE}(?:\s*\*+)?\s*\)\s*(?=[\w(~!+\-&*]|::)`, "g");
export const POINTER_CAST = new RegExp(String.raw`\(\s*(?:(?:const|volatile)\s+)*(?:struct\s+)?[A-Za-z_][\w:]*(?:\s*<[^()<>;]*(?:<[^()<>;]*>[^()<>;]*)*>)?(?:\s+const)?\s*[*&]+\s*(?:const\s*)?\)\s*(?=[\w(]|::)`, "g");
export const FUNCTIONAL_CAST = /\b(?:(?:std::)?(?:u?int(?:8|16|32|64)_t|size_t|ptrdiff_t|u?intptr_t)|int|long|short|char|float|double|bool|unsigned)\s*(?=\()/g;
export const TYPE_WORD = /^(?:const|volatile|void|unsigned|signed|struct|class|typename|auto|int|long|short|char|float|double|bool|wchar_t|char8_t|char16_t|char32_t|(?:std::)?(?:u?int(?:8|16|32|64)_t|size_t))\b/;

/** §C2.6: C スタイルキャスト `(int)x` / `(Foo*)p`。 */
export function checkCStyleCast(ctx) {
  const text = ctx.masked;
  const seen = new Set();
  const hits = [];
  for (const re of [PRIM_CAST, POINTER_CAST]) {
    for (const m of text.matchAll(re)) {
      if (seen.has(m.index) || !inExpressionPosition(text, m.index)) continue;
      seen.add(m.index);
      hits.push({ line: ctx.lineAt(m.index) });
    }
  }
  return hits;
}

/** §C2.6: 関数形式キャスト `int(x)`。 */
export function checkFunctionalCast(ctx) {
  const text = ctx.masked;
  const hits = [];
  for (const m of text.matchAll(FUNCTIONAL_CAST)) {
    if (!inExpressionPosition(text, m.index)) continue;
    const open = m.index + m[0].length;
    const close = matchClose(text, open);
    if (close < 0) continue;
    const inner = text.slice(open + 1, close).trim();
    if (!inner || /^(?:[*&]|\.\.\.)/.test(inner) || TYPE_WORD.test(inner)) continue;
    if (/^[A-Za-z_][\w:]*(?:<.*>)?\s*[*&]*\s+[A-Za-z_]\w*\s*(?:,|=|$)/.test(inner)) continue; // 関数型の引数宣言
    hits.push({ line: ctx.lineAt(m.index) });
  }
  return hits;
}

/** §C4.9: 1 つのソースにプラットフォーム条件の #if が 3 箇所以上。 */
export function checkPlatformIfCount(ctx) {
  const lines = [];
  const re = new RegExp(String.raw`^[ \t]*#[ \t]*(?:if|ifdef|ifndef)\b[^\n]*\b${OS_MACRO}\b`, "gm");
  for (const m of ctx.masked.matchAll(re)) lines.push(ctx.lineAt(m.index));
  return lines.length >= 3 ? [{ line: lines[2], anyOf: lines }] : [];
}

/**
 * §C6.4: `.release()` の戻り値を受け取っているか (= 所有権を取り出している)。
 * `video.release();` のような戻り値を捨てる呼び出し (OpenCV 等の解放 API) と、
 * 文字列引数が空白化されて `release(   )` に見えるものは除く。
 */
export function releaseResultUsed(m, ctx) {
  if (!/\(\s*\)$/.test(ctx.source.slice(m.index, m.index + m[0].length))) return false;
  const text = ctx.masked;
  let k = m.index - 1;
  while (k >= 0 && /[\w.\[\]>:-]/.test(text[k])) k--; // オブジェクト式 (a.b->c[i]) を遡る
  while (k >= 0 && /\s/.test(text[k])) k--;
  if (k < 0) return false;
  if (/[=(,{?:]/.test(text[k])) return text[k] !== "{" || /=\s*\{?\s*$/.test(text.slice(Math.max(0, k - 8), k + 1));
  return /\breturn$/.test(text.slice(Math.max(0, k - 6), k + 1));
}

/** §C6.5: string_view / span をメンバに持つ型の名前が `*View` で終わらない。 */
export function checkViewMember(ctx) {
  const hits = [];
  for (const cls of classBodies(ctx)) {
    if (/View$/.test(cls.name)) continue;
    for (const member of cls.members) {
      if (!member.isData) continue;
      if (/^(?:(?:mutable|const)\s+)*(?:std::)?(?:basic_string_view\b|w?string_view\b|u(?:8|16|32)string_view\b|span\s*<)/.test(member.text)) {
        hits.push({ line: member.line });
      }
    }
  }
  return hits;
}

export const THREAD_MEMBER = /\bstd::(?:thread|jthread|mutex|shared_mutex|recursive_mutex|timed_mutex|recursive_timed_mutex|condition_variable(?:_any)?|atomic(?:_flag)?)\b|\b\w+::Mutex\b/;

/** §C6.6: スレッド系メンバを持つヘッダに `Thread-safety:` 行が無い。 */
export function checkThreadSafetyNote(ctx) {
  if (/\bThread-safety\s*:/.test(ctx.comments)) return [];
  for (const cls of classBodies(ctx)) {
    const member = cls.members.find((mb) => mb.isData && THREAD_MEMBER.test(mb.text));
    if (member) return [{ line: member.line }];
  }
  return [];
}

/** §C6.7: マーカー `// <PREFIX>_ALLOW_GLOBAL: <理由>` の無い `static T& instance()`。 */
export function checkSingleton(ctx) {
  const marker = new RegExp(`\\b${ctx.config.prefix ? escapeRegExp(ctx.config.prefix) : "[A-Z][A-Z0-9]*"}_ALLOW_GLOBAL:\\s*\\S`);
  const hits = [];
  for (const m of ctx.masked.matchAll(/\bstatic\s+(?:inline\s+)?(?:const\s+)?[A-Za-z_][\w:]*(?:\s*<[^;{}()]*>)?\s*&\s*instance\s*\(/g)) {
    const line = ctx.lineAt(m.index);
    let prev = line - 1;
    while (prev >= 1 && !ctx.commentLines[prev - 1].trim()) prev--;
    if (marker.test(ctx.commentLines[line - 1]) || (prev >= 1 && marker.test(ctx.commentLines[prev - 1]))) continue;
    hits.push({ line });
  }
  return hits;
}

/** §C6.8: rename の直前 (8 行以内) に remove_all。 */
export function checkRemoveBeforeRename(ctx) {
  const hits = [];
  for (const m of ctx.masked.matchAll(/\bremove_all\s*\(/g)) {
    const line = ctx.lineAt(m.index);
    const window = ctx.maskedLines.slice(line - 1, line + 8).join("\n");
    if (/\brename\s*\(/.test(window)) hits.push({ line });
  }
  return hits;
}

/** §C8.3: `*Config/*Desc/*Info` を 2 要素以上の位置だけで集約初期化。 */
export function checkPositionalConfig(ctx) {
  const text = ctx.masked;
  const hits = [];
  for (const m of text.matchAll(/\b(\w*(?:Config|Desc|Info))\b(?:\s+[A-Za-z_]\w*)?\s*=?\s*\{/g)) {
    const before = text.slice(Math.max(0, m.index - 160), m.index);
    if (/(?:\b(?:struct|class|union|enum(?:\s+class)?|namespace|public|protected|private)\s+|->\s*)$/.test(before)) continue;
    if (/\b(?:struct|class)\s+\w+(?:\s+final)?\s*:[^;{}()]*$/.test(before)) continue; // 基底クラス指定
    const open = m.index + m[0].length - 1;
    const close = matchClose(text, open);
    if (close < 0) continue;
    const elems = splitTopLevel(text.slice(open + 1, close)).map((e) => e.trim()).filter(Boolean);
    if (elems.length >= 2 && !elems[0].startsWith(".")) hits.push({ line: ctx.lineAt(m.index) });
  }
  return hits;
}

/** §C9.4: NOLINT の形式 `NOLINT(<check>): <理由> (§Cn)`。 */
export function checkNolintForm(ctx) {
  const hits = [];
  ctx.commentLines.forEach((text, i) => {
    for (const m of text.matchAll(/\bNOLINT(NEXTLINE|BEGIN|END)?\b(\([^)]*\))?([^\n]*)/g)) {
      const checks = (m[2] ?? "").slice(1, -1).trim();
      if (!checks) { hits.push({ line: i + 1 }); continue; }
      if (m[1] === "END") continue;
      const reason = /^:\s*(\S.*?)\s*\(§C\d+(?:\.\d+)*\)/.exec(m[3]);
      if (!reason || reason[1].startsWith("(§")) hits.push({ line: i + 1 });
    }
  });
  return hits;
}

// プリプロセッサ指令の中の空白 (clang は \f と \v も空白として読む)。
const BLANK = "[ \\t\\f\\v]";
const DIRECTIVE_LINE = new RegExp(`^${BLANK}*#${BLANK}*([A-Za-z_]\\w*)([^\\r\\n]*)`, "gm");
const MSVC_WARNING_PRAGMA = /^\s*warning\s*\(([^)]*)\)?/;
const REASON_LINE = /\/\/.*:\s*\S.*\(§C\d+(?:\.\d+)*\)/;

/** 指令の `#` の位置 (論理行の先頭に畳まれた空白やコメントを飛ばす)。 */
function directiveOffset(m) {
  let offset = 0;
  while (/[ \t\f\v]/.test(m[0][offset] ?? "")) offset++;
  return m.index + offset;
}

const MSVC_DEFINED = String.raw`(?:defined\s*\(\s*_MSC_VER\s*\)|defined\s+_MSC_VER)`;
const MSVC_ONLY_TERM = new RegExp(String.raw`^(?:${MSVC_DEFINED}|_MSC_VER(?:\s*(?:>=|>|==)\s*\d+[uUlL]*)?)$`);
const NOT_MSVC = new RegExp(String.raw`^!\s*(?:${MSVC_DEFINED}|_MSC_VER|\(\s*${MSVC_DEFINED}\s*\))$`);

/**
 * 条件 `kind expr` (#if / #ifdef / #ifndef) が MSVC (と clang-cl) でだけ真になるか (msvc) と、
 * MSVC でだけ偽になるか (notMsvc)。`||` を含む式は判定しない (msvc にしない)。
 */
function msvcCondition(kind, expr) {
  const e = expr.replace(/\s+/g, " ").trim();
  if (kind === "ifdef") return { msvc: e === "_MSC_VER", notMsvc: false };
  if (kind === "ifndef") return { msvc: false, notMsvc: e === "_MSC_VER" };
  const notMsvc = NOT_MSVC.test(e);
  if (/\|\||\bor\b|\?/.test(e)) return { msvc: false, notMsvc };
  const terms = e.split(/&&|\band\b/).map((t) => t.trim().replace(/^\((.*)\)$/, "$1").trim());
  return { msvc: terms.some((t) => MSVC_ONLY_TERM.test(t)), notMsvc };
}

/**
 * §C9.4: 警告の抑制で許すのは MSVC の `#pragma warning(disable: <番号>)` だけ。
 * `#if defined(_MSC_VER)` の中に置き (外では clang / GCC の -Wunknown-pragmas になり Praesidium の警告パスで落ちる)、
 * 直前の行に `// <check>: <理由> (§Cn)` を書き、`#pragma warning(push)` / `(pop)` で範囲を閉じる。
 * `#pragma warning(suppress: ...)`・`(push, <level>)`・`(<level>: ...)` は形式の外の抑制として報告する。
 * 論理行 (行継続とコメントを畳んだ形) を 1 回だけ前から読み、条件の入れ子と push / pop の深さを数える (線形)。
 */
export function checkPragmaDisable(ctx) {
  const hits = [];
  const groups = [];
  let msvc = false;
  let depth = 0;
  let lastPop = 0;
  const disables = [];
  for (const m of ctx.logical.matchAll(DIRECTIVE_LINE)) {
    const [, name, rest] = m;
    if (name === "if" || name === "ifdef" || name === "ifndef") {
      const c = msvcCondition(name, rest);
      groups.push({ parent: msvc, notMsvcSeen: c.notMsvc });
      msvc = msvc || c.msvc;
    } else if (name === "elif" || name === "elifdef" || name === "elifndef") {
      const group = groups.at(-1);
      if (!group) continue;
      const c = msvcCondition(name === "elif" ? "if" : name.slice(2), rest);
      msvc = group.parent || c.msvc || group.notMsvcSeen;
      group.notMsvcSeen ||= c.notMsvc;
    } else if (name === "else") {
      const group = groups.at(-1);
      if (group) msvc = group.parent || group.notMsvcSeen;
    } else if (name === "endif") {
      const group = groups.pop();
      msvc = group ? group.parent : false;
    } else if (name === "pragma") {
      const w = MSVC_WARNING_PRAGMA.exec(rest);
      if (!w) continue;
      const line = ctx.lineAt(directiveOffset(m));
      const spec = w[1];
      if (!msvc) hits.push({ line });
      if (/^\s*push\s*$/.test(spec)) depth++;
      else if (/^\s*pop\s*$/.test(spec)) { depth--; lastPop = line; }
      else if (/^\s*push\s*,|\bsuppress\b|(?:^|;)\s*[1-4]\s*:/.test(spec)) hits.push({ line });
      if (/\bdisable\b/.test(spec)) disables.push({ line, depth });
    }
  }
  for (const { line, depth: open } of disables) {
    let prev = line - 2;
    while (prev >= 0 && !ctx.commentLines[prev].trim()) prev--;
    const reasoned = prev >= 0 && REASON_LINE.test(ctx.commentLines[prev]);
    if (open <= 0 || lastPop <= line || !reasoned) hits.push({ line });
  }
  return hits;
}

const ANALYSIS_SUPPRESSION = new RegExp([
  `^${BLANK}*#${BLANK}*pragma${BLANK}+(?:(?:clang|GCC)${BLANK}+)?system_header\\b`,
  `^${BLANK}*#${BLANK}*pragma${BLANK}+(?:clang|GCC)${BLANK}+diagnostic${BLANK}+(?:ignored|warning)\\b`,
  String.raw`\b(?:_Pragma|__pragma|__clang_analyzer__)\b`,
].join("|"), "gm");
const ATTRIBUTE_TOKEN = /(::)|([[\]()])|([A-Za-z_]\w*)|[^\s\w[\]()]/g;
const NEXT_OPEN_BRACKET = /\s*\[/y;
const NEXT_CLOSE = { "]": /\s*\]/y, ")": /\s*\)/y };
const NEXT_OPEN_PARENS = /\s*\(\s*\(/y;

function follows(text, pattern, index) {
  pattern.lastIndex = index;
  return pattern.test(text) ? pattern.lastIndex : -1;
}

/**
 * `[[clang::suppress]]` / `__attribute__((suppress))` の `suppress` の位置。属性指定子 `[[ ]]` と
 * `__attribute__(( ))` の入れ子を括弧のスタックで 1 回だけ数える (空白・改行・ダイグラフ `<:<:` を挟んでも、
 * logical ビューでは `[[` になる)。`gsl::suppress` は解析器が無視する MSVC 向けの綴りなので数えない。
 */
function suppressAttributeOffsets(text) {
  const offsets = [];
  const frames = [];
  let attributes = 0;
  let previous = "", beforePrevious = "";
  ATTRIBUTE_TOKEN.lastIndex = 0;
  for (let token; (token = ATTRIBUTE_TOKEN.exec(text));) {
    const [whole, , bracket, word] = token;
    let next = token.index + whole.length;
    if (bracket === "[") {
      const end = follows(text, NEXT_OPEN_BRACKET, next);
      frames.push(end < 0 ? "[" : "[[");
      if (end >= 0) { attributes++; next = end; }
    } else if (bracket === "(") {
      frames.push("(");
    } else if (bracket === "]" || bracket === ")") {
      const open = bracket === "]" ? "[" : "(";
      const top = frames.at(-1);
      if (top === open) frames.pop();
      else if (top === open + open) {
        frames.pop();
        attributes--;
        next = Math.max(next, follows(text, NEXT_CLOSE[bracket], next));
      }
    } else if (word && /^__attribute(?:__)?$/.test(word)) {
      const end = follows(text, NEXT_OPEN_PARENS, next);
      if (end >= 0) { frames.push("(("); attributes++; next = end; }
    } else if (word && attributes > 0 && /^(?:__)?suppress(?:__)?$/.test(word) && !(previous === "::" && beforePrevious === "gsl")) {
      offsets.push(token.index);
    }
    beforePrevious = previous;
    previous = whole;
    ATTRIBUTE_TOKEN.lastIndex = next;
  }
  return offsets;
}

/**
 * §C9.4: clang / GCC の警告・解析の抑制は理由があっても使わない。`#pragma clang|GCC diagnostic ignored|warning`、
 * `#pragma system_header` (clang / GCC 付きを含む)、`_Pragma` / `__pragma` (中身はマクロ展開されるので読めない)、
 * `[[clang::suppress]]` / `__attribute__((suppress))`、`__clang_analyzer__` を報告する。Praesidium の
 * `native.analysis-suppression` と同じく論理行で読む (行継続・コメント・ダイグラフを挟んでも見つける)。
 */
export function checkAnalysisSuppression(ctx) {
  const hits = [];
  for (const m of ctx.logical.matchAll(ANALYSIS_SUPPRESSION)) hits.push({ line: ctx.lineAt(directiveOffset(m)) });
  for (const offset of suppressAttributeOffsets(ctx.logical)) hits.push({ line: ctx.lineAt(offset) });
  return hits;
}

// §C2.1 の禁止 API の呼び出しの終わり。`(atoi)(s)` / `((atoi))(s)` も呼び出し (括弧は関数形式マクロを止めるだけ)。
// `)` の並びは名前 1 つにしか続かないので、照合は線形 (Revisor rules.mjs の CALL と同じ)。
export const CALL = String.raw`\s*(?:\)\s*)*\(`;
// `::` の前に書けるのは名前空間ではなくキーワード (`return ::atoi(s)`) と std (Revisor rules.mjs の NOT_A_NAMESPACE と同じ)。
const NOT_A_NAMESPACE = "std|return|co_return|co_yield|co_await|throw|else|do|case|new|delete|sizeof|and|or|not|xor|bitand|bitor|compl|and_eq|or_eq|xor_eq|not_eq|__extension__|__real__|__imag__|__real|__imag";
/** 名前 (`|` 区切り) の呼び出し。メンバ (`.x(` / `->x(`) と std 以外の名前空間 (`my::x(`) は別の関数なので除く。 */
export const callOf = (names) =>
  new RegExp(String.raw`(?<!(?:\.|->|\b(?!(?:${NOT_A_NAMESPACE})\b)[A-Za-z_]\w*\s*::)\s*)\b(?:${names})` + CALL);

// banned.h の形の防御 (`#define atoi(...) ...` / `#undef atoi`) は使用ではない (Revisor rules.mjs の BAN_DIRECTIVE と同じ)。
const BAN_DIRECTIVE = new RegExp(`^${BLANK}*#${BLANK}*(?:define|undef)${BLANK}+$`);
const BAN_DIRECTIVE_WINDOW = 64;

/** §C2.1: 一致した名前が `#define` / `#undef` の対象 (banned.h の防御) ではない。 */
export function notBanDirective(m, ctx) {
  const text = ctx.logical;
  const from = Math.max(0, m.index - BAN_DIRECTIVE_WINDOW);
  const window = text.slice(from, m.index);
  const lineBreak = Math.max(window.lastIndexOf("\n"), window.lastIndexOf("\r"));
  if (lineBreak < 0 && from > 0) return true;
  return !BAN_DIRECTIVE.test(window.slice(lineBreak + 1));
}

/** §C1.7: モジュールのインターフェース単位ファイルそのもの。 */
export function checkModuleUnitFile() {
  return [{ line: 1 }];
}
