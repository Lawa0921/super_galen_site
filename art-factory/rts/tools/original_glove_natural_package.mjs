import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {createHash} from 'node:crypto';
import path from 'node:path';
const run=path.resolve('art-factory/rts/runs/original-glove-power-grip/2026-10-07-v1'),out=path.resolve('tmp/rts/handoff-20261006/review-site/glove-natural');
const bytes=await readFile(path.join(run,'candidate/natural-hand.glb')),sha=createHash('sha256').update(bytes).digest('hex');
const qa=JSON.parse(await readFile(path.join(run,'qa/natural-motion-glb.json'),'utf8'));
if(!qa.pass||qa.glb_sha256!==sha)throw Error('實際匯出動作尚未驗證');
await mkdir(path.join(out,'models'),{recursive:true});
await writeFile(path.join(out,'models/natural-hand.glb'),bytes);
await writeFile(path.join(out,'manifest.json'),JSON.stringify({'natural-hand.glb':sha},null,2));
await copyFile('art-factory/rts/review/handoff-20261006.css',path.join(out,'app.css'));
const html=`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>原創手部｜五指動作檢視</title><link rel="stylesheet" href="./app.css"></head><body>
<header><div><p class="eyebrow">RTS · ORIGINAL CHARACTER WORKSHOP</p><h1>原創手部 · 五指開合</h1><p>修正拇指誤綁與指縫折疊，加入指根參與的同步開合動作。武器握持與完整角色尚未完成。</p></div><a class="game-link" href="../glove-weapon-fit/">前版握弩檢視 ↗</a></header>
<main><section class="viewer" aria-label="原創手部動作"><canvas id="stage" aria-label="拖曳旋轉原創手部"></canvas><div class="stage-caption"><span id="name">載入中</span><span>動作修整 · 非遊戲成品</span></div><p id="error" role="alert" hidden></p></section><aside>
<p class="notes">保留原創手形與骨架，修正拇指對指縫的錯誤拉扯。五指同步彎曲的來源模型與匯出模型，各 385 個姿勢取樣未測出穿插。</p>
<fieldset><legend>檢查姿勢</legend><div class="actions"><button data-frame="0">張手</button><button data-frame="9">半彎</button><button data-frame="18">彎曲</button></div></fieldset>
<div class="transport"><button id="play">播放</button><button id="pause">暫停</button><output id="clock">0.00 秒</output></div><label class="sr-only" for="timeline">動作時間</label><input id="timeline" type="range" min="0" max="2" step="0.001" value="0">
<label for="view">視角</label><select id="view"><option value="threequarter">斜前方</option><option value="palm">掌心</option><option value="back">手背</option><option value="side">側面</option></select><p class="notes">拖曳旋轉、滾輪縮放。素模用於檢查形狀與變形，正式皮革材質、握弩及人物接合仍在製作。</p>
<dl><dt>三角面</dt><dd id="triangles">—</dd><dt>原創指骨</dt><dd>16</dd><dt>目前階段</dt><dd>五指同步動作修整</dd></dl><details><summary>檢視檔案資訊</summary><dl><dt>檔案</dt><dd id="file">—</dd><dt>SHA-256</dt><dd id="sha">—</dd></dl></details><p class="footnote">模型、骨架與動作均為本專案原創。局部變形通過不等於完整人物達到商用品質。</p></aside></main><script type="module" src="./app.js"></script></body></html>`;
await writeFile(path.join(out,'index.html'),html);await writeFile(path.join(run,'qa/natural-preview.html'),html);
await build({entryPoints:['art-factory/rts/tools/original_glove_natural_scene.ts'],outfile:path.join(out,'app.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,logLevel:'warning'});
console.log(JSON.stringify({preview:'http://127.0.0.1:4334/glove-natural/',sha,runtime_publish_allowed:false}));
