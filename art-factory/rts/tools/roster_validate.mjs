// Khronos glTF validator over roster-expansion candidates (or the published copies).
// Usage: node roster_validate.mjs <run> <unit> [published]
import {readFile,writeFile,access} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const [run,unit,mode]=process.argv.slice(2);
const local=path.resolve('tmp/rts/handoff-20261006/validator/node_modules/gltf-validator');
const cache=path.join(os.homedir(),'.cache/codex-rts3d/gltf-validator/node_modules/gltf-validator');
let module=cache;try{await access(local);module=local;}catch{}
const validator=createRequire(import.meta.url)(module);
const published='public/assets/games/rts/models',assets=[];
for(const name of [unit+'.glb',unit+'-lod1.glb']){
  const file=mode==='published'?path.join(published,name):path.join(run,'candidate',name);
  const bytes=await readFile(file);
  const resolve=async uri=>{const rel=decodeURIComponent(uri);for(const base of [path.dirname(file),published]){try{return new Uint8Array(await readFile(path.resolve(base,rel)));}catch{}}throw new Error('missing '+uri);};
  const report=await validator.validateBytes(new Uint8Array(bytes),{uri:name,maxIssues:0,externalResourceFunction:resolve});
  assets.push({file,sha256:createHash('sha256').update(bytes).digest('hex'),...report});
}
const result={validator:path.relative(process.cwd(),module).split(path.sep).join('/'),mode:mode??'candidate',assets,errors:assets.reduce((n,r)=>n+r.issues.numErrors,0),warnings:assets.reduce((n,r)=>n+r.issues.numWarnings,0)};
await writeFile(path.join(run,'qa',`gltf-validator${mode==='published'?'-published':''}.json`),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({files:assets.length,errors:result.errors,warnings:result.warnings,messages:assets.flatMap(a=>a.issues.messages.map(m=>m.code)).filter((v,i,s)=>s.indexOf(v)===i)}));
if(result.errors)process.exitCode=1;
