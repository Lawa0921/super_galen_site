"""Broad mature-oak revision reusing the original generated leaf and bark art."""
import hashlib
import json
import math
import random
import shutil
import sys
from pathlib import Path

from mathutils import Vector

sys.dont_write_bytecode=True
sys.path.insert(0,str(Path(__file__).resolve().parent))
import props_generate as p

ROOT=Path(__file__).resolve().parents[1]
ORIGINAL=ROOT/'runs'/'kingdom-props'/'2026-10-04-original'
RUN=ROOT/'runs'/'kingdom-props'/'2026-10-04-oak-v2'
MATERIAL_FILES=('oak-bark-basecolor.jpg','oak-bark-normal.png','oak-leaf-atlas.png')
SEED=20261004


def angled_leaf(center,size,azimuth,tilt,variant,name):
    """One twig-scale atlas card; varied plane normal avoids a flat cross-card crown."""
    c=Vector(center)
    u=Vector((math.cos(azimuth),math.sin(azimuth),0))*size[0]/2
    v=Vector((-math.sin(azimuth)*math.sin(tilt),
              math.cos(azimuth)*math.sin(tilt),math.cos(tilt)))*size[1]/2
    ob=p.g.mesh(name,[c-u-v,c+u-v,c+u+v,c-u+v],[(0,1,2,3)],'LeafCutout')
    uv=ob.data.uv_layers.new(name='Architectural UV')
    col=variant%3;row=variant//3
    u0=col/3+0.008;u1=(col+1)/3-0.008
    v0=1-(row+1)/2+0.008;v1=1-row/2-0.008
    coords=[(u0,v0),(u1,v0),(u1,v1),(u0,v1)]
    for poly in ob.data.polygons:
        for li in poly.loop_indices:
            uv.data[li].uv=coords[ob.data.loops[li].vertex_index]


def oak_v2():
    rng=random.Random(SEED)
    p.tube('Broad buttressed mature oak trunk',
           [(0,0,0),(.07,-.03,1.32),(-.09,.10,2.64),(.10,.08,3.88),(.20,.12,5.12),(.28,.17,6.12)],
           [.75,.64,.51,.39,.25,.13],'Bark',16)
    # Eight scaffold limbs make independent lobes, not a spherical envelope.
    targets=[(-3.04,-1.26,7.52),(2.83,-1.37,8.08),(-3.15,.92,8.64),
             (2.75,1.14,8.45),(-1.58,2.44,9.11),(1.56,2.55,9.30),
             (-.49,-1.96,9.38),(.66,.22,10.05)]
    sources=[(-.06,0,3.73),(.09,-.02,3.87),(.13,.13,4.10),(.21,.12,4.31),
             (.20,.14,4.67),(.23,.17,4.90),(.23,.10,5.25),(.28,.17,5.78)]
    sprays=[]
    for limb,(base,end) in enumerate(zip(sources,targets)):
        a=Vector(base);c=Vector(end)
        radial=Vector((c.x-a.x,c.y-a.y,0)).normalized()
        transverse=Vector((-radial.y,radial.x,0))
        b=a.lerp(c,0.52)+Vector((0,0,.40 if limb%2 else -.15))
        d=a.lerp(c,.80)+transverse*(.11 if limb%2 else -.08)
        p.tube(f'Principal load-bearing oak branch {limb:02}',[a,b,d,c],
               [.28-.012*limb,.19-.008*limb,.105,.052],'Bark',10)
        sprays.append(c)
        for fork in range(3):
            t=.44+.17*fork
            start=b.lerp(d,max(0,min(1,(t-.52)/.28))) if t>=.52 else a.lerp(b,t/.52)
            sign=1 if (limb+fork)%2 else -1
            length=(.87,.98,.74)[fork]
            reach=radial*(.43+.16*fork)+transverse*sign*length
            lift=.28+.20*((limb+fork)%3)
            end2=start+reach+Vector((0,0,lift))
            mid2=start.lerp(end2,.57)+Vector((0,0,.11))
            p.tube(f'Secondary lateral oak branch {limb:02}-{fork}',[start,mid2,end2],
                   [.112,.071,.031],'Bark',8)
            sprays.extend([end2,mid2.lerp(end2,.48)])
            # A third branch tier physically supports outward leaf sprays.
            fork_vec=transverse*(-sign)*(.37+.09*(fork%2))+radial*.31+Vector((0,0,.17))
            tip3=end2+fork_vec
            p.tube(f'Tertiary fruiting twig {limb:02}-{fork}',
                   [mid2.lerp(end2,.62),end2,tip3],[.047,.034,.016],'Bark',6)
            sprays.append(tip3)
        sprays.append(b+transverse*(.25 if limb%2 else -.22)+Vector((0,0,.22)))
    # 8 primary + 24*3 lateral/tertiary positions + 8 inner = 88 sprays.
    # Seven varied cards per spray: 616 cards, 4.25x the v1 145-card crown.
    for i,center in enumerate(sprays):
        for j in range(7):
            az=(i*.67+j*1.79+rng.uniform(-.28,.28))%math.tau
            radial=.13+.25*(j%3)/2
            displacement=Vector((math.cos(az)*radial,math.sin(az)*radial,
                                 (-.34,-.13,.10,.31)[(i+j)%4]))
            tilt=(.13,.39,.72,1.04)[(i*2+j)%4]
            size=(.89+.24*((i+j)%4)/3, .78+.23*((i+2*j)%5)/4)
            angled_leaf(center+displacement,size,az,tilt,(i*3+j)%5,
                        f'Layered oak leaf spray {i:03}-{j}')
    # Keep the broad asymmetric crown inside an 8 m resource footprint.
    for ob in p.bpy.context.scene.objects:
        if ob.type=='MESH':
            for vertex in ob.data.vertices:vertex.co.x*=.88


def main():
    target=RUN/'candidate'/'textures';target.mkdir(parents=True,exist_ok=True)
    sources=[]
    for name in MATERIAL_FILES:
        src=ORIGINAL/'candidate'/'textures'/name
        dst=target/name
        shutil.copy2(src,dst)
        sources.append({'reused_from':str(src.relative_to(ROOT)),
                        'v2_copy':str(dst.relative_to(ROOT)),
                        'sha256':hashlib.sha256(src.read_bytes()).hexdigest()})
    raw=ORIGINAL/'raw'/'textures'/'oak-leaves-source.png'
    sources.append({'original_generated_leaf_source':str(raw.relative_to(ROOT)),
                    'sha256':hashlib.sha256(raw.read_bytes()).hexdigest()})
    (RUN/'raw').mkdir(parents=True,exist_ok=True)
    (RUN/'raw'/'reused-texture-provenance.json').write_bytes(
        json.dumps(sources,indent=2).encode('utf-8'))
    p.RUN=RUN;p.g.RUN=RUN
    p.g.ASSETS['oak']=(8,8)
    p.TEXTURES.clear();p.TEXTURES['Bark']='oak-bark'
    p.BUILD['oak']=oak_v2
    report=p.generate('oak')
    report['revision']='oak-v2'
    report['leaf_card_count']=88*7
    (RUN/'qa'/'mechanical.json').write_bytes(json.dumps([report],indent=2).encode('utf-8'))
    print(json.dumps(report,indent=2),flush=True)


if __name__=='__main__':main()
