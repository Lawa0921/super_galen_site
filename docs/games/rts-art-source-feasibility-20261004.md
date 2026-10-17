# RTS 3D 素材來源與本機製作可行性

查證日期：2026-10-04。此為原始來源與環境調查，非資產核准、安裝完成、模型品質通過或遊戲交付。
對應設計：[曦境戰紀設計](../superpowers/specs/2026-10-04-browser-rts-design.md)。該設計仍待使用者確認；本文件不更換其美術方向。

## 已實查的本機條件

| 項目 | 實際證據 | 能證明的範圍 |
|---|---|---|
| OS | Windows NT 10.0.26200.0，64-bit | 本機平台 |
| GPU | `nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader` → `NVIDIA GeForce RTX 5090 Laptop GPU, 24463 MiB, 610.47` | GPU 型號與顯存；不能用 Win32_VideoController 的 32-bit AdapterRAM 欄位誤判成 4 GB |
| RAM | Win32_ComputerSystem.TotalPhysicalMemory 換算為 63.4 GiB | 系統實體記憶體 |
| WSL | Ubuntu-24.04；WSL 的 nvidia-smi 同樣回傳 RTX 5090 Laptop、24463 MiB | Linux 環境可看到 GPU；尚未執行模型推論 |
| WSL 工具 | Python 3.12.3、`/home/lawa0921/.local/bin/uv`；登入 shell 的 `command -v nvcc`、`command -v conda` 無輸出 | 該 shell PATH 未找到 CUDA compiler／Conda；不是全機未安裝的斷言 |
| Blender | 前一輪背景探針：5.2.1 LTS、GLB exporter 可用、退出碼 0 | 可用於本機加工與匯出，不證明素材已完成 |

本輪只做讀取查證，未安裝模型、下載權重、修改驅動、啟動生成服務或付費。未讀出、保存或傳送憑證值。

Blender 的 `scripts/addons/addon.py` 實際包含 Hunyuan3D 的 `LOCAL_API`（第 3270 行）與 `OFFICIAL_API`（第 3259 行）兩種模式，第 4037 行預設本機 API URL 為 `http://localhost:8081`。這證明有本機服務的介面，並非只能呼叫雲端；指定 Blender 安裝／使用者目錄中尚未找到相應推論模型或權重，不能據此宣稱服務已可用。專案的 `node_modules` 是 53-byte 的追蹤檔，並非已安裝相依目錄。

## 本機生成候選的必要區分

### TRELLIS／TRELLIS.2

官方 TRELLIS 文件列最低 16 GB NVIDIA 顯存、主要驗證 Linux；TRELLIS.2 列最低 24 GB 並提供 PBR 生成。模型與主要程式的 MIT 標示，不能直接代表所有相依套件的授權。兩者都沒有在這台電腦完成安裝或推論驗證。[TRELLIS 官方](https://github.com/microsoft/TRELLIS)、[TRELLIS.2 官方](https://github.com/microsoft/TRELLIS.2)

TRELLIS.2 預設 setup 指向 PyTorch 2.6.0／CUDA 12.4，另以旗標安裝 nvdiffrast v0.4.0 與 nvdiffrec renderutils。PyTorch 2.7 官方才列出 Blackwell 支援與 CUDA 12.8 wheels；因此不能照舊版安裝指令就宣稱 RTX 5090 可用，仍須獨立環境內驗證 kernels、編譯相依與完整匯出。[實際 setup.sh](https://github.com/microsoft/TRELLIS.2/blob/main/setup.sh)、[PyTorch 2.7](https://pytorch.org/blog/pytorch-2-7/)

已讀 nvdiffrast v0.4.0 與 setup 使用的 JeffreyXiang/nvdiffrec renderutils 分支授權原文，第 3.3 節對軟體及衍生程式有非商用使用限制。因此，不能只因頂層 MIT 就把含這些元件的預設完整生成／渲染管線標記為已通過商用來源關卡。這不是宣稱所有生成輸出自動沿用相同授權；需確認真正使用的程式路徑和適用條款。尚未確認能否完全排除這些元件、僅用授權適合的推論路徑，再改以 Blender 加工與烘焙。真正安裝時需記錄各 tag／branch 解析出的 commit SHA。[nvdiffrast 固定版本授權](https://github.com/NVlabs/nvdiffrast/blob/v0.4.0/LICENSE.txt)、[實際 nvdiffrec 分支授權](https://github.com/JeffreyXiang/nvdiffrec/blob/renderutils/LICENSE.txt)

結論：保留為待技術與授權驗證的候選，未安裝；「本機顯存約達文件門檻」和「已能商用生成」是兩個不同狀態。

### Hunyuan3D 2.0

官方 README 的形狀／貼圖完整流程標示 16 GB 顯存。原始授權另有地域、商業條件及使用規則，不能視同 MIT／CC0 或只檢查模型能否下載。本次不將它當作無條件適用全球網站的正式來源。[官方 README](https://github.com/Tencent-Hunyuan/Hunyuan3D-2)、[官方授權](https://github.com/Tencent-Hunyuan/Hunyuan3D-2/blob/main/LICENSE)

## 可供核准的既有素材來源

以下只有作者公開頁面的資料，未下載檔案、未購買，也未當成使用者已接受的美術。日後若採用，需逐檔確認授權與內容，保留取得版本及 hash，並在 Blender 做本遊戲的原創設計與品質驗收。

| 來源 | 作者公布的能力 | 對本遊戲可能的用途與缺口 |
|---|---|---|
| [Quaternius Universal Base Characters](https://quaternius.com/packs/universalbasecharacters.html) | CC0；人體骨架、平均約 13k 三角面、FBX／glTF；部分內容免費，原始 Blend 在 Source tier | 可作人體拓撲／骨架候選；不是完成的工人、衛兵或英雄，不能直接宣稱角色已原創完成 |
| [Quaternius Modular Character Outfits – Fantasy](https://quaternius.com/packs/modularcharacteroutfitsfantasy.html) | CC0；模組服裝、與上述人體及動畫庫相容；部分內容免費 | 可研究服裝／骨架相容性；需核對免費版是否含所需甲冑，不能把付費 Source 檔算作已取得 |
| [Quaternius Universal Animation Library](https://quaternius.com/packs/universalanimationlibrary.html) | CC0；通用人型動畫，部分內容免費 | 可作重定向來源候選；採礦、伐木、架弩與騎乘仍需逐動作盤點，不能用動畫總數替代完整動作驗收 |
| [KayKit Medieval Hexagon Pack](https://kaylousberg.itch.io/kaykit-medieval-hexagon) | CC0；免費版 200+ 風格化建築／環境模型、四色變體；額外單位／馬匹與來源檔分付費版本 | 可用於素材風格比較；六角地塊、簡化造型與目前自由地形／細緻中古方向不同，不自動採用 |

## 對下一步的影響

1. 網頁模擬與資產生成可分開驗收；生成工具未配置不能被描述成所有遊戲邏輯都無法進行。
2. 在設計確認後，先做一名完整衛兵與一棟主城的製作試點：可追溯來源、可編輯檔、骨架／PBR／LOD、GLB、遊戲尺度畫面。通過才批量擴充，避免先量產無法接受的模型。
3. 若採第三方人體／動畫來源，先取得具體來源核准；「原創人類王國」不等於可以把第三方模型宣稱為全新原創。
4. 自動生成的幾何與貼圖仍須拓撲、綁定、動畫、碰撞、效能與完整組裝驗收；任何候選管線都不能免除設計中的商用品質標準。
5. 目前仍缺：使用者對設計的確認、正式來源路線選定與驗證、所有正式資產、遊戲實作與可玩 preview。沒有把研究成果算成完成目標。
