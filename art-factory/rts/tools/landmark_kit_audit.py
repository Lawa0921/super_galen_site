"""Freeze final recipe + certify candidate/source/QA hashes and delivery budget."""
import json,hashlib,struct,gzip,shutil,unittest,io
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3];RUN=ROOT/'art-factory/rts/runs/landmark-kit/2026-10-08-v1'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def audit():
    sources=json.loads((RUN/'raw/sources.json').read_text());build=json.loads((RUN/'qa/build.json').read_text());reimport=json.loads((RUN/'qa/reimport.json').read_text());validator=json.loads((RUN/'qa/gltf-validator.json').read_text())
    assert not any(x.get('missing') for x in sources['sources'])
    for s in sources['sources']:
        assert sha(ROOT/s['frozen'])==s['sha256'],s
        if 'candidate' in s:assert sha(ROOT/s['candidate'])==s['candidate_sha256'],s
    assert reimport['passed'] and len(reimport['checks'])==8
    assert validator['errors']==validator['warnings']==0 and len(validator['results'])==8
    rows=[]
    for a in build:
        p=ROOT/a['candidate'];data=p.read_bytes();length=struct.unpack_from('<I',data,12)[0];g=json.loads(data[20:20+length]);assert sha(p)==a['sha256'];assert sha(ROOT/a['source'])==a['source_sha256']
        ri=next(r for r in reimport['checks'] if r['candidate']==a['candidate']);vr=next(r for r in validator['results'] if r['candidate']==p.name)
        assert ri['sha256']==vr['sha256']==a['sha256'] and ri['passed'];assert ri['pivot_zero']
        assert ri['triangles']==a['triangles'];assert not a['runtime_publish_allowed'];assert len(g['materials'])<=4
        assert all(not any(k in n for k in ('translation','rotation','scale')) for n in g['nodes']),g['nodes']
        primitives=[pr for m in g['meshes'] for pr in m['primitives']]
        assert all(all(key in pr['attributes'] for key in ('POSITION','NORMAL','TANGENT','TEXCOORD_0')) for pr in primitives)
        assert all('bufferView' in im and 'uri' not in im for im in g['images'])
        assert all(t['nonmanifold_edges']==0 for t in ri['topology_after_position_weld'])
        position_bounds=[[min(g['accessors'][p['attributes']['POSITION']]['min'][k] for p in primitives) for k in range(3)],[max(g['accessors'][p['attributes']['POSITION']]['max'][k] for p in primitives) for k in range(3)]]
        assert position_bounds[0][1]>=-.080001 and position_bounds[1][1]<=5.200001
        for k in (0,2):assert position_bounds[0][k]>=-1.900001 and position_bounds[1][k]<=1.900001
        images=[{'name':im.get('name'),'mime':im['mimeType'],'embedded_bytes':g['bufferViews'][im['bufferView']]['byteLength']} for im in g['images']]
        rows.append({**a,'draw_groups':len(primitives),'glb_bounds_y_up':position_bounds,'embedded_texture_bytes':sum(im['embedded_bytes'] for im in images),'embedded_images':images,'reimport_passed':True,'validator_errors':vr['issues']['numErrors'],'validator_warnings':vr['issues']['numWarnings']})
    maps=[]
    for name,ids in [('river',['river-gatehouse','river-shrine']),('highland',['highland-watchtower','quarry-ruins'])]:
        pair=[r for r in rows if r['id'] in ids];amount=sum(r['gzip_bytes'] for r in pair);assert amount<=2000000
        maps.append({'map':name,'unique_prefabs':ids,'both_lods_raw_bytes':sum(r['bytes'] for r in pair),'both_lods_gzip_bytes':amount,'lod0_only_gzip_bytes':sum(r['gzip_bytes'] for r in pair if r['lod']==0),'budget_bytes':2000000,'requires_http_compression_for_transfer_budget':True,'duplicate_map_instances_require_no_additional_download':True})
    # Copy exact final authoring recipe and QA tools into the run, with SHA.
    recipe=[]
    for p in sorted((ROOT/'art-factory/rts/tools').glob('landmark_kit_*')):
        if not p.is_file():continue
        dst=RUN/'raw/recipe'/p.name;shutil.copy2(p,dst);recipe.append({'source':p.relative_to(ROOT).as_posix(),'frozen':dst.relative_to(ROOT).as_posix(),'sha256':sha(p)})
    module_interfaces={'units':'metres; Blender Z-up; all assembly origins world-ground (0,0,0)','reusable_components':[
        {'family':'chipped-ashlar','builder':'block','interfaces':'level lower bed -height/2, upper bed +height/2; bevel limited to min(.022,min_dimension*.15); individually chipped exposed top corners'},
        {'family':'thick-profile','builder':'profile / arc','interfaces':'closed XZ profile extruded through Y ±depth/2; arch radius and end angles identify the radial bearing joints; broken ends remain capped'},
        {'family':'turned-profile','builder':'turned','interfaces':'original radius/Z control rings; bottom/top caps; fluted columns, altar waisting, spool flanges and pegs share editable control construction'},
        {'family':'hollow-cornice-ring','builder':'annular','interfaces':'closed radial/Z profile swept octagonally; inner radius .94 m preserves the tower cavity'},
        {'family':'mortised-timber','builder':'beam / block','interfaces':'local Z endpoints ±length/2; rotation fits world attachment A/B; oak long-axis UV follows timber grain'},
        {'family':'capped-cord','builder':'tube','interfaces':'parallel section frame follows explicit world control path; both ends capped; rope touches jib/winch/grounded stone'}],
        'source_editability':'Each raw prefab .blend retains named component meshes with original control vertices/faces JSON and module_family/joint_interface/source_recipe properties. Final recipe snapshots reproduce parameters and joining; export joins material groups only after source save.'}
    (RUN/'raw/module-interfaces.json').write_text(json.dumps(module_interfaces,indent=2)+'\n')
    tests={'command':'python -B art-factory/rts/tools/landmark_kit_geometry_test.py','red_observed':'4 errors from intentional NotImplementedError in arch/extrusion/footprint helper; before implementation, captured in session tool output','green_tests':4,'cases':['thick curved voussoir signed volume and closed 2-face edge incidence','concave broken-wall extrusion preserves silhouette','invalid radius/depth/degenerate shape rejection','ground sinking limit and footprint/height overflow regression']}
    (RUN/'qa/tdd.json').write_text(json.dumps(tests,indent=2)+'\n')
    output={'status':'candidate','runtime_publish_allowed':False,'source_rights_evidence':'Original models authored under explicit task brief. Existing raw material imagegen sources, prompts, contracts, deterministic recipes and all source/derivative hashes frozen; no third-party downloads. Original imagegen records do not specify exact internal model version. No new legal terms are inferred.','assets':rows,'maps':maps,'recipe':recipe,'texture_processing':'Ashlar RGB 384; cutstone/oak RGB256; brass RGB128; normal/MR128. Lanczos/JPEG84 from existing generated surfaces. Roughness/metallic are artistic values and normal maps are existing generated-surface luminance derivatives, not physical measurements.','validation':'eight actual Blender GLB reimports + Khronos validator zero errors and zero warnings; all triangles finite/nondegenerate, closed welded component surfaces, exact origin/unit scales, finite UV/normals/tangents, embedded images','pending':['independent review by root under review-pr','runtime renderer/map placement/terrain occlusion/performance integration','HTTP compression verified at actual delivery endpoint','whole-game commercial acceptance outside this work package']}
    (RUN/'qa/delivery-audit.json').write_text(json.dumps(output,indent=2)+'\n')
    (RUN/'raw/provenance-lock.json').write_text(json.dumps({'sources_manifest_sha256':sha(RUN/'raw/sources.json'),'module_interfaces_sha256':sha(RUN/'raw/module-interfaces.json'),'source_brief_sha256':sha(RUN/'prompts/authored-model-brief.md'),'style_source_sha256':sha(RUN/'raw/inputs/style-source.md'),'recipe':recipe,'assets':[{'id':a['id'],'lod':a['lod'],'source_sha256':a['source_sha256'],'candidate_sha256':a['sha256']} for a in rows]},indent=2)+'\n')
    print(json.dumps({'verified_candidates':len(rows),'map_gzip_bytes':{m['map']:m['both_lods_gzip_bytes'] for m in maps},'frozen_recipe_files':len(recipe)}))
if __name__=='__main__':audit()
