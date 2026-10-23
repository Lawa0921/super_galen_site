"""review_faces.py: build art-factory/starlantern/runs/<run>/review.html for talking-face candidates (faces.py).

  python review_faces.py RUN ID [ID ...]      every candidate of the ids beside the normal portrait (sample runs)
  python review_faces.py wave RUN               the registry picks of faces.WAVE1, grouped by character, + montage.png at 3x
  python review_faces.py wave2 RUN              wave 2: Lorne's and Rin's new faces beside their normal, and the four redos as
                                                old approved | new candidate | normal, + montage.png at 3x

Every postprocessed candidate (work/<id>/cand/a<N>/) beside that character's published normal portrait, at natural size
and at 2x pixelated, with the mood it covers, one story line it would go with, and its QA (sl_art) and match QA (faces).
Images are copied into runs/<run>/img/ so the page opens from disk. Read-only for public/ and the registry.
"""
import html, json, shutil, sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
AF = REPO / 'art-factory/starlantern'
PUB = REPO / 'public/assets/games/starlantern/char'
NAMES = {'hero': '洛恩', 'rin': '凜', 'rin-oath': '凜（誓約後）', 'scarlet': '絲嘉蕾', 'chizuru': '千鶴', 'selene': '瑟蕾', 'safira': '莎菲拉', 'sylvie': '希爾薇', 'noel': '諾艾兒', 'bobby': '波比', 'liz': '莉茲'}
MOOD = {'serious': 'serious 嚴肅', 'sad': 'sad 難過'}
# One story line per face (data/story.zh-TW.ts; scene in brackets) and the hidden lines it would unhide (survey).
LINES = {
    'char-scarlet-portrait-serious': ('「洛恩，從今天起，我站這裡。」', 'mem:scarlet:5', 18),
    'char-scarlet-portrait-sad': ('「我立誓守護的人，是公主殿下。她總是不讓我這樣叫她。」', 'mem:scarlet:4', 3),
    'char-chizuru-portrait-serious': ('「道歉不必。但請容我，生氣一刻鐘。」', 'banter:bobby-chizuru:2', 5),
    'char-chizuru-portrait-sad': ('「封印……沒有念完。最後一句，凍在嘴裡了。」', 'mem:chizuru:2', 4),
}
CSS = """
:root{color-scheme:dark;--bg:#16182a;--card:#22253a;--ink:#e6e6f0;--dim:#9a9cb4;--ok:#7fd49a;--bad:#ff8a8a;--warn:#ffd27a}
body{margin:0;padding:16px;background:var(--bg);color:var(--ink);font:15px/1.6 system-ui,"Noto Sans TC",sans-serif}
a{color:#9ec5ff}a{color:#9ec5ff}h1{font-size:20px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 8px}p.note{color:var(--dim);margin:0 0 12px;max-width:70em}
.card{background:var(--card);border-radius:8px;padding:12px;margin:0 0 14px}
.pair{display:flex;flex-wrap:wrap;gap:20px;align-items:flex-end}.pair+.pair{margin-top:14px}
figure{margin:0;text-align:center}figcaption{color:var(--dim);font-size:13px}
.px{image-rendering:pixelated}.chk{background:repeating-conic-gradient(#2c2f48 0 25%,#262940 0 50%) 0 0/16px 16px;display:inline-block;padding:6px}
.line{margin:10px 0 2px;font-size:16px}.qa{font-size:13px;color:var(--dim)}.ok{color:var(--ok)}.bad{color:var(--bad)}.warn{color:var(--warn)}
"""


def _copy(src, dst_dir, name):
    shutil.copyfile(src, dst_dir / name); return f'img/{name}'


def _fig(src, w, h, label):
    return (f'<figure><div class="chk"><img class="px" src="{src}" width="{w}" height="{h}" alt="{html.escape(label)}"></div>'
            f'<figcaption>{html.escape(label)}</figcaption></figure>')


def _qa(q, m):
    def mark(ok): return '<span class="ok">通過</span>' if ok else '<span class="bad">未通過</span>'
    w = (q.get('warnings') or []) + (m.get('warnings') or [])
    return (f'機械 QA {mark(q["pass"])}{"（" + "、".join(q["reasons"]) + "）" if q["reasons"] else ""}：magenta 殘留 {q.get("residue")}、半透明 {q.get("semi")}、'
            f'碰邊 {q.get("edge")}（只允許底邊）、封閉洞 {q.get("holes")}｜對照 normal {mark(m["pass"])}'
            f'{"（" + "、".join(m["reasons"]) + "）" if m["reasons"] else ""}：尺寸 {q["size"][0]}×{q["size"][1]}，normal {m["base_size"][0]}×{m["base_size"][1]}'
            f'（差 {m["size_delta"][0]:+d}, {m["size_delta"][1]:+d}），block {m["block"]}／{m["base_block"]}，normal 色盤佔 {m["palette_share"]:.0%}'
            + (f'｜<span class="warn">警告：{"、".join(w)}</span>' if w else ''))


def main(run, ids):
    out = AF / 'runs' / run; img = out / 'img'; img.mkdir(parents=True, exist_ok=True)
    body = []
    for aid in ids:
        cid, mood = aid.split('-')[1], aid.rsplit('-', 1)[1]
        base = PUB / f'{cid}-portrait.png'
        from PIL import Image
        bw, bh = Image.open(base).size; bsrc = _copy(base, img, f'{cid}-portrait.png')
        text, scene, hidden = LINES[aid]
        cands = sorted((AF / 'work' / aid / 'cand').glob('a*'), key=lambda p: int(p.name[1:])) if (AF / 'work' / aid / 'cand').exists() else []
        body.append(f'<h2>{NAMES[cid]}｜{MOOD[mood]}</h2>')
        shown = [c for c in cands if (c / f'{aid}.png').exists()]
        line = (f'<p class="line">表情：{MOOD[mood]}｜搭配台詞：{html.escape(text)} '
                f'<span class="qa">（{scene}；這個表情目前隱藏 {hidden} 句）</span></p>')
        if not shown:
            body.append(f'<div class="card"><div class="pair">{_fig(bsrc, bw, bh, "normal（已發佈）原尺寸")}{_fig(bsrc, bw * 2, bh * 2, "normal 2×")}</div>'
                        f'{line}<p class="qa bad">還沒有候選（原因見同資料夾的 notes.md）。</p></div>')
            continue
        natural, double, qas = [_fig(bsrc, bw, bh, 'normal（已發佈）')], [_fig(bsrc, bw * 2, bh * 2, 'normal 2×')], []
        for c in shown:
            png = c / f'{aid}.png'
            q = json.loads((c / f'{aid}.qa.json').read_text(encoding='utf-8')); m = json.loads((c / f'{aid}.match.json').read_text(encoding='utf-8'))
            gen = json.loads((c / 'cand-registry.json').read_text(encoding='utf-8'))['assets'].get(aid, {}).get('generator', '?')
            label = f'{gen.split("/")[0]} {c.name}'
            w, h = Image.open(png).size; src = _copy(png, img, f'{aid}-{c.name}.png')
            natural.append(_fig(src, w, h, label)); double.append(_fig(src, w * 2, h * 2, f'{label} 2×'))
            qas.append(f'<p class="qa"><b>{html.escape(gen)} {c.name}</b>：{_qa(q, m)}</p>')
        body.append(f'<div class="card"><div class="pair">{"".join(natural)}</div><div class="pair">{"".join(double)}</div>{line}{"".join(qas)}</div>')
    page = ('<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            f'<title>對話表情樣本</title><style>{CSS}</style></head><body>'
            '<h1>星燈迷宮｜夥伴對話表情樣本（serious、sad）</h1>'
            '<p class="note">每個表情一張卡：第一列原尺寸、第二列 2× 像素放大，由左到右是已發佈的 normal 頭貼、各生成器的候選（標籤是生成器與次數）。請看：是不是同一個人（臉、髮型、服裝、配色）、大小與構圖是否一致、表情配上那句台詞對不對。'
            '這些圖還沒進遊戲（不在 public/），選定與核准後才發佈。</p>' + ''.join(body) + '</body></html>')
    (out / 'review.html').write_text(page, encoding='utf-8'); print(out / 'review.html')


# Wave 1: per face, the mood tag it covers, how many script lines use it (survey), and one real line (scene).
WAVE_LINES = {
    'char-scarlet-portrait-serious': (18, '「洛恩，從今天起，我站這裡。」', 'mem:scarlet:5'),
    'char-scarlet-portrait-sad': (3, '「我立誓守護的人，是公主殿下。她總是不讓我這樣叫她。」', 'mem:scarlet:4'),
    'char-scarlet-portrait-vow': (8, '「凜小姐，請退後三步。這一次，誰也別想從他背後過去。」', 'rin-confess'),
    'char-scarlet-portrait-shaken': (5, '「我轉身了。……在城門最需要我的時候，我逃了。」', 'mem:scarlet:3'),
    'char-chizuru-portrait-serious': (5, '「道歉不必。但請容我，生氣一刻鐘。」', 'banter:bobby-chizuru:2'),
    'char-chizuru-portrait-sad': (4, '「封印……沒有念完。最後一句，凍在嘴裡了。」', 'mem:chizuru:2'),
    'char-chizuru-portrait-solemn': (17, '「洛恩大人，『站得起來嗎？』是活人對我說的第一句。鈴在此處，此處便是神社。謹以此段，奉於燈前。」', 'finale'),
    'char-sylvie-portrait-serious': (11, '「不用。松鼠，回樹上去。箭筒要滿，只剩一支的時候，什麼都護不住。」', 'chat:sylvie:1'),
    'char-sylvie-portrait-sad': (4, '「我沒守住。……林子死了，我還活著。」', 'mem:sylvie:2'),
    'char-selene-portrait-sad': (3, '「凜，插在背後的那把刀……我早就看見了。是我一直沒有說出口。」', 'mem:selene:5'),
    'char-selene-portrait-wistful': (8, '「那個人的臉，我沒有看清楚。也許是我不敢看吧。」', 'mem:selene:2'),
    'char-safira-portrait-sad': (7, '「小洛，那座城……是我先看見的。」', 'mem:safira:2'),
    'char-bobby-portrait-serious': (2, '「洛恩哥，那時候我沒敢問：祖先到底做錯了什麼？」', 'mem:bobby:2'),
    'char-bobby-portrait-sad': (5, '「這些機兵，是我家的人造的。每修好一台，就像替祖先道一次歉。」', 'mem:bobby:4'),
    'char-liz-portrait-serious': (2, '「所以這一路，妳一直欠我們一句實話。我們背靠背打的時候，妳的刀朝著哪邊？」', 'rin-confess'),
    'char-liz-portrait-sad': (3, '「帽子留在門後了。說好了，回家再戴。」', 'mem:liz:3'),
    'char-liz-portrait-hushed': (8, '「可是揉我頭髮的那個人，臉是一片霧。」', 'mem:liz:1'),
    'char-noel-portrait-sad': (2, '「老師不教我，不是小氣，是怕我把自己燒光。」', 'mem:noel:4'),
}
MOOD_ZH = {'serious': '嚴肅', 'sad': '難過', 'vow': '起誓', 'shaken': '動搖', 'solemn': '祈禱', 'wistful': '欲言又止', 'hushed': '突然安靜'}


def wave(run):
    import faces as F
    from PIL import Image, ImageDraw
    reg = json.loads((AF / 'registry.json').read_text(encoding='utf-8'))['assets']
    out = AF / 'runs' / run; img = out / 'img'; img.mkdir(parents=True, exist_ok=True)
    body, tiles = [], []
    for cid in F.WAVE1:
        base = PUB / f'{cid}-portrait.png'; bw, bh = Image.open(base).size; bsrc = _copy(base, img, f'{cid}-portrait.png')
        body.append(f'<h2>{NAMES[cid]} {cid}</h2>')
        for mood in F.WAVE1[cid]:
            aid = f'char-{cid}-portrait-{mood}'; e = reg.get(aid, {})
            n, text, scene = WAVE_LINES[aid]
            if not (e.get('final') and e.get('chosen_attempt') and (REPO / e['final']).exists()):
                body.append(f'<div class="card"><p class="qa bad">{aid}：沒有選定的候選。</p></div>'); continue
            png = REPO / e['final']; w, h = Image.open(png).size; src = _copy(png, img, f'{aid}.png')
            tiles.append((f'{cid} {mood}', Image.open(png).convert('RGBA')))
            q, m = e['qa'], e.get('match', {})
            label = f'{mood} {MOOD_ZH[mood]}（{e.get("generator", "?")} {e["chosen_attempt"]}）'
            figs = [_fig(bsrc, bw, bh, 'normal（已發佈）'), _fig(src, w, h, label), _fig(bsrc, bw * 2, bh * 2, 'normal 2×'), _fig(src, w * 2, h * 2, f'{mood} 2×')]
            body.append(f'<div class="card"><div class="pair">{"".join(figs)}</div>'
                        f'<p class="line">表情標籤：<b>{mood}</b>（劇本 {n} 句）｜台詞：{html.escape(text)} <span class="qa">（{scene}）</span></p>'
                        f'<p class="qa">{_qa(q, m) if m else ""}</p></div>')
    cw = max(t[1].width for t in tiles) + 8; ch = max(t[1].height for t in tiles) + 14; cols = 6
    rows = (len(tiles) + cols - 1) // cols
    can = Image.new('RGBA', (cols * cw, rows * ch), (34, 36, 56, 255)); d = ImageDraw.Draw(can)
    for k, (lab, im) in enumerate(tiles):
        x, y = (k % cols) * cw, (k // cols) * ch
        can.alpha_composite(im, (x + (cw - im.width) // 2, y + ch - 12 - im.height)); d.text((x + 3, y + ch - 12), lab, fill=(220, 220, 230, 255))
    can.resize((can.width * 3, can.height * 3), Image.NEAREST).save(out / 'montage.png')
    page = ('<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            f'<title>對話表情第一輪</title><style>{CSS}</style></head><body>'
            f'<h1>星燈迷宮｜夥伴對話表情第一輪（{len(tiles)} 張）</h1>'
            '<p class="note">依角色分組。每張表情：已發佈的 normal 頭貼、新表情（原尺寸），再兩張 2× 像素放大；下面是它對應的表情標籤與一句實際會用到的台詞。'
            '全部由 codex 生成；還沒進遊戲（不在 public/），核准後才發佈。所有表情的 3× 總覽：<a href="montage.png">montage.png</a>。</p>'
            + ''.join(body) + '</body></html>')
    (out / 'review.html').write_text(page, encoding='utf-8'); print(out / 'review.html'); print(out / 'montage.png')


# Wave 2: per face, one real line it will be shown on (data/story.zh-TW.ts; scene) and what it replaces today.
WAVE2_LINES = {
    'char-hero-portrait-serious': ('serious', '「拿刀的那個人，手在發抖。……他們在怕什麼？」', 'mem:hero:7'),
    'char-hero-portrait-distant': ('distant', '「『艾斯特拉之燈，收逝者之記憶，點之為光，長明不滅。』」', 'act4'),
    'char-rin-portrait-serious': ('serious', '「洛恩，我是被派來殺你的。可是我不殺了──這是我自己決定的。」', 'rin-reveal'),
    'char-rin-portrait-guarded': ('guarded', '「不認識。我什麼都不記得，現在只能跟著你。你說了三次夢話，很吵。」', 'prologue-inn'),
    'char-rin-oath-portrait-serious': ('serious', '「這一次，不是一個人。你下去的地方，我也去。」', 'chat:hero:4（誓約後）'),
    'char-rin-oath-portrait-guarded': ('guarded', '「那枚鐘，我敲平了。洛恩，站到我後面。」', 'bellkeeper-arrives'),
    'char-scarlet-portrait-vow': ('vow', '「凜小姐，請退後三步。這一次，誰也別想從他背後過去。」', 'rin-confess'),
    'char-selene-portrait-wistful': ('wistful', '「那個人的臉，我沒有看清楚。也許是我不敢看吧。」', 'mem:selene:2'),
    'char-noel-portrait-sad': ('sad', '「老師不教我，不是小氣，是怕我把自己燒光。」', 'mem:noel:4'),
    'char-bobby-portrait-sad': ('sad', '「這些機兵，是我家的人造的。每修好一台，就像替祖先道一次歉。」', 'mem:bobby:4'),
}
WAVE2_NOW = {'hero': '現在：重場景不顯示頭貼（normal 帶微笑）', 'rin': '現在：退回平靜的 normal', 'rin-oath': '現在：退回平靜的 normal'}
WAVE2_WHY = {
    'char-scarlet-portrait-vow': '第一輪太像 serious，手按胸口在原尺寸看不出來。',
    'char-selene-portrait-wistful': '第一輪太像 sad；這次要柔和、遠望的淺笑，懷念而不是要哭。',
    'char-noel-portrait-sad': '第一輪太淡；這次照加強版 sad 再加重眉、淚、嘴角。',
    'char-bobby-portrait-sad': '第一輪太淡；這次照加強版 sad 再加重眉、淚、嘴角。',
}
MOOD_ZH.update({'distant': '出神', 'guarded': '戒備'})


def _cands(aid):
    d = AF / 'work' / aid / 'cand'
    return [c for c in sorted(d.glob('a*'), key=lambda p: int(p.name[1:])) if (c / f'{aid}.png').exists()] if d.exists() else []


def _cand_qa(aid, c):
    q = json.loads((c / f'{aid}.qa.json').read_text(encoding='utf-8')); m = json.loads((c / f'{aid}.match.json').read_text(encoding='utf-8'))
    gen = json.loads((c / 'cand-registry.json').read_text(encoding='utf-8'))['assets'].get(aid, {}).get('generator', '?')
    return q, m, gen


def _montage(tiles, path):
    from PIL import Image, ImageDraw
    cw = max(t[1].width for t in tiles) + 8; ch = max(t[1].height for t in tiles) + 14; cols = 6
    rows = (len(tiles) + cols - 1) // cols
    can = Image.new('RGBA', (cols * cw, rows * ch), (34, 36, 56, 255)); d = ImageDraw.Draw(can)
    for k, (lab, im) in enumerate(tiles):
        x, y = (k % cols) * cw, (k // cols) * ch
        can.alpha_composite(im, (x + (cw - im.width) // 2, y + ch - 12 - im.height)); d.text((x + 3, y + ch - 12), lab, fill=(220, 220, 230, 255))
    can.resize((can.width * 3, can.height * 3), Image.NEAREST).save(path)


def wave2(run):
    import faces as F
    from PIL import Image
    reg = json.loads((AF / 'registry.json').read_text(encoding='utf-8'))['assets']
    out = AF / 'runs' / run; img = out / 'img'; img.mkdir(parents=True, exist_ok=True)
    body, tiles = [], []
    jobs = F.jobs(wave=2)
    new = [j for j in jobs if j['id'] not in F.REDO]; redo = [j for j in jobs if j['id'] in F.REDO]
    body.append('<h2>一、洛恩與凜的新表情</h2>')
    for j in new:
        aid, cid = j['id'], j['cid']; mood, text, scene = WAVE2_LINES[aid]
        base = PUB / f'{cid}-portrait.png'; bw, bh = Image.open(base).size; bsrc = _copy(base, img, f'{cid}-portrait.png')
        tiles.append((f'{cid} normal', Image.open(base).convert('RGBA')))
        nat, dbl, qas = [_fig(bsrc, bw, bh, 'normal（已發佈）')], [_fig(bsrc, bw * 2, bh * 2, 'normal 2×')], []
        for c in _cands(aid):
            png = c / f'{aid}.png'; w, h = Image.open(png).size; src = _copy(png, img, f'{aid}-{c.name}.png')
            q, m, gen = _cand_qa(aid, c)
            nat.append(_fig(src, w, h, f'{mood} {MOOD_ZH[mood]}（{c.name}）')); dbl.append(_fig(src, w * 2, h * 2, f'{mood} {c.name} 2×'))
            qas.append(f'<p class="qa"><b>{html.escape(gen)} {c.name}</b>：{_qa(q, m)}</p>')
            tiles.append((f'{cid} {mood} {c.name}', Image.open(png).convert('RGBA')))
        if len(nat) == 1: qas.append('<p class="qa bad">沒有候選（見 notes.md）。</p>')
        body.append(f'<div class="card"><h3>{NAMES[cid]}｜{mood} {MOOD_ZH[mood]}</h3><div class="pair">{"".join(nat)}</div><div class="pair">{"".join(dbl)}</div>'
                    f'<p class="line">台詞：{html.escape(text)} <span class="qa">（{scene}；{WAVE2_NOW[cid]}）</span></p>{"".join(qas)}</div>')
    body.append('<h2>二、第一輪重做（舊的核准版仍在遊戲裡，等你選）</h2>')
    for j in redo:
        aid, cid = j['id'], j['cid']; mood, text, scene = WAVE2_LINES[aid]
        base = PUB / f'{cid}-portrait.png'; bw, bh = Image.open(base).size; bsrc = _copy(base, img, f'{cid}-portrait.png')
        old = PUB / f'{cid}-portrait-{mood}.png'; ow, oh = Image.open(old).size; osrc = _copy(old, img, f'{aid}-approved.png')
        e = reg.get(aid, {})
        nat, dbl, qas = [_fig(osrc, ow, oh, f'舊：核准版 {e.get("chosen_attempt", "?")}')], [_fig(osrc, ow * 2, oh * 2, '舊 2×')], []
        tiles.append((f'{cid} {mood} old', Image.open(old).convert('RGBA')))
        for c in _cands(aid):
            if e.get('chosen_attempt') == c.name: continue
            png = c / f'{aid}.png'; w, h = Image.open(png).size; src = _copy(png, img, f'{aid}-{c.name}.png')
            q, m, gen = _cand_qa(aid, c)
            nat.append(_fig(src, w, h, f'新候選 {c.name}')); dbl.append(_fig(src, w * 2, h * 2, f'新 {c.name} 2×'))
            qas.append(f'<p class="qa"><b>{html.escape(gen)} {c.name}</b>：{_qa(q, m)}</p>')
            tiles.append((f'{cid} {mood} new {c.name}', Image.open(png).convert('RGBA')))
        if len(nat) == 1: qas.append('<p class="qa bad">沒有新候選（見 notes.md）。</p>')
        nat.append(_fig(bsrc, bw, bh, 'normal')); dbl.append(_fig(bsrc, bw * 2, bh * 2, 'normal 2×'))
        body.append(f'<div class="card"><h3>{NAMES[cid]}｜{mood} {MOOD_ZH[mood]}</h3><div class="pair">{"".join(nat)}</div><div class="pair">{"".join(dbl)}</div>'
                    f'<p class="line">台詞：{html.escape(text)} <span class="qa">（{scene}）</span></p><p class="qa">重做原因：{WAVE2_WHY[aid]}</p>{"".join(qas)}</div>')
    _montage(tiles, out / 'montage.png')
    page = ('<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            f'<title>對話表情第二輪</title><style>{CSS}h3{{font-size:15px;margin:0 0 8px}}</style></head><body>'
            '<h1>星燈迷宮｜對話表情第二輪</h1>'
            '<p class="note">第一部分：洛恩與凜（兩套：鈴鐺有裂痕的凜、誓約後鈴鐺敲平的凜）的 serious／distant／guarded，每張和該角色已發佈的 normal 並排，原尺寸與 2× 像素放大，附一句實際會用到的台詞。'
            '第二部分：第一輪比較弱的四張重做一次，舊的核准版、新候選、normal 並排。全部由 codex 生成；還沒進遊戲（不在 public/），核准後才發佈。'
            '全部的 3× 總覽：<a href="montage.png">montage.png</a>。</p>' + ''.join(body) + '</body></html>')
    (out / 'review.html').write_text(page, encoding='utf-8'); print(out / 'review.html'); print(out / 'montage.png')


if __name__ == '__main__':
    if sys.argv[1] == 'wave2':
        wave2(sys.argv[2])
    elif sys.argv[1] == 'wave':
        wave(sys.argv[2])
    else:
        main(sys.argv[1], sys.argv[2:])
