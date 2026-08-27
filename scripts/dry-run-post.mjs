/**
 * 投稿の「直前」までを検証する。
 * コンテナ（下書き）の作成だけを行い、公開は絶対にしない。
 * → フィードには一切表示されない。作られたコンテナは24時間で自動的に消える。
 */
import { loadEnv, requireValue } from "./env.mjs";

const env = loadEnv();
const token = requireValue(env, "IG_ACCESS_TOKEN");
const userId = requireValue(env, "IG_USER_ID");

const TEST_IMAGE =
  "https://upload.wikimedia.org/wikipedia/commons/9/9a/Gull_portrait_ca_usa.jpg";

const call = async (path, { method = "GET", params = {} } = {}) => {
  const url = new URL(`https://graph.instagram.com/${path}`);
  const payload = new URLSearchParams({ ...params, access_token: token });

  const res =
    method === "POST"
      ? await fetch(url, { method, body: payload })
      : await fetch(`${url}?${payload}`);

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = body?.error ?? {};
    console.error(`\n❌ 失敗しました (HTTP ${res.status})`);
    console.error(`   内容: ${err.message ?? JSON.stringify(body)}`);
    if (String(err.message ?? "").includes("permission")) {
      console.error("\n   → 権限不足です。Metaダッシュボードの「アクセス許可と機能」で");
      console.error("     instagram_business_content_publish が追加されているか確認し、");
      console.error("     追加後にアクセストークンを再発行してください。");
    }
    process.exit(1);
  }
  return body;
};

console.log("① 下書き（コンテナ）を作成します… ※公開はしません\n");

const container = await call(`${userId}/media`, {
  method: "POST",
  params: {
    image_url: TEST_IMAGE,
    caption: "接続テスト（この投稿は公開されません）",
  },
});

console.log(`   コンテナ作成OK  id: ${container.id}`);
console.log("\n② Instagram側での画像処理を待ちます…");

let status = "IN_PROGRESS";
for (let i = 1; i <= 12 && status === "IN_PROGRESS"; i++) {
  await new Promise((r) => setTimeout(r, 2500));
  const s = await call(container.id, { params: { fields: "status_code,status" } });
  status = s.status_code ?? "UNKNOWN";
  console.log(`   ${i}回目: ${status}`);
  if (status === "ERROR") {
    console.error(`\n❌ Instagramが画像を受け付けませんでした: ${s.status ?? ""}`);
    process.exit(1);
  }
}

if (status !== "FINISHED") {
  console.error(`\n⚠️ 状態が FINISHED になりませんでした（現在: ${status}）`);
  process.exit(1);
}

console.log("\n✅ すべて成功しました");
console.log("   ・投稿権限あり");
console.log("   ・画像の取得と処理に成功");
console.log("   ・あとは「公開」を呼ぶだけで投稿できる状態");
console.log("\n※ この下書きは公開していません。24時間で自動的に消えます。");
