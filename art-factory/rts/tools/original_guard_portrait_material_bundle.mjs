import {buildSync} from 'esbuild';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const run='art-factory/rts/runs/original-guard-portrait-material/2026-10-05';
const source='art-factory/rts/tools/original_guard_portrait_study_viewer.ts',text=readFileSync(source,'utf8');
const needle='./candidate/original-guard-portrait-study.glb';
if(text.split(needle).length!==2)throw new Error('Source viewer model URL changed');
buildSync({stdin:{contents:text.replace(needle,'./candidate/original-guard-portrait-material.glb'),resolveDir:process.cwd(),loader:'ts'},outfile:run+'/viewer.js',bundle:true,minify:true,format:'iife',platform:'browser',supported:{'template-literal':false}});
writeFileSync(run+'/qa/viewer-source.json',JSON.stringify({source,sha256:createHash('sha256').update(text).digest('hex'),change:'Only the frozen candidate GLB URL; original portrait camera, lighting and controls unchanged',runtime_publish_allowed:false},null,2)+'\n');
