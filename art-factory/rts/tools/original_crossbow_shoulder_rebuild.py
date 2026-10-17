"""Keep original UV splits while unifying shoulder seam skinning weights."""
import bpy,hashlib,json,sys,shutil
from pathlib import Path
from collections import defaultdict
from mathutils.kdtree import KDTree
sys.path.insert(0,str(Path(__file__).parent))
from original_crossbow_interface_probe import RUN

def main():
    source=RUN/'interface-candidate/original-crossbow-grip.blend'
    bpy.ops.wm.open_mainfile(filepath=str(source));records={}
    for lod in (0,1):
        body=bpy.data.objects[f'crossbowOriginalBody_LOD{lod}'];mesh=body.data;tree=KDTree(len(mesh.vertices))
        for vertex in mesh.vertices:tree.insert(vertex.co,vertex.index)
        tree.balance();visited=set();rows=[]
        for vertex in mesh.vertices:
            if vertex.index in visited or not (1.18<vertex.co.z<1.66 and abs(vertex.co.x)<.40):continue
            ids={index for _,index,_ in tree.find_range(vertex.co,.000005)}
            if len(ids)<2:continue
            visited|=ids;weights={i:{g.group:g.weight for g in mesh.vertices[i].groups} for i in ids}
            if all(weights[i]==weights[vertex.index] for i in ids):continue
            combined=defaultdict(float)
            for values in weights.values():
                for group,weight in values.items():combined[group]+=weight/len(ids)
            strongest=sorted(combined.items(),key=lambda item:item[1],reverse=True)[:4];total=sum(weight for _,weight in strongest)
            for index in ids:
                for group in list(mesh.vertices[index].groups):body.vertex_groups[group.group].remove([index])
                for group,weight in strongest:body.vertex_groups[group].add([index],weight/total,'REPLACE')
            rows.append({'indices':sorted(ids),'rest_point':list(vertex.co),'weights_before':{str(i):{body.vertex_groups[g].name:w for g,w in values.items()} for i,values in weights.items()},'weights_after':{body.vertex_groups[g].name:w/total for g,w in strongest}})
        records[body.name]=rows
    out=RUN/'seam-candidate';out.mkdir(exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(out/'original-crossbow-grip.blend'))
    shutil.copy2(RUN/'interface-candidate/cuff-rebuild-report.json',out/'cuff-rebuild-report.json')
    result={'source':str(source),'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'method':'Coincident original shoulder positions share identical normalized top-four skin weights; original topology, positions, UVs and materials retained','records':records,'runtime_publish_allowed':False}
    (out/'shoulder-rebuild-report.json').write_text(json.dumps(result,indent=2)+'\n')
    print('SHOULDER_REBUILD',json.dumps({name:{'groups':len(rows),'vertices':sum(len(row['indices']) for row in rows)} for name,rows in records.items()}))
if __name__=='__main__':main()
