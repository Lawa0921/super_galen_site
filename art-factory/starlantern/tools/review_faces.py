"""review_faces.py: build art-factory/starlantern/runs/<run>/review.html for talking-face candidates (faces.py).

  python review_faces.py RUN ID [ID ...]      every candidate of the ids beside the normal portrait (sample runs)
  python review_faces.py wave RUN               the registry picks of faces.WAVE1, grouped by character, + montage.png at 3x
  python review_faces.py wave2 RUN              wave 2: Lorne's and Rin's new faces beside their normal, and the four redos as
                                                old approved | new candidate | normal, + montage.png at 3x
  python review_faces.py wave3 RUN              wave 3: Safira's serious and Noel's pout beside every face each has, Selene's
                                                third wistful beside the live a1, and the five once-hidden lines in the game's
                                                dialogue box (before | after), + montage.png at 3x
  python review_faces.py wave4 RUN              wave 4 sample (affinity plan Task A): four faces beside every face each has,
                                                their script lines in the dialogue box (borrowed face | new), and the whole
                                                14-face set with the lines and uses each serves, + montage.png at 3x
  python review_faces.py wave4-final RUN        wave 4 after publishing: all 14, every attempt with the chosen one marked,
                                                + montage.png of the 14 published faces at 3x

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


# Wave 3: the five lines of heavy scenes that showed no portrait before it (ui2/storyFaces.test.ts 'heavy hidden': 5), as
# (scene, speaker, mood tag, text, the wave-3 face that shows it). The finale's two Noel lines are alternatives: the first
# plays when act 2's group scene was seen, the second when it was not.
WAVE3_HIDDEN = [
    ('mem:safira:4', 'safira', 'surprised', '「做決定的……不是我？」', 'char-safira-portrait-serious'),
    ('mem:noel:1', 'noel', 'pout', '「幹嘛那樣看我。是借的啦，只是沒說一聲。」', 'char-noel-portrait-pout'),
    ('mem:noel:2', 'noel', 'pout', '「小氣鬼。老師一定是怕我太厲害。」', 'char-noel-portrait-pout'),
    ('finale', 'noel', 'pout', '「袖子裡這一片，藏到今天了。拿去吧，本小姐自己交出去。」', 'char-noel-portrait-pout'),
    ('finale', 'noel', 'pout', '「旅館的燈一暗，都是本小姐點小雷光，你每次都說剛好。這次不點雷光了，這一段，本小姐親手交出去。」', 'char-noel-portrait-pout'),
]


STORY = REPO / 'src/scripts/games/starlantern/data/story.zh-TW.ts'


def script_lines(who, mood):
    """Every line of the script (data/story.zh-TW.ts) that `who` says with `mood`, as (scene, text, condition): the scene key
    the line sits under ('night beat' for NIGHT_BEATS), and the line's `if: {...}` body ('' when it has none)."""
    import re
    scene, out = '', []
    obj = re.compile(r"who: '([\w-]+)', mood: '(\w+)', text: '([^']*)'(?:, if: \{ ([^}]*) \})?")
    beat = re.compile(r"^\s*[JQ]\('([\w-]+)', '([^']*)', '(\w+)'\)")
    table = ''
    for ln in STORY.read_text(encoding='utf-8').splitlines():
        m = re.match(r'^(?:export )?const (\w+)', ln)
        if m: table, scene = m.group(1), ''
        m = re.match(r"^  '?([\w:-]+)'?: \{", ln)
        if m: scene = f'{table.lower()}:{m.group(1)}' if table in ('MEET', 'HOME') else m.group(1)   # MEET.noel -> meet:noel
        m = beat.match(ln)
        if m and m.group(1) == who and m.group(3) == mood: out.append(('night beat', m.group(2), ''))
        m = obj.search(ln)
        if m and m.group(1) == who and m.group(2) == mood: out.append((scene, m.group(3), (m.group(4) or '').strip()))
    return out


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
        if not any(t[0] == f'{cid} normal' for t in tiles): tiles.append((f'{cid} normal', Image.open(base).convert('RGBA')))
        nat, dbl, qas = [_fig(bsrc, bw, bh, 'normal（已發佈）')], [_fig(bsrc, bw * 2, bh * 2, 'normal 2×')], []
        for c in _cands(aid):
            png = c / f'{aid}.png'; w, h = Image.open(png).size; src = _copy(png, img, f'{aid}-{c.name}.png')
            q, m, gen = _cand_qa(aid, c)
            pick = '，選定' if reg.get(aid, {}).get('chosen_attempt') == c.name else ''
            nat.append(_fig(src, w, h, f'{mood} {MOOD_ZH[mood]}（{c.name}{pick}）')); dbl.append(_fig(src, w * 2, h * 2, f'{mood} {c.name}{pick} 2×'))
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


BATTLE = {'attack', 'hit', 'dying', 'down', 'ultimate'}
MOOD_ZH.update({'pout': '嘟嘴賭氣', 'surprised': '驚訝'})
# The game's dialogue box (src/styles/_starlantern-ui.scss: .slx-screen, .slx-win, .slx-talk, .slx-name, .slx-talk-face,
# the skinned frame), copied by value: a 640x360 stage at 1x, 12px Cubic 11, the portrait 192px on the box's top edge.
STAGE_CSS = """
@font-face{font-family:'Cubic 11';src:url('../../../../public/assets/fonts/cubic-11/Cubic_11.woff2') format('woff2')}
.stages{display:flex;flex-wrap:wrap;gap:16px;overflow-x:auto}.stages figure{text-align:left}
.slx-screen{position:relative;width:640px;height:360px;overflow:hidden;background:#05060c;color:#f1ead8;font:12px/16px 'Cubic 11','Noto Sans TC','Microsoft JhengHei',sans-serif;image-rendering:pixelated;flex:none}
.slx-scene{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 30%,#1d2340,#05060c 70%)}
.slx-win{position:absolute;background:rgb(10,14,34);border:8px solid transparent;border-image:url('img/window.png') 7% / 8px round;box-shadow:0 2px 8px rgba(0,0,0,.5);padding:6px 8px}
.slx-talk{left:12px;right:12px;bottom:10px;min-height:52px;padding:10px 12px 8px}
.slx-name{position:absolute;top:-9px;left:10px;padding:0 6px;background:rgb(10,14,34);border:1px solid #c9a35a;color:#e8c46a}
.slx-text{margin:0}
.slx-talk-face{position:absolute;bottom:calc(100% + 12px);width:192px;height:192px;object-fit:contain;image-rendering:pixelated}
.slx-talk-face--left{left:10px}.slx-talk-face--right{right:10px}
"""


def _published(cid):
    """The character's talking faces in public/ (normal first), not the battle set."""
    faces = [(m, PUB / f'{cid}-portrait-{m}.png') for m in sorted(p.stem.split('-portrait-', 1)[1] for p in PUB.glob(f'{cid}-portrait-*.png'))
             if m not in BATTLE]
    return [('normal', PUB / f'{cid}-portrait.png')] + faces


def _stage(name, text, face_src, side):
    img = f'<img class="slx-talk-face slx-talk-face--{side}" src="{face_src}" alt="">' if face_src else ''
    return (f'<div class="slx-screen"><div class="slx-scene"></div><div class="slx-win slx-talk">{img}'
            f'<span class="slx-name">{html.escape(name)}</span><p class="slx-text">{html.escape(text)}</p></div></div>')


def wave3(run):
    """Wave 3: Safira's serious and Noel's pout beside every face each already has, Selene's third wistful beside the live
    a1 (and the rejected a2), and the five once-hidden lines in the game's dialogue box, before and after."""
    import faces as F
    from PIL import Image
    out = AF / 'runs' / run; img = out / 'img'; img.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(REPO / 'public/assets/games/starlantern/ui/window.png', img / 'window.png')
    body, tiles, best = [], [], {}
    jobs = F.jobs(wave=3)
    new = [j for j in jobs if j['id'] not in F.WAVE3_REDO]; redo = [j for j in jobs if j['id'] in F.WAVE3_REDO]
    body.append('<h2>一、新表情（和該角色已有的每張臉並排）</h2>')
    for j in new:
        aid, cid, mood = j['id'], j['cid'], j['mood']
        nat, dbl, qas = [], [], []
        for m, p in _published(cid):
            w, h = Image.open(p).size; src = _copy(p, img, p.name)
            nat.append(_fig(src, w, h, f'{m}（已發佈）')); dbl.append(_fig(src, w * 2, h * 2, f'{m} 2×'))
            tiles.append((f'{cid} {m}', Image.open(p).convert('RGBA')))
        for c in _cands(aid):
            png = c / f'{aid}.png'; w, h = Image.open(png).size; src = _copy(png, img, f'{aid}-{c.name}.png')
            q, m, gen = _cand_qa(aid, c)
            nat.append(_fig(src, w, h, f'新 {mood} {MOOD_ZH[mood]}（{c.name}）')); dbl.append(_fig(src, w * 2, h * 2, f'新 {mood} {c.name} 2×'))
            qas.append(f'<p class="qa"><b>{html.escape(gen)} {c.name}</b>：{_qa(q, m)}</p>')
            tiles.append((f'{cid} {mood} {c.name}', Image.open(png).convert('RGBA'))); best[aid] = src
        if not qas: qas.append('<p class="qa bad">沒有候選（見 notes.md）。</p>')
        lines = [h for h in WAVE3_HIDDEN if h[4] == aid]
        say = ''.join(f'<p class="line">{html.escape(t)} <span class="qa">（{s}，標籤 {m}）</span></p>' for s, _, m, t, _ in lines)
        body.append(f'<div class="card"><h3>{NAMES[cid]}｜{mood} {MOOD_ZH[mood]}（現在隱藏頭貼的 {len(lines)} 句）</h3>'
                    f'<div class="pair">{"".join(nat)}</div><div class="pair">{"".join(dbl)}</div>{say}{"".join(qas)}</div>')
    body.append('<h2>二、瑟蕾 wistful 第三次（遊戲裡是第一輪 a1）</h2>')
    for j in redo:
        aid, cid, mood = j['id'], j['cid'], j['mood']
        live = PUB / f'{cid}-portrait-{mood}.png'; ow, oh = Image.open(live).size; osrc = _copy(live, img, f'{aid}-live.png')
        rejected = json.loads((AF / 'registry.json').read_text(encoding='utf-8'))['assets'].get(aid, {}).get('rejected_attempts') or {}
        nat, dbl, qas = [_fig(osrc, ow, oh, '遊戲中：a1')], [_fig(osrc, ow * 2, oh * 2, 'a1 2×')], []
        tiles.append((f'{cid} {mood} live a1', Image.open(live).convert('RGBA')))
        for c in _cands(aid):
            if c.name == 'a1': continue
            png = c / f'{aid}.png'; w, h = Image.open(png).size; src = _copy(png, img, f'{aid}-{c.name}.png')
            q, m, gen = _cand_qa(aid, c)
            tag = '已淘汰' if c.name in rejected else '新候選'
            nat.append(_fig(src, w, h, f'{tag} {c.name}')); dbl.append(_fig(src, w * 2, h * 2, f'{c.name} 2×'))
            if c.name != 'a2':   # a2 was judged in wave 2
                qas.append(f'<p class="qa"><b>{html.escape(gen)} {c.name}</b>：{_qa(q, m)}'
                           + ('｜<span class="bad">淘汰：看得出垂眼，但原尺寸看不到要的淺笑，沒有明顯比遊戲中的 a1 好；a1 保留。</span>' if c.name in rejected else '') + '</p>')
                tiles.append((f'{cid} {mood} {c.name}', Image.open(png).convert('RGBA')))
        if not qas: qas.append('<p class="qa bad">沒有第三次的候選（見 notes.md）。</p>')
        for m in ('normal', 'sad'):
            p = PUB / (f'{cid}-portrait.png' if m == 'normal' else f'{cid}-portrait-{m}.png')
            w, h = Image.open(p).size; src = _copy(p, img, p.name)
            nat.append(_fig(src, w, h, f'{m}（已發佈）')); dbl.append(_fig(src, w * 2, h * 2, f'{m} 2×'))
        body.append(f'<div class="card"><h3>{NAMES[cid]}｜wistful 懷念的淺笑</h3><div class="pair">{"".join(nat)}</div><div class="pair">{"".join(dbl)}</div>'
                    f'<p class="line">台詞：{html.escape(WAVE2_LINES[aid][1])} <span class="qa">（{WAVE2_LINES[aid][2]}）</span></p>'
                    '<p class="qa">目標：看得出的淺笑＋往下、往遠處的視線，和 normal（睜眼看鏡頭）與 sad（皺眉、淚）都分得開。</p>'
                    f'{"".join(qas)}</div>')
    body.append('<h2>三、五句台詞在遊戲對話框裡（左：現在，右：用新表情）</h2>'
                '<p class="note">照遊戲的對話框樣式（640×360 舞台 1×、Cubic 11 12px、頭貼 192px 站在框上緣、第一位說話的人在左、其餘在右）。'
                '回憶場景的這幾句不是 past 句，所以不套回憶的褐色濾鏡。</p>')
    for scene, who, mood, text, aid in WAVE3_HIDDEN:
        side = 'right' if scene == 'finale' else 'left'
        body.append(f'<div class="card"><h3>{html.escape(scene)}｜{NAMES[who]}（標籤 {mood}）</h3><div class="stages">'
                    f'<figure>{_stage(NAMES[who], text, None, side)}<figcaption>現在：重場景，沒有適合的臉，只顯示名牌</figcaption></figure>'
                    f'<figure>{_stage(NAMES[who], text, best.get(aid), side)}<figcaption>之後：{aid.rsplit("-", 1)[1]}{"" if best.get(aid) else "（沒有候選）"}</figcaption></figure>'
                    '</div></div>')
    _montage(tiles, out / 'montage.png')
    page = ('<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            f'<title>對話表情第三輪</title><style>{CSS}{STAGE_CSS}h3{{font-size:15px;margin:0 0 8px}}</style></head><body>'
            '<h1>星燈迷宮｜對話表情第三輪</h1>'
            '<p class="note">重場景裡還有 5 句台詞不顯示頭貼：莎菲拉 1 句（驚訝，重場景找 serious）、諾艾兒 4 句（嘟嘴，重場景找 serious），兩人都沒有可用的臉。'
            '這一輪給莎菲拉 serious、給諾艾兒她自己的 pout，另外破例再試一次瑟蕾的 wistful。全部由 codex 生成；還沒進遊戲（不在 public/、未登錄為可發佈），等你看過再決定。'
            '全部的 3× 總覽：<a href="montage.png">montage.png</a>。</p>' + ''.join(body) + '</body></html>')
    (out / 'review.html').write_text(page, encoding='utf-8'); print(out / 'review.html'); print(out / 'montage.png')


MOOD_ZH.update({'blush': '害羞臉紅', 'averted': '移開視線', 'unguarded': '卸下防備', 'smug': '得意', 'excited': '眼睛發亮'})
_HEART = '心契 `bond:{c}:4` 與戀愛 `romance:{c}`（計畫的寫作任務，還沒寫）'
# Wave 4 (affinity plan Task A): what each of the 14 faces is for besides the lines already in the script (script_lines),
# from spec 2026-10-18 sections 6.3 (GIFT_MOOD), 7 (bond scenes), 9 (romance) and 10.2.
WAVE4_USES = {
    ('rin', 'averted'): '誓約前的凜（領口鐘有裂痕）：mem:rin:4–6 的回憶、chat:hero:4／chat:rin:3 的 `oath: false` 句；`bond:rin:2`（碎片 ≥ 4，開始避開他的視線，spec §7）。這一種是迴避、心虛，不是害羞。',
    ('rin-oath', 'averted'): '誓約後的凜（鐘被敲平）：banter:chizuru-rin:2（`oath: true`）「另外半句，早該說了。」；送禮「最愛」的反應（GIFT_MOOD：她把高興藏起來，spec §6.3）；' + _HEART.format(c='rin') + '。誓約後的 averted 是害羞的那一種（spec §10.2）。',
    ('rin-oath', 'blush'): '凜的心契與戀愛都在她選擇之後，所以只做誓約後這一套：' + _HEART.format(c='rin') + '；她第一次主動說出想要的東西（spec §9.5）。',
    ('selene', 'blush'): _HEART.format(c='selene') + '：她第一次說「我想看見」的未來裡可以有他。',
    ('chizuru', 'blush'): _HEART.format(c='chizuru') + '：禮數與心意之間的距離，結局後直接叫一次「洛恩」。',
    ('safira', 'blush'): _HEART.format(c='safira') + '：她一直在等有人配合她的拍子。',
    ('sylvie', 'blush'): '已在劇本：banter:bobby-sylvie:2；另 ' + _HEART.format(c='sylvie') + '：寡言的人終於說出口。',
    ('sylvie', 'unguarded'): '已在劇本：終幕（finale）的兩句二選一；另心契 `bond:sylvie:4` 與後日談（spec §10.2：她難得放鬆的臉）。現在重場景借 sad。',
    ('noel', 'blush'): '已在劇本：夜晚一句、chat:noel:2 集滿後改叫「洛恩」的兩句、banter:chizuru-noel:2；另 ' + _HEART.format(c='noel') + '：叫「洛恩」時自己先臉紅（文風聖經）。',
    ('noel', 'smug'): '已在劇本 14 句（夜晚、群戲、相遇、多段鬥嘴）；送禮「最愛」的反應（GIFT_MOOD）。',
    ('bobby', 'blush'): _HEART.format(c='bobby') + '：她修好的不是燈，是「他要一個人走下去」這件事。',
    ('bobby', 'excited'): '已在劇本 8 句（夜晚、相遇、回憶、鬥嘴）；送禮「最愛」的反應（GIFT_MOOD）。',
    ('liz', 'blush'): _HEART.format(c='liz') + '：家的線圓滿之後，「一起回家」有了新的意思。',
    ('scarlet', 'blush'): _HEART.format(c='scarlet') + '：「你不是盾，你是我的朋友」之後的下一步。',
}
# Which of Rin's script lines each look plays: the oath look takes the `oath: true` scenes (data/story/scenes.ts), the
# cracked-bell look the rest of hers that come before her choice.
RIN_OATH_SCENES = {'banter:chizuru-rin:2'}
WAVE4_SHOW = 4        # dialogue boxes per sample face; the rest of its lines are listed in section three


def _lines_for(c, m):
    who = 'rin' if c.startswith('rin') else c
    ls = script_lines(who, m)
    if who == 'rin': ls = [l for l in ls if (l[0] in RIN_OATH_SCENES) == (c == 'rin-oath')]
    return ls


def _now_face(c, m, scene):
    """What the line shows today (ui2/story.ts faceOrder): a glad mood borrows the smiling normal; averted takes sad in a
    heavy scene (a memory) and the calm normal in a light one."""
    if m == 'averted' and scene.startswith('mem:'): return 'sad'
    return 'normal'


def wave4(run, final=False):
    """Wave 4 (affinity plan Task A): the new faces beside every face each character had before, their lines in the game's
    dialogue box (the face borrowed before | the new one), and the whole Task A set with what each face is for. The sample
    run showed four candidates; `final` shows all 14 with the attempt the registry chose, after publishing."""
    import faces as F
    from PIL import Image
    out = AF / 'runs' / run; img = out / 'img'; img.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(REPO / 'public/assets/games/starlantern/ui/window.png', img / 'window.png')
    body, tiles, best = [], [], {}
    jobs = F.jobs(wave=4) if final else [j for j in F.jobs(wave=4) if j['id'] in F.WAVE4_SAMPLE]
    reg = json.loads((AF / 'registry.json').read_text(encoding='utf-8'))['assets']
    new4 = {(c, m) for c, ms in F.WAVE4_ALL.items() for m in ms}
    body.append('<h2>一、' + ('第四波 14 張（選定的一張標「發佈」；和該角色之前已有的每張臉並排）' if final else '四張樣本（和該角色已有的每張臉並排）') + '</h2>')
    for j in jobs:
        aid, cid, mood = j['id'], j['cid'], j['mood']
        nat, dbl, qas = [], [], []
        for m, p in _published(cid):
            if (cid, m) in new4: continue   # wave 4's own faces are shown as the new ones
            w, h = Image.open(p).size; src = _copy(p, img, p.name)
            nat.append(_fig(src, w, h, f'{m}（已發佈）')); dbl.append(_fig(src, w * 2, h * 2, f'{m} 2×'))
            if not final: tiles.append((f'{cid} {m}', Image.open(p).convert('RGBA')))
        chosen = reg.get(aid, {}).get('chosen_attempt') if final else None
        rejected = reg.get(aid, {}).get('rejected_attempts') or {}
        for c in _cands(aid):
            png = c / f'{aid}.png'; w, h = Image.open(png).size; src = _copy(png, img, f'{aid}-{c.name}.png')
            q, m, gen = _cand_qa(aid, c)
            tag = '，發佈' if chosen == c.name else '，淘汰' if c.name in rejected else ''
            nat.append(_fig(src, w, h, f'新 {mood} {MOOD_ZH[mood]}（{c.name}{tag}）')); dbl.append(_fig(src, w * 2, h * 2, f'新 {mood} {c.name}{tag} 2×'))
            qas.append(f'<p class="qa"><b>{html.escape(gen)} {c.name}{tag}</b>：{_qa(q, m)}'
                       + (f'｜<span class="bad">淘汰：{html.escape(rejected[c.name])}</span>' if c.name in rejected else '') + '</p>')
            if not final or chosen == c.name: tiles.append((f'{cid} {mood}' + ('' if final else f' {c.name}'), Image.open(png).convert('RGBA')))
            if not final or chosen == c.name or (chosen is None and aid not in best): best[aid] = src
        if not qas: qas.append('<p class="qa bad">沒有候選（見 notes.md）。</p>')
        pick = '' if final else WAVE4_PICK.get(aid, '')
        body.append(f'<div class="card"><h3>{NAMES[cid]}｜{mood} {MOOD_ZH[mood]}</h3>'
                    f'<div class="pair">{"".join(nat)}</div><div class="pair">{"".join(dbl)}</div>'
                    f'<p class="line">用在：{html.escape(WAVE4_USES[(cid, mood)].replace('`', ''))}</p>{"".join(qas)}'
                    + (f'<p class="qa"><b>建議</b>：{html.escape(pick)}</p>' if pick else '') + '</div>')
    body.append('<h2>二、台詞放在遊戲對話框裡（左：現在借用的臉，右：新表情）</h2>'
                '<p class="note">照遊戲的對話框樣式（640×360 舞台 1×、Cubic 11 12px、頭貼 192px 站在框上緣）。每張最多放 '
                f'{WAVE4_SHOW} 句，其餘列在第三部分。還沒寫的心契／戀愛台詞不代寫：沒有劇本台詞的表情，對話框裡只放一句標明「示意」的說明。</p>')
    for j in jobs:
        aid, cid, mood = j['id'], j['cid'], j['mood']
        ls = _lines_for(cid, mood)[:WAVE4_SHOW] or [('（尚未寫）', '（示意：心契與戀愛的台詞還沒寫；這裡只看這張臉放在對話框裡的樣子）', '')]
        for scene, text, cond in ls:
            now = _now_face(cid, mood, scene)
            nsrc = _copy(PUB / (f'{cid}-portrait.png' if now == 'normal' else f'{cid}-portrait-{now}.png'), img,
                         f'{cid}-portrait.png' if now == 'normal' else f'{cid}-portrait-{now}.png')
            body.append(f'<div class="card"><h3>{html.escape(scene)}｜{NAMES[cid]}（標籤 {mood}{"；條件 " + html.escape(cond) if cond else ""}）</h3><div class="stages">'
                        f'<figure>{_stage(NAMES[cid].split("（")[0], text, nsrc, "left")}<figcaption>現在：借 {now}</figcaption></figure>'
                        f'<figure>{_stage(NAMES[cid].split("（")[0], text, best.get(aid), "left")}<figcaption>之後：{mood}{"" if best.get(aid) else "（沒有候選）"}</figcaption></figure>'
                        '</div></div>')
    body.append('<h2>三、Task A 全部 14 張與它們服務的台詞</h2><table class="set"><tr><th>角色</th><th>表情</th><th>' + ('發佈' if final else '這一輪') + '</th><th>劇本裡已有的台詞</th><th>其他用途</th></tr>')
    sample = {j['id'] for j in jobs}
    for c, ms in F.WAVE4_ALL.items():
        for m in ms:
            aid = f'char-{c}-portrait-{m}'
            ls = _lines_for(c, m)
            said = '<br>'.join(f'{html.escape(t)} <span class="qa">（{html.escape(s)}{"；" + html.escape(k) if k else ""}）</span>' for s, t, k in ls) or '<span class="qa">沒有</span>'
            body.append(f'<tr><td>{NAMES[c]}</td><td>{m} {MOOD_ZH[m]}</td><td>{(reg.get(aid, {}).get('chosen_attempt') or '—') if final else ("<b>樣本</b>" if aid in sample else "之後")}</td>'
                        f'<td>{said}</td><td>{html.escape(WAVE4_USES[(c, m)].replace('`', ''))}</td></tr>')
    body.append('</table>')
    _montage(tiles, out / 'montage.png')
    intro = (('<h1>星燈迷宮｜對話表情第四波（14 張，已發佈）</h1>'
              '<p class="note">好感度計畫 Task A：九位夥伴的 blush、凜兩套的 averted（誓約前是心虛、迴避；誓約後是害羞）、希爾薇的 unguarded、諾艾兒的 smug、波比的 excited。'
              '你 2026-10-24 看過樣本說「可以，照這風格」（凜誓約後的 averted 用 a2），其餘 10 張照同一套句型由 codex 生成，每張最多 2 次。每張的選定版（標「發佈」）已進 registry 與 public/；'
              '淘汰的只留在 work/…/cand/。遊戲內截圖在 <a href="ingame/">ingame/</a>，14 張的 3× 總覽：<a href="montage.png">montage.png</a>。</p>') if final else
             ('<h1>星燈迷宮｜對話表情第四波（樣本 4 張）</h1>'
              '<p class="note">第四波（好感度計畫 Task A，可選）是心契與戀愛用的 14 張臉：九位夥伴的 blush、凜兩套的 averted、希爾薇的 unguarded、諾艾兒的 smug、波比的 excited。'
              '沒有它遊戲照樣完整，這些表情現在借已發佈的臉。這一輪先做 4 張看畫風：諾艾兒 blush、莎菲拉 blush（深膚色上的紅暈）、凜（誓約後）averted、波比 excited。'
              '全部由 codex 生成；只在 work/ 當候選，不在 public/、未登錄為可發佈。你說可以，再把其餘 10 張照同一個方式做完。'
              '全部的 3× 總覽：<a href="montage.png">montage.png</a>。</p>'))
    page = ('<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            f'<title>{"對話表情第四波" if final else "對話表情第四波樣本"}</title><style>{CSS}{STAGE_CSS}h3{{font-size:15px;margin:0 0 8px}}'
            '.set{border-collapse:collapse;font-size:13px;margin:8px 0 24px}.set th,.set td{border:1px solid #445;padding:4px 6px;vertical-align:top;text-align:left}</style></head><body>'
            + intro + ''.join(body) + '</body></html>')
    (out / 'review.html').write_text(page, encoding='utf-8'); print(out / 'review.html'); print(out / 'montage.png')


# The reviewer's call per sample id after looking at every attempt (runs/2026-10-24-faces-wave4-sample/notes.md).
WAVE4_PICK = {
    'char-rin-oath-portrait-averted': 'a2。a1 只把眼珠移到旁邊，原尺寸不太看得出在迴避；a2 整個頭轉開、視線往下，一眼就讀得出。',
}


if __name__ == '__main__':
    if sys.argv[1] == 'wave4':
        wave4(sys.argv[2])
    elif sys.argv[1] == 'wave4-final':
        wave4(sys.argv[2], final=True)
    elif sys.argv[1] == 'wave3':
        wave3(sys.argv[2])
    elif sys.argv[1] == 'wave2':
        wave2(sys.argv[2])
    elif sys.argv[1] == 'wave':
        wave(sys.argv[2])
    else:
        main(sys.argv[1], sys.argv[2:])
