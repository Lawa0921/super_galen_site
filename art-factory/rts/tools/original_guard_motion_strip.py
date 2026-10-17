"""Assemble the exact browser pose captures into readable review strips."""
import json
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import sys

ROOT=Path(__file__).resolve().parents[3]
RUN=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else ROOT/'art-factory/rts/runs/original-guard-assembly/2026-10-05'
report=json.loads((RUN/'qa/motion-capture.json').read_text(encoding='utf-8'))
if report.get('status')!='captured-for-visual-review':
    raise ValueError('Capture must be complete and match the current candidate')
font_path=Path('C:/Windows/Fonts/arial.ttf')
font=ImageFont.truetype(str(font_path),16) if font_path.exists() else ImageFont.load_default()
title_font=ImageFont.truetype(str(font_path),22) if font_path.exists() else font
groups={}
for capture in report['captures']:
    key=(capture['lod'],capture['team'],capture['view'],capture['action'])
    groups.setdefault(key,[]).append(capture)
outputs=[]
for (lod,team,view,action),captures in groups.items():
    columns=min(4,len(captures));rows=math.ceil(len(captures)/columns)
    tile_width=320;tile_height=282
    sheet=Image.new('RGB',(columns*tile_width,70+rows*tile_height),(16,25,23))
    draw=ImageDraw.Draw(sheet)
    draw.text((12,10),f'Original Guard | {action.title()} | {view} | LOD {lod} | {team}',font=title_font,fill=(228,227,209))
    draw.text((12,40),'GLB SHA256 '+captures[0]['sha256'][:24]+'... | Browser poses; visual review pending',font=font,fill=(174,185,169))
    for index,capture in enumerate(captures):
        image=Image.open(RUN/'qa/motion-frames'/capture['filename']).convert('RGB')
        image.thumbnail((tile_width-8,tile_height-28),Image.Resampling.LANCZOS)
        x=(index%columns)*tile_width;y=70+(index//columns)*tile_height
        sheet.paste(image,(x+(tile_width-image.width)//2,y))
        draw.text((x+10,y+tile_height-23),f'{capture["time"]:.3f} s',font=font,fill=(231,218,165))
    filename=f'motion-strip-lod{lod}-{team}-{view}-{action}.jpg'
    sheet.save(RUN/'qa'/filename,quality=93)
    outputs.append(filename)
(RUN/'qa/motion-strips.json').write_text(json.dumps({'status':'created-for-visual-review','assets':report['assets'],'outputs':outputs},indent=2)+'\n',encoding='utf-8')
print(json.dumps({'strips':len(outputs),'outputs':outputs}))
