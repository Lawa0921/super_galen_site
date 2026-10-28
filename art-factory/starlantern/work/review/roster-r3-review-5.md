# R3 獨立視覺審核紀錄（怪物名冊 r3）第 5 輪

審核者：全新脈絡的獨立審核代理（Claude Opus 5.5），沒有參與生成，也沒有參與第 1–4 輪。日期 2026-10-28。
commit：4ef67bf18（4ef67bf18707dcdcb5fa08a7b0ea10e3593e1532，「fix(art): R3 mourning-veil recomposed as draped cloth for review round 5」），worktree C:\Users\bag57\.codex\worktrees\faces\super_galen_site。本輪只讀，沒有改動 repo。
方法：
・清單是 r3-round5-assets.txt，共 1 件。sha256 自己用 sha256sum 重算：f6c9ca15332303683b453c084f4ed3232ac0ecf7cc174cc23f5ca4e94b34e41a，和清單一致。
・機械掃描（python -I，腳本在 roster-r3\rv5\，沿用 rv4 的寫法）：
  ・a.py：逐格亮度圖、色調掃描、碰邊、封閉透明區，並輸出 20× 與 3× 放大圖（dveil/mveil/lveil 20 與 3）。
  ・f.py：逐列寬度剖面、紫色調像素統計。
  ・b.py＋c.py＋e.py：16 px 與 14 px（LANCZOS）在暗、中、亮三種底色上的 1× 與 3×。
    ・rv5\s1z.png、s1zz.png：和已發布的 dusk-cloth、epitaph-stone、lantern-ash、tower-dust、grey-cord、shadow-thread、storm-stone、marble-shard，以及同批的 cinder-dust 並排。
    ・rv5\s2z.png：和同批的 ash-page、torn-page、silence-snow、shrine-rope、prayer-rope、porcelain-chip、forge-slag、glacier-scute、mirage-brick、gear-everwinter-veil、gear-last-dance-veil 並排。
  ・d.py：16 px 與 14 px 的二值剪影（洞蓋住），和 cinder-dust、lantern-ash、tower-dust、dusk-cloth、dream-sand、brood-shell、crystal-shell、rin-veil-16、epitaph-stone、ash-page、兩件 veil 裝備、moss、mist-root、spent-wick 算 IoU（rv5\sil.png）。
  ・rv5\x3pair.png：原圖 3× 在三種底色上。
・contact sheet：r3-round5-contact-sheet.png（a7 放大、1×、16/14 px 列、只看輪廓列）。
・對照：
  ・spec 第 344 行：ash-mourner（灰衣弔者）的素材是 mourning-veil 弔者面紗。
  ・roster_art.py 的 MAT_DESC：「a folded grey lace mourning veil」。
  ・prompts/sheet-icons-roster-4.txt 的 Item 3 修正句（本 commit 改過）。
  ・第 4 輪的重畫方向與驗收標準，以及前四輪的誤讀紀錄。
  ・sl_art.py 的 _deep_key、_bright_key、pink_outliers 閘門定義，contract.md 的審核界線。
  ・cand\a7\icon-mourning-veil.qa.json：holes 5、erased 4、key_tint_inside 0、bright_key 0、pink_outlier 0、semi 0、edge 0。

放行清單：本輪沒有放行的件。

FAIL（1 件，不列入放行清單）：
FAIL icon-mourning-veil f6c9ca15332303683b453c084f4ed3232ac0ecf7cc174cc23f5ca4e94b34e41a

改善的部分（重畫時保留）：
・3× 與原圖大小下，這是目前最接近布的一版：上方收攏、往下散開的垂墜、扇形下襬、下襬一排帶深色環的孔、右側較深的後層、中段棋盤狀的半透明網紋。
・沒有白色，沒有方塊或橫桿的剛硬感，沒有右側直條紋。
・切圖乾淨（見下方旗標項目）。

退回理由：
1. 16 px 與 14 px 讀成「灰色金字塔或錐形堆」，等於退回第 1 輪的失敗。
   ・逐列寬度剖面：第 1–2 列只有 5–6 px 寬，第 3 列 11、第 5 列 16、第 9 列 21、第 13 列 25，到第 16–17 列 30 px 最寬。這是頂端尖、往下穩定加寬的三角形或錐形剖面，不是寬而圓的摺邊頂。
   ・亮暗分面加強了這個讀法：一條從頂點往下的亮色中脊，左側亮面、右側暗面。16 px 下這就是一座有稜線的灰色金字塔、帳篷或山。
   ・s1zz.png 三種底色上，它和 cinder-dust（橘色尖頂堆）、lantern-ash（尖頂灰堆）並排時，同屬「尖頂的一堆」。差別只剩顏色，形狀語言相同。
   ・二值剪影和 cinder-dust 的 IoU 只有 0.57，剪影本身不重疊。但加上內部明暗後，16 px 的整體讀法和 cinder-dust、lantern-ash 撞在一起。
   ・生成端自己的 prompt 修正句寫明「broad soft rounded folded top edge (never narrowing to a point, never a cone, tent or triangle)」以及「clearly wider than it is tall」。成品頂端收成 5 px 的尖，bbox 31×28，寬高比約 1.1，兩條都沒做到。生成端旗標的「往上收窄像圓角梯形」實際上收到接近一點，不是梯形。
2. 驗收標準（洞蓋住後 16 px 剪影仍要讀成布）沒有達到。
   ・sil.png 的 16 px 剪影：一個上尖下圓、右下鼓出的團塊。最直接的讀法是蒜頭、洋蔥、水滴或束口袋。
   ・沒有垂下來的布角，沒有軟的尖角，輪廓上也沒有任何一階「一層比另一層低」的錯開。
3. 2 道摺沒有以「錯開一階」的方式出現。
   ・摺痕畫成從頂點放射往下的幾條直稜，讀成百褶燈罩、裙子、扇貝殼或蒜瓣的瓣線，不是兩層布疊起時外緣的錯階。
   ・16 px 下只剩一條中脊，加重了金字塔的讀法。
4. 蕾絲孔太小，16 px 與 14 px 完全消失。
   ・5 個孔的透明核心只有 1–2 px：(4–5,17)、(14,22)、(19,24)、(24,25)、(29,20)。外面的深色環約 3 px 寬。
   ・prompt 與第 4 輪方向都要求每個孔至少 5 個美術像素寬，這裡大約只有一半。
   ・16 px 下扇形下襬只剩下緣幾個小起伏，加上中段棋盤網紋縮小後變成灰色雜點，讀成石塊的質感，接近第 3 輪的雜點問題。
5. 描邊不是中性的。這單獨不是退回理由，但這輪的規格明寫「The outline is neutral」。
   ・飽和度 0.4 以上、色相 270–325° 的像素共 20 個，幾乎都在外緣描邊。例如 (30,15)=(29,1,33)、(30,16)=(18,1,18)、(9,19)=(19,0,30)、(27,23)=(38,5,30)、(11,23)=(33,11,38)、(1,16)=(31,9,33)。
   ・其中亮度 0.2 以上、3× 看得出顏色的有兩個：(8,22)=(81,42,70)（色相 317°，偏粉紫）和生成端旗標的 (21,27)=(51,0,82)。
   ・第 4 輪已經要求改成中性深灰描邊，這輪沒有改。

重畫方向：
・保留這輪的布料語言：垂墜、扇形下襬、深色環的孔、後層深灰、網紋。改的是整體構圖，讓 16 px 讀成平放的摺布，不是尖頂的堆。
・頂端要寬而圓：
  ・第一個不透明列的寬度至少是最寬列的 60%。上緣是一條寬的軟弧（布摺起來的圓邊），不要有頂點。
  ・不要從頂點放射的稜線，也不要左亮右暗的兩面分面。
・整體要明顯比高寬，寬高比至少 1.4：
  ・建議斜放的長方形摺布，四個角是軟圓角。
  ・左下或右下有一個垂下的軟角，讓剪影本身有「布角」。
・2 道摺用輪廓錯階表現：
  ・前層的下緣比後層高 2–3 px，後層從前層下緣露出一條深灰帶。
  ・兩道摺就是兩條平行的錯階，像 dusk-cloth 一層疊一層那樣，在 16 px 也看得出兩條橫向的層次線。
・蕾絲孔放大：
  ・4–5 個孔，透明核心至少 3×3 px，連深灰環至少 5 px 寬，沿著弧形下襬排。
  ・孔與孔之間的扇形瓣外凸至少 2 px。
・網紋縮小時不要變雜點：前層用一個平塗中灰，只在前層蓋住後層的地方留 1–2 px 的中間調表示半透明，不要大面積棋盤格。
・描邊改成中性深灰（R、G、B 相差不超過 8），特別是 (8,22) 和 (21,27) 這兩個看得出顏色的點。
・驗收標準不變：16 px 與 14 px 的灰色剪影本身，在把孔蓋住後，仍要讀成「一塊摺起平放的布」，而且不能和 cinder-dust、lantern-ash、tower-dust 同屬「尖頂的一堆」。
・給控制者：
  ・commit 訊息記載 cap 9 已用到 a8。是否還有重生額度，或改走單格重生，由控制者裁定，不在本審核範圍。
  ・不管哪條路，其他已放行格的 sha256 都不動。

旗標項目與邊緣判定（都不是退回理由）：
・(21,27)=(51,0,82)，色相 277°、飽和度 1.0、V 0.32，在下襬最下緣的描邊上。
  ・不符合 _deep_key（G 0、max(R,B) 82、飽和度 1.0 都符合，但色相 277° 低於 285° 的下限）。也不符合 _bright_key（max 82 < 120）和 pink_outlier（R 51 < 150）。
  ・1× 看不出。3× 在中、亮底色上是下緣一個偏紫的暗點，仔細看才找得到。色相在藍紫，不在洋紅 300° 附近，讀成描邊的陰影，不讀成洋紅殘留。
  ・邊緣判定，不算殘留。但它違反「描邊中性」，重畫時要改（見退回理由 5）。
・(8,22)=(81,42,70)，色相 317°、飽和度 0.48、V 0.32，在左下扇瓣的描邊上。
  ・G 42 > 20，不符合 _deep_key 與 _bright_key。R 81 < 150，不符合 pink_outlier。
  ・3× 看得出是一個偏粉紫的點，比 (21,27) 更接近洋紅色相。單獨不構成殘留，但同樣要改成中性。
・光暈、霧化：半透明 0，碰邊 0，外緣沒有亮邊或淺色暈。可接受。
・過度擦除：
  ・封閉透明區 5 個、共 6 px：(4–5,17)、(14,22)、(19,24)、(24,25)、(29,20)。和 QA 的 holes 5 一致。
  ・5 個全部在下襬，各自被深色環包住，是設計的蕾絲孔。QA 的 erased 4 落在這些孔裡，主體內沒有其他透明洞。可接受。
・風格一致性：描邊、2–3 階明暗、左上光源和已發布的素材 icon 一致。問題在造型，不在畫風。
・和其他件的區別：除了上面說的 cinder-dust、lantern-ash 讀法相撞，它和 dusk-cloth（紫色疊布）、epitaph-stone（灰色石碑）、兩件 veil 裝備、R3 其他 icon 都分得開。
・文字與宗教符號：沒有文字，沒有十字、光環或任何現實信仰的標誌。
