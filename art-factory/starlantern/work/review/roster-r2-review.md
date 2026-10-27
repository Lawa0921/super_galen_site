# R2 獨立視覺審核紀錄（怪物名冊 r2）第 2 輪

審核者：全新脈絡的獨立審核代理（Claude Opus 5.5，未參與生成），2026-10-27，第 2 輪。第 1 輪（同日）退回 enemy-requiem-conductor a1（聖帶與頭飾上的十字、缺漂浮歌者）、enemy-sorrow-crystal（高飽和天藍冰晶，不是 pale lilac）、icon-larva-glow a1（畫成綁繩布袋）。
方法：
・73 件 sha256 全部重新自行計算，與重建後的 r2-assets.txt 一致；其中 70 件的 hash 與第 1 輪通過時完全相同，視覺判定沿用第 1 輪（方法見第 1 輪：自寫像素掃描、洞回原圖取樣、三張戰鬥背景 1×／3× 對照 R0／R1／5d、份量量測、對照 spec §4.2、§5、§13.3）。
・三件重畫用同一套自寫腳本重掃：半透明 0、碰邊 0、亮洋紅 0、裂縫暗洋紅 0、距 key 140 以內 0、寬鬆洋紅色相篩選 0。requiem-conductor a2 有 2 個封閉洞（共 3 px，在左側歌者與袍子之間），回原圖取樣全部是純 key 的真縫。sorrow-crystal a3 與 larva-glow a2 沒有封閉洞。
・三件在三張戰鬥背景上以 1× 與 3× 目視，灰底 6–10× 看細節，並和 bell-warden、false-moon、requiem-choir、bell-watcher 及 R2 的素材圖示並排；requiem-conductor 另看原圖聖帶的高解析局部。

通過：
- enemy-old-city-sentinel 14e0b8b73591bd27339fcda4f49926e6e4b57571cc9a462bcefca61636b027a9 通過
- enemy-requiem-choir 81c11a9afa213312cad1a6065ad3743c85f2d8a0750ae59bcceff6ecd9640c6b 通過
- enemy-lantern-larva d9f53e0a4e34428b82be416bb54e624f184139e86f866d15008f95f64fa9c94c 通過
- enemy-epitaph-golem 9864defc6185b1e37aeac6aff5e4ec4c20e5237707de3a77ceba02847e5193a6 通過
- enemy-ancestor-automaton 63a71f89dab1927d36084a5c524a72ccf3e0930817a2b266db00ff3eb657c08c 通過
- enemy-ash-archivist ee28fb50d108586a3ad09b83699977d72538826aabcc3d75dbc29dbbf241d0e0 通過
- enemy-wick-shade 802a000fc3b11d7c87d90806350b1a8fa2f124c4487c236bcd8ff798f54ad296 通過
- enemy-keeper-echo eca0df70c3f1b0134f7fcc3f2fb642a54222a250ef53b29f5b8af0a189e20614 通過
- enemy-ember-maw 730ae146f14f10a50290dda9ac0bf3dd4ecea53d72888c1f67da9ad7cdd527dd 通過
- enemy-sorrow-crystal 2ad64c5e7b175b0ddb9626e98680ce227d76b115c9adb22215fdfbf22fca1d4f 通過
- enemy-deep-tendril 2b94715bcf678938acaa0d451ba991f4489e010d21ae089a523205f15cc654fe 通過
- enemy-music-box dada9c195c333e54e26a44b49c0e7cca98a6862025336e74b79fdb7f483c9d6a 通過
- enemy-paper-cranes 8ef9ed2acdeae119855f3fbd1fd11ee093b94d57af69f02c7ae738331bea00cd 通過
- enemy-lost-shadow 827e5404c4eb0e38c5d0838a57c8a3790d71ec3f1d03be9a9f7c32b5457dd458 通過
- enemy-returning-light 305078051259b5ab3e383e775f1624c8da4dc9f673613db973368de5e899e682 通過
- enemy-gilded-hoarder 06672c8447f0fe681562df5814cde1c5af47e368b250c9863e345bbc1953374a 通過
- enemy-old-city-archon b9cf2cb74dde7e61ba382c68b2176b923c940e7893e755aa61bcb6c769064ae9 通過
- enemy-gorged-beast a4d8c77dcfd1e1670b8f5d23275fdf18c57e5bc910efc3c2e87331f91fc96dbd 通過
- enemy-lantern-mother c1d1f86fcc442dd3f7bf9b30e5c176c39c08c3119d3b4c0fafbac02aa93ab7f0 通過
- enemy-forgotten-festival e8a07a0c7b52bd3df8c932a27d01df5a6d38070b67283dbd4cb9663a64edac23 通過
- enemy-starless-whale 29a2ae41b795e62afec30d100b0c3ab93b9e0fe76da55336fd4acdabb23859c1 通過
- enemy-stopped-clock 408e414aece5c50d32fe1a6035db6e712b3c02932ef1e77068c83e971e45f79b 通過
- enemy-first-lantern 8897128538034e23ded3f878c8dfd665c04ee403a56b6ce7828b6cc9612a154b 通過
- enemy-archon-hand ecd1c0576c57a5ed7811b2f56b07078f10f5a850d2b8f2874d6f983583eda079 通過
- enemy-toppled-automaton 7812ba2da34ecf3d810ffa1fba2695c63f4e981f3f2b1fd65f77653394539dce 通過
- enemy-requiem-conductor 6881d9960108397ff59bc43b10ca6ec38585d2c88cb9810d2330adb96babda85 通過
- enemy-lantern-brood ea903ea6e8164ea8f6e1696bde795d989d15ba81a718d40e4d9f99573c248350 通過
- icon-marble-shard 32f7870d1a63dd3bc112ab19ea1f873773641c58fcc55197008ad71427cee8c3 通過
- icon-hymn-sheet cb2afade2e2f418d8bf06984116b045cc2ed8ba8a9a8c92eb5fd6653c24249a7 通過
- icon-larva-glow ac8311fea02d9e33a94f33937eb06f7d53b5a5ff86c691061d661db1485f727e 通過
- icon-epitaph-stone 67b168fd8216fe2eb112f7796dde1752b55df40569e283db4a80f8bba425d4e6 通過
- icon-old-cog 6248f9342b4cd06eea21f80141855690cdc39e1b82263be889e54e1d6f5884be 通過
- icon-ash-ink 964f823e0032b5a57a54eade4a66190e86699e738608c551972ee5783924342a 通過
- icon-spent-wick 3653104dc9681c95be7d0818f2119efd8db4aecc81be0595c61530fe3b0deb35 通過
- icon-lantern-ash 4cc953a18693676f584622819eac2b0a5e5880d54b95c5a747b372c754e75eb0 通過
- icon-ember-tooth 17d0c071beb2914bc5bdbdb6b25c880d38bf3545d1f71569d1a7007142d75a23 通過
- icon-sorrow-shard f03ccf736eb9aac3f30e65ab7e634b99841bc986b12bd9151e38fc0ea3669793 通過
- icon-pale-tendril 38128e11b5e91899aa35752c977e5c7ec6e11553e29a025e66afebf37280a6d7 通過
- icon-music-comb c2013ba2011c894c73384e590bb8c31836997a327e8f86ab055d3d0a26a20918 通過
- icon-crane-paper beaa772e63eb1b79f501cb222613a3978def3bf484fc7e833aa1d5bc99b0285d 通過
- icon-shadow-thread dd3bf1e895f170bdbd8395bdcb83719ce0b9118fcecf47d31b6c29d898a6436c 通過
- icon-homeward-glow 8caf8c8980a27695cfe23084d3e96773926bfa36adbb5e761a8ba6b7de1c12e2 通過
- icon-gilded-scrap e801288fe999f26f125cb36728dec534d8e1b99c964c2052ddcdbd2bfac6b6d3 通過
- icon-archon-gold 93635cd8ec397fa2c8bebe5413d46aa251b1be5bb5585a4c27d6cf1a3a24151e 通過
- icon-gorged-lantern 0cf6b55757c7cf0fbad0105b5b43437f5d5016db4023e9074da11a227244961c 通過
- icon-mother-light 94358a9e27a615e697d1ae87d4a22c273ba14264f4e36d3dddeb7fc791bb9dd9 通過
- icon-festival-paper edcfebc92f2dda33468d3f771c776cae045ea20f8b160db32a863dfdcd2c4c7b 通過
- icon-starless-ambergris 480b46e6c4d07d1a82b11f19762c0cb836b2bc24edbdead184631c9eaca85b6f 通過
- icon-clock-spring 0d6910e6a6765045ac688675f09212d9821550632eb566646e495b3329ae0113 通過
- icon-first-flame 86f766c3aa32f9baf9f0395a5716857fabbf9203a0f5f9873791b7ada0deb97c 通過
- icon-automaton-core 1e077acc0a112e694714f41d9e2e99dfb777c89c4a6272f8d1dfd6c9c2da7c73 通過
- icon-dusk-baton e4905828ac8330373ac10ebee3560b78c55bc1a7613e2cd27c1c38a3f6a3ac48 通過
- icon-brood-shell bd6493e2954fb6e36eecd867d5e808ac4faeac08377d9c3fd80c3a32b5c99779 通過
- gear-archon-crown-large 702a2bc26e86a1c447ec01884713759453c9e3239d9e0e1035bd0b3e2d10feff 通過
- gear-archon-crown b8f6a8a9c873d8aef307d136c37c08af9f5d4bedd66369621c5da20e802bcf45 通過
- gear-glutton-gauntlet-large c8b3de5b4294431cd908c6a7cf7c957b3ed749cb4e2fe046e75ef6a934cca3c1 通過
- gear-glutton-gauntlet 335dfc0bae077cde2c61d57a218d8a1b75448edefe13d242332410c94421a162 通過
- gear-cradled-light-large c69414756b3403f056571f6760b0a8907dbd3bbc9ce8a570f9d55bcd160723d7 通過
- gear-cradled-light 5d28339f5c13080fdf4f2facc755167b8d6fe8a8877c2bc59c21b9e3f6cce6db 通過
- gear-festival-mask-large 988b90a9f495f5ddce21e09f28bf9c7fab6979b51517abafb4223de403a1683e 通過
- gear-festival-mask 76888d76e1034bf52a0a401219cc91aad7ea0ffe7595a80d3f64b22076c69cf8 通過
- gear-whale-song-ring-large 33af2ac58bfb0cac8a7a3220c8666a7e398881ba4751d5649540e3fefac056aa 通過
- gear-whale-song-ring e70de6f0999af0af404a2ba3d3521c540f66e509591c97e126289540368f95ec 通過
- gear-still-hand-boots-large a8f79c5ae6fea9b29a03c056bf2b9712c22c9a83bcc964c93344a7ee21e49e4c 通過
- gear-still-hand-boots 8b578d93b03cb925b05ddc4d06374e0c92e147c8de74bee6f7059179afe13622 通過
- gear-first-lantern-staff-large 88f72ed2ae38a0a8427bb701ab472a368547bafc84631498276a31f5278da060 通過
- gear-first-lantern-staff eb390325f5ca1444fd5897bb72f727de272bf3067419f523139bfd961a4002ae 通過
- gear-ancestor-gauntlet-large 1fc328bcc748c29cf4a3370794f0f655e52879be3ad5c977c8a44458d445dd45 通過
- gear-ancestor-gauntlet 3b65f65e0919e08075ea7793f4bf372ecf3d8233a301644b9fa0a3ccf7f6e78c 通過
- gear-requiem-staff-large 34ad94690823920ee3b08f7f35203db2c54f2b02c09e99b04ecb1df1ccd81a0b 通過
- gear-requiem-staff 7ace67f71901705238ffe13fafe329a686f969367934d52603529ed432186b63 通過
- gear-brood-lantern-large 6db83f4db10a041ac7068bbecf51cc797c366034c460c69a7ba6bb66ae2f9c0d 通過
- gear-brood-lantern 1355d443341c53643e98502eb71cc6a59b10b91fc0ea0184b1432e831492f5e4 通過

本輪三件重畫的判定：
enemy-requiem-conductor a2：通過。
　・概念：大理石雕像質感的兜帽指揮者，左手高舉暮色藍指揮棒；胸前掛提燈墜飾，袍上掛小鐘；周圍三個漂浮的兜帽小歌者，兜帽下都是淡藍的霧，沒有臉。本體兜帽下也只有霧，符合無臉規定，也符合 spec §13.3 的描述。
　・十字：成品上沒有十字。聖帶兩片垂布在原圖上各有一個「圓環加直桿、兩道短橫」的金色抽象符文（像鑰匙或符文），縮到成品只剩 3–4 px 的淡金細線；1× 與 3× 都讀不出形狀，更不會讀成十字。頭頂沒有尖飾。
　・份量：74×99，不透明 5353 px，填充率 0.731（a1 是 0.662；bell-warden 0.673、false-moon 0.472），守關者份量足。
　・風格：色調、描邊、受光方向與 bell-warden 同調；block 11 的取樣有些顆粒，與已通過的 bell-warden 相當。
enemy-sorrow-crystal a3：通過。
　・配色：淡紫水晶，平均色 (185,163,194)、平均飽和度 0.20，回到本道中性偏亮的配色，不再像冰屬性，在 f2 背景上也和背景的水晶分得開。
　・形狀：底部圓、頂端尖的淚滴，切面清楚，周圍有 4 顆小碎片環繞，1× 下就讀得出「一滴淚形的結晶」。
　・份量：51×61，填充率 0.565，一般怪高度帶內。
　・小意見（不擋）：切面大、渲染比較平，內部發光弱；與 false-moon 這類水晶主體的畫法一致，可接受。
icon-larva-glow a2：通過。
　・概念：一顆圓潤、會發光的暖金色有機光囊，底部有兩根短短的莖或觸鬚，沒有布料，也沒有繩結，讀成「幼體的光囊」。
　・大小：29×33，與同表圖示一致。
　・16 px 下讀成「圓形發光球」，和 star-tear（帶星的金色水滴）、homeward-glow（玻璃墜裡的光珠）、mother-light（裹著灰紗的光球）、gilded-scrap（金箔碎片）的輪廓都不同，不會混淆。
