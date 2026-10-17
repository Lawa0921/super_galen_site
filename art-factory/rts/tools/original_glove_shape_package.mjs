import {readFile,writeFile,copyFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import path from 'node:path';
const run=path.resolve('art-factory/rts/runs/original-glove-shape/2026-10-06-v1'),out=path.resolve('tmp/rts/handoff-20261006/review-site/glove-sculpt');await mkdir(out,{recursive:true});
const bytes=await readFile(path.join(run,'candidate/candidate.glb'));await writeFile(path.join(out,'source.glb'),bytes);await writeFile(path.join(out,'manifest.json'),JSON.stringify({sha256:createHash('sha256').update(bytes).digest('hex'),runtime_publish_allowed:false},null,2));
await copyFile(path.join(run,'raw/input.png'),path.join(out,'reference.png'));
const css=await readFile('art-factory/rts/review/handoff-20261006.css','utf8');await writeFile(path.join(out,'app.css'),css+'\n.reference{display:block;width:100%;height:auto;max-height:340px;object-fit:contain;background:#26342e;border:1px solid #536258;border-radius:8px}a{color:inherit}\n');
await writeFile(path.join(out,'index.html'),`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>原創手套 · 雕塑試作</title><link rel="stylesheet" href="./app.css"></head><body>
<header><div><p class="eyebrow">RTS · ORIGINAL CHARACTER WORKSHOP</p><h1>原創手套 · 雕塑試作</h1><p>從原創左手設計製作的立體形狀，檢查掌墊、指腹與手套結構。</p></div><a class="game-link" href="../glove-tailoring/">開合模型比較 ↗</a></header>
<main><section class="viewer" aria-label="原創手套雕塑"><canvas id="stage" aria-label="拖曳旋轉原創手套"></canvas><div class="stage-caption"><span id="status">載入中</span><span>形狀試作 · 非遊戲成品</span></div><p id="error" role="alert" hidden></p></section><aside>
<fieldset><legend>檢視角度</legend><div class="actions"><button data-view="palm">掌面</button><button data-view="back">手背</button><button data-view="side">側面</button><button data-view="threequarter">斜前方</button></div></fieldset><label><input id="rotate" type="checkbox"> 自動旋轉</label><p class="notes">拖曳可自由旋轉，滾輪可縮放。畫面使用素模材質，方便查看真實表面。</p>
<p class="eyebrow">原創設計參考</p><img id="reference" class="reference" src="./reference.png" alt="原創左手皮手套的掌面設計參考"><p class="notes">模型與圖像均為本專案原創生成。這版尚未綁骨、沒有開合動作，也尚未接回人物。</p>
<dl><dt>高模三角面</dt><dd id="triangles">—</dd><dt>目前階段</dt><dd>形狀與結構檢查</dd></dl><p class="footnote">後續還需修形、重拓撲、材質、原創骨架適配與完整動作驗證。</p></aside></main><script type="module" src="./app.js"></script></body></html>`);
await build({entryPoints:['art-factory/rts/tools/original_glove_shape_scene.ts'],outfile:path.join(out,'app.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,logLevel:'warning'});console.log('http://127.0.0.1:4334/glove-sculpt/');
