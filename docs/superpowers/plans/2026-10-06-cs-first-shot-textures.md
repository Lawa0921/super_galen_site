# 首次射擊貼圖上傳

範圍：處理正常可見 Chromium 中第一發射擊的 CPU 渲染尖峰。保留 CS 式 hitscan、既有後座／散布、特效外觀與固定容量。

實證：`tmp/cs-visible-frame-time-v1/capture-v1/high.json` 的 frame 49 為第一發，CPU render 93.8 ms、GPU 12.867 ms。獨立第一發測試證實沒有新 shader program，但 high GPU texture 數 50→53、low 42→45。CPU 尖峰與上傳的因果強度仍須修正後實測，不能由同幀出現就宣稱全部時間都來自貼圖。

步驟與驗收：

1. 真實引擎射擊並產生火光、彈殼與撞擊；測試要求第一發不再新增 shader 或 GPU texture，涵蓋高、低畫質。
2. 只將 3 張已下載的 FX 貼圖在載入期間初始化，不新增素材或改變射擊流程。
3. 跑新增回歸、既有 shader/resource lifecycle 測試、全套 Vitest 與 CS Chromium E2E，執行 production build。
4. 正常可見瀏覽器再測第一發和 60 秒遊玩，記錄解析度、後端、幀時間與限制。未重現持續低 FPS 不等於 CS2 品質或輸入延遲驗收。
5. 獨立唯讀檢核，附可用遊戲 preview 與實際截圖。

第二階段實證：僅預載貼圖後，首發 CPU 仍為 62.2 ms。正常可見瀏覽器 GL 呼叫探針（`tmp/cs-first-shot-v1/gl-calls.json`）顯示同步 shader info log 查詢佔據主要尖峰。Three r182 `compile()` 不會完成 `WebGLProgram.onFirstUse()` 的診斷與 uniform/attribute reflection；在既有 preparePrograms 尾端呼叫每個已建 program 的 `getUniforms()`，讓這項工作也在載入階段完成，保留 shader 錯誤檢查。新增紅綠條件要求第一發沒有上述同步查詢。這是對目前 Three 實作的明確相依，升級套件時保留此回歸測試。
