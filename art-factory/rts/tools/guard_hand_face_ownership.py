"""Prepare a reviewable original-source face selection for ONE finger patch.

Seed faces come from the retained dense atlas, not a rejected low mesh. A bounded
two-ring adjacency expansion fills sample gaps. This produces a selection for
visual confirmation; it does not grant semantic approval or publish geometry.
"""
import bpy,hashlib,json,math,sys
import numpy as np
from pathlib import Path
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).parent))
from guard_hand_surface_chart import ROOT,SOURCE,EXPECTED,RUN as MEASUREMENT,ray_layers
from guard_hand_finger_patch import source_graph
from grip_chart_cage_math import pair_verified_hits

RUN=ROOT/'art-factory/rts/runs/guard-right-hand-cage/2026-10-08-v2'


def main():
    global RUN
    adjacent='--adjacent' in sys.argv
    if adjacent:RUN=ROOT/'art-factory/rts/runs/guard-right-hand-cage/2026-10-08-v3-adjacent'
    for folder in ('raw','qa','qa/renders'):(RUN/folder).mkdir(parents=True,exist_ok=True)
    assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()==EXPECTED
    atlas_path=MEASUREMENT/'raw/finger-atlas.json'
    if not adjacent:
        atlas=json.loads(atlas_path.read_text(encoding='utf-8'))
        seeds={side:{int(ray['selected']['source_pair'][side]['face']) for ray in atlas['rays'] if ray['selected']} for side in ('inner','outer')}
    frame=json.loads((MEASUREMENT/'raw/control-chart.json').read_text(encoding='utf-8'))
    origin,axis,across,around=(Vector(frame[k]) for k in ('origin','axis','across','around'))
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE));source=bpy.data.objects['OriginalGripChannelCandidate']
    source.data.calc_loop_triangles();vertices=[source.matrix_world@v.co for v in source.data.vertices]
    triangles=np.asarray([t.vertices[:] for t in source.data.loop_triangles],dtype=np.int32)
    adjacency,components,_=source_graph(triangles)
    if adjacent:
        from mathutils.bvhtree import BVHTree
        bvh=BVHTree.FromPolygons(vertices,triangles.tolist(),all_triangles=True);seeds={'inner':set(),'outer':set()};rays=[]
        for angle in np.linspace(math.radians(67.5),math.radians(97.5),65):
            direction=across*math.cos(angle)+around*math.sin(angle)
            for z in np.linspace(.166,.192,109):
                t=(z-origin.z)/axis.z;point=origin+axis*t;hits=ray_layers(bvh,point,direction,frame['radial_bound'])
                for hit in hits:hit['component']=int(components[hit['face']]);hit['position']=list(point+direction*hit['radius'])
                pairs=pair_verified_hits(hits,min_normal=.05,min_thickness=.00025)
                selected=pairs['pairs'][0] if pairs['reason'] is None and len(pairs['pairs'])==1 and pairs['pairs'][0]['outer']['radius']<.055 else None
                if selected:
                    for side in ('inner','outer'):seeds[side].add(selected[side]['face'])
                rays.append({'angle':float(angle),'axis_world_z':float(z),'ray_hits':hits,'selected_pair':selected,'reason':pairs['reason']})
        atlas_path=RUN/'raw/source-selection-rays.json'
        atlas_path.write_text(json.dumps({'status':'measurement_only','source_sha256':EXPECTED,'rays':rays},indent=2)+'\n',encoding='utf-8')
    z_margin=(.165,.193) if adjacent else (.129,.159)
    def in_margin(face,side):
        points=[vertices[i] for i in triangles[face]];center=sum(points,Vector())/3;delta=center-origin
        t=delta.dot(axis);radial=delta-axis*t;angle=math.degrees(math.atan2(radial.dot(around),radial.dot(across)))
        normal=(points[1]-points[0]).cross(points[2]-points[0]).normalized();dot=normal.dot(radial.normalized())
        return 65.5<=angle<=99.5 and z_margin[0]<=origin.z+axis.z*t<=z_margin[1] and radial.length<.055 and (dot>.05 if side=='outer' else dot<-.05)
    owners={side:set(ids) for side,ids in seeds.items()}
    for side,owned in owners.items():
        frontier=set(owned)
        for _ in range(2):
            added={neighbor for face in frontier for neighbor in adjacency[face] if neighbor not in owned and in_margin(neighbor,side)}
            owned.update(added);frontier=added
    stats={}
    for side,owned in owners.items():
        unseen=set(owned);sizes=[]
        while unseen:
            todo=[unseen.pop()];count=0
            while todo:
                count+=1
                for neighbor in adjacency[todo.pop()]:
                    if neighbor in unseen:unseen.remove(neighbor);todo.append(neighbor)
            sizes.append(count)
        stats[side]={'seed_faces':len(seeds[side]),'owned_faces':len(owned),'component_sizes':sorted(sizes,reverse=True)}
    overlap=owners['inner']&owners['outer']
    result={'status':'pending_visual_face_ownership_review','runtime_publish_allowed':False,
        'source':str(SOURCE.relative_to(ROOT)).replace('\\','/'),'source_sha256':EXPECTED,
        'measurement_atlas_sha256':hashlib.sha256(atlas_path.read_bytes()).hexdigest(),
        'branch':'finger-band-03' if adjacent else 'finger-band-02','anatomical_name_confirmed':False,
        'method':('Dense oriented source ray pairs plus two bounded source-adjacency rings; explicit face list to review and freeze' if adjacent else 'Atlas-hit triangle IDs plus two bounded source-adjacency rings; explicit face list to review and freeze'),
        'selection_margin':{'angle_degrees':[65.5,99.5],'axis_world_z_m':list(z_margin),'maximum_radius_m':.055},
        'statistics':stats,'overlapping_faces':sorted(overlap),
        'faces':{side:sorted(ids) for side,ids in owners.items()},
        'pending':['Visual confirmation that each face belongs to this finger surface','Named authoring boundaries','Source-owned interior probes and distance checks','Low-density control cage']}
    if adjacent:
        other=json.loads((ROOT/'art-factory/rts/runs/guard-right-hand-cage/2026-10-08-v2/raw/source-face-ownership.json').read_text(encoding='utf-8'))
        result['previous_branch_face_overlap']={f'{side}-{other_side}':sorted(owned&set(other['faces'][other_side])) for side,owned in owners.items() for other_side in owners}
    (RUN/'raw/source-face-ownership.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
    def material(name,color):
        mat=bpy.data.materials.new(name);mat.use_nodes=True
        node=mat.node_tree.nodes['Principled BSDF'];node.inputs['Base Color'].default_value=(*color,1);node.inputs['Roughness'].default_value=.7
        return mat
    for obj in bpy.data.objects:obj.hide_render=obj!=source
    source.data.materials.clear();source.data.materials.append(material('Source ownership inspection',(.17,.19,.22)))
    overlays=[]
    for side,color in (('outer',(.025,.45,.38)),('inner',(.8,.3,.035))):
        mesh=bpy.data.meshes.new(side+' original source faces');mesh.from_pydata(vertices,[],[triangles[i].tolist() for i in sorted(owners[side])]);mesh.update()
        obj=bpy.data.objects.new(side+' original source ownership',mesh);bpy.context.collection.objects.link(obj)
        obj.data.materials.append(material(side+' ownership',color));offset=obj.modifiers.new('Inspection offset only','DISPLACE');offset.strength=.00004;offset.mid_level=0
        overlays.append(obj)
    scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=1000;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.world=bpy.data.worlds.new('Ownership review world');scene.world.color=(.035,.035,.035)
    scene.view_settings.look='AgX - Medium High Contrast'
    for loc,power,size in [((.7,.8,.8),14,.6),((-.7,.4,.5),9,.6),((0,-.7,.7),12,.5)]:
        data=bpy.data.lights.new('Review softbox','AREA');data.energy=power;data.size=size
        obj=bpy.data.objects.new('Review softbox',data);bpy.context.collection.objects.link(obj);obj.location=loc
        obj.rotation_euler=(Vector((0,0,.17))-obj.location).to_track_quat('-Z','Y').to_euler()
    focus_z=.18 if adjacent else .145
    views={'source-front':((0,1,.22),(0,0,.17),.36,True),
        'source-finger-detail':((.2,.9,.23),(.076,.049,focus_z),.065,True),
        'owned-faces-only':((.22,.9,.29),(.076,.049,focus_z),.065,False),
        'inner-owned-source-detail':((.07,.012,focus_z),(.07,.05,focus_z),.065,True),
        'channel-owned-faces':(origin+axis*.65,origin,.19,True)}
    renders={}
    for name,(loc,target,scale,show_source) in views.items():
        source.hide_render=not show_source
        data=bpy.data.cameras.new(name);data.type='ORTHO';data.ortho_scale=scale;data.clip_start=.001
        camera=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(camera);camera.location=loc
        camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler();scene.camera=camera
        path=RUN/'qa/renders'/f'{name}.png';scene.render.filepath=str(path);bpy.ops.render.render(write_still=True)
        renders[name]={'path':str(path.relative_to(ROOT)).replace('\\','/'),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
    (RUN/'qa/source-face-ownership-renders.json').write_text(json.dumps({'status':'pending_review','runtime_publish_allowed':False,'selection_sha256':hashlib.sha256((RUN/'raw/source-face-ownership.json').read_bytes()).hexdigest(),'renders':renders},indent=2)+'\n',encoding='utf-8')
    print('SOURCE_OWNERSHIP',json.dumps({'statistics':stats,'overlapping_faces':len(overlap),'status':result['status']}),flush=True)


if __name__=='__main__':main()
