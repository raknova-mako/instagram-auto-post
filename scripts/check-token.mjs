import { loadEnv, requireValue } from "./env.mjs";

const env = loadEnv();
const token = requireValue(env, "IG_ACCESS_TOKEN", "Metaのダッシュボードで発行したトークンを貼ってください。");

const api = async (path, params = {}) => {
  const url = new URL(`https://graph.instagram.com/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", token);
  const res = await res_(url);
  return res;
};

const res_ = async (url) => {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = body?.error ?? {};
    console.error(`\n❌ Instagramに拒否されました (HTTP ${res.status})`);
    console.error(`   種類: ${err.type ?? "不明"}`);
    console.error(`   内容: ${err.message ?? JSON.stringify(body)}`);
    console.error("\n   よくある原因:");
    console.error("   ・トークンをコピーし損ねている（前後に空白や改行が混ざっている）");
    console.error("   ・「Facebookログイン」でセットアップしてしまった → Instagramログインで作り直す");
    console.error("   ・アカウントがプロアカウント（ビジネス／クリエイター）になっていない");
    process.exit(1);
  }
  return body;
};

console.log("Instagramに問い合わせています...\n");

const me = await api("me", { fields: "id,username,account_type" });
console.log("✅ トークンは有効です");
console.log(`   アカウント名 : @${me.username}`);
console.log(`   種類         : ${me.account_type ?? "(未取得)"}`);
console.log(`   ユーザーID   : ${me.id}`);

const limit = await api(`${me.id}/content_publishing_limit`, { fields: "quota_usage,config" });
const usage = limit?.data?.[0];
if (usage) {
  const quota = usage.config?.quota_total ?? "?";
  console.log(`   24時間の投稿枠: ${usage.quota_usage ?? 0} / ${quota} 使用済み`);
}

console.log("\n次にやること: このユーザーIDを .env に IG_USER_ID として追記してください。");
console.log(`IG_USER_ID=${me.id}`);
