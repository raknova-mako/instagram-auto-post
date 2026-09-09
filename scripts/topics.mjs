import { readFileSync, writeFileSync } from "node:fs";

const FILE = "content/topics.md";
const CATEGORIES = ["sheets", "appsheet", "google"];

/**
 * ネタ帳から、まだ使っていない一番上のネタを取り出す。
 * exclude には「すでに下書きが作られた行番号」を渡す。
 * 投稿されるまで [済] が付かないため、これがないと同じネタが何日も選ばれてしまう。
 */
export function nextTopic(exclude = new Set()) {
  const lines = readFileSync(FILE, "utf8").split(/\r?\n/);

  for (const [i, line] of lines.entries()) {
    const t = line.trim();
    if (!t || t.startsWith("#") || t.startsWith("-") || t.startsWith("[済]")) continue;
    if (!t.includes("|")) continue;
    if (exclude.has(i)) continue;

    const [rawCat, ...rest] = t.split("|");
    const category = rawCat.trim();
    const theme = rest.join("|").trim();
    if (!CATEGORIES.includes(category) || !theme) continue;

    return { category, theme, lineIndex: i };
  }
  return null;
}

/** 投稿が終わったネタに [済] を付ける */
export function markDone(lineIndex, note = "") {
  const lines = readFileSync(FILE, "utf8").split(/\r?\n/);
  const current = lines[lineIndex].trim();
  // すでに印が付いている行に二重で付けない（付けると行が読み取れなくなる）
  if (current.startsWith("[済]")) return;
  lines[lineIndex] = `[済] ${current}${note ? `  ← ${note}` : ""}`;
  writeFileSync(FILE, lines.join("\n"), "utf8");
}

/** ネタ帳の全件を返す（使用済みかどうかも一緒に） */
export function allTopics() {
  const lines = readFileSync(FILE, "utf8").split(String.fromCharCode(10));
  const items = [];

  for (const line of lines) {
    let t = line.trim();
    if (!t || t.startsWith("#") || t.startsWith("-")) continue;

    const done = t.startsWith("[済]");
    if (done) t = t.slice(3).trim();
    if (!t.includes("|")) continue;

    const [cat, ...rest] = t.split("|");
    const theme = rest.join("|").split("←")[0].trim();
    if (!CATEGORIES.includes(cat.trim()) || !theme) continue;

    items.push({ category: cat.trim(), theme, done });
  }
  return items;
}
