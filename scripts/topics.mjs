import { readFileSync, writeFileSync } from "node:fs";

const FILE = "content/topics.md";
const CATEGORIES = ["sheets", "appsheet", "google"];

/** ネタ帳から、まだ使っていない一番上のネタを取り出す */
export function nextTopic() {
  const lines = readFileSync(FILE, "utf8").split(/\r?\n/);

  for (const [i, line] of lines.entries()) {
    const t = line.trim();
    if (!t || t.startsWith("#") || t.startsWith("-") || t.startsWith("[済]")) continue;
    if (!t.includes("|")) continue;

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
  lines[lineIndex] = `[済] ${lines[lineIndex].trim()}${note ? `  ← ${note}` : ""}`;
  writeFileSync(FILE, lines.join("\n"), "utf8");
}
