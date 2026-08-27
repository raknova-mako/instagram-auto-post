/** 投稿が終わったネタに [済] を付ける。使い方: node scripts/mark-topic-done.mjs <投稿データ> */
import { readFileSync } from "node:fs";
import { markDone } from "./topics.mjs";

const post = JSON.parse(readFileSync(process.argv[2], "utf8"));
if (typeof post.topicLine !== "number") {
  console.log("ネタ帳の行番号が記録されていないため、印は付けませんでした。");
  process.exit(0);
}
markDone(post.topicLine, `投稿日 ${new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" })}`);
console.log(`✅ ネタ帳に [済] を付けました: ${post.topic ?? ""}`);
