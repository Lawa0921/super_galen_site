# R1 獨立視覺審核紀錄（怪物名冊 r1）第 3 輪

審核者：全新脈絡的獨立審核代理（Claude Opus 5.5，未參與生成），2026-10-27，第 3 輪。第 1 輪（2026-10-26）退回 enemy-silent-bell a3 與 enemy-hollow-champion a3；第 2 輪（2026-10-27）退回 silent-bell a5（鍊上 2 個洋紅像素）與 hollow-champion a6（頭目份量不足）。
方法：重新自行計算 32 件成品的 sha256，全部與重建後的清單一致；其餘 30 件的 hash 與前兩輪通過時相同，視覺判定沿用第 1 輪。兩件新成品用自寫像素腳本重掃：半透明 0、碰邊 0、近洋紅殘色 0；並照閘門定義獨立計算 bright_key（G ≤ 20、飽和度 ≥ 0.8、max(R,B) ≥ 120、色相 295–315°），全部 32 件都是 0，與登錄表一致。封閉透明洞逐一標色，與原圖比對。兩件在三張戰鬥背景上以 1× 與 3× 目視，並和 R0 的 fog-warden 並排；量測不透明像素份量；對照 spec §13.3 描述。

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
- enemy-silent-bell 0770cbc437436f10ab5137c13471e8c85579734d5fb96d2bf727e54ec659201f 通過
- enemy-hollow-champion 4cbfc65902aa27da5dbbafb7808389e3bd1b3088e978cecb7f619b2a4855ed57 通過
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

本輪兩件重畫的判定：
enemy-silent-bell a6：通過。
　・設計：龜裂的青銅巨鐘，有靛藍符文、鋸齒狀的空洞鐘口、四個掛著的小鐘，由實心暗鐵吊環懸掛，與 a3／a5 的設計一致，符合 spec。
　・吊掛：只有兩節環，「hanging from chains」偏弱，但可以接受。
　・殘色：鍊環上已無洋紅。全圖只剩 (22,114) 一個暗紫 (99,3,89)，在裂縫深處，1× 與 3× 下都融入暗褐，看不出來。
　・透明洞：都是吊環內側與小鐘縫隙。
enemy-hollow-champion a7：通過。
　・份量：自行量測 154×153 框內不透明像素 16464、填充率 0.70，fog-warden 是 14335／0.63、lanterneater 13266／0.60，頭目份量足夠。
　・概念與風格：沒有頭的寬厚銀甲，金邊收斂；頸部與肩上冒出灰紫霧，霧並積在腳邊；破舊的紫色罩袍；背後六把不同的劍（彎刀、細劍、長劍、闊劍等）張成寬扇形。1× 下在三張背景上都清楚讀成「霧做的空殼騎士」。色調、描邊、受光方向與 fog-warden 同調，不再是 a3 的金色魔像，也不是 a6 的細瘦一般敵人。
　・臉：沒有清楚的臉，空殼裡只有霧。
　・透明洞：幾個 1–13 px 的小洞，位在披風與手臂之間、霧與劍之間，對照原圖都是真的縫（原圖是純 key），不是被擦掉的美術。3× 下不明顯。
