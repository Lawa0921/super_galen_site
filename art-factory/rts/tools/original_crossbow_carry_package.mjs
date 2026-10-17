import {build} from 'esbuild';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const root=process.cwd(),run=process.argv[2]?path.resolve(process.argv[2]):path.join(root,'art-factory/rts/runs/original-crossbow-carry/2026-10-06-v1');
const slug=process.argv[3]??'crossbow-carry';
if(!/^[a-z0-9-]+$/.test(slug))throw new Error('Review folder must be a simple slug');
const topology=run.includes('original-crossbow-wrist-topology');
const surface=run.includes('original-crossbow-team-surface');
const bodySurface=run.includes('original-crossbow-body-surface');
const drape=run.includes('original-crossbow-drape');
const attack=run.includes('original-crossbow-attack');
const out=path.join(root,'tmp/rts/handoff-20261006/review-site',slug);
await mkdir(path.join(out,'models'),{recursive:true});
const hashes=[];
for(const lod of [0,1]){
 const name=`original-crossbow-grip-lod${lod}.glb`,bytes=await readFile(path.join(run,'candidate',name));
 hashes.push(createHash('sha256').update(bytes).digest('hex'));await writeFile(path.join(out,'models',name),bytes);
}
let html=await readFile(path.join(root,'art-factory/rts/runs/original-crossbow-carry/2026-10-06-v1/qa/crossbow-preview.html'),'utf8');
if(attack)html=html.replace('RTS 原創人物｜10 月 6 日驗收','RTS 原創弩兵｜射擊動作候選').replace('>攻擊／工作<','>射擊<');
await writeFile(path.join(run,'qa/crossbow-preview.html'),html);
html=html.replace('/art-factory/rts/review/handoff-20261006.css','./app.css').replace('/art-factory/rts/tools/original_crossbow_review_scene.ts','./app.js').replace('href="/games/rts/"','href="http://127.0.0.1:4324/games/rts/"').replace('原創人物與動作驗收','原創弩兵 · 持弩動作修整');
await writeFile(path.join(out,'index.html'),html);
await copyFile(path.join(root,'art-factory/rts/review/handoff-20261006.css'),path.join(out,'app.css'));
await writeFile(path.join(out,'crossbow-preview.json'),JSON.stringify({crossbow:{name:surface?'原創弩兵 · 衣料染色修整':topology?'原創弩兵 · 前臂接合修整':'原創弩兵 · 新袖口與持弩動作',status:'修整中 · 尚未替換遊戲內模型',notes:surface?'沿原創貼圖逐像素染色，保留衣甲細節，可切換藍／紅隊檢查。原有幾何開口、手套材質與整體動作仍待修整。':topology?'三處前臂沿原始輪廓重建，保留原創骨架與動作。肩背破面、近端接縫與手套材質仍未通過整體品質檢查。':'可檢查雙手握持、射擊後座與倒地。肩部表面、手套材質及整體動作品質仍待修整。',base:'./models',stem:'original-crossbow-grip',hashes}},null,2)+'\n');
if(bodySurface){
 const metadata=JSON.parse(await readFile(path.join(out,'crossbow-preview.json'),'utf8'));
 metadata.crossbow.name='原創弩兵 · 連續表面重建';
 metadata.crossbow.notes='從原創母模重建連續身體與袖口，保留原創骨架、五種動作與藍／紅衣料染色。可檢查肩背與腋下接合；臉部、手套材質及整體動作品質仍待修整。';
 await writeFile(path.join(out,'crossbow-preview.json'),JSON.stringify(metadata,null,2)+'\n');
}
if(drape){
 const metadata=JSON.parse(await readFile(path.join(out,'crossbow-preview.json'),'utf8'));
 metadata.crossbow.name='原創弩兵 · 裙甲貼圖修整';
 metadata.crossbow.notes='重新展開腰帶與裙甲的貼圖座標，從同一原創母模轉印衣料、皮革與金邊。可切換藍／紅隊、五種動作及精細度檢查；人物形狀、臉部、手套及動作自然度仍需修整。';
 await writeFile(path.join(out,'crossbow-preview.json'),JSON.stringify(metadata,null,2)+'\n');
}
if(attack){
 const metadata=JSON.parse(await readFile(path.join(out,'crossbow-preview.json'),'utf8'));
 metadata.crossbow.name='原創弩兵 · 瞄準與射擊動作';
 metadata.crossbow.status='動作局部已修正 · 裝填仍待重製';
 metadata.crossbow.notes='舉弩、朝前瞄準、後座與收回握持已修正；可選「射擊」後播放或拖曳時間軸。射後左手手勢仍穿模，弩弦尚未可動；手指開合與手套造型需重製，尚未接入遊戲。';
 await writeFile(path.join(out,'crossbow-preview.json'),JSON.stringify(metadata,null,2)+'\n');
}
await build({entryPoints:[path.join(root,'art-factory/rts/tools/original_crossbow_review_scene.ts')],outfile:path.join(out,'app.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,logLevel:'warning'});
console.log(JSON.stringify({out,hashes,url:`http://127.0.0.1:4334/${slug}/`,runtime_publish_allowed:false}));
