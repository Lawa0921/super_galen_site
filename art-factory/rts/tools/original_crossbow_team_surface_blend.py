"""Save an editable original Blender material counterpart; no geometry export."""
import base64,bpy,json,sys,hashlib
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
ROOT=Path(__file__).resolve().parents[3]
SOURCE=ROOT/'art-factory/rts/runs/original-crossbow-wrist-topology/2026-10-06-v1'
RUN=ROOT/'art-factory/rts/runs/original-crossbow-team-surface/2026-10-06-v1'
from original_crossbow_cuff_verify import snapshot
bpy.ops.wm.open_mainfile(filepath=str(SOURCE/'candidate/original-crossbow-grip.blend'));before,bind,curves=snapshot()
uri='data:image/png;base64,'+base64.b64encode((RUN/'candidate/team-mask-1024.png').read_bytes()).decode('ascii')
for lod in (0,1):
    obj=bpy.data.objects[f'crossbowOriginalBody_LOD{lod}'];original=next(m for m in obj.data.materials if 'TeamCloth' not in m.name)
    mat=original.copy();mat.name='TeamClothMasked_crossbow_original'+('' if lod==0 else '_LOD1');mat['teamTintMask']=uri
    obj.data.materials.clear();obj.data.materials.append(mat)
    for face in obj.data.polygons:face.material_index=0
after,new_bind,new_curves=snapshot();assert bind==new_bind and curves==new_curves
for name,old in before.items():
    keys=set(old)-({'materials'} if name.startswith('crossbowOriginalBody_LOD') else set())
    assert all(old[k]==after[name][k] for k in keys),('Nonmaterial source change',name)
target=RUN/'candidate/original-crossbow-grip.blend';bpy.ops.wm.save_as_mainfile(filepath=str(target))
report={'pass':True,'source_sha256':hashlib.sha256((SOURCE/'candidate/original-crossbow-grip.blend').read_bytes()).hexdigest(),'candidate_sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'unchanged':['all mesh coordinates','all topology','all UV','all weights','20 bind bones','all original action curves','all non-body meshes/material assignments'],'runtime_publish_allowed':False}
(RUN/'qa/blend-preservation.json').write_text(json.dumps(report,indent=2)+'\n');print('TEAM_BLEND',json.dumps(report))
