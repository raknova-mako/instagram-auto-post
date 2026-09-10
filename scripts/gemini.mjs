/**
 * Geminiに「決まった形のJSON」を書かせる共通部品。
 * 混雑（503）が頻発するため、複数モデル・複数回・複数周のリトライを内蔵する。
 */
import { writeFileSync } from "node:fs";
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
  // 失敗したときに原因が分かるよう、やりとりの結果を記録しておく
  const attemptLog = [];

  // ここで粘りすぎると1回の実行が10分以上かかる。
  // 早めに諦めても、次の定期実行が作り直してくれるので、短く切り上げる。
  outer: for (const name of candidates) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const { ok, status, body } = await ask(name);

      if (ok) {
        text = body?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "";
        if (text) {
          usedModel = name;
          break outer;
        }
        const why = body?.candidates?.[0]?.finishReason ?? "不明";
        attemptLog.push(`${name}: 空の返事（理由: ${why}）`);
        console.log(`   ${name}: 空の返事（理由: ${why}）`);
        continue;
      }

      const message = body?.error?.message ?? "";

      // 無料枠の使い切りは、待っても今日は回復しない。すぐ次のモデルへ移る
      if (status === 429 && /quota/i.test(message)) {
        attemptLog.push(`${name}: HTTP 429 無料枠切れ — ${message}`);
        console.log(`   ${name}: 今日の無料枠を使い切っています。次のモデルを試します`);
        break;
      }

      // 混雑や一時的な回数制限は、待てば直る可能性がある
      if (status === 429 || status >= 500) {
        const wait = attempt * 5;
        attemptLog.push(`${name}: HTTP ${status} — ${message || "(本文なし)"}`);
        console.log(`   ${name}: 混雑中(${status})。${wait}秒待って再挑戦（${attempt}/2）`);
        await sleep(wait);
        continue;
      }

      // 設定ミスなどは待っても直らないので、次のモデルへ
      attemptLog.push(`${name}: HTTP ${status} — ${message || "(本文なし)"}`);
      console.error(`   ${name}: エラー (HTTP ${status}) ${message}`);
      break;
    }
  }

  if (!text) {
    // あとから原因を追えるよう、実際に返ってきた内容をファイルに残す
    const report = attemptLog.length ? attemptLog.join(String.fromCharCode(10)) : "記録がありません";
    try {
      writeFileSync("gemini-errors.txt", report, "utf8");
    } catch {
      // 書けなくても本題ではないので進める
    }
    console.error(`❌ どのモデルでも${label}を作れませんでした。返ってきた内容:`);
    console.error(report);
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
