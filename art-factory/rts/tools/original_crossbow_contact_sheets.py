"""Deterministic review contact sheets from actual final renders only."""
from PIL import Image,ImageDraw
import pathlib,sys
qa=pathlib.Path(sys.argv[1])/'qa';names=['idle','walk','attack','hurt','death']
sets={
 'source-contact-sheet':[(f'source-{n}-contact-{v}.png',f'Source {n} {v}') for v in ['front','side'] for n in names],
 'glb-contact-sheet':[(f'glb-{n}-contact-{v}.png',f'GLB {n} {v}') for v in ['front','side'] for n in names],
 'whole-pose-sheet':[(f'{n}-full.png',f'Source {n}') for n in names]+[(f'glb-{n}.png',f'GLB {n}') for n in names],
 'browser-pose-sheet':[(f'browser-lod{lod}-{n}.png',f'Three LOD{lod} {n}') for lod in (0,1) for n in names]
}
for name,files in sets.items():
    sheet=Image.new('RGB',(1600,688),'#344047');draw=ImageDraw.Draw(sheet)
    for i,(filename,label) in enumerate(files):
        im=Image.open(qa/filename).convert('RGBA');im.thumbnail((320,320))
        tile=Image.new('RGBA',(320,320),'#344047');tile.alpha_composite(im,((320-im.width)//2,(320-im.height)//2))
        x=i%5*320;y=i//5*344;sheet.paste(tile.convert('RGB'),(x,y+24));draw.text((x+6,y+5),label,fill='white')
    sheet.save(qa/(name+'.png'))
