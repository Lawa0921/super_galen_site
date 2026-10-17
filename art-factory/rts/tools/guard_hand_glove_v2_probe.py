"""Read-only plane-choice and actual cuff diagnosis before local wrist repair."""
import sys
from pathlib import Path
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path(__file__).parent))
import bpy,bmesh,numpy as np
from mathutils import Vector
from guard_hand_glove_v2_build import RUN,MAIN,WC,read,write,meshdata
from guard_hand_glove_v2_geometry import directed_boundary_loops
sys.path.insert(0,str(MAIN/'art-factory/rts/tools'))
from original_guard_arm_hinge import strict_triangle_crossings
def main():
    bpy.ops.wm.open_mainfile(filepath=str(RUN/'qa/stages/02-contact-patches.blend'));obj=bpy.data.objects['GuardRightSoftGlove_ClayLOD0'];interface=read(RUN/'qa/v35-interface.json');axis=Vector(interface['actual_right_cloth_terminal']['forearm_axis_world'])
    v,f=meshdata(obj);cuff=interface['actual_right_cuff'];pairs=strict_triangle_crossings(np.array(v)[np.array(f)],np.array(cuff['vertices_m'])[np.array(cuff['triangles'])]);results=[]
    for offset in (-.024,-.020,-.016,-.012,-.008,0,.006):
        bm=bmesh.new();bm.from_mesh(obj.data);center=WC+axis*offset
        bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=1e-7,plane_co=obj.matrix_world.inverted()@center,plane_no=obj.matrix_world.to_3x3().inverted()@axis,clear_inner=True,clear_outer=False)
        bm.verts.index_update();bm.verts.ensure_lookup_table();bm.faces.index_update();faces=[[p.index for p in f.verts] for f in bm.faces];loops=directed_boundary_loops(faces)
        stats=[]
        for loop in loops:
            points=[obj.matrix_world@bm.verts[i].co for i in loop];r=[(p-center).length for p in points];area=sum(((b-center).cross(c-center) for b,c in zip(points,points[1:]+points[:1])),Vector());signs=[(a-center).cross(b-center).dot(axis) for a,b in zip(points,points[1:]+points[:1])]
            stats.append({'count':len(loop),'radial_min_m':min(r),'radial_max_m':max(r),'centroid_shift_m':list(sum(points,Vector())/len(points)-center),'monotone_radial_star':all(s>0 for s in signs) or all(s<0 for s in signs)})
        results.append({'offset_m':offset,'loops':stats});bm.free()
    write(RUN/'qa/wrist-plane-probe.json',{'stage02_actual_cuff_crossings':[list(map(int,p)) for p in pairs],'plane_candidates':results});print(results,flush=True);print('full stage02 actual cuff pairs',len(pairs),flush=True)
if __name__=='__main__':main()
