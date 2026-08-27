/**
 * 投稿データに、画像の公開URLを書き込む。
 * 使い方: node scripts/set-image-urls.mjs <投稿データ> <画像フォルダ> <公開URLの土台>
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";

const [postPath, dir, baseUrl] = process.argv.slice(2);
if (!postPath || !dir || !baseUrl) {
  console.error("❌ 引数が足りません: <投稿データ> <画像フォルダ> <公開URLの土台>");
  process.exit(1);
}

const files = readdirSync(dir).filter((f) => f.endsWith(".jpg")).sort();
if (!files.length) {
  console.error(`❌ ${dir} に画像がありません。`);
  process.exit(1);
}

const post = JSON.parse(readFileSync(postPath, "utf8"));
post.imageUrls = files.map((f) => `${baseUrl.replace(/\/$/, "")}/${dir}/${f}`);
writeFileSync(postPath, JSON.stringify(post, null, 2), "utf8");

console.log(`✅ 画像URLを${files.length}件セットしました`);
for (const u of post.imageUrls) console.log(`   ${u}`);
