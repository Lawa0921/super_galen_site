"""review_g4.py: the G4 SAMPLE review page and its 4x montage (art step 9): new skill icons, ailment icons, mechanic counters.

  python art-factory/starlantern/tools/review_g4.py [--out=runs/2026-10-24-g4-sample]
  python art-factory/starlantern/tools/review_g4.py --full [--out=runs/2026-10-24-g4-full]   the published full set

Reads the registry's `g4-sample` batch (g4_art.py pick), copies each icon and the comparison art (the G3 skill icons of
the same characters, the published rune icons, the characters' published portraits) into <out>/img/, and writes
review.html (each icon at 1x / 2x / 4x, then inside mocks of the real battle rows beside the existing icons) and
montage-4x.png. Nothing is approved or published.
"""
import html, json, shutil, sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gear_art as G  # noqa: E402
import g4_art as F  # noqa: E402
import sl_art as A  # noqa: E402

AF, REPO = G.AF, G.REPO
PUB = REPO / 'public/assets/games/starlantern'
BG = (10, 14, 34, 255)   # $slx-win
NAMES = {'purify-ward': '淨之結界', 'pickpocket': '順手牽羊', 'cover': '代受', 'repair-drone': '修理無人機',
         'ail-burn': '灼燒', 'ail-freeze': '凍結', 'ail-chill': '冰緩', 'ail-shock': '感電', 'ail-bleed': '流血', 'ail-poison': '中毒',
         'mech-heat': '熱度', 'mech-coins': '銅板', 'mech-embers': '餘燼', 'mech-beat': '拍子', 'mech-shield': '護盾',
         'mech-moon-full': '滿月'}
# The G3 icons (not yet approved) of the same characters, shown beside the new ones: {new skill: [(skill, name), ...]}.
G3_BESIDE = {'purify-ward': [('ward', '守之結界'), ('great-barrier', '大結界'), ('pierce', '貫槍')],
             'pickpocket': [('twin-slash', '雙刃'), ('fortune-strike', '大手筆'), ('smoke-bomb', '煙霧彈')],
             'cover': [('provoke', '挑釁'), ('shield-bash', '盾擊'), ('iron-wall', '鐵壁')],
             'repair-drone': [('turret', '設置砲台'), ('barrier', '護盾產生器'), ('shock-mine', '電擊地雷')]}
# The published rune icons that stand for the same idea, shown beside the ailment icons (approved 2026-10-24).
RUNE_BESIDE = {'ail-burn': 'rune-ignite', 'ail-freeze': 'rune-frostbite', 'ail-chill': 'rune-rime', 'ail-shock': 'rune-jolt',
               'ail-bleed': 'rune-tear', 'ail-poison': 'rune-venom', 'mech-shield': 'rune-spill-shield'}
OWNER = {'purify-ward': 'chizuru', 'pickpocket': 'liz', 'cover': 'scarlet', 'repair-drone': 'bobby'}


def parts():
    return [p for j in F.sample_jobs() for p in j['parts']]


def copy_inputs(out, reg):
    img = out / 'img'
    if img.exists(): shutil.rmtree(img)
    img.mkdir(parents=True)
    qa = {}
    for p in parts():
        for aid in F.assets_of(p):
            e = reg.get(aid); shutil.copyfile(A._final_path(e['final']), img / f'{aid}.png')
            qa[aid] = dict(e['qa'], status=e.get('status'), attempt=f"{e.get('sheet', '')} {e.get('chosen_attempt', '')}".strip())
    for p, beside in G3_BESIDE.items():
        for s, _ in beside:
            for px in (16, 14):
                shutil.copyfile(A._final_path(reg.get(f'icon-{s}-{px}')['final']), img / f'g3-{s}-{px}.png')
    for r in {*RUNE_BESIDE.values(), 'rune-flame'}:   # 灼焰 also sits after a new skill's name in the skill-row mock
        for px in (16, 14): shutil.copyfile(PUB / 'icon' / f'{r}-{px}.png', img / f'{r}-{px}.png')
    for c in ('noel', 'liz', 'scarlet', 'safira', 'chizuru'):
        shutil.copyfile(PUB / 'char' / f'{c}-portrait.png', img / f'{c}-portrait.png')
    return qa


def montage(out):
    """4x: each new skill icon (16, 14) then three G3 icons of the same character (16); each chip icon (14, 12) then
    the published rune icon of the same idea (14)."""
    rows = []
    for p in parts():
        ims = [Image.open(out / 'img' / f'{a}.png').convert('RGBA') for a in F.assets_of(p)]
        if p in G3_BESIDE: ims += [Image.open(out / 'img' / f'g3-{s}-16.png').convert('RGBA') for s, _ in G3_BESIDE[p]]
        if p in RUNE_BESIDE: ims += [Image.open(out / 'img' / f'{RUNE_BESIDE[p]}-14.png').convert('RGBA')]
        rows.append(ims)
    s, gap, sep = 4, 6, 10
    per = -(-len(rows) // 2)
    colw = max(sum(im.width for im in r) + gap * (len(r) + 1) + sep for r in rows)
    rowh = 16 + gap
    sheet = Image.new('RGBA', (colw * 2 * s, (per * rowh + gap) * s), BG)
    for k, r in enumerate(rows):
        x = gap + (k // per) * colw; y = gap + (k % per) * rowh
        for i, im in enumerate(r):
            if i == 2: x += sep                                  # the new icons, then what they sit beside
            sheet.alpha_composite(im.resize((im.width * s, im.height * s), Image.NEAREST), (x * s, (y + (16 - im.height) // 2) * s))
            x += im.width + gap
    sheet.save(out / 'montage-4x.png')


CSS = '''
:root{color-scheme:dark;--bg:#16182a;--card:#22253a;--ink:#e6e6f0;--dim:#9a9cb4;--ok:#7fd49a;--bad:#ff8a8a;--warn:#ffd27a}
@font-face{font-family:'Cubic 11';src:url('../../../../public/assets/fonts/cubic-11/Cubic_11.woff2') format('woff2'),url('/assets/fonts/cubic-11/Cubic_11.woff2') format('woff2')}
body{margin:0;padding:16px;background:var(--bg);color:var(--ink);font:15px/1.6 system-ui,"Noto Sans TC",sans-serif}
h1{font-size:20px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 8px}p.note{color:var(--dim);margin:0 0 12px;max-width:72em}
.ask{background:#1d2238;border:2px solid #c9a35a;padding:8px 16px;margin:12px 0;max-width:72em}.ask li{margin:6px 0}
.card{background:var(--card);border-radius:8px;padding:12px;margin:0 12px 12px 0;display:inline-block;vertical-align:top}
img{image-rendering:pixelated}.px{display:inline-block;vertical-align:middle;margin:0 8px 0 0;background:#0a0e22;padding:4px}
table{border-collapse:collapse}td,th{border-bottom:1px solid #333752;padding:4px 8px;text-align:left;font-size:13px}.ok{color:var(--ok)}.bad{color:var(--bad)}
.scroll{overflow-x:auto;max-width:100%}.zoom2{zoom:2}
.win{display:inline-block;vertical-align:top;background:rgb(10,14,34);border:2px solid #c9a35a;box-shadow:inset 0 0 0 1px #6e5a2e;border-radius:3px;padding:6px 8px;
 font:12px/16px 'Cubic 11','Noto Sans TC','Microsoft JhengHei',sans-serif;color:#f1ead8;margin:0 12px 12px 0;-webkit-font-smoothing:none;max-width:100%;box-sizing:border-box}
.head{color:#b7ae9a;margin-bottom:4px}.dim{color:#b7ae9a}
/* party panel (scss .slx-pm 352-357) with its word row above it (.slx-pm-ail, .slx-ail 548-550) */
.pm{position:relative;display:flex;gap:4px;align-items:center;padding:3px 4px;background:rgb(10,14,34);border:1px solid #6e5a2e;width:115px;height:54px;margin-top:22px}
.pm>img{width:40px;height:40px;object-fit:contain}.pm .body{line-height:14px;font-size:12px}
.ail{position:absolute;left:0;bottom:100%;margin-bottom:1px;display:flex;gap:1px;white-space:nowrap}
.chip{display:inline-flex;align-items:flex-start;gap:1px;padding:0 1px;font-size:12px;line-height:14px;border:1px solid currentColor;background:rgba(10,14,34,.92)}
.chip img{flex:none}.i14{width:14px;height:14px}.i12{width:12px;height:12px;margin-top:1px}.i16{width:16px;height:16px}
.row{display:flex;flex-wrap:wrap;gap:16px;align-items:flex-end}
.skill{display:flex;align-items:center;gap:4px;padding:2px 0}.tree{display:flex;align-items:center;gap:2px;font-size:10px;line-height:14px}
.field{display:flex;gap:2px}
'''


def img(src, cls='', alt=''):
    return f'<img class="{cls}" src="img/{src}" alt="{html.escape(alt)}">'


def chip(colour, word, part=None, px=14):
    ic = img(f'icon-{part}-{px}.png', f'i{px}') if part else ''
    return f'<span class="chip" style="color:{colour}">{ic}{html.escape(word)}</span>'


def party_mocks(px):
    A_, M_ = F.AIL_COLOUR, F.MECH_COLOUR
    members = [('noel', '諾艾兒', [(M_['mech-heat'], '熱度3', 'mech-heat'), (A_['ail-burn'], '灼燒3', 'ail-burn')]),
               ('liz', '莉茲', [(M_['mech-coins'], '銅板7', 'mech-coins'), (A_['ail-bleed'], '流血×2', 'ail-bleed')]),
               ('scarlet', '絲嘉蕾', [(A_['ail-freeze'], '凍結', 'ail-freeze'), (M_['mech-embers'], '餘燼40', 'mech-embers')]),
               ('safira', '莎菲拉', [(M_['mech-beat'], '拍子3', 'mech-beat'), (A_['ail-shock'], '感電2', 'ail-shock')]),
               ('chizuru', '千鶴', [(M_['mech-shield'], '護盾12', 'mech-shield'), (A_['ail-chill'], '冰緩2', 'ail-chill'), (A_['ail-poison'], '中毒', 'ail-poison')])]
    new = ''.join(f'<div class="pm"><div class="ail">{"".join(chip(c, w, p, px) for c, w, p in ch)}</div>{img(f"{cid}-portrait.png")}'
                  f'<div class="body">{n}<br><span class="dim">HP 120</span><br><span class="dim">TP 30</span></div></div>' for cid, n, ch in members)
    old = ''.join(f'<div class="pm"><div class="ail">{"".join(chip(c, w) for c, w, _ in ch)}</div>{img(f"{cid}-portrait.png")}'
                  f'<div class="body">{n}<br><span class="dim">HP 120</span><br><span class="dim">TP 30</span></div></div>' for cid, n, ch in members)
    return new, old


def skill_mocks():
    rows = []
    for p, beside in G3_BESIDE.items():
        tab = ''.join(f'<div class="skill">{img(f"g3-{s}-16.png", "i16")}<span>{n}</span></div>' for s, n in beside)
        tree = ''.join(f'<div class="tree">{img(f"g3-{s}-14.png", "i14")}<span>{n}</span></div>' for s, n in beside)
        rows.append(f'<div class="win"><div class="head">技能列 16×16（新招在最上面）</div>'
                    f'<div class="skill">{img(f"icon-{p}-16.png", "i16")}<span>{NAMES[p]}</span>'
                    f'{img("rune-flame-14.png", "i14")}<span class="dim">（新）</span></div>{tab}'
                    f'<div class="head" style="margin-top:6px">技能樹 14×14</div><div class="tree">{img(f"icon-{p}-14.png", "i14")}<span>{NAMES[p]}</span></div>{tree}</div>')
    return ''.join(rows)


def page(out, qa):
    h = ['<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
         f'<title>G4 圖示樣本</title><style>{CSS}</style></head><body>',
         '<h1>G4 圖示樣本：新技能、異常、機制計數（第 ⑨ 步，待你看風格）</h1>',
         '<p class="note">codex（gpt-6-astra）3 張表：新技能 2×2、異常 3×2、機制 3×2。每格從高解析原圖做原尺寸圖、覆蓋取樣、不放大，'
         '和 G3 技能圖示、符文圖示同一條管線。新技能做 16×16（技能列）與 14×14（技能樹）；異常與機制做 14×14 與 12×12 兩種，'
         '放在 12px 字前面的小框裡。數字一律是遊戲字，圖上沒有字。尚未接進遊戲，也沒有核准或發布。</p>',
         '<div class="ask"><b>請你決定的事</b><ol>'
         '<li>新技能圖示的畫風：和旁邊同角色的 G3 圖示像不像同一套？（看第 2 節）</li>'
         '<li>異常與機制圖示的做法：一個單色大符號、沒有底座（不像符文的石板）。這樣可以嗎？還是要加統一的小底座？</li>'
         '<li>大小：小框裡用 14×14 還是 12×12？（第 3a、3b 節上下對照；14 和符文戰鬥選單一樣大，12 比較不擠）。'
         '每個字前面多一個圖，隊伍欄一行（約 119px）會更早收成「+N」。</li>'
         '<li>冰緩：用「小一點的冰塊＋向下箭頭」當凍結的變化，可以嗎？</li></ol>'
         '<p>已知風險：灼燒（異常）和熱度（機制）都是橘色火團，1 倍下很像；流血是第 1 版（第 2 版的兩滴血中間被判成擦掉），'
         '14×14 下紅色偏小、黑邊多；拍子的音符桿在 12×12 只剩 1 像素。全套時會重畫這幾個。</p>'
         '<p class="ok">回覆例：「1 可以、2 可以、3 用 14、4 可以」。不行的話寫出哪一個要重畫、要怎麼改。</p></div>',
         '<p><a href="montage-4x.png">montage-4x.png</a>（4 倍：新圖在左，右邊是同角色的 G3 圖示或同概念的符文圖示）</p>',
         '<h2>1. 每張圖：1×、2×、4×</h2>']
    for p in parts():
        cell = [f'<div class="card"><b>{NAMES[p]}</b> <span style="color:var(--dim)">{p}</span><br>']
        for aid in F.assets_of(p):
            s = int(aid.rsplit('-', 1)[1])
            cell += [f'<span class="px"><img src="img/{aid}.png" width="{s * z}" height="{s * z}" alt=""></span>' for z in (1, 2, 4)] + ['<br>']
        h.append(''.join(cell) + '</div>')
    h.append('<h2>2. 新技能圖示和同角色的 G3 圖示並排（技能列 16、技能樹 14；1× 與 2×）</h2>'
             '<p class="note">G3 圖示是已生成、等你核准的那一批（G3 審核頁另外給）。灼焰符文的 14×14 小圖放在新招名稱後面，看技能圖示和符文圖示放在一起的樣子。</p>')
    for z in ('', 'zoom2'):
        h.append(f'<div class="row {z}">{skill_mocks()}</div>')
    for px in (14, 12):
        new, old = party_mocks(px)
        h.append(f'<h2>3{"a" if px == 14 else "b"}. 戰鬥隊伍欄：頭像上方的狀態列，圖示 {px}×{px}（1× 與 2×）</h2>'
                 '<p class="note">照遊戲的版面：頭像 40×40、狀態字 12px、行高 14、外框 1px（_starlantern-ui.scss 352–357、548–550）。下排是現在的純文字。</p>')
        for z in ('', 'zoom2'):
            h.append(f'<div class="scroll"><div class="{z}"><div class="row">{new}</div><div class="row">{old}</div></div></div>')
    moon = chip(F.MECH_COLOUR['mech-moon-full'], '月相：滿月→下弦', 'mech-moon-full')
    h.append('<h2>4. 戰場橫幅（右上，_starlantern-ui.scss 405）與敵人頭上的異常列</h2>'
             f'<div class="win"><div class="field">{moon}{chip(F.MECH_COLOUR["mech-moon-full"], "月相：滿月→下弦")}</div>'
             f'<div class="field" style="margin-top:6px">{chip(F.AIL_COLOUR["ail-freeze"], "凍結", "ail-freeze")}{chip(F.AIL_COLOUR["ail-bleed"], "流血×3", "ail-bleed")}'
             f'{chip(F.AIL_COLOUR["ail-burn"], "灼燒2", "ail-burn")}{chip("#f1ead8", "+2")}</div>'
             '<div class="dim" style="margin-top:4px">上：月相（只做了滿月；其他三相在全套）。下：敵人的異常列（遊戲裡是 Pixi 畫的字，高 14）。</div></div>')
    h.append('<h2>5. 和同概念的符文圖示比（14×14）</h2><p class="note">符文是石板上的刻紋，異常是單一符號，所以兩者一眼分得出來。</p><div class="win">'
             + ''.join(f'<div class="skill">{img(f"icon-{p}-14.png", "i14")}<span>{NAMES[p]}</span>　{img(f"{r}-14.png", "i14")}<span class="dim">{r}</span></div>'
                       for p, r in RUNE_BESIDE.items()) + '</div>')
    h.append('<h2>6. QA</h2><div class="scroll"><table><tr><th>id</th><th>尺寸</th><th>狀態</th><th>結果</th><th>殘色</th><th>半透明</th><th>溢色</th><th>長/短</th><th>mass</th><th>置中</th><th>版本</th></tr>')
    for aid, q in qa.items():
        sj = q['subject']
        h.append(f'<tr><td>{aid}</td><td>{q["size"][0]}×{q["size"][1]}</td><td>{q["status"]}</td><td class="{"ok" if q["pass"] else "bad"}">'
                 f'{"pass" if q["pass"] else ", ".join(q["reasons"])}</td><td>{q["residue"]}</td><td>{q["semi"]}</td><td>{q["magenta_spill"]}</td>'
                 f'<td>{sj["long"]}/{sj["short"]}</td><td>{sj["mass"]}</td><td>{sj["centre_off"]}</td><td>{q["attempt"]}</td></tr>')
    h.append('</table></div></body></html>')
    (out / 'review.html').write_text('\n'.join(h), encoding='utf-8', newline='\n')


# --- the full set (art step 9, G4; published 2026-10-24) -------------------------------------------------------------------
CHIP_NAMES = {'ail-sleep': '睡眠', 'mech-aim': '瞄準', 'mech-mark': '暗記', 'mech-ward': '守之結界', 'mech-purify': '淨之結界',
              'mech-thunder': '雷（結界附加）', 'mech-moon-first': '上弦', 'mech-moon-waning': '下弦', 'mech-moon-new': '新月'}
DEVICE_SKILLS = ['turret', 'repair-drone', 'barrier', 'shock-mine', 'tesla-coil']


def full_name(p):
    from review_gear import names
    return NAMES.get(p) or CHIP_NAMES.get(p) or names().get(p, p)


def neighbours(part):
    """Three G3 icons of the same character (the skills before it in the game data), shown beside a new skill."""
    roster = G.skill_roster(); own = roster.get(part)
    mine = set(F.full_parts())
    return [s for s, o in roster.items() if o == own and s not in mine][:3]


def full_copy(out, reg):
    img = out / 'img'
    if img.exists(): shutil.rmtree(img)
    img.mkdir(parents=True)
    qa = {}
    for p in F.full_parts():
        for aid in F.assets_of(p, full=True):
            e = reg.get(aid); shutil.copyfile(A._final_path(e['final']), img / f'{aid}.png')
            qa[aid] = dict(e['qa'], status=e.get('status'), attempt=f"{e.get('sheet', '')} {e.get('chosen_attempt', '')}".strip(),
                           batch=e.get('batch'))
    for p in F.full_parts():
        if F.kind_of(p) != 'skill': continue
        for s in neighbours(p):
            for px in (16, 14): shutil.copyfile(PUB / 'icon' / f'{s}-{px}.png', img / f'g3-{s}-{px}.png')
    for s in DEVICE_SKILLS: shutil.copyfile(PUB / 'icon' / f'{s}-14.png', img / f'g3-{s}-14.png')
    for r in RUNE_BESIDE.values(): shutil.copyfile(PUB / 'icon' / f'{r}-14.png', img / f'{r}-14.png')
    return qa


def full_montage(out):
    """4x: each new skill (16, 14) then three G3 icons of the same character (16); each chip icon (14) then the rune of
    the same idea (14), when there is one. Two columns."""
    rows = []
    for p in F.full_parts():
        ims = [Image.open(out / 'img' / f'{a}.png').convert('RGBA') for a in F.assets_of(p, full=True)]
        n = len(ims)
        if F.kind_of(p) == 'skill': ims += [Image.open(out / 'img' / f'g3-{s}-16.png').convert('RGBA') for s in neighbours(p)]
        if p in RUNE_BESIDE: ims += [Image.open(out / 'img' / f'{RUNE_BESIDE[p]}-14.png').convert('RGBA')]
        rows.append((n, ims))
    s, gap, sep = 4, 6, 10
    per = -(-len(rows) // 2)
    colw = max(sum(im.width for im in r) + gap * (len(r) + 1) + sep for _, r in rows)
    rowh = 16 + gap
    sheet = Image.new('RGBA', (colw * 2 * s, (per * rowh + gap) * s), BG)
    for k, (n, r) in enumerate(rows):
        x = gap + (k // per) * colw; y = gap + (k % per) * rowh
        for i, im in enumerate(r):
            if i == n: x += sep
            sheet.alpha_composite(im.resize((im.width * s, im.height * s), Image.NEAREST), (x * s, (y + (16 - im.height) // 2) * s))
            x += im.width + gap
    sheet.save(out / 'montage-4x.png')


def full_page(out, qa, shots):
    parts = F.full_parts()
    skills = [p for p in parts if F.kind_of(p) == 'skill']; chips = [p for p in parts if F.kind_of(p) != 'skill']
    colour = {**F.AIL_COLOUR, **F.MECH_COLOUR, 'mech-aim': '#ff9bb8', 'mech-mark': '#ff6cd9', 'mech-ward': '#4ac2ff',
              'mech-purify': '#d6ff7b', 'mech-thunder': '#ffe845', 'mech-moon-first': '#e6c6ff', 'mech-moon-waning': '#e6c6ff', 'mech-moon-new': '#e6c6ff'}
    h = ['<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
         f'<title>G4 圖示全套</title><style>{CSS}</style></head><body>',
         '<h1>G4 圖示全套：新技能、異常、機制計數（第 ⑨ 步，已發布）</h1>',
         '<p class="note">風格由使用者 2026-10-24 在樣本頁核准：「(1) 新技能風格可以、和 G3 一致；(2) 異常與機制不要底座；(3) 隊伍狀態列用 14×14；'
         '(4) 冰緩＝小一點的冰塊＋向下箭頭」。全套照同一個風格畫，樣本的三個風險已重畫：熱度改成溫度計（和灼燒的火分開）、流血改成一顆更紅的大血滴、'
         '拍子的音符桿加粗到 2 像素以上。新技能 16×16 與 14×14，異常與機制 14×14，數字一律是遊戲字。波比的裝置直接用他技能的 14×14 圖示。</p>',
         f'<p><a href="montage-4x.png">montage-4x.png</a>　<a href="../2026-10-24-g3-review/index.html">G3 審核頁（90 招，已發布）</a>　'
         f'遊戲內截圖：{"、".join(f"<a href={chr(34)}ingame/{n}{chr(34)}>{n}</a>" for n in shots) or "（無）"}</p>',
         f'<h2>1. 新技能 {len(skills)} 招：1×、2×、4×，旁邊是同角色的 G3 圖示</h2>']
    for p in skills:
        cell = [f'<div class="card"><b>{html.escape(full_name(p))}</b> <span style="color:var(--dim)">{p}</span><br>']
        for aid in F.assets_of(p, full=True):
            px = int(aid.rsplit('-', 1)[1])
            cell += [f'<span class="px"><img src="img/{aid}.png" width="{px * z}" height="{px * z}" alt=""></span>' for z in (1, 2, 4)] + ['<br>']
        cell.append('<span class="dim">同角色：</span>' + ''.join(f'<span class="px">{img(f"g3-{s}-16.png", "i16")}</span>' for s in neighbours(p)))
        h.append(''.join(cell) + '</div>')
    h.append(f'<h2>2. 異常與機制 {len(chips)} 個：1×、2×、4×，和遊戲裡那個字的顏色、同概念的符文</h2>')
    for p in chips:
        aid = F.assets_of(p, full=True)[0]
        rune = f'<span class="px">{img(f"{RUNE_BESIDE[p]}-14.png", "i14")}</span>' if p in RUNE_BESIDE else ''
        h.append(f'<div class="card"><b>{html.escape(full_name(p))}</b> <span style="color:var(--dim)">{p}</span><br>'
                 + ''.join(f'<span class="px"><img src="img/{aid}.png" width="{14 * z}" height="{14 * z}" alt=""></span>' for z in (1, 2, 4))
                 + f'<br>{chip(colour.get(p, "#f1ead8"), full_name(p), p)}{rune}</div>')
    dev = ''.join(f'<span class="chip" style="color:#c0a081">{img(f"g3-{s}-14.png", "i14")}{w}</span>'
                  for s, w in zip(DEVICE_SKILLS, ['砲台2・3', '修機1・2', '盾機1・3', '地雷2・1', '線圈1・2']))
    moons = ''.join(chip('#e6c6ff', f'月相：{a}→{b}', f'mech-moon-{k}') for k, a, b in
                    [('first', '上弦', '滿月'), ('full', '滿月', '下弦'), ('waning', '下弦', '新月'), ('new', '新月', '上弦')])
    h.append('<h2>3. 放進遊戲的字框裡（1× 與 2×）</h2><p class="note">遊戲裡的實際畫面見上方的遊戲內截圖。</p>')
    for z in ('', 'zoom2'):
        h.append(f'<div class="{z}"><div class="win"><div class="head">隊伍狀態列</div><div class="field">'
                 + ''.join(chip(colour[p], w, p) for p, w in [('ail-sleep', '睡眠2'), ('ail-bleed', '流血×2'), ('mech-heat', '熱度3'), ('ail-burn', '灼燒3'), ('mech-beat', '拍子4・終幕')])
                 + f'</div><div class="field" style="margin-top:4px">{dev}</div><div class="head" style="margin-top:6px">戰場橫幅</div><div class="field">'
                 + chip('#4ac2ff', '守之結界・雷3', 'mech-ward') + chip('#d6ff7b', '淨之結界2', 'mech-purify') + chip('#ffe845', '雷', 'mech-thunder')
                 + f'</div><div class="field" style="margin-top:4px">{moons}</div><div class="head" style="margin-top:6px">敵人頭上</div><div class="field">'
                 + chip('#ff6cd9', '暗記', 'mech-mark') + chip('#ff9bb8', '瞄準3・鎖定', 'mech-aim') + chip(colour['ail-poison'], '中毒', 'ail-poison') + '</div></div></div>')
    h.append('<h2>4. QA</h2><div class="scroll"><table><tr><th>id</th><th>尺寸</th><th>狀態</th><th>批次</th><th>結果</th><th>殘色</th><th>半透明</th><th>溢色</th>'
             '<th>內部擦除</th><th>長/短</th><th>置中</th><th>版本</th></tr>')
    for aid, q in qa.items():
        sj = q['subject']
        h.append(f'<tr><td>{aid}</td><td>{q["size"][0]}×{q["size"][1]}</td><td>{q["status"]}</td><td>{q["batch"]}</td>'
                 f'<td class="{"ok" if q["pass"] else "bad"}">{"pass" if q["pass"] else ", ".join(q["reasons"])}</td><td>{q["residue"]}</td>'
                 f'<td>{q["semi"]}</td><td>{q["magenta_spill"]}</td><td>{q.get("interior_holes", "")}</td><td>{sj["long"]}/{sj["short"]}</td>'
                 f'<td>{sj["centre_off"]}</td><td>{q["attempt"]}</td></tr>')
    h.append('</table></div></body></html>')
    (out / 'review.html').write_text('\n'.join(h), encoding='utf-8', newline='\n')


def main(argv):
    full = '--full' in argv
    out = AF / G._opt(argv, 'out', 'runs/2026-10-24-g4-full' if full else 'runs/2026-10-24-g4-sample')
    reg = G._registry()
    if full:
        shots = sorted(p.name for p in (out / 'ingame').glob('*.png')) if (out / 'ingame').is_dir() else []
        qa = full_copy(out, reg); full_montage(out); full_page(out, qa, shots)
    else:
        qa = copy_inputs(out, reg); montage(out); page(out, qa)
    print(out / 'review.html')


if __name__ == '__main__':
    main(sys.argv[1:])
