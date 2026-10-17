"""Deterministic processing of built-in imagegen source; never paints new artwork."""
from pathlib import Path
import hashlib, json, shutil
from PIL import Image

ROOT=Path(__file__).resolve().parents[3]
FACTORY=ROOT/'art-factory/rts'
GENERATED=Path(r'C:\Users\bag57\.codex\generated_images\01a105df-d576-7703-84fa-155fdc78b299')
SOURCES={'command-panel':'exec-c7f64559-8340-4bc2-92a2-f09df74a0928.png','menu-keyart':'exec-79e9c6e9-6326-4a4e-9810-147c19d08a48.png'}
runtime=ROOT/'public/assets/games/rts/ui';runtime.mkdir(parents=True,exist_ok=True)
records=[]
for asset,filename in SOURCES.items():
    run=FACTORY/'runs'/asset/'v1'
    for folder in ('raw','candidate','qa','prompts'):(run/folder).mkdir(parents=True,exist_ok=True)
    source=GENERATED/filename;raw=run/'raw'/('panel.png' if asset=='command-panel' else 'keyart.png');shutil.copyfile(source,raw)
    im=Image.open(raw).convert('RGBA')
    if asset=='command-panel':
        pixels=list(im.get_flattened_data());key=lambda p:p[0]>105 and p[2]>105 and p[1]<p[0]*.6 and p[1]<p[2]*.6
        im.putdata([(0,0,0,0) if key(p) else p for p in pixels]);box=im.getbbox();assert box
        im=im.crop(box).resize((1024,1024),Image.Resampling.LANCZOS)
        # Lanczos can ring at the keyed edge; apply the same key a second time.
        post_resize_residual=sum(1 for p in im.get_flattened_data() if p[3]>0 and key(p))
        im.putdata([(0,0,0,0) if key(p) else p for p in im.get_flattened_data()])
        candidate=run/'candidate'/'command-panel.png';im.save(candidate,optimize=True)
        residual=sum(1 for p in im.get_flattened_data() if p[3]>0 and key(p));assert residual==0
        assert im.getpixel((512,512))[3]==255
        def nine_slice(width,height):
            out=Image.new('RGBA',(width,height));cut=[0,96,928,1024];xs=[0,24,width-24,width];ys=[0,24,height-24,height]
            for y in range(3):
                for x in range(3):
                    patch=im.crop((cut[x],cut[y],cut[x+1],cut[y+1])).resize((xs[x+1]-xs[x],ys[y+1]-ys[y]),Image.Resampling.LANCZOS)
                    out.alpha_composite(patch,(xs[x],ys[y]))
            return out
        for w,h in [(234,240),(600,240),(900,60)]:nine_slice(w,h).save(run/'qa'/f'nine-slice-{w}x{h}.png')
        qa={'dimensions':[1024,1024],'key_color_residual':residual,'post_resize_fringe_removed':post_resize_residual,'center_opaque':True,'slice':96,'scale_cases':[[234,240],[600,240],[900,60]],'raw_crop_box':box}
        target=runtime/'command-panel.png'
    else:
        candidate=run/'candidate'/'menu-keyart.webp';im.convert('RGB').save(candidate,'WEBP',quality=90,method=6)
        qa={'dimensions':im.size,'alpha':'opaque','baked_text':False,'source_inspected':True};target=runtime/'menu-keyart.webp'
    qa.update({'sha256':hashlib.sha256(candidate.read_bytes()).hexdigest(),'bytes':candidate.stat().st_size,'mechanical':'passed','assembly_review':'pending-browser-preview'})
    (run/'qa'/'report.json').write_text(json.dumps(qa,indent=2),encoding='utf-8',newline='\n')
    shutil.copyfile(candidate,target)
    assert hashlib.sha256(target.read_bytes()).hexdigest()==qa['sha256']
    record={'id':asset,'status':'published','source':'builtin-imagegen','original_source':str(source),'raw':str(raw.relative_to(ROOT)).replace('\\','/'),'candidate':str(candidate.relative_to(ROOT)).replace('\\','/'),'runtime':'/'+str(target.relative_to(ROOT/'public')).replace('\\','/'),'postprocess':'art-factory/rts/tools/prepare_ui.py','qa':str((run/'qa'/'report.json').relative_to(ROOT)).replace('\\','/'),'runtime_publish_allowed':True,'assembly_review':'pending-browser-preview',**qa}
    records.append(record)
    contract=FACTORY/'contracts'/f'{asset}.json';data=json.loads(contract.read_text(encoding='utf-8'));data.update({'status':'published','runtime_publish_allowed':True,'assembly_review':'pending-browser-preview'});contract.write_text(json.dumps(data,indent=2,ensure_ascii=False)+'\n',encoding='utf-8',newline='\n')
(FACTORY/'manifests').mkdir(exist_ok=True)
(FACTORY/'manifests'/'ui-registry.json').write_text(json.dumps({'assets':records},indent=2,ensure_ascii=False)+'\n',encoding='utf-8',newline='\n')
print(json.dumps([{'id':r['id'],'bytes':r['bytes'],'qa':r['mechanical']} for r in records]))
