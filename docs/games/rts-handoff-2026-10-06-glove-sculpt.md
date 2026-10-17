# 原創手套雕塑與表面修整交接

使用者明確要求模型、骨架及動作全部原創。此次使用本專案 imagegen 原創手套圖與本機 Hunyuan3D 製作一個獨立左手高模，沒有使用外部角色、手模、骨架或動作素材。**新高模可作雕塑基礎，但還不能綁骨後直接接入遊戲。整體人物、動畫與地圖品質目標仍未完成。**

[可旋轉高模預覽](http://127.0.0.1:4334/glove-sculpt/) · [實際瀏覽器截圖](http://127.0.0.1:4334/glove-sculpt/still.png) · [原創開合模型比較](http://127.0.0.1:4334/glove-tailoring/) · [遊戲](http://127.0.0.1:4324/games/rts/)。工作樹 `C:/Users/bag57/projects/super_galen_site/.claude/worktrees/rts`，分支 `feat/browser-rts`；本輪未修改正式人物 runtime，沒有 commit、push、merge 或對外部署。

## 新原創高模

Run `art-factory/rts/runs/original-glove-shape/2026-10-06-v1`；contract `art-factory/rts/contracts/original-glove-shape.json` 維持 `qa_failed/runtime_publish_allowed=false`。原始概念在 `original-glove-sculpt-guide/2026-10-06-v1`：最初要求右手卻生成左手，該差異已記錄；本次明確以原創左手為來源，不假稱修正了初次方向。

- builtin imagegen 依 `prompts/cutout.txt` 去背，保留左手、五指、掌墊與縫線；RGBA 1254×1254，透明比例 62.99%，邊界 alpha 全 0。輸入 SHA `3df345d2bcd03d37b3d0bbd5dac94e09911ce27b0eed7160ad7d956fc2317774`。這是 shape conditioning，不是 runtime 圖示／貼圖；影像細節與原圖有變化，沒有宣稱逐像素保留。
- 使用既有 pinned 本機 Hunyuan3D-2.1 checkpoint，50 steps、seed 20261005、resolution 384；約 197.9 秒完成 shape-only inference。模型雜湊與 CUDA/參數見 `qa/preflight.json`、`qa/inference.json`。未生成 texture、rig 或 animation。
- 原 GLB SHA `8c4962dd9f9789252c959f2e113a0459862cb8771cc85639a20608b9330895f9`；314,812 vertices／629,620 triangles，單一 watertight component。Blender 量得 0 boundary/nonmanifold edges、32 個面積小於 1e-12 的面；**後者仍待清理，不能以 watertight 代替所有幾何檢查。**
- 真實 Blender 七視角與 Chromium 四視角均留圖。Khronos 0 errors、0 warnings、2 個 buffer target hints。瀏覽器確認真實載入 SHA、0 bones、旋轉／暫停、滑鼠拖曳、手機無橫向溢出、503 錯誤顯示；strict TypeScript 通過。
- raw GLB 沒有 NORMAL；最初 PBR 檢視成黑影，已先以 0 有效法線重現失敗，再在 viewer 衍生頂點法線。現有 314,812 個有效單位法線，實際截圖明暗正常；沒有修改來源 positions、indices 或 GLB bytes。測試的最初「頁面互動通過」不足以證明外觀，最終以重跑後 `qa/browser.json` 與截圖為準。

唯讀顧問接受作為高模雕塑基礎：五指分離、指腹／掌墊／腕部比程序版自然。進 retopo 前須修：**手背指根橫向厚唇與皺團、拇指 CMC／虎口厚度、配合人物袖口的乾淨腕環**。32 個小面需清理；不要直接減面後當成可動畫網格。具體見 `qa/visual-review.json`。

## 程序表面候選：保留失敗，不繼續盲調

Run `original-glove-tailoring/2026-10-06-v1` 最終 v4，仍 `qa_failed/runtime_publish_allowed=false`。原先 v6 的 16 骨 bind／160 動作曲線與原創皮革保持一致。圓頂指尖及袖口有改善，但指根橫線未解；每手 LOD0／1 已增到 7,620／4,572 triangles，未符合全人物整合成本。

4 個網格測試通過（指根轉折先以 0.839 > 0.20 正確失敗）；四網格閉合 genus 0、vertex links 單環、388 個半幀姿勢無抽樣交點；GLB round-trip 1,540 姿勢最大表面誤差 2.05e-6m。四 GLB 均 0 errors／各 1 個 skinned-mesh parent warning；120 張真實 Chromium 比較截圖、同姿勢切版矩陣差 0、播放暫停／手機／中文錯誤訊息及 strict TS 通過。這些是局部動作與工具證據，**外觀未通過**。

診斷曾把 degree-3/ngon 當主因；停用局部細分後肩線仍在，顧問撤回。後續量得掌根到第一指圈的切線突變，加入 bridge rings 雖通過數值測試，實際肩線仍存在，因此停止局部參數微調。不要再把測試綠燈當作形狀改善。`qa/root-review.json` 留有反證；`iterations/rejected-root-tangent` 是 v3 完整證據，`rejected-root-depth-step` 是 v2 geometry/Blender QA 但 browser/validator 沿用 v1，須按 SHA 區分。

## 接續工作

先修新高模手背、虎口與腕環，建立原創可變形 retopo，再適配原創指骨。既有原創 v6 bind 與 OpenClose 保留作比較；不能把高模或影像直接當動畫資產。原手部座標與弩兵 Hand bind 不同，仍需真實袖口／握把配合；完整弩兵預計 20＋30 指骨，兩 LOD hierarchy 必須一致。

之後仍需五種人物動作、開掌取箭／裝填／握持、釋放時序、3D 肖像、完整人物預算與 80 單位效能；其他兵種與地圖岩壁／河岸／遺跡亦未完成。此次只驗 factory 候選與本機預覽，沒有新的全站／完整 RTS 或效能通過宣稱。
