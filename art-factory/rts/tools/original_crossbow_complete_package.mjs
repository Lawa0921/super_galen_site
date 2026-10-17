import {spawnSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
const run=path.resolve(process.argv[2]??'art-factory/rts/runs/original-crossbow-complete/2026-10-07-v1');
const slug=process.argv[3]??'crossbow-complete';
if(!/^[a-z0-9-]+$/.test(slug))throw new Error('Invalid local review slug');
const result=spawnSync(process.execPath,['art-factory/rts/tools/original_crossbow_carry_package.mjs',run,slug],{stdio:'inherit',windowsHide:true});
if(result.status!==0)throw new Error('Complete character review packaging failed');
const out=path.resolve('tmp/rts/handoff-20261006/review-site',slug);
const metadata=JSON.parse(await readFile(path.join(out,'crossbow-preview.json'),'utf8'));
metadata.crossbow.name='原創弩兵 · 全身與裝填動作';
metadata.crossbow.status='製作中 · 裝填姿勢尚未合格';
metadata.crossbow.notes='皮革手套、袖口、弩弦與箭矢已組裝，可播放五種動作並切換視角。裝填段仍有手腕過折、握弦穿模，以及上弦施力與取箭來源不完整；本頁供檢查製作進度。';
const authoring=JSON.parse(await readFile(path.join(run,'qa/authoring.json'),'utf8'));
if(authoring.equipment){
 metadata.crossbow.name='原創弩兵 · 全身攻擊第二版';
 metadata.crossbow.status='製作檢查 · 尚未通過美術驗收';
 metadata.crossbow.notes='原創全身動作、上弦槓桿、腰側矢匣與雙指取箭。可播放五種動作、切換陣營與視角；接觸、衣袖變形與遊戲發射時序仍在驗收中。';
}
await writeFile(path.join(out,'crossbow-preview.json'),JSON.stringify(metadata,null,2)+'\n');
let html=await readFile(path.join(out,'index.html'),'utf8');
html=html.replaceAll('2026 / 10 / 06','2026 / 10 / 07').replaceAll('原創弩兵 · 持弩動作修整','原創弩兵 · 全身與裝填動作');
if(authoring.equipment)html=html.replaceAll('原創弩兵 · 全身與裝填動作','原創弩兵 · 全身攻擊第二版');
await writeFile(path.join(out,'index.html'),html);
await writeFile(path.join(run,'qa/crossbow-preview.html'),html);
await writeFile(path.join(run,'qa/preview-metadata.json'),JSON.stringify(metadata,null,2)+'\n');
if(run.endsWith('2026-10-07-v3')){
 metadata.crossbow.name='原創弩兵 · 指腹夾箭修整';
 metadata.crossbow.notes='拇指與食指改用實際手套表面夾持裸箭桿，並修整取箭手腕方向。可播放五種動作、切換陣營與視角；手臂、衣袖與入槽段仍在修整，尚未通過整體美術驗收。';
 html=html.replaceAll('原創弩兵 · 全身攻擊第二版',metadata.crossbow.name);
 await writeFile(path.join(out,'crossbow-preview.json'),JSON.stringify(metadata,null,2)+'\n');
 await writeFile(path.join(out,'index.html'),html);
 await writeFile(path.join(run,'qa/crossbow-preview.html'),html);
 await writeFile(path.join(run,'qa/preview-metadata.json'),JSON.stringify(metadata,null,2)+'\n');
}
