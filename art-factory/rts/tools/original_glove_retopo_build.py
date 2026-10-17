"""Author the source-fitted original hand rig and actual open/close motion."""
import bpy,bmesh,hashlib,json,math,sys
from pathlib import Path
from mathutils import Vector,Matrix,Quaternion
sys.path.insert(0,str(Path(__file__).parent))
import original_glove_build as original
ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/'art-factory/rts/runs/original-glove-retopo/2026-10-07-v1'

def pose_matrices(rig,side,amount):
    matrices={'Hand_L':rig.data.bones['Hand_L'].matrix_local.copy()}
    for name,angles in {'Index':(58,84,42),'Middle':(62,86,43),'Ring':(64,85,42),'Little':(66,83,40)}.items():
        head=rig.data.bones[name+'1_L'].head_local.copy();rotation=0
        for index,angle in enumerate(angles,1):
            key=f'{name}{index}_L';bone=rig.data.bones[key];rotation+=math.radians(angle)*amount
            q=Quaternion((1,0,0),rotation)@bone.matrix_local.to_quaternion()
            matrices[key]=Matrix.LocRotScale(head,q,Vector((1,1,1)));head+=q@Vector((0,bone.length,0))
    head=rig.data.bones['Thumb1_L'].head_local.copy()
    for index,target in [(1,(-.65,-.40,.65)),(2,(-.90,0,-.42)),(3,(-.85,.10,-.52))]:
        key=f'Thumb{index}_L';bone=rig.data.bones[key];rest=(bone.tail_local-bone.head_local).normalized()
        direction=rest.lerp(Vector(target).normalized(),amount*(.65 if index==1 else 1)).normalized()
        q=rest.rotation_difference(direction)@bone.matrix_local.to_quaternion()
        matrices[key]=Matrix.LocRotScale(head,q,Vector((1,1,1)));head+=direction*bone.length
    return matrices

def main():
    data=json.loads((RUN/'raw/source-fitted-cage.json').read_text(encoding='utf-8'))
    bpy.ops.wm.read_factory_settings(use_empty=True);scene=bpy.context.scene;scene.render.fps=24;scene.frame_start=0;scene.frame_end=48
    arm=bpy.data.armatures.new('OriginalRetopoHandSkeleton_L');rig=bpy.data.objects.new('OriginalHandRig_L',arm);scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active=rig;rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
    for record in data['bones']:
        bone=arm.edit_bones.new(record['name']+'_L');bone.head=record['head'];bone.tail=record['tail']
        if record['parent']:bone.parent=arm.edit_bones[record['parent']+'_L']
    bpy.ops.object.mode_set(mode='OBJECT')
    mesh=bpy.data.meshes.new('OriginalSourceFittedRetopology');mesh.from_pydata(data['vertices'],[],data['faces']);mesh.update()
    obj=bpy.data.objects.new('OriginalRetopoGlove_L_LOD0',mesh);scene.collection.objects.link(obj)
    for name in [b['name'] for b in data['bones']]:obj.vertex_groups.new(name=name+'_L')
    for i,skin in enumerate(data['weights']):
        total=sum(skin.values())
        for name,weight in skin.items():obj.vertex_groups[name+'_L'].add([i],weight/total,'REPLACE')
    bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free();mesh.update()
    for face in mesh.polygons:face.use_smooth=True
    mat=bpy.data.materials.new('InspectionClay');mat.use_nodes=True;shader=mat.node_tree.nodes.get('Principled BSDF');shader.inputs['Base Color'].default_value=(.32,.36,.38,1);shader.inputs['Roughness'].default_value=.68;mesh.materials.append(mat)
    obj.parent=rig;mod=obj.modifiers.new('OriginalFingerSkin','ARMATURE');mod.object=rig
    original.RUN=RUN;original.pose_matrices=pose_matrices;original.animate(rig,'L')
    bpy.ops.wm.save_as_mainfile(filepath=str(RUN/'candidate/original-retopo-l.blend'))
    original.export(rig,[obj],'L')
    report={'source_sha256':data['source_sha256'],'cage_sha256':hashlib.sha256((RUN/'raw/source-fitted-cage.json').read_bytes()).hexdigest(),'bones':len(arm.bones),'vertices':len(mesh.vertices),'triangles':sum(len(p.vertices)-2 for p in mesh.polygons),'motion':'Original 2-second OpenClose, adapted rest bones and original curls/opposition; quarter-frame authoring at 24 fps.','material':'Inspection clay only, no UV/texture bake yet.','files':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in (RUN/'candidate').iterdir() if p.suffix in ['.blend','.glb']},'runtime_publish_allowed':False}
    (RUN/'qa/authoring.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(report))
    if '--no-render' in sys.argv:return
    original.render(rig,[obj],'L')

if __name__=='__main__':main()
