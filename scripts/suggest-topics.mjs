/**
 * ネタ帳の残りが少なくなったら、AIに新しいネタの候補を考えさせる。
 *
 * 残りに余裕があれば何も出さずに終了(0)。
 * 提案が必要なときだけ、Issue用の文章を標準出力に書いて終了コード1を返す。
 */
import { readFileSync } from "node:fs";
import { allTopics } from "./topics.mjs";
import { generateJson } from "./gemini.mjs";

// 残りがこの数以下になったら提案する（動作確認用に環境変数で上書きできる）
const REFILL_WHEN_LEFT = Number(process.env.REFILL_WHEN_LEFT ?? 7);
const HOW_MANY = 10;

const all = allTopics();
const left = all.filter((t) => !t.done).length;

console.error(`ネタ帳: 全${all.length}件 / 未使用 ${left}件`);

if (left > REFILL_WHEN_LEFT) {
  console.error("まだ余裕があります。提案はしません。");
  process.exit(0);
}

const rules = readFileSync("prompts/writing-rules.md", "utf8");
const existing = all.map((t) => `${t.category} | ${t.theme}`).join("\n");

const prompt = `あなたは、Instagramで業務効率化を発信しているアカウントの企画担当です。
次の投稿ネタの候補を${HOW_MANY}件考えてください。

════════ 読者と方針 ════════
${rules}
════════════════════════

すでにネタ帳にあるもの（重複させないこと）:
${existing}

【条件】
- カテゴリは sheets（Googleスプレッドシート）/ appsheet / google（その他のGoogleの便利機能）のいずれか
- 全体の6割程度を sheets にする
- **1投稿で1つのことだけを教えられる大きさ**にすること。「スプレッドシート入門」のような大きすぎるテーマは不可
- 読者は SUM関数しか使えない人。その人が「明日の仕事で使える」と思えるものにする
- 実在する機能だけを扱う。存在しない関数や機能を作らない
- theme は25文字以内、日本語で書く`;

const schema = {
  type: "OBJECT",
  properties: {
    topics: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          category: { type: "STRING", description: "sheets / appsheet / google のいずれか" },
          theme: { type: "STRING", description: "投稿のテーマ。25文字以内" },
          why: { type: "STRING", description: "この読者に刺さる理由。40文字以内" },
        },
        required: ["category", "theme", "why"],
      },
    },
  },
  required: ["topics"],
};

console.error("新しいネタを考えています…");
const result = await generateJson({ prompt, schema, label: "ネタの候補" });

const valid = (result.topics ?? []).filter((t) =>
  ["sheets", "appsheet", "google"].includes(t.category) && t.theme
);

if (!valid.length) {
  console.error("❌ 使える候補が得られませんでした。");
  process.exit(0);
}

const label = { sheets: "🟢 スプレッドシート", appsheet: "🔵 AppSheet", google: "🟠 Googleの便利機能" };

const out = [
  `ネタ帳の残りが **${left}件** になりました。このままだと${left}日後に投稿が止まります。`,
  "",
  `AIが新しい候補を${valid.length}件考えました。**良いものだけ選んで、ネタ帳に追加してください。**`,
  "",
  "| カテゴリ | テーマ | 刺さる理由 |",
  "| --- | --- | --- |",
  ...valid.map((t) => `| ${label[t.category]} | ${t.theme} | ${t.why} |`),
  "",
  "---",
  "",
  "## 追加のしかた",
  "",
  "1. [content/topics.md](../blob/main/content/topics.md) を開く",
  "2. 右上の **鉛筆マーク**（Edit this file）をクリック",
  "3. 一番下に、採用する行だけを貼り付ける",
  "4. 緑の **Commit changes** をクリック",
  "",
  "そのまま貼り付けられる形にしておきます。**要らない行は消してください。**",
  "",
  "```",
  ...valid.map((t) => `${t.category} | ${t.theme}`),
  "```",
  "",
  "自分で思いついたネタがあれば、同じ形式で自由に書き足して構いません。",
  "そちらのほうが実体験に基づくぶん、読者に刺さります。",
];

console.log(out.join("\n"));
process.exit(1);
