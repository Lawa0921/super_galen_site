"""Fail-closed actual ready-pose contact test, independent of repair implementation."""
import bpy,json,sys
from pathlib import Path
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).parent))
from original_crossbow_interface_probe import ready,evaluated,crossing_points,SOURCE,QA

def main():
    args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
    source=Path(args[0]).resolve() if args else SOURCE
    bpy.ops.wm.open_mainfile(filepath=str(source));rig=bpy.data.objects['crossbowRig20'];ready(rig)
    rows=[]
    for lod in (0,1):
        wp,wt,_=evaluated(bpy.data.objects[f'CrossbowWeapon_LOD{lod}']);wb=BVHTree.FromPolygons(wp,wt,all_triangles=True)
        for name in [f'crossbowOriginalBody_LOD{lod}','OriginalCrossbowClosedGrip_L','OriginalCrossbowClosedGrip_R']:
            bp,bt,_=evaluated(bpy.data.objects[name]);bb=BVHTree.FromPolygons(bp,bt,all_triangles=True)
            hits=[(i,j) for i,j in wb.overlap(bb) if crossing_points([wp[k] for k in wt[i]],[bp[k] for k in bt[j]])]
            rows.append({'lod':lod,'object':name,'crossings':len(hits)})
    result={'source':str(source),'rows':rows,'pass':all(r['crossings']==0 for r in rows),'runtime_publish_allowed':False}
    target=QA/('ready-baseline.json' if source==SOURCE else 'ready-contact.json')
    target.write_text(json.dumps(result,indent=2)+'\n');print('READY_CONTACT',json.dumps(result))
    assert result['pass'],'Actual ready pose contains visible interface crossings'
if __name__=='__main__':main()
