"""Compose already-rendered evidence only; never invent production pixels."""
from PIL import Image,ImageDraw
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3];RUN=ROOT/'art-factory/rts/runs/landmark-kit/2026-10-08-v1'
def compose():
    assets=['river-gatehouse','river-shrine','highland-watchtower','quarry-ruins'];views=['front','back','oblique-left','oblique-right']
    sheet=Image.new('RGB',(1440,1552),'#20252a');draw=ImageDraw.Draw(sheet)
    for row,asset in enumerate(assets):
        for col,view in enumerate(views):
            im=Image.open(RUN/'qa'/f'{asset}-{view}-reimport.png').convert('RGB').resize((360,360),Image.Resampling.LANCZOS)
            x,y=col*360,row*388;sheet.paste(im,(x,y));draw.text((x+8,y+366),f'{asset} | {view}',fill='white')
    sheet.save(RUN/'qa/multiview-contact.png')
if __name__=='__main__':compose()
