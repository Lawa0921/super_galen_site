# R1 獨立視覺審核紀錄（怪物名冊 r1）

審核者：全新脈絡的獨立審核代理（Claude Opus 5.5，未參與生成），2026-10-26。
方法：自行計算 32 件成品的 sha256 並與清單及 work/review/roster-r1-shown.json 比對（全部一致）；自寫像素腳本逐件檢查半透明、碰邊、近洋紅殘色、洋紅溢色色相、封閉透明洞（標色後目視確認每個洞都是真的縫或環）、亮度範圍；逐件 4–16 倍最近鄰放大目視，並在三張戰鬥背景的 1× 對照表上看實際大小；與 R0 五隻（paper-moth、root-hound、bell-watcher、false-moon、fog-warden）及 5d 舊怪（bat、wolf、slime、lanterneater 等）比對色調、描邊、細節密度與受光方向；對照 spec §13.3 與 roster_art.py 的 DESC／MAT_DESC／UNIQUE_DESC 檢查設計是否符合描述；圖示在 16/26 px 實際大小檢查可讀性、主體大小一致與易混淆性。故事怪物檢查「沒有清楚的臉」。

通過：
- enemy-lamp-wight 3290e2f2fa6d33c0ed5596715d72b4b1ec6ceceaf7f11b60a52961da3fb50848 通過
- enemy-tin-soldier 2624cd225d03afc4b3f3fe22eab2ea8d14b6bab7e3be9e3691d6428b7d3f0a61 通過
- enemy-dust-mimic 298a1359a0cd2cac97263169bed06b9b52de2a86fa7cb9f58d3bb08c3c7a1895 通過
- enemy-market-ghost beb1fe5495119ec1b538afbeeaefe1e2ace932fb53012f58131fd0190101dd30 通過
- enemy-tongueless-bell cbb6ac41dd17020f26af4c81c70d0542ea44553f3493f8877eeee244f529b01d 通過
- enemy-hollow-hunter 0066f8fa6a0884145838847665ee44e226282abe6138d29fb5879b04af1ecdc4 通過
- enemy-mist-twin 9d67246f008a81b3d6227f9fdd6cfffc4b7f34d7dcfc3010a9082a3f77122fc5 通過
- enemy-moon-crow 85f89aa7fb296e7824c417ee1bf2d2c47dd789703c8933aa06e580b4c0476eea 通過
- enemy-sleepwalker ffda40a05a401a4568ac9f61349bd427f2e45315b2942fa8e4081bcb7ca10e0c 通過
- enemy-hoarder 475972037987950d0d914d2d1653bc4a96de2fc0852e2cc0f4e2ed8bdf883128 通過
- enemy-bell-warden d4ec9df86692448a5adf70e7d590c66711731eed2fe0861ba7d1c7e9e78f1564 通過
- icon-wight-wick 163cd195d3a24b2bc7d20133a3113e98a3947bbaa6cb8639cac2efcaff13aabb 通過
- icon-tin-key b148e2927b546bf13b9c815fc616690abdd2a9643a06d6fbf897958fb9432fd4 通過
- icon-mimic-hinge 7af2551da21771273b0caa0552993c7c0810fb39f1abbd7d8e2e6203ce8cf462 通過
- icon-market-token 688c89c771b9f5a1c0ffd99e39e64e6ccc5e1ba0c5b7d0a2c80e8543f850a1de 通過
- icon-bell-shard de37bde98d0bfcc334b21b5c0c6ba04bab710b787ab83cd899f823709daa1365 通過
- icon-hollow-buckle 7b201cf190f7abf418c6e198148b2fae9ef6e7f0e4d52f5df522a8e9cf65fc8f 通過
- icon-twin-thread 5d4df7781b77cbb594fdb1a0ad398ce98fb5da1c649d73fcf228396c58be8ebc 通過
- icon-mirror-feather f9d8712ad99a7014beba2faf5f0c925e60a21c9d9fe5255b87616837c8c86b4a 通過
- icon-dream-sand a8086491a2e19ce9cbd7362702ed113784573023cde6143df500e55805f46d22 通過
- icon-glitter-scrap 161dde64080480c42260ff9cacbe622d075f580424520d04ff8cf734d62e914b 通過
- icon-silent-bronze a37bf7391e4b673faf083f30007025d77f381ee6c6aea680ecb57a71aa4d7314 通過
- icon-hundred-hilts 264901c070920e78b2eeb278974779ef8e469c30ca594d42c886974afc6bb9d4 通過
- icon-tower-dust bf22c4f51c56048933b39d0bc3f0340fe27300c5e10e216702aff3e2584f0f26 通過
- gear-silent-chime-large abf998ecc02b930396c6083a7c8809707c45ccd672083d11a67c9c7b89a04f13 通過
- gear-silent-chime eaa3d0b790a217d83cfccdbf344760247a1222e44275504aa11d7af8027f7af3 通過
- gear-borrowed-blade-large 824bfb9217a86590f3ca54cb377c9b2fc1505b3d6f83a5747fa001798d4632b4 通過
- gear-borrowed-blade 81e026c705ddc1ede24529aba2937de81bcee1b9a32f9be71b62b2533aaa7f64 通過
- gear-unrung-clapper-large 5880f8c7f5e7ee83a8acab48d798e8b063972f3e35c2357c8736bd538224e1b2 通過
- gear-unrung-clapper 7ba6105602c6f859042cfa9eccdce9cb4929d2e85373ea61d4313add2de43a10 通過

未通過（不寫通過行；本輪依規定整輪不得核准）：
FAIL enemy-silent-bell：洋紅底色殘留。鐘口左下的裂縫裡留有不透明的暗洋紅像素（約 (60–62, 140–145) 一條 1×5 的直線，值如 (115,1,102)、(96,7,80)、(119,18,85)，飽和度 0.85–1.0），另有 (119,58)、(128,64)、(132,112) 等單點在鍊環間。對照原圖 a3：那正是裂縫透出的 #FF00FF 背景被降暗後留下，不是美術。在 1× 戰鬥畫面上、金色鐘口旁是看得見的紫點。QA 的 key_tint_inside 只算到 1，閘門漏抓這類暗而飽和的洋紅。造型本身（龜裂青銅巨鐘、鐵鍊、四個小鐘、空洞鐘口）與 R0 一致、符合描述；靛藍符文取代紫色的偏差可接受。
FAIL enemy-hollow-champion：不符合概念，風格也偏離。spec 要的是「空的英雄盔甲、背上插著許多不同的劍呈扇形、臉的位置是霧」，審核頁的人工檢查項是「空殼裡只有霧」。a3 的頸口是一塊扁平的淡藍橢圓，在 1× 看起來像玻璃或鏡面鏡片，不像霧；全身沒有任何霧氣，「空殼」讀不出來。背後的劍大多是同一款長劍，「許多不同的劍」也不成立。整體是高度對稱、方塊感很重的金色魔像或機甲比例，比 R0 的頭目 fog-warden（盔甲板加上大量淡紫霧）厚重得多，和 R0 並排時顯得突兀。

其他觀察（不影響判定）：
silent-chime 專屬獨特保留紫色符文、啞鐘與 silent-bronze 改用靛藍：判定可接受。silent-chime 符合自己的描述（UNIQUE_DESC 寫 violet），和頭目的連結靠的是龜裂青銅鐘的外形，在 26 px 下色差不構成誤認。重做啞鐘時，建議三件統一成同一個能撐過去背的藍紫色。
moon-crow 頭部與鳥喙在 1× 下辨識度偏弱，但輪廓仍是展翅的鳥，雜訊程度在 R0（root-hound）範圍內，因此通過。
twin-thread 與 R0 的 grey-cord 都是「繩圈加尾端」的剪影，靠顏色（銀白對棕褐）與粗細區分，16 px 下仍分得開，因此通過。
