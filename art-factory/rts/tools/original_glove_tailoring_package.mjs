import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {createHash} from 'node:crypto';
import path from 'node:path';
const root=process.cwd(),run=path.join(root,'art-factory/rts/runs/original-glove-tailoring/2026-10-06-v1');
const baseline=path.join(root,'art-factory/rts/runs/original-articulated-glove/2026-10-06-v1'),out=path.join(root,'tmp/rts/handoff-20261006/review-site/glove-tailoring');
const manifest={};
for(const [revision,source] of [['current',run],['baseline',baseline]]){
 await mkdir(path.join(out,'models',revision),{recursive:true});
 for(const side of ['r','l'])for(const lod of [0,1]){const name=`glove-${side}-lod${lod}.glb`,bytes=await readFile(path.join(source,'candidate',name));manifest[`${revision}/${name}`]=createHash('sha256').update(bytes).digest('hex');await writeFile(path.join(out,'models',revision,name),bytes);}
}
await writeFile(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2));await copyFile(path.join(root,'art-factory/rts/review/handoff-20261006.css'),path.join(out,'app.css'));
await copyFile(path.join(root,'art-factory/rts/runs/original-glove-sculpt-guide/2026-10-06-v1/raw/palm-sculpt-reference-v1.png'),path.join(out,'reference-left-palm.png'));
const html=`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>原創手部｜掌面與指形修整</title><link rel="stylesheet" href="./app.css"></head>
<body><header><div><p class="eyebrow">RTS · ORIGINAL CHARACTER WORKSHOP</p><h1>原創手部 · 掌面與指形修整</h1><p>用相同姿勢比對掌墊、指腹、指縫與袖口。人物接合與手套細節仍在製作。</p></div><a class="game-link" href="../crossbow-attack/">弩兵檢視 ↗</a></header>
<main><section class="viewer" aria-label="手部造型比對"><canvas id="stage" aria-label="原創手套三維開合"></canvas><div class="stage-caption"><span id="name">載入中</span><span>製作中 · 尚未接回人物</span></div><p id="error" role="alert" hidden></p></section><aside>
<div class="row"><label for="revision">版本<select id="revision"><option value="current">掌面與指形修整</option><option value="baseline">前一版開合基礎</option></select></label><label for="surface">檢視<select id="surface"><option value="leather">原創皮革</option><option value="clay">素模觀察</option></select></label></div>
<p class="notes">切換版本會保留姿勢；素模方便觀察表面起伏。這是懸空彎指，實際握弩、手套縫線與人物接合仍待完成。</p>
<p class="notes"><a href="./reference-left-palm.png">原創左手掌面細節參考 ↗</a>（概念圖，尚未套用至模型）</p>
<fieldset><legend>姿勢</legend><div class="actions"><button data-frame="0">張手</button><button data-frame="9">半彎</button><button data-frame="18">彎指</button></div></fieldset>
<div class="transport"><button id="play">播放</button><button id="pause">暫停</button><output id="clock">0.00 秒</output></div><label class="sr-only" for="timeline">動作時間</label><input id="timeline" type="range" min="0" max="2" step="0.001" value="0">
<fieldset><legend>視角與模型</legend><label for="view">視角<select id="view"><option value="threequarter">斜前方</option><option value="palm">掌心</option><option value="back">手背</option><option value="side">側面</option></select></label><div class="row"><label for="side">手部<select id="side"><option value="r">右手</option><option value="l">左手</option></select></label><label for="lod">精細度<select id="lod"><option value="0">LOD 0 · 近景</option><option value="1">LOD 1 · 遠景</option></select></label></div></fieldset>
<dl><dt>實際載入</dt><dd id="file">—</dd><dt>三角面</dt><dd id="triangles">—</dd><dt>SHA-256</dt><dd id="sha">—</dd></dl><p class="footnote">模型、指節與動作均為本專案原創。此候選尚未通過整體人物商用品質驗收。</p></aside></main><script type="module" src="./app.js"></script></body></html>`;
await writeFile(path.join(out,'index.html'),html);await writeFile(path.join(run,'qa/preview.html'),html);
await build({entryPoints:[path.join(root,'art-factory/rts/tools/original_glove_tailoring_scene.ts')],outfile:path.join(out,'app.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,logLevel:'warning'});
console.log(JSON.stringify({url:'http://127.0.0.1:4334/glove-tailoring/',manifest,runtime_publish_allowed:false}));
