# CS Character V33 Implementation Plan

> **For agentic workers:** Execute inline with superpowers:executing-plans; root owns writes, reviewers are read-only.

**Goal:** Replace the visibly primitive shipping soldier with a textured, anatomically based tactical character in the actual game.

**Architecture:** Reuse the licensed MakeHuman body and 53-bone garment source, author tactical equipment in an editable Blender scene, and cook a bounded GLB. Preserve engine actors/hitboxes. Integrate a production skeletal adapter with per-instance animation and shared geometry/textures; no per-frame IK or mesh scans.

**Tech Stack:** Blender 5.2, Three.js, glTF 2.0, Vitest, headless Chromium/D3D11.

**Spec:** docs/superpowers/specs/2026-10-03-browser-cs-design.md

## Constraints and review focus

- Root is the only writer; existing dirty work is preserved. Local repository publication only.
- Existing sources remain immutable. Retain licenses, provenance, editable source, candidate and actual-game captures.
- Do not relabel rejected historical candidates as accepted. Review the new assembled character.
- Keep character under 40k triangles / 12 primitives and textures at 1k or below; measure five actors in the shipping renderer.
- Check close front/back/side, head/equipment, walking joints, aim, all four weapons, team distinction and 5–15m gameplay distance.
- Verify per-instance pose/material isolation, round reset, disposal, body bounds, finite normalized skin weights and asset budget.

## Tasks

- [x] Capture shipping baseline and inspect licensed source in Blender.
- [x] Author a new uniform/equipment candidate and cook optimized GLB; retain source and provenance in `art-factory/cs/runs/run-20261008-v33-character`.
- [x] Visually inspect before stage-1 integration; correct grip, sleeve crop and stock/head contact defects. Further art improvement remains.
- [x] Add failing production skeletal adapter tests (instance isolation, motion/aim reset, equipment/team behavior), then implement adapter and integrate renderer.
- [x] Capture actual native game, reload video and controlled character views; independently review stage-1 visual and functional changes.
- [x] Run full unit/Chromium checks, build and 120-second-per-quality native samples; update registry/contract to locally published soldier/pistol.
- [x] Finish all four FPS skeletal rigs and shared texture packaging; stage-2 review and public-path checks passed.
- [ ] Fix remaining long-frame stalls and improve first-person cloth/glove detail and character motion.

No commit, push or external deployment is part of this task.

## Stage 3 / garment continuation

Head kit-e-preserved is locally integrated with independent review, byte-preserved body PBR images, 360-pose audit and 18 relevant Chromium tests. The 512px micro-weave-only kit-f-cloth candidate is not selected: its small visible benefit does not justify 446,600 extra bytes.

Next garment candidate reuses licensed `male_casualsuit01` from V7 field `full-body-unfixed-source.glb`. Its 53-joint order and inverse bind matrices match V33 `raw/posed-anatomical.glb` exactly. Use the editable kit-e Blender scene, assert bone rest frames before transfer, replace tee/trousers/body-copy sleeves, preserve authored UVs/normal and normalize team fabric color in the cook. Reduce only the garment topology within the 40k/12-primitive budget. Retain source material/mesh hashes and editable assembly. Check collar/vest, wrists, body exposure and boot cuffs in close and actual-game poses; prior V7 visual rejection does not carry approval forward. No runtime publication until this new assembly passes review.

## Verified continuation checkpoint

See `art-factory/cs/runs/run-20261008-v33-character/README.md` and `qa/preview.html`. Full unit 1,481/1,481; Chromium 60/60 plus one strengthened ownership rerun; build exit 0. New soldier and grip-f pistol are published locally, with independent approval for incremental integration. Native captures and a ten-second reload/switch video use public assets. The overall CS2 goal is not achieved.

Independent review required a method change: the FPS arms now have a real 48-bone deform rig and normalized reload clip, initially for pistol. Static per-arm offsets/vertex twisting are not the final assembly path. A real-source weight projection gate, immutable source snapshots and strict skin/animation cook checks are implemented. Four world weapons now use contacts ray-picked on their actual meshes and measured palm geometry.

Pistol grip/slide operation and rifle/sniper stock/head stance passed incremental review; motion remains stiff. Other three FPS rigs, richer cloth/glove detail and shoulder-distributed aim remain. Rifle parts-b separates the real 736-triangle magazine, checked against the V6 source and side/exploded views. Parts-a incorrectly selected the 284-triangle pistol grip and is rejected outside runtime. Canonical shared hand textures are needed to avoid four embedded copies and protect the 32 MB budget.

Native high/low 120-second samples: P95 20.9/12.5 ms, P99 208.3/45.8 ms, worst 603.9/416.8 ms, 81/131 frames over 50 ms. Both cover live play, spectating and next rounds with no HMR/page/GL/visibility/pause error. Long-frame performance is not accepted; diagnose the timeline before picking an optimization. Keep the complete user goal active.

## Stage 2 integration checkpoint

All four 48-bone FPS rigs now use the same five sealed external images and shared runtime Texture objects. Rifle/sniper arms-c and SMG arms-e passed independent incremental visual review. The recursive runtime bundle is 29,641,061 bytes. Full unit: 146 files / 1,492 tests passed; 63 Chromium tests passed and build exit 0. High/low 120-second samples P95 20.8/12.5 ms, P99 25.0/16.7 ms, worst 62.5/528.9 ms; 3/55 frames exceed 50 ms. Performance remains unaccepted. Material close detail, world-body aim/motion and long-frame GPU diagnosis remain active. See V33 README and local-publication-stage2.json.

## Stage 4 / first-person sleeve continuation

The full-sleeve uniform `kit-g-garment-e` is locally integrated after independent review, 360-frame deformation audit, 28 motion views, eight world views, 63 Chromium tests and build exit 0. The soldier uses 37,465 triangles / 12 primitives / 2,991,148 bytes. Current recursive runtime size is 30,003,683 bytes. Native 120-second samples remain unaccepted: high P95/P99/worst 25/37.5/129.2 ms, low 20.8/29.2/141.6 ms. High spectator coverage is only 3.64 seconds; low covers all required states. No game/HMR/visibility errors. These are different rounds, not a causal A/B art comparison.

First-person sleeve work proceeds rifle-first from the reviewed `fps-rig-rifle-arms-c/rifle-rigged.blend`. Retarget only the licensed garment's sleeve islands with explicit arm/palm frames and spine-to-clavicle, thumb-to-hand policies. Preserve the original 48 bones and 61 authored frames. Export only new cloth, then copy primitive dependencies into the original hands via NodeIO; original glove and weapon accessors, contacts, skin and animation remain sealed. Use the existing FPS shoulder seam as an offscreen crop target. Repack the two garment UV islands into a 1024x512 atlas to retain source detail without carrying the unused torso/trouser atlas.

Candidate B revealed a visible shoulder opening and independently detected discontinuous normals across duplicate UV-seam vertices. C fits the shoulder but still predates the normal repair. D repairs seam normals but fails reload deformation. F transfers weights from the stable FPS surface, but independent diagnosis found discontinuous nearest-surface weights: failures increased to 572 triangle/frame events. These retargeted sleeves are rejected, outside runtime. Six compositing tests pass; passing those gates does not override visual or deformation failure.

The selected continuation retains the reviewed FPS topology, skin and animation, using the licensed garment only as a bind-surface/material bake donor. All four weapon cloth UVs, indices and weights are identical; their positions differ only by per-side rigid transforms and positive uniform scales. Bake A missed 12.15% of triangle centers. Bake D had complete center coverage but failed visual review due to a single-sided cuff hole and opposite donor winding. Bake F reverses only the bake donor, validates raw tangent normals against the actual low UV footprint, falls back flat for invalid hits and preserves baseline double-sided rendering. It passes independent four-weapon incremental review and 40 captures. Correction: its old 496-sample audit used dt=0 and did not advance reload poses; that dynamic-coverage claim is retracted, with evidence in qa/reload-audit-correction.json.

Stage 5 publishes the shared F pack locally: five shared images total 1,578,675 bytes, runtime 31,138,020 bytes. Geometry/rig/animation remain exact. Nine normal/footprint/surface checks pass, and the cross-weapon bind surface relationship is sealed in QA. Forty public-path captures, four videos, 1,492 unit tests, 63 Chromium tests and build pass. Fresh native 120s/quality: high P95/P99/worst20.8/20.9/79.2ms, low12.5/12.6/50.1ms; 3/1 frames>50ms. High lacks live spectator coverage; low complete; no page/GL/HMR/visibility errors. Further glove detail and deterministic GPU diagnosis remain. The overall quality/performance goal remains active.

## Structural glove prototype

- [x] Reject uniform-grain A/B material variants; keep stage5 public hashes.
- [x] Acquire hash-verified public bobeer glove derivative and historical PBR; preserve CC BY attribution and provenance caveats.
- [x] Independent source review: original OBJ/PBR may enter prototype; edited open/point OBJ rejected.
- [x] Confirm actual source and target handedness/palmar axes numerically; labels alone are insufficient. Historical glove_left maps to target R without reflection; filename is not the side contract.
- [x] Fit one glove to the existing 48-bone rig, remove cuff spike, preserve authored UV/PBR and test bind/grip/reload-wrist poses. H passes offline 61-frame audit.
- [x] Review rifle actual-viewmodel detail/clearance before expanding to the other hand and four guns. Corrected advancing timeline and independent image review pass for candidate work only.
- [ ] Cook shared maps within the existing bundle limit, independently review, then verify public integration if accepted.

The first fixed-renderer ABBA test preserves inputs/state but has large same-setting GPU variance. It is diagnostic-only and inconclusive; no SSAO setting changed.

Prototype A improved authored pads/seams but failed cuff closure and trigger grip. Same-camera evidence then showed the old glove was also below the real guard. D derives a constant R clavicle animation registration from actual world-space trigger triangles and passes only that single-pad contact gate; its projected cuff/cap folds into fins and remains rejected. E retains the old wrist gasket and constructs the rim after target-space fitting, but its first radial correspondence misses and fails before rendering. The guard remains enabled pending an independent geometry diagnosis. All candidates remain outside runtime. Seven offline binding/ring tests pass after the new open/branched/multiple-ring tests first fail for the missing implementation.

Full-body follow-up: inspect the deliberately rigid spine_03 vest assignment in author_cs_character_v33.py. The source has multi-bone weights, but restoring all of them blindly may reintroduce biceps pulling. Separate flexible webbing behavior from the hard plate before changing production weights.

H completes the rifle R prototype: target-axis .025m cut, full clearance through .035m, .035→.050m fade, adjacent-ring cap fan. All 61 cuff poses pass; gun/cloth/support geometry and 143 other animation channels remain exact, including serialized rig/channel checks. Five initial merge tests plus duplicate-channel regression pass (six total). Packed variant has pixel-exact lossless normal/MR maps, 7 primitives, 40,223 total rifle triangles, projected runtime 31,773,034 bytes. Packed renderer audits cover 124 actual-progress samples with no missing opening rays, sight obstruction or page/GL errors. Preview has 12 images/five videos and passes desktop/narrow interaction. Next: reuse the same licensed module with explicit mirrored anatomical frame for L, preserve the right-hand registration, and confirm left cuff stations before authoring. Do not publish the mixed-hand prototype.

Left continuation: source mirror/chirality and wrist section are validated. `left-a` is rejected for exact receiver penetration; `left-b` fixes its rest grip but fails the advancing reload contact and cuff audit. Independent review directs a method change to separate release/clear/contact/withdraw waypoints and wrist-only cuff influence. `left-c/d` implement this as an offline candidate study, retaining the 48 rest bones and right-hand poses. D has no animated-magazine crossing in 61 frames, but receiver contact in frames51–54 and wrist-roll deformation still fail. Do not cook or publish these rejected candidates. Current tool checks: 21 Node and 11 Python; current public remains stage5.

Vest follow-up is narrowed to four disconnected shoulder strap islands. Original upperarm/neck influence must not return. Consider source clavicle/spine03 weights on those islands only; preserve hard plates initially. Source identification is a proposal, not validated deformation or a runtime change.

Latest continuation: both-hand E/F/G prototypes now pass sampled hand/contact checks, but cuff visual acceptance remains pending. Preview stage8 exposes G's two-hand actual video and the known narrow black wrist. H fails cloth deformation; I passes mechanical gates but is rejected visually. Independent measurement identifies a 48mm bind-space cuff/rim offset, so weight/radial tuning has stopped. Harmonic rest-shape trials J/K stop at 6/3 old/new normal flags; geometry confirmation is required before progressing. Public remains stage5.

QA correctness: refresh Three SkinnedMesh bounds before offline rays, with a reproduced regression and two passing tests. Old images/videos remain evidence; pre-refresh ray misses cannot establish surface absence or clear sight. Production cloth-weight merge now gates exact topology/position, permits only hand/forearm influence changes, retains base UV/material, and checks every serialized skin accessor. Rejected H is confirmed blocked by the cook gate. Current checks: 30 Node, 15 Python; fresh full unit 146 files/1492 tests.

World-body candidate kit-h-shoulder-a implements only the four strap islands (212 vertices, 75% clavicle/25% spine03). Independent GLB comparison confirms all other attributes exact and unchanged 37,465 triangles/12 primitives/53 joints. 360-frame bounds audit and 28 game-camera captures pass; visual review and local integration remain pending. Do not rerun old author or publisher commands against existing immutable candidates.


### Continued checkpoint: L rejected; headgear intake

- L rest shape passes static exact contact, but frame52 has15 actual surface crossings and frame12 local area ratio0.02336; root reproduced the consultant result. Preserve rejection evidence; no more cloth-warp weight/domain iterations.
- Withdraw the glove-side rigid padded cuff M proposal: the complete61-frame garment loop has missing/multiple radial intersections and fails the minimum-radius gate. Earlier three-frame interpolation was invalid; no M asset was created. Rethink source connection/sleeve design rather than extending that gauntlet.
- Shoulder candidate H passes preservation and pose checks but has minimal visible effect; public remains stage5.
- Mindfront KZ45 CC BY4 source retrieved from official MakeHuman pack. Helmet candidate I-A is37615tri/12primitives/53bones, with retained body texture byte seals. Correct/review fit and classic silhouette before any integration.
- Latest offline tool check:19 Python+32 Node tests pass. Runtime unit evidence remains1492 pass; no new runtime change. Goal and performance remain active/unaccepted.


### B/C headgear checkpoint

- B improves shell/NVG silhouette, but independent review rejects collapsed radial-fit retention. Root exact contact diagnostic finds538 transverse head crossings.
- Fixed C cage: one successful240-control/3068-constraint solve, zero main-band/head crossing/coplanar overlap, but edge ratio0.6606..1.9229 fails0.75..1.33. Stop before blend/export and chin-cup solve; replace/reassemble retention rather than sweep cage settings.
- Helmet B retained surfaces/UV/skin/rest rig pass and360-frame bounds pass; these are not visual/contact acceptance.
- Isolated offline SciPy1.16.3, four cage tests red->green, four existing triangle-contact helper tests pass.
- Reversibly quarantined two unused public maps: package30770277bytes, models/live maps unchanged. Two Chromium all-weapon/shared-map tests pass.

### Stage6 licensed eyewear and eye-alpha repair

- Locally integrated `kit-j-eyewear-f`, SHA37f7a5ffa26aabd187fb53e16136cf42f609dceebc811ffaa0f906835359f5a4. It adds licensed punkduck wraparound eyewear, measured helmet registration, H's separately checked212 shoulder-webbing weights, and restores the exact MakeHuman eye PNG alpha/source sidedness.
- D's opaque lens failed the art contract. E restores BLEND but exposes black eyes. Controlled unlit/map/sidedness views isolate the old generic cook's PNG→JPEG alpha loss; F fixes only that material. New source-to-cooked triangle seals and image-alpha regression checks pass (4 Node tests; reproduced missing-helper reds before implementation).
- Independent technical and closeup art reviews accept this local increment. F strict static surface contact, source preservation,360-frame bounds and28 GameRenderer captures pass. Overall CS2 finish and frame-time acceptance remain unachieved.
- Recursive runtime including credits31,735,235 bytes. Public-path QA is complete: 40 native captures,28 motion captures,1492 unit tests,63 Chromium tests and build pass; preview stage10 passes desktop/narrow interaction. Keep source PNG; first WebP trial did not meet full RGBA equality and is not used.
- Next headgear trial should reuse the licensed helmet shell/liner as modules with separately fitted existing retention, avoiding rejected I-B/C strap deformation. FPS mouth work must start from G, quantify baseline seam gaps before choosing any displacement, and use glove-specific deformation/contact gates.


### Rigid LOD diagnostic, not integrated

- Same-context static shadow-refresh B passes fixed 1440x900/scale1/state/pixel/query gates. Rebuilding adds100 calls/377407 triangles; paired GPU median4.823ms with wide variability. No dynamic shadow cadence or native FPS acceptance follows. Trial A used the wrong canvas size and is invalid.
- Built hash-bound V33 index-only rigid reduction. Mixed-weight/cross-joint triangles remain an exact oriented multiset; attribute streams never change. A fails normal orientation; one-ring B still fails vest. C uses exact full indices for failing vest/helmet.
- C38529?33871 triangles (12.1%) is rejected for runtime: webbing sampled maximum2.2506mm exceeds2.1mm, index boundary changes remain unresolved. No additional ratio/guard sweep. Source exact zero-area faces are explicitly excluded/listed only for surface sampling.
- Independent review caught the topology audit reusing original component labels. V2 separately reconstructs reduced connectivity;5 offline tests pass including protected-face removal and a removed bridge. This remains index topology, not physical welded-manifold proof.
- C2 cost probe retains live shadows in one context,45 ABBA rounds. All fixed-state/query gates pass; GPU paired median0.359ms with p05?4.947/p95+4.537ms; draw calls unchanged. No native gameplay improvement claimed. Public stage6 untouched. Evidence:qa/rigid-lod-checkpoint.json.
- Next inspect opaque material atlas batching before implementation, preserving source material appearance, alpha, team tint and rig. Modern helmet intake must pass style/license/download gates first.


### Separate world and first-person weapon templates

Inspection confirms all visible gun meshes are rigid. NPCs previously cloned two hidden FPS skin meshes,48 bones and a144-channel clip per equipped weapon; only first-person WeaponRig consumes that rig. Add a load-time world template retaining rigid node transforms, geometry/material references and muzzle/ejection anchors, with zero FPS bones/skins/clips. Use separate renderer maps; original FPS and development candidate remain intact. No new downloads, reduction, UV/material changes or per-frame bake. Fail closed if future gun content lives under a bone or an unrecognized skinned mesh.

Acceptance: unit ownership/transform/unsupported hierarchy regressions; actual four-weapon renderer test with world0 bones/source+FPS48 and exact anchors; matched visible views; full unit+CS Chromium+build; independent review. No live-FPS improvement claim without measurement. Unit behavior red reproduced retained bones, actual GLB E2E red reports48 instead of0; implementation now passes both focused checks.


World-template verification complete locally:147 files/1496 units,64 Chromium,build exit0,four exact pixel pairs. Independent review P2 on potential hidden rigid content is fixed by fail-closed guard and bidirectional source/template mesh multiset; no remaining blocker for this increment. Source models unchanged. Fresh native high22.8/38.6/221.2ms and48>50ms; low12.4/17.3/30.3ms and0>50ms. Both cover live player/spectator/next round, no interference.43 high long frames and25 long tasks cluster29?49s; not enough evidence for JS vs driver/GPU. Next finite diagnostic aligns render wall/GPU query/RAF frame IDs, with a CPU profile only around a long-task burst; do not rollback the world template or alter FrameBudget on this non-causal result.


The finite high-only frame-aligned diagnostic did not reproduce the burst:120s,9157 fully resolved queries,no skips/disjoints,0 long tasks/frames>50ms. GPU median/P95/max10.783/14.130/17.499ms; render-submit wall3.1/4.6/17.2ms. CPU burst profiler was armed but never triggered. This is not a fix or performance acceptance; do not repeatedly rerun to chase a spike. `qa/gameplay-native-gpu-world-burst/interpretation.json` records RAF F-1 pairing and probe limitations. Immutable snapshot viewId args[5] was invalid; future script corrected toargs[4], and cpuDiagnostic metadata now flags armed burst mode.

Preview stage11 failed after shell Unicode transport produced question marks/overflow. A checked-in UTF-8 HTML fragment repairs the section; stage12 passes1440/390,12images,5videos and all3tabs. No source art was modified by this preview repair. Modern FAST source intake found0 fully usable original downloads; source-budget preference is pending, no purchase/restricted download. Evaluate a finite surface-material transfer on the existing fitted modern shell separately from the rejected KZ45 silhouette.


## Stage 7 checkpoint

Generated helmet coating B is integrated locally with exact F geometry/rig/UV and all non-helmet materials. Runtime SHA852ce7ffe3f08aed4440c79cc8558f749080a69eb52e6d5ab3b766b259891f9d; recursive package31,833,840B. Independent material and actual-light reviews pass only this small increment. Public-path28motion views,47relevant Chromium tests,1496unit tests and build pass; preview stage13 verified. Initial concurrent unit/build run had one unrelated Tetris import timeout; isolated full rerun passes without code changes. No full-character or performance acceptance.

Cuff N closed-loop annulus data prototype is rejected before any asset authoring. Fresh G source intake verifies the48.57mm span and61-frame CPU skin agreement; first animated pose already has184surface crossings. Consultant independently confirms143.52deg endpoint rotation and180 non-adjacent face crossings. StopN; no phase/weight/ring sweeps. Future work requires authored wrist folds/sliding overlap or different garment construction. The best gloveG remains preview-only.

Complete character sourcing: existing intake has no second approved full tactical character. Two commercial options are documented but neither purchased nor licensed/format-cleared. Optional source preference is pending. All evidence is under run-20261008-v33-character/qa; current overall CS2 objective remains active and unachieved.

## Whole-character review and carrier source checkpoint

The whole-character review prioritizes chest-equipment silhouette, headgear and loaded rifle posture; the existing rig/anatomy remains a useful technical base. Unvanquished's official male preview is visibly science-fiction hard armour and its current whole-package author mapping is not cleared, so it was not selected or downloaded. Preserve `qa/source-unvanquished/decision.json`; do not repeat broad source searches without new evidence.

Authored two finite modular carrier candidates, with editable plate bags, shoulder straps, cummerbund, magazine pockets, bindings and webbing. B keeps the plate/pouch arrangement and uses a generated neutral nylon albedo plus licensed existing cloth maps. It also replaces the old zero-height belt flange and limits team tint to identifiers. B is 38,244 triangles,12 primitives,53 bones,3,858,552 bytes; SHA9a85e307e40c2fda654bffbf2945f5dfed0529f093a5b9001be7ebf04b6ded12. Public remains stage7, unchanged.

B is rejected for runtime: belt ends still float, side cummerbund is too rigid, MOLLE smoothing reads as padded blocks, and body/weapon contact under relative joint motion is uncertified. The 360-frame/8,723,880-vertex audit verifies finite skinning and culling bounds only. Independent art and technical reviews agree; do not promote based on mechanical tests. Next work must change method to measured garment-surface fit and a different webbing cross-section, preserving useful B modules; no further freehand offset/size sweeps.

The source Blend exporter produced a bind-pose donor while historical F GLBs retained a posed skeleton. Correct transfer checks exact mesh frame, joint order/inverse binds and `jointWorld * inverseBind` identity; Three's GLTFLoader binds identity. A mistaken extra inverse mesh factor was reproduced by a nonidentity-parent regression then fixed. Six offline tests pass. New source/patch/webbing hash and surface gates reproduce B bytes exactly; immutable candidate cook/recipe are preserved, with `qa/carrier-b-preservation-v2.json` recording later verification.

`qa/carrier-preview.html` compares stage7 and B at matching cameras; 1440/390 widths and four view tabs pass eight browser checks, with screenshots. Full unit rerun passes147files/1496tests using4workers; the default-worker run had the existing Tetris Pixi import smoke exceed5000ms, no test/product code was altered. No new gameplay performance measurement or gain claim. Overall character, FPS arms and CS2 quality remain incomplete. Evidence: `qa/carrier-checkpoint.json`, `qa/carrier-b-review.json`.

## Measured carrier and source-facet waist checkpoint

C replaces freehand side panels and open belt with measured, closed garment bands. D additionally seats thin MOLLE against actual plate triangles. Both preserve the public rig and unrelated surfaces, with39,496triangles/12primitives/53bones and3,914,836bytes. D has5static views,28actual-renderer motion views and a refreshed1440/390 comparison page. Neither is published:360runtime poses show16.54mm barycentric/LBS oracle error and garment crossings. Independent review confirms source/public clothing rows match; the error is not a rig mismatch. Blender raw groups also differ slightly from actual exported top4, so future donor rows must come from the public GLB.

Narrow waist diagnosis separates this from cummerbund failure: C waist vertices remain1.57–4.88mm outside their source anchors, but grid faces cut cloth folds. A finite E experiment clips original public trouser facets and retains their actual exported rows. Post-clip unique boundary stitching <=0.5mm leaves three measured small seam holes; filling them adds faces only. E is39,869triangles/12primitives,4,127,352bytes,projected bundle31,907,356bytes. Its360pose garment gap1.37–4.40mm and transverse garment crossings0 pass, but static self-crossings81 and animated self-crossing pairs28,024 reject it. Other skinned-surface pairs132,959 are unclassified and include attachment interfaces; they are not claimed as that many distinct visible defects. Weapons and remaining geometry in the shared webbing primitive are outside this extended audit.

Stop E generic holes_fill and C/D interpolation/clearance sweeps. A source repair must explicitly reconstruct shared garment/belt topology and seam geometry. Source-facet extraction is not automatically safe merely because it produces a manifold shell. Keep failed source candidates and evidence; public stage7 and FPS stage5 remain unchanged.14offline tool tests pass (5surface weights,3facet clipping,6bind/surface seals), source-preservation cooks pass,preview8checks pass. No new product/full-game tests or performance claims because product code/public assets did not change. Review records:qa/carrier-surface-fit-review.json and qa/waist-facets-e-review.json.
