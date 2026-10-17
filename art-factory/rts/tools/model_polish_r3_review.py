"""Review pack for model polish round 3 (2026-10-17): before/after pairs, qa/review.json and the #round3 section of
art-factory/rts/review/model-polish-20261016.html. Status stays pending user approval.

Usage: python art-factory/rts/tools/model_polish_r3_review.py
Inputs: viewer captures tmp/rts/visual-model-polish/{r3-before,r3-after,r3-close,r3-close-after}/ (model_polish_capture.mjs,
model_polish_r3_closeup.mjs) and two game screenshots (production build, river map) passed via the run's
qa/game-zoom-{before,after}.jpg. Unit "before" for shields / crossbow is the right half of the 2026-10-16 review render
(same viewer, same framing).
"""
from pathlib import Path
import hashlib, html, json, re
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[3]
RUN = ROOT / 'art-factory/rts/runs/model-polish/2026-10-17-v1'
CAP = ROOT / 'tmp/rts/visual-model-polish'
OUT = RUN / 'qa/review-renders'
PAGE = ROOT / 'art-factory/rts/review/model-polish-20261016.html'
V1R = ROOT / 'art-factory/rts/runs/model-polish/2026-10-16-v1/qa/review-renders'


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def compose(ia, ib, out_name, w=560):
    h = round(ia.height * w / ia.width)
    canvas = Image.new('RGB', (w * 2 + 8, h + 28), (17, 25, 29))
    canvas.paste(ia.resize((w, h), Image.Resampling.LANCZOS), (0, 28)); canvas.paste(ib.resize((w, h), Image.Resampling.LANCZOS), (w + 8, 28))
    d = ImageDraw.Draw(canvas); d.text((8, 7), 'BEFORE', fill=(159, 176, 179)); d.text((w + 16, 7), 'AFTER', fill=(217, 178, 95))
    OUT.mkdir(parents=True, exist_ok=True); path = OUT / out_name
    canvas.save(path, quality=74, optimize=True)
    return path


def cap(phase, name):
    return Image.open(CAP / phase / f'{name}.png').convert('RGB')


def v1_after(name):
    im = Image.open(V1R / name).convert('RGB'); w = (im.width - 8) // 2
    return im.crop((w + 8, 28, im.width, im.height))


FIGS = [
    ('landmarks', '河關門樓 近景（石材 384→1024 風化石灰岩、木料 256→1024）', lambda: (cap('r3-before', 'river-gatehouse-studio-facade-close'), cap('r3-after', 'river-gatehouse-studio-facade-close')), 'r3-river-gatehouse-close.jpg'),
    ('landmarks', '河關門樓 遊戲視角', lambda: (cap('r3-before', 'river-gatehouse-game-game'), cap('r3-after', 'river-gatehouse-game-game')), 'r3-river-gatehouse-game.jpg'),
    ('landmarks', '河畔神龕 3/4', lambda: (cap('r3-before', 'river-shrine-studio-3q'), cap('r3-after', 'river-shrine-studio-3q')), 'r3-river-shrine-3q.jpg'),
    ('landmarks', '高地瞭望塔 近景', lambda: (cap('r3-before', 'highland-watchtower-studio-facade-close'), cap('r3-after', 'highland-watchtower-studio-facade-close')), 'r3-watchtower-close.jpg'),
    ('landmarks', '採石場遺跡 近景', lambda: (cap('r3-before', 'quarry-ruins-studio-facade-close'), cap('r3-after', 'quarry-ruins-studio-facade-close')), 'r3-quarry-close.jpg'),
    ('props', '金礦（岩塊細分＋平滑法線，礦石 384→1024）', lambda: (cap('r3-before', 'gold-mine-studio-3q'), cap('r3-after', 'gold-mine-studio-3q')), 'r3-gold-mine-3q.jpg'),
    ('props', '木材堆 近景（樹皮／年輪 384→1024）', lambda: (cap('r3-before', 'timber-pile-studio-facade-close'), cap('r3-after', 'timber-pile-studio-facade-close')), 'r3-timber-close.jpg'),
    ('props', '岩石（平滑法線，三角面不變）', lambda: (cap('r3-before', 'rock-studio-3q'), cap('r3-after', 'rock-studio-3q')), 'r3-rock-3q.jpg'),
    ('trees', '遊戲縮放下的橡樹林（production build，雙河谷地開局）', lambda: (Image.open(RUN / 'qa/game-zoom-before.jpg').convert('RGB').crop((560, 120, 960, 420)), Image.open(RUN / 'qa/game-zoom-after.jpg').convert('RGB').crop((560, 120, 960, 420))), 'r3-trees-game-zoom.jpg'),
    ('trees', '橡樹（遊戲視角，棚燈）', lambda: (cap('r3-before', 'oak-studio-game'), cap('r3-after', 'oak-studio-game')), 'r3-oak-game.jpg'),
    ('trees', '松樹（遊戲視角，棚燈）', lambda: (cap('r3-before', 'pine-studio-game'), cap('r3-after', 'pine-studio-game')), 'r3-pine-game.jpg'),
    ('nits', '衛兵盾 3/4：盾頂兩角的尖角摺痕移除、鉚釘改為凸起黃銅', lambda: (v1_after('guard-studio-KingdomSunShield-3q.jpg'), cap('r3-after', 'guard-studio-KingdomSunShield-3q')), 'r3-guard-shield-3q.jpg'),
    ('nits', '衛兵盾 正面', lambda: (v1_after('guard-studio-KingdomSunShield-front.jpg'), cap('r3-after', 'guard-studio-KingdomSunShield-front')), 'r3-guard-shield-front.jpg'),
    ('nits', '指揮官盾 3/4', lambda: (v1_after('commander-studio-CommanderDawnShield-3q.jpg'), cap('r3-after', 'commander-studio-CommanderDawnShield-3q')), 'r3-commander-shield-3q.jpg'),
    ('nits', '弩：橡木弩身由橘黃改胡桃色', lambda: (v1_after('crossbow-studio-ProceduralCrossbow-3q.jpg'), cap('r3-after', 'crossbow-studio-ProceduralCrossbow-3q')), 'r3-crossbow-3q.jpg'),
    ('nits', '工人右手背側極近距離：袖口內膚色碎片移除；斧柄改胡桃色', lambda: (cap('r3-close', 'worker-bone-Hand_R-Idle-0-back'), cap('r3-close-after', 'worker-bone-Hand_R-Idle-0-back')), 'r3-worker-hand-back.jpg'),
    ('nits', '工人右手側面極近距離', lambda: (cap('r3-close', 'worker-bone-Hand_R-Idle-0-right'), cap('r3-close-after', 'worker-bone-Hand_R-Idle-0-right')), 'r3-worker-hand-right.jpg'),
    ('nits', '兵營外牆：木構架（牆板梁、立柱、斜撐）＋窗框十字櫺與石窗台', lambda: (cap('r3-before', 'barracks-studio-3q'), cap('r3-after', 'barracks-studio-3q')), 'r3-barracks-3q.jpg'),
    ('nits', '兵營 側面近景', lambda: (cap('r3-before', 'barracks-studio-side-close'), cap('r3-after', 'barracks-studio-side-close')), 'r3-barracks-side.jpg'),
    ('nits', '兵營 遊戲視角', lambda: (cap('r3-before', 'barracks-game-game'), cap('r3-after', 'barracks-game-game')), 'r3-barracks-game.jpg'),
]
GROUPS = {'landmarks': '地標貼圖', 'props': '道具與輪廓', 'trees': '遠景樹冠', 'nits': '上一輪遺留問題'}


def build():
    figs = []
    for group, caption, load, name in FIGS:
        a, b = load(); p = compose(a, b, name)
        figs.append({'group': group, 'caption': caption, 'file': p.relative_to(ROOT).as_posix(), 'sha256': sha(p)})
    qa = RUN / 'qa'
    dl = {m: json.loads((qa / f'download-{m}.json').read_text(encoding='utf-8')) for m in ('river', 'pass')}
    review = {'id': 'model-polish-r3-2026-10-17', 'status': 'published to branch feat/browser-rts-model-polish; awaiting user approval',
              'user_overall_art_acceptance': 'pending', 'figures': figs,
              'records': sorted(p.relative_to(ROOT).as_posix() for p in qa.glob('*.json') if p.name != 'review.json'),
              'download_first_map_encoded_bytes': {m: d['assetEncodedBytes'] for m, d in dl.items()}}
    (qa / 'review.json').write_text(json.dumps(review, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    return review


def section(review):
    e = html.escape
    d = review['download_first_map_encoded_bytes']
    parts = ['<section id="round3"><h2>第三輪精修（2026-10-17）</h2>',
             '<p>地標／道具貼圖升到 1024 並改為全圖共用（每張圖整場只下載一次）、金礦輪廓、遠景樹冠密度、上一輪遺留的盾牌鉚釘與盾角摺痕、木柄偏黃、兵營立面、工人袖口，以及首圖下載量。每張圖左為修改前、右為修改後。</p>',
             '<table><tr><th>首圖下載（production build，本機 gzip）</th><th>修改前</th><th>修改後</th><th>上限</th></tr>',
             f'<tr><td>雙河谷地</td><td>65.70 MB（polish-v1 貼圖每個 GLB 各下載一次）</td><td>{d["river"] / 1e6:.2f} MB</td><td>35 MB</td></tr>',
             f'<tr><td>灰脊隘口</td><td>66.25 MB</td><td>{d["pass"] / 1e6:.2f} MB</td><td>35 MB</td></tr></table>',
             '<p>來源：地標風化石灰岩為本輪 codex 內建生圖原創材質（<code>raw/weathered-limestone-face-a1.png</code>，提示詞與 sha256 見 <code>.gen.json</code>）；樹皮、年輪、金礦石、硬木皆由原本就在版本庫的 1254 px 原創材質原圖確定性重新導出 1024；裝備圖集只把橡木格調成胡桃色。紀錄：<code>art-factory/rts/runs/model-polish/2026-10-17-v1/qa/</code>。</p>']
    for g, label in GROUPS.items():
        parts.append(f'<h3 style="color:var(--muted);font-size:1rem;margin-top:1.4rem">{e(label)}</h3><div class="figs">')
        for f in (x for x in review['figures'] if x['group'] == g):
            parts.append(f'<figure><img loading="lazy" src="../../../{e(f["file"])}" alt="{e(f["caption"])} 修改前後"><figcaption>{e(f["caption"])}</figcaption></figure>')
        parts.append('</div>')
    parts.append('<p>未解：兵營沒有門洞（開放中庭），所以「門框」無從加上，改為木構架與窗框；死亡動畫的盾牌貼近量測為 0（24 格、8 mm），但檢視間的動畫選單在自動截圖中未切到 Death，死亡姿勢的近拍沒有截到。</p></section>')
    return ''.join(parts)


def page(review):
    text = PAGE.read_bytes().decode('utf-8'); crlf = '\r\n' in text; t = text.replace('\r\n', '\n')
    t = re.sub(r'<section id="round3">.*?</section>', '', t, flags=re.S)
    if 'href="#round3"' not in t:
        t = t.replace('<nav><a href="#hands">', '<nav><a href="#round3">第三輪精修</a><a href="#hands">', 1)
    t = t.replace('<h1>RTS 模型精修（武器・盾牌・兵營・城鎮大廳・手部）</h1>', '<h1>RTS 模型精修（武器・盾牌・兵營・城鎮大廳・手部・地標道具）</h1>', 1)
    i = t.index('<section ')
    t = t[:i] + section(review) + t[i:]
    PAGE.write_bytes((t.replace('\n', '\r\n') if crlf else t).encode('utf-8'))


if __name__ == '__main__':
    r = build(); page(r); print(len(r['figures']), 'figures', r['download_first_map_encoded_bytes'])
