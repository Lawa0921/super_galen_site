# R3 獨立視覺審核紀錄（怪物名冊 r3）第 1 輪

審核者：全新脈絡的獨立審核代理（Claude Opus 5.5，未參與生成），2026-10-28。
commit：611997acf（feat/starlantern-roster-e3，worktree C:\Users\bag57\.codex\worktrees\faces\super_galen_site）。
方法：
・清單 79 件的 sha256 全部自行重算，與 r3-assets.txt 一致，沒有不符。
・自寫像素腳本（rv/mech.py）逐件掃描：半透明 0、碰邊 0、亮洋紅（G ≤ 20、飽和度 ≥ 0.8、max(R,B) ≥ 120、色相 295–315°）0；裂縫暗洋紅只有 enemy-thunder-roc (91,110)=(110,6,107) 一點，在深藍黑的羽毛陰影裡，3× 看不出來（同 R1 silent-bell 定稿 (99,3,89) 的判法）。另以較寬的粉紫篩選（rv/pink.py、rv/violet.py）逐點看：冰系與藍系圖外緣的暗紫描邊點（色相 270–280°，key 混入深藍描邊）都在外框上、1× 與 3× 融入描邊；唯一看得見的是 enemy-mirage-lead 的 (35,33)=(192,42,145)，見 FAIL。
・封閉透明洞：用 tools/sl_art.py 自己的 cutout／to_art_pixels 把原圖照同一個 block 取樣（rv/erased.py，只讀），列出每個被算成 erased 的像素在原圖的取樣值。ember-tyrant 的 8 點（上限 8）、mirage-lead 7、thunder-roc 6、starfire-colossus 5、其餘 1–2 點，取樣值全是 G ≤ 40、R 與 B 160–248 的暗化 key（例如 (212,15,194)、(196,4,170)），是縫裡的背景，不是被擦掉的美術；ember-tyrant 的大洞（89 px、67 px）標色看是手臂與身體、權杖與身體之間的真縫，權杖上的 8 px 是權杖環的中空。
・風格與尺寸：自組放大圖（灰底 4–16×）與遊戲大小對照（bg f1／f2／f3 上 1×、2×），並排 R0／R1／R2 已發布的 root-hound、paper-moth、tin-soldier、sleepwalker、false-moon、bell-warden、fog-warden、lanterneater。份量（不透明像素／外框面積）：頭目 ember-tyrant 0.71、sandstorm-maw 0.78、mirage-city 0.64、rime-sovereign 0.69、white-silence 0.71、rift-maw 0.58、thunder-roc 0.73、storm-conductor 0.72、starfire-colossus 0.74；守關者 mirage-lead 0.69、ice-shrine 0.85、burning-page 0.80；部件 rime-pillar 0.71；全部 ≥ 0.55（fog-warden 0.63、lanterneater 0.60）。
・對照 spec §5.4–5.6、§13.3 與 tools/roster_art.py 的 DESC／MAT_DESC／gear 描述、§13.5 的 R3 清單；不得有臉的物種依 data/enemies.roster.ts 的 remnant（R3 有 mirage-dancer、frozen-pilgrim、mirage-lead）與 NO_FACE_IDS（ash-mourner），以及 roster_art.py 的閘門「不得畫出的東西」清單。
・圖示與專屬獨特：4–9× 格子、縮到 16 px 的清單列，與已發布的 market-token、old-coin、storm-stone、gilded-scrap、archon-gold、star-tear、potion、ether、larva-glow、dusk-cloth 等並排比對。

放行清單（每行一件）：
- enemy-cinder-imp d15c9b1e3191701e1488e621f090ddaf467b0991d82cb28271ef0f237a19ac2b 通過
- enemy-forge-hound b668c5962a362c83932e9fa5581c957bea3361d6805352affd84ca0d37a80e13 通過
- enemy-ash-mourner cdbc6257885117bdbbf96603e7f454f8cb6322674bd69c8e2d0d886aa54a83fd 通過
- enemy-mirage-dancer fa8d0f8ca6ff81898b2302cb8524d65f358ac09e4ae719f924756a6c1f7743dc 通過
- enemy-sand-scorpion 5df0c01355bee203503c5d12d911fd9777a2931fca4a0f91ee9a5a37464b634a 通過
- enemy-frost-doll 5c5a8fcc0bd117ae9e10722dfcd1fc8aa8854d46e4f265a984ffbbfe580436d1 通過
- enemy-glacier-tortoise 75b1a6fb383b7ea39cb9d1ea59e5d25c64bae41c3e55cd5183fdb69d217c8b86 通過
- enemy-snow-caller 942cd17a522eb59248ab61bf8b0c82b5f7fa8cdb80619511d8829b4f69c18aa3 通過
- enemy-ice-komainu d797a6b3cf74a7110f9edc241e5924d51e5557994b0a2a9960031548b853be88 通過
- enemy-frozen-pilgrim 2eef173b5fb8ff4b4bc0136ff4ba612ac59bcf467d4798b8e502681c9735e99d 通過
- enemy-storm-totem 124d2cc2038b8c8188542e96bf7223f5dd79005ed50e97f81708eee7de7e59b5 通過
- enemy-charge-jelly 49b707a571904ebe2423b1089a1f1b0b5eee5d03d8183be661e2178758c3c8c9 通過
- enemy-star-ember 694bf0be918fee52c573ab762ead25be08aa9f58220385be7a8bbab6a4549472 通過
- enemy-stolen-tome 18ce5440bdefdc50a083bea7abc7a62da35beb4092f671a16db26ac5e3014129 通過
- enemy-ember-tyrant dcc560f9d8ee6f41fba9949d6720fc2798dc601110e28b4516c365fef0521dc4 通過
- enemy-sandstorm-maw b8c9e5f8668590044dc03ac11d1bf2ff482f0ca52b9c72ff18eb2daa940e99ca 通過
- enemy-mirage-city 7a101eb0888b3ae0715b02bbadca6286cdebb18e08eabcc98c61d9f32f82157e 通過
- enemy-rime-sovereign 7bd511b7506f654a77f1f40a7363fbc1edf396fe6a111f36c17bce1efc404590 通過
- enemy-white-silence 7596b50dcc526e083e8d54fbc2e8d461e637e5189b8d30fb936668007b279d03 通過
- enemy-rift-maw 42598c603ab186b69e90ec0ba7a0ede09214e64c73ff26a46d7509ba1e02ce32 通過
- enemy-thunder-roc 9ca80523705ce901f718683261a72d1382ad1c8a89cfea42cdb638e2f9ae7213 通過
- enemy-storm-conductor fd4cecc6a5e5563a5c46dc02591ddab58d327f293d38d9d26236c3f1dbc59682 通過
- enemy-starfire-colossus a92c393ac613d919f731176a54aef6c95633e047ca9c8c2d1f65d07198dc87f9 通過
- enemy-ice-shrine af4bf23a7b675610cb88e505d1b4d02f34da1a2ed94ec142793c986b7adec69f 通過
- enemy-burning-page b012e798fbce5fae14a3db12011e67df3087963702b9b0af515649faa53bf71c 通過
- enemy-rime-pillar f628bd83e6492f74782d4321311a397617ae6454f4bb1fe83d7a7077f24f8f52 通過
- icon-cinder-dust fcc406801ce9ed07b8f4ef0581f62bc446fd56d06f8db1f692824ab9cb802fce 通過
- icon-forge-slag 53475ee77511579ee086a5b3b8bf2b6d18bc234f587d1d727b0a8fdbb854f5e9 通過
- icon-scorpion-stinger e9ea61f6107f296a6619a3bb8f47f88abaacc7c0254629d74c4de4c1434e5bbf 通過
- icon-porcelain-chip 43d41c525ff1f5331171d0fffa40590b7e53eb96bef4b46dc419833fe26bbb8d 通過
- icon-glacier-scute c66285e718805703f83b8ec9d0b3fb4484df4c416955455227d4db9307b0e107 通過
- icon-snow-voice e42454d33861c3cd8b9e17c32c7108793e8e3d3c69ce0fb3f9360623c6d96cdc 通過
- icon-komainu-fang 221d3e2a76d9d4e0293cffda672a42b9b1ecef62347091725cf9f8de77befe45 通過
- icon-prayer-rope af20ec3e93768c4f692a061f8000faf0c013506dedbe78f787745091c37bef05 通過
- icon-kite-plume ac0703acf196f79f54d0359694161d902ab3d53aa21583ebb4472571e02bea4f 通過
- icon-copper-band ae4c4344eefb53e8f0aebf89a0550d12727cfd99e292155d83c6eaf8a18d2f7a 通過
- icon-jelly-cell fb3006b0f27b1e2e9eafe224928e7d8459e6e825b4522440b96a9bf2b06ee493 通過
- icon-blue-ember 47aa6e096ce526be579f0981e8cba81f2db509e4756843cecabc0a47442cf5c0 通過
- icon-torn-page 36299f6de7f5e30102cc4f3b46c08bb3f1aa021d0fd915e98e10f53d6ff8c0db 通過
- icon-tyrant-cinder cef07c4705fb134d80b4f3d0ca25026b09108c441c474a54094202f1e062eb4e 通過
- icon-storm-glass 69ddf980749bf28ce36abfdfba2659a978c3d765807db44fdf2d71a16339ff53 通過
- icon-mirage-brick c4c40bf6c43f92d7d6975668834971930b527a395be06d9384bfe8c8c949498b 通過
- icon-rime-crown-shard c4b5be350f45d23ae026eb43e08c10ecd5c92e21fea73b6dcd8a47cb74d9c2fb 通過
- icon-silence-snow 547c7f85194393fada6949b81da9325eea7c82df3c2a3e5c177bcef7ce2adcbb 通過
- icon-rift-ice f99f4e2c758fe0f987af2f39ceb61c8569f2265432296c27a02ce709ab69c98c 通過
- icon-conductor-rod 6a92ca34eaecfdb8645021273d3c559f5cfc12a4c437479f135f892bc2a62d9f 通過
- icon-starfire-core b7b012f65590b9856dbd21dbb59486e756e7a3f0b9a04e9e616657c0f7899a9a 通過
- icon-copper-anklet 491aaa3d558e7aa0dce77f5c528c276eac643db073aeae6a39de4a2c8d6a287d 通過
- icon-shrine-rope 1660a254f6aa02cf2406eeef4bce67b476e5ec4e29a602d09636679c4c68e688 通過
- gear-burning-crown-ring-large a5c8d3e36b161af5418c25987ddcd8d41757a6ede8b2681e17407ff68e3beeb4 通過
- gear-burning-crown-ring c6757fdc7ae2d3372dccf61535f8b944e19954365af2365cbf5640e2d609c290 通過
- gear-sand-veil-boots-large 4f21da8afdfbe1a05c95451b0d45e596e3d630ddd6e2113ea4c9bf32c729dfb4 通過
- gear-sand-veil-boots 39b084afa98c62aa7105e29686478bf358559b80ebd0a2b29ce38b1c3420ab56 通過
- gear-troupe-drum-large c1c8d2923f40438bc1d30c28dd7642f7f3f79b3d1268da960527d1af9bbfe412 通過
- gear-troupe-drum 5889b653130be9924ad87928f93986014246760781d5f6308b94a554adb771cf 通過
- gear-everwinter-veil-large 7d909450113bafb9c3a1dae141778389dd3c4dfa6a53a81d189b6cd0a3178360 通過
- gear-everwinter-veil a828dd53eae019d938bab1cbeda8fdb7396992151033fb3e906ac11175e9adfa 通過
- gear-snowmute-ring-large f7b569d5454a0502ee89f6f9fb52aae58fe6e13dbc14e98e7d1a8c1d83f64d5e 通過
- gear-snowmute-ring bb2affb22faf13ec631fe42e1d14dc335a0266e265382077b6d2dea46c7fd5c1 通過
- gear-sealing-spear-large aeca6f1ad9f331231f78c5a24be4d2e4b83529e47bb9acc7b4166902763f9ac3 通過
- gear-sealing-spear 3e95504285548680ad3baa38f88b68969f0f665629f99f0aff9de64dfd573224 通過
- gear-roc-feather-boots-large 772f3321a0bc43bb3a9fa800ca8943cc21e8937ec265669d240b25579ae21f6a 通過
- gear-roc-feather-boots ffc9b62d94324f566d9f74032e55bcd2eaa46783a96d54331da600c9deca2762 通過
- gear-conductor-ring-large 3cf3225c51ec9859dec733d2f241002127d56e4ab795e7343eee6c065cf0c1a9 通過
- gear-conductor-ring 08404f81d4a11c4962a22d0bd4c54439d2b75defb0d80783cd544b4164102e42 通過
- gear-starfire-tiara-large e0bcee844cf43f1e1583f8159ceb6d1b6091880df7063166ad3a02f65c56e2be 通過
- gear-starfire-tiara e3676369c5d75b8237552050e06d8b9f79763da5afcbaa666421d98d5bc5db2e 通過
- gear-last-dance-veil-large 703eb6e45982aaddbb8d19d8a644ee9462085bbd7427fc57241e6f6016b1ca9d 通過
- gear-last-dance-veil c14bf850757f030555678584c98cbc894df799473b2592cded1a5acb6a79b46b 通過
- gear-ninety-nine-steps-large c2f4b0a7ef080dbe8fa59e02ffa285a96606f5f6d2d988fc57a09d77340a4077 通過
- gear-ninety-nine-steps 9ed00691d7f197f4b3a568fe75e6adc556341c6c4834b673304b13b100f6c880 通過
- gear-starbound-tome-large 6144b8f628e53a606f9c97181b0488b0ac900b31a24e5d3f365829040a817ca5 通過
- gear-starbound-tome 7c5d13b2b6920059bf9ae00a881e6a9c46e3c1a9eebcae81886a37fdc161355c 通過

FAIL（6 件，不列入上面的清單）：
FAIL enemy-mirage-lead 3e3de037d68d59de915660f1152ae6d25f56b41b639238ebdf99d5dba0ed32fd：洋紅殘留。主體胸口左側 (35,33) 是一個亮粉洋紅像素 (192,42,145)（色相 319°、飽和度 0.78，剛好在 bright_key 與 _deep_key 的門檻外，所以機械 QA 沒擋），四周全是金橙色，3× 顯示時是一個清楚的粉點，和 R1 silent-bell a5 被退回的兩個洋紅點同一級。另外兩點一併改：整體幾乎沒有 1px 深色描邊，降採樣後是一團橙金雜訊，1× 讀成一叢火焰，比 R0–R2 的守關者糊；spec 寫的 copper anklet 完全看不到；erased 7（上限 8），回原圖看都是 key 的縫，不是退回理由，但重畫時留意。重畫 prompt：保留「無臉的熱浪舞者、兩個淡的鏡像在後方」，要求 crisp dark 1px outline around the dancer and each mirror copy、清楚的身體與手臂姿勢（一手高舉）、裙擺在腳踝處收住讓 a visible copper anklet at one ankle 看得見；兩個鏡像畫得更淡、更小，和本體分開，不要整片融成一團火；火焰色只做紗的邊緣。
FAIL enemy-thunder-kite 58fef406c6ffa053d133a353d99223815e9472b01d88b566f3116e3ad8b16a4d：物種讀錯。spec 是「a small sharp-winged kite bird」（雷鳶），成品頭上有一對耳羽簇、正面圓臉盤加一雙前視的大眼，是貓頭鷹（角鴞）的辨識特徵；翅膀短而圓、末端是碎羽，不是 sharp-winged。1× 與 2× 三隻一排看都是三隻貓頭鷹。配色（石板灰、靛、電黃）與風格都對，問題只在形體。重畫 prompt：明寫 a small sleek kite raptor (a hawk-like bird of prey), slim body, long narrow pointed wings swept back, a forked tail, a small hooked beak, NO ear tufts, NOT an owl, no round facial disc；正面或四分之三側面張翼；雷紋保留在翼上；仍是群（寬 ≤ 72）。
FAIL icon-mirage-sequin 327746eb339fc92179dc2f7127cce57990c367587a44e211de197ed62d8a20eb：讀成錢幣，而且和已發布的 market-token（市集籌碼：圓形青銅、打了一個孔）幾乎一樣。成品是一枚正中有圓孔的實心青銅圓片，16 px 清單列裡兩者都是一個銅色圓點，背包裡無法分辨；看不出「亮片」也看不出熱浪。重畫 prompt：a small thin sequin, cup-shaped and very shiny with a bright mirror highlight, a tiny stitching hole near its rim (not in the centre), a few smaller sequins scattered beside it, wavy heat-shimmer lines rising from it；不要做成厚圓幣，避開和 market-token、old-coin 同樣的正面圓餅構圖。
FAIL icon-roc-plume 8cf1032c91757c7dddd23e161660164bc9c146cc772dca29003699bb89ada0ab：形體錯，也和既有圖示撞。spec 是「a huge storm-cloud grey plume with a lightning edge」（巨鵬羽），成品是一團灰色漩渦雲加一道黃閃電，讀成雲或雷石，不是羽毛；縮到 16 px 和已發布的 storm-stone（灰塊加黃閃電）幾乎同一張。重畫 prompt：a single huge long feather (quill and vane clearly visible), storm-cloud grey vane with soft cloud-like barbs, a bright yellow lightning-shaped edge along one side；整根羽毛斜放填滿格子；要和同批 kite-plume（細長石板灰羽毛）明顯不同：更大、更寬、更蓬，可加淡藍白的電光。
FAIL icon-mourning-veil 7e541b39c6f2e6c8f8fe015157b0d33e4f053c62c570efba0803f005d34c6f03：形體不明確。spec 是「a folded grey lace mourning veil」，成品是一個灰色的實心三角堆，只在右下角有一點蕾絲網格，4× 看像灰色石塊或一堆灰，16 px 是灰三角，和同批 cinder-dust（橘色三角堆）同一個剪影只差顏色；對照已發布的 dusk-cloth，那張一看就是摺好的布。重畫 prompt：a folded length of sheer grey lace cloth, clearly fabric: soft folds, a scalloped lace border with visible open lace holes along the edge, slightly translucent layers, laid flat or draped over nothing；不要尖頂、不要堆成錐形。
FAIL icon-ash-page 1d376c278259d9d8785ceb7eebef13b94c59ba19a413a9ac9ecf4595f7f7d650：和同批 icon-torn-page 幾乎是同一張。兩者都是米黃紙片、右緣一段焦黑橙邊，torn-page 是方塊、ash-page 是三角，16 px 清單列裡都只是一小片米色紙，玩家分不出守關者戰利品（燒剩的書角）和一般素材（撕下的書頁）。重畫 prompt：the burnt corner of a book page, mostly charred: grey-black ash body with a small pale unburnt tip, its burnt edge still glowing with blue-white star fire embers (the warden burns with blue-white star fire), blank, no letters；顏色以灰黑與藍白為主，和米黃的 torn-page 一眼分開。

旗標項目與邊緣判定：
・ice-shrine 的注連繩與紙垂（含 ice-komainu 的頸繩紙垂、icon-prayer-rope、icon-shrine-rope、gear-sealing-spear 的符紙、gear-ninety-nine-steps 的石階鞋底）：判定不適用「現實宗教符號」那條。理由：那條規則的出處是 R2 第 1 輪退回 requiem-conductor 的拉丁十字與主教冠，當時的理由是「設定裡沒有這種宗教」；本作的設定裡有神社——千鶴是「巫女槍兵」（data/characters.ts:16），故事裡有山腰的神社與神主（同檔 882–919 行），而 spec 本身就指定了這些物件：§13.3 ice-shrine「a rope and paper streamers across its front」、ice-komainu「a cracked rope with paper streamers」，§5.4 的素材名就叫「結冰的注連繩」。成品沒有鳥居、沒有可讀的神號或符字、沒有特定神社紋，也沒有閘門清單禁止的「鈴」。屋頂兩端的交叉木（千木）是建築結構，不是宗教符號。若控制者認為規則應該絕對適用於任何現實宗教元素，那是 spec 與規則的衝突，必須先改 spec（上述 6 件會一起受影響），不是重畫能解決的；請回報使用者裁定，不要自行改圖。
・ice-shrine 的兩隻冰狛犬：在台階兩側，4× 看得出獅犬頭，1× 偏弱、像兩團冰；spec 有寫、確實畫了，放行。
・sheet-gear-roster-5 的靴與紗：gear-ninety-nine-steps（大小兩張）只有紅繩綁結，gear-last-dance-veil（大小兩張）只有金邊、銅鈴與綠松色紗，gear-roc-feather-boots 是菱格金邊；6× 下都沒有十字或百合花形的紋章，a2 確實拿掉了。gear-everwinter-veil 的霜紋是樹枝形，不是十字。icon-starfire-core 的籠子是兩條交叉的銅條（等臂、在圓框裡），讀成籠子或羅盤，不讀成宗教十字，放行。
・frost-doll（重，a2）：身形偏纖細（不透明 1958 px、填充 0.54），比 tin-soldier、sleepwalker 輕；但 0.55 的份量門檻只針對頭目與守關者，「重」是數值原型而不是尺寸類別的形體要求，蓬裙下擺給了足夠的底座，1× 下讀成瓷偶、和同區 snow-caller 也分得開。spec 的「cracked white face」在成品上看不到裂痕（只有白臉與兩眼），霜在手腕膝蓋有畫。臉是 spec 要求的、不在不得有臉名單，放行；若之後有餘力重畫可加臉上的裂紋。
・ember-tyrant 的 erased 8（剛好在上限）：已逐點回原圖確認是 key（見方法），放行。
・white-silence：無五官，符合「no features」；但畫成雲團狀的雪巨人，spec 的「blizzard trailing from its sleeves」沒有袖子也沒有拖曳的暴風雪。概念（一大片沒有臉的白）讀得出來，份量足，放行；邊緣判定。
・rift-maw：冰緣裂口與黑色大口都對；插在冰裡的槍在右下有畫，但槍桿和冰同色，1× 幾乎看不出來。槍是 spec 寫的元素、確實存在，放行；邊緣判定，若之後重畫應讓槍桿換成木色或銅色。
・thunder-roc 唯一的暗洋紅點見方法，放行。mirage-city 牆上的小舞者是 3–4 px 的剪影、沒有臉，穹頂尖端是素面尖頂，沒有新月或其他宗教標誌。sandstorm-maw 裡是車輪、木箱、布條，沒有人臉。burning-page、stolen-tome、starfire-colossus 的書頁都空白或只有不可讀的淡線。
・可以有臉的：star-ember、snow-caller、frost-doll、glacier-tortoise、rime-sovereign 的女王、starfire-colossus（都不是 remnant、不在 NO_FACE_IDS）。必須無臉的四隻：ash-mourner 面紗下是一片灰、mirage-dancer 頭部是火焰形、frozen-pilgrim 冰裡只有斗笠輪廓、mirage-lead 頭部是火焰，16× 下都沒有可辨認的臉。
・icon-mirage-brick：畫成亮金色磚塊加熱浪，有點像金條；形體是磚、熱浪讀得出，和 gilded-scrap、archon-gold 的剪影不同，放行；邊緣判定。icon-jelly-cell：藍色圓囊、頂端一個小突起，16 px 和 ether（藍瓶軟木塞）靠軟木塞分得開，放行。
・stolen-tome 的翅膀是米白色的羽狀，不是很像書頁，但「會飛的魔法書、封面有星」一眼讀得出，放行。

給控制者：sheet-icons-roster-5 已經用到 a3，spec §13.4 是「每個 id 最多 3 次生成」；roc-plume 與 ash-page 若要整張重畫會超過，需要你決定改用單件重生或另行裁定。sheet-icons-roster-4（mirage-sequin、mourning-veil）是 a1，enemy-thunder-kite、enemy-mirage-lead 都是 a1。
