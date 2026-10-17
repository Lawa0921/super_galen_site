# RTS 模組零件製作架構

沿用唯一美術入口 `2026-10-04-browser-rts-design.md`。本文件定義製作方法，不另設美術風格。使用者要求改以符合業界慣例的組裝零件方式製作；延續直接實作授權與全部原創要求。

## 決策

採 Blender Collection Asset Library → JSON prefab recipe → linked collection assembly → evaluated export copy → 依材質合批 GLB。可編輯來源保存部件關係，瀏覽器保留既有 ModelLibrary 與 GLB 介面。原始生成器只作來源，不再作這批 prefab 的組裝入口。

比較：只將舊整棟 GLB 放入目錄沒有實際可換部件；在瀏覽器載入每顆螺絲則增加節點與繪製成本。因此採製作時組裝、發布時合批，現有地圖 InstancedMesh 繼續共用發布後模型。

## 首批範圍

12 種建築版本與已校準 stone-bridge，從目前 registry 的 editable raw 提取。窗、門、屋頂、基座、結構與橋件各有 collection/part ID、局部座標、bounds、材質、source SHA 與 geometry fingerprint；二、三階主城實際共用同一門窗件，橋重複鋪面與護欄共用同一件。屋頂尺寸不同者是明列變體，未宣稱全部共用。

公尺、Blender Z-up／建築 front=-Y，GLB Y-up／front=+Z。新結構主格 1m；本次既有模型用 1cm 裝配錨點與明列精確插槽偏移，保留原形狀，禁止非均勻縮放零件。內部斜面／拱石不要求所有頂點上格。窗洞沿用已切入來源牆體，以插槽、宿主與原始世界幾何相等驗證對齊；不得只移動窗飾而留下洞。

來源抽驗發現窗拱 moulding 的 UV 烘入整棟位置（同規格兩階主城差 0.005 UV）。此項明確改為零件局部投影，保留每公尺 0.5 repeat 與原貼圖；其餘 UV、幾何及法線不重做。這是可搬移共用件的材質修正，不以尺寸相同就忽略 UV 差異。

角色為另一類資產：需共同骨架版本、bind pose、attachment sockets、蒙皮邊界與動作驗證。現有角色未符合可任意互換的身體部件條件，不列入這批完成項，也不改骨架與動畫。

## 契約與安全界線

零件、prefab、kit manifest 全部版本化，原始 SHA 固定；missing part、socket 類別不相容、來源漂移、未知版本、非正交／縮放矩陣一律失敗。Recipe 只可引用明列 collection，路徑限本 factory。編輯部件後必須重新 build/QA 並更新版本或來源 lock；禁止載入最新檔案而不記錄版本。

來源保存，runtime 僅換受控輸出與 registry。地圖出生點、通行、建造占地、資源、字型及玩法不變。碰撞記錄沿用 catalog 導航占地；視覺細節不充當碰撞體，橋保持平路面與六公尺通道。

## 驗收

1. CLI 從 linked library 和 recipe 重建 13 prefab；沒有呼叫舊生成器重新造整棟。
2. 每件來源物件恰好分配一次，world-space 幾何／UV／材質抽驗及整體 bounds 相等；instance 真正展開，沒有漏件。
3. 至少兩個 prefab 共用門窗 collection；隔離副本修改共用窗件後兩個組裝都變化，其他件不變。
4. Python 成功與邊界回歸；13 GLB validator、材質引用、兩張地圖實際組裝、全套 Vitest、型別、E2E、build；效能與下載維持既有門檻。
5. 實際瀏覽器提供組裝／爆炸視圖、零件 catalog、共用關係及遊戲入口，附截圖、原始 .blend、recipe 和限制。

## 工作流參考

- Epic Static Mesh Pipeline：pivot、UV、collision、socket、LOD（採慣例，不改用 FBX 或 Unreal）：https://dev.epicgames.com/documentation/en-us/unreal-engine/fbx-static-mesh-pipeline-in-unreal-engine
- Blender Collection instancing／dynamic linking：https://docs.blender.org/manual/en/5.2/scene_layout/object/properties/instancing/collection.html
- Blender Asset Libraries：https://docs.blender.org/manual/en/latest/files/asset_libraries/index.html

以上是實務工作流參考，沒有單一通用「業界標準認證」。本次技術驗收不等於整體美術品質核准。
