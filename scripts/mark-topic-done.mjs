/** 投稿が終わったネタに [済] を付ける。使い方: node scripts/mark-topic-done.mjs <投稿データ> */
import { readFileSync } from "node:fs";
import { markDone } from "./topics.mjs";

const post = JSON.parse(readFileSync(process.argv[2], "utf8"));

if (!post.category || !post.topic) {
  console.log("ネタの情報が記録されていないため、印は付けませんでした。");
  process.exit(0);
}

const date = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
const ok = markDone(post.category, post.topic, `投稿日 ${date}`);

console.log(
  ok
    ? `✅ ネタ帳に [済] を付けました: ${post.topic}`
    : `ネタ帳に該当のネタが見つかりませんでした（すでに印が付いている可能性があります）: ${post.topic}`
);
