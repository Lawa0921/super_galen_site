"""Original highland pine: textured woody structure and generated needle sprays."""
import bpy,hashlib,json,math,random,shutil,sys
from pathlib import Path
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).parent))
import props_generate as p
ROOT=Path(__file__).resolve().parents[1];RUN=ROOT/'runs/highland-pine/2026-10-06-v1'

def wood(name,points,radii,sides=6):
    pts=[Vector(v) for v in points];vertices=[];faces=[];distance=[0.]
    for a,b in zip(pts,pts[1:]):distance.append(distance[-1]+(b-a).length)
    for i,c in enumerate(pts):
        tangent=(pts[min(i+1,len(pts)-1)]-pts[max(0,i-1)]).normalized()
        helper=Vector((0,0,1)) if abs(tangent.z)<.8 else Vector((0,1,0))
        u=tangent.cross(helper).normalized();v=tangent.cross(u).normalized()
        for j in range(sides):
            angle=math.tau*j/sides;r=radii[i]*(1+.055*math.sin(j*3.7+i*.6))
            pos=c+r*(math.cos(angle)*u+math.sin(angle)*v)
            if i==0 and c.z==0:pos.z=0
            vertices.append(pos)
    for i in range(len(pts)-1):
        for j in range(sides):faces.append((i*sides+j,i*sides+(j+1)%sides,(i+1)*sides+(j+1)%sides,(i+1)*sides+j))
    faces.extend([tuple(reversed(range(sides))),tuple(range((len(pts)-1)*sides,len(pts)*sides))])
    obj=p.g.mesh(name,vertices,faces,'PineBark');uv=obj.data.uv_layers.new(name='Architectural UV')
    for poly in obj.data.polygons:
        poly.use_smooth=len(poly.vertices)==4
        seam=any(i%sides==0 for i in poly.vertices) and any(i%sides==sides-1 for i in poly.vertices)
        for loop in poly.loop_indices:
            vi=obj.data.loops[loop].vertex_index;side=vi%sides
            uv.data[loop].uv=(1 if seam and side==0 else side/sides,distance[vi//sides]/1.4)
    return obj

def spray(start,end,width,roll,variant,name):
    a,b=Vector(start),Vector(end);v=b-a;t=v.normalized()
    axis=t.cross(Vector((0,0,1)))
    if axis.length<.1:axis=Vector((1,0,0))
    axis.normalize();normal=axis.cross(t).normalized();u=(axis*math.cos(roll)+normal*math.sin(roll))*width/2
    # Two gently bent segments give each bough depth without a whole-tree billboard.
    center=a.lerp(b,.52)+normal*width*.07
    verts=[a-u*.34,a+u*.34,center-u,center+u,b-u*.25,b+u*.25]
    obj=p.g.mesh(name,verts,[(0,1,3,2),(2,3,5,4)],'PineNeedles')
    uv=obj.data.uv_layers.new(name='Architectural UV');col=variant%2;row=variant//2
    coords=[(0,0),(1,0),(0,.52),(1,.52),(0,1),(1,1)]
    for poly in obj.data.polygons:
        for loop in poly.loop_indices:
            x,y=coords[obj.data.loops[loop].vertex_index];uv.data[loop].uv=((col+x)*.5,(1-row+y)*.5)
    return obj

def setup():
    bpy.ops.wm.read_factory_settings(use_empty=True);p.M.clear();p.g.M.clear();p.RUN=RUN;p.g.RUN=RUN
    bpy.context.preferences.filepaths.save_version=0
    p.material('PineBark',(.29,.20,.13),.94);p.material('PineNeedles',(.16,.25,.11),.93)
    textures=RUN/'candidate/textures';sources=[]
    for name in ['oak-bark-basecolor.jpg','oak-bark-normal.png']:
        source=ROOT/'runs/kingdom-props/2026-10-04-original/candidate/textures'/name;shutil.copy2(source,textures/name)
        sources.append({'source':str(source.relative_to(ROOT)),'sha256':hashlib.sha256(source.read_bytes()).hexdigest()})
    p.map_texture('PineBark','oak-bark')
    mat=p.M['PineNeedles'];nodes=mat.node_tree.nodes;links=mat.node_tree.links;bsdf=nodes.get('Principled BSDF')
    image=bpy.data.images.load(str(textures/'pine-needle-atlas.png'));image.pack();tex=nodes.new('ShaderNodeTexImage');tex.image=image
    uv=nodes.new('ShaderNodeUVMap');uv.uv_map='Architectural UV';links.new(uv.outputs['UV'],tex.inputs['Vector'])
    links.new(tex.outputs['Color'],bsdf.inputs['Base Color']);clip=nodes.new('ShaderNodeMath');clip.operation='GREATER_THAN';clip.inputs[1].default_value=.48
    links.new(tex.outputs['Alpha'],clip.inputs[0]);links.new(clip.outputs[0],bsdf.inputs['Alpha']);mat.surface_render_method='DITHERED';mat.use_backface_culling=False
    return sources

def build():
    rng=random.Random(20261006);trunk=[]
    for i in range(14):
        z=i*9.6/13;trunk.append((.075*math.sin(z*.6),.055*math.sin(z*.85),z))
    wood('Pine continuous tapered leader',trunk,[.42*(1-i/14)**1.25+.015 for i in range(14)],12)
    for i in range(6):
        angle=i*math.tau/6+.15;radial=Vector((math.cos(angle),math.sin(angle),0))
        wood(f'Root flare {i}',[radial*.08,radial*.50+Vector((0,0,.10)),radial*.88+Vector((0,0,.025))],[.18,.13,.025],7)
    cards=0;branches=0
    for layer in range(9):
        z=2.6+layer*.71;t=layer/8;length=2.23*(1-.86*t)**.82
        count=5 if layer<7 else 4
        for j in range(count):
            angle=j*math.tau/count+layer*2.399+rng.uniform(-.12,.12);radial=Vector((math.cos(angle),math.sin(angle),0));side=Vector((-radial.y,radial.x,0))
            start=Vector((.075*math.sin(z*.6),.055*math.sin(z*.85),z+rng.uniform(-.10,.10)))
            reach=length*rng.uniform(.89,1.10);middle=start+radial*reach*.48+Vector((0,0,-.17*(1-t)));tip=start+radial*reach+Vector((0,0,.10+.08*t))
            wood(f'Whorl {layer} branch {j}',[start,middle,tip],[.11*(1-.55*t),.056*(1-.5*t),.012],6);branches+=1
            for k in range(2):
                sign=1 if k==0 else -1;base=middle.lerp(tip,.18+.28*k)
                end=base+radial*reach*.28+side*sign*reach*.30+Vector((0,0,.12))
                wood(f'Whorl {layer} fork {j}-{k}',[base,base.lerp(end,.52),end],[.038,.024,.006],5)
                for turn in (-.58,.32):
                    spray(base-radial*.08,end+radial*reach*.25,reach*.58,turn,(layer+j+k)%4,f'Needles lateral {layer}-{j}-{k}-{turn}');cards+=1
            for k,roll in enumerate((-.65,0,.68)):
                a=middle.lerp(tip,.12)+Vector((0,0,(k-1)*.055));b=tip+radial*reach*.29+Vector((0,0,.09))
                spray(a,b,reach*.71,roll,(layer+j+k)%4,f'Needles terminal {layer}-{j}-{k}');cards+=1
            spray(start+radial*reach*.23,tip+Vector((0,0,.10)),reach*.73,.08,(layer+j)%4,f'Needles inner {layer}-{j}');cards+=1
            if layer>=4:
                spray(start+radial*reach*.13+Vector((0,0,.19)),middle+radial*reach*.16+Vector((0,0,.38)),reach*.66,(-.8 if j%2 else .75),(layer+j+1)%4,f'Short ascending inner shoot {layer}-{j}');cards+=1
    # Offset compact radial shoots break up the formerly long vertical card tip.
    for layer,z in enumerate((8.65,9.12)):
        for j in range(3):
            angle=j*math.tau/3+layer*.85;radial=Vector((math.cos(angle),math.sin(angle),0))
            a=Vector((.075*math.sin(z*.6),.055*math.sin(z*.85),z));b=a+radial*(.34-.14*layer)+Vector((0,0,.53))
            spray(a,b,.54-.18*layer,j*.47,(j+layer)%4,f'Leader radial needle tuft {layer}-{j}');cards+=1
    for obj in bpy.context.scene.objects:
        if obj.type=='MESH':
            for vertex in obj.data.vertices:vertex.co.z=max(0,vertex.co.z)
    return {'branch_whorls':9,'primary_branches':branches,'curved_bough_cards':cards}

def render_views(objects):
    scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE';scene.eevee.taa_render_samples=64;scene.render.resolution_x=900;scene.render.resolution_y=1000;scene.render.resolution_percentage=100;scene.render.film_transparent=True
    world=bpy.data.worlds.new('Pine neutral review');scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.20,.24,.20,1);world.node_tree.nodes['Background'].inputs[1].default_value=.7
    for loc,energy,size in [((4,-8,14),2200,7),((-6,5,10),1600,6)]:
        bpy.ops.object.light_add(type='AREA',location=loc);light=bpy.context.object;light.data.energy=energy;light.data.size=size;light.rotation_euler=(Vector((0,0,5))-light.location).to_track_quat('-Z','Y').to_euler()
    bpy.ops.object.camera_add();camera=bpy.context.object;scene.camera=camera;camera.data.type='ORTHO';camera.data.ortho_scale=12
    for name,position in [('front',(0,-18,10)),('side',(18,0,10)),('back',(0,18,10)),('rts',(10,-14,19))]:
        camera.location=position;camera.rotation_euler=(Vector((0,0,4.8))-camera.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(RUN/f'qa/pine-{name}.png');bpy.ops.render.render(write_still=True)

def main():
    sources=setup();authored=build();objects=[o for o in bpy.context.scene.objects if o.type=='MESH'];bpy.context.view_layer.update()
    points=[o.matrix_world@v.co for o in objects for v in o.data.vertices];lo=[min(v[i] for v in points) for i in range(3)];hi=[max(v[i] for v in points) for i in range(3)]
    triangles=sum(len(p.vertices)-2 for o in objects for p in o.data.polygons)
    assert triangles<=6000 and hi[0]-lo[0]<=6.4 and hi[1]-lo[1]<=6.4 and lo[2]==0,(triangles,lo,hi)
    render_views(objects);source=RUN/'raw/pine.blend';bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(source))
    joined=p.join_by_material(objects);bpy.ops.object.select_all(action='DESELECT')
    for o in joined:o.select_set(True)
    bpy.context.view_layer.objects.active=joined[0];output=RUN/'candidate/pine.glb'
    bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_normals=True,export_tangents=True,export_texcoords=True,export_materials='EXPORT',export_extras=True)
    report={'status':'candidate','runtime_publish_allowed':False,'original_bark_sources':sources,**authored,'triangles':triangles,'mesh_parts':len(objects),'exported_meshes':len(joined),'bounds_min_blender':lo,'bounds_max_blender':hi,'glb_bytes':output.stat().st_size,'blend_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'glb_sha256':hashlib.sha256(output.read_bytes()).hexdigest()}
    (RUN/'qa/model.json').write_text(json.dumps(report,indent=2)+'\n');print('PINE_BUILT',json.dumps(report))
if __name__=='__main__':main()
