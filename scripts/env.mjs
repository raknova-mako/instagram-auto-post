import { readFileSync } from "node:fs";

/**
 * .env を読み込んで返す。値そのものは絶対に画面に出さない。
 */
export function loadEnv(file = ".env") {
  let raw;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    console.error("❌ .env が見つかりません。");
    console.error("   .env.example をコピーして .env という名前で保存し、値を入れてください。");
    process.exit(1);
  }

  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

export function requireValue(env, key, hint) {
  const value = env[key];
  if (!value || value === "ここに貼る") {
    console.error(`❌ .env の ${key} が空です。${hint ?? ""}`);
    process.exit(1);
  }
  return value;
}
