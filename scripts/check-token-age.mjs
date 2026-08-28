/**
 * アクセストークンの残り日数を調べる。
 * Instagramの長期トークンは約60日で切れるため、切れる前に知らせる。
 *
 * 期限が近い、またはすでに使えない場合だけ、標準出力に警告文を出して終了コード1を返す。
 */
import { readFileSync } from "node:fs";
import { loadEnv, requireValue } from "./env.mjs";

const LIFETIME_DAYS = 60;
const WARN_WITHIN_DAYS = 10;

const token = requireValue(loadEnv(), "IG_ACCESS_TOKEN");
const issued = readFileSync("config/token-issued.txt", "utf8").trim();

const issuedAt = new Date(`${issued}T00:00:00+09:00`);
if (Number.isNaN(issuedAt.getTime())) {
  console.log(`config/token-issued.txt の日付を読み取れません: 「${issued}」`);
  process.exit(1);
}

const elapsed = Math.floor((Date.now() - issuedAt.getTime()) / 86400000);
const remaining = LIFETIME_DAYS - elapsed;

// トークンが今この瞬間に使えるかも確認する
const res = await fetch(
  `https://graph.instagram.com/me?fields=id&access_token=${token}`
);
const alive = res.ok;

console.error(`発行日: ${issued} / 経過 ${elapsed}日 / 残り およそ ${remaining}日 / 現在 ${alive ? "有効" : "無効"}`);

if (!alive) {
  console.log("Instagramのアクセストークンが **すでに使えなくなっています**。投稿は失敗し続けます。");
  console.log("");
  console.log("### 直しかた");
  console.log("");
  console.log("1. https://developers.facebook.com/ を開き、アプリ「インスタ自動投稿-IG」を選ぶ");
  console.log("2. 左メニュー **Instagram → InstagramログインによるAPI設定**");
  console.log("3. 「2. アクセストークンを生成する」でトークンを作り直してコピー");
  console.log("4. リポジトリの **Settings → Secrets and variables → Actions** で `IG_ACCESS_TOKEN` を更新");
  console.log("5. `config/token-issued.txt` の日付を今日に書き換える");
  process.exit(1);
}

if (remaining <= WARN_WITHIN_DAYS) {
  console.log(`Instagramのアクセストークンが、あと **およそ ${remaining}日** で期限切れになります。`);
  console.log("切れると、毎晩の投稿だけが静かに失敗するようになります。早めに更新してください。");
  console.log("");
  console.log("### 更新のしかた（3分ほど）");
  console.log("");
  console.log("1. https://developers.facebook.com/ を開き、アプリ「インスタ自動投稿-IG」を選ぶ");
  console.log("2. 左メニュー **Instagram → InstagramログインによるAPI設定**");
  console.log("3. 「2. アクセストークンを生成する」でトークンを作り直してコピー");
  console.log("4. リポジトリの **Settings → Secrets and variables → Actions** で `IG_ACCESS_TOKEN` を更新");
  console.log("5. `config/token-issued.txt` の日付を今日に書き換える");
  process.exit(1);
}

console.error("まだ余裕があります。通知は出しません。");
process.exit(0);
