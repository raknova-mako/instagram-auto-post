/**
 * ネタ帳から1件取り出し、執筆ルールに従ってAIに投稿一式を書かせる。
 * 出力: content/posts/<日付>.json（画像用データ＋キャプション）
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { loadEnv, requireValue } from "./env.mjs";
import { nextTopic } from "./topics.mjs";
import { THEMES } from "./slides.mjs";

const env = loadEnv();
const key = requireValue(env, "GEMINI_API_KEY", "Google AI Studio で取得したキーを貼ってください。");
// 3.7-flash は混雑が慢性化しているため、既定では後回しにする
const model = env.GEMINI_MODEL || "gemini-3.6-flash";
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

/** 混雑に備えて、複数のモデルを順に試す（上から順に試す） */
const candidates = [...new Set([
  model,
  "gemini-3.7-flash",
  "gemini-3.5-flash",
  "gemini-flash-latest",
  "gemini-2.5-flash",
])];

const sleep = (sec) => new Promise((r) => setTimeout(r, sec * 1000));

const askGemini = async (name) => {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${name}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: schema,
          temperature: 1,
        },
      }),
    }
  );
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
};

let text = "";
let usedModel = "";

// 全モデルが混んでいても、少し待って周回し直す（混雑は数分で解けることが多い）
outer: for (let round = 1; round <= 3 && !text; round++) {
  if (round > 1) {
    console.log(`   全モデルが混雑中。90秒待って${round}周目に入ります`);
    await sleep(90);
  }

  for (const name of candidates) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const { ok, status, body } = await askGemini(name);

      if (ok) {
        text = body?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "";
        if (text) {
          usedModel = name;
          break outer;
        }
        console.log(`   ${name}: 空の返事（理由: ${body?.candidates?.[0]?.finishReason ?? "不明"}）`);
        continue;
      }

      // 混雑・回数制限は待てば直る可能性がある
      if (status === 429 || status >= 500) {
        const wait = attempt * 10;
        console.log(`   ${name}: 混雑中(${status})。${wait}秒待って再挑戦（${attempt}/2）`);
        await sleep(wait);
        continue;
      }

      // 設定ミスなどは待っても直らないので、次のモデルへ
      console.error(`   ${name}: エラー (HTTP ${status}) ${body?.error?.message ?? ""}`);
      break;
    }
  }
}

if (!text) {
  console.error("❌ すべてのモデルが混雑していて、原稿を作れませんでした。");
  console.error("   時間をおいて実行し直してください。");
  process.exit(1);
}
console.log(`   使用モデル: ${usedModel}`);
console.log("");

let draft;
try {
  draft = JSON.parse(text);
} catch {
  console.error("❌ AIの返事を読み取れませんでした。もう一度実行してください。");
  process.exit(1);
}

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
