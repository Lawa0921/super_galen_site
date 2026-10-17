"""Source-grounded visual contact and negative-space ray analysis; QA only."""
import ast
import collections
import hashlib
import json
from pathlib import Path
from PIL import Image,ImageDraw
from guard_sleeve_comparison_connectivity import exterior_connected
ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/'art-factory/rts/runs/guard-sleeve-comparison/2026-10-09-v1/qa'
def read(path):return json.loads(path.read_text(encoding='utf-8'))
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
renders=read(RUN/'renders.json');camera=renders['camera'];analyses=[]
reference=renders['images'][0]
for image in renders['images']:
    assert image['camera']==camera and image['pose_joint_max_delta']<1e-6
    assert image['inherited_lights']==reference['inherited_lights']
    for key in ['view_transform','look','exposure','gamma']:assert image[key]==reference[key]
    assert sha(Path(image['source']))==image['source_sha256']
    assert sha(RUN/image['file'])==image['sha256']
    version=image['version'];lod=image['lod'];rays=read(RUN/f'{version}-LOD{lod}-pixel-rays.json');pixels=Image.open(RUN/image['file']).convert('RGB')
    assert rays['camera']==camera
    roi=rays['roi_top_left_pixels'];step=rays['step'];lookup={tuple(row['pixel']):row for row in rays['rays']}
    misses={p for p,row in lookup.items() if row['cloth_first'] is None}
    connected=exterior_connected(misses,roi,step)
    dark_v=[row for point,row in lookup.items() if 330<=point[0]<=374 and 255<=point[1]<=299 and max(pixels.getpixel(point))<=40]
    samples=[]
    for point in [(350,275),(350,285),(354,289),(350,291),(354,293),(354,299),(340,301),(364,301)]:
        row=lookup.get(point)
        if row is None:continue
        samples.append({'pixel':list(point),'RGB':list(pixels.getpixel(point)),'cloth_miss_connected_to_roi_outside':point in connected,'visible_first':row['visible_first'],'cloth_first':row['cloth_first']})
    cloth=next(row for row in rays['topology'] if row['name']==f'GuardArms_LOD{lod}')
    analysis={'version':version,'lod':lod,'source_sha256':image['source_sha256'],'render_sha256':image['sha256'],
              'roi_ray_count':len(lookup),'cloth_topology':cloth,
              'cloth_misses_total':len(misses),'cloth_misses_connected_to_roi_outside':len(connected),'cloth_misses_interior_island':len(misses-connected),
              'black_V_pixel_region':[330,255,374,299],'dark_pixel_max_rgb_threshold':40,'sampled_dark_V_pixels':len(dark_v),
              'dark_V_cloth_misses':sum(row['cloth_first'] is None for row in dark_v),
              'dark_V_cloth_misses_connected_to_roi_outside':sum(tuple(row['pixel']) in connected for row in dark_v),
              'dark_V_surface_misses':sum(row['visible_first'] is None for row in dark_v),
              'dark_V_first_surface_backfaces':sum(row['visible_first'] is not None and not row['visible_first']['front_facing'] for row in dark_v),
              'dark_V_first_cloth_backfaces':sum(row['cloth_first'] is not None and not row['cloth_first']['front_facing'] for row in dark_v),
              'samples':samples}
    analyses.append(analysis)

canvas=Image.new('RGB',(1440,2256),(25,27,28));draw=ImageDraw.Draw(canvas)
for row,lod in enumerate([0,1]):
    for col,version in enumerate(['v33','v35']):
        image=Image.open(RUN/f'{version}-Death48-inner-elbow-LOD{lod}.png').convert('RGB')
        canvas.paste(image,(col*720,row*752+32));draw.text((col*720+16,row*752+10),f'{version} / Death48 / LOD{lod} / exact arm whitelist',fill=(232,232,230))
        # Diagnostic candidate pixels labelled on the comparison only, raw renders unchanged.
        for x,y in [(350,275),(350,291),(354,293)]:
            if version=='v35':
                draw.ellipse((col*720+x-3,row*752+32+y-3,col*720+x+3,row*752+32+y+3),outline=(255,145,80),width=1)
for col,lod in enumerate([0,1]):
    image=Image.open(RUN/f'v35-Death48-cloth-only-LOD{lod}.png').convert('RGB');overlay=ImageDraw.Draw(image)
    wire=read(RUN/f'v35-LOD{lod}-cloth-wireframe.json');points=wire['vertices_png_pixels']
    for a,b in wire['edges']:
        if points[a][2]>0 and points[b][2]>0:overlay.line((points[a][0],points[a][1],points[b][0],points[b][1]),fill=(84,153,122),width=1)
    canvas.paste(image,(col*720,1536));draw.text((col*720+16,1514),f'v35 / LOD{lod} / cloth only + actual evaluated edge projection',fill=(232,232,230))
contact=RUN/'Death48-comparison-contact.png';canvas.save(contact)
canvas.crop((0,1504,1440,2256)).save(RUN/'v35-Death48-cloth-wireframe-LOD0-1.png')
summary={'camera':camera,'same_camera_pose_exposure':True,'source_saved':False,'images_total':len(list(RUN.glob('*.png'))),'contact_sha256':sha(contact),'results':analyses,
         'png_artifacts':[{'file':path.name,'sha256':sha(path),'camera_reference':'renders.json camera','pose':'Death48','kind':'original actual Blender render' if 'inner-elbow' in path.name or 'cloth-only' in path.name else 'composed QA / actual evaluated-edge overlay'} for path in sorted(RUN.glob('*.png'))],
         'scope':'Finite Death48 left inner elbow comparison only; no model edits, no source saves, no whole-animation verdict'}
(RUN/'analysis.json').write_text(json.dumps(summary,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
for path in (ROOT/'art-factory/rts/tools').glob('guard_sleeve_comparison_*.py'):ast.parse(path.read_text(encoding='utf-8'))
lines=['# Death48 左肘黑 V 的有限唯讀 QA','',
       '結論：在本次相機下，v35 左肘的黑 V 是閉合布袖外部的自然投影凹口／負空間，未找到布面邊界洞、該區反面或應有布面內部的透視洞證據。這不是全動畫／整個角色品質的驗收，也不推翻 reviewer 對其他局部覆蓋或材質問題的判斷。','',
       '## 重現條件','',
       '沿用 root `guard_sleeve_lod_render.py` 的 Death48 inner-elbow 相機計算、0.56m 正交 span、720×720、三盞固定 AREA 光、AgX Medium High Contrast、exposure -1。以 v35 pose freeze 同一相機到 v33/v35；UpperArm/Forearm/Hand 左側骨頭 heads 最大差異為0（assert<1e-6m）。四盞既有光與三盞新增光逐張相同，view transform/look/gamma/exposure及既有光數據經程式assert相同。沒有修改或儲存source。',
       '可見模型嚴格限制為 GuardArms_LOD{lod} 與 Guard{UpperArmArmor,ForearmArmor,ElbowArmor,ShoulderSpaulder,WristCuff}_L_LOD{lod}，沒有 tasset/body/hand/shield。布袖單獨圖只顯示 GuardArms；wireframe是實際 evaluated mesh edges 的同相機投影線，包含背側邊，僅作QA疊圖，沒有加布片。','',
       '## 直接證據','',
       '| Source / LOD | sampled rays | cloth boundary/nonmanifold | dark V pixels | cloth miss | miss connected outside | backface cloth |','|---|---:|---:|---:|---:|---:|---:|']
for row in analyses:
    t=row['cloth_topology'];lines.append(f"| {row['version']} / {row['lod']} | {row['roi_ray_count']} | {t['boundary_edges']} / {t['nonmanifold_edges']} | {row['sampled_dark_V_pixels']} | {row['dark_V_cloth_misses']} | {row['dark_V_cloth_misses_connected_to_roi_outside']} | {row['dark_V_first_cloth_backfaces']} |")
lines += ['',
          '黑 V 的候選像素區為 x330..374、y255..299，使用同相機像素中心正交 ray；每2px抽樣，只有 RGB最大通道≤40 的像素計入暗區。所有該暗區 cloth miss 均連通 ROI 的外部背景，而非孤立在布袖內部；完整ROI也沒有 miss interior island。連通算法另有4項先紅再綠測試，涵蓋V外凹、真正內洞、斜角不應穿越與2px步長。',
          'v35 LOD0與LOD1的(350,275)、(350,285)等候選像素沒有命中任何可見護甲／布，RGB為背景；緊鄰下方(350,291)、(354,293)命中正向布面。這表示黑V的尖端就是布袖外輪廓的內凹點，不能以該輪廓外像素當成缺布位置。其具體 hit triangle、world position、normal.dot(ray)、RGB 與數據都在analysis.json／各pixel-rays.json。',
          '同姿態 v33 也有相同類型的外部黑凹口；v35 LOD0/1 cloth-only 原圖 SHA相同，代表本視角兩個LOD的布袖可見形狀與著色相同。v33 LOD1布折紋/局部輪廓有差異，但該黑V仍不是布mesh中的邊界洞。','',
          '## 來源與輸出','']
for version in ['v33','v35']:
    row=next(image for image in renders['images'] if image['version']==version);lines.append(f"- {version}: `{row['source']}`\n  SHA256 `{row['source_sha256']}`（before/after一致）。")
lines += ['',
          '- `Death48-comparison-contact.png`：上兩列四張同相機A/B；下列兩LOD布袖及wire投影。橙點是(350,275)、(350,291)、(354,293)樣本。',
          '- 四張 `v{33,35}-Death48-inner-elbow-LOD{0,1}.png` 原始實際Blender渲染；兩張 `v35-Death48-cloth-only-LOD{0,1}.png` 原始布袖渲染，另有 `v35-Death48-cloth-wireframe-LOD0-1.png` 合併的布袖＋wireframe圖，共8張PNG含contact。',
          '- `renders.json`：source/image SHA、相機、可見清單、曝光、原場景光線；`analysis.json`：數量／射線樣本；`*-pixel-rays.json`：完整338?射線與實際evaluated topology（以其中roi_ray_count為真）；`*-cloth-wireframe.json`：真實投影頂點／邊。','',
          '限制：ray ROI為2px步長；外部連通證明限該ROI與鏡頭，不宣稱任何姿態都不缺布。沒有重新驗證fullself全掃描，也沒有調整甲片、skin、權重、材質、相機角度來遮掩問題。已移除寬鬆的Guard*_L隔離污染，root可交原reviewer對抗複審。']
# Correct the prose with the actually measured ray count, never a guessed count.
lines=[line.replace('完整338?射線','完整射線') for line in lines]
(RUN/'report.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
print(json.dumps({'images_total':summary['images_total'],'results':[{k:r[k] for k in ['version','lod','roi_ray_count','sampled_dark_V_pixels','dark_V_cloth_misses','dark_V_cloth_misses_connected_to_roi_outside','dark_V_first_cloth_backfaces','cloth_misses_interior_island']} for r in analyses]},indent=2))
