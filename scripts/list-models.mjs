/** このAPIキーで使えるGeminiモデルを一覧表示する */
import { loadEnv, requireValue } from "./env.mjs";

const key = requireValue(loadEnv(), "GEMINI_API_KEY", "Google AI Studio で取得したキーを貼ってください。");

const res = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models?key=${key}&pageSize=200`
);
const body = await res.json().catch(() => ({}));

if (!res.ok) {
  console.error(`❌ 失敗しました (HTTP ${res.status}): ${body?.error?.message ?? ""}`);
  process.exit(1);
}

const usable = (body.models ?? [])
  .filter((m) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
  .filter((m) => !/embedding|aqa|imagen|veo|tts|image|live|native-audio/i.test(m.name))
  .map((m) => m.name.replace("models/", ""))
  .sort();

console.log(`✅ 文章生成に使えるモデル ${usable.length}件\n`);
for (const n of usable) console.log(`   ${n}`);
