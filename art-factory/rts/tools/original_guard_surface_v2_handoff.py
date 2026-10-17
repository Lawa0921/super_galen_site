"""Freeze exact deliverable manifest and substantive reviewer handoff."""
import json,hashlib,struct
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/'art-factory/rts/runs/original-guard-assembly/continuation-20261006-2/surface'
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
build=json.loads((RUN/'qa/build.json').read_text());dynamic=json.loads((RUN/'qa/dynamic-skin.json').read_text());parity=json.loads((RUN/'qa/three-pose-parity.json').read_text())
files={};glbs=[]
for p in sorted((RUN/'candidate').glob('*')):
 if p.suffix not in ('.blend','.glb'):continue
 files[p.name]={'sha256':sha(p),'bytes':p.stat().st_size}
 if p.suffix=='.glb':
  data=p.read_bytes();size=struct.unpack_from('<I',data,12)[0];doc=json.loads(data[20:20+size])
  count=sum(doc['accessors'][prim['indices']]['count']//3 for mesh in doc['meshes'] for prim in mesh['primitives'])
  lod=int(p.stem[-1]);assert count==build['totals'][str(lod)]
  assert {a['name'] for a in doc['animations']}=={'Idle','Walk','Attack','Hurt','Death'}
  glbs.append({'file':p.name,'triangles':count,'clips':[a['name'] for a in doc['animations']],'meshes':len(doc['meshes']),'skins':len(doc['skins']),'scene_extras':doc['scenes'][0].get('extras',{})})
assert sha(Path(build['source']['path']))==build['source']['sha256']
manifest={'status':'candidate','runtime_publish_allowed':False,'review_required':True,'source':build['source'],'source_unchanged':True,'deliverables':files,'glbs':glbs,'actions_exact':build['action_signatures_before']==build['action_signatures_after']==build['action_signatures_after_export'],'khronos':'not run: validator package not available; no dependency installation authorized'}
(RUN/'qa/deliverable-manifest.json').write_text(json.dumps(manifest,indent=2))
lines=['# Original guard surface v2 — bounded implementation handoff','',
'Status: candidate only. `runtime_publish_allowed: false`. No visual or runtime approval is asserted. Main reviewer owns integration and Attack/contact changes.','',
'## Scope and source','',
'Worktree: `C:/Users/bag57/projects/super_galen_site/.claude/worktrees/rts`; verified branch `feat/browser-rts`. Only `original_guard_surface_v2*` tools, this surface run, and `tmp/rts/continuation-20261006-2/guard-surface*` were written. No runtime, registry, game code, original helpers, worker/crossbow, dependencies, Git history or server state was changed.','',
'Frozen source: `'+build['source']['path']+'`; SHA-256 `'+build['source']['sha256']+'`. Rechecked unchanged after export.','',
'## Actual geometry changes','',
'- Source GuardBody had 1,742 open edges in LOD0. Replaced that faulty local torso/skirt mesh, rather than folding vertices under pauldrons, with original modeled closed hollow plate shells: breast/back cuirass, lower fauld, three overlapping short side tasset plates per side, and a padded hip liner. Each replacement is a separate editable mesh with UVs and retained original materials. All rebuilt surface components have zero boundary/nonmanifold edges.','- Cuirass is rigidly bound to SpineUpper; lower fauld to SpineLower; short tassets and hip liner to Pelvis. Tassets stop at approximately z=.740 m in rest rather than continuing toward the bent knee. No animation curves or rest bones were changed to compensate.','- Original arms, authored closed hands, helmet/face assembly, boots, leg armor, front team tabard and weapons are reused. Controlled per-component decimation removes the huge boot density (55,892 source triangles across both LOD0 boots) and reduces other selected components. LOD0 hands and sword/shield are exactly unchanged in vertex positions, polygon indices and weights. Helmet identity/material assignments are retained; LOD0 helmet is reduced while the original LOD1 helmet is preserved.','- First visual pass exposed poor tabard edge collapse. The final build preserves both original tabard meshes without additional decimation. LOD1 retains some pre-existing tabard shading irregularity and has visibly coarser arm/elbow surfaces. These remain review items, not approval claims.','',
'## Triangle budgets','',
f"LOD0: **{build['totals']['0']:,}**; LOD1: **{build['totals']['1']:,}**. Actual indexed GLB primitive counts match Blender mesh counts. There is only 90 triangles headroom at LOD0 and 99 at LOD1; final assembly must keep within those budgets.",'',
'| Component | Source LOD0 | Final LOD0 | Source LOD1 | Final LOD1 |','|---|---:|---:|---:|---:|']
for name in sorted(k[:-4] for k in build['after'] if k.endswith('LOD0')):
 values=[]
 for lod in (0,1):
  key=name+'LOD'+str(lod);values.extend([str(build['before'].get(key,{}).get('triangles','new')),str(build['after'][key]['triangles'])])
 lines.append('| '+name.rstrip('_')+' | '+' | '.join(values)+' |')
lines+=['','## Evidence and bounded tests','',
'- Baseline budget and body-closure checks fail on the frozen source, then pass on final candidate. `qa/build.json` records before/after topology for every component, counts, exact action signatures and build/export hashes.','- `qa/before/{front,back,attack,walk}.png` are the actual prior source review images; `qa/after/lod{0,1}-{front,back,attack,walk,hurt,death}.png` show final full body and all five actions. Both passes were actually viewed. Lighting/camera helper is unchanged; surface fixes were not hidden by changing lights.','- `qa/dynamic-skin.json`: 55 source poses (11/action), including fractional frames, 2,310 evaluated object samples; finite and non-exploding bounds checks pass. Rest hierarchy/matrices and rtsMotion metadata exactly match frozen source.','- `qa/three-pose-parity.json`: actual Chromium Three GLTFLoader/AnimationMixer skinned geometry compared against Blender world extrema for every mesh, 55 poses and both LODs. Exporter vertex splits do not invalidate the extrema check. This is sampled world-extrema parity, not a proof of every vertex or every instant.']
for row in parity['lods']:lines.append(f"  - LOD{row['lod']}: {len(row['reports'])} comparisons, maximum error {row['maxErrorM']:.12g} m ({row['maxErrorM']*1000:.9f} mm), five expected clips/durations present.")
lines += [f"- Fauld/tasset vs knee-cap BVH checks: {dynamic['knee_fauld_collision_samples']} sampled pair checks; {len(dynamic['knee_fauld_collisions'])} reported intersections. See dynamic-skin JSON for exact records. This checks the reported bent-knee failure region; it does not exhaustively certify every armor/arm, cloth/thigh or shield/body pair.",
'- Initial 30 Hz force-sampled export had up to 13.294 mm subframe discrepancy. Final export evaluates original curves at 240 Hz using temporary in-memory frame/fps scaling, then restores all key/handle coordinates exactly. Saved editable blend remains original 30 fps and original curves. No dense donor mesh is used in final GLBs. `dense-motion/` is an unused first-pass diagnostic and must not be integrated.','- Khronos validator was unavailable in existing dependency resolution; no install was performed. This validation remains for final assembly.','',
'## Unchanged original action-curve SHA-256','',
'Signatures include data paths, array indices, extrapolation, key coordinates, handle coordinates/types, interpolation and easing. Before surface edits, after edits and after export restoration all match.','']
for clip,sig in build['action_signatures_before'].items():lines.append(f'- {clip}: `{sig}`')
lines+=['','## Exact deliverables','', '| File | Bytes | SHA-256 |','|---|---:|---|']
for name,row in files.items():lines.append(f"| candidate/{name} | {row['bytes']} | `{row['sha256']}` |")
lines+=['','## Main integration and remaining limits','',
'1. Start from `candidate/original-guard-assembly.blend`, which contains both editable LODs and the original five actions. Main may apply its Attack timing/contact correction there or transfer these surface meshes/material bindings into its assembly, preserving exact rest hierarchy.','2. Re-run whole-body bounds metadata after final Attack changes. New replacement parts do not inherit old per-object conservative-bound extras; source components retain inherited extras. `qa/dynamic-skin.json` supplies measured current bounds but is not final post-Attack culling certification.','3. Re-check actual game contact, transitions, locomotion, culling and batch performance after main assembly. This task did not edit Attack timing, game logic, runtime registries, preview packages or live servers 4324/4334.','4. Independently inspect shoulder/arm openings from articulated armor, LOD1 joint silhouettes, original left shield-hand silhouette, under-skirt/hip layering, Death/ground contact, and full armor interpenetration over continuous playback. No all-pairs continuous collision proof, final WebGL visual approval or production approval is claimed.','5. The WSL-only shared hygiene/judgment sources returned access denied. No security/access setting was changed and no inaccessible rule content was invented. Project CLAUDE.md, RTS handoff, factory profile/contract and verification guidance were read.','',
'## Reproduction','',
'```powershell',
"& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' -b -t 4 --python art-factory/rts/tools/original_guard_surface_v2_build.py",
"& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' -b -t 4 --python art-factory/rts/tools/original_guard_surface_v2_qa.py",
'node art-factory/rts/tools/original_guard_surface_v2_parity.mjs',
"& 'C:/Program Files/Blender Foundation/Blender 5.2/5.2/python/bin/python.exe' art-factory/rts/tools/original_guard_surface_v2_handoff.py",'```','',
'Detailed handoff is stored here independently of CLI output-last-message: `qa/handoff.md`. Tool logs are in `tmp/rts/continuation-20261006-2/guard-surface-{build,qa,parity}.log`.']
(RUN/'qa/handoff.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
print(json.dumps({'status':'candidate','triangles':build['totals'],'manifest':str(RUN/'qa/deliverable-manifest.json'),'handoff':str(RUN/'qa/handoff.md'),'knee_intersections':len(dynamic['knee_fauld_collisions'])}))
