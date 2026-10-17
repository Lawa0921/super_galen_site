import {build} from 'esbuild';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..','..','..');
await build({entryPoints:[path.join(here,'original_guard_review_scene.ts')],outfile:path.join(root,'art-factory','rts','review','original-guard.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,sourcemap:false,logLevel:'info'});
console.log('Built local review bundle from Three.js and the RTS runtime modules.');
