import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

function opaqueKeywordId(value) {
  const digest = createHash("sha256")
    .update(value.toLocaleLowerCase(), "utf8")
    .digest("hex")
    .slice(0, 12);
  return `keyword:${digest}`;
}

function normalizeKeyword(keyword, index) {
  if (typeof keyword === "string") {
    const value = keyword.trim();
    if (!value) {
      throw new Error(`Invalid keyword value at index ${index}: expected a non-empty string.`);
    }
    return { id: opaqueKeywordId(value), value, match: "substring" };
  }

  if (!keyword || typeof keyword !== "object" || Array.isArray(keyword)) {
    throw new Error(`Invalid keyword at index ${index}: expected a string or object.`);
  }

  const id = typeof keyword.id === "string" ? keyword.id.trim() : "";
  const value = typeof keyword.value === "string" ? keyword.value.trim() : "";
  const match = keyword.match ?? "substring";
  if (!id) {
    throw new Error(`Invalid keyword id at index ${index}: expected a non-empty string.`);
  }
  if (!value) {
    throw new Error(`Invalid keyword value at index ${index}: expected a non-empty string.`);
  }
  if (match !== "substring" && match !== "token") {
    throw new Error(`Invalid keyword match at index ${index}: expected "substring" or "token".`);
  }
  return { id, value, match };
}

export function normalizeKeywords(keywords) {
  if (!Array.isArray(keywords)) {
    throw new Error("Invalid keyword configuration: keywords must be an array.");
  }

  const normalized = keywords.map(normalizeKeyword);
  const ids = new Set();
  for (const [index, keyword] of normalized.entries()) {
    if (ids.has(keyword.id)) {
      throw new Error(`Duplicate keyword id at index ${index}.`);
    }
    ids.add(keyword.id);
  }
  const privateValues = normalized.map(({ value }) => value.toLocaleLowerCase());
  for (const [index, keyword] of normalized.entries()) {
    const lowercaseId = keyword.id.toLocaleLowerCase();
    if (privateValues.some((value) => lowercaseId.includes(value))) {
      throw new Error(`Keyword id at index ${index} must not contain a keyword value.`);
    }
  }
  return normalized;
}

export function redactKeywordValues(text, keywords) {
  if (typeof text !== "string" || text.length === 0) return text;
  const normalized = normalizeKeywords(keywords)
    .toSorted((left, right) => right.value.length - left.value.length);
  let redacted = text;
  for (const keyword of normalized) {
    const escapedValue = keyword.value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    redacted = redacted.replace(
      new RegExp(escapedValue, "giu"),
      `[${keyword.id}]`,
    );
  }
  return redacted;
}

export function loadKeywordConfig(configPath) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(configPath, "utf8"));
  } catch (error) {
    // 設定ファイルはリポジトリ外に置くため、絶対パスを共有ログへ出さない。
    const message = error instanceof SyntaxError
      ? "Invalid keyword configuration: malformed JSON."
      : "Cannot read keyword configuration.";
    throw new Error(message);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid keyword configuration: expected a JSON object.");
  }

  const ignorePatterns = parsed.ignore_patterns ?? [];
  if (!Array.isArray(ignorePatterns) || ignorePatterns.some((pattern) => typeof pattern !== "string")) {
    throw new Error("Invalid keyword configuration: ignore_patterns must be an array of strings.");
  }

  return {
    keywords: normalizeKeywords(parsed.keywords ?? []),
    ignorePatterns: ignorePatterns.map((pattern) => pattern.trim()).filter(Boolean),
  };
}
