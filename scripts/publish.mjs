/**
 * カルーセル（複数枚）をInstagramに投稿する。
 *
 * 使い方:
 *   node scripts/publish.mjs content/posts/2026-08-28.json --dry-run
 *     → 下書き(コンテナ)の作成までで止める。フィードには一切出ない
 *   node scripts/publish.mjs content/posts/2026-08-28.json
 *     → 実際に公開する
 *
 * 画像は「インターネットから見えるURL」である必要がある（Instagramの仕様）。
 * 投稿データの imageUrls に、その公開URLを入れておくこと。
 */
import { readFileSync } from "node:fs";
import { loadEnv, requireValue } from "./env.mjs";

const env = loadEnv();
const token = requireValue(env, "IG_ACCESS_TOKEN");
const userId = requireValue(env, "IG_USER_ID");

const postPath = process.argv[2];
const dryRun = process.argv.includes("--dry-run");

if (!postPath) {
  console.error("❌ 投稿データのファイルを指定してください。");
  console.error("   例: node scripts/publish.mjs content/posts/2026-08-28.json --dry-run");
  process.exit(1);
}

const post = JSON.parse(readFileSync(postPath, "utf8"));
const imageUrls = post.imageUrls ?? [];

if (!imageUrls.length) {
  console.error("❌ 投稿データに imageUrls がありません。");
  console.error("   先に画像をアップロードして、公開URLを書き込んでください。");
  process.exit(1);
}
if (imageUrls.length < 2 || imageUrls.length > 10) {
  console.error(`❌ カルーセルは2〜10枚です（今は${imageUrls.length}枚）。`);
  process.exit(1);
}

const call = async (path, params) => {
  const url = `https://graph.instagram.com/${path}`;
  const payload = new URLSearchParams({ ...params, access_token: token });
  const res = await fetch(url, { method: "POST", body: payload });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`\n❌ 失敗 (HTTP ${res.status}): ${body?.error?.message ?? JSON.stringify(body)}`);
    process.exit(1);
  }
  return body;
};

const get = async (path, params = {}) => {
  const url = new URL(`https://graph.instagram.com/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", token);
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`\n❌ 状態の確認に失敗 (HTTP ${res.status}): ${body?.error?.message ?? ""}`);
    process.exit(1);
  }
  return body;
};

/** Instagram側の画像処理が終わるまで待つ */
const waitReady = async (id, label) => {
  for (let i = 1; i <= 20; i++) {
    const s = await get(id, { fields: "status_code,status" });
    if (s.status_code === "FINISHED") return;
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") {
      console.error(`\n❌ ${label} の処理に失敗しました: ${s.status ?? s.status_code}`);
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  console.error(`\n❌ ${label} の処理が時間内に終わりませんでした。`);
  process.exit(1);
};

console.log(`カルーセル ${imageUrls.length}枚 を投稿します${dryRun ? "（公開はしません）" : ""}\n`);

// ① 1枚ずつ下書きを作る
const childIds = [];
for (const [i, url] of imageUrls.entries()) {
  const child = await call(`${userId}/media`, { image_url: url, is_carousel_item: "true" });
  await waitReady(child.id, `${i + 1}枚目`);
  childIds.push(child.id);
  console.log(`   ${i + 1}枚目 OK`);
}

// ② 5枚をひとまとめにした親の下書きを作る
console.log("\n② カルーセルにまとめています…");
const parent = await call(`${userId}/media`, {
  media_type: "CAROUSEL",
  children: childIds.join(","),
  caption: post.caption ?? "",
});
await waitReady(parent.id, "カルーセル本体");
console.log("   まとめ完了");

if (dryRun) {
  console.log("\n✅ 投稿直前まで成功しました（公開はしていません）");
  console.log("   この下書きは24時間で自動的に消えます。");
  process.exit(0);
}

// ③ 公開する
console.log("\n③ 公開しています…");
const published = await call(`${userId}/media_publish`, { creation_id: parent.id });
const info = await get(published.id, { fields: "permalink" });

console.log("\n✅ 投稿しました！");
console.log(`   ${info.permalink ?? published.id}`);
