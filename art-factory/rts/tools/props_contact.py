"""Build a candidate contact sheet from delivered-GLB roundtrip renders."""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont

ROOT=Path(__file__).resolve().parents[1]
RUN=ROOT/'runs'/'kingdom-props'/'2026-10-04-original'
NAMES=['oak','rock','gold-mine','timber-pile']
W,H=560,540
sheet=Image.new('RGB',(W*2,H*2),(34,40,48))
draw=ImageDraw.Draw(sheet)
font_path=Path('C:/Windows/Fonts/segoeui.ttf')
font=ImageFont.truetype(str(font_path),24) if font_path.exists() else ImageFont.load_default()
small=ImageFont.truetype(str(font_path),15) if font_path.exists() else ImageFont.load_default()
for index,name in enumerate(NAMES):
    x=(index%2)*W;y=(index//2)*H
    render=Image.open(RUN/'qa'/'roundtrip'/f'{name}.png').convert('RGBA')
    bg=Image.new('RGBA',render.size,(91,102,110,255));bg.alpha_composite(render)
    bg=bg.convert('RGB').resize((480,480),Image.Resampling.LANCZOS)
    sheet.paste(bg,(x+40,y+45))
    icon=Image.new('RGBA',(64,64),(91,102,110,255))
    icon.alpha_composite(render.resize((64,64),Image.Resampling.LANCZOS))
    sheet.paste(icon.convert('RGB').resize((128,128),Image.Resampling.NEAREST),(x+410,y+385))
    draw.text((x+22,y+10),name.upper(),fill=(232,230,214),font=font)
    draw.text((x+412,y+365),'64 px',fill=(240,240,225),font=small)
    draw.rectangle((x+410,y+385,x+538,y+513),outline=(224,214,185),width=2)
out=RUN/'qa'/'contact-sheet.png';sheet.save(out)
print(out)
