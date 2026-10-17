"""Compose existing actual Blender renders; does not invent production pixels."""
from PIL import Image, ImageDraw
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/'art-factory/rts/runs/building-stages/2026-10-08-v1'
ids=['barracks','stable','workshop']; progresses=[0,20,50,75,100]
canvas=Image.new('RGB',(1920,1248),(23,29,33)); draw=ImageDraw.Draw(canvas)
for row,asset in enumerate(ids):
    for col,progress in enumerate(progresses):
        image=Image.open(RUN/'qa/renders'/f'{asset}-p{progress:03d}.png').convert('RGB').resize((384,384),Image.Resampling.LANCZOS)
        canvas.paste(image,(col*384,row*416+32))
        draw.text((col*384+12,row*416+10),f'{asset} | construction {progress/100:g}',fill=(231,231,217))
canvas.save(RUN/'qa/construction-contact.png')
print(RUN/'qa/construction-contact.png')
if (RUN/'qa/renders/barracks-completed-published.png').exists():
    canvas=Image.new('RGB',(1536,2400),(23,29,33));draw=ImageDraw.Draw(canvas)
    for row,asset in enumerate(ids):
        for col,version in enumerate(['published','candidate']):
            image=Image.open(RUN/'qa/renders'/f'{asset}-completed-{version}.png').convert('RGB')
            canvas.paste(image,(col*768,row*800+32));draw.text((col*768+12,row*800+10),f'{asset} | completed {version}',fill=(231,231,217))
    canvas.save(RUN/'qa/completed-ab-contact.png')
