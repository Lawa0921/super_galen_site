# 封閉場景表面背面剔除驗證

**目標：** 在不改模型、材質外觀、陰影、解析度或碰撞的前提下降低 GPU 場景成本。

延續 `2026-10-03-cs-detail-performance.md` 與唯一 `2026-10-03-browser-cs-design.md`。目前原環境 34 mesh、26 種材質均 double-sided；拓撲預查顯示部分是封閉殼。這是待實測假設，不是效能成果。

- [x] TDD 建立保守封閉凸殼分類：精確 weld 位置、每邊兩個反向使用、每個 edge-connected shell 朝外且凸；拒絕開面、退化、反面、morph/partial draw。5/5 測試通過。
- [x] 在獨立診斷頁載入真正 GameRenderer／原資產，只為合格靜態環境 mesh 暫時切換 FrontSide；明訂 shadowSide=DoubleSide，維持原陰影。公開記錄診斷 scene state mutation，不能當一般遊玩基準。
- [x] 同相機、同狀態、同解析度配對 A/B GPU timing，多視角像素比較，暖機並交錯批次，排除 HMR／GL errors／disjoint。1,440 筆計時有效。
- [x] 只有畫面保留且效能改善超過測量噪聲才接入 load-time；否則保留拒絕證據，移除未使用 runtime helper。結果拒絕整合：六視角收益混合，而且均有非零像素差異；原碼與測試已移至診斷封包 source/。
- 不適用：未整合產品，因此沒有重跑全套產品測試。長秒卡頓仍未定位，不宣稱修復。

證據：`tmp/cs-environment-culling-v1/capture-v1/report.json`。分類器尚未證明相機永遠在殼外，也未檢查 multi-material groups 覆蓋完整殼；即使有收益也不能直接採用。
