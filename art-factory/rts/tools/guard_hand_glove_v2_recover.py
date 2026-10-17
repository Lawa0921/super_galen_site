"""Inspect frozen original authoring objects; reconstruct missing QF base once."""
import sys,json,hashlib
from pathlib import Path
sys.dont_write_bytecode=True
sys.path.insert(0,str(Path(__file__).parent))
import bpy,bmesh
from guard_hand_foundation_math import topology,capped_signed_volume
ROOT=Path(__file__).resolve().parents[3]
OLD=ROOT/'art-factory/rts/runs/guard-hand-glove/2026-10-09-v1'
RUN=ROOT/'art-factory/rts/runs/guard-hand-glove/2026-10-09-v2'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
    source=OLD/'candidate/guard-right-hand-soft-glove-clay.blend'
    assert sha(source)=='df73fea97af676a1807368a63734aca53ff33a2b815dc5039a250c5522331b34'
    bpy.ops.wm.open_mainfile(filepath=str(source))
    inventory=[{'name':o.name,'type':o.type,'vertices':len(o.data.vertices) if o.type=='MESH' else None,'polygons':len(o.data.polygons) if o.type=='MESH' else None} for o in bpy.data.objects]
    (RUN/'qa/source-object-inventory.json').write_text(json.dumps(inventory,indent=2)+'\n',encoding='utf8')
    print(json.dumps(inventory,indent=2),flush=True)
    if '--recover' not in sys.argv:return
    sculpt=bpy.data.objects['OriginalSoftGloveSculptedSource']
    base=sculpt.copy();base.data=sculpt.data.copy();bpy.context.collection.objects.link(base);base.name='OriginalSoftGloveCleanQFBase'
    base.hide_set(False);base.hide_render=False
    bpy.ops.object.select_all(action='DESELECT');base.select_set(True);bpy.context.view_layer.objects.active=base
    assert bpy.ops.object.quadriflow_remesh(use_mesh_symmetry=False,use_preserve_sharp=False,use_preserve_boundary=False,target_faces=1500,seed=0)=={'FINISHED'}
    base.data.calc_loop_triangles();v=[list(base.matrix_world@p.co) for p in base.data.vertices];f=[list(t.vertices) for t in base.data.loop_triangles]
    topo=topology(v,f);volume=capped_signed_volume(v,f)
    prior=json.loads((OLD/'qa/stage-new-retopology-base.json').read_text(encoding='utf8'))
    assert topo==prior['topology'],(topo,prior['topology'])
    assert abs(volume-prior['signed_volume_m3'])<1e-12,(volume,prior['signed_volume_m3'])
    for o in list(bpy.data.objects):
        if o!=base:bpy.data.objects.remove(o,do_unlink=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(RUN/'raw/clean-qf-base.blend'))
    out={'source_path':source.as_posix(),'source_sha256':sha(source),'recovery':'One exact same-input QF seed0 recovery because frozen v1 has no saved base object; no subsequent global QF/voxel allowed','topology':topo,'volume_m3':volume,'previous_volume_m3':prior['signed_volume_m3'],'editable_base_sha256':sha(RUN/'raw/clean-qf-base.blend'),'vertices_m':v,'faces':[list(p.vertices) for p in base.data.polygons]}
    (RUN/'raw/clean-qf-base.json').write_text(json.dumps(out,indent=2)+'\n',encoding='utf8')
if __name__=='__main__':main()
