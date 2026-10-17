import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {createHash} from 'node:crypto';
import path from 'node:path';
const run=path.resolve('art-factory/rts/runs/original-glove-weapon-fit/2026-10-07-v1'),out=path.resolve('tmp/rts/handoff-20261006/review-site/glove-weapon-fit');await mkdir(path.join(out,'models'),{recursive:true});
const bytes=await readFile(path.join(run,'candidate/support-grip.glb')),manifest={'support-grip.glb':createHash('sha256').update(bytes).digest('hex')};
await writeFile(path.join(out,'models/support-grip.glb'),bytes);await writeFile(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2));await copyFile('art-factory/rts/review/handoff-20261006.css',path.join(out,'app.css'));
const html=`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>原創弩兵握持檢查</title><link rel="stylesheet" href="./app.css"></head><body>
<header><div><p class="eyebrow">RTS · ORIGINAL CHARACTER WORKSHOP</p><h1>原創握持 · 接近與放開</h1><p>左手與完整原創弩的局部動作候選，尚未套回完整弩兵。</p></div><a class="game-link" href="../glove-roots/">查看指根修正 →</a></header>
<main><section class="viewer" aria-label="原創握持動畫"><canvas id="stage" aria-label="拖曳旋轉手部與弩"></canvas><div class="stage-caption"><span id="name">載入中</span><span>局部握持候選 · 未上線</span></div><p id="error" role="alert" hidden></p></section><aside>
<p class="notes">原創五指逐步包住握把；拇指張開時外展，手掌稍微退開，避免放手過程切進木柄。手部黏土材質僅供形體檢查。</p>
<fieldset><legend>檢查姿勢</legend><div class="actions"><button data-frame="0">張手</button><button data-frame="9">靠近</button><button data-frame="18">握持</button></div></fieldset>
<div class="transport"><button id="play">播放</button><button id="pause">暫停</button><output id="clock">0.00 秒</output></div><label class="sr-only" for="timeline">動畫時間</label><input id="timeline" type="range" min="0" max="2" step="0.001" value="0">
<label for="view">視角</label><select id="view"><option value="threequarter">四分之三</option><option value="palm">掌心</option><option value="back">手背</option><option value="side">側面</option><option value="whole">完整武器</option></select><p class="notes">拖曳旋轉、滾輪縮放。完整武器視角可檢查握點與弩身的關係。</p>
<dl><dt>三角面</dt><dd id="triangles">—</dd><dt>原創手骨</dt><dd>16</dd><dt>目前階段</dt><dd>局部接觸已檢查；全角色待整合</dd></dl><details><summary>檢查檔案資訊</summary><dl><dt>檔案</dt><dd id="file">—</dd><dt>SHA-256</dt><dd id="sha">—</dd></dl></details><p class="footnote">模型、骨架、動作皆為本專案原創。完整弩兵動作、材質與商用品質仍未驗收。</p></aside></main><script type="module" src="./app.js"></script></body></html>`;
await writeFile(path.join(out,'index.html'),html);await writeFile(path.join(run,'qa/preview.html'),html);
await build({entryPoints:['art-factory/rts/tools/original_glove_grip_scene.ts'],outfile:path.join(out,'app.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,logLevel:'warning'});
console.log(JSON.stringify({preview:'http://127.0.0.1:4334/glove-weapon-fit/',manifest,runtime_publish_allowed:false}));
