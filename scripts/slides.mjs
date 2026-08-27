/**
 * 投稿データ(JSON) → 各スライドのHTML を組み立てる。
 */
import { readFileSync } from "node:fs";

const css = readFileSync("templates/base.css", "utf8");

/** カテゴリごとの配色 */
export const THEMES = {
  sheets:   { accent: "#0F9D58", marker: "#C7EBD8", name: "スプレッドシート" },
  appsheet: { accent: "#1A73E8", marker: "#CFE0FC", name: "AppSheet" },
  google:   { accent: "#E37400", marker: "#FBE2C0", name: "Googleの便利機能" },
};

const esc = (t = "") =>
  String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** <mark> による強調だけ許可する */
const withMark = (t = "") =>
  esc(t).replace(/&lt;mark&gt;/g, "<mark>").replace(/&lt;\/mark&gt;/g, "</mark>");

/** 数式に軽く色を付ける（関数名と文字列） */
const highlight = (formula = "") =>
  esc(formula)
    .replace(/&quot;[^&]*?&quot;/g, (m) => `<span class="s">${m}</span>`)
    .replace(/"[^"]*"/g, (m) => `<span class="s">${m}</span>`)
    .replace(/\b([A-Z][A-Z0-9_.]{2,})\(/g, '<span class="k">$1</span>(');

const shell = (theme, bodyClass, inner) => `<!doctype html>
<meta charset="utf-8">
<style>
:root { --accent: ${theme.accent}; --marker: ${theme.marker}; }
${css}
</style>
<body class="${bodyClass}">
${inner}
</body>`;

/** 表（スプレッドシート風）を描く */
const sheetTable = (sheet) => {
  if (!sheet) return "";
  const cols = ["A", "B", "C", "D", "E", "F"].slice(0, sheet.headers.length);
  const head = `<tr><th style="width:70px"></th>${cols
    .map((c) => `<th>${c}</th>`)
    .join("")}</tr>`;
  const titleRow = `<tr><th>1</th>${sheet.headers
    .map((h) => `<td>${esc(h)}</td>`)
    .join("")}</tr>`;
  const rows = sheet.rows
    .map(
      (r, i) =>
        `<tr><th>${i + 2}</th>${r
          .map((cell) => {
            const hi = typeof cell === "string" && cell.startsWith("*");
            return `<td class="${hi ? "hi" : ""}">${esc(hi ? cell.slice(1) : cell)}</td>`;
          })
          .join("")}</tr>`
    )
    .join("");
  return `<div class="sheet"><table><thead>${head}</thead><tbody>${titleRow}${rows}</tbody></table></div>`;
};

const formulaBlock = (formula) =>
  formula
    ? `<div class="formula"><span class="fx">fx</span><code>${highlight(formula)}</code></div>`
    : "";

/** 数式を部分ごとに日本語で説明するブロック */
const explainBlock = (step) => {
  if (!step.explain) return "";
  const head = step.formula
    ? `<div class="formula explain-formula"><code>${highlight(step.formula)}</code></div>`
    : "";
  const rows = step.explain
    .map(
      (e) =>
        `<div class="row"><code>${esc(e.part)}</code><span>${esc(e.means)}</span></div>`
    )
    .join("");
  return `${head}<div class="explain">${rows}</div>`;
};

export const coverHtml = (post, theme, total) =>
  shell(
    theme,
    "cover",
    `<div class="topbar"></div>
     <div class="pill">${esc(post.cover.label)}</div>
     <div class="headline-area"><h1 class="headline">${withMark(post.cover.headline)}</h1></div>
     <p class="sub">${withMark(post.cover.sub)}</p>
     <div class="footer">
       <div class="account">${esc(post.account)}</div>
       <div class="swipe">スワイプで手順 →</div>
     </div>`
  );

export const stepHtml = (step, index, post, theme, total) => {
  const hasVisual = Boolean(step.formula || step.sheet || step.explain);

  const visual = hasVisual
    ? `<div class="visual">
         ${step.explain ? explainBlock(step) : formulaBlock(step.formula)}
         ${sheetTable(step.sheet)}
         ${step.note ? `<p class="caption-note">${esc(step.note)}</p>` : ""}
       </div>`
    : "";

  // 図がない場合は、文章を大きくして上下中央に置く（空白が目立たないように）
  const text = `<h2 class="title">${withMark(step.title)}</h2>
       <p class="body">${withMark(step.body)}</p>
       ${!hasVisual && step.note ? `<p class="caption-note">${esc(step.note)}</p>` : ""}`;

  return shell(
    theme,
    hasVisual ? "step" : "step step--novisual",
    `<div class="topbar"></div>
     <div class="head">
       <div class="stepno">STEP ${index}</div>
       <div class="cat">${esc(post.cover.label)}</div>
     </div>
     ${hasVisual ? text : `<div class="text-area">${text}</div>`}
     ${visual}
     <div class="page-no">${index + 1} / ${total}</div>`
  );
};

export const outroHtml = (post, theme, total) =>
  shell(
    theme,
    "outro",
    `<div class="lead">${esc(post.outro.lead ?? "最後まで見ていただきありがとうございます")}</div>
     <h2 class="headline">${withMark(post.outro.headline)}</h2>
     <ul>${(post.outro.bullets ?? []).map((b) => `<li>${esc(b)}</li>`).join("")}</ul>
     <div class="spacer"></div>
     <div class="cta">${esc(post.outro.cta)}</div>`
  );
