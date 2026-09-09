import { readFileSync, writeFileSync } from "node:fs";

const FILE = "content/topics.md";
const CATEGORIES = ["sheets", "appsheet", "google"];

/**
 * ネタ帳から、まだ使っていない一番上のネタを取り出す。
 * exclude には「すでに下書きが作られたネタ」を "カテゴリ|テーマ" の形で渡す。
 * 行番号ではなく文言で照合するので、ネタ帳を並べ替えてもズレない。
 */
export function nextTopic(exclude = new Set(), accept = () => true) {
  const lines = readFileSync(FILE, "utf8").split(/\r?\n/);

  for (const [i, line] of lines.entries()) {
    const t = line.trim();
    if (!t || t.startsWith("#") || t.startsWith("-") || t.startsWith("[済]")) continue;
    if (!t.includes("|")) continue;

    const [rawCat, ...rest] = t.split("|");
    const category = rawCat.trim();
    const theme = rest.join("|").trim();
    if (!CATEGORIES.includes(category) || !theme) continue;
    if (exclude.has(`${category}|${theme}`)) continue;
    if (!accept(category)) continue;

    return { category, theme, lineIndex: i };
  }
  return null;
}

/**
 * 投稿が終わったネタに [済] を付ける。
 * 行番号ではなくテーマの文言で探すので、ネタ帳を並べ替えても正しい行に付く。
 */
export function markDone(category, theme, note = "") {
  const nl = String.fromCharCode(10);
  const lines = readFileSync(FILE, "utf8").split(nl);

  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim().replace(String.fromCharCode(13), "");
    if (!t || t.startsWith("#") || t.startsWith("-") || t.startsWith("[済]")) continue;
    if (!t.includes("|")) continue;

    const [rawCat, ...rest] = t.split("|");
    if (rawCat.trim() !== category) continue;
    if (rest.join("|").trim() !== theme) continue;

    lines[i] = `[済] ${t}${note ? `  ← ${note}` : ""}`;
    writeFileSync(FILE, lines.join(nl), "utf8");
    return true;
  }
  return false;
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
