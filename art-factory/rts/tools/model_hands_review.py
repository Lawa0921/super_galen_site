"""Hands section of the model polish review page (2026-10-16).

Usage: python art-factory/rts/tools/model_hands_review.py
Reads the hand close-ups in tmp/rts/visual-hands/{before,after,after-lod1}/ (model_hands_capture.mjs), writes compact
before|after JPEG pairs to the hands run's qa/review-renders/, qa/review.json (defects, changes, stats, gates) and
replaces the <!-- hands:start --> ... <!-- hands:end --> block of art-factory/rts/review/model-polish-20261016.html
(the weapons / buildings sections are left untouched). Status stays pending user approval.
"""
from pathlib import Path
import hashlib, html, json, re
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[3]
RUN = ROOT / 'art-factory/rts/runs/model-polish/2026-10-16-hands-v1'
CAP = ROOT / 'tmp/rts/visual-hands'
OUT = RUN / 'qa/review-renders'
PAGE = ROOT / 'art-factory/rts/review/model-polish-20261016.html'
NAMES = {'worker': '工人', 'guard': '衛兵', 'crossbow': '弩手', 'knight': '騎士（騎手）', 'priest': '祭司', 'neutral-raider': '中立掠奪者', 'commander': '指揮官（英雄）'}
CLIP = {'Idle': '待機', 'Walk': '行走', 'Attack': '攻擊', 'Hurt': '受擊', 'Cast': '施法', 'CastCleave': '橫斬技', 'CastMend': '治療技', 'CastBanner': '軍旗技',
        'Mine': '採礦', 'Chop': '伐木', 'Build': '建造'}
VIEW = {'front': '正面', '3q': '3/4', 'back': '背側'}
SIDE = {'R': '右手', 'L': '左手'}
SHOTS = {
    'worker': ['Idle-0-R-3q-studio', 'Idle-0-L-3q-studio', 'Chop-35-R-front-studio', 'Mine-35-R-3q-studio', 'Build-35-R-3q-studio', 'Walk-25-L-back-studio', 'Attack-55-R-3q-game'],
    'guard': ['Idle-0-R-front-studio', 'Idle-0-R-3q-studio', 'Attack-55-R-3q-studio', 'Idle-0-L-back-studio', 'Hurt-40-L-front-studio', 'Idle-0-R-3q-game'],
    'crossbow': ['Idle-0-R-front-studio', 'Idle-0-L-3q-studio', 'Attack-55-L-front-studio', 'Idle-0-L-back-studio', 'Attack-30-L-3q-game'],
    'knight': ['Idle-0-R-3q-studio', 'Attack-55-R-3q-studio', 'Idle-0-L-back-studio', 'Idle-0-L-3q-studio', 'Idle-0-R-3q-game'],
    'priest': ['Idle-0-R-3q-studio', 'Cast-50-R-front-studio', 'Idle-0-L-3q-studio', 'Cast-50-L-front-studio', 'Walk-25-L-back-studio', 'Idle-0-L-3q-game'],
    'neutral-raider': ['Idle-0-R-3q-studio', 'Attack-55-R-front-studio', 'Idle-0-L-front-studio', 'Attack-55-L-back-studio', 'Idle-0-R-3q-game'],
    'commander': ['Idle-0-R-3q-studio', 'CastCleave-50-R-3q-studio', 'CastBanner-50-R-3q-studio', 'Idle-0-L-back-studio', 'CastMend-50-L-back-studio', 'Idle-0-R-3q-game'],
}
DEFECTS = {
    'worker': ['右手：四圈同心「甜甜圈」環繞斧柄，沒有指節、沒有拇指，看起來是皮套而不是手', '右手袖口切口外露膚色鋸齒（舊 TripoSR 前臂切面）',
               '左手：TripoSR 原生手是融成一團的連指手套，指尖泛紅、貼圖拉伸、面數過低成多角形'],
    'guard': ['右手：四圈平行環＋方塊掌背，無拇指、指頭不分開，靠近看像纏繩', '左手：拳頭浮在盾牌皮帶旁邊，手指沒有握住任何東西（皮帶離拳心 4–10 cm）',
              '手套皮革紋理在近距離呈絨毛狀糊化'],
    'crossbow': ['雙手同為環狀「手指」，左手扁平條狀繞木托、右手方塊掌背，無拇指', '右手 3/4 視角被弩身遮住時仍看得到方塊掌底'],
    'knight': ['右手：平板鋼片拼成的方盒，膚色平面掌心外露，手指不成形', '左手：拳頭在盾牌握把旁邊沒握住；騎手身體網格殘留一段裸手藏在手套下'],
    'priest': ['右手：環狀手指繞杖，四環有缺口（環形接縫開口），掌背為方塊', '左手：裸露的 TripoSR 連指手，無手指、紅色裂紋狀貼圖拉伸、多角形外輪廓'],
    'neutral-raider': ['右手：只有一段皮管包住斧柄＋一個拇指凸塊，沒有手形；斧柄在握處粗 10 cm，任何手都握不攏', '左手：TripoSR 原生「龍蝦螯」連指手'],
    'commander': ['右手：雕塑過的四指＋鋼片，但仍是平行環形指，無指節轉折，劍柄從拳底穿出', '左手：拳頭沒有握住盾牌把手（把手在拳外 10 cm）'],
}
CHANGES = {
    'worker': '雙手改為原創分節皮手套：四指各三節（近／中／遠節膠囊在關節處重疊成指節）、拇指含掌骨反向包握、掌心大小魚際、腕袖口。右手閉握在斧柄實際半徑上（握處斧柄只在手內收細成腰身 3.3→2.3 cm），左手為自然半握；裸手三角面移除，袖口蓋住切口。',
    'guard': '雙手改為分節板甲手套：每指近／中節鋼甲片、遠節皮指尖、鋼指節帽、兩片重疊掌背甲、鋼喇叭袖口（剛性跟手，不再拉扯）。右手閉握劍柄並沿柄移向手腕；盾牌加上真正的皮纏握把＋黃銅箍＋兩支托架，盾牌整體平移貼近拳頭，舊的兩條浮空皮帶移除。',
    'crossbow': '雙手改為分節皮手套＋暗鋼指節釘：右手閉握弩托腕部、左手閉握前托，關節對準實際握處；袖口加暗鋼箍。',
    'knight': '雙手改為分節板甲手套：右手以前臂袖口末端為腕，從上方閉握長槍（覆手握）；左手閉握盾牌新把手，盾牌平移貼近、舊皮帶移除；騎手殘留裸手三角面移除。',
    'priest': '雙手改為細皮手套＋黃銅腕帶：右手閉握法杖杖身；左手依膚色區段量出真實手腕與手的方向，做成自然張開的施法手，原裸手整段移除。',
    'neutral-raider': '雙手改為分節皮手套：右手閉握斧柄（握處收細 5.3→2.5 cm 才能握攏），左手握拳；裸手移除，粗袖口蓋住前臂切口。',
    'commander': '雙手改為分節板甲手套＋黃銅指節條與袖口邊：右手閉握長劍握把；左手閉握盾牌新把手（黃銅箍、暗鋼托架），盾牌平移貼近、舊皮帶移除。',
}


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def label(name):
    clip, pct, side, view, light = name.split('-')
    return f"{SIDE[side]} · {CLIP.get(clip, clip)} {pct}% · {VIEW[view]}（{'遊戲光照' if light == 'game' else '棚燈'}）"


def pair(unit, shot):
    a, b = CAP / 'before' / f'{unit}-{shot}.jpg', CAP / 'after' / f'{unit}-{shot}.jpg'
    if not (a.exists() and b.exists()):
        return None
    w = 380; canvas = Image.new('RGB', (w * 2 + 8, w + 26), (17, 25, 29))
    canvas.paste(Image.open(a).convert('RGB').resize((w, w), Image.Resampling.LANCZOS), (0, 26))
    canvas.paste(Image.open(b).convert('RGB').resize((w, w), Image.Resampling.LANCZOS), (w + 8, 26))
    d = ImageDraw.Draw(canvas); d.text((8, 6), 'BEFORE', fill=(159, 176, 179)); d.text((w + 16, 6), 'AFTER', fill=(217, 178, 95))
    OUT.mkdir(parents=True, exist_ok=True); path = OUT / f'hands-{unit}-{shot}.jpg'
    canvas.save(path, quality=78, optimize=True)
    return path


def lod1_tile(unit):
    src = CAP / 'after-lod1' / f'{unit}-Idle-0-R-3q-studio.jpg'
    if not src.exists():
        return None
    path = OUT / f'hands-{unit}-lod1-Idle-0-R-3q-studio.jpg'
    Image.open(src).convert('RGB').resize((380, 380), Image.Resampling.LANCZOS).save(path, quality=78, optimize=True)
    return path


def build():
    inv = {r['file']: r for r in json.loads((RUN / 'qa/invariants.json').read_text(encoding='utf-8'))['files']}
    clear = json.loads((RUN / 'qa/clearance.json').read_text(encoding='utf-8'))
    val = json.loads((RUN / 'qa/gltf-validator.json').read_text(encoding='utf-8'))
    models = []
    for unit, name in NAMES.items():
        renders = []
        for shot in SHOTS[unit]:
            p = pair(unit, shot)
            if p:
                renders.append({'label': label(shot), 'file': p.relative_to(ROOT).as_posix(), 'sha256': sha(p)})
        t = lod1_tile(unit)
        if t:
            renders.append({'label': '右手 · 待機 · 3/4（LOD1 遠景網格，修改後）', 'file': t.relative_to(ROOT).as_posix(), 'sha256': sha(t), 'single': True})
        r0, r1 = inv[f'{unit}.glb'], inv[f'{unit}-lod1.glb']
        c = clear[unit]
        worst_near = max(v['after'] for clip in c['body_vertices_near_probe_max_per_clip'].values() for v in clip.values())
        worst_near_before = max(v['before'] for clip in c['body_vertices_near_probe_max_per_clip'].values() for v in clip.values())
        models.append({'id': unit, 'name': name, 'defects': DEFECTS[unit], 'change': CHANGES[unit], 'renders': renders,
                       'stats': {'lod0_triangles': [r0['triangles_before'], r0['triangles_after']], 'lod1_triangles': [r1['triangles_before'], r1['triangles_after']],
                                 'draw_calls_lod0': [r0['primitives_before'], r0['primitives_after']], 'materials_lod0': [r0['materials_before'], r0['materials_after']],
                                 'rig_and_animation_identical': r0['rig_and_animation_identical'] and r1['rig_and_animation_identical'],
                                 'cuff_worst_edge_stretch': [c.get('cuff_worst_edge_stretch_before'), c['cuff_worst_edge_stretch']],
                                 'body_vertices_within_8mm_of_hands_or_shield': [worst_near_before, worst_near]}})
    records = {f.name: sha(f) for f in sorted((RUN / 'qa').glob('*-hands.json'))}
    review = {'id': 'model-polish-hands-2026-10-16', 'status': 'published_on_branch_pending_user_approval', 'user_approval': 'pending',
              'branch': 'feat/browser-rts-model-polish (not merged, not deployed)', 'viewer': 'http://127.0.0.1:4394/games/rts/models/',
              'contract': 'art-factory/rts/contracts/model-polish-2026-10-16.json#hands', 'records': records,
              'textures': 'art-factory/rts/runs/model-polish/2026-10-16-hands-v1/qa/textures.json (no new texture: shared equipment atlas)',
              'validator': {'file': 'art-factory/rts/runs/model-polish/2026-10-16-hands-v1/qa/gltf-validator.json', 'errors': val['errors'], 'warnings': val['warnings']},
              'invariants': 'art-factory/rts/runs/model-polish/2026-10-16-hands-v1/qa/invariants.json',
              'clearance': 'art-factory/rts/runs/model-polish/2026-10-16-hands-v1/qa/clearance.json', 'models': models}
    (RUN / 'qa/review.json').write_text(json.dumps(review, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    text = PAGE.read_text(encoding='utf-8')
    block = section(review)
    if '<!-- hands:start -->' in text:
        text = re.sub(r'<!-- hands:start -->.*?<!-- hands:end -->', lambda _: block, text, flags=re.S)
    else:
        text = text.replace('</main>', block + '\n</main>')
        text = text.replace('<nav>', '<nav><a href="#hands">手部精修</a>', 1)
        text = text.replace('<h1>RTS 模型精修（武器・盾牌・兵營・城鎮大廳）</h1>', '<h1>RTS 模型精修（武器・盾牌・兵營・城鎮大廳・手部）</h1>', 1)
    PAGE.write_text(text, encoding='utf-8')
    print('hands review', len(models), 'models', sum(len(m['renders']) for m in models), 'renders')


def section(review):
    e = html.escape
    out = ['<!-- hands:start -->', '<section id="hands"><h2>手部精修（2026-10-16 第二輪）</h2>',
           '<p class="status">已發布到 feat/browser-rts-model-polish 分支 · 待使用者確認</p>',
           '<p>使用者回饋「很多的手部都不行」。七個人形單位的每隻手都在檢視器中逐動畫、逐視角近拍（正面／3/4／背側，棚燈與遊戲光照），列出缺陷後全部重做：'
           '原創分節手（每指三節膠囊在關節重疊成指節、拇指含掌骨反向包握、掌心大小魚際），閉握在實際量到的握柄半徑與軸向上；板甲單位加每節鋼甲片、指節帽、重疊掌背甲與剛性喇叭袖口；'
           '皮手套單位以半混合袖口跨過腕關節。骨架、蒙皮、反向綁定矩陣與全部動畫通道位元組不變；沒有新增貼圖（共用已發布的裝備圖集），繪製批次不增加。每對圖左為修改前、右為修改後，姿勢與鏡頭相同。</p>',
           f"<p>驗證：glTF Validator {review['validator']['errors']} 錯誤（警告皆為原有的 NODE_SKINNED_MESH_NON_ROOT）；"
           f"紀錄 <code>{e(review['invariants'])}</code>、<code>{e(review['clearance'])}</code>、<code>{e(review['textures'])}</code>。</p>",
           '<nav>' + ''.join(f"<a href=\"#hands-{e(m['id'])}\">{e(m['name'])}</a>" for m in review['models']) + '</nav>']
    for m in review['models']:
        s = m['stats']
        def row(k, lab, fmt=lambda v: f'{v:,}' if isinstance(v, int) else str(v)):
            b, a = s[k]
            return f"<tr><td>{lab}</td><td>{fmt(b) if b is not None else '—'}</td><td>{fmt(a)}</td></tr>"
        table = ('<table><tr><th></th><th>修改前</th><th>修改後</th></tr>' + row('lod0_triangles', 'LOD0 三角面') + row('lod1_triangles', 'LOD1 三角面') +
                 row('draw_calls_lod0', '繪製批次（LOD0 primitive）') + row('materials_lod0', '材質') + row('cuff_worst_edge_stretch', '腕部最大邊長伸縮倍率（全動畫）') +
                 row('body_vertices_within_8mm_of_hands_or_shield', '身體頂點貼近手／盾 8 mm 內（最多）') + '</table>')
        defects = ''.join(f'<li>{e(d)}</li>' for d in m['defects'])
        figs = ''.join(f"<figure><img loading=\"lazy\" src=\"../../../{e(f['file'])}\" alt=\"{e(m['name'])} {e(f['label'])}\"><figcaption>{e(f['label'])}</figcaption></figure>" for f in m['renders'])
        out.append(f"<section id=\"hands-{e(m['id'])}\"><h2>{e(m['name'])} 手部 <code>{e(m['id'])}</code></h2>"
                   f"<p>修改前缺陷：</p><ul>{defects}</ul><p>修改：{e(m['change'])}</p>{table}<div class=\"figs hands\">{figs}</div></section>")
    out.append('</section>')
    out.append('<!-- hands:end -->')
    return '\n'.join(out)


if __name__ == '__main__':
    build()
