import { readFileSync } from "node:fs";

/**
 * 設定を読み込む。
 * 手元のPCでは .env ファイルから、GitHub上では環境変数（Secrets）から読む。
 * 値そのものは絶対に画面に出さない。
 */
export function loadEnv(file = ".env") {
  const env = {};

  try {
    const raw = readFileSync(file, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    }
  } catch {
    // .env が無い場合は環境変数だけを使う（GitHub上での実行がこれにあたる）
  }

  // 環境変数が指定されていれば、そちらを優先する
  for (const key of ["IG_ACCESS_TOKEN", "IG_USER_ID", "GEMINI_API_KEY", "GEMINI_MODEL", "IG_ACCOUNT_NAME"]) {
    if (process.env[key]) env[key] = process.env[key];
  }

  return env;
}

export function requireValue(env, key, hint) {
  const value = env[key];
  if (!value || value === "ここに貼る") {
    console.error(`❌ ${key} が設定されていません。${hint ?? ""}`);
    console.error("   手元のPCなら .env ファイル、GitHub上なら Secrets を確認してください。");
    process.exit(1);
  }
  return value;
}
