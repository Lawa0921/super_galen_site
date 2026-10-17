"""Apply source-geodesic thumb ownership to the original unchanged hand mesh."""
import bpy,json,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3];RUN=ROOT/'art-factory/rts/runs/original-glove-power-grip/2026-10-07-v1'
source=ROOT/'art-factory/rts/runs/original-glove-joints/2026-10-07-v2/candidate/joint-rig.blend';h=json.loads((RUN/'raw/hand.json').read_text());assert hashlib.sha256(source.read_bytes()).hexdigest()==h['source_sha256']
bpy.ops.wm.open_mainfile(filepath=str(source));hand=bpy.data.objects['OriginalJointGlove_L_LOD0']
for group in hand.vertex_groups:group.remove(list(range(len(hand.data.vertices))))
for i,weights in enumerate(h['weights']):
    for name,w in weights.items():hand.vertex_groups[name].add([i],w,'REPLACE')
bpy.context.scene.frame_set(0);bpy.ops.wm.save_as_mainfile(filepath=str(RUN/'candidate/semantic-rig.blend'))
print('Semantic thumb weights applied; geometry and original rig unchanged')
