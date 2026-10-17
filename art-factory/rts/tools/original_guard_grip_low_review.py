"""Build a local, source-linked high/low visual and normal-opposition review."""
from pathlib import Path
import html
import json

ROOT = Path(__file__).resolve().parents[3]
RUN = ROOT / "art-factory/rts/runs/original-guard-grip-low/2026-10-05"
FIT = ROOT / "art-factory/rts/runs/original-guard-grip-fit/2026-10-05"


def main():
    geometry = json.loads((RUN / "qa/geometry.json").read_text(encoding="utf-8"))
    renders = json.loads((RUN / "qa/renders.json").read_text(encoding="utf-8"))
    if geometry["verdict"]["pass"] or geometry["candidate_sha256"] != renders["candidate_sha256"]:
        raise ValueError("Review expects the same rejected low candidate")
    gallery = []
    names = {'full-sword-proportion':'全劍與手套比例','four-finger-palm':'四指掌面',
             'back-and-wrist':'手背與腕口','guard-and-finger-contact':'護手與指腹',
             'axis-from-pommel':'從柄首沿軸看','axis-from-guard':'從護手沿軸看'}
    for name in ("full-sword-proportion", "four-finger-palm", "back-and-wrist",
                 "guard-and-finger-contact", "axis-from-pommel", "axis-from-guard"):
        low = "qa/renders/" + name + ".png"
        # Paths are relative to this run's root, not the project root.
        high = str((FIT / "qa/renders" / (name + ".png")).relative_to(RUN.parent.parent)).replace("\\", "/")
        high = "../../" + high
        gallery.append(f'<section><h2>{html.escape(names[name])}</h2><div class="pair">'
                       f'<figure><a href="{html.escape(high)}"><img src="{html.escape(high)}" alt="原高模：{names[name]}"></a><figcaption>原高模來源</figcaption></figure>'
                       f'<figure><a href="{html.escape(low)}"><img src="{html.escape(low)}" alt="減面候選：{names[name]}"></a><figcaption>減面候選</figcaption></figure>'
                       '</div></section>')
    records = geometry["metrics"]["near_source_normal_opposition_records"]
    rows = []
    for record in records:
        xyz = ", ".join(f"{value:.4f}" for value in record["source_local_center_m"])
        rows.append("<tr>" + "".join(f"<td>{html.escape(str(value))}</td>" for value in (
            record["triangle"], record["source_nearest_triangle"], record["geometric_roi"], xyz,
            f'{record["triangle_area_m2"]:.3g}', f'{record["nearest_high_gap_m"]*1000:.3f}',
            f'{record["normal_angle_degrees"]:.1f}')) + "</tr>")
    body = f'''<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>原創握柄低模診斷</title><link rel="stylesheet" href="review.css"></head><body>
<h1>原創握柄低模候選：QA failed</h1>
<p>候選 {geometry["metrics"]["triangles"]:,} 三角面。劍與手套精確三角交叉 0，劍頂點包含 0；四指側近接點
{html.escape(str(geometry["metrics"]["four_finger_side_contacts"]))}。雙向表面 p95 是面積加權取樣統計，不能當連續誤差上界。
joined 劍的三射線奇偶曾把一個手套點判為內部，但逐件封閉元件沒有多數內部票，該點五條相鄰邊亦沒有劍三角交點；
這是局部已反證的疊殼奇偶假陽性。補驗已掃描全手套 5,897 點：14 個封閉劍件的體積聯集內含點為 0；
另一個有 4 條開邊的劍件不作體積判定。
<a href="qa/vertex-3262-containment-diagnosis.json">局部反例</a> · <a href="qa/closed-shell-and-self.json">逐封閉劍件及自交補驗</a></p>
<p class="warn">仍未通過：補驗查到 18 組不共頂點三角自交，需按位置與大小判斷，不能等同 18 個可見破洞。
31 個低模三角中心與最近高模面法線 dot &lt; -0.2；獨立檢視未發現能直接歸因於這些警示的可見翻面。
最近面法線差不是自身繞向錯誤的證據；極小碎面及局部交會仍須處理。低模不一致 winding edge=0。</p>
<p>固定相同六鏡頭高低模對照。原來源的圓鈕指端、虎口與封閉腕口仍在；本候選不得進 runtime。</p>
<p><a href="candidate/original-guard-grip-low.blend" download>Blender 可編輯檔</a> · <a href="candidate/original-guard-grip-low.glb" download>GLB 候選</a></p>
{''.join(gallery)}
<section><h2>低模 wire（四指掌面鏡頭）</h2><img src="qa/renders/four-finger-palm-wire.png" class="wire" alt="減面候選四指掌面網格"></section>
<section><h2>31 處最近來源法線相反的局部量測</h2>
<p>來源座標為米；面積為 m²；間距為 mm。ROI 依通道軸徑向距離與來源 z 分類，並非造型語義區。</p>
<div class="table-scroll" role="region" aria-label="局部量測表格，可水平捲動" tabindex="0"><table><thead><tr><th>低面</th><th>最近高面</th><th>幾何 ROI</th><th>來源局部中心 xyz</th><th>低面積</th><th>來源間距</th><th>法線角</th></tr></thead>
<tbody>{''.join(rows)}</tbody></table></div></section></body></html>'''
    (RUN / "review.html").write_bytes((body + "\n").encode("utf-8"))
    print("LOW_REVIEW", len(records), "rows")


if __name__ == "__main__":
    main()
