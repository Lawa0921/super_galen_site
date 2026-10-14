# CS 模組化資產組裝

使用者要求以符合業界慣例的零件組裝方式製作遊戲。本文件定義製作方法，沿用唯一美術風格來源 `2026-10-03-browser-cs-design.md`，不是另一份風格指南。

## 結果與取捨

採用有授權的模組資產庫、明確接點、可重建的預製組件與場景配置。作者保留零件與實例關係；匯出才依區域、材質合併靜態批次。這比繼續在整張地圖上堆幾何更容易替換資產，也比直接在瀏覽器加入數百個独立 Mesh 更適合目前效能預算。現有 Three.js、玩法、輸入與物理介面沿用。

通用要求：

- 使用 glTF 的公尺、右手座標、Y-up；來源座標轉換與正向各自記錄。網格尺寸是本專案選擇，並非宣稱業界統一規定。
- 零件具有穩定 ID、來源 SHA、授權、局部原點、實際 bounds、材質 slot、接點與碰撞用途；不得從已合併 runtime 網格任意切塊冒充零件庫。
- 同族零件採共同的 uniform 尺度轉換，保留來源 UV、法線和 PBR，不為填洞任意拉伸。
- 接點包含位置、朝向、相容 family；配方記錄 part ID、根位置或父接點，禁止循環、重複佔位及非均勻縮放。
- render mesh 與 collision proxy 分離。可行走門洞和階梯須另外通過真實物理／AI 驗證；只作邊界外景的資產不能冒充已可行走。
- 保留可編輯 Blender collection assets／instances。GLB 是編譯輸出，來源、配方及編譯器才是可重建依據。
- 多次重用共享來源 geometry/material；靜態小片區可以離線合併，動態重複道具才使用 GPU instancing。LOD 須獨立驗收輪廓，不能只加空的 LOD 標籤。

## 第一個完整切片：西側城牆

來源使用現有已核對 CC0 的 Poly Haven Modular Fort 01，從原始 glTF 四個命名 mesh 建立長／短直牆、平頂牆、拱門外觀零件。共同尺度由來源短牆 span 對應到 8m；只做旋轉、位移、uniform scale，保留雕刻和材質。

短牆接點在 `(0,0,0)` 與 `(8,0,0)`，長牆為 16m；作者座標 X 沿牆、Y 向上、Z 朝正面。表面裝飾可能超出名義 span，實際 bounds 另列，不把包圍盒當成精確接縫。gate 只供外觀組裝，未批准作可穿越門洞。

西側 prefab 替換唯一獨立 `PERIMETER_V7_wall_thin_straight_04` 節點。第一版兩份短牆雖通過端面量測，卻有可見材質黑縫，經獨立視覺檢查拒絕；現行配方選取同庫原生 16m 長牆，保留可替換的 part reference，不強制切分連續表面。其餘已合併環境不逆向切割。根位置在地圖邊界外 6cm，驗收至少 5cm 安全距離；既有 `map-data.json` 和碰撞資料保持一致。匯出使用原有兩個材質 primitive，不增加貼圖，環境維持 90,000 tris／32 primitives 以下、全部 runtime 28MB 以下。

須交付：可編輯資產庫、kit catalog、prefab／scene recipe、候選與本機匯出、零件展示和玩家視角截圖、測試與效能證據。未通過的候選不進 runtime。

## 後續同一方法

建築門窗／陽台／屋頂和掩體按家族逐步替換舊世界座標 builder。武器維持 receiver、magazine、bolt、muzzle、grip sockets 的機械層級。角色衣物／裝備共享骨架與 bind pose，依 skeleton/socket 組裝，不將手套網格硬貼不同武器或骨架。以上是遷移方向；第一個城牆切片通過不表示全部模型已轉換。

## 依據與驗收

glTF 的公尺、座標與共享 mesh 參照來自 [Khronos glTF 2.0](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html)。原點、獨立碰撞、socket 與 LOD 的工作方式參考 [Epic 靜態網格管線](https://dev.epicgames.com/documentation/en-us/unreal-engine/fbx-static-mesh-pipeline-in-unreal-engine)，概念適配本專案，不搬入 Unreal 專用命名或 FBX 要求。[Three.js InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html) 說明相同 geometry/material 的批次使用條件。

驗收包括成功接合與錯誤配方的 TDD、來源與未改區域的 byte／數值核對、Blender reopen、真 renderer 同鏡位、原生遊玩流程、單獨背景高低畫質取樣與獨立唯讀檢核。所有瀏覽器與 Blender 背景執行，不對外部署。
