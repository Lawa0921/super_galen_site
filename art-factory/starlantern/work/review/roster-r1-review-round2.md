# R1 獨立視覺審核紀錄（怪物名冊 r1）第 2 輪

審核者：全新脈絡的獨立審核代理（Claude Opus 5.5，未參與生成），2026-10-27，第 2 輪（第 1 輪 2026-10-26 退回 enemy-silent-bell a3 與 enemy-hollow-champion a3）。
方法：重新自行計算重建後清單 32 件成品的 sha256，全部與清單一致；第 1 輪通過的 30 件 hash 與第 1 輪完全相同。自寫像素腳本逐件檢查半透明、碰邊、近洋紅殘色、封閉透明洞（標色目視），並用新閘門規則（G ≤ 20、max(R,B) ≥ 75、飽和度 ≥ 0.8、色相 285–330°）獨立重掃全部 32 件：tin-soldier 1、bell-warden 1、glitter-scrap 1、silent-bell 2，和登錄表 key_tint_inside 一致。抽查的已通過件 QA 戳記都是新版（roster-sprite:439d4a4b14f9、roster-icon:cca9a3960b22、roster-gear:fc11a58a21f2）且通過。兩件重畫逐像素放大目視，並在三張戰鬥背景的 1× 對照表與 3× 顯示倍率上檢查；與 R0（fog-warden、lanterneater 等）比較風格、份量與 spec §13.3 描述。其餘 30 件的視覺判定沿用第 1 輪。

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
FAIL enemy-silent-bell（a5）：上方鐵鍊外緣留有 2 個近乎純洋紅的像素，(53,20) 為 (143,1,141)、(54,20) 為 (141,3,124)，就在主體外緣、緊貼背景。原生 1× 下只是一個小點；照遊戲實際放大顯示（3×）時，在第 1 層（石地）與第 2 層（藍色洞窟）背景上，灰褐鐵鍊旁是一段看得見的粉紫短線，第 3 層紫色背景上才融掉。這是 key 色殘留，不是美術。設計本身合格：龜裂青銅巨鐘、鐵鍊吊環、四個小鐘、鋸齒狀的空洞鐘口、靛藍符文，與第 1 輪認可的 a3 設計一致，符合 spec。只差這 2 個像素。
FAIL enemy-hollow-champion（a6）：概念與風格都對了。空的頸口冒出灰紫霧、六把不同的劍呈扇形、銀白盔甲配淡紫霧，和 fog-warden 同調。但以頭目來說份量不足：不透明像素 6586、填充率 0.39，fog-warden 是 14335／0.63，lanterneater 13266／0.60，啞鐘 a5 也有 11614，a6 不到其他頭目的一半，只比守關者 bell-warden（4328）多一些。在 1× 戰鬥畫面上看起來是一個細高的一般敵人：四肢細，劍細而灰，在第 1 層石牆前幾乎看不出來。和 R0 頭目並排明顯不協調，也不符合 spec 的「a huge empty suit of heroic armour」。

其他觀察（不影響判定）：
tin-soldier (42,56) 有 1 個 (126,1,153)，位在鼓身內部、周圍是同色系的紫色陰影，1× 與 3× 下都融入陰影，看不出是 key 色，維持通過。bell-warden (49,63) 的 (68,8,77) 屬於暗描邊，glitter-scrap 的 (157,14,96) 是紅珠的暗部，都維持通過。
