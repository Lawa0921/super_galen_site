"""Measure directional source charts before authoring an editable grip cage.

This writes measurement data only. It does not generate or publish a hand.
"""
import bpy,hashlib,json,math,sys
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT=Path(__file__).resolve().parents[3]
SOURCE=ROOT/'art-factory/rts/runs/original-guard-grip-channel/2026-10-05/candidate/original-guard-grip-channel.blend'
EXPECTED='314e914e04a8a6a095338afe1c6d558a7976639796ebc6c81a7dad71001f9628'
RUN=ROOT/'art-factory/rts/runs/guard-right-hand-cage/2026-10-08-v1'


def ray_layers(bvh,point,direction,limit):
    hits=[];travel=0
    for _ in range(64):
        hit=bvh.ray_cast(point+direction*travel,direction,limit-travel)
        if hit[0] is None:break
        distance=(hit[0]-point).dot(direction)
        hits.append({'radius':distance,'face':hit[2],'normal_dot':hit[1].dot(direction)})
        travel=distance+1e-7
        if travel>=limit:break
    else:raise ValueError('Source ray exceeds the explicit intersection limit')
    return hits


def main():
    assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()==EXPECTED
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    source=bpy.data.objects['OriginalGripChannelCandidate'];source.data.calc_loop_triangles()
    vertices=[source.matrix_world@v.co for v in source.data.vertices]
    bvh=BVHTree.FromPolygons(vertices,[tuple(t.vertices) for t in source.data.loop_triangles],all_triangles=True)
    fitted=json.loads((SOURCE.parents[1]/'qa/input.json').read_text(encoding='utf-8'))['fit']
    origin,axis=Vector(fitted['origin']),Vector(fitted['direction']).normalized()
    across=(Vector((1,0,0))-axis*axis.x).normalized();around=axis.cross(across).normalized()
    axial=[(v-origin).dot(axis) for v in vertices];minimum,maximum=min(axial),max(axial)
    radius=max(((v-origin)-axis*(v-origin).dot(axis)).length for v in vertices)+.02
    control='--control-net' in sys.argv
    charts=[];samples=49 if control else 321;angles=32 if control else 48
    for index in range(angles):
        angle=2*math.pi*index/angles;direction=across*math.cos(angle)+around*math.sin(angle)
        rows=[];runs=[];start=None
        for row in range(samples):
            t=minimum+(maximum-minimum)*row/(samples-1)
            point=origin+axis*t
            inner=bvh.ray_cast(point,direction,radius)
            outer=bvh.ray_cast(point+direction*radius,-direction,radius)
            if inner[0] is not None and outer[0] is not None:
                inner_radius=(inner[0]-point).dot(direction);outer_radius=(outer[0]-point).dot(direction)
                data={'t':t,'inner':inner_radius,'outer':outer_radius,'inner_face':inner[2],'outer_face':outer[2]}
                if control:
                    hits=ray_layers(bvh,point,direction,radius)
                    data.update({'radial_intervals':len(hits)//2 if len(hits)%2==0 else -1,'ray_hits':hits})
                rows.append(data)
                if start is None:start=row
            else:
                rows.append(None)
                if start is not None:runs.append([start,row-1]);start=None
        if start is not None:runs.append([start,samples-1])
        charts.append({'index':index,'angle_rad':angle,'intervals':runs,'rows':rows})
    result={'status':'source_measurement_only','runtime_publish_allowed':False,'source_sha256':EXPECTED,
        'coordinate_system':'source world metres, original grip-axis frame','origin':list(origin),'axis':list(axis),
        'across':list(across),'around':list(around),'axial_bounds':[minimum,maximum],
        'radial_bound':radius,'rows_per_angle':samples,'charts':charts,
        'method':'Paired axis-outward and exterior-inward source ray intersections; never nearest-point projection',
        'limitations':['No authored cage, wrist opening, UV, material or whole-character acceptance',
                      'Multiple intervals reveal where a single radial patch is insufficient; do not bridge empty source gaps automatically']}
    out=RUN/('raw/control-chart.json' if control else 'raw/surface-chart.json');out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
    summary={'source_sha256':EXPECTED,'angles':len(charts),'interval_counts':[len(c['intervals']) for c in charts],
        'missing_angles':[c['index'] for c in charts if not c['intervals']],
        'chart':str(out.relative_to(ROOT)),
        'multiple_radial_layers':sum(row.get('radial_intervals',1)>1 for c in charts for row in c['rows'] if row),
        'unpaired_radial_hits':sum(row.get('radial_intervals',1)<0 for c in charts for row in c['rows'] if row)}
    print('SOURCE_CHART',json.dumps(summary))


if __name__=='__main__':main()
