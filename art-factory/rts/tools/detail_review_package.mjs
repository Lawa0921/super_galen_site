import {build} from 'esbuild';
import {mkdir,copyFile,readFile,writeFile,readdir} from 'node:fs/promises';
import path from 'node:path';
const run='art-factory/rts/runs/detail-refinement/2026-10-07-v1';
const out='tmp/rts/handoff-20261006/review-site/model-detail';
const assets=(await readdir(`${run}/candidate`)).filter(n=>n.endsWith('.glb')).map(n=>n.slice(0,-4));
const originals={};
for(const kind of ['building','unit','prop'])try{for(const entry of JSON.parse(await readFile(`${run}/raw/previous-registries/${kind}-registry.json`,'utf8')).assets)originals[entry.id]=entry.candidate;}catch{}
assets.sort((a,b)=>(a==='townhall'?-1:b==='townhall'?1:a.localeCompare(b)));
for(const version of ['before','after']){
  await mkdir(`${out}/${version}`,{recursive:true});
  for(const asset of assets){
    const dest=`${out}/${version}/${asset}.glb`;
    if(version==='before')try{await readFile(dest);continue;}catch{}
    await copyFile(version==='before'?(originals[asset]??`public/assets/games/rts/models/${asset}.glb`):`${run}/candidate/${asset}.glb`,dest);
  }
}
const materialOut=out+'/materials/detail-v1';
await mkdir(materialOut,{recursive:true});
for(const file of await readdir(`${run}/candidate/materials`))await copyFile(`${run}/candidate/materials/${file}`,`${materialOut}/${file}`);
await writeFile(`${out}/assets.json`,JSON.stringify(assets));
await writeFile(`${out}/index.html`,`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><link rel="icon" href="data:,"><title>曦境戰紀 · 模型細節比較</title><style>
*{box-sizing:border-box}body{margin:0;background:#141e21;color:#e5ddca;font:16px system-ui,sans-serif}header{padding:20px 28px;border-bottom:1px solid #697259}h1{font-size:24px;margin:0 0 12px}p{margin:8px 0;color:#b7c5ba}a{color:#e7c37e}button,select{background:#263634;color:inherit;border:1px solid #627568;padding:9px 14px;margin-right:8px;font:inherit}.views{display:grid;grid-template-columns:1fr 1fr;gap:2px}.panel{position:relative}canvas{width:100%;height:calc(100vh - 205px);display:block}.tag{position:absolute;top:18px;left:22px;pointer-events:none;color:#efdeb1}footer{padding:14px 28px}</style>
<header><h1>曦境戰紀 · 原創模型細節</h1><p>左右為相同鏡頭與光照。拖曳旋轉、滾輪放大；人物可切換五段動畫與雙 LOD。</p><select id="asset"></select><select id="clip"><option value="Idle">待機</option><option value="Walk">行走</option><option value="Attack">攻擊</option><option value="Hurt">受傷</option><option value="Death">死亡</option></select><button id="pause">暫停</button><button id="front">正面</button><button id="back">背面</button><a href="http://127.0.0.1:4324/games/rts/" target="_blank">開啟遊戲</a></header>
<div class="views"><div class="panel"><span class="tag">修改前</span><canvas id="before"></canvas></div><div class="panel"><span class="tag">修改後</span><canvas id="after"></canvas></div></div><script type="module" src="./app.js"></script></html>`);
await build({entryPoints:['art-factory/rts/tools/detail_review.ts'],outfile:`${out}/app.js`,bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,logLevel:'warning'});
const mapRows=[];
for(const map of ['river','pass'])for(const view of ['base','crossing','forest','overview']){
 const filename=`${map}-${view}.png`;
 for(const version of ['before','after']){
  const source=version==='before'?'art-factory/rts/runs/landscape-districts/2026-10-07-v1/qa/published':run+'/qa/published';
  try{await mkdir(`${out}/maps/${version}`,{recursive:true});await copyFile(`${source}/${filename}`,`${out}/maps/${version}/${filename}`);}catch{continue;}
 }
 mapRows.push(`<section><h2>${map==='river'?'雙河谷地':'灰脊隘口'} · ${{base:'基地',crossing:'通道',forest:'林緣',overview:'全景'}[view]}</h2><div class="pair">${['before','after'].map(v=>`<figure><figcaption>${v==='before'?'修改前':'修改後'}</figcaption><a href="maps/${v}/${filename}" target="_blank"><img src="maps/${v}/${filename}" loading="lazy"></a></figure>`).join('')}</div></section>`);
}
await writeFile(`${out}/maps.html`,`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="icon" href="data:,"><title>曦境戰紀 · 地圖細節比較</title><style>body{margin:24px;background:#141e21;color:#e5ddca;font:16px system-ui,sans-serif}a{color:#e7c37e}h1{font-size:26px}h2{font-size:20px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:14px}figure{margin:0}figcaption{padding:10px 0}img{width:100%}section{margin:36px 0}@media(max-width:800px){.pair{grid-template-columns:1fr}}</style><h1>曦境戰紀 · 地圖表面與岩岸細節</h1><p>本輪細修石材、橋欄、岩面與地表光照。畫面可點開原始截圖；全景為檢視模式揭露地圖，正常遊戲保留戰爭迷霧。</p><p><a href="./">互動模型比較</a> · <a href="http://127.0.0.1:4324/games/rts/">開啟遊戲</a></p>${mapRows.join('')}</html>`);
const index=await readFile(`${out}/index.html`,'utf8');await writeFile(`${out}/index.html`,index.replace('<div class="views">','<div style="padding:10px 28px"><a href="./maps.html">兩張地圖前後比較</a></div><div class="views">'));
console.log(JSON.stringify({out,assets}));
