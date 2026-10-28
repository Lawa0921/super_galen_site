# R4 獨立視覺審核紀錄（怪物名冊 r4）第 1 輪

審核者：全新脈絡的獨立審核代理（Claude Opus 5.5），沒有參與生成。日期 2026-10-28。
commit：5653f293d（5653f293d32d6f48f2a86a16f23a615bc45749c4，「chore(art): roster R4 generated and QA'd, and the E3c veil redraw, ready for review」），分支 feat/starlantern-roster-e4，worktree C:\Users\bag57\.codex\worktrees\faces\super_galen_site。工作樹乾淨，本輪只讀，沒有改動 repo。
方法：
・清單是 roster-r4\r4-assets.txt，共 78 件。sha256 全部用 python hashlib 自行重算（rvr\sha.py），78 件都和清單一致，沒有不符。
・機械掃描（python -I，腳本在 roster-r4\rvr\，直接呼叫 tools/sl_art.py 的 _deep_key、bright_key_count、pink_outliers，只讀）：
  ・mech.py：78 件全部半透明 0、碰邊 0、bright_key 0、pink_outlier 0。整張圖的 _deep_key 只有 gear-parade-boots-large 一點（見旗標項目）。
  ・封閉透明區：逐件列出位置與大小，holes.py 用青色標出來看（rvr\h1.png、h2.png、hg.png）。全部是手臂與身體、樹枝、旗面破洞、鎖環、戒指圈內的真縫。
  ・erased.py（沿用 R3 rv\erased.py，用 sl_art 的 cutout／to_art_pixels 照 QA 的 block 取樣 raw）：debt-collector 1、herald-engine 1、banner-bearer 8、mire-hydra 1、vault-dragon 1、grey-elder a2 3 點，取樣值全是 G ≤ 8、R 與 B 166–250 的暗化 key，例如 (234,2,224)、(166,2,158)。是縫裡的背景，不是被擦掉的美術。
  ・色調掃描（violet.py、hues.py、colorsys 版）：找色相 284–331°、飽和度 ≥ 0.3、V ≥ 0.3 的像素。
  ・份量（不透明像素／外框面積，fill.py）。頭目：mire-hydra 0.68、grey-blight 0.71、bog-leviathan 0.80、faceless-host 0.64、vault-dragon 0.77、shadow-parade 0.76、fortress-colossus 0.70、siege-titan 0.81、last-commander 0.55。守關者：grey-elder 0.75、locked-vault 0.84、gate-breaker 0.68。全部 ≥ 0.55。已發布頭目最低是 silent-bell 0.51，lanterneater 0.60、fog-warden 0.63。
・視覺：
  ・敵人：3× 灰底（rvr\e1–e4.png）、頭目 2×（b1–b3.png）、臉部與細節 5–8×（f1–f4、g1、at、t1、fk.png）。
  ・遊戲大小：審核頁 img\battle-f1／f2 的舞台圖逐段裁切（st1–st3、z1.png），另做 1× 與 2× 疊在戰鬥背景上（gs1.png）。
  ・last-commander 和已發布的 hollow-champion、fog-warden、lanterneater、hollow-hunter 並排（cmpb.png）。
  ・圖示：6× 格子（i1、i2.png）。16 px 與 14 px（LANCZOS，等比塞進方格）在清單列底色 #0f0e16 與中灰上的 1× 與 6×（s16a、s16b、s14a、s14b.png）。
  ・圖示和已發布素材分組並排（cA–cI.png），另有 lz、rc、rc16、rc14、md、md16、iou、iou16、bp、bp16、lt、lt16.png。
  ・專屬獨特：大圖 3×、小圖 5×（gl、gsm.png）。小圖 26 px 在背包暗底上，和已發布的盾、面具、弓、戒指並排（gc1、gc2.png）。
  ・contact sheet：r4-contact-sheet.png 的縮圖。審核頁 index.html 的 QA 數字、所有版本、淘汰原因與生成端旗標。
・對照：
  ・spec §5.4–5.6 的名冊、§13.1 尺寸帶、§13.3 的描述表與畫法（故人沒有清楚的臉）、§13.5 的 R4 清單。
  ・tools/roster_art.py 的 DESC、MAT_DESC、UNIQUE_DESC、REGION_PALETTE（mire、shade、iron）、NO_FACE_IDS、STORY 閘門清單。
  ・data/enemies.roster.ts 的 remnant：R4 有 hush-acolyte、debt-collector、fallen-knight、banner-bearer、last-commander，加上 NO_FACE_IDS 的 veil-stalker。
  ・prompts/sheet-icons-roster-6.txt 的修正句。
  ・contract.md 的審核界線、_deep_key 的 KEY_TINT_INSIDE_MAX、bright_key、pink_outlier 定義。

放行清單（每行一件）：
- enemy-bog-mother df7d2b51fc40beb5a20b886a823bb221e7a9c3b64149c07dcf8fa0fb90737622 通過
- enemy-rot-lily 56ea51cbd52aaa3aab3df0233e2a9a837850b6c2edb92fcb342af4a3aef435ab 通過
- enemy-leech-knight 510b416ddedb0f23ac23d6b56c6d512cbd90506f104f4bbd583738a78a3e08bf 通過
- enemy-ashen-treant eebfa55c580fa32b75db353ee98bf79106ba169e78dc9a10f400bf98ed78c1bb 通過
- enemy-spore-moth 96e23a768827052aaa168d4246a14184d16466d630a874010262b425bef0dd0a 通過
- enemy-mirror-thief 55cb913398c24b4b08e2712370ab8372c34cdd5a3e8ab54f94ee4f690cb05be6 通過
- enemy-veil-stalker df307d269f067e0f7fbfc9a8938e0043ee5f6039636ce2dc2f59e54b587b40f4 通過
- enemy-hush-acolyte 317d931c081f5313a77ac9770e92b092ae108596eedb87a2e11d3607c482349c 通過
- enemy-vault-mimic 5b849d8fa31a73c22ea96422141b7bb84dac73b80a03d6d72a844a68353a1139 通過
- enemy-debt-collector a6ac317f69a7ed0d2d913d99ade3533af702db6744b0b11bec0c2997df63b4ed 通過
- enemy-rivet-golem dbb065f4f3732c2193af5c768c1093fd070ade411f4c4004e43c2eb8550c285d 通過
- enemy-siege-crab 43a129243a0300f705fce7429889fdcbfb30cff8d92e99e5e19a3b7d4db78445 通過
- enemy-herald-engine 30eac7b01d62bda4f39ff7e5255e06ba5b98a9a675cc2c69ac4aa9756e9db6fe 通過
- enemy-fallen-knight 155c90d9800576462e9a5c43c937b004513cfe321d305b51d4d950bc1703e4c7 通過
- enemy-banner-bearer ed4749319013bdd528c0780e310e6c6b496f1a7dcf7199cbed516f79fe0263cf 通過
- enemy-mire-hydra 433d1c4f85352f34cb0bce360ce0fc8480ec48f159a1dbe1b596861e4168f459 通過
- enemy-grey-blight 174db3abfd5e2e849da15efcb13e2e69b4d202a0ddde2e727bae24db9efe4827 通過
- enemy-bog-leviathan 02f20c546334f37b6b9ac03bb2d53e6d861be61995a6f7d180e15b156314c321 通過
- enemy-faceless-host c003f050a9a6f5e9b930e2a5e19ca719cf97e2d3362c8343cb9844e5cdec19ef 通過
- enemy-vault-dragon d13ec44ef83e3cc7c0e3a06ebd78206c82ad3895b8920e787679d8d2d6841c12 通過
- enemy-shadow-parade d930dae7f6b05f7c4c007d88a5aa67969ca41911df6d454eb27b29b01237ef16 通過
- enemy-fortress-colossus 26427b6363ee72a6e1e514468c3dc1be55be27d29974cda70c079178d2b0404b 通過
- enemy-siege-titan 0294fd64cb3019fa41f35a8061a245be1f1c3bae5ae0fa383ce33ec71f5332c4 通過
- enemy-last-commander 5693d3686b0d1f3ebbdb0bf53d75cebcb452870bc8d8237632dce54bf53db60e 通過
- enemy-grey-elder f5427065fa45a54545bf2783919c43d426eb6c9faf6ce0c98aab7d5aa10ee0cd 通過
- enemy-locked-vault 61f5edfdb046bbb815a4cba615abf026ec72db9f8fc60b1d11fc0d12f970d8a4 通過
- enemy-gate-breaker f4404efd43fb2f972a062e8b1076dae757aaa1d07fb3b020c1dc865dfa1e0ab1 通過
- icon-bog-peat 820d5a8835ac1e91f3f6f9b5b6fa94b137fe189e04f71c4681243493039ebd90 通過
- icon-rot-petal 924d6703a90b0056ed65646fce55fe8fc3d33d69fb73b38981fe941b552e987e 通過
- icon-carved-bark f8a848e556f8316afc0b233dc2627bc6c2482a83e0a2450f286be5fe82a8cd91 通過
- icon-spore-sac 42fe53ff315cb3d4b0edd96bc7d182b166df4e682737f673605980ad6b1af484 通過
- icon-mirror-sliver b6b4b5c113ecd5b29fe50b8e4303fd43dbf0d1f37d3ce2d80acef3693b6f7e3a 通過
- icon-hush-bell 105fadf89cad31ce3a3f8223a57138a2ed8807b900631deefa708fb1bb68d0d9 通過
- icon-vault-lock 1bd4238d72023fcba4f695ddc8d31b597ed91e3e5326634328249922a8ab8600 通過
- icon-iou-slip c4e0f554599b847d50c55f8d2cecb4214b2f061ed124d440e41ddde324664b18 通過
- icon-rivet 5352e371476b2b45fbddeaf5811adb13e9a34a64e44bfb50bac41f696398c936 通過
- icon-herald-horn fc74fced959f8a4077996248c6005e71faf26dbe04ffbd8c27559cfbc20c9eec 通過
- icon-knight-crest 61621194ae5cacb09011e04ac1215f60783617a37356e0a66240e4cdc971a5fb 通過
- icon-red-pennant 1b7f3d8ce160e47e006a41be4c61cd4042ca2d0895312804944bd87e9cb897dd 通過
- icon-hydra-scale 7fd17d34304f28b777116eab330c28cd3417b44da08b673561721a09a294316a 通過
- icon-blight-ash cc99783e52c78ca4568058e2af5020b167db3715b8b91ba4f76a76f8ae55cd1f 通過
- icon-leviathan-tooth 4dfcaaad926098f3b86b9ef40f14aaa8771528421c7dcfd8e4efaf16922493e5 通過
- icon-blank-mirror c2773e3dea9a950a8f16e663e6eda34dd85def91e8a5918f98608ed3bb7c63b8 通過
- icon-dragon-gold de9dd041972e231f7d392bfddf8355536b120092d27bd097599538917d153443 通過
- icon-parade-lantern 09b1441ca636d15ab0e6267f99dfb3486c11fcd33a82d47810f6bb2a962fc4ef 通過
- icon-colossus-bolt 60382c3139feafbf825396ca8a2dc11fd83bec9141e3704abb0a5596f85acb54 通過
- icon-titan-hide 228df295651661d6ee6cc64055542371a4dfa67599d9c8866e4173cd5f7b2570 通過
- icon-ashen-acorn a52210b65f0aa9de2ff412cd4fd7e0de544a97b320d6592a1fc56d748b553ec2 通過
- icon-vault-coin e50131f99b851dcc2d7284b742625f9e92b02320a3c50a6fe4227054bb70c387 通過
- icon-gate-splinter 4aaa27284ccb6ec2a56aeca0b8cc5eb3815aa758033e82fac3ee24410c0c20df 通過
- gear-hydra-fang-large 13d7256fc7fa84b828972ef513d8d4052d42cf394348a459b5df291cff008690 通過
- gear-hydra-fang 459ab6e9978f8cf868d13386a7126628fc2a700eb47e0317894412e121b177ad 通過
- gear-greenward-cloak-large 542c0542fb7193d7327abc2c0c90291a5a7b17a8ba480d75be14bbdfb4bf89a7 通過
- gear-greenward-cloak d6f4e29bc89a1de8282c7c2c8714850ae91fa0ba41b9917d416aabff2489a789 通過
- gear-bog-ring-large ca6389203db5003d96eb61b1ae59dc83af87e6c66866a7895d9af3e12d34059b 通過
- gear-bog-ring 002aeba45f93b1fae6279377512c5034e03d3b688d566d039d53c8185cb16cf5 通過
- gear-gilded-mail-large b8a07452cf954a8bb270f2e8624095abea5bdd76de584bba80c546c50b84fece 通過
- gear-gilded-mail 737cb958c0a37bb327436cefd1bf71b661f9d5789d338de6f1a599713c21f5ce 通過
- gear-parade-boots-large a1176a15b0cac33ec99d238bc491ab6c4957819abd0db7e1e2264e3bae4beafb 通過
- gear-parade-boots 99f374f5c5ad29610bf9cb4c50d313c985d277029ec4f98fe3cc829269f929e8 通過
- gear-colossus-gauntlet-large c068f0be80251329d518ebbd0cd041c214301d302283a3a593f9faed85dbd5db 通過
- gear-colossus-gauntlet 8870dad4cd12043c177f5878e9c71566f33d87334aab7d29e808b982066e49c6 通過
- gear-wallclimber-boots-large 43279b74b4edb481cda6440e1aa951ccc00a5f245fc160a0c477127cbe645b13 通過
- gear-wallclimber-boots ccbdf21bd9c768ea0de4daa09f8a8508619abdaaf19d3b0b1f00bee793cd3609 通過
- gear-red-horn-large bc623fc31e4b77c60583b26e34557edcd9c7eb8a77679b28279090127b081cfe 通過
- gear-red-horn 0864c99e410f4a778a2bed0bb21a26f8527baff9fb580115524130e0419803f7 通過
- gear-arrowmark-bow-large 48a221dc636c484a2302ecd0c066667904802ee7a9042a542b793e7a6bc724ad 通過
- gear-arrowmark-bow a73fa019812918fd663bead0ef6de0c132e3a07cdd2be1757fa545817d7aad7e 通過
- gear-hungry-purse-large eeb658d1f10a83c3a4c1c24fee82e75bfad9011c265673ab1b50425d4ebcb8cb 通過
- gear-hungry-purse 52c34ef36249136cbb7a5dde84a5a99930cb0fdb1f6c712f8bd4e23b07d24911 通過
- gear-gatewarden-shield-large 051125e0e100106499ee69e90b2279adfd2958e0e660acdd5ebf5795d5925f8f 通過
- gear-gatewarden-shield a554e1533c9b383acd7136e4345ec6770fc4a51c11b955d0196849f8382588b3 通過

FAIL（6 件，不列入放行清單）：

FAIL icon-leech-plate 472cfa67663d2cdba52bce35fc056030249fa6255ddd8119d5a6a865012b7169
・spec（MAT_DESC）是「a glossy dark green armour plate shaped like a leech」。成品是一個斜放、兩端尖的深綠橢圓，上面有淺色虛線斑。看不到環節、吸盤，也看不到盔甲片的邊緣或扣帶。6× 讀成葉子、醃黃瓜或一片鱗，16 px 讀成綠色葉片。
・16 px 與 14 px 和同批的 icon-hydra-scale 撞在一起（cA、lz.png）：兩件都是同一個斜放的尖橢圓，都是綠色，差別只剩深青綠和黃橄欖綠。兩件都是腐毒地區的掉落，會出現在同一個背包清單裡。依第 5 輪「差別只剩顏色、形狀語言相同」的判準，這是相撞。
・兩件裡退這件：hydra-scale 本來就該是一片鱗，和已發布的 lizard-scale、king-scale 用同一套鱗片語言，對得上它的描述；這件沒有畫出自己的物件。
・生成端的 a3 本來要修這點，但 a3 切不出 5×4，所以這格留在 a1。
・重畫方向：
  ・照 prompt 自己的修正句畫：一片橫躺的、肥胖分節的水蛭形甲片。
  ・3–4 道清楚的環節線要在 16 px 也看得到。
  ・一端有圓形吸盤口（深色圓環）。
  ・甲片外緣用一圈較亮的金屬邊表示「這是甲片」。
  ・橫放、寬明顯大於高，不要斜放的尖橢圓，也不要鱗紋。
  ・主色維持光滑深綠，高光偏冷。

FAIL icon-crab-plate 6a1e7bd9f16c608119f7bda47468dd387284f94fdb6b748954639c6370ae99d3
・生成端旗標的 crab-plate／rivet 相撞判定成立：
  ・16 px 與 14 px（rc16、rc14、s16a.png）兩件都是同大小、同明度的灰色金屬塊，中間一塊亮高光。
  ・1× 的清單列上幾乎分不出來，只差 rivet 是菱形、crab-plate 是扇形。
  ・兩件都是鋼鐵地區的掉落。
・spec「a curved riveted iron crab shell plate」裡的 curved、riveted、iron 都有，但沒有任何「蟹殼」的訊號：沒有殼緣的刺、沒有蟹殼的弧面花紋，也沒有 siege-crab 本體的鏽紅。8× 讀成一片肩甲。和已發布的 fog-gate-plate 也同屬「灰色甲片」。
・退這件、放行 rivet：rivet 的圓頂加方形底板對得上「big steel rivet with a domed head」。
・重畫方向：
  ・照 siege-crab 本體的殼：寬明顯大於高的扇形殼片。
  ・外緣一圈鏽紅（和 siege-crab 同色），殼緣有 3–4 根短刺。
  ・中間鐵灰，沿外緣一排鉚釘。
  ・16 px 要靠「鏽紅外圈加刺」和 rivet 的「灰色圓頂」分開。

FAIL icon-commander-medal 2af620223a93cc06fe0fe29b23de56a9ab5d8c3a82870dee4e1c8e7d5c823036
・生成端旗標的 commander-medal／potion 輪廓相撞判定成立（md、md16.png）：
  ・成品是一個大的素面古銅圓盤，上方接一小塊紅色短緞帶。
  ・輪廓和已發布的 potion、ether、antidote 是同一個形：圓底加頂上一小截塞子。
  ・紅色短緞帶在 16 px 剛好讀成瓶塞。1× 的清單列上看起來是「一瓶古銅色的藥水」。藥水是玩家最常點的消耗品，這個誤讀成本高。
・圓盤是素面的，沒有任何浮雕，16 px 也像已發布的 market-token（古銅圓片）。spec「worn bronze commander medal on a red ribbon」裡，勳章本身的訊號只剩顏色。
・a2 的長緞帶版因為超出圖示框，QA 不過。
・重畫方向：
  ・緞帶改成寬的燕尾或 V 形緞帶，寬度至少是圓盤的 70%，在 16 px 讀成布條，不是塞子。
  ・圓盤縮到高度約 55–60%，整體仍在 36 px 框內。
  ・也可以整件斜放，緞帶往一側垂。
  ・盤面加一個淺浮雕：星形或盾形，不可用十字或任何宗教、文字記號。
  ・外緣做出一圈磨損的凸緣。
  ・目標是 16 px 的輪廓不是「圓底＋頂上一小截」。

FAIL icon-black-veil fa87f66ab11d261721d4222a22195752611689dadb1efbf828f83540dae81937
・spec 是「a folded length of sheer black cloth」，這張 sheet 的 prompt 修正句寫「pure black and charcoal grey with pale grey edge highlights only, no purple」，整張還有「keep pink, rose and magenta out of every icon」。
・成品的亮部是一條條灰洋紅、梅紫的布紋：
  ・hues.py：475 個不透明像素裡，色相 285–330° 的有 157 個，大約 1/3。
  ・主要在 300°，例如 (18,18)=(122,85,120)、(17,17)=(121,84,116)。其次是 315° 的 (10,28)=(95,57,84)、(15,27)=(86,49,74)，飽和度 0.2–0.43，V 0.3–0.48。
  ・沒有任何一點碰到閘門（不是 key 殘留），但這正好是 key 的色相，而且違反 spec 的「black」與 prompt 的「no purple」。生成端自己也記了「a2 still has some」。
・可讀性：
  ・在清單列的實際底色 #0f0e16 上，16 px 與 14 px 幾乎消失，只剩一團帶梅紫的暗影（s16a、s14a、cD.png）。
  ・讀不出是一塊布，也讀不出「黑紗」。和 dusk-cloth（紫色疊布）同屬帶紫的布，只是更暗。
・重畫方向：
  ・照 prompt 的色彩：只用純黑與炭灰，亮部用中性淺灰（R、G、B 相差不超過 8）的硬邊高光，沿布緣與摺痕走。
  ・不要任何紫、梅紅、洋紅。
  ・可讀性：
    ・外緣與垂下的布尾要有一圈 1 px 的淺灰亮邊，讓它在 #0f0e16 上也有輪廓。
    ・「sheer」用前層蓋住後層處的一階炭灰表示。
  ・保留這版長垂墜加飄出布尾的構圖：輪廓本身像布，這點是對的。
  ・注意和 E3c 的 mourning-veil（灰色蕾絲面紗）要分開：這件是長條、單層、無孔、黑色。

FAIL gear-faceless-mask cdef77b7f77a745d25bbeabd2b543e53487a7234ec9eb2156815dd4a8dcfe752
FAIL gear-faceless-mask-large 55bd5196da7554581e809ae3d89e25b8afda5a8bc1ead8906443c42a41c01c28
・spec（UNIQUE_DESC）：「a smooth blank oval mask of dark mirror with no features」，頭部欄。
・成品是同一張圖的兩個尺寸：深藍、上圓下尖的蛋形，兩側中段各有一小段金色綁帶。
・26 px 在背包暗底上（gc1.png），輪廓和已發布的 crystal-aegis、iron-unbroken-shield，以及同批的 gatewarden-shield 是同一個鳶形盾：上寬、圓肩、下方收成尖。
・面具該有的訊號都沒有：沒有額、鼻樑、顴骨的起伏，沒有臉的曲面高光，綁帶也太短。1× 讀成「一面深色的盾」。
・64 px 大圖也只是一顆有側帶的深藍蛋。
・a1 被生成端淘汰是因為讀成有框的鏡子。a2 改成鳶盾的讀法，仍然不是「面具」。
・重畫方向：
  ・3/4 側面的面具，讓臉的曲面出現在輪廓上：額頭與鼻樑在側緣形成一個小凸起，下巴圓、不收尖。
  ・保持無五官（不要眼洞與嘴），但用一條斜過「眉、鼻樑」位置的冷白鏡面高光帶，表示這是光滑的鏡面臉。
  ・綁繩要明顯：從兩側往後拖出、在背後打結或垂下，長度至少面具寬的一半。
  ・主色維持深色鏡面，但邊緣用冷藍灰亮邊，讓它在背包暗底上有輪廓。
  ・不可和任何已發布的盾，或同批 gatewarden-shield 共用鳶盾輪廓。
  ・大小兩張一起重畫。

給控制者：
・icon-leech-plate、icon-crab-plate、icon-black-veil 在 sheet-icons-roster-6；icon-commander-medal 在 sheet-icons-roster-7；兩張 sheet 的 cap 3 都已用完（gen.log 21:33 的 PermissionError）。
・faceless-mask 在 sheet-gear-roster-6（已用到 a2）。
・要用 extend-cap 或單格重生，由控制者裁定，不在本審核範圍。
・不管哪條路，放行清單上其他件的 sha256 都不要動。
・icon-black-veil 與 E3c 的 icon-mourning-veil 都是面紗類，重畫時兩件要一起排，彼此的構圖要分開。

旗標項目與邊緣判定（都不是退回理由）：
・gear-parade-boots-large (32,37)=(101,2,94)：
  ・符合 sl_art 的 _deep_key，是兩隻靴子中間黑縫裡的一點暗化 key。同一條縫上方還有 (32,27)=(40,3,29)。
  ・QA 的 key_tint_inside 是 0：它貼著一個 11 px 的封閉透明縫，落在 2 px 外緣帶內，也在 contract 的 KEY_TINT_INSIDE_MAX（2）之內。
  ・1× 與 3× 在亮底、暗底上都看不出來（pb3、pb3d.png），14× 才看得到。小圖 gear-parade-boots 同位置沒有這點。
  ・同 R1 silent-bell 定稿 (99,3,89) 與 R3 thunder-roc (110,6,107) 的判法，可接受。
  ・若控制者要順手清掉，contract 的 repair-outliers 只動單點，但它只抓 pink_outlier，這點要另外處理。不強制。
・偏梅色的暗點：
  ・enemy-herald-engine (35,24)=(100,28,71)：色相 324°、G 28，在紅色關節的暗部，周圍是 (112,33,34)、(125,68,87) 等暗紅。
  ・enemy-siege-crab 下緣的 (134,73)=(95,45,75)、(29,74)=(83,41,66) 等 21 點：在鏽紅轉靛藍的底部陰影帶。
  ・enemy-grey-blight (173,42)=(85,42,64)：一點，在暗部。
  ・都不符合任何閘門（G > 20），3× 讀成陰影，可接受。
  ・vault-dragon 的 157 點 (90,63,95) 一類是 290° 的灰紫龍鱗，屬於 shade 的深紫，不是粉紅或洋紅。
・icon-iou-slip vs 已發布 faded-letter（iou、iou16.png）：
  ・兩件都是黃紙加一個紅色圓點。
  ・但這件是 L 形、一半立起的帳篷摺，faded-letter 是平放的信封。紅點是淡鮭紅的指印糊，不是深紅封蠟。16 px 靠輪廓分得開。
  ・邊緣判定，可接受。spec 只要求 blank，紅點是生成端加的。這件以後若被要求換，最安全的改法是拿掉紅點。
・icon-leviathan-tooth vs 已發布 thorn-fang（lt、lt16.png）：
  ・同是象牙色彎牙加綠色。
  ・但這件是粗的月牙、綠苔在根部；thorn-fang 是細的 S 形、綠藤橫纏在中段。16 px 靠粗細與綠色位置分得開。
  ・邊緣判定，可接受。
・icon-hydra-scale vs 已發布 lizard-scale：形狀語言相同（斜放的鱗片），但青藍對黃橄欖綠，兩件本來就都是「鱗」。可接受。leech-plate 的相撞見 FAIL。
・icon-rivet：本身對得上 spec。和 crab-plate 的相撞由 crab-plate 承擔。
・icon-dragon-gold vs 已發布 gilded-scrap、archon-gold：同為金色，但這件是平滑的長鱗形加一枚圓幣，gilded-scrap 是皺的碎箔，archon-gold 是冠片。可接受。
・icon-bog-peat：spec 寫「block」，成品是圓的泥炭團。生成端改圓是因為 a1 的方塊讀成遊戲草地方塊。暗褐加苔、讀成泥炭或土塊的身分清楚，和已發布 moss（亮綠為主的苔堆）靠主色分得開。可接受。
・enemy-rot-lily：
  ・枯垂的花瓣加粗扭的莖，1× 有一點像棕櫚樹。
  ・但花心有發光的黃綠花蕊冠，花瓣圍著花心下垂，3× 與 2× 讀成腐爛的花。可接受。
・enemy-hush-acolyte：spec 寫「dark violet robes」，成品是中明度的藍紫（平均亮度 0.32）。色相在 shade 的紫藍範圍、暗部夠深，帽下是一團霧、沒有臉。可接受。
・enemy-faceless-host：spec 寫「mirror shards orbiting it」，成品的鏡片是嵌在大衣與袖上，不是環繞。主要的讀法（黑大衣加空白橢圓鏡面臉）很清楚，可接受。
・enemy-shadow-parade：「long procession」畫成方形畫布上的一群，領頭的白面具高影在中間。頭目畫布是方的，群聚是合理的取捨。小影子只有兩個白點眼，不算臉。可接受。
・enemy-locked-vault vs enemy-vault-mimic：
  ・同是靛藍保險箱加大鎖，同在暗影地區。
  ・但 mimic 的讀法是張開的牙口，locked-vault 是交叉的鐵鍊加金幣溢出的邊。守關者在遊戲裡另有金色菁英描邊。可接受。
  ・spec 的「starving thin frame」沒有明顯畫出，這點和「coins bulging」本來就互相拉扯，不退。
・enemy-grey-blight vs enemy-bog-mother：
  ・同是有臉的泥丘。
  ・但 grey-blight 是灰褐加大量淡色孢子球與枯枝，bog-mother 是褐綠泥加亮綠史萊姆泡。頭目尺寸也差很多。
  ・grey-blight 的主體是灰，苔是腐毒地區的本色。可接受。
・enemy-last-commander：
  ・fill 0.55，是本批最低，但高於已發布最低的 silent-bell（0.51）。披風張開撐起寬度，2× 與舞台上都有頭目的份量。
  ・和同地區的 fallen-knight 同屬「空盔甲加紅布加灰霧」：一件是頭目大小、亮鋼加大紅披風加號角，一件是小的、凹損鋼加破紅罩袍加斷劍。故事上是同一座要塞，刻意相近，可接受。
  ・和已發布的 hollow-champion（淡紫金加背後扇形群劍）也分得開。
・enemy-siege-crab：
  ・161×75 的寬圖，在遊戲裡被寬度限制，比同場的 rivet-golem 矮小（z1.png）。
  ・但讀成「鏽紅鐵殼的攻城蟹」很清楚，§13.1 的重型只有高度帶，沒有份量規則。可接受。
・enemy-siege-titan：
  ・身體偏石像，但 6×（t1.png）看得到帶發光眼的獸首、鐵甲片上的鏽、黑色利爪抓著石牆，下半身埋在霧裡。對得上「iron-plated beast climbing out of fog, claws gripping a stone wall fragment」。
  ・和 fortress-colossus（塔樓加砲管）、rivet-golem（獨眼爐眼）分得開。可接受。
・臉：
  ・remnant 與 NO_FACE 的 6 件（hush-acolyte、debt-collector、fallen-knight、banner-bearer、last-commander、veil-stalker）放大到 5–8× 看過：帽下或兜帽下是霧、陰影或淡藍霧面，空盔甲的領口冒灰霧，沒有五官。
  ・ashen-treant 樹幹上是箭頭刻痕與樹瘤漩渦，不是臉。
  ・grey-elder 是三個中空樹洞組成的「像臉的樹瘤」，閘門清單允許。
  ・gate-breaker 是兜帽陰影裡兩點紅眼的巨影，不是故人殘影，沒有違反。
・宗教符號與文字：
  ・78 件都沒有十字、光環、主教冠或可讀文字。
  ・knight-crest 是素面紅盾，banner-bearer 的旗面沒有紋章。
  ・iou-slip 沒有字。vault-coin 只有鎖孔。
・封閉透明區：全部是真縫，erased 的取樣全是暗化 key（見方法）。
  ・banner-bearer 的 46 px 與 21 px 是旗桿與身體之間。
  ・grey-elder 的兩個 37 px 是樹根之間。
  ・mire-hydra 的 47 px 是頸與頭之間。
  ・gear-arrowmark-bow-large 的 182 px 是弓與弦之間。
  ・gear-bog-ring-large 的 89 px 與 gear-red-horn-large 的 125 px 是環內與繩圈內。
  ・icon-vault-lock 的 37 px 是鎖環內。
・審核範圍以外的觀察，沒有列入判定：
  ・已發布的 5d 素材 icon-lizard-scale 外緣有一排洋紅 key 點，例如 (7–12,35)=(132,10,134)～(144,5,155)、(10,7)=(135,11,118)、(21,29)=(114,8,143)。它不在 R4 範圍，供控制者另案處理。
  ・審核頁與 data/enemies.roster.ts 把 debt-collector 叫「敲門的影子」，spec §5.4 是「討債的影子」。這是資料命名，不是美術。
