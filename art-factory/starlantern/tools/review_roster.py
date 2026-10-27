"""review_roster.py <r0..r4> [--out=DIR] [--contact=PNG]: the monster roster's review page (roster plan Task D3, spec §13.5)
-> tmp/starlantern/review-roster/<round>/index.html, with every image it shows under img/.

Eight sections (no section for the bestiary's unknown-foe outline: ruling 18 shows only 「？？？」):
  1 battle    every foe of the round in the game's battle layout on the three battle backdrops (BattleView.setup's sizes)
  2 legacy    beside the nine legacy foes at their native pixels
  3 tints     the seven region looks (BattleView tintMatrix: brightness x colour; the glow is not drawn)
  4 groups    swarm foes three in a row, many-part bosses with their parts, wardens with what they summon
  5 icons     material icons in a list row, the uniques in a bag cell with the unique frame and large, the forget chip
  6 story     each story foe's gate and what must never be drawn, with boxes to tick
  7 qa        every asset's QA numbers, its sha256, and every attempt with its QA
  8 rejected  why each attempt that was not used was not used
Read-only for the registry and public/. Records the sha256 of every final it shows in work/review/roster-<round>-shown.json;
`roster_art.py approve` refuses an asset whose file changed since. --contact also writes one PNG contact sheet of the round
at the game's real display scale (the controller shows it to the user)."""
import html, json, re, shutil, sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
import roster_art as R  # noqa: E402
import sl_art as A  # noqa: E402

REPO = R.REPO
PUB = REPO / 'public/assets/games/starlantern'
OUT = REPO / 'tmp/starlantern/review-roster'
LEGACY = ['slime', 'bat', 'wolf', 'beetle', 'wisp', 'lizard', 'golem', 'shade', 'lanterneater']
STAGE = (640, 360)              # ui2/stage.ts STAGE_W, STAGE_H
LEFT, BOTTOM = 150, 70          # ui2/scenes/battle.ts BATTLE_LEFT, BATTLE_BOTTOM
FOE_H, BOSS_H, SLOT_FILL, FEET = 0.45, 0.62, 0.9, 28   # render/BattleView.ts setup / placeBody
# render/BattleView.ts TINT_COLORS, TINT_STYLE.mix (the glow and the iron rim are filters on top; not drawn here)
TINTS = [('本道', None, 0), ('熾焰', 0xff6a2a, 0.56), ('霜凍', 0x5fe3f2, 0.58), ('雷鳴', 0xffe14a, 0.5),
         ('腐毒', 0x8fd14f, 0.48), ('暗影', 0xa274ff, 0.64), ('鋼鐵', 0x9cb8dc, 0.72)]
PARTS_OF = {'old-city-archon': ['archon-hand', 'archon-hand'], 'rime-sovereign': ['rime-pillar', 'rime-pillar']}
SUMMONS = {'requiem-conductor': 'requiem-choir', 'lantern-brood': 'lantern-larva', 'ice-shrine': 'ice-komainu',
           'mirage-lead': 'mirage-dancer', 'grey-elder': 'spore-moth', 'gate-breaker': 'fallen-knight', 'ember-maw': 'wick-shade',
           'gorged-beast': 'wick-shade', 'requiem-choir': 'lamp-wight', 'mirage-city': 'mirage-dancer', 'faceless-host': 'mirror-thief',
           'fortress-colossus': 'rivet-golem', 'bog-mother': 'slime'}
PAIRS = ('mist-twin', 'ice-komainu')
FONT = Path('C:/Windows/Fonts/msjh.ttc')


def esc(s): return html.escape(str(s))


def font(size):
    try: return ImageFont.truetype(str(FONT), size)
    except OSError: return ImageFont.load_default()


# --- the game's battle layout --------------------------------------------------------------------------------------------------
def placement(size, i, n, boss):
    """(scale, box) of foe i of n on the 640 x 360 stage, as BattleView.placeBody: fitted to 45% (a boss 62%) of the height
    above the party bar and 90% of its slot, anchored at its feet on the ground line 28 px above the bar."""
    w, h = size; usable = STAGE[1] - BOTTOM; slot = (STAGE[0] - LEFT) / (n + 1)
    k = min(usable * (BOSS_H if boss else FOE_H) / h, slot * SLOT_FILL / w)
    dw, dh = max(1, round(w * k)), max(1, round(h * k)); cx = LEFT + slot * (i + 1); ground = usable - FEET
    x0 = round(cx - dw / 2)
    return k, (x0, ground - dh, x0 + dw, ground)


def backdrop(bg):
    """BattleView.backdrop: cover the stage, centred, nearest-neighbour."""
    k = max(STAGE[0] / bg.width, STAGE[1] / bg.height); big = bg.convert('RGB').resize((round(bg.width * k), round(bg.height * k)), Image.NEAREST)
    x, y = (big.width - STAGE[0]) // 2, (big.height - STAGE[1]) // 2
    return big.crop((x, y, x + STAGE[0], y + STAGE[1]))


def battle_scene(bg, sprites, bosses, tint=None):
    out = backdrop(bg)
    for i, (s, boss) in enumerate(zip(sprites, bosses)):
        s = s.convert('RGBA'); _, (x0, y0, x1, y1) = placement(s.size, i, len(sprites), boss)
        big = s.resize((x1 - x0, y1 - y0), Image.NEAREST)
        if tint: big = tinted(big, *tint)
        out.paste(big, (x0, y0), big)
    return out


def tinted(img, colour, mix):
    """BattleView.tintMatrix: each channel = mix x luminance x colour x 1.3 + (1 - mix) x itself + 0.04 x colour."""
    a = np.asarray(img.convert('RGBA')).astype(np.float64) / 255.0; rgb = a[..., :3]
    c = np.array([(colour >> 16) & 255, (colour >> 8) & 255, colour & 255]) / 255.0
    lum = rgb @ np.array([0.299, 0.587, 0.114])
    out = mix * lum[..., None] * c * 1.3 + (1 - mix) * rgb + 0.04 * c
    a[..., :3] = np.clip(out, 0, 1)
    return Image.fromarray((a * 255).round().astype(np.uint8), 'RGBA')


def strip(images, scale=2, gap=12, bg=(20, 22, 34), pad=10):
    """Images side by side, bottom-aligned, enlarged by `scale` (nearest)."""
    ims = [i.convert('RGBA').resize((i.width * scale, i.height * scale), Image.NEAREST) for i in images]
    w = sum(i.width for i in ims) + gap * (len(ims) - 1) + 2 * pad; h = max(i.height for i in ims) + 2 * pad
    out = Image.new('RGB', (w, h), bg); x = pad
    for i in ims: out.paste(i, (x, h - pad - i.height), i); x += i.width + gap
    return out


def stack(images, gap=12, bg=(12, 12, 18)):
    w = max(i.width for i in images); h = sum(i.height for i in images) + gap * (len(images) - 1)
    out = Image.new('RGB', (w, h), bg); y = 0
    for i in images: out.paste(i, (0, y)); y += i.height + gap
    return out


# --- what a round shows ----------------------------------------------------------------------------------------------------------
def _final(reg, aid):
    e = reg.data['assets'].get(aid, {}); f = A._final_path(e['final']) if e.get('final') else None
    return f if f is not None and f.is_file() else None


def _sprite(reg, eid):
    """A foe's picture: a roster final if there is one, else a legacy runtime sprite."""
    f = _final(reg, f'enemy-{eid}')
    if f: return Image.open(f)
    p = PUB / 'enemy' / f'{eid}.png'
    return Image.open(p) if p.is_file() else None


def _is_boss(eid):
    d = R.roster_defs().get(eid)
    return eid == 'lanterneater' if d is None else R.cls_of(d) == 'boss'


def _scenes(reg, foes):
    """The battle groups for a round: the swarm three at a time, the rest up to three a fight, each boss alone."""
    normal = [e for e in foes if not _is_boss(e)]; bosses = [e for e in foes if _is_boss(e)]
    groups = [normal[i:i + 3] for i in range(0, len(normal), 3)] + [[b] + PARTS_OF.get(b, []) for b in bosses]
    return [g for g in groups if all(_sprite(reg, e) for e in g)]


def _scene(reg, bg, group, tint=None):
    return battle_scene(bg, [_sprite(reg, e) for e in group], [_is_boss(e) for e in group], tint)


def _groups(reg, foes):
    out = []
    for e in foes:
        d = R.roster_defs()[e]
        if R.cls_of(d) == 'swarm': out.append([e, e, e])
        if e in PAIRS: out.append([e, e])
        if e in PARTS_OF: out.append([e] + PARTS_OF[e])
        if e in SUMMONS: out.append([e, SUMMONS[e]])
    return [g for g in out if all(_sprite(reg, x) for x in g)]


def _names():
    return {**{e: d['name'] for e, d in R.roster_defs().items()}, **R.material_names(), **R.unique_names()}


def _owner_name(aid, names):
    if aid.startswith('enemy-'): return names.get(aid[6:], aid)
    if aid == R.FORGET_ASSET: return '遺忘（異常小圖示）'
    if aid.startswith('icon-'): return names.get(aid[5:], aid)
    u = aid[5:]; u = u[:-6] if u.endswith('-large') else u
    return names.get(u, aid) + ('（大圖）' if aid.endswith('-large') else '')


def qa_numbers(q):
    keys = ('height', 'width', 'colours', 'lum', 'erased', 'size', 'holes', 'magenta_spill', 'interior_holes')
    nums = ', '.join(f'{k} {q[k]}' for k in keys if k in q)
    verdict = '通過' if q.get('pass') else '不通過：' + '、'.join(q.get('reasons', []))
    return verdict + (f'（{nums}）' if nums else '') + ('；警告 ' + '、'.join(q['warnings']) if q.get('warnings') else '')


CSS = """
body{margin:0;padding:16px;background:#14131c;color:#e8e4f0;font:14px/1.6 system-ui,sans-serif}
h1{font-size:20px;margin:0 0 8px}h2{font-size:17px;margin:28px 0 8px;border-bottom:1px solid #3a3550;padding-bottom:4px}
p.lead{color:#c9c2db;max-width:960px}
img{image-rendering:pixelated}
.stage{display:block;width:100%;max-width:1280px;height:auto;margin:8px 0}
.wide{display:block;max-width:100%;height:auto}
.row{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end}
.cell{background:#1d1b29;border:1px solid #2e2a40;border-radius:4px;padding:8px;min-width:120px}
.list{display:flex;align-items:center;gap:6px;font-size:12px;background:#0f0e16;padding:2px 6px;border-radius:2px}
.list img{width:16px;height:16px;object-fit:contain}
.x1{zoom:1}.x3{zoom:3}
.bag{position:relative;width:28px;height:28px;background:#0f0e16}
.bag .frame{position:absolute;inset:0;width:28px;height:28px}
.bag .g26{position:absolute;left:1px;top:1px;width:26px;height:26px}
.chip{display:inline-flex;align-items:center;gap:1px;font-size:12px;color:FORGET_FILL;background:#0f0e16;padding:0 4px}
.chip img{width:14px;height:14px}
.story{display:flex;gap:12px;align-items:flex-start}
table{border-collapse:collapse;width:100%;font-size:12px}td,th{border:1px solid #2e2a40;padding:4px;vertical-align:top;text-align:left}
td.ver img{zoom:2}
.mono{font-family:ui-monospace,monospace;font-size:11px;word-break:break-all}
.note{color:#a79fc0;font-size:12px}
@media (max-width:640px){body{padding:16px}table{font-size:11px}}
"""


def forget_fill():
    """The colour the game draws 遺忘 in: AILMENT_FILL.forget in render/ailmentStyle.ts (#66B87E, spec §0 items 17 and 19; the
    art's own #8FD9B6 was too close to other chips), so the chip on the page reads as it will in battle (plan E1c)."""
    m = re.search(r'\bforget: 0x([0-9a-fA-F]{6})', (R.GAME / 'render/ailmentStyle.ts').read_text(encoding='utf-8'))
    if not m: raise ValueError('AILMENT_FILL.forget not found in render/ailmentStyle.ts')
    return '#' + m.group(1).lower()


def main(rnd='r0', out=None, contact=None):
    reg = A.Registry(R.REG_PATH)                       # read-only: never saved here
    out = Path(out or OUT / rnd); img = out / 'img'
    if img.exists(): shutil.rmtree(img)
    img.mkdir(parents=True, exist_ok=True)
    names = _names(); aids = R.batch_assets(rnd)
    finals = {a: f for a in aids if (f := _final(reg, a))}
    shown = {a: R.sha256(f) for a, f in finals.items()}
    for a, f in finals.items(): shutil.copyfile(f, img / f'{a}.png')
    sp = R.shown_path(rnd); sp.parent.mkdir(parents=True, exist_ok=True)
    sp.write_text(json.dumps({'batch': rnd, 'parts': shown}, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    foes = [a[6:] for a in aids if a.startswith('enemy-') and a in finals]
    bgs = {n: Image.open(PUB / 'bg' / f'f{n}.png') for n in (1, 2, 3) if (PUB / 'bg' / f'f{n}.png').is_file()}
    pg = [f'<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
          f'<title>名冊美術 {rnd.upper()}</title><style>{CSS.replace('FORGET_FILL', forget_fill())}</style></head><body>',
          f'<h1>星燈迷宮 怪物名冊美術 {rnd.upper()}（尚未發布）</h1>',
          '<p class="lead">' + ('R0 是風格樣本，也是唯一要你核准的一批：核准之後，R1–R4 每一批通過機械 QA 與全新脈絡的獨立審核就會發布，你之後隨時可以要求換掉任何一張。'
                                if rnd == 'r0' else f'{rnd.upper()} 由機械 QA 與全新脈絡的獨立審核決定是否發布（裁定 21）；你之後隨時可以要求換掉任何一張。') + '</p>']
    # 1 battle
    pg.append('<section id="sec-battle"><h2>1. 遊戲內大小（三張戰鬥背景，640×360 舞台、照 BattleView 的位置與縮放）</h2>'
              '<p class="note">一般怪佔可用高度 45%、頭目 62%，最多三隻一場；守關者在遊戲裡另有菁英的金色描邊（這裡沒畫）。</p>')
    groups = _scenes(reg, foes)
    for n, bg in bgs.items():
        if not groups: break
        stack([_scene(reg, bg, g) for g in groups]).save(img / f'battle-f{n}.png')
        pg.append(f'<img class="stage" src="img/battle-f{n}.png" alt="第 {n} 層背景">')
    pg.append('</section>')
    # 2 legacy
    pg.append('<section id="sec-legacy"><h2>2. 和既有 9 隻並排（原始像素 ×2）</h2>')
    olds = [i for e in LEGACY if (i := _sprite(reg, e))]
    news = [Image.open(finals[f'enemy-{e}']) for e in foes]
    if olds or news: strip(olds + news).save(img / 'legacy.png'); pg.append('<img class="wide" src="img/legacy.png" alt="新舊並排">')
    pg.append('<p class="note">左邊是既有的 ' + '、'.join(LEGACY) + '；右邊是這一批：' + '、'.join(names.get(e, e) for e in foes) + '。</p></section>')
    # 3 tints
    pg.append('<section id="sec-tints"><h2>3. 七種地區色調（和遊戲的 tintMatrix 同公式；不含光暈）</h2><p class="note">'
              + '、'.join(t[0] for t in TINTS) + '</p>')
    rows = [strip([tinted(i, c, m) if c else i for _, c, m in TINTS]) for i in news]
    if rows: stack(rows).save(img / 'tints.png'); pg.append('<img class="wide" src="img/tints.png" alt="地區色調">')
    pg.append('</section>')
    # 4 groups
    pg.append('<section id="sec-groups"><h2>4. 群、成對、多部位、守關者與召喚</h2>')
    gs = _groups(reg, foes)
    if gs and bgs:
        stack([_scene(reg, bgs[min(bgs)], g) for g in gs]).save(img / 'groups.png')
        pg.append('<img class="stage" src="img/groups.png" alt="成組">')
    pg.append('<p class="note">' + ('；'.join('＋'.join(names.get(x, x) for x in g) for g in gs) or '這一批沒有成組的怪物。') + '</p></section>')
    # 5 icons
    pg.append('<section id="sec-icons"><h2>5. 圖示放進遊戲：清單列（16px）、原始大小、×3；專屬獨特放進背包格與大圖；遺忘異常</h2><div class="row">')
    frame = PUB / 'ui' / 'rarity-unique.png'
    if frame.is_file(): shutil.copyfile(frame, img / 'ui-rarity-unique.png')
    for a in aids:
        if a not in finals: continue
        nm = esc(_owner_name(a, names))
        if a == R.FORGET_ASSET:
            pg.append(f'<div class="cell"><span class="chip"><img src="img/{a}.png" alt="">遺忘</span> <img class="x3" src="img/{a}.png" alt=""><br>{nm}</div>')
        elif a.startswith('icon-'):
            pg.append(f'<div class="cell"><div class="list"><img src="img/{a}.png" alt="">{nm} ×3</div>'
                      f'<img class="x1" src="img/{a}.png" alt=""> <img class="x3" src="img/{a}.png" alt=""></div>')
        elif a.startswith('gear-') and not a.endswith('-large'):
            fr = '<img class="frame" src="img/ui-rarity-unique.png" alt="">' if frame.is_file() else ''
            large = f'<img src="img/{a}-large.png" alt="">' if f'{a}-large' in finals else ''
            pg.append(f'<div class="cell"><div class="bag">{fr}<img class="g26" src="img/{a}.png" alt=""></div>{large}<br>{nm}</div>')
    pg.append('</div></section>')
    # 6 story
    pg.append('<section id="sec-story"><h2>6. 故事怪物：閘門與「不得畫出的東西」（請逐項打勾）</h2>')
    story = [e for e in foes if e in R.STORY]
    for e in story:
        gate, never = R.STORY[e]
        items = list(never) + (['沒有清楚的臉（no_face 人工檢查）'] if R._no_face(e, R.roster_defs()[e]) else [])
        pg.append(f'<div class="cell story" data-story="{e}"><img class="x1" src="img/enemy-{e}.png" alt=""><div><b>{esc(names.get(e, e))}</b>'
                  f'<br>圖鑑閘門：{esc(gate)}<br>不得畫出：<ul>' + ''.join(f'<li><label><input type="checkbox"> {esc(x)}</label></li>' for x in items)
                  + '</ul></div></div>')
    if not story: pg.append('<p class="note">這一批沒有故事怪物。</p>')
    pg.append('</section>')
    # 7 qa and every version
    pg.append('<section id="sec-qa"><h2>7. QA 數字與所有版本</h2><table><tr><th>素材</th><th>狀態與 QA</th><th>sha256</th><th>描述</th><th>所有版本</th></tr>')
    for a in aids:
        e = reg.data['assets'].get(a, {}); q = e.get('qa') or {}
        sid = e.get('source_id') or a
        vers = []
        for raw in R.attempts(sid):
            k = 'a' + raw.stem.rsplit('-a', 1)[1]; c = R.WORK / sid / 'cand' / k / f'{a}.png'; cq = c.with_suffix('.qa.json')
            if c.is_file():
                shutil.copyfile(c, img / f'cand-{a}-{k}.png')
                qq = json.loads(cq.read_text(encoding='utf-8')) if cq.is_file() else {}
                used = '（採用）' if e.get('chosen_attempt') == k else ''
                vers.append(f'<div><img src="img/cand-{a}-{k}.png" alt="{k}"> {k}{used}：{esc(qa_numbers(qq))}</div>')
        owner = a[6:] if a.startswith('enemy-') else None
        desc = R.DESC.get(owner) if owner else R.MAT_DESC.get(a[5:]) if a.startswith('icon-') else ''
        pg.append(f'<tr><td>{esc(_owner_name(a, names))}<br><span class="mono">{a}</span></td><td>{esc(e.get("status", "未挑選"))}：'
                  f'{esc(qa_numbers(q)) if q else "—"}</td><td class="mono">{shown.get(a, "—")[:12]}</td><td class="note">{esc(desc or "")}</td>'
                  f'<td class="ver">{"".join(vers) or "—"}</td></tr>')
    pg.append('</table></section>')
    # 8 rejected
    pg.append('<section id="sec-rejected"><h2>8. 淘汰的版本與原因</h2><ul>')
    seen = set()
    for j in R.jobs():
        for key in [j['id']] + [a for p in j['parts'] for a in R.assets_of(j, p)]:
            if key in seen or not any(R.round_of(a) == rnd for p in j['parts'] for a in R.assets_of(j, p)): continue
            seen.add(key); e = reg.data['assets'].get(key, {})
            for k, why in (e.get('rejected_attempts') or {}).items():
                plain = (e.get('plain_reasons') or {}).get(k)
                pg.append(f'<li>{esc(key)} {esc(k)}：{esc(plain) + "（" + esc(why) + "）" if plain else esc(why)}</li>')
    pg.append('</ul></section></body></html>')
    page = out / 'index.html'; page.write_text('\n'.join(pg), encoding='utf-8')
    if contact: contact_sheet(reg, rnd, contact, foes, finals, names, bgs)
    return page


# --- the contact sheet the controller shows the user -----------------------------------------------------------------------------
COMPARE = (['wolf', 'root-hound', 'slime'], ['lanterneater'])   # one fight mixing new and old, and the old boss


def _label(im, text, size=18):
    f = font(size); w = max(im.width, int(ImageDraw.Draw(im).textlength(text, font=f)) + 8)
    out = Image.new('RGB', (w, im.height + size + 10), (12, 12, 18)); out.paste(im, (0, size + 10))
    ImageDraw.Draw(out).text((4, 2), text, font=font(size), fill=(232, 228, 240)); return out


def contact_sheet(reg, rnd, path, foes, finals, names, bgs):
    """One PNG: every foe of the round in the battle layout on the three backdrops at 1x (the game's 640 x 360 stage), a
    fight mixing new and approved old foes, the old boss beside the new one, then the icons at the sizes the game shows them
    (list 16 px, the bag's 26 px gear in a 28 px cell, the 14 px chip) and the same enlarged x3."""
    rows = []
    groups = _scenes(reg, foes)
    for n, bg in bgs.items():
        rows.append(_label(_hcat([_scene(reg, bg, g) for g in groups]), f'第 {n} 層背景（1×，遊戲舞台 640×360）：' + ' ｜ '.join('、'.join(names.get(e, e) for e in g) for g in groups)))
    mix = [g for g in COMPARE if all(_sprite(reg, e) for e in g)]
    boss = next((e for e in foes if _is_boss(e)), None)
    cmp_scenes = [_scene(reg, bgs[min(bgs)], g) for g in mix] + ([_scene(reg, bgs[min(bgs)], [boss])] if boss else [])
    if cmp_scenes:
        rows.append(_label(_hcat(cmp_scenes), '對照：既有核准的怪物（' + '、'.join(names.get(e, e) for g in mix for e in g) + '）與新怪同場；右邊是新頭目'))
    drawn = drawn_assets(reg, rnd)
    rows.append(_label(_icons(drawn, names), f'圖示（本輪表上畫的全部 {sum(a.startswith("icon-") and a != R.FORGET_ASSET for a in drawn)} 個素材圖示、遺忘異常圖示與 '
                       f'{sum(a.startswith("gear-") and not a.endswith("-large") for a in drawn)} 件專屬獨特）：第一排遊戲內實際大小'
                       '（清單 16px／背包 26px＋獨特外框／異常 14px），第二排 ×3，第三排原始像素 ×2（素材圖示與 64px 大圖）'))
    stack(rows, gap=16).save(path)
    return path


def drawn_assets(reg, rnd):
    """{asset: final} of every icon and unique the contact sheet shows: all drawn on this round's own sheets (R0 draws R1's
    too, so the whole style is seen at once) and every one of this round's own, wherever drawn (R1's are on R0's sheets)."""
    return {a: f for j in R.jobs() if j['kind'] != 'sprite' for p in j['parts'] for a in R.assets_of(j, p)
            if (j['batch'] == rnd or R.round_of(a) == rnd) and (f := _final(reg, a))}


def _hcat(images, gap=12):
    w = sum(i.width for i in images) + gap * (len(images) - 1); h = max(i.height for i in images)
    out = Image.new('RGB', (w, h), (12, 12, 18)); x = 0
    for i in images: out.paste(i, (x, 0)); x += i.width + gap
    return out


def _icons(finals, names):
    """The icons at their game sizes on the game's dark panel, then x3."""
    icons = [a for a in finals if a.startswith('icon-') and a != R.FORGET_ASSET]
    gear = [a for a in finals if a.startswith('gear-') and not a.endswith('-large')]
    frame = PUB / 'ui' / 'rarity-unique.png'; fr = Image.open(frame).convert('RGBA') if frame.is_file() else None
    tiles = []
    for a in icons:
        im = Image.open(finals[a]).convert('RGBA'); im.thumbnail((16, 16), Image.NEAREST); t = Image.new('RGBA', (16, 16)); t.paste(im, ((16 - im.width) // 2, (16 - im.height) // 2)); tiles.append(t)
    for a in gear:
        t = Image.new('RGBA', (28, 28), (15, 14, 22, 255))
        if fr: t.paste(fr.resize((28, 28), Image.NEAREST), (0, 0), fr.resize((28, 28), Image.NEAREST))
        g = Image.open(finals[a]).convert('RGBA'); t.paste(g, (1, 1), g); tiles.append(t)
    if R.FORGET_ASSET in finals: tiles.append(Image.open(finals[R.FORGET_ASSET]).convert('RGBA'))
    native = [Image.open(finals[a]).convert('RGBA') for a in icons] + [Image.open(finals[a + '-large']).convert('RGBA') for a in gear if a + '-large' in finals]
    row1 = strip(tiles, scale=1, gap=8, bg=(15, 14, 22)); row2 = strip(tiles, scale=3, gap=12, bg=(15, 14, 22))
    row3 = strip(native, scale=2, gap=12, bg=(15, 14, 22)) if native else None
    return stack([r for r in (row1, row2, row3) if r is not None], gap=8)


if __name__ == '__main__':
    args = sys.argv[1:]
    rnd = next((a for a in args if not a.startswith('--')), 'r0')
    opt = lambda k: next((a.split('=', 1)[1] for a in args if a.startswith(f'--{k}=')), None)
    print(main(rnd, opt('out'), opt('contact')))
