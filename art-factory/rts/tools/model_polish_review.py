"""Before/after review pack for model polish 2026-10-16.

Usage: python art-factory/rts/tools/model_polish_review.py
Reads the viewer captures in tmp/rts/visual-model-polish/{before,after}/ (model_polish_capture.mjs), writes compact
side-by-side JPEGs to the run's qa/review-renders/, qa/review.json (stats + status) and the static review page
art-factory/rts/review/model-polish-20261016.html. Status stays pending user approval.
"""
from pathlib import Path
import hashlib, html, json
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[3]
RUN = ROOT / 'art-factory/rts/runs/model-polish/2026-10-16-v1'
CAP = ROOT / 'tmp/rts/visual-model-polish'
OUT = RUN / 'qa/review-renders'
PAGE = ROOT / 'art-factory/rts/review/model-polish-20261016.html'
NAMES = {'worker': '工人', 'guard': '衛兵', 'crossbow': '弩手', 'knight': '騎士', 'priest': '祭司', 'neutral-raider': '中立掠奪者',
         'commander': '指揮官（英雄）', 'barracks': '兵營', 'townhall': '城鎮大廳', 'townhall-tier2': '城堡', 'townhall-tier3': '王城'}
EQUIPMENT = {'worker': ['WorkerCraftAxe'], 'guard': ['KingdomSteelSword', 'KingdomSunShield'], 'crossbow': ['ProceduralCrossbow'],
             'knight': ['KnightLance', 'KnightSunShield'], 'priest': ['PriestDawnStaff'], 'neutral-raider': ['RaiderShortAxe'],
             'commander': ['CommanderLongsword', 'CommanderDawnShield']}
NOTES = {
    'worker': '工具由灰色方塊重建為鬍鬚斧：鍛黑鋼斧身＋研磨亮刃、套筒與短錘背、木柄纏皮、柄尾鐵箍。',
    'guard': '劍：雙面刃加血槽、尖端收束、彎曲護手含球形端、纏繩皮握把與黃銅箍、八角柄頭；盾：弧面鳶形盾、鍛鋼盾緣、黃銅內線、太陽浮雕盾心＋八道光芒、鉚釘、橡木背板、皮革臂帶。',
    'crossbow': '幾何不變（既有原創弩），木、鋼、黃銅、皮革貼圖換成 1024 新材質（原 256），鋼弓改亮鋼。',
    'knight': '長槍：螺旋凹槽槍桿、鋼製護手錐、黃銅箍、葉形槍頭、隊色燕尾旗；盾同衛兵新弧面鳶形盾。',
    'priest': '幾何不變，法杖木、黃銅、皮革貼圖換成 1024 新材質。',
    'neutral-raider': '短斧同工人新斧型（深色斧身＋亮刃），取代 148 三角面的方塊斧。',
    'commander': '長劍：同新劍型、黃銅護手與柄頭、較長握把；盾：弧面鳶形盾、十二道光芒太陽浮雕、鉚釘、橡木背板與臂帶。',
    'barracks': '外牆加入勒腳、轉角扶壁（含斜面收分）、開口避讓的腰線；材質換 1024 修整石、全解析度石牆／石板法線，木料、鐵件、黃銅換新材質。',
    'townhall': '同兵營立面語彙：勒腳、扶壁、腰線；材質全面換 1024。',
    'townhall-tier2': '主樓與城牆加入勒腳、扶壁、腰線，主樓正面中央壁柱從門頂起；材質全面換 1024。',
    'townhall-tier3': '主樓正面（原平牆）加入轉角扶壁、自門頂起的中央壁柱、樓層間腰線、簷下托臂帶；側面與背面同；材質全面換 1024。',
}


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def pair(name, out_name):
    a, b = CAP / 'before' / f'{name}.png', CAP / 'after' / f'{name}.png'
    if not (a.exists() and b.exists()):
        return None
    ia, ib = Image.open(a).convert('RGB'), Image.open(b).convert('RGB')
    w = 560; h = round(ia.height * w / ia.width)
    canvas = Image.new('RGB', (w * 2 + 8, h + 28), (17, 25, 29))
    canvas.paste(ia.resize((w, h), Image.Resampling.LANCZOS), (0, 28)); canvas.paste(ib.resize((w, h), Image.Resampling.LANCZOS), (w + 8, 28))
    d = ImageDraw.Draw(canvas); d.text((8, 7), 'BEFORE', fill=(159, 176, 179)); d.text((w + 16, 7), 'AFTER', fill=(217, 178, 95))
    OUT.mkdir(parents=True, exist_ok=True); path = OUT / out_name
    canvas.save(path, quality=74, optimize=True)
    return path


def stats_rows():
    before = {r['id']: r for r in json.loads((CAP / 'before/stats.json').read_text(encoding='utf-8'))['rows']}
    after = {r['id']: r for r in json.loads((CAP / 'after/stats.json').read_text(encoding='utf-8'))['rows']}
    def brief(r):
        s0, s1 = r['lod0'], r['lod1']
        return {'lod0_triangles': s0['triangles'], 'lod1_triangles': s1['triangles'], 'draw_calls': s0['drawCalls'], 'materials': s0['materials'],
                'textures': [f"{t['width']}x{t['height']}" + (f" x{t['count']}" if t['count'] > 1 else '') for t in s0['textures']]}
    return {k: {'before': brief(before[k]), 'after': brief(after[k])} for k in after}


def build():
    stats = stats_rows(); models = []
    for mid, name in NAMES.items():
        views = [('studio-front', '正面（棚燈）'), ('studio-3q', '3/4（棚燈）'), ('studio-game', '遊戲視角（棚燈）'), ('game-front', '正面（遊戲光照）')]
        if mid in EQUIPMENT:
            for node in EQUIPMENT[mid]:
                views += [(f'studio-{node}-3q', f'{node} 3/4 近景'), (f'studio-{node}-front', f'{node} 正面近景')]
        else:
            views += [('studio-facade-close', '正立面近景'), ('studio-side-close', '側立面近景')]
        figs = []
        for view, label in views:
            p = pair(f'{mid}-{view}', f'{mid}-{view}.jpg')
            if p:
                figs.append({'label': label, 'file': p.relative_to(ROOT).as_posix(), 'sha256': sha(p)})
        models.append({'id': mid, 'name': name, 'note': NOTES[mid], 'stats': stats[mid], 'renders': figs})
    apply = {}
    for f in sorted((RUN / 'qa').glob('*-apply.json')) + sorted((RUN / 'qa').glob('*-facade.json')):
        apply[f.name] = sha(f)
    review = {'id': 'model-polish-2026-10-16', 'status': 'published_on_branch_pending_user_approval',
              'branch': 'feat/browser-rts-model-polish (not merged, not deployed)', 'user_approval': 'pending',
              'viewer': 'http://127.0.0.1:4394/games/rts/models/', 'contract': 'art-factory/rts/contracts/model-polish-2026-10-16.json',
              'records': apply, 'textures': 'art-factory/rts/runs/model-polish/2026-10-16-v1/qa/textures.json',
              'validator': 'art-factory/rts/runs/model-polish/2026-10-16-v1/qa/gltf-validator.json', 'models': models}
    (RUN / 'qa/review.json').write_text(json.dumps(review, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    PAGE.write_text(page(review), encoding='utf-8')
    print('review', len(models), 'models', sum(len(m['renders']) for m in models), 'renders')


def page(review):
    e = html.escape
    rows = []
    for m in review['models']:
        b, a = m['stats']['before'], m['stats']['after']
        def delta(k):
            return f"{b[k]:,} → {a[k]:,}"
        table = (f"<table><tr><th></th><th>修改前</th><th>修改後</th></tr>"
                 f"<tr><td>LOD0 三角面</td><td>{b['lod0_triangles']:,}</td><td>{a['lod0_triangles']:,}</td></tr>"
                 f"<tr><td>LOD1 三角面</td><td>{b['lod1_triangles']:,}</td><td>{a['lod1_triangles']:,}</td></tr>"
                 f"<tr><td>繪製批次</td><td>{b['draw_calls']}</td><td>{a['draw_calls']}</td></tr>"
                 f"<tr><td>材質</td><td>{b['materials']}</td><td>{a['materials']}</td></tr>"
                 f"<tr><td>貼圖</td><td>{e('、'.join(b['textures']))}</td><td>{e('、'.join(a['textures']))}</td></tr></table>")
        figs = ''.join(f"<figure><img loading=\"lazy\" src=\"../../../{e(f['file'])}\" alt=\"{e(m['name'])} {e(f['label'])} 修改前後\"><figcaption>{e(f['label'])}</figcaption></figure>" for f in m['renders'])
        rows.append(f"<section id=\"{e(m['id'])}\"><h2>{e(m['name'])} <code>{e(m['id'])}</code></h2><p>{e(m['note'])}</p>{table}<div class=\"figs\">{figs}</div></section>")
    nav = ''.join(f"<a href=\"#{e(m['id'])}\">{e(m['name'])}</a>" for m in review['models'])
    return f"""<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>模型精修審核</title>
<style>
:root{{--bg:#11191d;--panel:#16262b;--ink:#e9e4d6;--muted:#9fb0b3;--line:#2c4248;--accent:#d9b25f}}
body{{margin:0;background:var(--bg);color:var(--ink);font:15px/1.6 system-ui,"Noto Sans TC",sans-serif}}
main{{max-width:1320px;margin:0 auto;padding:24px 16px 48px}}h1{{font-size:1.5rem;margin:.2rem 0}}h2{{font-size:1.1rem;margin:2.2rem 0 .4rem;color:var(--accent)}}
p{{color:var(--muted);margin:.3rem 0}}code{{color:var(--muted);font-size:.8em}}.status{{display:inline-block;padding:.15rem .6rem;border:1px solid var(--accent);border-radius:999px;color:var(--accent);font-size:.8rem}}
nav{{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}}nav a{{color:var(--ink);background:var(--panel);border:1px solid var(--line);border-radius:4px;padding:.15rem .55rem;text-decoration:none;font-size:.85rem}}
table{{border-collapse:collapse;margin:.6rem 0;font-size:.85rem;background:var(--panel)}}td,th{{border:1px solid var(--line);padding:.25rem .6rem;text-align:left}}th{{color:var(--muted);font-weight:500}}
.figs{{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,620px),1fr));gap:12px}}figure{{margin:0}}figure img{{width:100%;height:auto;display:block;border:1px solid var(--line);border-radius:4px}}
figcaption{{font-size:.8rem;color:var(--muted);margin-top:2px}}
</style></head><body><main>
<h1>RTS 模型精修（武器・盾牌・兵營・城鎮大廳）</h1>
<p class="status">已發布到 feat/browser-rts-model-polish 分支 · 待使用者確認</p>
<p>即時檢視：<a href="{e(review['viewer'])}" style="color:var(--accent)">{e(review['viewer'])}</a>（切換單位／LOD／光照）。每張圖左為修改前、右為修改後，視角與姿勢相同。</p>
<p>來源：codex 內建生圖產生的原創材質原圖 → 確定性後處理（1024 貼圖、法線／金屬粗糙度推導、2048 裝備圖集）＋ 程式原生幾何。紀錄：<code>{e(review['contract'])}</code>、<code>{e(review['textures'])}</code>。</p>
<nav>{nav}</nav>
{''.join(rows)}
</main></body></html>
"""


if __name__ == '__main__':
    build()
