import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const main='C:/Users/bag57/projects/super_galen_site';
const toolRoot=path.dirname(fileURLToPath(import.meta.url));
const worktree=path.resolve(toolRoot,'../../..');
const require=createRequire(path.join(main,'package.json'));
const {buildSync}=require('esbuild');
buildSync({entryPoints:[path.join(toolRoot,'original_guard_clean_arm_viewer.mjs')],
  outfile:path.join(worktree,'art-factory/rts/runs/original-guard-clean-arm/2026-10-05/viewer.js'),
  nodePaths:[path.join(main,'node_modules')],bundle:true,minify:true,format:'esm',platform:'browser'});
