"""Blender asset integrity: allow only the requested right-hand/sword changes."""
import bpy, bmesh, hashlib, json, math, sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from commander_grip_check import SOURCE,RUN

def vertex(v):
    return [list(v.co),[[g.group,g.weight] for g in v.groups]]
def face(o,p):
    return [p.material_index,[[vertex(o.data.vertices[o.data.loops[i].vertex_index]),*[list(uv.data[i].uv) for uv in o.data.uv_layers]] for i in p.loop_indices]]
def digest(x):return hashlib.sha256(json.dumps(x).encode()).hexdigest()
def snapshot():
    rows=[];body={};curves={}
    for o in sorted(bpy.data.objects,key=lambda o:o.name):
        if o.type=='MESH' and 'Shield' in o.name:
            rows.append([o.name,[face(o,p) for p in o.data.polygons]])
        if o.type=='ARMATURE':rows.append([o.name,[[b.name,b.parent.name if b.parent else None,[list(r) for r in b.matrix_local]] for b in o.data.bones]])
        if o.type=='MESH' and 'OriginalBody' in o.name:
            body[o.name]={digest(face(o,p)):list(p.center) for p in o.data.polygons}
    for a in sorted(bpy.data.actions,key=lambda a:a.name):
        for layer in a.layers:
            for strip in layer.strips:
                for slot in a.slots:
                    bag=strip.channelbag(slot)
                    if not bag:continue
                    for c in bag.fcurves:
                        key=f'{a.name}|{c.data_path}|{c.array_index}'
                        curves[key]=[[*p.co,*p.handle_left,*p.handle_right,p.interpolation] for p in c.keyframe_points]
    return digest(rows),body,curves

def main():
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE));before,oldbody,oldcurves=snapshot()
    bpy.ops.wm.open_mainfile(filepath=str(RUN/'raw/commander-grip.blend'));after,newbody,newcurves=snapshot()
    assert before==after,'Shield or bind rig changed'
    assert oldcurves.keys()==newcurves.keys(),'Animation channel set changed'
    changed=[k for k in oldcurves if oldcurves[k]!=newcurves[k]]
    assert len(changed)==4 and all(k.startswith('Death|pose.bones["Hand_R"].rotation_quaternion|') for k in changed),changed
    report={'status':'passed','protected_shield_rig_sha256':after,'changed_curves':changed,'body':{},'gauntlet':{}}
    for name,new in newbody.items():
        old=oldbody[name];assert new.keys()<=old.keys(),f'{name}: retained surface/UV/weights changed'
        removed=[old[k] for k in old.keys()-new.keys()]
        assert removed and all(x>.33 and y>.04 and z<1.10 for x,y,z in removed),'Removed surface outside right-hand trim'
        report['body'][name]={'retained_faces_unchanged':len(new),'removed_hand_faces':len(removed)}
    for lod in (0,1):
        o=bpy.data.objects[f'CommanderClosedGrip_R_LOD{lod}'];bm=bmesh.new();bm.from_mesh(o.data)
        assert all(math.isfinite(c) for v in o.data.vertices for c in v.co)
        assert all(abs(sum(g.weight for g in v.groups)-1)<1e-6 and all(g.weight>=0 for g in v.groups) for v in o.data.vertices)
        assert {g.name for g in o.vertex_groups}=={'Hand_R','Forearm_R'}
        zero=sum(f.calc_area()<1e-12 for f in bm.faces);assert zero==0
        boundary=sum(e.is_boundary for e in bm.edges);assert boundary==(14 if lod==0 else 8),'Only intentional cuff opening is permitted'
        assert all(e.is_boundary or e.is_manifold for e in bm.edges)
        report['gauntlet'][str(lod)]={'triangles':sum(len(p.vertices)-2 for p in o.data.polygons),'zero_area_faces':zero,'cuff_open_edges':boundary,'normalized_weights':True}
        bm.free()
    assert report['gauntlet']['1']['triangles']<report['gauntlet']['0']['triangles']
    (RUN/'qa/source-parity.json').write_bytes((json.dumps(report,indent=2)+'\n').encode());print(json.dumps(report))
if __name__=='__main__':main()
