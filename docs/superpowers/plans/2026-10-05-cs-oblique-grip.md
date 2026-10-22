# CS 左手側下方支撐候選

依據已封存的 finger-hinge 截面報告，原掌錨接觸下導軌，但四指近節落在右下方。既有掌錨候選全部維持向下法向，沒有檢查真正左下斜面。此階段製作一個具原三角面來源的支撐 frame 候選，判斷新接觸方向是否改善整組手指位置。

## 範圍

- 固定 rifle、右手、body/finger commands、來源 geometry/weights；整組左手隨新 wrist frame 定姿。
- 使用原 rifle mesh face 5789，local z=-0.30 m 的固定點，來源座標与法向存入輸入檔；不使用假碰撞殼。
- 掌部沿用 primary 真實 rigid hand_l patch；來源 frame normal 改成該 patch 的實際 handLocalNormal。
- 以最小旋轉把原向下接觸方向 transport 到左下斜面，維持原 targetLong 的軸向分量；保留已有四指協同 curl/splay，這次不宣稱重新求解全部手指。
- 一個候選、零 optimizer/grid、零新 GLB、零 runtime 接入。既有封存資料不得修改。

## 驗收

1. 純函式 TDD：三角面/barycentric、法向與 tangent frame、不可变來源、無鏡射、非法或共線輸入。
2. 真實場景單一候選：arm/finger IK、原掌 1 mm、長指至少兩節各 3 vertices/2 faces 在 1.5 mm 內且法向相對；完整手/指/身體/前臂 crossing 零。
3. source/bind/weights/topology、weapon/right-hand 固定；改變僅左上臂/前臂/腕及其後代的旋轉。
4. 多視角照片與獨立唯讀檢核；任一 gate 失敗即拒絕，不修門檻或反覆試角度。
5. 靜態 preview 實際瀏覽，來源／結果 hash、registry 與 handoff 封存。純離線工具只跑相關 tests；若後續 runtime 改動，另跑專案全套與相關 E2E。

## 順序

先保存來源與 contract/registry，再寫失敗 tests、實作 frame helper、產一份 calibration，單一瀏覽器量測與截圖，最後獨立 review 與封存。效能熱點由唯讀代理另行查核，GPU 量測不並行。
