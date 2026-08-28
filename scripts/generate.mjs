/**
 * ネタ帳から1件取り出し、執筆ルールに従ってAIに投稿一式を書かせる。
 * 出力: content/posts/<日付>.json（画像用データ＋キャプション）
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { loadEnv } from "./env.mjs";
import { generateJson } from "./gemini.mjs";
import { nextTopic } from "./topics.mjs";
import { THEMES } from "./slides.mjs";

const env = loadEnv();
const account = env.IG_ACCOUNT_NAME || "@mako_raknova";

const topic = nextTopic();
if (!topic) {
  console.error("❌ ネタ帳に未使用のネタがありません。content/topics.md に追加してください。");
  process.exit(1);
}

const rules = readFileSync("prompts/writing-rules.md", "utf8");

const prompt = `あなたは、Instagramで業務効率化を発信しているアカウント ${account} の中の人です。
以下の執筆ルールを厳密に守って、カルーセル投稿を1本つくってください。

════════ 執筆ルール ════════
${rules}
════════════════════════

今日のテーマ: 「${topic.theme}」
カテゴリ: ${THEMES[topic.category].name}

【出力の決まり】

- steps は3〜4個。うち1つは必ず「数式やコードの意味を、パーツごとに日本語で分解して説明する」ページにして、explain を埋めること。
  数式やコードを一切使わないテーマの場合のみ、explain は省略してよい。
- **すべての steps に、必ず図を1つ入れること。** formula か sheetHeaders+sheetRows か explain のいずれかを必ず埋める。
  図を入れられない手順は、そもそも1ページ使う価値がないので、他の手順に統合するか削ること。
- 数式やコードを見せるページには formula を入れる。
- スプレッドシートの画面を見せたいページには sheetHeaders と sheetRows を入れる。
  sheetRows は1行を "4/1 | 佐藤 | 12,000" のように半角の縦棒で区切った文字列にすること。
  列名(A,B,C)と行番号(1,2,3)は画像側が自動で描くので、絶対に自分で入れないこと。
  sheetHeaders には「日付」「担当」のような、実際に見出し行へ入る言葉を入れる。
  強調したいセルは "*17,600" のように先頭に半角アスタリスクを付ける。
- headline や見出しの中で特に強調したい部分は <mark>ここ</mark> で囲む。囲むのは8文字以内。表紙とまとめに1か所ずつ。
- caption にはハッシュタグを含めない。ハッシュタグは hashtags に分けて入れる。
- caption は本文だけで手順を再現できる詳しさにし、絵文字を適度に使う。1800文字以内。
- 文字数の上限を必ず守ること。上限を超えると画像からはみ出して読めなくなる。`;

const schema = {
  type: "OBJECT",
  properties: {
    cover: {
      type: "OBJECT",
      properties: {
        label: { type: "STRING", description: "カテゴリ名。例: スプレッドシート術" },
        headline: { type: "STRING", description: "表紙の見出し。45文字以内" },
        sub: { type: "STRING", description: "表紙の説明。75文字以内" },
      },
      required: ["label", "headline", "sub"],
    },
    steps: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING", description: "手順の見出し。24文字以内" },
          body: { type: "STRING", description: "手順の説明。70文字以内" },
          formula: { type: "STRING", description: "見せたい数式やコード。なければ空" },
          note: { type: "STRING", description: "図の下に添える一言。なければ空" },
          sheetHeaders: {
            type: "ARRAY",
            description: "表の見出し行の文字。例: 日付, 担当, 金額。A・B・Cのような列名は絶対に入れないこと（画像側で自動的に付きます）",
            items: { type: "STRING" },
          },
          sheetRows: {
            type: "ARRAY",
            description: "データ行。行番号(1,2,3)は絶対に入れないこと（画像側で自動的に付きます）",
            items: { type: "STRING" },
          },
          explain: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                part: { type: "STRING", description: "数式の一部分" },
                means: { type: "STRING", description: "その意味。25文字以内" },
              },
              required: ["part", "means"],
            },
          },
        },
        required: ["title", "body"],
      },
    },
    outro: {
      type: "OBJECT",
      properties: {
        lead: { type: "STRING" },
        headline: { type: "STRING", description: "まとめの見出し。35文字以内" },
        bullets: { type: "ARRAY", items: { type: "STRING", description: "22文字以内" } },
        cta: { type: "STRING", description: "行動を促す一言。14文字以内" },
      },
      required: ["lead", "headline", "bullets", "cta"],
    },
    caption: { type: "STRING" },
    hashtags: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["cover", "steps", "outro", "caption", "hashtags"],
};

console.log(`テーマ「${topic.theme}」で原稿を書いています…
`);

const draft = await generateJson({ prompt, schema, label: "原稿" });

/**
 * 表のデータを整える。
 * AIは列名(A,B,C)や行番号(1,2,3)を自分で入れてしまうことがあるので、
 * 見つけたら取り除く（画像側で自動的に描かれるため、放置すると二重になる）
 */
const normalizeSheet = (headers, rawRows) => {
  let head = headers.map((h) => String(h).trim());
  let rows = rawRows.map((r) => String(r).split("|").map((c) => c.trim()));

  const looksLikeLetters = head.length > 0 && head.every((h) => /^[A-Z]{1,2}$/i.test(h));
  const looksLikeRowNumbers =
    rows.length >= 2 &&
    rows.every((r, i) => /^\d+$/.test(r[0] ?? "") && Number(r[0]) === Number(rows[0][0]) + i);

  if (looksLikeRowNumbers) {
    rows = rows.map((r) => r.slice(1));
    if (looksLikeLetters) head = head.slice(1);
  }
  if (looksLikeLetters && rows.length) head = rows.shift();

  return { headers: head, rows };
};

/** AIの出力を、画像生成が使える形に整える */
const steps = (draft.steps ?? []).map((s) => {
  const step = { title: s.title, body: s.body };
  if (s.formula) step.formula = s.formula;
  if (s.note) step.note = s.note;
  if (s.explain?.length) step.explain = s.explain;
  if (s.sheetHeaders?.length && s.sheetRows?.length) {
    step.sheet = normalizeSheet(s.sheetHeaders, s.sheetRows);
  }
  return step;
});

const post = {
  category: topic.category,
  account,
  topic: topic.theme,
  topicLine: topic.lineIndex,
  generatedAt: new Date().toISOString(),
  cover: draft.cover,
  steps,
  outro: draft.outro,
  caption: `${draft.caption.trim()}\n\n${(draft.hashtags ?? [])
    .map((h) => (h.startsWith("#") ? h : `#${h}`))
    .join(" ")}`,
};

// 日本時間の日付でファイル名を付ける（UTCだと前日になってしまう）
const date = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
const outFile = `content/posts/${date}.json`;
mkdirSync("content/posts", { recursive: true });
writeFileSync(outFile, JSON.stringify(post, null, 2), "utf8");

/** 上限を超えた項目を警告する（画像からはみ出す原因になる） */
const limits = [
  ["表紙の見出し", post.cover.headline.replace(/<\/?mark>/g, ""), 45],
  ["表紙の説明", post.cover.sub, 75],
  ["まとめの見出し", post.outro.headline.replace(/<\/?mark>/g, ""), 35],
];
for (const [i, s] of steps.entries()) {
  limits.push([`STEP${i + 1}の見出し`, s.title, 24], [`STEP${i + 1}の説明`, s.body, 70]);
}
const over = limits.filter(([, v, max]) => (v ?? "").length > max);

console.log(`✅ 原稿ができました: ${outFile}`);
console.log(`   カルーセル ${steps.length + 2}枚 / キャプション ${post.caption.length}文字`);
if (over.length) {
  console.log("\n⚠️ 文字数が多い項目（自動で縮小して表示されます）");
  for (const [name, v, max] of over) console.log(`   ${name}: ${v.length}文字 (上限${max})`);
}
