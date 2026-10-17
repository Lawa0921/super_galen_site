# 原創弩兵可動手部整合交接

整體 RTS 目標仍未完成。使用者要求模型、骨架、動作全部原創，人物與地圖品質仍未核准。本次把原創可動左手接回完整弩兵，未更新 runtime。

預覽：<http://127.0.0.1:4334/crossbow-articulated/>。截圖：run 下 `qa/browser/desktop.png`、`mobile.png`。沿用現有4334 review server、4324遊戲 server，不啟用 native CUA 或 hooks。

## 固定資產

Run：`art-factory/rts/runs/original-crossbow-articulated-hand/2026-10-07-v1`。

|檔案|SHA-256|
|---|---|
|原 Attack body|`5ab95a9b070d33a83ccc871ce092414ad513804152fc38e73f70b02556117c37`|
|原 natural-hand.blend|`63bbe419750aa77048c80fb2acd68a8b338e8c96c52b61356b8ece6a5ef56060`|
|candidate/articulated-connector.blend|`18f063e7111f65b45464f9202d87423a2c52540318532b15e6374c4da78f3939`|
|candidate/original-crossbow-grip-lod0.glb|`64ba650e311f41eb8228a418c5f42435b03796a1bc59f3e0020f6800d4bc1683`|
|candidate/original-crossbow-grip-lod1.glb|`0e90602aa365cc344797767070ed1237196de2587f770b9ee7be11885f372f55`|

新增 HandPalm_L＋15指骨，共36骨，原20骨bind不變。保留原右手、原LOD0弩；兩LOD共用原LOD0弩以消除簡化握把穿指。左腕45mm內接片局部重拓，保留7133／3004個body頂點與權重、14183／5941個面UV／材質完全一致。

上游問題是握把相對掌向錯誤，不是單純袖口半徑。繞真實 support axis 轉45度，再解肩肘腕。原Hand_L軸不能當解剖掌向，姿勢驗證使用腕→四MCP平均點。沿前臂rest frame或拉伸12cm護腕的方法均已淘汰。

Attack前20幀保留原非左臂瞄準／射擊；20–36停留在原20幀並鬆握，36–40用原骨局部quaternion回原40幀。**真正拉弦裝填仍未完成。**

## 實測證據

- 7個合併／截面數學測試通過；姿勢反折、漏隊伍遮罩、非root skin節點均有先失敗證據。
- `identity.json`：20原bind骨、原右手／弩、640條非Attack非左臂曲線精確保留。
- `posture.json`：1589姿勢，腕到MCP方向最大70.00004度；75度是反折拒絕線，不等於美術核准。
- `final-contact-dense.json`：兩LOD共3178姿勢，手自交／手弩／身弩均0；**不包含完整人物自交或腕口變形核准**。
- `motion.json`：Attack 0–20共161樣本，16個非左臂骨、右手、弩誤差均小於1µm。36–40最大弩速0.2965m/s、骨角速度103.04度/s；全Attack最大弩速4.4268m/s。
- `glb-surface-parity.json`：兩實際GLB各33姿勢，所有抽驗表面最大誤差2.158µm。
- `glb-structure.json`／`gltf-validator.json`：36骨、5動作、5張內嵌貼圖、2個原衣料遮罩材質；Khronos各0 errors／0 warnings。保留原右手未使用UV的info，不刪原始UV。
- `browser.json`：兩LOD×五動作、播放／暫停／時間軸、藍紅隊、背面、390×844無橫向溢出與503錯誤顯示通過，無pageerror。
- `seam.json`：cap共1106個頂點／邊內插／面中心全部內藏，1589姿勢相對掌骨誤差小於0.54µm。cap最高13.94mm，所有可動手面最低18.65mm，證明此內藏區不受手指變形影響。**接片面積比0.0094–9.2478，形變檢查失敗。**

## 下一步

候選維持 `qa_failed`。先定位接片面積極值的clip／frame／triangle與 Hand_L／HandPalm 相對扭轉，重新處理動態接片；不得用cap包含、拓樸閉合或穿模0替代變形驗收，也不要重跑已淘汰的整段護腕geodesic拉伸。

其後仍需正式原創手套材質、弩弦／弩矢裝填、完整角色與動作自然度、全身自交、遊戲／會動大頭貼與效能。LOD1為11939三角形，超過先前10000目標。其餘兵種與兩張地圖增豐仍未完成。

主鏈：`original_crossbow_hand_build.py` → `original_crossbow_hand_connector.py` → `original_crossbow_hand_export.py` → `original_crossbow_hand_package.mjs`。不要以舊 cuff 工具覆寫最後候選。失敗證據保留在 `iterations/`。GLB匯出先保留extras，再只提升無transform、無動畫的identity armature container下skin mesh至scene root；重載parity已驗。
