/**
 * Geminiに「決まった形のJSON」を書かせる共通部品。
 * 混雑（503）が頻発するため、複数モデル・複数回・複数周のリトライを内蔵する。
 */
import { loadEnv, requireValue } from "./env.mjs";

const sleep = (sec) => new Promise((r) => setTimeout(r, sec * 1000));

export async function generateJson({ prompt, schema, label = "原稿" }) {
  const env = loadEnv();
  const key = requireValue(env, "GEMINI_API_KEY", "Google AI Studio で取得したキーが必要です。");

  // 3.7-flash は混雑が慢性化しているため既定では後回しにする
  const preferred = env.GEMINI_MODEL || "gemini-3.6-flash";
  // 上から順に試す。gemini-2.5-flash は廃止済みなので入れない
  const candidates = [...new Set([
    preferred,
    "gemini-3.7-flash",
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.8-flash",
    "gemini-flash-latest",
    "gemini-pro-latest",
  ])];

  const ask = async (name) => {
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
        const { ok, status, body } = await ask(name);

        if (ok) {
          text = body?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "";
          if (text) {
            usedModel = name;
            break outer;
          }
          console.log(`   ${name}: 空の返事（理由: ${body?.candidates?.[0]?.finishReason ?? "不明"}）`);
          continue;
        }

        const message = body?.error?.message ?? "";

        // 無料枠の使い切りは、待っても今日は回復しない。すぐ次のモデルへ移る
        if (status === 429 && /quota/i.test(message)) {
          console.log(`   ${name}: 今日の無料枠を使い切っています。次のモデルを試します`);
          break;
        }

        // 混雑や一時的な回数制限は、待てば直る可能性がある
        if (status === 429 || status >= 500) {
          const wait = attempt * 10;
          console.log(`   ${name}: 混雑中(${status})。${wait}秒待って再挑戦（${attempt}/2）`);
          await sleep(wait);
          continue;
        }

        // 設定ミスなどは待っても直らないので、次のモデルへ
        console.error(`   ${name}: エラー (HTTP ${status}) ${message}`);
        break;
      }
    }
  }

  if (!text) {
    console.error(`❌ すべてのモデルが混雑していて、${label}を作れませんでした。`);
    console.error("   時間をおいて実行し直してください。");
    process.exit(1);
  }

  console.log(`   使用モデル: ${usedModel}`);

  try {
    return JSON.parse(text);
  } catch {
    console.error(`❌ AIの返事を読み取れませんでした。もう一度実行してください。`);
    process.exit(1);
  }
}
