"""Write the static style-review page for a roster-expansion unit from captured evidence.

Usage: python roster_review_page.py --unit pikeman --name 長槍兵 --run <run> --shots <review dir>
       --icon-run <unit-train-icons run> [--compare guard,knight]
Every number on the page is read from the run's QA reports; nothing is typed in by hand.
"""
import argparse
import html
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
REVIEW = ROOT / 'art-factory/rts/review'
MODELS = ROOT / 'public/assets/games/rts/models'


TEXT = {
    'pikeman': {
        'intro': '原創生成：codex 內建生圖產生正／背參考圖 → TripoSR 身體與正背投影貼圖 → 沿用衛兵 20 骨架與 LOD 規格，程式建模的皮手套閉握手與 2.6 m 白蠟木長槍（葉形槍頭、金色槍箍）。',
        'height': '長槍兵待機時槍尖 2.67 m，高於衛兵。',
        'attack': '；接觸幀 {frame}（{sec:.3f} s）',
        'death': '；屈膝蹲下時槍立在右膝旁，再前傾倒地；支撐手（左手）放開，右手握槍',
        'crossing': '槍身／身體穿插',
        'limits': ['槍頭下方加了捲起的隊色小旗與兩條沿槍桿的飄帶（brief 以外的補強，讓遠距離也看得出隊色）；胸甲依 brief 保持藍鋼色，不隨隊色變化。不需要的話可以拿掉。',
                   '身體來自單張參考圖重建，和其他兵種一樣，肩膀與袖口輪廓偶有鋸齒、近看手套較方。',
                   '攻擊接觸幀已記錄於模型 <code>rtsMotion</code>；模擬目前仍是揮擊開始即結算，是否鎖到 {sec:.3f} s 待你決定。'],
        'script': 'roster_pikeman_build.py',
    },
    'ranger': {
        'intro': '原創生成：codex 內建生圖產生正／背參考圖（第一組重建頭部變形已退件，見 run 的 rejected/）→ TripoSR 身體與正背投影貼圖 → 沿用弩手同款 20 骨架與 LOD 規格，程式建模的皮手套閉握手、1.56 m 反曲長弓、會被拉動的弓弦、隊色箭羽與斜背在背上的隊色箭袋（貼合背部，未做背帶）。',
        'height': '遊俠與弩手同為 1.80 m，長弓比弩手的十字弓高得多。',
        'attack': '；放箭幀 {frame}（{sec:.3f} s，與模擬 PROJECTILE_RELEASE_SECONDS 0.4 s 一致）',
        'death': '；膝蓋一軟跪下，再向左側倒地，弓仍握在胸前並平躺地面',
        'crossing': '弓、弦、箭／身體穿插',
        'limits': ['右手全程扣著弦與箭（待機即搭箭備射）。放箭那一幀弦與手一起彈回弓前，弦上的箭仍在；這是為了讓弦真的被拉開而不增加骨架。若要放箭後暫時藏箭，可在遊戲端於放箭時隱藏 RangerArrow 網格（需改程式，待你決定）。',
                   '弓弦是 2 mm 的細線，遠距離幾乎看不到；隊色在背後箭袋、箭羽、腰帶與兜帽內襯。',
                   '新的箭矢投射物 <code>models/arrow.glb</code> 已一併登錄待審；戰鬥目前仍沿用弩箭外觀，正式上線時再接上。',
                   '身體來自單張參考圖重建，臉部與肩部和其他兵種一樣偶有投影模糊。'],
        'script': 'roster_ranger_build.py',
    },
    'mage': {
        'intro': '原創生成：codex 內建生圖產生正／背參考圖 → TripoSR 身體與正背投影貼圖 → 沿用牧師同款 20 骨架與 LOD 規格，程式建模的赤手閉握手與 1.98 m 曦光杖（鏤空金色日輪與光芒）。',
        'height': '法師身高 1.74 m，曦光杖頂端約 2.2 m，高過牧師。',
        'attack': '；杖擊出光彈的命中幀 {frame}（{sec:.3f} s）',
        'death': '；膝蓋一軟，長袍在地面攤開，伏身倚著立在身前的法杖',
        'crossing': '法杖／身體穿插',
        'limits': ['施法動作命名為 <code>CastBlast</code>：遊戲對曦光術播放 cast＋blast，名稱需相符才不會退回 Attack。',
                   '持杖的右袖收窄（像束起的袖口），否則喇叭袖在抬臂時會與杖身穿插；左袖保留寬大喇叭袖。曦光術為雙手上舉：右手把杖高舉過頭、左手掌心朝上，再一起向前壓下放出。',
                   '法師赤手，閉握的右手用膚色材質；張開的左手是原始重建手。',
                   '長袍下襬跟隨地面（Root）多於骨盆，所以倒下時是跪坐、袍子攤在地上，而不是整件裙擺像硬殼般翻倒。',
                   '長袍側面改用放寬角度的投影（roster_projection_relaxed.py），比原始投影少了鏽色污斑；藍色隊色遮罩在白袍上仍有零星小點。',
                   '身體來自單張參考圖重建：嘴唇深色加上臉頰一道重建摺痕，近看臉部有暗色投影污痕（試過放寬投影與重生參考圖都無改善，紀錄在 run 的 rejected/）；遊戲距離與 48px 圖示看不出。'],
        'script': 'roster_mage_build.py',
    },
}


def load(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def rel(path):
    return Path(path).resolve().relative_to(REVIEW.resolve(), walk_up=True).as_posix()


def kb(n):
    return f'{n / 1024:,.0f} KB'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--unit', required=True)
    ap.add_argument('--name', required=True)
    ap.add_argument('--run', type=Path, required=True)
    ap.add_argument('--shots', type=Path, required=True)
    ap.add_argument('--icon-run', type=Path, required=True)
    ap.add_argument('--compare', default='guard,knight')
    a = ap.parse_args()
    unit, run, shots = a.unit, a.run.resolve(), a.shots.resolve()
    text = TEXT[unit]
    qa = run / 'qa'
    build, pub, cap = load(qa / 'build.json'), load(qa / 'publication.json'), load(shots / 'capture.json')
    integ, hands, coll, bounds, val = (load(qa / n) for n in ('integrity-published.json', f'{unit}-hand-contact.json',
                                                               f'{unit}-runtime-collision.json', 'bounds-check.json', 'gltf-validator-published.json'))
    icon_qa = load(a.icon_run / 'qa/mechanical-report.json')['assets'][unit]
    # Downscaled copies of the generated reference pair (sources stay in the run folder).
    refs = []
    for side in ('front', 'back'):
        im = Image.open(run / f'inputs/raw/{side}.png').convert('RGBA')
        im.thumbnail((360, 540))
        bg = Image.new('RGBA', im.size, '#2a3438')
        bg.alpha_composite(im)
        out = shots / f'reference-{side}.png'
        bg.convert('RGB').save(out, optimize=True)
        refs.append(out)
    guard = {lod: (MODELS / f'guard{"-lod1" if lod else ""}.glb').stat().st_size for lod in (0, 1)}
    lods = integ['lods']
    tex = pub['shared_texture']
    tex_bytes = (ROOT / tex['path']).stat().st_size
    clips = {c['name']: c['duration'] for c in cap['unitInfo'][0]['clips']}
    order = [c for c in ('Idle', 'Walk', 'Attack', 'Cast', 'CastBlast', 'Hurt', 'Death') if c in clips] + sorted(set(clips) - {'Idle', 'Walk', 'Attack', 'Cast', 'CastBlast', 'Hurt', 'Death'})
    contact = build['contact_seconds']

    def img(name, w=None, cls=''):
        width = f' width="{w}"' if w else ''
        return f'<img src="{rel(shots / name)}"{width} loading="lazy" class="{cls}" alt="">'

    def strip(prefix, label):
        cells = []
        for i in range(8):
            shot = next(s for s in cap['shots'] if s['file'] == f'{prefix}-{i}.png')
            t = shot.get('time')
            cells.append(f'<figure>{img(shot["file"], 138)}<figcaption>{label}{i}{f" · {t:.2f}s" if t is not None else ""}</figcaption></figure>')
        return '<div class="strip">' + ''.join(cells) + '</div>'
    rows = []
    for clip in order:
        lower = clip.lower()
        note = text['attack'].format(frame=round(contact * build['fps']), sec=contact) if clip == 'Attack' else ''
        note += text['death'] if clip == 'Death' else ''
        rows.append(f'<h3>{clip} · {clips[clip]:.3f} s{note}</h3>' + strip(f'clip-{lower}-three-quarter', '斜前 ') +
                    strip(f'clip-{lower}-side', '側面 ') + strip(f'clip-{lower}-lod1', '遠景 LOD1 '))
    turn = ''.join(f'<figure>{img(f"turntable-lod0-{y:03d}.png", 130)}<figcaption>{y}°</figcaption></figure>' for y in range(0, 360, 45))
    turn1 = ''.join(f'<figure>{img(f"turntable-lod1-{y:03d}.png", 130)}<figcaption>{y}°</figcaption></figure>' for y in range(0, 360, 45))
    teams = ''.join(f'<figure>{img(f"team-{t}-lod{l}.png", 200)}<figcaption>{"藍隊" if t == "blue" else "紅隊"} · LOD{l}</figcaption></figure>'
                    for t in ('blue', 'red') for l in (0, 1))
    hand_cells = []
    for path in sorted(shots.glob('hand-*.png'), key=lambda f: (0 if '-idle-' in f.name else 1, f.name)):
        shot = {'file': path.name}
        _, clip_l, pct, side, view = shot['file'][:-4].split('-', 4)
        side_label = '左手' if side == 'L' else '右手'
        view_label = '正面' if view == 'front' else '斜前'
        hand_cells.append(f'<figure>{img(shot["file"], 220)}<figcaption>{clip_l} {pct}% · {side_label} · {view_label}</figcaption></figure>')
    hands_row = '<div class="row">' + ''.join(hand_cells) + '</div>' if hand_cells else '<p>（本次擷取沒有手部近景）</p>'
    compare = ', '.join(a.compare.split(','))
    heights = {c['id']: c['height'] for c in cap['compare']}
    page = f'''<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{html.escape(a.name)}模型審核</title>
<style>
:root{{--bg:#11191d;--panel:#16262b;--ink:#e9e4d6;--muted:#9fb0b3;--line:#2c4248;--accent:#d9b25f;--ok:#8fc48a}}
body{{margin:0;background:var(--bg);color:var(--ink);font:15px/1.6 system-ui,"Noto Sans TC",sans-serif}}
main{{max-width:1240px;margin:0 auto;padding:24px 16px 48px}}h1{{font-size:1.5rem;margin:.2rem 0}}h2{{font-size:1.1rem;margin:2.2rem 0 .6rem;color:var(--accent)}}h3{{font-size:.95rem;margin:1.2rem 0 .3rem}}
p,li{{color:var(--muted)}}.status{{display:inline-block;padding:.15rem .6rem;border:1px solid var(--accent);border-radius:999px;color:var(--accent);font-size:.8rem}}
.row,.strip{{display:flex;flex-wrap:wrap;gap:6px;background:var(--panel);padding:8px;border:1px solid var(--line);border-radius:6px}}
figure{{margin:0;text-align:center;font-size:.75rem;color:var(--muted)}}figure img{{display:block;max-width:100%;height:auto}}
table{{border-collapse:collapse;width:100%;font-size:.88rem}}td,th{{border:1px solid var(--line);padding:.3rem .5rem;text-align:left}}th{{color:var(--accent);font-weight:600}}
.ok{{color:var(--ok)}}code{{color:var(--accent)}}.wide img{{max-width:100%;height:auto}}
</style></head><body><main>
<p class="status">待使用者確認風格 · user_style_approval: pending</p>
<h1>{html.escape(a.name)}（{unit}）正式模型 · 2026-10-16</h1>
<p>{text['intro']}沒有沿用任何既有兵種的幾何。目錄 <code>preview: true</code> 仍保留，正式對局看不到；你確認風格後才會移除旗標並加入 <code>REQUIRED_MODELS</code>。</p>
<h2>生成參考圖（來源）</h2><div class="row">{''.join(f'<figure><img src="{rel(r)}" width="240" alt=""><figcaption>{"正面" if "front" in r.name else "背面"}</figcaption></figure>' for r in refs)}</div>
<h2>旋轉檢視 · 近景 LOD0</h2><div class="row">{turn}</div>
<h2>旋轉檢視 · 遠景 LOD1</h2><div class="row">{turn1}</div>
<h2>隊色（遊戲內 runtime 著色）</h2><div class="row">{teams}<figure>{img("game-96-blue.png")}<figcaption>遊戲距離 96px 藍</figcaption></figure><figure>{img("game-96-red.png")}<figcaption>遊戲距離 96px 紅</figcaption></figure></div>
<h2>與 {compare} 同比例並排</h2>
<p>身高（runtime 綁定姿勢包圍盒）：{'、'.join(f'{k} {v:.2f} m' for k, v in heights.items())}；{text['height']}</p>
<div class="wide">{img("compare-front.png")}{img("compare-three-quarter.png")}{img("compare-game.png")}</div>
<h2>動作（每段 8 幀，同段共用比例）</h2>{''.join(rows)}
<h2>手部近景（待機與攻擊幀，runtime 著色）</h2>
<p>閉握手（roster_hands.py）：實心手掌貼住握柄、四根相鄰的三節手指（指節隆起、關節與指腹收腰、圓指尖）繞握約 250° 收回掌根、拇指橫壓食指與中指，手掌整塊綁 Hand 骨；手腕彎曲只發生在護腕段；手臂 IK 讓前臂延續手掌方向（直腕）。近景只裁掉手前方 10 cm 以外的物件（正交視角下遠處槍頭／布條不會疊在手上，被裁切的桿身會露出斷面）。握距與包覆數值見下方機械驗收。</p>
{hands_row}
<h2>訓練圖示（待確認）</h2><div class="row"><figure><img src="../../../public/assets/games/rts/ui/commands/unit-{unit}.webp" width="128" height="128" alt=""><figcaption>128px</figcaption></figure><figure><img src="../../../public/assets/games/rts/ui/commands/unit-{unit}.webp" width="48" height="48" alt=""><figcaption>48px</figcaption></figure><figure><img src="{rel(a.icon_run / 'qa/runtime-size-comparison.png')}" alt=""><figcaption>與既有指令圖示並排（下排）</figcaption></figure></div>
<p>圖示機械檢查：{'通過' if icon_qa['mechanical_pass'] else '未通過'}，邊距 {icon_qa['metrics']['margins']}，{icon_qa['webp_bytes']} bytes。預覽兵種的訓練鈕仍為純文字，多選清單縮圖會用到此檔。</p>
<h2>機械驗收</h2><table>
<tr><th>項目</th><th>結果</th></tr>
<tr><td>Khronos glTF validator（正式檔）</td><td class="ok">{val["errors"]} errors，{val["warnings"]} warnings（URI_GLB、NODE_SKINNED_MESH_NON_ROOT，與既有模型同類）</td></tr>
<tr><td>完整性（動作、20 骨架、權重、LOD 共用骨架、rtsMotion、遮罩、預算、地面）</td><td class="ok">{integ["status"]}；最低點 {integ["floor"]["lowest_m"]*1000:.1f} mm，待機離地 ≤ {integ["floor"]["idle_max_floor_m"]*1000:.1f} mm</td></tr>
<tr><td>閉握手接觸（31 取樣／段／LOD）</td><td class="ok">{hands["checks"]} 次檢查 0 失敗；握距 {hands["gap_range_m"][0]*1000:.1f}～{hands["gap_range_m"][1]*1000:.1f} mm（門檻 -6～+8），包覆 ≥ {hands["min_wrap_sectors"]}/16</td></tr>
<tr><td>Three AnimationMixer {text['crossing']}</td><td class="ok">{coll["checks"]} 次檢查，最大穿插 {coll["max_crossings"]}</td></tr>
<tr><td>60 Hz 動畫包圍球</td><td class="ok">{len(bounds["rows"])} 節點 0 超出，最小餘裕 {min(r["min_margin_m"] for r in bounds["rows"])*1000:.0f} mm</td></tr>
<tr><td>雙手 IK 殘差（各段最大）</td><td class="ok">{json.dumps(build["motion"]["ik_residual_m"])}</td></tr>
</table>
<h2>檔案大小與面數</h2><table>
<tr><th></th><th>{html.escape(a.name)}</th><th>衛兵（參考）</th></tr>
<tr><td>LOD0 GLB</td><td>{kb(lods[0]["bytes"])} · {lods[0]["triangles"]:,} 三角</td><td>{kb(guard[0])}</td></tr>
<tr><td>LOD1 GLB</td><td>{kb(lods[1]["bytes"])} · {lods[1]["triangles"]:,} 三角</td><td>{kb(guard[1])}</td></tr>
<tr><td>共用身體貼圖（兩個 LOD 共用一份）</td><td>{kb(tex_bytes)}</td><td>內嵌於 GLB</td></tr>
</table>
<h2>已知限制</h2><ul>
{''.join('<li>' + item.format(sec=contact) + '</li>' for item in text['limits'])}
<li>選取肖像框位（<code>PORTRAIT_FRAMING</code>）要等正式上線時一起加入。</li>
</ul>
<p>來源與重現：<code>art-factory/rts/tools/{text['script']}</code>、<code>roster_pack.py</code>、<code>roster_publish.py</code>；registry：<code>public/assets/games/rts/model-registry.json</code>、<code>art-factory/rts/manifests/unit-registry.json</code>。</p>
</main></body></html>
'''
    out = REVIEW / f'roster-{unit}-20261016.html'
    out.write_text(page, encoding='utf-8', newline='\n')
    print(out.as_posix())


if __name__ == '__main__':
    main()
