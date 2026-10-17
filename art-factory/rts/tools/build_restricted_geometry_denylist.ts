/** Builds art-factory/rts/manifests/restricted-geometry-denylist.json: geometry
 *  fingerprints of the Hunyuan3D-2.1-derived unit parts removed from the published
 *  worker/crossbow/guard, minus every fingerprint that also occurs in a clean
 *  (non-restricted, non-derived) source, so shared sword/shield/body primitives never count.
 *  Usage: node node_modules/tsx/dist/cli.mjs art-factory/rts/tools/build_restricted_geometry_denylist.ts */
import {readdirSync,readFileSync,statSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {FINGERPRINT_QUANTUM,glbFingerprints,type PrimitiveFingerprint} from './geometry_fingerprint';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..'),RUNS=path.join(ROOT,'art-factory/rts/runs');
const rel=(p:string)=>path.relative(ROOT,p).split(path.sep).join('/');
/** Raw Hunyuan3D-2.1 inference outputs: every primitive is restricted output geometry. */
const DIRECT_OUTPUT=/^art-factory\/rts\/runs\/(original-guard-shape|original-guard-right-grip-shape|original-glove-shape)\//;
/** Runs built from (or sampling) those outputs, plus the superseded published candidates: never clean evidence. */
const RESTRICTED_CHAIN=new RegExp([
  String.raw`^art-factory/rts/runs/(human-units-grip-refine|original-guard-[^/]*|original-crossbow-[^/]*|original-glove[^/]*|original-articulated-glove|original-closed-grip-lod|closed-gauntlet-retopology|guard-right-hand-cage|guard-wrist-module|guard-hand[^/]*)/`,
  String.raw`^art-factory/rts/runs/unit-shared-textures/2026-10-09-v1/(candidate|raw)/models/(worker|crossbow|guard)(-lod1)?\.glb$`,
  String.raw`^art-factory/rts/runs/detail-refinement/2026-10-07-v1/(candidate|raw)/(crossbow|guard)(-lod1)?\.glb$`,
].join('|'));
/** The superseded published worker/guard/crossbow builds (unit-registry superseded_restricted_record): restricted parts
 *  were merged into their body primitives (e.g. GuardBody_LOD0), so every primitive counts, minus clean overlaps. */
const SUPERSEDED=/^art-factory\/rts\/runs\/(unit-shared-textures\/2026-10-09-v1\/(candidate|raw)\/models\/(worker|crossbow|guard)(-lod1)?|detail-refinement\/2026-10-07-v1\/(candidate|raw)\/(crossbow|guard)(-lod1)?|human-units-grip-refine\/.*)\.glb$/;
/** Object names of the restricted parts (published-guard-source-rights-block.json, unit-registry superseded_restricted_record). */
const RESTRICTED_PART=/WorkerOriginalGrip|OriginalCrossbowClosedGrip|GuardBoot|GuardHandGrip|GuardPaddedLegLayer|GuardLegArmor|GripLowBake|OriginalGripLow|PreserveMeasuredBoreWall/;
/** Not clean evidence: the current rebuild under test and derived/superseded publications. */
const NOT_CLEAN=/^art-factory\/rts\/runs\/(procedural-gauntlet|unit-shared-textures|detail-refinement|assembly-refinement|final-assembly|commercial-readiness)\//;
const MIN_VERTICES=32;

function walk(dir:string,acc:string[]=[]):string[]{for(const f of readdirSync(dir)){const p=path.join(dir,f);if(statSync(p).isDirectory())walk(p,acc);else if(p.endsWith('.glb'))acc.push(p);}return acc;}
const restricted=new Map<string,{vertices:number;parts:Set<string>;sources:Set<string>}>(),clean=new Map<string,string>();let scanned=0,skipped=0;
for(const file of walk(RUNS).sort()){
  const r=rel(file);let prims:PrimitiveFingerprint[];try{prims=glbFingerprints(readFileSync(file));}catch{skipped++;continue;}scanned++;
  const direct=DIRECT_OUTPUT.test(r),superseded=SUPERSEDED.test(r),chain=RESTRICTED_CHAIN.test(r);
  for(const p of prims){if(!p.sha1||p.vertices<MIN_VERTICES)continue;
    // A restricted-named part is restricted wherever it was copied to; unnamed parts only in direct outputs.
    const named=RESTRICTED_PART.test(p.node)||RESTRICTED_PART.test(p.mesh);
    if(direct||superseded||named){
      let e=restricted.get(p.sha1);if(!e)restricted.set(p.sha1,e={vertices:p.vertices,parts:new Set(),sources:new Set()});
      e.parts.add(direct?`hunyuan-output:${p.mesh||p.node}`:named?(p.node||p.mesh):`superseded:${p.node||p.mesh}`);e.sources.add(r);
    }else if(!direct&&!chain&&!NOT_CLEAN.test(r)&&!clean.has(p.sha1))clean.set(p.sha1,r);
  }
}
const excluded=[...restricted.keys()].filter(h=>clean.has(h)).sort();
const entries=[...restricted].filter(([h])=>!clean.has(h)).sort(([a],[b])=>a.localeCompare(b))
  .map(([sha1,e])=>({sha1,vertices:e.vertices,parts:[...e.parts].sort().slice(0,4),example_source:[...e.sources].sort()[0],source_count:e.sources.size}));
const out={
  schema:'rts-restricted-geometry-denylist/v1',
  tool:'art-factory/rts/tools/build_restricted_geometry_denylist.ts',
  fingerprint:{module:'art-factory/rts/tools/geometry_fingerprint.ts',attribute:'POSITION (float32 VEC3)',quantum_m:FINGERPRINT_QUANTUM,hash:'sha1 of sorted quantized vertex rows',min_vertices:MIN_VERTICES},
  restricted_sources:{direct_hunyuan_output:DIRECT_OUTPUT.source,superseded_publications:SUPERSEDED.source,restricted_chain:RESTRICTED_CHAIN.source,restricted_part_names:RESTRICTED_PART.source},
  clean_exclusion:{rule:'restricted fingerprints that also occur as a non-restricted-named primitive in a clean run GLB (outside the direct outputs, restricted chain and derived publications) are dropped, e.g. shared sword/shield/body',not_clean:NOT_CLEAN.source,
    excluded_count:excluded.length,excluded:excluded.map(h=>({sha1:h,clean_source:clean.get(h),parts:[...restricted.get(h)!.parts].sort().slice(0,3)}))},
  scanned_glbs:scanned,unreadable_glbs:skipped,rights_note:'Technical source tracing only; not a legal certification.',
  entries,
};
writeFileSync(path.join(ROOT,'art-factory/rts/manifests/restricted-geometry-denylist.json'),JSON.stringify(out,null,1)+'\n');
console.log(JSON.stringify({scanned,skipped,restricted:restricted.size,excluded:excluded.length,entries:entries.length}));
