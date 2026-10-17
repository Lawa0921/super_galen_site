"""Comparison proof for original and revised oak at close and 64px scale."""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont

ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/'runs'/'kingdom-props'
OLD=BASE/'2026-10-04-original'/'qa'/'roundtrip'/'oak.png'
NEW=BASE/'2026-10-04-oak-v2'/'qa'/'roundtrip'/'oak.png'
OUT=BASE/'2026-10-04-oak-v2'/'qa'/'v1-v2-contact-sheet.png'
font_path=Path('C:/Windows/Fonts/segoeui.ttf')
font=ImageFont.truetype(str(font_path),24) if font_path.exists() else ImageFont.load_default()
small=ImageFont.truetype(str(font_path),17) if font_path.exists() else ImageFont.load_default()
sheet=Image.new('RGB',(1120,565),(35,42,48));draw=ImageDraw.Draw(sheet)
for i,(label,path,detail) in enumerate((('V1 — sparse',OLD,'145 leaf cards'),
                                        ('V2 — broad mature canopy',NEW,'616 leaf cards'))):
    x=i*560
    render=Image.open(path).convert('RGBA')
    bg=Image.new('RGBA',render.size,(89,101,109,255));bg.alpha_composite(render)
    sheet.paste(bg.convert('RGB').resize((480,480),Image.Resampling.LANCZOS),(x+40,49))
    icon=Image.new('RGBA',(64,64),(89,101,109,255))
    icon.alpha_composite(render.resize((64,64),Image.Resampling.LANCZOS))
    sheet.paste(icon.convert('RGB').resize((128,128),Image.Resampling.NEAREST),(x+407,392))
    draw.text((x+20,9),label,font=font,fill=(237,232,216))
    draw.text((x+20,531),detail,font=small,fill=(211,218,216))
    draw.text((x+408,370),'64 px',font=small,fill=(237,232,216))
    draw.rectangle((x+407,392,x+535,520),outline=(229,221,193),width=2)
sheet.save(OUT)
print(OUT)
