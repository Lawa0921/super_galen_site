// @vitest-environment node
/** Release gate: published worker, crossbow and guard GLBs carry no geometry from the
 *  Hunyuan3D-derived chain, retain the base clips and LOD1, and their registry provenance
 *  traces to the procedural-gauntlet rebuild, including verified Work/Cast and model-refinement derivatives. */
import {describe,it,expect} from 'vitest';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {glbFingerprints} from '../../../../art-factory/rts/tools/geometry_fingerprint';
import {resolveLineageFile,fingerprintDigest,type LineageManifest} from '../../../../art-factory/rts/tools/lineage_binaries';

const ROOT=path.resolve(__dirname,'../../../..');
const MODELS=path.join(ROOT,'public/assets/games/rts/models');
const UNITS=['worker','crossbow','guard'] as const;
const CLIPS=['Attack','Death','Hurt','Idle','Walk'];
// Object names produced by the restricted chain (tools/human_units_grip_refine.py GRIP_SOURCE,
// original_crossbow_grip_build.py append_closed_grip_pair, original_guard_assembly/hands builds).
const RESTRICTED=/WorkerOriginalGrip|OriginalCrossbowClosedGrip|GuardBoot|GuardHandGrip|GuardPaddedLegLayer|GuardLegArmor|GripLowBake|OriginalGripLow|PreserveMeasuredBoreWall/;
const RESTRICTED_SOURCES=/human-units-grip-refine|original-guard-grip|original-crossbow-grip|original-guard-assembly|original-guard-hands|original-glove|hunyuan/i;

interface Gltf {nodes:{name?:string;mesh?:number;extras?:Record<string,unknown>}[];meshes:{name?:string;primitives:{indices?:number}[]}[];
  materials?:{name?:string}[];animations?:{name:string}[];accessors:{count:number}[];images?:{uri?:string}[];
  scenes:{extras?:Record<string,unknown>}[];skins?:{joints:number[]}[]}
const read=(file:string)=>{const b=readFileSync(file);const len=b.readUInt32LE(12);return {json:JSON.parse(b.subarray(20,20+len).toString()) as Gltf,bytes:b};};
const triangles=(g:Gltf)=>g.nodes.filter(n=>n.mesh!==undefined).reduce((s,n)=>s+g.meshes[n.mesh!].primitives.reduce((t,p)=>t+(p.indices===undefined?0:g.accessors[p.indices].count/3),0),0);
// Large lineage binaries (pre-publication backup GLBs, assembly .blend sources) are not committed; their sha256 (and
// for GLBs the geometry fingerprint digest) is pinned in this small manifest so a clean clone still verifies the chain.
const LINEAGE_MANIFEST='art-factory/rts/manifests/unit-lineage-binaries.json';
const lineageManifest=JSON.parse(readFileSync(path.join(ROOT,LINEAGE_MANIFEST),'utf8')) as LineageManifest;
const lineageFs={exists:(rel:string)=>existsSync(path.join(ROOT,rel)),read:(rel:string)=>readFileSync(path.join(ROOT,rel))};
const lineage=(rel:string)=>resolveLineageFile(rel,lineageManifest,lineageFs);
const unitRegistry=JSON.parse(readFileSync(path.join(ROOT,'art-factory/rts/manifests/unit-registry.json'),'utf8')) as {assets:Record<string,unknown>[]};
// Run evidence (art-factory/rts/runs/) is kept local and is not committed. Checks of the published files run
// everywhere; the provenance chain into the run records runs only where that evidence is present.
const hasEvidence=existsSync(path.join(ROOT,'art-factory/rts/runs'));
const NO_EVIDENCE=hasEvidence?'':' (skipped: local-only art-factory/rts/runs/ evidence is absent from this checkout)';
const readEvidence=(rel:string)=>JSON.parse(readFileSync(path.join(ROOT,rel),'utf8'));
const baselineRegistry=(hasEvidence?readEvidence('art-factory/rts/runs/all-models/2026-10-14-v1/raw/baseline-unit-registry.json'):{assets:[]}) as {assets:Record<string,any>[]};
const baselineLock=hasEvidence?readEvidence('art-factory/rts/runs/all-models/2026-10-14-v1/source-lock.json'):{assets:[]};
const unchangedBaseline=(entry:Record<string,any>,base:Record<string,any>)=>
  entry.sha256===base.sha256&&entry.source===base.source&&entry.source_sha256===base.source_sha256;
const hasRequiredRefinement=(entry:Record<string,any>,base:Record<string,any>)=>
  unchangedBaseline(entry,base)||!!(entry.model_refinement&&Array.isArray(entry.previous_versions)&&entry.previous_versions.some((row:any)=>unchangedBaseline(row,base)));

describe('published unit source rights',()=>{
  for(const unit of UNITS)for(const lod of [0,1]){
    const id=lod?`${unit}-lod1`:unit,file=path.join(MODELS,`${id}.glb`);
    describe(id,()=>{
      const {json,bytes}=read(file);
      it('contains no node, mesh or material from the restricted chain',()=>{
        const names=[...json.nodes.map(n=>n.name??''),...json.meshes.map(m=>m.name??''),...(json.materials??[]).map(m=>m.name??'')];
        expect(names.filter(n=>RESTRICTED.test(n))).toEqual([]);
        expect(JSON.stringify(json.nodes.map(n=>n.extras??{}))).not.toMatch(RESTRICTED);
      });
      it('carries the procedural closed-grip gauntlet',()=>{
        expect(JSON.stringify(json.nodes)).toMatch(/ProceduralGauntlet|GuardGauntlet/);
      });
      it('keeps all five clips on one skin within the triangle budget',()=>{
        expect((json.animations??[]).map(a=>a.name).sort()).toEqual(unit==='worker'?[...CLIPS,'Mine','Chop','Build'].sort():CLIPS);
        expect(json.skins?.length).toBe(1);
        // LOD0 20k spec budget + the user-approved 30% close-up polish allowance (model-polish-2026-10-16 contract).
        expect(triangles(json)).toBeLessThanOrEqual(lod?10000:26000);
        expect(triangles(json)).toBeGreaterThan(lod?4000:8000);
      });
      it('resolves every external texture to a shipped file',()=>{
        for(const image of json.images??[])if(image.uri)expect(existsSync(path.join(MODELS,image.uri))).toBe(true);
      });
      it('is registered with its exact bytes and procedural provenance fields',()=>{
        const entry=unitRegistry.assets.find(a=>a.id===id) as Record<string,any>;
        expect(entry).toBeDefined();
        expect(entry.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
        expect(String(entry.source)).not.toMatch(RESTRICTED_SOURCES);
        expect(entry.source_provenance?.hunyuan_geometry).toBe('none');
        expect(String(entry.source_provenance?.geometry)).toMatch(/procedural-original/);
        expect(String(entry.source_provenance?.geometry)).toMatch(/TripoSR/);
      });
      it.skipIf(!hasEvidence)('traces its refinement ancestry to the frozen baseline'+NO_EVIDENCE,()=>{
        const entry=unitRegistry.assets.find(a=>a.id===id) as Record<string,any>;
        expect(entry).toBeDefined();
        expect(entry.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
        const baseline=baselineRegistry.assets.find(row=>row.id===id)!;
        expect(baseline).toBeDefined();
        expect(baseline.sha256).toBe(baselineLock.assets.find((row:any)=>row.url===entry.url)?.sha256);
        expect(hasRequiredRefinement(entry,baseline),'Changed assets must retain complete refinement ancestry').toBe(true);
        // Geometry refinements retain the complete approved ancestry. Verify
        // the exact new source binding and baseline before checking that ancestry.
        let lineageRow=entry,lineageFile=lineage(`public${entry.url}`);
        // Walk every refinement hop (e.g. 2026-10-14 assembly, then the 2026-10-16 model polish) back to the frozen
        // baseline: each hop needs its own complete source binding, locked backup bytes and a previous_versions row.
        for(let hop=0;lineageRow.model_refinement&&!unchangedBaseline(lineageRow,baseline);hop++){
          expect(hop,'refinement chain too long').toBeLessThan(8);
          const revision=lineageRow.model_refinement;
          const lockedBytes=readFileSync(path.join(ROOT,revision.source_lock));
          const bindingBytes=readFileSync(path.join(ROOT,revision.source_binding));
          expect(createHash('sha256').update(lockedBytes).digest('hex')).toBe(revision.source_lock_sha256);
          expect(createHash('sha256').update(bindingBytes).digest('hex')).toBe(revision.source_binding_sha256);
          const binding=JSON.parse(bindingBytes.toString());expect(binding.status).toBe('complete');
          const bound=binding.assets.find((row:any)=>row.url===entry.url);
          expect(bound).toMatchObject({id:unit,lod,sha256:lineageRow.sha256,source:lineageRow.source,source_sha256:lineageRow.source_sha256});
          expect(lineage(bound.source).sha256,`source ${bound.source}`).toBe(bound.source_sha256);
          expect(createHash('sha256').update(readFileSync(path.join(ROOT,bound.evidence))).digest('hex')).toBe(bound.evidence_sha256);
          const locked=JSON.parse(lockedBytes.toString()).assets.find((row:any)=>row.url===entry.url);
          expect(locked).toMatchObject({id:unit,lod,sha256:revision.previous_sha256});
          lineageRow=entry.previous_versions.find((row:any)=>row.sha256===locked.sha256);
          expect(lineageRow,'every hop keeps its previous version row').toBeDefined();
          lineageFile=lineage(locked.backup);
          expect(lineageFile.sha256,`backup ${locked.backup}`).toBe(lineageRow.sha256);
        }
        expect(unchangedBaseline(lineageRow,baseline),'Refinement ancestry must match the frozen source binding').toBe(true);
        if(unit==='worker'){
          expect(lineageRow.source).toBe('art-factory/rts/runs/work-cast/2026-10-11-v2/raw/worker-work-cast.blend');
          const previous=lineageRow.work_cast_previous;expect(String(previous.source)).toMatch(/^art-factory\/rts\/runs\/procedural-gauntlet\//);
          for(const record of [lineageRow,previous])expect(lineage(record.source).sha256).toBe(record.source_sha256);
          const lockedBytes=readFileSync(path.join(ROOT,lineageRow.animation_revision.source_lock));
          expect(createHash('sha256').update(lockedBytes).digest('hex')).toBe(lineageRow.animation_revision.source_lock_sha256);
          const locked=JSON.parse(lockedBytes.toString()).units.find((row:any)=>row.unit==='worker');
          expect(locked.source.path).toBe(previous.source);expect(locked.source.sha256).toBe(previous.source_sha256);
          const original=readFileSync(path.join(ROOT,locked.base_glbs[lod].snapshot));
          expect(createHash('sha256').update(original).digest('hex')).toBe(previous.sha256);
          // Geometry of the frozen baseline backup equals the work-cast input: compared directly when the backup is
          // local, otherwise through the pinned fingerprint digest of the backup.
          if(lineageFile.bytes)expect(glbFingerprints(lineageFile.bytes)).toEqual(glbFingerprints(original));
          else expect(lineageFile.entry?.glb_fingerprints_sha256,`pinned fingerprints ${lineageFile.path}`).toBe(fingerprintDigest(glbFingerprints(original)));
        }else expect(String(lineageRow.source)).toMatch(/^art-factory\/rts\/runs\/procedural-gauntlet\//);
        expect(unchangedBaseline(lineageRow,baseline)).toBe(true);
        expect(lineage(lineageRow.source).sha256).toBe(baseline.source_sha256);
        expect(String(entry.source)).not.toMatch(RESTRICTED_SOURCES);
        expect(entry.source_provenance?.hunyuan_geometry).toBe('none');
        expect(String(entry.source_provenance?.geometry)).toMatch(/procedural-original/);
        // A2: every human infantry body comes from the same TripoSR concept pipeline (style parity).
        expect(String(entry.source_provenance?.geometry)).toMatch(/TripoSR/);
      });
    });
  }
  it.skipIf(!hasEvidence)('rejects omitted refinement metadata, missing ancestry and forged old source bindings'+NO_EVIDENCE,()=>{
    const base=baselineRegistry.assets.find(row=>row.id==='guard')!;
    const changed={...base,sha256:'f'.repeat(64),model_refinement:{},previous_versions:[structuredClone(base)]};
    expect(hasRequiredRefinement(base,base)).toBe(true);
    expect(hasRequiredRefinement(changed,base)).toBe(true);
    expect(hasRequiredRefinement({...changed,model_refinement:undefined},base)).toBe(false);
    expect(hasRequiredRefinement({...changed,previous_versions:[]},base)).toBe(false);
    expect(hasRequiredRefinement({...changed,previous_versions:[{...base,source_sha256:'0'.repeat(64)}]},base)).toBe(false);
    expect(hasRequiredRefinement({...base,source:base.source+'.forged'},base)).toBe(false);
  });
  it('ships an original procedural crossbow with stock, prod, string, stirrup and trigger',()=>{
    for(const id of ['crossbow','crossbow-lod1']){
      const {json}=read(path.join(MODELS,`${id}.glb`));const names=json.nodes.map(n=>n.name??'');
      expect(names.some(n=>/^ProceduralCrossbow_LOD[01]$/.test(n))).toBe(true);
      expect(names.some(n=>/^CrossbowWeapon_LOD/.test(n))).toBe(false);
      const parts=json.nodes.find(n=>/^ProceduralCrossbow_LOD/.test(n.name??''))?.extras?.rtsProceduralParts as string[]|undefined;
      for(const part of ['stock','prod','string','stirrup','trigger'])expect(parts?.some(p=>p.startsWith(part))).toBe(true);
    }
  });
  it('uses the TripoSR guard body instead of the untextured procedural shell',()=>{
    for(const id of ['guard','guard-lod1']){
      const {json}=read(path.join(MODELS,`${id}.glb`));const names=json.nodes.map(n=>n.name??'');
      expect(names.filter(n=>/^GuardLegwear|^GuardArms_|^HelmetAssembly/.test(n))).toEqual([]);
      expect(names.some(n=>/^GuardBody_LOD[01]$/.test(n))).toBe(true);
      const mats=(json.materials??[]).map(m=>m.name??'');
      expect(mats).toContain('GuardArmor');
      expect(mats.filter(m=>/^GuardSteel_Surface|^GuardLeather_Surface/.test(m))).toEqual([]);
    }
  });
  it('keeps the guard rtsMotion contract identical across LODs',()=>{
    const high=read(path.join(MODELS,'guard.glb')).json.scenes[0].extras?.rtsMotion,low=read(path.join(MODELS,'guard-lod1.glb')).json.scenes[0].extras?.rtsMotion;
    expect(high).toEqual({version:1,locomotion:{clip:'Walk',strideMeters:2,cycleSeconds:2/3},attack:{clip:'Attack',durationSeconds:1.2,contactSeconds:0.5333333333333333}});
    expect(low).toEqual(high);
  });
  describe('geometry fingerprint gate (renaming cannot hide restricted parts)',()=>{
    // Generated by art-factory/rts/tools/build_restricted_geometry_denylist.ts from the restricted
    // Hunyuan-chain parts, minus fingerprints also present in clean sources (shared sword/shield/body).
    const denylist=JSON.parse(readFileSync(path.join(ROOT,'art-factory/rts/manifests/restricted-geometry-denylist.json'),'utf8')) as
      {schema:string;fingerprint:{quantum_m:number};entries:{sha1:string;parts:string[]}[];clean_exclusion:{excluded:{sha1:string}[]}};
    const denied=new Map(denylist.entries.map(e=>[e.sha1,e.parts.join(',')]));
    const matches=(file:string)=>glbFingerprints(readFileSync(file)).filter(p=>p.sha1&&denied.has(p.sha1)).map(p=>`${p.node||p.mesh}#${p.primitive} ~ ${denied.get(p.sha1!)}`);
    it('is a committed, non-trivial denylist at 1e-4 m quantization with clean-source overlaps removed',()=>{
      expect(denylist.schema).toBe('rts-restricted-geometry-denylist/v1');expect(denylist.fingerprint.quantum_m).toBe(1e-4);
      expect(denylist.entries.length).toBeGreaterThan(20);
      for(const part of ['GuardBoot','GuardHandGrip','GuardLegArmor','OriginalCrossbowClosedGrip','WorkerOriginalGrip'])expect(denylist.entries.some(e=>e.parts.some(p=>p.startsWith(part))),part).toBe(true);
      for(const e of denylist.clean_exclusion.excluded)expect(denied.has(e.sha1)).toBe(false);
    });
    it.skipIf(!hasEvidence)('detects the superseded restricted publications (positive control)'+NO_EVIDENCE,()=>{
      for(const file of ['unit-shared-textures/2026-10-09-v1/candidate/models/worker.glb','unit-shared-textures/2026-10-09-v1/candidate/models/guard.glb','detail-refinement/2026-10-07-v1/candidate/crossbow.glb'])
        expect(matches(path.join(ROOT,'art-factory/rts/runs',file)).length,file).toBeGreaterThan(0);
    });
    const runtime=unitRegistry.assets.map(a=>String(a.id));
    it.each(runtime)('%s: every primitive is fingerprintable float32 geometry and none matches the denylist',id=>{
      const file=path.join(MODELS,`${id}.glb`),prims=glbFingerprints(readFileSync(file));
      expect(prims.length).toBeGreaterThan(0);expect(prims.filter(p=>!p.sha1).map(p=>p.node||p.mesh)).toEqual([]);
      expect(matches(file)).toEqual([]);
    });
  });
  it.skipIf(!hasEvidence)('records the restricted geometry as removed in the commercial source audit'+NO_EVIDENCE,()=>{
    const audit=JSON.parse(readFileSync(path.join(ROOT,'art-factory/rts/runs/commercial-readiness/2026-10-09/qa/published-unit-source-audit.json'),'utf8'));
    for(const unit of UNITS)expect(audit.units[unit].hunyuan_geometry_dependency).toBe('removed');
  });
  it.skipIf(!hasEvidence)('binds the current source audit to all sixteen actual runtime unit files'+NO_EVIDENCE,()=>{
    const audit=JSON.parse(readFileSync(path.join(ROOT,'art-factory/rts/runs/commercial-readiness/2026-10-09/qa/published-unit-source-audit.json'),'utf8'));
    const rows=Object.values(audit.units).flatMap((unit:any)=>unit.runtime_assets) as {id:string;url:string;sha256:string}[];
    expect(rows).toHaveLength(16);expect(new Set(rows.map(row=>row.id)).size).toBe(16);
    for(const row of rows){
      expect(row.sha256,row.id).toBe(createHash('sha256').update(readFileSync(path.join(ROOT,'public',row.url))).digest('hex'));
      expect(unitRegistry.assets.find(asset=>asset.id===row.id)?.sha256).toBe(row.sha256);
    }
  });
  describe('pinned lineage binaries (not committed; sha256 recorded in '+LINEAGE_MANIFEST+')',()=>{
    const files=lineageManifest.files;
    // Every source lock / binding any unit row (or one of its previous versions) names: the committed lineage records.
    const records=new Set<string>();
    for(const row of unitRegistry.assets as Record<string,any>[])for(const r of [row,...(row.previous_versions??[])])
      if(r.model_refinement?.source_lock){records.add(r.model_refinement.source_lock);records.add(r.model_refinement.source_binding);}
    const lineageJson=!hasEvidence?'':[...records].map(rel=>readFileSync(path.join(ROOT,rel),'utf8')).join('\n');
    it('pins every entry with a sha256, a size, a role and (for GLBs) a geometry fingerprint digest',()=>{
      expect(lineageManifest.schema).toBe('rts-unit-lineage-binaries/v1');expect(files.length).toBeGreaterThanOrEqual(18);expect(records.size).toBeGreaterThanOrEqual(6);
      expect(new Set(files.map(f=>f.path)).size).toBe(files.length);
      for(const f of files){
        expect(f.sha256,f.path).toMatch(/^[0-9a-f]{64}$/);expect(f.bytes,f.path).toBeGreaterThan(1000);expect(['backup','source']).toContain(f.role);
        if(f.path.endsWith('.glb'))expect(f.glb_fingerprints_sha256,f.path).toMatch(/^[0-9a-f]{64}$/);
      }
    });
    it.skipIf(!hasEvidence)('pins only files the run locks and bindings reference, with the same sha256'+NO_EVIDENCE,()=>{
      for(const f of files){expect(lineageJson,f.path).toContain(f.path);expect(lineageJson,f.path).toContain(f.sha256);}
    });
    for(const f of files){
      const present=existsSync(path.join(ROOT,f.path));
      it.skipIf(!present)(`${f.path}: local bytes match the pin${present?'':' (skipped: large lineage binary not in this checkout; the chain is verified through the pinned sha256)'}`,()=>{
        const bytes=readFileSync(path.join(ROOT,f.path));
        expect(bytes.length).toBe(f.bytes);expect(createHash('sha256').update(bytes).digest('hex')).toBe(f.sha256);
        if(f.glb_fingerprints_sha256)expect(fingerprintDigest(glbFingerprints(bytes))).toBe(f.glb_fingerprints_sha256);
      });
    }
  });
});
