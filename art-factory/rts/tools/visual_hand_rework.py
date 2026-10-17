"""Rework the current guard's gloves in an isolated candidate assembly.

The palm, short articulated digits, thenar pad and cuff are fused into one
surface. Existing body, weapon geometry, animation channels and bind matrices
are retained. This produces a visual candidate, never a runtime publication.
"""
import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).parent))
import procedural_gauntlet_build as g

ROOT = Path(__file__).resolve().parents[3]
DEFAULT_RUN = ROOT / "art-factory/rts/runs/visual-revision/2026-10-15-v1"
SOURCE = ROOT / "art-factory/rts/runs/all-models/2026-10-14-v1/raw/guard-assembly.blend"
RECORDS = ROOT / "art-factory/rts/runs/all-models/2026-10-14-v1/qa/guard-build.json"


def mesh_fingerprint(obj):
    data = [[list(v.co) for v in obj.data.vertices], [list(p.vertices) for p in obj.data.polygons]]
    return hashlib.sha256(json.dumps(data).encode()).hexdigest()


def catmull(points, samples=8):
    points = [Vector(p) for p in points]
    result = []
    for i in range(len(points) - 1):
        a, b = points[max(0, i - 1)], points[i]
        c, d = points[i + 1], points[min(len(points) - 1, i + 2)]
        for j in range(samples):
            t = j / samples
            result.append((2*b + (-a+c)*t + (2*a-5*b+4*c-d)*t*t + (-a+3*b-3*c+d)*t*t*t) * .5)
    result.append(points[-1])
    return result


def digit(name, points, width, thickness, tip_scale=.78):
    centers = catmull(points)
    part = g.Part(name, "AssemblyDetail_leather")
    rings = []
    for i, center in enumerate(centers):
        t = i / (len(centers)-1)
        tangent = (centers[min(i+1,len(centers)-1)] - centers[max(0,i-1)]).normalized()
        across = Vector((0,0,1))
        across = (across - tangent*across.dot(tangent)).normalized()
        normal = across.cross(tangent).normalized()
        taper = 1 - (1-tip_scale)*g.smooth((t-.72)/.28)
        # Broad proximal phalanx, narrower middle and rounded distal pad.
        # Flat dorsal faces survive the low-poly export; tips are not cones.
        pad = 1 + .16*math.exp(-((t-.26)/.075)**2) - .13*g.smooth((t-.34)/.20)
        rings.append(part.ring(center, normal, across, thickness*.5*taper*pad,
                               width*.5*taper, 12, p=3.7, weights={"Hand":1}))
    part.loft(rings, centers, repeat=.12)
    return part


def glove_parts(radius, wrist, wrist_radius):
    cfg = dict(g.GAUNTLET_DEFAULTS, finger_width=.018, finger_thickness=.016, gap=.001)
    parts = [p for p in g.fist_parts(radius, wrist, wrist_radius*.68, cfg, 0,
                                    "AssemblyDetail_leather", "AssemblyDetail_leather") if p.name == "back"]
    fw, ft = cfg["finger_width"], cfg["finger_thickness"]
    zshift = max(-.5*fw, min(.5*fw, wrist.z*.3))
    for finger, (offset, scale, curl) in enumerate(((1.5,.95,.95),(.5,1.0,1.0),(-.5,.92,.85),(-1.5,.79,.60))):
        z = zshift + offset*fw*.96
        rr = radius + cfg['gap'] + ft*.52*scale
        # Explicit metacarpal/PIP/DIP landmarks, rather than points sampled
        # on a common circle. The staggered distal pads finish on the palm.
        points = [(rr,-.014+(1-scale)*.025,z),
                  (rr+.003, radius*.70+(1-scale)*.010,z),
                  (-radius*.42, rr+.002,z-.0015*finger),
                  (-rr+.002,radius*(.36-.48*curl),z-.002*finger)]
        part = digit(f"anatomical_digit_{finger}", points, fw*1.02*scale, ft*scale, .86)
        # Keep finger pads outside the measured held handle through interpolation.
        for v in part.verts:
            distance = math.hypot(v.x,v.y)
            if distance < radius+.0008:
                v.x *= (radius+.0008)/max(distance,1e-8)
                v.y *= (radius+.0008)/max(distance,1e-8)
        parts.append(part)
    rr = radius + ft*.55
    thumb = [
        (rr*.90,-.039,zshift+fw*.8),
        (rr*.92,-.026,zshift+fw*1.75),
        (-rr*.46,-rr*.87,zshift+fw*1.52),
        (-rr*.82,rr*.12,zshift+fw*.90),
    ]
    parts.append(digit("opposable_thumb",thumb,fw*.90,ft*1.06,.82))
    return parts, cfg


def dorsal_plates(radius, wrist, wrist_radius, cfg):
    """Two overlapping, curved steel metacarpal plates over the leather palm."""
    knuckle = Vector((radius+cfg['gap']+cfg['finger_thickness']*.45,-.004,
                      max(-.5*cfg['finger_width'],min(.5*cfg['finger_width'],wrist.z*.3))))
    span = wrist-knuckle
    direction = span.normalized()
    across = (Vector((0,0,1))-direction*direction.z).normalized()
    outward = direction.cross(across).normalized()
    if outward.x < 0: outward = -outward
    result=[]
    for start,end in ((.04,.42),(.38,.72)):
        part=g.Part('curved_metacarpal_plate','AssemblyDetail_steel')
        for layer in (0,1):
            for i in range(5):
                t=start+(end-start)*i/4
                center=knuckle.lerp(wrist,t)+Vector((1,0,0))*.006*math.sin(math.pi*t)
                half_w=(2*cfg['finger_width']*1.02)*(1-t)+wrist_radius*.68*1.02*t
                half_t=cfg['finger_thickness']*.62*(1-t)+wrist_radius*.68*.8*t
                for j in range(9):
                    u=(j/8*2-1)*.94
                    p=center+across*(u*half_w)+outward*(half_t*(1-abs(u)**3.2)**(1/3.2)+.003-layer*.002)
                    part.verts.append(p);part.weights.append({'Hand':1})
        for i in range(4):
            for j in range(8):
                a=i*9+j;b=a+1;c=b+9;d=a+9
                part.faces.extend([(a,b,c,d),(a+45,d+45,c+45,b+45)])
        border=list(range(9))+[i*9+8 for i in range(1,5)]+list(range(43,35,-1))+[i*9 for i in range(3,0,-1)]
        for a,b in zip(border,border[1:]+border[:1]):part.faces.append((a,a+45,b+45,b))
        part.uvs=[[(part.verts[i].z/.12,part.verts[i].y/.12) for i in f] for f in part.faces]
        result.append(part)
    return result


def continuous_glove(name, rig, row, materials, ref):
    side, lod = row["side"], row["lod"]
    center, axis, wrist = (Vector(row[k]) for k in ("grip","axis","wrist"))
    radius, wr = row["radius"], row["wrist_radius"]
    cfg = dict(g.GAUNTLET_DEFAULTS, finger_width=.018, finger_thickness=.016, gap=.001)
    frame, local, _ = g.hand_frame(center,axis,wrist,radius,cfg,side,Vector((1 if side=="R" else -1,.15,0)))
    parts, _ = glove_parts(radius,local,wr)
    parts = [part.transformed(frame,mirror_x=side=="L") for part in parts]
    fore = rig.pose.bones["Forearm_"+side]
    direction = (fore.tail-fore.head).normalized()
    cuff = g.Part("tapered_cuff","AssemblyDetail_leather")
    u, v = direction.orthogonal().normalized(), direction.cross(direction.orthogonal().normalized()).normalized()
    rings, centers = [], []
    for distance, scale in ((-.046,1.02),(-.030,.98),(-.013,.79),(.004,.69),(.018,.66)):
        p = wrist+direction*distance
        centers.append(p)
        rings.append(cuff.ring(p,u,v,wr*scale,wr*scale*.92,16,weights={"Hand":1}))
    cuff.loft(rings,centers,repeat=.12)
    parts.append(cuff)
    obj = g.parts_to_object(name,parts,rig,materials)
    obj.modifiers.clear()
    obj.vertex_groups.clear()
    bpy.ops.object.select_all(action="DESELECT")
    obj.hide_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    modifier = obj.modifiers.new("Continuous palm and digits","REMESH")
    modifier.mode = "VOXEL"
    modifier.voxel_size = .00145
    modifier.use_smooth_shade = True
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    modifier = obj.modifiers.new("Soften anatomical transitions","SMOOTH")
    modifier.factor, modifier.iterations = .35, 1
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    current = sum(len(p.vertices)-2 for p in obj.data.polygons)
    modifier = obj.modifiers.new("Game hand topology","DECIMATE")
    modifier.ratio = min(1,(2200 if lod==0 else 1150)/max(1,current))
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    bm=bmesh.new();bm.from_mesh(obj.data)
    remaining=set(bm.verts)
    while remaining:
        first=remaining.pop();component={first};stack=[first]
        while stack:
            vertex=stack.pop()
            neighbours={edge.other_vert(vertex) for edge in vertex.link_edges}&remaining
            remaining.difference_update(neighbours);component.update(neighbours);stack.extend(neighbours)
        if len(component)<8:
            bmesh.ops.delete(bm,geom=list(component),context="VERTS")
    bm.to_mesh(obj.data);bm.free()
    obj.data.materials.clear()
    obj.data.materials.append(materials["AssemblyDetail_leather"])
    groups = {bone:obj.vertex_groups.new(name=bone+"_"+side) for bone in ("Hand","Forearm")}
    for vertex in obj.data.vertices:
        distance = (vertex.co-wrist).dot(direction)
        fore_weight = .90*(1-g.smooth((distance+.045)/.070))
        weights = {"Hand_"+side:1-fore_weight,"Forearm_"+side:fore_weight}
        part = g.Part("vertex", "AssemblyDetail_leather")
        part.verts, part.weights = [vertex.co.copy()], [weights]
        g.to_bind(part,ref)
        vertex.co = part.verts[0]
        groups["Hand"].add([vertex.index],1-fore_weight,"REPLACE")
        if fore_weight>0:groups["Forearm"].add([vertex.index],fore_weight,"REPLACE")
    uv = obj.data.uv_layers.new(name="UVMap")
    for poly in obj.data.polygons:
        poly.material_index=0
        poly.use_smooth=True
        drop = max(range(3),key=lambda i:abs(poly.normal[i]))
        coords = [i for i in range(3) if i!=drop]
        for i in poly.loop_indices:
            p = obj.data.vertices[obj.data.loops[i].vertex_index].co
            uv.data[i].uv = (p[coords[0]]/.12,p[coords[1]]/.12)
    modifier = obj.modifiers.new("Skin","ARMATURE")
    modifier.object=rig
    plates=[p.transformed(frame,mirror_x=side=='L') for p in dorsal_plates(radius,local,wr,cfg)]
    for part in plates:
        part.weights=[{'Hand_'+side:1} for _ in part.verts]
        g.to_bind(part,ref)
    armor=g.parts_to_object(name+'_Armor',plates,rig,materials)
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True);armor.select_set(True);bpy.context.view_layer.objects.active=obj
    bpy.ops.object.join()
    obj["visual_rework_source"]=str(SOURCE.relative_to(ROOT))
    obj["visual_rework_method"]="Continuous palm, opposing thumb and short phalanges; existing grip/rig/animation preserved"
    return obj


def render(run,rig,objects,rows):
    scene=bpy.context.scene
    scene.render.engine="BLENDER_EEVEE"
    scene.render.resolution_x=scene.render.resolution_y=760
    scene.render.resolution_percentage=100
    scene.render.film_transparent=False
    scene.world=scene.world or bpy.data.worlds.new("Review world")
    scene.world.use_nodes=True
    scene.world.node_tree.nodes["Background"].inputs[0].default_value=(.11,.14,.16,1)
    scene.world.node_tree.nodes["Background"].inputs[1].default_value=.65
    for o in list(bpy.data.objects):
        if o.type in ("CAMERA","LIGHT"):bpy.data.objects.remove(o,do_unlink=True)
        elif o.type=="MESH":o.hide_render=o not in objects
    for name,position,energy,size in (("Key",(3,-4,5),450,4),("Fill",(-3,-1,3),240,3),("Rim",(1,3,4),350,3)):
        light=bpy.data.objects.new(name,bpy.data.lights.new(name,"AREA"))
        light.location=position;light.data.energy=energy;light.data.shape="DISK";light.data.size=size
        light.rotation_euler=(Vector((0,0,1))-light.location).to_track_quat("-Z","Y").to_euler()
        scene.collection.objects.link(light)
    camera=bpy.data.objects.new("Review camera",bpy.data.cameras.new("Review camera"))
    scene.collection.objects.link(camera);scene.camera=camera;camera.data.type="ORTHO"
    g.set_action(rig,"Idle");scene.frame_set(0)
    ref=g.skin_matrices(rig)
    anchors={r["side"]:ref["Hand_"+r["side"]].inverted()@Vector(r["grip"]) for r in rows if r["lod"]==0}
    death_end=int(bpy.data.actions['Death'].frame_range[1])
    for clip,frame in (("Idle",0),("Attack",4),("Attack",14),("Death",22),("Death",death_end//2),("Death",death_end)):
        label=clip if (clip=='Idle' or (clip=='Attack' and frame==14)) else f'{clip}-{frame}'
        g.set_action(rig,clip);scene.frame_set(frame);bpy.context.view_layer.update()
        for side in ("R","L","full"):
            target=Vector((0,0,1)) if side=="full" else g.skin_matrices(rig)["Hand_"+side]@anchors[side]
            camera.data.ortho_scale=2.2 if side=="full" else .31
            for view,direction in (("front",(.5,-1,.3)),("back",(-.45,1,.3)),("side",(1,0,.2))):
                if side=="full" and view!="front":continue
                camera.location=target+Vector(direction).normalized()*4
                camera.rotation_euler=(target-camera.location).to_track_quat("-Z","Y").to_euler()
                scene.render.filepath=str(run/"qa"/f"guard-{label}-{side}-{view}.png")
                bpy.ops.render.render(write_still=True)
        # A cutaway of the actual shield mesh exposes the hidden grasp. No
        # replacement handle or alternate pose is used for this evidence.
        shield=bpy.data.objects['KingdomSunShield_LOD0'];original=shield.data
        shield.data=original.copy()
        bm=bmesh.new();bm.from_mesh(shield.data)
        remove=[f for f in bm.faces if 'leather' not in shield.data.materials[f.material_index].name.lower()]
        bmesh.ops.delete(bm,geom=remove,context='FACES');bm.to_mesh(shield.data);bm.free()
        visibility={o:o.hide_render for o in bpy.data.objects if o.type=='MESH'}
        for o in visibility:o.hide_render=o.name not in ('KingdomSunShield_LOD0','GuardGauntlet_L_LOD0')
        target=g.skin_matrices(rig)['Hand_L']@anchors['L'];camera.data.ortho_scale=.31
        for view,direction in (('front',(.5,-1,.3)),('back',(-.45,1,.3)),('side',(1,0,.2))):
            camera.location=target+Vector(direction).normalized()*4
            camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
            scene.render.filepath=str(run/'qa'/f'guard-{label}-L-cutaway-{view}.png')
            bpy.ops.render.render(write_still=True)
        for o,hidden in visibility.items():o.hide_render=hidden
        temporary=shield.data;shield.data=original;bpy.data.meshes.remove(temporary)


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--run",type=Path,default=DEFAULT_RUN)
    parser.add_argument("--skip-render",action="store_true")
    args=parser.parse_args(sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else [])
    run=args.run.resolve()
    for name in ("raw","candidate","qa"):(run/name).mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    rig=next(o for o in bpy.data.objects if o.type=="ARMATURE")
    g.set_action(rig,"Idle");bpy.context.scene.frame_set(0)
    ref=g.skin_matrices(rig)
    unchanged={o.name:mesh_fingerprint(o) for o in bpy.data.objects if o.type=="MESH" and not o.name.startswith("GuardGauntlet_")}
    rows=json.loads(RECORDS.read_bytes())["hands"]
    materials={name:bpy.data.materials[name] for name in ('AssemblyDetail_leather','AssemblyDetail_steel')}
    for row in rows:
        old=bpy.data.objects[row["name"]]
        side=row["side"]
        fore=rig.pose.bones["Forearm_"+side]
        direction=(fore.tail-fore.head).normalized()
        # Derive anchors from the CURRENT source pose. The old build report's
        # reference coordinates predate its subsequent arm animation repair.
        proximal=[]
        for vertex in old.data.vertices:
            if any(old.vertex_groups[w.group].name=="Forearm_"+side and w.weight>.999 for w in vertex.groups):
                proximal.append(ref["Forearm_"+side]@vertex.co)
        if len(proximal)!=8:raise AssertionError((old.name,"unexpected cuff source ring",len(proximal)))
        wrist=sum(proximal,Vector())/len(proximal)+direction*.045
        weapon=bpy.data.objects[("KingdomSteelSword" if side=="R" else "KingdomSunShield")+f"_LOD{row['lod']}"]
        center,axis,radius,_,_=g.weapon_region(weapon,{"AssemblyDetail_leather","WornLeather"})
        center=ref["Hand_"+side]@center
        axis=(ref["Hand_"+side].to_3x3()@axis).normalized()
        row=dict(row,grip=list(center),axis=list(axis),wrist=list(wrist),radius=max(.012,min(.024,radius)))
        rows[rows.index(next(r for r in rows if r["name"]==row["name"]))]=row
        bpy.data.objects.remove(old,do_unlink=True)
        obj=continuous_glove(row["name"],rig,row,materials,ref)
        print(json.dumps({"rebuilt":obj.name,"triangles":g.tri_count(obj)}),flush=True)
    for name,sha in unchanged.items():
        if mesh_fingerprint(bpy.data.objects[name])!=sha:raise AssertionError("Unrelated mesh changed: "+name)
    bpy.ops.wm.save_as_mainfile(filepath=str(run/"raw/guard-visual-rework.blend"))
    for lod in (0,1):
        objects=[o for o in bpy.data.objects if o.type=="MESH" and o.name.endswith(f"_LOD{lod}")]
        g.export_lod(run/"candidate"/("guard.glb" if lod==0 else "guard-lod1.glb"),rig,objects)
    report={"status":"candidate_needs_visual_review","source":str(SOURCE.relative_to(ROOT)),
            "unchanged_body_and_weapon_meshes":unchanged,"hand_count":len(rows),"hands":rows,
            "runtime_publish_allowed":False,"artistic_quality_proven":False}
    (run/"qa/hand-build.json").write_bytes((json.dumps(report,indent=2)+"\n").encode())
    if not args.skip_render:
        render(run,rig,[o for o in bpy.data.objects if o.type=="MESH" and o.name.endswith("_LOD0")],rows)


if __name__=="__main__":main()
