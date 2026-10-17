"""Render an existing candidate without rebuilding or publishing it."""
import json
import sys
from pathlib import Path
import bpy

sys.path.insert(0,str(Path(__file__).parent))
from visual_hand_rework import render

run=Path(sys.argv[sys.argv.index('--')+1]).resolve()
bpy.ops.wm.open_mainfile(filepath=str(run/'raw/guard-visual-rework.blend'))
rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
rows=json.loads((run/'qa/hand-build.json').read_bytes())['hands']
render(run,rig,[o for o in bpy.data.objects if o.type=='MESH' and o.name.endswith('_LOD0')],rows)
