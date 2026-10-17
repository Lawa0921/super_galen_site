# 河谷候選接入完整本地對戰

前輪為有證據的進展：候選模型、連續河槽、過橋和獨立審查通過。這輪依原「直接開始」與完整 RTS 目標，把已檢核來源接入本地遊戲；不對外部署，不把整體美術宣告為已經使用者核准。

範圍：純 layout 分離、createMap 預設新河谷、正式 Battlefield 地面／水／霧／道路、stable stone-bridge ID 與來源 registry、選圖縮圖。主代理唯一寫入，子代理唯讀盤點與獨立 review。

驗收：先紅後綠的實際 createGame 契約、資源與樹木足夠間距、原 pass 地圖 hash 不變、自然 AI 對戰、實際採集新擴張金礦、多兵過橋、重開／換圖／動畫肖像、全套 Vitest、嚴格型別、E2E、效能與組裝畫面。原型 review 頁改用同一正式 renderer，保留凍結的舊 layout／bridge 作前後比較，移除 private-field 幾何替換。

來源與發布：沿用既有 building registry 的本地發布方式，記錄主代理及獨立 assembly review、最終實際 SHA 與 runtime 路徑；使用者整體美術驗收仍 pending。橋模型只能是已驗証 SHA `1ba65f5121f2edb62577fd3ac779ce2c0b3962bfa43a3f006c8a7edc565317b2`；保留舊來源，不覆蓋其他未提交工作。

整合發現：新擴張礦靠近原樹群，故在樹木擺放前就使用新礦位，重新保障採集區，不降低既有 landscape 安全距離斷言。完整人物／所有兵種動作／肖像與另一張圖美術仍待後續製作。
