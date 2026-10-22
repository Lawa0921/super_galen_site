# V29：持續處理美術與停頓

本輪延續使用者已授權的寫實 CS 方向、單人對電腦、地圖動線／高低差、射擊回饋與購買介面。V28 的局部通過並未滿足整體美術與效能目標。所有測試保持背景執行，不發布到外部。

1. 用主執行緒運算時間、獨立計時器與 RAF 間隔區分停頓來源。已確認一次 5 秒 RAF 空窗中，計時器仍運作；不可把 RAF 間隔誤稱為繪圖 CPU 時間。
2. 單一假設對照，不同時調整畫質參數。無 MSAA 仍有秒級停頓，不進產品。每幀 GPU fence 診斷有明顯擾動，只保留機制證據，不作產品歸因。
3. 將已核對 CC0 的 para FPS arms 原作者骨架組裝到現有步槍。先完成整體手掌、手指與第一人稱構圖，再處理表面材質及其他武器。來源保持不變，候選隔離。
4. 實際操作、視覺與獨立檢核後，才可替換本機 runtime；機械接觸誤差通過不等同寫實美術通過。

驗收：真實第一人稱握持與清楚中心視野；所有使用來源有授權；原槍體與功能錨點保持一致；行為修改先寫失敗測試；受影響範圍測試、全套 Vitest、Chromium UI 與 build 通過；效能報告包含首幀等待及完整取樣時間，不排除慢幀。

V29 本機交付紀錄：步槍已換成 para／MakeHuman CC0 手部，搭配 Poly Haven 皮革與布料材質。原槍 POSITION／NORMAL／UV／index、三張原貼圖與槍械錨點逐 byte 保持；新資產 2,858,232 bytes，17,468 triangles。其他三種武器與世界角色尚未換美術，不能宣稱整體已達 CS2 品質。

- 全套 Vitest：142 檔、1,459 項通過；素材 Python：361 項通過。
- CS Chromium：60 項通過；獨立檢核補強後的手部測試另外 1 項通過；build 完成。
- 實際 runtime 八張截圖及兩分鐘高／低畫質取樣完成。最長 RAF 間隔 70.9／33.5 ms，涵蓋玩家、觀戰、跨回合，無 console／GL／HMR 錯誤。
- 秒級 RAF 停頓定位到測試用 headless-shell 路徑互動；改用同版本完整 Chromium 的背景模式後未重現。未因此改動產品的 MSAA、陰影或解析度；不把背景 RAF 數值當成螢幕 FPS，也尚未驗證使用者實際硬體上的低幀率已解決。
- 開發角色預覽的 rifle 完整性檢查已更新至 V29 SHA，保留篡改拒絕測試。歷史 V5 工具的測試改讀封存來源。一次平行測試造成的其他遊戲匯入逾時已保留紀錄，隔離重跑全套通過，未放寬逾時。

主要證據：`art-factory/cs/runs/run-20261007-v29-fps-arms/manifest.json`、`qa/review.json`、`qa/browser-native/report.json`；效能：`art-factory/cs/runs/run-20261007-v29-runtime/qa/performance-investigation.json`。本機預覽：`http://127.0.0.1:4002/games/cs`。未 commit、push 或對外部署。
