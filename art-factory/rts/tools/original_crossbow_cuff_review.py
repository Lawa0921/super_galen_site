"""Reuse sealed character QA/export logic on this explicit diagnostic candidate.

Older tool files are immutable; adaptations are limited to this run's paths,
42-bone count and original hand-source metadata location.
"""
from pathlib import Path
import sys
TOOLS=Path(__file__).parent
mode=sys.argv[sys.argv.index('--task')+1]
allowed={'export':'original_crossbow_hand_export.py','identity':'original_crossbow_hand_identity_verify.py','contact':'original_crossbow_hand_probe.py','parity':'original_crossbow_hand_export_verify.py','structure':'original_crossbow_hand_glb_structure.py','seam':'original_crossbow_hand_seam_verify.py'}
assert mode in allowed
path=TOOLS/allowed[mode];text=path.read_text(encoding='utf-8')
old='original-crossbow-articulated-hand/2026-10-07-v1';new='original-crossbow-cuff-motion/2026-10-07-v1'
assert old in text
text=text.replace(old,new).replace('candidate/articulated-connector.blend','candidate/cuff-bands.blend').replace('candidate/articulated-crossbow.blend','candidate/cuff-bands.blend')
text=text.replace('==36','==42').replace('==[36]','==[42]').replace("'bones':36","'bones':42")
text=text.replace("(RUN/'qa/attachment-preflight.json')", "(ROOT/'art-factory/rts/runs/"+old+"/qa/attachment-preflight.json')")
exec(compile(text,str(path),'exec'),{'__file__':str(path),'__name__':'__main__'})
