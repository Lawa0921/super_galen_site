# R4 獨立視覺審核紀錄（怪物名冊 r4）第 2 輪

審核者：全新脈絡的獨立審核代理（Claude Opus 5.5），沒有參與生成，也沒有參與第 1 輪。日期 2026-10-29。
commit：派工單寫的是 b8b1ad7e9（b8b1ad7e9，「chore(art): R4's five review fails redrawn; roster sheets slice row by row when columns stagger」）。worktree 的實際 HEAD 是它之後的 728f52bdb（728f52bdb23fc39b9ad7cf9411962571690a0d61，「docs(starlantern): debt-collector's name agrees with §0; follow-up F8 for the 5d key residue」）。
・728f52bdb 只改了 contract.md、plan 與 spec 三個文件，共 6 行，沒有動任何圖檔。
・本輪 8 件的 sha256 和清單一致，所以判定以清單上的檔案為準。
・分支 feat/starlantern-roster-e4，worktree C:\Users\bag57\.codex\worktrees\faces\super_galen_site。工作樹乾淨，本輪只讀，沒有改動 repo。

方法：
・清單：roster-r4\r4-round2-assets.txt，共 8 件。sha256 全部用 python hashlib 自行重算（rvr\sha.py），8 件都一致，沒有不符。
・機械掃描（python -I，腳本在 roster-r4\rv2\，沿用 rvr\mech.py；直接呼叫 tools/sl_art.py 的 _deep_key、bright_key_count、pink_outliers、key_hue_pixels，只讀）。
  ・8 件全部半透明 0、碰邊 0、deep_key 0、bright_key 0、pink_outlier 0。
  ・色調掃描：hue2.py 掃色相 270–345°、飽和度 ≥ 0.12、V ≥ 0.15；outl.py 逐件列出外緣上偏洋紅的像素（R、B 都比 G 高 12 以上）。
  ・封閉透明區：commander-medal 2 處（18、13 px）、ash-chrysanthemum 3 處（4、2、1 px），其餘 0。
    ・弔菊用 rvr\erased.py 對 raw（art-refs\...\single-icon-ash-chrysanthemum-a1.png，block 25）取樣，erased 0，三處都是 raw 裡的 key 縫。
    ・勳章兩處放大後是緞帶兩尾與吊環之間的真縫，QA 的 erased 也是 0。
・lizard-scale 修復：liz.py 和已發布的 public/assets/games/starlantern/icon/lizard-scale.png 逐像素比對。
  ・已發布檔 sha256 是 72cfc7afd2f35040b7cc1e9ac5b246b6ca0116eb7da4208f90ccc9d9b70624cd，和 contact sheet 的說法一致。
  ・尺寸相同（30×37），alpha 完全相同，RGB 剛好 10 個像素不同。
  ・這 10 點正是修復前 key_hue_pixels 抓到的 10 點：(12,6)、(10,7)、(11,7)、(21,29)、(7..12,35)。每點的新值都等於它非 key 8 鄰的逐通道中位數。
  ・修復後 deep_key、bright_key、pink、key_hue_pixels 都是 0。
・視覺：
  ・逐件 9–18× 放大，放在中灰與清單列底色 #0f0e16 上（z_icons、med_z、vb、mk、mks、ch、crabz、liz.png）。
  ・圖示做 16 px 與 14 px（LANCZOS 等比塞進方格，rvr\small.py），1× 加 5×，放在 #0f0e16 上和已發布、同批的圖示並排：
    ・leech-plate 對 hydra-scale、lizard-scale、larva-glow、jelly-cell、spore-sac、mire-gland、brood-shell、moss、pale-tendril、king-scale、mist-root、bog-peat、scorpion-stinger（leech16、leech14、lc.png）。
    ・crab-plate 對 rivet、fog-gate-plate、iron-shard、glacier-scute、crystal-shell、hollow-buckle、titan-hide、colossus-bolt、archon-gold、rime-crown-shard、gate-splinter、brood-shell、komainu-fang、lantern-ash、forge-slag（crab16、crab14、c1、c2.png）。
    ・commander-medal 對 potion、ether、antidote、market-token、old-coin、vault-coin、red-pennant、knight-crest、silent-bronze、dragon-gold、moon-silver、copper-band、star-stone、festival-paper、herald-horn、shrine-rope、phoenix 等（med16、med14、m1、m2.png）。
    ・black-veil 對 dusk-cloth、shadow-thread、grey-cord、tower-dust、mirror-sliver、blank-mirror、shade-crystal、bat-wing、torn-page、ash-page、cinder-dust、blight-ash、twin-thread、spent-wick、wight-wick（veil16、veil14、v1–v5.png）。
    ・ash-chrysanthemum 對 rot-petal、marble-shard、mother-light、silence-snow、lantern-ash、cinder-dust、blight-ash、tower-dust、moss、mist-root、pale-tendril、ice-crystal、frost-heart、snow-voice、crane-paper、festival-paper、star-stone、ashen-acorn、spore-sac、rime-crown-shard、shrine-rope、prayer-rope、mirror-feather、kite-plume、roc-plume、dream-sand、essence-common（chr16、chr14、ch1–ch4.png）。
  ・faceless-mask：
    ・小圖 26 px 放在背包暗底 (22,20,30) 上，1×、3×、5×。
    ・並排的有已發布的 festival-mask、mire-miasma-mask、set-shade/frost/iron/mire-head、crystal-aegis、iron-unbroken-shield、moonless-mirror、last-dance-veil、everwinter-veil、scale-helm、wooden-buckler、starfire-tiara、crystal-pendant、moss-charm，以及同批的 gatewarden-shield、icon-blank-mirror（g26、g26a、g26b、g26row、g26c2.png）。
    ・大圖 64 px 用 7× 看。
  ・contact sheet：r4-round2-contact-sheet.png，看了每列的新舊版與撞圖對象。
・對照：
  ・spec §0 第 21 條（弔菊）與 §5 名冊列。
  ・tools/roster_art.py 的 MAT_DESC：leech-plate、crab-plate、black-veil、commander-medal、ash-chrysanthemum。
  ・UNIQUE_DESC 的 faceless-mask，以及 unique 物件一律加「fine gold filigree」的通則。
  ・prompts/sheet-gear-roster-6.txt 與 single-icon-ash-chrysanthemum.txt 的修正句。
  ・第 1 輪紀錄 r4-review.md 的 FAIL 段與重畫方向。

放行清單（每行一件）：
- icon-leech-plate cf80e5ae1e34e3c76c9b2c268dd0f30a12a790685ae0a87778e10407b86e91d8 通過
- icon-crab-plate 96973e7cc50460108af8a20f187f92c9f2c6d77361bdc11b19193fb0552b1086 通過
- icon-commander-medal ec23a4dc852cf1bcea14a514757acb4cb1fdbc9cfed8b4678ee982685fb62d83 通過
- icon-black-veil ed2874d127cb0a26d6cebec07cfca7cd9154d46c75d63ca66798e18990dd8059 通過
- gear-faceless-mask-large 35d5ca90831375bb940e7bd449907c9ac9532ffc128cf50878d0d591b930835b 通過
- gear-faceless-mask 05dcfed42b91dd4ec6d017632ba3be083d2e8470964fed4c177c8bc63125fac6 通過
- icon-ash-chrysanthemum 38bc2ee786f829224b133f24771f2c9e1460558d8a59fbb1a4343b426cb77a01 通過
- icon-lizard-scale 622dbf5055d29fa04be9324e7382e467dec15a7993ea8e009c4767a9b8d92671 通過

FAIL：本輪沒有。

逐件判定與邊緣判定：

icon-leech-plate（a4）
・照第 1 輪方向重畫：
  ・橫躺、寬約高的 1.8 倍（34×20）的肥胖水蛭形甲片。
  ・4 道深色環節線在 16 px 仍看得到。
  ・左端是暗紅圓環加黑心的吸盤口。
  ・外緣一圈淺藍灰的金屬亮邊。
  ・主色光滑深綠，冷白高光。
・16 px 與 14 px 讀成一條分節的綠色水蛭或蛆，和 hydra-scale、lizard-scale 的斜放尖鱗片完全分開，和 larva-glow、spore-sac、mire-gland 等也分得開。
・邊緣判定：
  ・寬圖等比縮到 16 px 只剩 16×9，又暗，是本輪最小的一件。但輪廓與環節仍讀得出，可接受。
  ・也有人可能讀成「綠色幼蟲」，不是「甲片」；靠金屬亮邊撐住，可接受。
・外緣有 (7,3)=(27,4,28) 等 3 點近黑的帶 key 色外框，V ≤ 0.11，和已放行的名冊圖示同級，看不出來。

icon-crab-plate（a4）
・扇形殼片：
  ・寬明顯大於高（36×24）。
  ・外緣一圈鏽紅，殼緣有一排短刺。
  ・中間鐵灰，沿外緣有鉚釘。
  ・色調對得上 siege-crab 本體。
・16 px 與 14 px 靠鏽紅外圈和扁扇形，和 rivet（灰色圓頂加方底）清楚分開，也和 fog-gate-plate、iron-shard 分開。
・和已發布的 archon-gold（金冠）輪廓同屬「上緣有尖」，但一金一灰鏽，16 px 分得開。
・邊緣判定：
  ・(25,4)=(131,71,85) 是一根短刺尖端上的單一灰玫瑰色像素，色相 346°、飽和度 0.46，上方沒有黑外框，16× 看得出是一點梅褐。
  ・沒有任何閘門抓到（G 71，遠高於 key 閘門），色相離鏽紅只差十幾度。1× 與 16 px 在 #0f0e16 上看不出，讀成刺尖的鏽色。
  ・比照第 1 輪對 siege-crab、herald-engine 暗梅點的判法，可接受。
  ・若控制者要順手清，這一點要另案處理（現有 repair 規則抓不到它），不強制。

icon-commander-medal（a4）
・寬燕尾的紅緞帶，寬度遠超過圓盤；V 形兩尾往下垂。
・古銅圓盤縮小到全高約一半，盤面是一顆淺浮雕星。
・16 px 與 14 px 的輪廓是「上寬下圓」，和 potion、ether、antidote 的「下圓上一小截瓶塞」正好相反，不再相撞。
・和 market-token、old-coin、vault-coin 等素面圓片也靠紅緞帶分開，和 red-pennant、knight-crest 靠圓盤分開。
・邊緣判定：
  ・星形浮雕在 18× 看是上、左、右三臂加往下分叉的兩腳（五角），中間的縱向亮線往下只到中心附近就變暗。
  ・不是十字，也不是宗教或文字記號；16 px 只剩一團亮點。可接受。
・封閉透明區兩處是緞帶與吊環之間的真縫，沒有擦掉美術。

icon-black-veil（a5）
・色彩：
  ・474 個不透明像素裡 437 個是中性色（R、G、B 相差 ≤ 8）。
  ・色相 270–345°、飽和度 ≥ 0.12、V ≥ 0.15 的像素是 0 個（第 1 輪是 157 個）。
・生成端說的「一點淡梅色」：
  ・最可能是 (23,27)=(96,92,102)，色相 264°，差值 10，肉眼看是中灰。
  ・另有 (29,24)=(35,8,27)、(19,7)=(25,0,29) 等 V ≤ 0.14 的近黑外框點。
  ・都看不出，可接受。
・構圖：長垂墜加右下飄出布尾，炭黑布面上有沿摺痕走的中性淺灰硬邊高光，12× 讀成一塊有摺的黑布。
・在 #0f0e16 上，16 px 與 14 px 都有清楚輪廓，不再消失。
・邊緣判定：
  ・16 px 時亮邊佔的比例讓整件看起來偏灰，不是純黑。但暗部仍是主體（L < 40 的像素佔 48%），讀成深色的布。
  ・和已發布 bat-wing（灰紫、有翼骨的膜）同屬「斜放的灰色薄片」，16 px 時相似度是本輪最高的一組。
    ・兩件靠明度與色相分開：veil 平均亮度 59，中性灰黑；bat-wing 81，帶紫灰淺膜。
    ・輪廓也不同：veil 是下垂的布條加布尾，bat-wing 是往右上張開、有扇骨尖角的翼。
    ・可接受，記錄在案。
  ・和 dusk-cloth（紫色疊布）已完全分開。

gear-faceless-mask-large、gear-faceless-mask（a3，同一格切出的兩張）
・照第 1 輪方向重畫：
  ・3/4 側臉：左側與上下是金色捲草邊，右側無邊，露出臉的側面。
  ・右緣中段有一個小鼻樑凸起。
  ・一條斜過整張臉的冷白鏡面高光帶。
  ・下巴圓。
  ・兩條長綁帶從兩側往下垂，長度遠超過面具寬的一半。
  ・沒有眼洞、沒有嘴。
・26 px 與 64 px 都不再是鳶形盾輪廓：
  ・和 crystal-aegis、iron-unbroken-shield、wooden-buckler 以及同批 gatewarden-shield 都分得開。
  ・和 moonless-mirror（銀色圓鏡加柄）、icon-blank-mirror（手鏡）也分得開。
・邊緣判定：
  ・主色從深藍改成深綠黑的鏡面。spec 只寫「dark mirror」，深色玻璃成立，可接受。
  ・第 1 輪建議的「冷藍灰亮邊」換成了金色捲草邊。這是 unique 物件「fine gold filigree」的通則，而且金邊在暗底上一樣給出輪廓，可接受。
  ・26 px 小圖是本輪最勉強的一件：
    ・鼻樑凸起與眉弓在 26 px 幾乎看不出，輪廓接近一顆蛋形。
    ・深橄欖灰的綁帶在背包暗底上對比低。
    ・1× 也可能被看成「金框的深綠橢圓鏡」或寶石。
    ・判可接受的理由：
      ・無五官的面具本來只能是橢圓。
      ・不對稱的單側金邊、斜向鏡面高光加垂下的綁帶，已經是 spec 允許範圍內最強的面具訊號。
      ・它不再被誤讀成背包裡的另一類裝備（盾）。
    ・若之後要求換圖，最有效的改法是把綁帶提亮一階（中灰），並在 26 px 加大右緣鼻樑凸起。
  ・64 px 大圖讀成一張有綁帶的光滑鏡面假面，清楚。
・外緣有 19 個（大圖）與 3 個（小圖）近黑的帶 key 色外框點，最亮是 (8,29)=(29,0,34)，V ≤ 0.13，看不出，可接受。

icon-ash-chrysanthemum（a1，新素材）
・對得上 spec §0 第 21 條與 MAT_DESC：
  ・一朵灰白、蓬鬆的圓花頭，下緣有幾縷下垂的花瓣。
  ・短而微彎的深綠莖，一片小葉。
  ・花瓣上散著 5–6 點橘色餘燼，和灰色斑點。
・16 px 與 14 px 讀成「一朵白花加綠莖與葉」。
・沒有文字，沒有宗教記號（不是放射狀的徽章、不是十字或法輪的對稱形）。葬儀用花依 spec 不算宗教標誌。
・區分：
  ・和 mother-light（灰白尖團加黃光核）在 1× 同屬淡色圓團，但它有黃色光核，這件有綠莖與葉，16 px 分得開。
  ・和 silence-snow（藍白圓球）、marble-shard（白石加金帶）、rot-petal（黃綠單瓣）、moss、mist-root、lantern-ash、cinder-dust、blight-ash、tower-dust 都分得開。
  ・和已退役的 mourning-veil 無關，那件從未發布。
・邊緣判定：
  ・花頭的質感是很碎的灰／米白點狀，「細長下垂的花瓣」只在下緣看得出幾縷。
  ・12× 有一點像白花椰或繡球，菊花的辨識度靠整體印象與莖葉。
  ・spec 要求的是 16 px 讀成花，這點有做到，可接受。
  ・主色偏暖的米白，不是冷的灰。spec 寫「灰白」，接受。
・封閉透明區 3 處（4、2、1 px）在花頭與莖的交界，raw 取樣全是 key，是真縫。

icon-lizard-scale（已發布 5d 圖示的 key-hue 修復）
・逐像素比對結果見方法：剛好是那 10 點，alpha 不變，殘留閘門全為 0。
・左上 (12,6) 改成暗藍 (21,16,42)，(10,7)、(11,7) 改成暗青 (6,56,80)：12× 看起來是外框內側的暗青，和下一列 (10,8)=(5,43,51) 的原圖外緣同色系，自然。
・(21,29) 改成 (5,13,39)，混進右下的暗藍外框，自然。
・邊緣判定：
  ・底部 (7..12,35) 六點從洋紅改成黑，和原本就是黑的第 34 列疊成一塊 6×2 的黑色平底。
    ・12× 在中灰上看得出尖端下有一小塊方形黑墊，外框在這裡是 2 px 厚。
    ・在清單列底色 #0f0e16 上和底色融在一起；1× 與 16／14 px 都看不出。
    ・比修復前的洋紅條好很多，可接受。
    ・這六點本來就是 sheet 縫的背景，不是美術。若以後要更乾淨，正確做法是把第 35 列的 alpha 清掉，但那超出這次「alpha 不變」的修復規則，不強制。
  ・修復後外框上仍有幾點近黑的帶色像素：(13,5)=(46,0,21)、(14,6)=(34,1,25)、(4,14)=(39,3,47)、(25,22)=(33,4,37)、(2,17)=(27,3,15)。
    ・V ≤ 0.18，都在 key_hue_pixels 與 _deep_key 的門檻下。
    ・12× 在中灰上 (13,5)、(4,14) 看得出一點深梅色，1× 看不出。
    ・比照已接受的 silent-bell (99,3,89)、thunder-roc (110,6,107) 等先例，亮度遠低，可接受。

給控制者：
・8 件全部可放行。上面放行清單的 sha256 就是清單上的檔案，發布時不要再動這些檔。
・icon-lizard-scale 發布時，覆蓋的是 public/assets/games/starlantern/icon/lizard-scale.png（舊 sha256 72cfc7afd2f3…）。
・HEAD 已前進到 728f52bdb（只改文件）。核准紀錄若要寫 commit，請以實際要合的 commit 為準。

審核範圍以外的觀察（沒有列入判定）：
・已發布的 bat-wing 外緣有兩點亮洋紅（12× 可見），已在 plan F8 的 16 件清單裡，不重複列。
