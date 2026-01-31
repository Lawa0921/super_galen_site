---
layout: post
title: "DNS 是什麼？網際網路的超級電話簿"
date: 2025-10-14
categories: [技術, 網路]
tags: [DNS, 網路基礎, 網際網路]
description: "用幽默風趣的方式解釋 DNS 是什麼，以及為什麼沒有它你就得背一堆數字"
author: "Galen"
---

# DNS 是什麼？網際網路的超級電話簿

如果你曾經上網，可能遇過這些情況：

- 網路怪怪的，有人神秘地說：「試試看改 DNS 成 8.8.8.8」
- 打開瀏覽器輸入 `google.com` 就能連到 Google，但你從來不知道為什麼
- 看到別人在終端機輸入 `nslookup` 然後一堆數字跑出來，覺得他們很厲害

然後你心想：「**DNS 到底是什麼東西？為什麼網路出問題都要改它？**」

答案是：**DNS 就是網際網路的超級電話簿**，沒有它你就得記住一堆像 `142.250.185.46` 這樣的數字才能上網。

---

## 什麼是 DNS？人腦不是電腦

想像你要打電話給你媽。你會記「媽媽」這個名字，而不是記「0912-345-678」這串數字對吧？（好啦，你媽的號碼你可能真的記得，但如果是 100 個朋友的號碼呢？）

這就是 [DNS（Domain Name System，網域名稱系統）](https://en.wikipedia.org/wiki/Domain_Name_System)在做的事：**把人類看得懂的網址，翻譯成電腦看得懂的 IP 位址**。

**人類友善的方式**：
```
google.com → 好記！
facebook.com → 清楚！
youtube.com → 明白！
```

**電腦實際使用的方式**：
```
google.com → 142.250.185.46
facebook.com → 157.240.241.35
youtube.com → 142.250.185.78
```

DNS 在 1983 年由 [Paul Mockapetris 發明](https://www.icann.org/en/blogs/details/paul-mockapetris-speaks-about-the-history-of-dns-14-3-2023-en)，當時網際網路還很小，大家用一個叫 `HOSTS.TXT` 的檔案來記錄所有網站的 IP 位址。但網路越來越大，這個檔案變得超級難維護（想像一個有 10 億筆資料的 Excel 檔），於是 DNS 就誕生了。

---

## DNS 怎麼運作？四個關卡的尋寶遊戲

當你在瀏覽器輸入 `www.google.com` 並按下 Enter，背後其實發生了一場「尋寶遊戲」：

### 第一關：問你的電腦（DNS 快取）

電腦先檢查自己的記憶：「我之前查過 `google.com` 嗎？」

- ✅ 有記錄 → 直接用，秒連！
- ❌ 沒記錄 → 往下一關

### 第二關：問你的 ISP（遞迴 DNS 伺服器）

你的網路服務商（中華電信、台灣大哥大等）有個超大的電話簿，電腦問它：「google.com 的 IP 是多少？」

- ✅ 有記錄 → 回傳 IP，完成！
- ❌ 沒記錄 → 往下一關

### 第三關：問根伺服器（Root DNS Server）

[全球只有 13 組根伺服器](https://www.iana.org/domains/root/servers)（但實際上透過 Anycast 技術有上百台機器），它們是 DNS 系統的「總機」。

根伺服器說：「`.com` 的事情去問 `.com` 的老大！」然後給你 `.com` 伺服器的地址。

### 第四關：問頂級域名伺服器（TLD DNS Server）

`.com` 伺服器說：「google.com 的事情去問 Google 的 DNS 伺服器！」然後給你 Google DNS 的地址。

### 最終關：問權威 DNS 伺服器（Authoritative DNS Server）

Google 的 DNS 伺服器終於告訴你：「google.com 的 IP 是 `142.250.185.46`！」

### 整個流程

```
你的電腦
  ↓
ISP 的 DNS
  ↓
根伺服器 → 指向 .com 伺服器
  ↓
.com 伺服器 → 指向 Google 的 DNS
  ↓
Google 的 DNS → 回傳真正的 IP
  ↓
你的電腦連到 Google
```

聽起來很複雜？別擔心，這一切通常在 **20-50 毫秒內完成**（比你眨眼還快）。

---

## 實際操作：自己查查看 DNS

### 在 Windows

打開「命令提示字元」（搜尋 `cmd`），輸入：

```bash
nslookup google.com
```

你會看到類似這樣的結果：

```
伺服器:  dns.google
Address:  8.8.8.8

名稱:    google.com
Address:  142.250.185.46
```

### 在 Mac/Linux

打開「終端機」，輸入：

```bash
dig google.com
```

會出現更詳細的資訊，包括查詢時間、回應的 DNS 伺服器等。

**試試看查詢你常去的網站**，比如：
- `nslookup facebook.com`
- `nslookup youtube.com`
- `nslookup 你自己的網站`

你會發現，每個網站背後都是一串數字！

---

## 8.8.8.8 是什麼？為什麼大家都推薦它？

`8.8.8.8` 是 [Google 公開的 DNS 伺服器](https://developers.google.com/speed/public-dns)，2009 年推出。為什麼大家愛用它？

### 好處

✅ **速度快**：Google 在全球有很多伺服器，查詢速度超快
✅ **穩定**：幾乎不會掛掉
✅ **無過濾**：ISP 有時會封鎖特定網站，Google DNS 通常不會

### 其他選擇

| DNS 伺服器 | IP 位址 | 特色 |
|-----------|---------|------|
| [Google DNS](https://developers.google.com/speed/public-dns) | `8.8.8.8` / `8.8.4.4` | 速度快、穩定 |
| [Cloudflare DNS](https://www.cloudflare.com/dns/) | `1.1.1.1` / `1.0.0.1` | 主打隱私保護 |
| [Quad9 DNS](https://www.quad9.net/) | `9.9.9.9` | 自動封鎖惡意網站 |
| 中華電信 DNS | `168.95.1.1` | 台灣本地，有時速度更快 |

### 如何更改 DNS？

**Windows**：
1. 控制台 → 網路和網際網路 → 網路連線
2. 右鍵點擊你的網路 → 內容
3. 點擊「網際網路通訊協定第 4 版 (TCP/IPv4)」
4. 選擇「使用下列的 DNS 伺服器位址」
5. 慣用 DNS：`8.8.8.8`，其他 DNS：`8.8.4.4`

**Mac**：
1. 系統偏好設定 → 網路
2. 選擇你的網路 → 進階 → DNS
3. 按 `+` 新增：`8.8.8.8` 和 `8.8.4.4`

**為什麼要改 DNS？**
- ISP 的 DNS 有時會很慢
- ISP 可能封鎖某些網站
- 某些 DNS 有廣告過濾功能
- 網路出問題時，換個 DNS 可能就好了（玄學但有時有效）

---

## DNS 故障會怎樣？2021 年的 Facebook 大當機

還記得 2021 年 10 月 4 日嗎？[Facebook、Instagram、WhatsApp 全球大當機](https://engineering.fb.com/2021/10/05/networking-traffic/outage-details/)超過 7 小時。

問題出在哪？**Facebook 在維護時誤操作，撤回了所有 BGP 路由公告，導致全世界都找不到通往 Facebook DNS 伺服器的路徑**。

這就像電話簿公司搬家了，但沒告訴任何人新地址——全世界的電腦都找不到 Facebook 的 DNS 伺服器，自然就無法查詢 Facebook 的 IP 位址，更連不上網站。更慘的是，Facebook 的工程師連內部系統都進不去（包括用門禁卡進辦公室），因為內部系統也靠 DNS 運作！

這次事件證明：**DNS 是網際網路的基礎建設，沒有它什麼都不行**。

---

## 常見問題

### Q：DNS 會被竊聽嗎？

會！傳統 DNS 查詢是明文傳輸，ISP 或中間人可以看到你查詢了哪些網站。

解法：使用 **DNS over HTTPS（DoH）** 或 **DNS over TLS（DoT）**，將查詢加密。Cloudflare、Google DNS 都支援。

### Q：DNS 被劫持會怎樣？

駭客可以把 `google.com` 的 IP 改成釣魚網站的 IP，你以為連到 Google，其實連到假網站。

防範：使用可信任的 DNS 伺服器、啟用 HTTPS。

### Q：為什麼有時候清除 DNS 快取就能解決問題？

你的電腦會暫存 DNS 查詢結果，但如果網站的 IP 變了，你的快取還是舊的，就會連不上。

清除 DNS 快取（Windows：`ipconfig /flushdns`，Mac：`sudo dscacheutil -flushcache`）可以強制重新查詢。

---

## 結語

下次當有人神秘地說「改 DNS 試試看」時，你就知道他們在說什麼了：

- DNS 是網際網路的電話簿，把網址翻譯成 IP
- 沒有 DNS，你就得記一堆數字
- `8.8.8.8` 是 Google 的公開 DNS，速度快又穩定
- DNS 故障會讓整個網站消失（Facebook 血淚教訓）

記住：**好的 DNS 讓你上網如絲般順滑，壞的 DNS 讓你懷疑人生**。

下次網路怪怪的，不妨試試改 DNS 吧！

---

## 參考資料

- [DNS 完整介紹 - Wikipedia](https://en.wikipedia.org/wiki/Domain_Name_System)
- [DNS 發明者 Paul Mockapetris 訪談 - ICANN](https://www.icann.org/en/blogs/details/paul-mockapetris-speaks-about-the-history-of-dns-14-3-2023-en)
- [根伺服器列表 - IANA](https://www.iana.org/domains/root/servers)
- [Google 公開 DNS - Google Developers](https://developers.google.com/speed/public-dns)
- [Cloudflare DNS 介紹](https://www.cloudflare.com/dns/)
- [Facebook 2021 大當機事件報告](https://engineering.fb.com/2021/10/05/networking-traffic/outage-details/)
- [Quad9 DNS 官網](https://www.quad9.net/)

---

**實戰挑戰**：現在就打開終端機，輸入 `nslookup` 或 `dig` 查查看你最常去的網站 IP 是多少。然後試著改 DNS 成 `8.8.8.8`，看看網速有沒有變快！
