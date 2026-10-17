import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {createHash} from 'node:crypto';
import path from 'node:path';
const root=process.cwd(),run=path.join(root,'art-factory/rts/runs/original-articulated-glove/2026-10-06-v1'),out=path.join(root,'tmp/rts/handoff-20261006/review-site/articulated-glove');await mkdir(path.join(out,'models'),{recursive:true});
const manifest={};for(const side of ['r','l'])for(const lod of [0,1]){const name=`glove-${side}-lod${lod}.glb`,bytes=await readFile(path.join(run,'candidate',name));manifest[name]=createHash('sha256').update(bytes).digest('hex');await writeFile(path.join(out,'models',name),bytes);}
await writeFile(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2));
await copyFile(path.join(root,'art-factory/rts/review/handoff-20261006.css'),path.join(out,'app.css'));
const html=`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>原創手部｜指節重製</title><link rel="stylesheet" href="./app.css"></head>
<body><header><div><p class="eyebrow">RTS · ORIGINAL CHARACTER WORKSHOP</p><h1>原創手部 · 指節重製</h1><p>五指連續網格與原創骨架的開合檢視。這是製作中的手部候選，尚未接回人物。</p></div><a class="game-link" href="../crossbow-attack/">返回弩兵檢視 ↗</a></header>
<main><section class="viewer" aria-label="三維手部檢視"><canvas id="stage" aria-label="原創手套開合動作"></canvas><div class="stage-caption"><span id="name">載入中</span><span id="status">候選 · 人物接合與外觀待完成</span></div><p id="error" role="alert" hidden></p></section><aside>
<label for="side">手部</label><select id="side"><option value="r">右手</option><option value="l">左手</option></select><p class="notes">可播放張手、彎指及恢復過程。手套掌面、縫線、人物接合與握弩裝填仍待完成。</p>
<fieldset><legend>檢查姿勢</legend><div class="actions"><button data-frame="0">張手</button><button data-frame="9">半握</button><button data-frame="18">握持</button></div></fieldset>
<div class="transport"><button id="play">播放</button><button id="pause">暫停</button><output id="clock">0.00 秒</output></div><label class="sr-only" for="timeline">動作時間</label><input id="timeline" type="range" min="0" max="2" step="0.001" value="0">
<fieldset><legend>視角與模型</legend><div class="row"><label for="view">視角<select id="view"><option value="threequarter">斜前方</option><option value="palm">掌心</option><option value="back">手背</option><option value="side">側面</option></select></label><label for="lod">精細度<select id="lod"><option value="0">LOD 0 · 近景</option><option value="1">LOD 1 · 遠景</option></select></label></div></fieldset>
<dl><dt>實際載入</dt><dd id="file">—</dd><dt>三角面</dt><dd id="triangles">—</dd><dt>檔案指紋 SHA-256</dt><dd id="sha">—</dd></dl><p class="footnote">所有模型、指節與動作均為本專案原創製作。能播放不代表已通過人物或商用品質驗收。</p></aside></main><script type="module" src="./app.js"></script></body></html>`;
await writeFile(path.join(out,'index.html'),html);await writeFile(path.join(run,'qa/preview.html'),html);
await build({entryPoints:[path.join(root,'art-factory/rts/tools/original_glove_scene.ts')],outfile:path.join(out,'app.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,logLevel:'warning'});
console.log(JSON.stringify({url:'http://127.0.0.1:4334/articulated-glove/',manifest,runtime_publish_allowed:false}));
