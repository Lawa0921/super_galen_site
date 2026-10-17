"""Stable handoff, deliberately separate from the agent's final stdout."""
import sys,pathlib,json,hashlib,datetime
root=pathlib.Path(sys.argv[1]).resolve();qa=root/'qa'
def read(n):return json.loads((qa/n).read_text())
export=read('actual-export-verification.json');source=read('measured-verification.json');wrist=read('wrist-verification.json');identity=read('identity-verification.json');browser=read('browser-verification.json');validator=read('gltf-validator.json')
files=list((root/'candidate').glob('*.blend'))+list((root/'candidate').glob('*.glb'))
hashes={str(p.relative_to(root)).replace('\\','/'):{'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size} for p in files}
(qa/'delivery-hashes.json').write_text(json.dumps(hashes,indent=2)+'\n')
matrix=max(c['all_original_bones_skin_matrix_max_abs_error'] for l in export['lods'].values() for c in l['clips'].values())
vertex=max(c['source_vs_glb_weapon_vertex_max_m'] for l in export['lods'].values() for c in l['clips'].values())
outside=max(r['max_outside_m'] for l in wrist['lods'].values() for c in l.values() for r in c.values())
gap=max(r['max_surface_distance_m'] for l in wrist['lods'].values() for c in l.values() for r in c.values())
status='candidate_pending_independent_review' if export['pass'] and wrist['pass'] and identity['pass'] and browser['pass'] else 'candidate_blocked'
lines=[f'# Original crossbow continuation 2026-10-06-2 — {status}',
'', '## Scope and fixed bytes', '',
'Windows; feat/browser-rts; C:/Users/bag57/projects/super_galen_site/.claude/worktrees/rts. Only original_crossbow tools, this NEW run, and crossbow-prefixed temp outputs were written. No runtime, registry, shared docs/game/guard/worker/dependency edits, commit, push, reset, stash, clean, server restart, security/permission change or root approval. Prior v2 run is unchanged.',
'', '| File | Bytes | SHA-256 |','|---|---:|---|']
for p,r in hashes.items():lines.append(f"| {p} | {r['bytes']} | `{r['sha256']}` |")
lines+=['','## Actual changes and evidence','',
'1. Removed the synthetic sleeve-cover path. Kept the original textured arm surfaces; welded local geometric UV splits without replacing per-loop UVs; reweighted shoulder/elbow/wrist transitions; bisected and closed original wrist ends. Torso/head/legs and original body packed textures are preserved. TeamCloth is retained.',
'2. Kept both closed grips from the original worker source. Fixed the rotated cuff weight projection and made the closed grips rigid to their original Hand bones. The body provides the Forearm-to-Hand weight transition. The complete inner cuff ring is now included; the former torso-protection mask had missed it.',
'3. Fitted the original cuff in evaluated Idle pose, accounting for the difference between posed Hand and Forearm axes. This eliminates the visible backwards wrist fold. Applied the grip triangle budget before the final original forearm-to-glove BVH fit, so fitting uses the actual runtime cuff surface. Final nearest-facet inward projection handles the non-convex original cuff, where radial inset alone crossed adjacent facets. Both LODs reuse this closed grip mesh.',
'4. Export sampling evaluates the preserved source at quarter-frame intervals by temporarily scaling key times and FPS together by 4; restores both afterward. Animation key reduction is disabled. The editable blend remains at its original rate and duration. All 20 bones are checked at 1/8-frame intervals, including between exported keys; the 1e-4 gate is unchanged.',
'', '## Checks on final bytes','',
f"- LOD0 / LOD1 triangles: {source['lods']['0']['triangles']} / {source['lods']['1']['triangles']} (<20k / 7k–10k).",
f"- All-bone source/GLB skin matrix max absolute error: {matrix:.12g}; pass={export['pass']} (strict <1e-4).",
f"- Actual weapon vertex parity max: {vertex:.12g} m. Both LOD animation tracks identical: {source['lod_animation_binary_tracks_identical']}.",
f"- Actual exported cuff check: pass={wrist['pass']}; max outward signed nearest-surface distance {outside:.12g} m; max unsigned surface distance {gap:.12g} m. 21 times per clip, both wrists, both LODs. This is a local cuff check, not a whole-character collision proof.",
f"- Original 20-bone hierarchy/bind exact: {identity['hierarchy_and_bind_exact']}; packed body textures exact: {identity['original_body_packed_textures_exact']}; outside local arm region source vertex displacement: 0 m. All five original clips retained.",
f"- Chromium / actual Three ModelInstance: {len(browser['rows'])} combinations (5 actions × 2 LOD × 2 team colors), exact SHA-256, changing evaluated poses, draws, actual TeamCloth colors, no page errors. Direct existing-server preview: {browser['url']}",
f"- Khronos: LOD0 {validator['0']['issues']['numErrors']} errors / {validator['0']['issues']['numWarnings']} warnings; LOD1 {validator['1']['issues']['numErrors']} errors / {validator['1']['issues']['numWarnings']} warnings. Warnings remain NODE_SKINNED_MESH_NON_ROOT; not a zero-warning claim.",
'- Final tests: 8 candidate tests + 5 existing math tests = 13 PASS, both commands exit 0. This retains the original 10 tests and adds 3 regressions. Logs: candidate-tests.log and math-tests.log. Regressions cover strict matrix parity, removal of the bad synthetic sleeve overlay, and actual exported cuff containment.',
'', '| LOD | Clip | Samples | All-bone max error | Weapon vertex max m | Left grip drift m | Right grip drift m |', '|---|---|---:|---:|---:|---:|---:|']
for lod,l in export['lods'].items():
    for name,c in l['clips'].items():lines.append(f"| {lod} | {name} | {c['samples']} | {c['all_original_bones_skin_matrix_max_abs_error']:.9g} | {c['source_vs_glb_weapon_vertex_max_m']:.9g} | {c['actual_glove_weapon_distance_drift_max_m']['L']:.9g} | {c['actual_glove_weapon_distance_drift_max_m']['R']:.9g} |")
lines+=['','## Reproduction','',
'Use Blender `C:/Program Files/Blender Foundation/Blender 5.2/blender.exe`; Python `C:/Program Files/Blender Foundation/Blender 5.2/5.2/python/bin/python.exe`.',
'', '```text',
'blender -b -t 4 --python art-factory/rts/tools/original_crossbow_grip_build.py -- art-factory/rts/runs/human-units/2026-10-05-v1/crossbow/candidate/crossbow-production-v1.blend <RUN> --skip-render',
'blender -b -t 4 --python art-factory/rts/tools/original_crossbow_revision_verify.py -- <RUN>',
'blender -b -t 4 --python art-factory/rts/tools/original_crossbow_export_verify.py -- <RUN>',
'blender -b -t 4 --python art-factory/rts/tools/original_crossbow_wrist_verify.py -- <RUN>',
'blender -b -t 4 --python art-factory/rts/tools/original_crossbow_identity_verify.py -- <RUN>',
'python -B art-factory/rts/tools/original_crossbow_candidate_test.py <RUN>/candidate',
'python -B -m unittest discover -s art-factory/rts/tools -p original_crossbow_grip_math_test.py',
'node art-factory/rts/tools/original_crossbow_browser_verify.mjs <RUN>',
'node art-factory/rts/tools/original_crossbow_validator.cjs <RUN>',
'```',
'','## Visual evidence and remaining limits','',
'Source: idle/walk/attack/hurt/death-full.png and source-<action>-contact-{front,side}.png. Actual imported GLB: glb-<action>.png and glb-<action>-contact-{front,side}.png. Actual Chromium: browser-lod{0,1}-<action>.png and browser-contact-{threequarter,side,back}.png. Blender render and browser checks use actual models, not metadata stand-ins.',
'', '![Source contact](source-idle-contact-front.png)', '![Actual exported contact](glb-idle-contact-front.png)', '![Actual Three contact](browser-contact-threequarter.png)',
'', 'The final source-contact-sheet.png, glb-contact-sheet.png, whole-pose-sheet.png and browser-pose-sheet.png were opened and inspected, covering all five actions and both contact views; final source/GLB Hurt contact images were also inspected at full size. The v2 synthetic shoulder cut-through and upright dark wrist stub are removed in these views. Remaining whole-character visual concern: Hurt shows angular waist/belt/skirt deformation in BOTH source and actual GLB. That area is outside this local shoulder/wrist repair; it is not being called fully accepted commercial character art. Main should assess it explicitly. The cuff result is within a 1 mm signed-distance tolerance, not a claim of mathematical zero penetration.',
'', 'This is a candidate handoff, not self-approval. Main must independently verify these final bytes, review the source and actual GLB multi-angle/all-action images and accept the local shoulder/cuff quality. Human commercial-art/whole-character assembly acceptance and runtime integration remain outside this work package. No root-review.json was authored; runtime_publish_allowed=false.',
'', 'Failed evidence is retained under prior-evidence and iteration-1/2/3. Early builds had missed inner cuff vertices and a backwards wrist fold; their passing bone/grip checks were not treated as visual acceptance. The local wrist regression first failed on real exported vertices at 40.7 mm. Prior v2 strict matrix regression failed at 1.40205e-4. Both are preserved. Some intermediate diagnostic assertions caused Blender scripts to report tracebacks while Blender returned exit 0; JSON pass fields and test assertions are the authoritative gates, not shell exit alone.',
'', 'The initial normal HTTP artifact route returned 404; the final preview uses the existing Vite workspace /@fs route, tested directly without route interception. Server 4324 was never restarted. WSL judgment.md / hygiene.md access was denied; no permission workaround was attempted.',
'', 'No unrelated full application suite was rerun: no application/runtime code changed, and main owns those checks. This stable file is intentionally separate from CLI output-last-message and final assistant text.', '']
(qa/'handoff.md').write_text('\n'.join(lines),encoding='utf-8')
print(json.dumps({'status':status,'matrix_max':matrix,'wrist_pass':wrist['pass'],'hashes':hashes,'handoff':str(qa/'handoff.md')}))
