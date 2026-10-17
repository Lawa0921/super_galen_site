import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {createHash} from 'node:crypto';
import path from 'node:path';
const run=path.resolve('art-factory/rts/runs/original-glove-joints/2026-10-07-v1'),out=path.resolve('tmp/rts/handoff-20261006/review-site/glove-joints');await mkdir(path.join(out,'models'),{recursive:true});
const name='glove-l-lod0.glb',bytes=await readFile(path.join(run,'candidate',name));const manifest={[name]:createHash('sha256').update(bytes).digest('hex')};await writeFile(path.join(out,'models',name),bytes);await writeFile(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2));
await copyFile('art-factory/rts/review/handoff-20261006.css',path.join(out,'app.css'));
const html=`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>原創手部｜關節變形檢視</title><link rel="stylesheet" href="./app.css"></head><body>
<header><div><p class="eyebrow">RTS · ORIGINAL CHARACTER WORKSHOP</p><h1>原創手部 · 關節變形</h1><p>來源曲面、八個四指關節環與原創開合動作。握持變形尚未通過，正在修正穿透。</p></div><a class="game-link" href="../glove-retopo/">前版靜態基底 ↗</a></header>
<main><section class="viewer" aria-label="原創手部動作"><canvas id="stage" aria-label="拖曳旋轉原創手部"></canvas><div class="stage-caption"><span id="name">載入中</span><span>動作修正中 · 非遊戲成品</span></div><p id="error" role="alert" hidden></p></section><aside>
<p class="notes">四指指節網格已重建，掌面與虎口的原始頂點保留。半握仍有拇指與食指交叉，全握也需要修正；這個頁面供定位問題使用。</p>
<fieldset><legend>檢查姿勢</legend><div class="actions"><button data-frame="0">張手</button><button data-frame="9">半握</button><button data-frame="18">握持</button></div></fieldset>
<div class="transport"><button id="play">播放</button><button id="pause">暫停</button><output id="clock">0.00 秒</output></div><label class="sr-only" for="timeline">動作時間</label><input id="timeline" type="range" min="0" max="2" step="0.001" value="0">
<label for="view">視角</label><select id="view"><option value="threequarter">斜前方</option><option value="palm">掌心</option><option value="back">手背</option><option value="side">側面</option></select><p class="notes">拖曳可旋轉，滾輪可縮放。畫面使用素模材質檢查變形，正式皮革材質與人物接合尚待完成。</p>
<dl><dt>三角面</dt><dd id="triangles">—</dd><dt>原創指骨</dt><dd>16</dd><dt>目前階段</dt><dd>指節與握持變形修正</dd></dl><details><summary>檢視檔案資訊</summary><dl><dt>檔案</dt><dd id="file">—</dd><dt>SHA-256</dt><dd id="sha">—</dd></dl></details><p class="footnote">模型、骨架與動作均為本專案原創。能播放不代表已通過動作或商用品質驗收。</p></aside></main><script type="module" src="./app.js"></script></body></html>`;
await writeFile(path.join(out,'index.html'),html);await writeFile(path.join(run,'qa/preview.html'),html);
await build({entryPoints:['art-factory/rts/tools/original_glove_joint_scene.ts'],outfile:path.join(out,'app.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,logLevel:'warning'});
console.log(JSON.stringify({preview:'http://127.0.0.1:4334/glove-joints/',manifest,runtime_publish_allowed:false}));
