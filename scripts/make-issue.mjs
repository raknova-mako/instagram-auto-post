/**
 * 承認用のIssue本文（スマホで確認する画面）を組み立てて出力する。
 * 使い方: node scripts/make-issue.mjs <投稿データ>
 */
import { readFileSync } from "node:fs";

const post = JSON.parse(readFileSync(process.argv[2], "utf8"));
const images = post.imageUrls ?? [];

const lines = [
  `**テーマ**: ${post.topic ?? "(不明)"}`,
  `**カテゴリ**: ${post.category}　**枚数**: ${images.length}枚`,
  "",
  "## 画像",
  "",
  ...images.map((u, i) => `**${i + 1}枚目**\n\n<img src="${u}" width="330">\n`),
  "## キャプション",
  "",
  "```text",
  post.caption ?? "",
  "```",
  "",
  "---",
  "",
  "## 確認してください",
  "",
  "| したいこと | 操作 |",
  "| --- | --- |",
  "| **これで投稿する** | `approved` ラベルを付ける |",
  "| **作り直す** | `retry` ラベルを付ける（別の案が作られます） |",
  "| **今日は投稿しない** | このIssueを閉じる |",
  "",
  "`approved` を付けると、**今日の19時に自動で投稿されます。**",
];

console.log(lines.join("\n"));
