/**
 * 投稿データ(JSON) → カルーセル用のJPEG画像を連番で書き出す。
 * 使い方: node scripts/render.mjs content/sample.json out
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { chromium } from "playwright";
import { THEMES, coverHtml, stepHtml, outroHtml } from "./slides.mjs";

const WIDTH = 1080;
const HEIGHT = 1350;

const contentPath = process.argv[2] ?? "content/sample.json";
const outDir = process.argv[3] ?? "out";

const post = JSON.parse(readFileSync(contentPath, "utf8"));
const theme = THEMES[post.category];
if (!theme) {
  console.error(`❌ category は次のいずれかにしてください: ${Object.keys(THEMES).join(" / ")}`);
  process.exit(1);
}

const total = 2 + post.steps.length; // 表紙 + 手順 + まとめ
if (total > 10) {
  console.error("❌ Instagramのカルーセルは最大10枚です。手順を減らしてください。");
  process.exit(1);
}

const pages = [
  coverHtml(post, theme, total),
  ...post.steps.map((s, i) => stepHtml(s, i + 1, post, theme, total)),
  outroHtml(post, theme, total),
];

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: 1,
});

const files = [];
for (const [i, html] of pages.entries()) {
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);

  // AIが書いた文章が長すぎても画像からはみ出さないよう、自動で文字を縮める
  await page.evaluate(() => {
    const shrink = (el, limit, min) => {
      if (!el) return;
      let size = parseFloat(getComputedStyle(el).fontSize);
      while (el.scrollHeight > limit && size > min) {
        size -= 2;
        el.style.fontSize = `${size}px`;
      }
    };

    const area = document.querySelector(".cover .headline-area");
    if (area) shrink(area.querySelector(".headline"), area.clientHeight, 52);

    const targets = ".title, .body, .explain .row span, .explain .row code, .sheet td, .sheet th, .formula code, .outro li";
    let guard = 0;
    while (document.body.scrollHeight > document.body.clientHeight && guard++ < 40) {
      for (const el of document.querySelectorAll(targets)) {
        const size = parseFloat(getComputedStyle(el).fontSize);
        el.style.fontSize = `${size - 1}px`;
      }
    }

    // 逆に図が小さくて余白が目立つ場合は、はみ出さない範囲まで大きくする
    const visual = document.querySelector(".step .visual");
    const growable = visual
      ? visual.querySelectorAll(".sheet td, .sheet th, .explain .row span, .explain .row code, .formula code")
      : [];
    if (growable.length) {
      let grown = 0;
      while (document.body.scrollHeight <= document.body.clientHeight && grown < 12) {
        for (const el of growable) {
          el.style.fontSize = `${parseFloat(getComputedStyle(el).fontSize) + 1}px`;
        }
        grown++;
      }
      // はみ出す直前まで戻す
      for (const el of growable) {
        el.style.fontSize = `${parseFloat(getComputedStyle(el).fontSize) - 1}px`;
      }
    }
  });

  const name = `${String(i + 1).padStart(2, "0")}.jpg`;
  const buffer = await page.screenshot({ type: "jpeg", quality: 92 });
  writeFileSync(`${outDir}/${name}`, buffer);
  files.push({ name, kb: Math.round(buffer.length / 1024) });
}
await browser.close();

console.log(`✅ ${files.length}枚を書き出しました（${theme.name} / ${theme.accent}）\n`);
for (const f of files) console.log(`   ${outDir}/${f.name}  ${f.kb}KB`);
