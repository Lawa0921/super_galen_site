"""review_runes.py: the rune-icon review page and its 4x montage (art step 9, G4): the sample, or the full set.

  python art-factory/starlantern/tools/review_runes.py [--out runs/2026-10-24-rune-icons-sample]
  python art-factory/starlantern/tools/review_runes.py --full [--out runs/2026-10-24-rune-icons-full]

Reads the registry's `rune-sample` batch (rune_art.py pick), copies each icon and the comparison art (G3 native skill
icons, published gear icons, published rarity frames) into <out>/img/, and writes review.html (each icon at 1x / 2x /
4x, in each tier frame, and inside mocks of the real UI rows) and montage-4x.png. Nothing is approved or published.
"""
import html, json, re, shutil, sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gear_art as G  # noqa: E402
import rune_art as R  # noqa: E402

AF, REPO = G.AF, G.REPO
PUB = REPO / 'public/assets/games/starlantern'
TIERS = ['common', 'magic', 'rare', 'epic', 'legendary']
TIER_NAME = {'common': '普通', 'magic': '魔法', 'rare': '稀有', 'epic': '史詩', 'legendary': '傳說'}
TIER_TEXT = {'common': '#e8e8e8', 'magic': '#6f9cff', 'rare': '#ffd84a', 'epic': '#b36bff', 'legendary': '#ff9a3c'}
NAMES = {'rune-slot-empty': '空插槽', 'rune-slot-filled': '已鑲插槽', 'rune-flame': '灼焰', 'rune-spread': '擴散',
         'rune-on-crit': '暴擊觸發', 'rune-twin-cast': '雙重詠唱'}
# Which tiers to show each rune in (a legendary rune has one tier; the slot icons have none).
SHOW_TIERS = {'rune-flame': ['common', 'magic'], 'rune-spread': ['rare', 'epic'], 'rune-on-crit': ['magic'], 'rune-twin-cast': ['legendary']}
SKILLS = {'fire-star': ('sheet-icons-1', '火之星彈'), 'flame-wave': ('sheet-skill-noel', '炎之波'), 'aimed-shot': ('sheet-icons-1', '瞄準射擊')}
GEAR = {'crystal-blade': '晶刃', 'copper-ring': '銅戒指'}
BG = (10, 14, 34, 255)   # $slx-win
# The sample's six parts; --full swaps in the 34 of the full set (configure_full).
PARTS = list(R.SAMPLE_PARTS)
FULL = {'on': False}


def rune_names():
    """Every rune's zh-TW name from the game's data (data/runes.ts), keyed `rune-<id>`, and the two slot states."""
    src = (REPO / 'src/scripts/games/starlantern/data/runes.ts').read_text(encoding='utf-8')
    pairs = re.findall(r"id: '([a-z-]+)', name: '([^']+)'", src) + re.findall(r"^  (?:element|perHit|trigger)\('([a-z-]+)', '([^']+)'", src, re.M)
    return {'rune-slot-empty': '空插槽', 'rune-slot-filled': '已鑲插槽', **{f'rune-{i}': n for i, n in pairs}}


def configure_full():
    global PARTS, NAMES, SHOW_TIERS
    PARTS = [p for ps in R.FULL_SHEETS.values() for p in ps if p]
    NAMES = rune_names()
    legend = set(R.FULL_SHEETS['sheet-rune-6'])
    SHOW_TIERS = {p: (['legendary'] if p in legend else TIERS[:4]) for p in PARTS if not p.startswith('rune-slot')}
    FULL['on'] = True


def copy_inputs(out, reg):
    img = out / 'img'; img.mkdir(parents=True, exist_ok=True)
    qa = {}
    for part in PARTS:
        for aid in R.assets_of(part):
            e = reg.get(aid); shutil.copyfile(REPO / e['final'], img / f'{aid}.png')
            qa[aid] = dict(e['qa'], legible=e.get('legible'), attempt=f"{e.get('sheet', '')} {e.get('chosen_attempt', '')}".strip())
    for sid, (sheet, _) in SKILLS.items():
        shutil.copyfile(AF / 'work' / sheet / f'icon-{sid}-16.png', img / f'skill-{sid}-16.png')
    for gid in GEAR: shutil.copyfile(PUB / 'gear' / f'{gid}.png', img / f'gear-{gid}.png')
    for t in TIERS[1:]: shutil.copyfile(PUB / 'ui' / f'rarity-{t}.png', img / f'rarity-{t}.png')
    return qa


def framed(icon, tier):
    """A 20 x 20 rune cell: the 16 icon centred, the tier's nine-slice frame (slice 5, edges repeated) over it."""
    cell = Image.new('RGBA', (20, 20), (0, 0, 0, 0)); cell.alpha_composite(icon, (2, 2))
    if tier != 'common':
        f = Image.open(PUB / 'ui' / f'rarity-{tier}.png').convert('RGBA')   # 16 x 16, slice 5
        fr = Image.new('RGBA', (20, 20), (0, 0, 0, 0))
        for (sx, sy, dx, dy) in ((0, 0, 0, 0), (11, 0, 15, 0), (0, 11, 0, 15), (11, 11, 15, 15)):
            fr.alpha_composite(f.crop((sx, sy, sx + 5, sy + 5)), (dx, dy))
        for x in range(5, 15, 6):   # edges repeat (border-image-repeat: repeat): the 6 px middle twice minus the overlap
            w = min(6, 15 - x)
            fr.alpha_composite(f.crop((5, 0, 5 + w, 5)), (x, 0)); fr.alpha_composite(f.crop((5, 11, 5 + w, 16)), (x, 15))
            fr.alpha_composite(f.crop((0, 5, 5, 5 + w)), (0, x)); fr.alpha_composite(f.crop((11, 5, 16, 5 + w)), (15, x))
        cell.alpha_composite(fr)
    return cell


def montage(out):
    """Each sample icon at 4x: the 16 and the 14, then the 16 in each of its tier cells (20 x 20)."""
    rows = []
    for part in PARTS:
        i16 = Image.open(out / 'img' / f'icon-{part}-16.png').convert('RGBA'); i14 = Image.open(out / 'img' / f'icon-{part}-14.png').convert('RGBA')
        rows.append([i16, i14] + [framed(i16, t) for t in SHOW_TIERS.get(part, [])])
    s, gap = 4, 6
    cols = 2 if len(rows) > 8 else 1   # the full set in two columns, so the montage stays about square
    per = -(-len(rows) // cols)
    colw = max(sum(im.width for im in r) + gap * (len(r) + 1) for r in rows)
    rowh = max(max(im.height for im in r) for r in rows) + gap
    sheet = Image.new('RGBA', (colw * cols * s, (per * rowh + gap) * s), BG)
    for k, r in enumerate(rows):
        x = gap + (k // per) * colw; y = gap + (k % per) * rowh
        for im in r:
            sheet.alpha_composite(im.resize((im.width * s, im.height * s), Image.NEAREST), (x * s, y * s)); x += im.width + gap
    sheet.save(out / 'montage-4x.png')


CSS = '''
:root{color-scheme:dark;--bg:#16182a;--card:#22253a;--ink:#e6e6f0;--dim:#9a9cb4;--ok:#7fd49a;--bad:#ff8a8a;--warn:#ffd27a}
@font-face{font-family:'Cubic 11';src:url('../../../../public/assets/fonts/cubic-11/Cubic_11.woff2') format('woff2'),url('/assets/fonts/cubic-11/Cubic_11.woff2') format('woff2')}
body{margin:0;padding:16px;background:var(--bg);color:var(--ink);font:15px/1.6 system-ui,"Noto Sans TC",sans-serif}
h1{font-size:20px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 8px}p.note{color:var(--dim);margin:0 0 12px;max-width:72em}
.card{background:var(--card);border-radius:8px;padding:12px;margin:0 0 12px;display:inline-block;vertical-align:top;margin-right:12px}
img{image-rendering:pixelated}.px{display:inline-block;vertical-align:middle;margin:0 8px 0 0;background:#0a0e22;padding:4px}
table{border-collapse:collapse}td,th{border-bottom:1px solid #333752;padding:4px 8px;text-align:left;font-size:13px}.ok{color:var(--ok)}.bad{color:var(--bad)}.warn{color:var(--warn)}
/* game look (styles/_starlantern-ui.scss): window, 12px pixel font, menu rows */
.zoom1{zoom:1}.zoom2{zoom:2}.zoom3{zoom:3}
.win{display:inline-block;vertical-align:top;background:rgb(10,14,34);border:2px solid #c9a35a;box-shadow:inset 0 0 0 1px #6e5a2e;border-radius:3px;padding:6px 8px;
 font:12px/16px 'Cubic 11','Noto Sans TC','Microsoft JhengHei',sans-serif;color:#f1ead8;width:300px;margin:0 12px 12px 0;-webkit-font-smoothing:none}
.head{color:#b7ae9a;margin-bottom:2px}.opt{display:flex;align-items:center;gap:4px;padding:2px 8px 2px 16px;position:relative;min-height:16px}
.sel{color:#e8c46a;background:linear-gradient(90deg,rgba(232,196,106,.2),transparent)}.sel::before{content:'→';position:absolute;left:3px}
.right{margin-left:auto;white-space:nowrap}.dim{color:#b7ae9a}.gold{color:#e8c46a}.blue{color:#9fc1ff}.down{color:#ff8a7a}
.ico16{width:16px;height:16px;flex:none}.ico14{width:14px;height:14px;flex:none;vertical-align:-3px}.gear{width:26px;height:26px;flex:none}
.cell{position:relative;width:20px;height:20px;flex:none;display:inline-block;vertical-align:middle}.cell>img{position:absolute;left:2px;top:2px;width:16px;height:16px}
.cell>i{position:absolute;inset:0;border:5px solid transparent;border-image-slice:5;border-image-repeat:repeat;image-rendering:pixelated}
/* after the border shorthand (it resets border-image), at the same specificity plus one */
.cell>i.f-magic{border-image-source:url(img/rarity-magic.png)}.cell>i.f-rare{border-image-source:url(img/rarity-rare.png)}.cell>i.f-epic{border-image-source:url(img/rarity-epic.png)}.cell>i.f-legendary{border-image-source:url(img/rarity-legendary.png)}
.skill{display:flex;align-items:center;gap:4px;padding:2px 0}.skill .name{margin-right:4px}.slots{display:inline-flex;gap:1px}
.t-common{color:#e8e8e8}.t-magic{color:#6f9cff}.t-rare{color:#ffd84a}.t-epic{color:#b36bff}.t-legendary{color:#ff9a3c}
.off{filter:grayscale(1);opacity:.55}
'''


def img(src, cls='', alt=''):
    return f'<img class="{cls}" src="img/{src}" alt="{html.escape(alt)}">'


def cell(part, tier):
    return f'<span class="cell">{img(f"icon-{part}-16.png")}' + ('' if tier == 'common' else f'<i class="f-{tier}"></i>') + '</span>'


def mocks():
    e, f = 'rune-slot-empty', 'rune-slot-filled'
    s14 = lambda p, c='': img(f'icon-{p}-14.png', f'ico14 {c}')
    skill = lambda sid: img(f'skill-{sid}-16.png', 'ico16')
    rows = []
    # 1. status tab skill list (statusTabs.ts:321): skill icon, name, slotDots
    rows.append(('狀態頁技能列（statusTabs.ts:321，現在是「火之星彈 ◆○」）', f'''
<div class="head">技能</div>
<div class="skill">{skill('fire-star')}<span class="name">火之星彈</span><span class="slots">{s14('rune-flame')}{s14(e)}</span><span class="dim">單體</span><span class="right">TP 4　3/5</span></div>
<div class="skill">{skill('flame-wave')}<span class="name">炎之波</span><span class="slots">{s14(f)}{s14(e)}</span><span class="dim">全體</span><span class="right">TP 7　1/5</span></div>
<div class="skill">{skill('aimed-shot')}<span class="name">瞄準射擊</span><span class="slots">{s14('rune-spread')}{s14('rune-on-crit', 'off')}{s14(e)}</span><span class="dim">單體</span><span class="right">TP 5　5/5</span></div>
<div class="skill dim">（舊）{skill('fire-star')}<span class="name">火之星彈</span><span class="gold">◆○</span></div>'''))
    # 2. workshop skill list (workshop.ts:431 right = slotDots)
    rows.append(('技能工坊：技能清單（workshop.ts:431，右欄是插槽）', f'''
<div class="head">技能</div>
<div class="opt sel">火之星彈<span class="right">{s14('rune-flame')}{s14(e)}</span></div>
<div class="opt">炎之波<span class="right">{s14(f)}{s14(e)}</span></div>
<div class="opt">瞄準射擊<span class="right">{s14('rune-spread')}{s14('rune-on-crit', 'off')}{s14(e)}</span></div>
<div class="opt dim">（舊）火之星彈<span class="right gold">◆○</span></div>'''))
    # 3. workshop slots (workshop.ts:462)
    rows.append(('技能工坊：插槽（workshop.ts:461，20×20 格＋稀有度外框）', f'''
<div class="head">插槽</div>
<div class="opt sel">槽 1 {cell('rune-flame', 'magic')}<span class="t-magic">灼焰（魔法）</span></div>
<div class="opt">槽 2 {cell(e, 'common')}<span class="dim">空</span></div>
<div class="opt dim">槽 3<span class="right">Lv35 開放</span></div>'''))
    # 4. workshop rune list (workshop.ts:503)
    rows.append(('技能工坊：符文清單（workshop.ts:503–516）', f'''
<div class="head">符文</div>
<div class="opt">拆下</div>
<div class="opt sel">{cell('rune-flame', 'common')}<span class="t-common">灼焰</span><span class="t-common">（普通）</span><span class="right">袋子 3</span></div>
<div class="opt">{cell('rune-spread', 'rare')}<span class="t-rare">擴散</span><span class="t-rare">（稀有）</span><span class="right">袋子 1</span></div>
<div class="opt">{cell('rune-spread', 'epic')}<span class="t-epic">擴散</span><span class="t-epic">（史詩）</span><span class="right">袋子 1</span></div>
<div class="opt">{cell('rune-on-crit', 'magic')}<span class="t-magic">暴擊觸發</span><span class="t-magic">（魔法）</span><span class="right down">需要：傷害</span></div>
<div class="opt">{cell('rune-twin-cast', 'legendary')}<span class="t-legendary">雙重詠唱</span><span class="t-legendary">（傳說）</span><span class="right">袋子 1</span></div>'''))
    # 5. battle menu (battle.ts:310 badge)
    rows.append(('戰鬥技能選單（battle.ts:310 badge，14×14）', f'''
<div class="opt sel">火之星彈{s14('rune-flame')}<span class="right">TP 4</span></div>
<div class="opt">炎之波{s14(f)}<span class="right">TP 7</span></div>
<div class="opt">瞄準射擊{s14('rune-spread')}{s14('rune-on-crit')}<span class="right">TP 5</span></div>
<div class="opt dim">（舊）瞄準射擊<span class="blue">◆◆</span><span class="right">TP 5</span></div>'''))
    # 6. shop rows beside gear icons (shop.ts:270 rune rows, shop.ts:56 gear rows)
    rows.append(('道具店：和已發布裝備圖示同列（shop.ts:56、270）', f'''
<div class="opt">{img('gear-crystal-blade.png', 'gear')}晶刃<span class="right">320 G</span></div>
<div class="opt">{img('gear-copper-ring.png', 'gear')}銅戒指<span class="right">80 G</span></div>
<div class="opt sel">{cell('rune-spread', 'common')}<span class="t-common">擴散（普通）</span><span class="right">60 G</span></div>
<div class="opt">{cell('rune-flame', 'magic')}<span class="t-magic">灼焰（魔法）</span><span class="right">150 G</span></div>'''))
    # 7. build card have / lack (builds.ts:365)
    rows.append(('建議 build 卡片（builds.ts:365，◆有／○缺）', f'''
<div class="dim">{s14(f)} 鑲得上（鑲著或袋子裡有）</div>
<div>瞄準射擊　{s14('rune-spread')}<span class="t-rare">擴散（稀有）</span>　{s14(e)}<span class="down">灼焰</span></div>
<div class="dim">（舊）瞄準射擊　◆擴散（稀有）　<span class="down">○灼焰</span></div>'''))
    return rows


def page(out, qa, cons):
    parts = PARTS
    head = (['<title>符文圖示全套</title>', '<h1>符文圖示全套（第 ⑨ 步 G4；風格已由使用者 2026-10-24 核准：「可以」）</h1>',
             '<p class="note">32 種符文＋空插槽、已鑲插槽，共 34 個主體，6 張 codex 3×2 表（gpt-6-astra，每張最多 2 版，每版各自的新資料夾）。'
             '每格做 16×16（主體長邊 14，技能工坊與道具店）與 14×14（長邊 12，技能列與戰鬥選單），覆蓋取樣、不放大。'
             '階級不畫進圖，用已發布的稀有度外框（普通無框）。14px 規則（rune_art.legibility）與目視兩關都要過；每張圖選自哪一版見 QA 表。</p>']
            if FULL['on'] else
            ['<title>符文圖示樣本</title>', '<h1>符文圖示樣本（第 ⑨ 步 G4，待核准）</h1>',
             '<p class="note">codex（gpt-6-astra）一張 3×2 表，2 次生成，採用 a2（a1 石面裂紋與細線在 16 px 變雜點，退件）。每格做兩張原尺寸圖：'
             '16×16（主體長邊 14，技能工坊）與 14×14（長邊 12，戰鬥選單），覆蓋取樣、不放大，跟 G3 技能圖示同一條管線。'
             '階級不畫進圖，用已核准的稀有度外框（普通無框）。灰階的那顆是「裝著但沒生效」（◇）用 CSS 濾鏡的提案，不是另一張圖。'
             '尚未接進遊戲，也還沒核准。</p>'])
    h = ['<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
         head[0] + f'<style>{CSS}</style></head><body>', head[1], head[2],
         f'<p><a href="montage-4x.png">montage-4x.png</a></p>',
         '<h2>每張圖：1×、2×、4×</h2>']
    for p in parts:
        cellhtml = [f'<div class="card"><b>{NAMES[p]}</b> <span style="color:var(--dim)">{p}</span><br>']
        for s in (16, 14):
            for z in (1, 2, 4):
                cellhtml.append(f'<span class="px"><img src="img/icon-{p}-{s}.png" width="{s * z}" height="{s * z}" alt=""></span>')
            cellhtml.append('<br>')
        cellhtml.append('</div>')
        h.append(''.join(cellhtml))
    h.append('<h2>階級外框（20×20 格，16 圖示置中，外框九宮格 slice 5；1× 與 3×）</h2>')
    for p in parts:
        if p not in SHOW_TIERS: continue
        h.append(f'<div class="card"><b>{NAMES[p]}</b><br>' + ''.join(
            f'<span class="px"><span class="cell">{img(f"icon-{p}-16.png")}{"" if t == "common" else f"<i class=f-{t}></i>"}</span></span>'
            f'<span class="px zoom3"><span class="cell">{img(f"icon-{p}-16.png")}{"" if t == "common" else f"<i class=f-{t}></i>"}</span></span>'
            f'<span class="t-{t}">{TIER_NAME[t]}</span><br>' for t in SHOW_TIERS[p]) + '</div>')
    h.append('<h2>放進遊戲畫面的樣子（字型 Cubic 11 12px；1× 與 2×）</h2>'
             '<p class="note">技能圖示用 G3 已生成的 16×16 原尺寸圖（尚未發布），裝備圖示是已發布的 26×26。每塊下方灰字「（舊）」是現在的文字符號。</p>')
    for zoom in ('zoom1', 'zoom2'):
        h.append(f'<div class="{zoom}">' + ''.join(f'<div class="win"><div class="dim" style="margin-bottom:4px">{html.escape(t)}</div>{body}</div>'
                                                    for t, body in mocks()) + '</div>')
    h.append('<h2>QA</h2><table><tr><th>id</th><th>尺寸</th><th>結果</th><th>殘色</th><th>半透明</th><th>溢色</th><th>長邊/短邊</th><th>mass</th><th>置中偏移</th><th>和技能圖示比</th>'
             + ('<th>14px 規則</th><th>版本</th>' if FULL['on'] else '') + '</tr>')
    for aid, q in qa.items():
        sj = q['subject']; c = cons.get(aid)
        h.append(f'<tr><td>{aid}</td><td>{q["size"][0]}×{q["size"][1]}</td><td class="{"ok" if q["pass"] else "bad"}">{"pass" if q["pass"] else ", ".join(q["reasons"])}'
                 f'{(" <span class=warn>" + ", ".join(q["warnings"]) + "</span>") if q.get("warnings") else ""}</td><td>{q["residue"]}</td><td>{q["semi"]}</td>'
                 f'<td>{q["magenta_spill"]}</td><td>{sj["long"]}/{sj["short"]}</td><td>{sj["mass"]}</td><td>{sj["centre_off"]}</td>'
                 f'<td>{"" if c is None else (", ".join(c["flags"]) or "範圍內")}</td>'
                 + (f'<td class="{"bad" if (q.get("legible") or {}).get("reasons") else "ok"}">{", ".join((q.get("legible") or {}).get("reasons") or []) or "pass"}'
                    f' <span style="color:var(--dim)">{html.escape(json.dumps({k: v for k, v in (q.get("legible") or {}).items() if k != "reasons"}))}</span></td>'
                    f'<td>{q.get("attempt", "")}</td>' if FULL['on'] else '') + '</tr>')
    h.append('</table></body></html>')
    (out / 'review.html').write_text('\n'.join(h), encoding='utf-8')


def skill_subjects():
    return [json.loads(p.read_text(encoding='utf-8'))['subject']
            for p in [*AF.glob('work/sheet-skill-*/icon-*-16.qa.json'), *AF.glob('work/sheet-icons-*/icon-*-16.qa.json')]]


def main(argv):
    if '--full' in argv: configure_full()
    out = AF / (G._opt(argv, 'out', 'runs/2026-10-24-rune-icons-full' if FULL['on'] else 'runs/2026-10-24-rune-icons-sample'))
    reg = G._registry()
    qa = copy_inputs(out, reg)
    cons = R.consistency({a: q['subject'] for a, q in qa.items() if a.endswith('-16')}, skill_subjects())
    montage(out); page(out, qa, cons)
    print(out / 'review.html')


if __name__ == '__main__':
    main(sys.argv[1:])
