"""Read original wrist boundary face fans before choosing a topology repair."""
import bpy,json,sys
from pathlib import Path
from collections import defaultdict
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).parent))
from original_crossbow_cuff_boundary import complete_boundary
from original_crossbow_interface_probe import evaluated
ROOT=Path(__file__).resolve().parents[3]
OLD=ROOT/'art-factory/rts/runs/original-crossbow-carry/2026-10-06-v1'
RUN=ROOT/'art-factory/rts/runs/original-crossbow-wrist-topology/2026-10-06-v1'

def face_fans(mesh,index):
    faces={p.index for p in mesh.polygons if index in p.vertices};edges=defaultdict(set)
    for fi in faces:
        for a,b in mesh.polygons[fi].edge_keys:
            if index in (a,b):edges[tuple(sorted((a,b)))].add(fi)
    connected={fi:set() for fi in faces}
    for members in edges.values():
        if len(members)==2:
            a,b=members;connected[a].add(b);connected[b].add(a)
    remaining=set(faces);fans=[]
    while remaining:
        queue=[min(remaining)];fan=set()
        while queue:
            f=queue.pop()
            if f in fan:continue
            fan.add(f);queue.extend(connected[f]-fan)
        remaining-=fan;fans.append(fan)
    return fans,{str(edge):len(members) for edge,members in edges.items() if len(members)>2}

def main():
    source=OLD/'candidate/original-crossbow-grip.blend';bpy.ops.wm.open_mainfile(filepath=str(source));rig=bpy.data.objects['crossbowRig20']
    action=bpy.data.actions['Idle'];rig.animation_data.action=action;rig.animation_data.action_slot=action.slots[0]
    bpy.context.scene.frame_set(0);bpy.context.view_layer.update()
    report=json.loads((OLD/'interface-candidate/cuff-rebuild-report.json').read_text());rows=[]
    for side in ('R','L'):
        wrist=rig.pose.bones['Hand_'+side].head
        axis=(rig.pose.bones['Forearm_'+side].head-wrist).normalized()
        for lod in (0,1):
            obj=bpy.data.objects[f'crossbowOriginalBody_LOD{lod}'];points,_,_=evaluated(obj)
            ids,edges,components=complete_boundary(obj.data,set(report['records'][side]['bodies'][obj.name]['terminal_indices']),False)
            branches=[]
            for index in ids:
                degree=sum(index in edge for edge in edges)
                if degree==2:continue
                fans,nonmanifold=face_fans(obj.data,index)
                branches.append({'index':index,'degree':degree,'face_fans':[sorted(f) for f in fans],'nonmanifold_edges':nonmanifold,'world':list(points[index]),'wrist_distance_m':(points[index]-wrist).length,'weights':{obj.vertex_groups[g.group].name:g.weight for g in obj.data.vertices[index].groups}})
            polys=[list(p.vertices) for p in obj.data.polygons];positions=[p.copy() for p in points];region=set(ids)
            for branch in branches:
                for fan in branch['face_fans'][1:]:
                    added=len(positions);positions.append(points[branch['index']].copy());region.add(added)
                    for fi in fan:polys[fi]=[added if index==branch['index'] else index for index in polys[fi]]
            counts=defaultdict(int)
            for poly in polys:
                for a,b in zip(poly,poly[1:]+poly[:1]):counts[tuple(sorted((a,b)))]+=1
            graph=defaultdict(set)
            for (a,b),count in counts.items():
                if count==1 and a in region and b in region:graph[a].add(b);graph[b].add(a)
            loops=[];remaining=set(graph)
            while remaining:
                start=min(remaining);loop=[start];previous=None;current=start
                while True:
                    assert len(graph[current])==2,(side,lod,current,'Split did not yield simple boundaries')
                    following=next(i for i in graph[current] if i!=previous)
                    if following==start:break
                    loop.append(following);previous,current=current,following
                    assert len(loop)<=len(graph),'Boundary traversal failed'
                remaining-=set(loop);p=[positions[i] for i in loop];center=sum(p,Vector())/len(p)
                area=sum((a.cross(b) for a,b in zip(p,p[1:]+p[:1])),Vector()).length*.5
                loops.append({'vertices':len(loop),'indices':loop,'area_m2':area,'wrist_distance_m':(center-wrist).length,'world_center':list(center),'historical_seeds':len(set(loop)&set(report['records'][side]['bodies'][obj.name]['terminal_indices']))})
            rows.append({'side':side,'lod':lod,'boundary_vertices':len(ids),'boundary_edges':len(edges),'axial_range_m':[min((points[i]-wrist).dot(axis) for i in ids),max((points[i]-wrist).dot(axis) for i in ids)],'max_wrist_distance_m':max((points[i]-wrist).length for i in ids),'branches':branches,'boundary_indices':sorted(ids),'boundary_pairs':edges,'split_boundary_loops':loops})
    out=RUN/'qa';out.mkdir(parents=True,exist_ok=True)
    (out/'boundary-face-fans.json').write_text(json.dumps({'source':str(source),'rows':rows,'runtime_publish_allowed':False},indent=2)+'\n')
    print('BOUNDARY_FANS',json.dumps([{'side':r['side'],'lod':r['lod'],'axial_range_m':r['axial_range_m'],'loops':[{k:v for k,v in loop.items() if k!='indices'} for loop in r['split_boundary_loops']]} for r in rows]))
    if '--render' in sys.argv:
        scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE';scene.eevee.taa_render_samples=32
        scene.render.resolution_x=1200;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
        scene.render.image_settings.file_format='PNG';scene.camera.data.type='ORTHO';scene.camera.data.ortho_scale=.30
        mat=bpy.data.materials.new('QA Boundary');mat.use_nodes=True;shader=mat.node_tree.nodes.get('Principled BSDF')
        shader.inputs['Base Color'].default_value=(.02,1,.03,1);shader.inputs['Emission Color'].default_value=(.02,1,.03,1);shader.inputs['Emission Strength'].default_value=1
        for row in rows:
            if row['lod']!=1:continue
            side=row['side'];points,_,_=evaluated(bpy.data.objects['crossbowOriginalBody_LOD1']);created=[]
            for i,j in row['boundary_pairs']:
                curve=bpy.data.curves.new('QAWristBoundary','CURVE');curve.dimensions='3D';curve.bevel_depth=.0005;curve.bevel_resolution=1
                spline=curve.splines.new('POLY');spline.points.add(1)
                for point,p in zip(spline.points,[points[i],points[j]]):point.co=(*p,1)
                obj=bpy.data.objects.new('QAWristBoundary',curve);scene.collection.objects.link(obj);obj.data.materials.append(mat);created.append(obj)
            for obj in bpy.data.objects:
                if obj.type=='MESH':obj.hide_render=obj.name!='crossbowOriginalBody_LOD1'
            target=rig.pose.bones['Hand_'+side].head.copy()
            for view,direction in [('front',(2,4,1)),('back',(-2,-4,1))]:
                camera=scene.camera;camera.location=target+Vector(direction);camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
                scene.render.filepath=str(out/f'boundary-lod1-{side}-{view}.png');bpy.ops.render.render(write_still=True)
            for obj in created:bpy.data.objects.remove(obj,do_unlink=True)
if __name__=='__main__':main()
