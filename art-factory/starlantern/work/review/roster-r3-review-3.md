# R3 獨立視覺審核紀錄（怪物名冊 r3）第 3 輪

審核者：全新脈絡的獨立審核代理（Claude Opus 5.5），沒有參與生成，也沒有參與第 1、2 輪。日期 2026-10-28。
commit：9082ec12a（9082ec12a59e5e71ea670c0a165222a55d915b28），分支 feat/starlantern-roster-e3，worktree C:\Users\bag57\.codex\worktrees\faces\super_galen_site。工作樹是乾淨的，本輪只讀。
方法：
・清單是 r3-round3-assets.txt，共 3 件。sha256 全部自己重算過（sha256sum 與 rv/mech.py），3 件都和清單一致。
・機械掃描，全部用 python -I 跑：rv/mech.py、rv2/pinkall.py、rv2/violet.py、rv2/bg.py、rv2/islands.py、rv2/holes.py，另寫 rv3/outline.py、rv3/fill.py、rv3/seqdump.py。
  - 3 件都是：半透明 0、碰邊 0、bright 0、deep 0、離洋紅 140 以內 0、亮紫 0。
  - mirage-lead 有 37 個封閉洞（304 px）。用 rv/erased.py 對 raw（art-refs\…\enemy-mirage-lead-a4.png，block 12）取樣，erased 3：(70,42)=(231,4,210)、(11,52)=(242,14,196)、(21,71)=(240,4,223)，都是 key。其他洞是手臂、頭、鏡像與紗之間真的縫。
  - 粉紫掃描只抓到外緣三個暗酒紅描邊點：(38,39)、(67,77)、(34,97)，V ≤ 0.44。
  - 描邊：外緣像素裡深色（max ≤ 110）的比例是 0.65。a3 是 0.44，已發布的 mirage-dancer 0.68、bell-warden 0.49、false-moon 0.47。
  - 填充率：同類的已發布守關者（roster_class warden）是 false-moon 0.472（3546 px）、bell-warden 0.673（4328 px）、archon-hand 0.670、requiem-conductor 0.731。mirage-lead 是 0.555，4357 px。
・視覺：
  - 自己做的放大圖（10–20×）：rv3/lead10.png、lead_lowleft.png、veil20.png、seq20.png。
  - raw 與成品並排：rv3/icons_cmp.png、raw_seq4.png、raw_a4.png、raw_a5.png。
  - 暗、中、亮三種底色上的 1× 與 3×：rv3/seq_tips.png，並和第 1 輪已放行的 mirage-brick 並排。
  - 16 px 與 14 px（LANCZOS）的清單列：rv3/s_veil.png、s_seq.png。和已發布的素材圖示並排：dusk-cloth、marble-shard、lantern-ash、tower-dust、grey-cord、iron-shard、storm-stone、epitaph-stone、moon-silver、shadow-thread、crystal-shell、old-coin、market-token、spent-wick、gilded-scrap、glitter-scrap、archon-gold、silent-bronze、music-comb、bell-shard、king-scale、first-flame、star-tear 等；也和同批的 cinder-dust、forge-slag、silence-snow、porcelain-chip、glacier-scute、ash-page、copper-band、copper-anklet、mirage-brick、tyrant-cinder、starfire-core、blue-ember 並排。
  - 敵人用 contact sheet 第 1 列的遊戲內畫面看（bg-f1／f2／f3，走 review_roster.placement，也就是 BattleView 的縮放），原尺寸與 2× 都看了。
・對照：
  - spec §13.3 描述表。mirage-lead：「a tall heat-haze dancer with flowing veils of light and a copper anklet, faceless, two faint mirror copies behind it」。
  - spec §13.3 的故事怪物無臉規則。
  - tools/roster_art.py 的 MAT_DESC。mourning-veil：「a folded grey lace mourning veil」；mirage-sequin：「a large bronze sequin shimmering with heat haze」。
  - prompts/sheet-icons-roster-4.txt 的修正句。
  - 第 2 輪三件 FAIL 的重畫要求。
  - contract.md 的「審核的界線」（宗教符號）與洋紅溢色定義（色相 280–345°，R 和 B 都比 G 高 30 以上）。

放行清單（每行一件）：
- enemy-mirage-lead e22091beead80d11923f399580a855655b03deb52ef7fabd0c7b7cd107e01068 通過
- icon-mirage-sequin 96be0fda8d14167f206adf0259718bbd2309af600458ef1f4b062048859e0dfd 通過

FAIL（1 件，不列入上面的清單）：
FAIL icon-mourning-veil 91d4f7904aff138ef42bdfd6cff7feb8f2414ac64f812eaf245d2757b9a87a72

改善的部分：顏色改成灰色了（平均亮度 97，L > 200 的只有 1.3%），也和 marble-shard、cinder-dust 分開了。

但它還是讀不成蕾絲：
・raw（sheet-icons-roster-4-a4 第 3 格）畫得是對的：上方兩三道摺，下緣一排白色圓環加深色孔的扇形蕾絲邊。
・7 px block 取樣後，每個圓環只剩約 3 個美術像素，環和孔落在哪一格是隨機的。結果下半部（第 12–24 列）變成深淺亂點，沒有規則重複的孔。第 2 輪明確禁止的「random speckles」又出現了。
・扇形邊只剩下緣一點起伏。上半部的摺痕在 20× 才隱約看得到。整件是不透明的實心塊，看不出「sheer」。
・3× 讀成灰色石塊、履帶或散熱片；16 px 與 14 px 是一塊灰色磚頭或礦石，和 epitaph-stone、iron-shard 同一類。和 dusk-cloth 比，dusk-cloth 一眼是摺好的布，這件不是。

另外，下緣 (21,27)=(54,12,41) 是一個帶 key 色調的暗描邊點（色相 318°，還沒到溢色門檻）。這不是退回理由，重畫時一併留意。

重畫方向：
・保留 raw 的構圖：摺起的灰紗，下緣是蕾絲邊。
・孔要少而大：前緣一排只放 4–5 個圓孔。每個孔在原圖至少 5 個美術像素寬（約 35 source px 以上），中間是透明孔，或很深的灰。每個孔外面一圈完整的深灰描邊，扇形邊的每一瓣對齊一個孔。
・紗面用平塗的中灰，加一階深灰陰影。不要細網格紋或抖色，在 block 7 下那些都會變成雜點。
・摺痕只畫 2 道，每道用 2 px 的深灰線分開。可以在摺層之間讓後層透出較深的灰，表現半透明。
・在 16 px 時必須看得出「有一排圓孔的布」。
・給控制者：raw 本身是好的，問題出在取樣。先試 cover_sample 或 mode 取樣（skill-cell 已經用 cover_sample 處理細線），或許不用重畫。不過那不在本審核的範圍。

旗標項目與邊緣判定：

・enemy-mirage-lead（放行，鏡像分離是邊緣判定）。第 2 輪的三點都做到了：
  - 描邊：本體外緣是連續的深酒紅描邊，例如 (35–36,80–85) 是 (99,9,16)、(105,9,15) 一類。深色外緣的比例從 a3 的 0.44 升到 0.65，和 mirage-dancer 同級。遊戲內 1× 是清楚的人形剪影：一手高舉、火焰頭、腰身、裙、腳。
  - 銅腳環：在 (36–43,83–88)，是約 5 px 高的金屬環帶。上下緣是深紅褐線 (232,80,15)、(199,42,10)，中間是金色加白色高光 (254,251,221)。遊戲內 1× 是腳踝上一道清楚的橫帶，2× 看得出是環。
    - 色調偏金橘，不是棕銅色，但在全身火色的配色裡可以接受。和已發布的 copper-anklet 圖示（棕銅鍊加金鈴）不同色，這不是理由。
  - 鏡像：兩個鏡像是淡米色，比本體淡很多。頭、手臂、軀幹和本體之間有透明的縫（例如 (55,27) 一帶 49 px、(22,30) 一帶 29 px）。腰以下本體的橘紅紗壓在鏡像的裙上，交界有深色描邊分開。整張仍是 1 個連通塊。
    - 鏡像在 spec 裡是「behind it」，所以下半身重疊合理。遊戲內 1× 讀成「一個舞者，左右各一個淡色分身」，所以放行。
  - 守關者的份量：填充率 0.555 低於 fog-warden 的 0.633，但 fog-warden 是頭目級（boss），不是同類。同類已發布的 false-moon 是 0.472、3546 px，mirage-lead 是 4357 px，和 bell-warden 的 4328 px 相當。遊戲內守關者和一般怪用同一個高度比例，所以份量靠寬度：本體加兩個分身成一列，在場上比單隻的 mirage-dancer 寬、也更有陣勢。可接受。
  - 和 mirage-dancer 的區別：
    - mirage-lead 是正面、左右對稱、金黃色，兩側有淡色分身，腳上有環；
    - mirage-dancer 是紅橘色的側身旋轉，有大片飄紗。
    - bg-f1 三隻並排、bg-f3 同場時，一眼分得開。
  - 無臉：頭部是光滑的火焰形，10× 也沒有五官。
  - 宗教符號：沒有。

・icon-mirage-sequin（放行，粉點是邊緣判定）。
  - 形體：是一片斜角的亮片，3/4 角度的橢圓、細描邊，邊緣附近有一個縫線孔 (13,7)：1 px 透明加深色環。後面疊兩片小亮片，周圍有星形閃光。
  - 沒有碗，沒有往上冒的熱氣線。3× 讀成「一疊金色亮片」。
  - 主片的陰影有點鼓，比 prompt 要的「shallow dimple」厚一些，但邊緣是細線，不是碗壁。這是邊緣判定。
  - 16 px 與 14 px 是金色的一小簇加閃光。market-token 是單一顆帶銅綠的圓球形，old-coin 是銀色人頭幣，spent-wick 是碟子加蠟燭，三者都分得開；和同批的 copper-band、copper-anklet、mirage-brick 也分得開。
  - 右上的星形閃光是一個 10 px 的離散小島，(26,2)–(26,6) 一帶。它是完整的四芒星，不是散點，可接受。
  - 生成方提到的淺粉點（6 個），我逐點讀了數值：
    - (4,2)=(160,74,74)
    - (5,2)=(249,95,116)，色相 352°
    - (4,3)=(243,126,118)
    - (26,2)=(238,133,133)
    - (26,6)=(164,83,83)
    - (4,8)=(238,147,143)
  - 這 6 點的判斷：
    - 全部在外緣。
    - raw 對應的閃光尖端是橘黃色，(4,2)、(26,2)、(26,6) 三點 B＝G，正好是 despill 把洋紅混色壓回去的痕跡。所以它們的來源確實是 key 混進閃光尖端，不是畫上去的粉色。
    - 色相 352–4°，R 和 B 也沒有同時比 G 高 30 以上，不在 contract 的溢色定義與 pink_outlier（300–345°）範圍內。
  - 不同大小下的觀感：
    - 1×（遊戲的背包格大小）看不出，讀成閃光的暖色尖。
    - 3× 在暗底上，左上閃光的上臂有 2–3 px 偏粉，右上閃光的頂端有 1 px 偏粉。
    - 第 1 輪已放行的 mirage-brick，熱浪尖端有更多、更亮的同類粉橘點，例如 (255,86,97)、(254,105,126)。
  - 所以它們不讀成洋紅殘留，不構成退回理由。若之後因為其他原因重取樣或重畫，請一併避開。

・給控制者：
  - sheet-icons-roster-4 已經用到 a5，cap 延長 3 次已經用掉 2 次。mourning-veil 若要重新生成，只剩 1 次。
  - 建議先試取樣設定（理由見上面的 FAIL）。若重畫，用上面的重畫方向，只換 mourning-veil 一格，其他已審過的 sha256 不動。
