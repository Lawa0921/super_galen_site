---
layout: post
title: "LLM Prompt 工程完全指南:從新手到專家的實戰之路"
date: 2025-10-07
categories: ai
tags: [AI, LLM, Prompt Engineering, ChatGPT, Claude]
---

<div class="hero-section">
  <h2><i class="fas fa-brain"></i> 掌握 AI 對話的藝術</h2>
  <p class="hero-subtitle">一份基於 2025 年最新研究的 Prompt 工程實戰指南</p>
</div>

---

## <i class="fas fa-question-circle"></i> 什麼是 Prompt 工程?

Prompt 工程 (Prompt Engineering) 是設計和優化提示詞 (prompts) 的技術,用來引導大型語言模型 (LLM) 產生高品質、準確且符合預期的輸出。這不僅是一門技術,更是一門藝術。

在 2025 年,Prompt 工程已經從簡單的「提問技巧」演化成包含格式化技術、推理架構、角色指派,甚至對抗性測試的完整學科。

<div class="key-insight">
  <div class="insight-icon"><i class="fas fa-lightbulb"></i></div>
  <div class="insight-content">
    <h3>核心概念</h3>
    <p>好的 prompt 不是告訴 AI「要做什麼」,而是引導它「如何思考」。就像優秀的導師不會直接給答案,而是提供正確的思考框架。</p>
  </div>
</div>

---

## <i class="fas fa-compass"></i> Prompt 工程的基本原則

根據 OpenAI、Anthropic 等機構的最佳實踐指南,有效的 prompt 設計遵循以下核心原則:

### 1. 明確性 (Specificity)

模糊的指令會導致模糊的結果。

<div class="example-comparison">
  <div class="bad-example">
    <div class="example-label bad"><i class="fas fa-times-circle"></i> 糟糕的 Prompt</div>
    <div class="example-content">
      <pre><code>寫一篇文章</code></pre>
      <p class="example-note">❌ 太過籠統,AI 不知道主題、長度、風格、受眾</p>
    </div>
  </div>

  <div class="good-example">
    <div class="example-label good"><i class="fas fa-check-circle"></i> 優秀的 Prompt</div>
    <div class="example-content">
      <pre><code>撰寫一篇 800-1000 字的技術文章,主題是「React Hooks 最佳實踐」,
目標讀者是有 1-2 年經驗的前端工程師,語調專業但易懂,
包含至少 3 個實際程式碼範例,並在結尾總結 5 個關鍵要點。</code></pre>
      <p class="example-note">✅ 明確指定長度、主題、受眾、風格、格式</p>
    </div>
  </div>
</div>

### 2. 結構化 (Structure)

使用清晰的結構幫助 AI 理解不同部分的用途。

<div class="example-comparison">
  <div class="bad-example">
    <div class="example-label bad"><i class="fas fa-times-circle"></i> 糟糕的 Prompt</div>
    <div class="example-content">
      <pre><code>幫我改這段話,要更專業,但別太正式,還要檢查文法,
這是訪談記錄: [一大段文字混在一起]</code></pre>
      <p class="example-note">❌ 指令和內容混雜,AI 容易混淆</p>
    </div>
  </div>

  <div class="good-example">
    <div class="example-label good"><i class="fas fa-check-circle"></i> 優秀的 Prompt (Claude XML 風格)</div>
    <div class="example-content">
      <pre><code>&lt;instructions&gt;
編輯以下訪談記錄:
1. 移除語氣詞 (嗯、啊、那個)
2. 修正文法錯誤
3. 保持口語化但專業的語調
&lt;/instructions&gt;

&lt;transcript&gt;
[訪談內容放這裡]
&lt;/transcript&gt;

&lt;output_format&gt;
直接輸出編輯後的文字,不需要額外說明
&lt;/output_format&gt;</code></pre>
      <p class="example-note">✅ 使用 XML 標籤清楚分隔指令、輸入、輸出格式</p>
    </div>
  </div>
</div>

<div class="tech-note">
  <h4><i class="fas fa-info-circle"></i> 技術提示: XML 標籤的威力</h4>
  <p>Claude 經過特別訓練,能識別 XML 風格的標籤 (&lt;instructions&gt;、&lt;context&gt;、&lt;example&gt;)。這些標籤就像路標,幫助模型準確區分提示的不同部分,大幅降低誤解率。</p>
  <p>其他模型 (如 GPT-4) 雖然沒有針對 XML 優化,但結構化分隔 (如 Markdown、JSON) 同樣有效。</p>
</div>

### 3. 脈絡提供 (Context)

缺乏背景資訊會導致通用化的回答。

<div class="example-comparison">
  <div class="bad-example">
    <div class="example-label bad"><i class="fas fa-times-circle"></i> 糟糕的 Prompt</div>
    <div class="example-content">
      <pre><code>寫一個市場區隔的文章</code></pre>
      <p class="example-note">❌ 沒有產業、目標受眾、商業目標等背景</p>
    </div>
  </div>

  <div class="good-example">
    <div class="example-label good"><i class="fas fa-check-circle"></i> 優秀的 Prompt</div>
    <div class="example-content">
      <pre><code>&lt;context&gt;
我們是一家 B2B SaaS 新創公司,產品是專案管理工具,
主要競爭對手是 Asana 和 Monday.com。
目標客戶是 50-200 人的科技公司。
&lt;/context&gt;

&lt;task&gt;
基於以上背景,撰寫一份市場區隔分析,包含:
1. 3-5 個主要客戶族群 (persona)
2. 每個族群的痛點
3. 我們產品的差異化價值主張
4. 建議的行銷管道
&lt;/task&gt;</code></pre>
      <p class="example-note">✅ 提供產業、競爭態勢、目標客戶等關鍵脈絡</p>
    </div>
  </div>
</div>

### 4. 迭代精進 (Iteration)

Prompt 工程是反覆測試和改進的過程,不是一次就完美。

<div class="iteration-flow">
  <div class="flow-step">
    <div class="step-number">1</div>
    <div class="step-content">
      <h4>初版 Prompt</h4>
      <p>快速寫出基本需求</p>
    </div>
  </div>
  <div class="flow-arrow"><i class="fas fa-arrow-right"></i></div>
  <div class="flow-step">
    <div class="step-number">2</div>
    <div class="step-content">
      <h4>測試結果</h4>
      <p>執行並檢視輸出</p>
    </div>
  </div>
  <div class="flow-arrow"><i class="fas fa-arrow-right"></i></div>
  <div class="flow-step">
    <div class="step-number">3</div>
    <div class="step-content">
      <h4>分析問題</h4>
      <p>找出不符預期的部分</p>
    </div>
  </div>
  <div class="flow-arrow"><i class="fas fa-arrow-right"></i></div>
  <div class="flow-step">
    <div class="step-number">4</div>
    <div class="step-content">
      <h4>改進 Prompt</h4>
      <p>增加細節或調整結構</p>
    </div>
  </div>
</div>

---

## <i class="fas fa-graduation-cap"></i> 進階技術: 從好到卓越

### 技術 1: Few-Shot Prompting (少樣本學習)

透過提供範例,讓 AI 理解期望的輸出模式。

<div class="technique-demo">
  <h4>實際案例: 產品文案風格統一</h4>

  <div class="demo-content">
    <pre><code>&lt;task&gt;
根據以下範例,為新產品撰寫相同風格的文案
&lt;/task&gt;

&lt;examples&gt;
產品: 無線耳機
文案: 「音樂,隨心所欲。Pro Max 耳機,40 小時續航,
陪你從日出到星空。」

產品: 智慧手錶
文案: 「時間,由你定義。Fit 360 手錶,7 天續航,
見證每個重要時刻。」

產品: 行動電源
文案: 「能量,永不斷電。Power Go 行動電源,20000mAh,
支撐你的每一天冒險。」
&lt;/examples&gt;

&lt;new_product&gt;
產品: 藍牙喇叭
特色: 防水 IPX7、360° 環繞音效、12 小時續航
&lt;/new_product&gt;</code></pre>

    <div class="demo-output">
      <strong>AI 輸出:</strong>
      <p>「音樂,無處不在。Wave 360 喇叭,12 小時續航,在雨中也能盡情搖擺。」</p>
    </div>
  </div>
</div>

<div class="best-practice">
  <h4><i class="fas fa-star"></i> 最佳實踐</h4>
  <ul>
    <li><strong>2-5 個範例最理想:</strong> GPT-5 研究顯示,超過 5 個範例後效能提升趨緩,但成本線性增加</li>
    <li><strong>範例要多樣化:</strong> 涵蓋不同情境,避免過度擬合單一模式</li>
    <li><strong>確保範例品質:</strong> 錯誤的範例會誤導模型</li>
  </ul>
</div>

### 技術 2: Chain-of-Thought (思維鏈)

引導 AI 展示推理過程,提升複雜任務的準確度。

<div class="example-comparison">
  <div class="bad-example">
    <div class="example-label bad"><i class="fas fa-times-circle"></i> 直接提問 (準確率較低)</div>
    <div class="example-content">
      <pre><code>這組奇數相加是偶數嗎? 15, 32, 7, 18, 3</code></pre>
      <p class="example-note">AI 可能直接猜答案,容易出錯</p>
    </div>
  </div>

  <div class="good-example">
    <div class="example-label good"><i class="fas fa-check-circle"></i> 思維鏈提示</div>
    <div class="example-content">
      <pre><code>這組奇數相加是偶數嗎? 15, 32, 7, 18, 3

請這樣思考:
1. 先找出所有奇數
2. 逐步計算加總
3. 判斷結果是奇數還是偶數

&lt;thinking&gt;
[讓 AI 在這裡展示推理過程]
&lt;/thinking&gt;

&lt;answer&gt;
[最終答案]
&lt;/answer&gt;</code></pre>
    </div>
  </div>
</div>

<div class="demo-output">
  <strong>AI 輸出範例:</strong>
  <pre><code>&lt;thinking&gt;
1. 找出奇數: 15, 7, 3
2. 加總: 15 + 7 = 22, 22 + 3 = 25
3. 25 是奇數
&lt;/thinking&gt;

&lt;answer&gt;
否,這組奇數相加的結果是奇數 (25)
&lt;/answer&gt;</code></pre>
</div>

<div class="tech-note">
  <h4><i class="fas fa-flask"></i> 研究發現</h4>
  <p>Google Research 在 2022 年的論文證實,思維鏈提示在數學推理、邏輯解題、常識推理等任務上,準確率提升 <strong>10-50%</strong>。</p>
  <p>關鍵在於「強迫」模型展示中間步驟,而不是直接跳到答案。</p>
</div>

### 技術 3: Role Prompting (角色扮演)

為 AI 指定特定角色,調整輸出的專業度和風格。

<div class="role-examples">
  <div class="role-card">
    <div class="role-header">
      <span class="role-icon"><i class="fas fa-user-md"></i></span>
      <h4>專家角色</h4>
    </div>
    <div class="role-content">
      <pre><code>你是資深 DevOps 工程師,擁有 10 年 Kubernetes 部署經驗。
請用專業但易懂的方式,解釋什麼是 Service Mesh,
並比較 Istio 和 Linkerd 的差異。
目標讀者是剛接觸容器化的後端工程師。</code></pre>
    </div>
  </div>

  <div class="role-card">
    <div class="role-header">
      <span class="role-icon"><i class="fas fa-graduation-cap"></i></span>
      <h4>教育角色</h4>
    </div>
    <div class="role-content">
      <pre><code>你是耐心的程式語言導師,正在教一個 12 歲的學生學 Python。
請用簡單的比喻,解釋什麼是「變數」和「迴圈」,
並提供一個有趣的練習題 (不要太難)。</code></pre>
    </div>
  </div>

  <div class="role-card">
    <div class="role-header">
      <span class="role-icon"><i class="fas fa-balance-scale"></i></span>
      <h4>批判角色</h4>
    </div>
    <div class="role-content">
      <pre><code>你是經驗豐富的程式碼審查者,以嚴格但建設性的風格著稱。
請審查以下 Python 函式,指出:
1. 潛在的 bug 或邊界情況
2. 效能問題
3. 可讀性改善建議
4. 最佳實踐偏離

[程式碼]</code></pre>
    </div>
  </div>
</div>

<div class="warning-box">
  <div class="warning-icon"><i class="fas fa-exclamation-triangle"></i></div>
  <div class="warning-content">
    <h4>重要警告: 角色不等於專業知識</h4>
    <p>當你要求 AI 扮演醫生或律師,它<strong>並不會</strong>真的具備專業訓練,只是模仿該領域的語言模式。</p>
    <p><strong>永遠不要將 AI 的專業角色輸出視為真實專業建議!</strong> 僅用於草稿、學習、腦力激盪。</p>
  </div>
</div>

### 技術 4: Task Decomposition (任務分解)

將複雜任務拆解成多個簡單步驟。

<div class="example-comparison">
  <div class="bad-example">
    <div class="example-label bad"><i class="fas fa-times-circle"></i> 一次性複雜任務</div>
    <div class="example-content">
      <pre><code>幫我建立一個完整的成長行銷策略,包含 SEO、社群媒體、
內容行銷、電子郵件行銷、PPC、聯盟行銷,
重點放在 B2B 科技新創公司。</code></pre>
      <p class="example-note">❌ 太過複雜,AI 容易產生泛泛之談或遺漏重點</p>
    </div>
  </div>

  <div class="good-example">
    <div class="example-label good"><i class="fas fa-check-circle"></i> 分解成多個步驟</div>
    <div class="example-content">
      <pre><code>我們將分 4 個步驟建立成長行銷策略:

<strong>步驟 1:</strong> 客戶研究
- 定義目標客戶 (B2B 科技新創的決策者)
- 找出他們的主要痛點和資訊獲取管道

<strong>步驟 2:</strong> 管道選擇
- 基於步驟 1,從 SEO、社群、內容、郵件、PPC、聯盟中
  選出最適合的 3 個管道
- 說明為何選擇這些管道

<strong>步驟 3:</strong> 各管道策略
- 為每個選定管道制定具體執行計畫
- 包含關鍵指標 (KPI) 和資源需求

<strong>步驟 4:</strong> 整合與優先順序
- 整合各管道策略
- 建議前 90 天的執行優先順序

請先完成步驟 1,我確認後再進行下一步。</code></pre>
      <p class="example-note">✅ 逐步推進,每步都可驗證和調整</p>
    </div>
  </div>
</div>

---

## <i class="fas fa-ban"></i> 常見錯誤與反模式

### 錯誤 1: 模糊與籠統

<div class="antipattern">
  <div class="antipattern-header">
    <span class="antipattern-icon"><i class="fas fa-bug"></i></span>
    <h4>症狀</h4>
  </div>
  <p>「幫我寫點東西」、「給我一些建議」、「分析這個」</p>

  <div class="antipattern-why">
    <strong>為什麼這很糟?</strong>
    <p>AI 缺乏明確方向,只能產生通用、表面的回應。就像問餐廳服務生「給我一些食物」—— 技術上滿足要求,但肯定不是你想要的。</p>
  </div>

  <div class="antipattern-fix">
    <strong><i class="fas fa-wrench"></i> 修正方法:</strong>
    <p>加入 5W1H: 誰 (受眾)、什麼 (主題/格式)、為什麼 (目的)、何時 (時間範圍)、何地 (脈絡/平台)、如何 (風格/方法)</p>
  </div>
</div>

### 錯誤 2: 過度複雜化

<div class="antipattern">
  <div class="antipattern-header">
    <span class="antipattern-icon"><i class="fas fa-bug"></i></span>
    <h4>症狀</h4>
  </div>
  <p>一個 prompt 塞入 10+ 個要求,多層巢狀條件,混雜不相關的指令</p>

  <div class="antipattern-example">
    <pre><code>撰寫詳盡的成長行銷策略指南,包含 SEO (技術 SEO、內容 SEO、
外部連結)、社群媒體 (Facebook、Twitter、LinkedIn、Instagram,
每個平台都要有發文頻率和內容策略)、內容行銷 (部落格、影片、
Podcast、白皮書、案例研究)、郵件行銷 (歡迎序列、育成序列、
再互動序列)、PPC (Google Ads、Facebook Ads,包含預算分配
和 A/B 測試策略)、聯盟行銷 (夥伴招募和佣金結構),
針對 B2B 科技新創,特別是 SaaS 產品... (還有更多)</code></pre>
  </div>

  <div class="antipattern-why">
    <strong>為什麼這很糟?</strong>
    <p>模型會被淹沒,可能產生混亂、遺漏重點,或輸出泛泛之談。認知負荷太高。</p>
  </div>

  <div class="antipattern-fix">
    <strong><i class="fas fa-wrench"></i> 修正方法:</strong>
    <p>使用<strong>任務分解</strong> —— 拆成 5-6 個獨立 prompt,每個專注一個子任務。</p>
  </div>
</div>

### 錯誤 3: 模糊的語言

<div class="antipattern">
  <div class="antipattern-header">
    <span class="antipattern-icon"><i class="fas fa-bug"></i></span>
    <h4>症狀</h4>
  </div>
  <p>使用「有點」、「可能」、「大概」、「類似這樣」等不明確詞彙</p>

  <div class="antipattern-example">
    <pre><code>寫個大概 500-1500 字左右的文章,主題隨便你決定,
風格不要太正式但也別太隨便,用點比喻讓它有趣一些,
可能需要一些例子或這類的東西。</code></pre>
  </div>

  <div class="antipattern-why">
    <strong>為什麼這很糟?</strong>
    <p>每個模糊點都是 AI 自由發揮的空間,結果可能偏離你的預期。</p>
  </div>

  <div class="antipattern-fix">
    <strong><i class="fas fa-wrench"></i> 修正方法:</strong>
    <p>用精確的數字、明確的限制條件。「800-1000 字」比「大概 500-1500 字」好。「包含 3 個程式碼範例」比「可能需要一些例子」好。</p>
  </div>
</div>

### 錯誤 4: 指令矛盾

<div class="antipattern">
  <div class="antipattern-header">
    <span class="antipattern-icon"><i class="fas fa-bug"></i></span>
    <h4>症狀</h4>
  </div>
  <p>在 prompt 中給出互相衝突的要求</p>

  <div class="antipattern-example">
    <pre><code>寫一份詳盡的技術文件,包含所有實作細節。
<strong>但保持簡潔,不超過 200 字。</strong>

生成一份正式的商業提案。
<strong>但使用輕鬆幽默的語調。</strong></code></pre>
  </div>

  <div class="antipattern-why">
    <strong>為什麼這很糟?</strong>
    <p>AI 必須選擇優先哪個指令,結果不可預測。在推理模型 (如 GPT-5) 上,矛盾指令會<strong>大幅降低效能和增加延遲</strong>。</p>
  </div>

  <div class="antipattern-fix">
    <strong><i class="fas fa-wrench"></i> 修正方法:</strong>
    <p>使用 <strong>OpenAI Prompt Optimizer</strong> 等工具檢測矛盾。或手動審查,確保所有指令可以同時滿足。</p>
  </div>
</div>

### 錯誤 5: 超越 AI 能力

<div class="antipattern">
  <div class="antipattern-header">
    <span class="antipattern-icon"><i class="fas fa-bug"></i></span>
    <h4>症狀</h4>
  </div>
  <p>要求 AI 做它無法做到的事</p>

  <div class="antipattern-example">
    <pre><code>預測 2025 年最賺錢的成長行銷管道

告訴我明天股市會漲還是跌

檢索我公司內部資料庫的客戶資料 (AI 沒有存取權)</code></pre>
  </div>

  <div class="antipattern-why">
    <strong>為什麼這很糟?</strong>
    <ul>
      <li><strong>即時資料:</strong> LLM 的知識有截止日期 (如 Claude 是 2025 年 1 月),無法存取即時資訊</li>
      <li><strong>主觀預測:</strong> AI 基於模式,不具備真實預測能力</li>
      <li><strong>私有資料:</strong> 沒有明確提供的資料,AI 無法存取</li>
    </ul>
  </div>

  <div class="antipattern-fix">
    <strong><i class="fas fa-wrench"></i> 修正方法:</strong>
    <ul>
      <li>需要即時資料? 使用有網路搜尋功能的 AI (如 Perplexity、Bing Chat)</li>
      <li>需要內部資料? 使用 RAG (Retrieval-Augmented Generation) 架構</li>
      <li>需要預測? 改問「基於歷史趨勢,哪些因素可能影響...」</li>
    </ul>
  </div>
</div>

### 錯誤 6: 不迭代、不驗證

<div class="antipattern">
  <div class="antipattern-header">
    <span class="antipattern-icon"><i class="fas fa-bug"></i></span>
    <h4>症狀</h4>
  </div>
  <p>寫了一個 prompt,得到結果,直接使用,從不檢查或改進</p>

  <div class="antipattern-why">
    <strong>為什麼這很糟?</strong>
    <p>AI 會產生幻覺 (hallucination) —— 編造不存在的事實、引用、統計數據。盲目信任會導致錯誤傳播。</p>
  </div>

  <div class="antipattern-fix">
    <strong><i class="fas fa-wrench"></i> 修正方法:</strong>
    <ul>
      <li><strong>永遠驗證事實性陳述</strong>,特別是統計數據、日期、人名、研究引用</li>
      <li><strong>迭代改進</strong>: 第一版通常不會完美,根據輸出調整 prompt</li>
      <li><strong>A/B 測試</strong>: 對關鍵 prompt,測試不同版本,比較結果</li>
    </ul>
  </div>
</div>

---

## <i class="fas fa-book"></i> CO-STAR 框架: 結構化你的 Prompt

CO-STAR 是一個實用的記憶工具,幫助你確保 prompt 涵蓋所有關鍵元素:

<div class="framework-grid">
  <div class="framework-card">
    <div class="framework-letter">C</div>
    <div class="framework-content">
      <h4>Context (脈絡)</h4>
      <p>提供背景資訊,讓 AI 理解情境</p>
      <div class="framework-example">
        <em>範例:</em> 「我們是教育科技新創,目標客戶是國中老師」
      </div>
    </div>
  </div>

  <div class="framework-card">
    <div class="framework-letter">O</div>
    <div class="framework-content">
      <h4>Objective (目標)</h4>
      <p>明確說明你想達成什麼</p>
      <div class="framework-example">
        <em>範例:</em> 「設計一個 30 天的社群媒體內容行事曆」
      </div>
    </div>
  </div>

  <div class="framework-card">
    <div class="framework-letter">S</div>
    <div class="framework-content">
      <h4>Style (風格)</h4>
      <p>指定輸出的寫作風格</p>
      <div class="framework-example">
        <em>範例:</em> 「使用 Seth Godin 式的簡潔有力風格」
      </div>
    </div>
  </div>

  <div class="framework-card">
    <div class="framework-letter">T</div>
    <div class="framework-content">
      <h4>Tone (語調)</h4>
      <p>設定情感基調</p>
      <div class="framework-example">
        <em>範例:</em> 「專業但平易近人,避免行話」
      </div>
    </div>
  </div>

  <div class="framework-card">
    <div class="framework-letter">A</div>
    <div class="framework-content">
      <h4>Audience (受眾)</h4>
      <p>明確指出目標讀者</p>
      <div class="framework-example">
        <em>範例:</em> 「針對非技術背景的產品經理」
      </div>
    </div>
  </div>

  <div class="framework-card">
    <div class="framework-letter">R</div>
    <div class="framework-content">
      <h4>Response (回應格式)</h4>
      <p>定義輸出的結構和格式</p>
      <div class="framework-example">
        <em>範例:</em> 「Markdown 表格,包含日期、平台、內容主題、CTA」
      </div>
    </div>
  </div>
</div>

### CO-STAR 實戰範例

<div class="costar-demo">
  <pre><code><strong>[C] Context:</strong>
我經營一個專注於 React 和 Next.js 的技術部落格,
目前月流量約 10,000 次訪問,主要來自 Google 搜尋。

<strong>[O] Objective:</strong>
規劃未來 30 天的內容策略,目標是提升自然搜尋流量 30%,
並增加電子報訂閱者 (目前 500 人)。

<strong>[S] Style:</strong>
使用資料導向的策略風格,參考 Backlinko 或 Ahrefs 部落格的方法論。

<strong>[T] Tone:</strong>
專業、自信,但不過度推銷。重視實用性和可執行性。

<strong>[A] Audience:</strong>
這份策略是給我自己 (部落格作者) 參考,我有中階 SEO 知識。

<strong>[R] Response:</strong>
請以 Markdown 格式輸出,包含:
1. 執行摘要 (3-5 個重點)
2. 內容主題建議 (至少 8 篇文章,附關鍵字和搜尋量估計)
3. 推廣策略 (針對每篇文章)
4. 關鍵指標追蹤建議
5. 每週行動清單

總長度 1500-2000 字。</code></pre>
</div>

---

## <i class="fas fa-tools"></i> 實用工具與資源

### 自動化 Prompt 優化工具

<div class="tools-grid">
  <div class="tool-card">
    <div class="tool-header">
      <span class="tool-icon"><i class="fas fa-robot"></i></span>
      <h4>OpenAI Prompt Optimizer</h4>
    </div>
    <p>GPT-5 內建工具,自動偵測矛盾、模糊指令、格式問題</p>
    <a href="https://platform.openai.com/chat/edit?optimize=true" class="tool-link" target="_blank">
      前往工具 <i class="fas fa-external-link-alt"></i>
    </a>
  </div>

  <div class="tool-card">
    <div class="tool-header">
      <span class="tool-icon"><i class="fas fa-book-open"></i></span>
      <h4>Anthropic Interactive Tutorial</h4>
    </div>
    <p>Claude 官方的 9 章節互動式 prompt 工程教學</p>
    <a href="https://github.com/anthropics/prompt-eng-interactive-tutorial" class="tool-link" target="_blank">
      前往教學 <i class="fas fa-external-link-alt"></i>
    </a>
  </div>

  <div class="tool-card">
    <div class="tool-header">
      <span class="tool-icon"><i class="fas fa-compass"></i></span>
      <h4>Prompt Engineering Guide</h4>
    </div>
    <p>開源的 prompt 工程完整指南,涵蓋所有主流技術</p>
    <a href="https://www.promptingguide.ai/" class="tool-link" target="_blank">
      前往指南 <i class="fas fa-external-link-alt"></i>
    </a>
  </div>

  <div class="tool-card">
    <div class="tool-header">
      <span class="tool-icon"><i class="fas fa-code"></i></span>
      <h4>LangChain Prompt Optimizer</h4>
    </div>
    <p>程式化優化 prompt,支援自動測試和版本管理</p>
    <a href="https://blog.langchain.com/exploring-prompt-optimization/" class="tool-link" target="_blank">
      前往文件 <i class="fas fa-external-link-alt"></i>
    </a>
  </div>
</div>

### 學習資源

<div class="resources-list">
  <div class="resource-item">
    <span class="resource-icon"><i class="fas fa-graduation-cap"></i></span>
    <div class="resource-content">
      <strong>OpenAI Cookbook</strong>
      <p>官方範例集,涵蓋 GPT-4/GPT-5 的實際應用案例</p>
      <a href="https://cookbook.openai.com/" target="_blank">cookbook.openai.com</a>
    </div>
  </div>

  <div class="resource-item">
    <span class="resource-icon"><i class="fas fa-book"></i></span>
    <div class="resource-content">
      <strong>Claude Docs - Prompt Engineering</strong>
      <p>Anthropic 官方文件,特別強調 XML 標籤和思維鏈技術</p>
      <a href="https://docs.claude.com/en/docs/build-with-claude/prompt-engineering/overview" target="_blank">docs.claude.com</a>
    </div>
  </div>

  <div class="resource-item">
    <span class="resource-icon"><i class="fas fa-lightbulb"></i></span>
    <div class="resource-content">
      <strong>Learn Prompting</strong>
      <p>免費的互動式課程,從零基礎到進階技術</p>
      <a href="https://learnprompting.org/" target="_blank">learnprompting.org</a>
    </div>
  </div>
</div>

---

## <i class="fas fa-chart-line"></i> 模型差異與選擇

不同 LLM 對 prompt 的反應不同,沒有萬用公式。以下是 2025 年主流模型的特性:

<div class="model-comparison">
  <div class="model-card">
    <div class="model-name">Claude (Anthropic)</div>
    <div class="model-strengths">
      <strong><i class="fas fa-star"></i> 強項:</strong>
      <ul>
        <li>XML 標籤結構化 prompt</li>
        <li>長文本處理 (200K token 上下文)</li>
        <li>遵循複雜多步驟指令</li>
      </ul>
    </div>
    <div class="model-tips">
      <strong><i class="fas fa-lightbulb"></i> 提示技巧:</strong>
      <p>大量使用 &lt;instructions&gt;、&lt;context&gt;、&lt;examples&gt; 標籤</p>
    </div>
  </div>

  <div class="model-card">
    <div class="model-name">GPT-4o / GPT-5 (OpenAI)</div>
    <div class="model-strengths">
      <strong><i class="fas fa-star"></i> 強項:</strong>
      <ul>
        <li>Few-shot learning 效率高</li>
        <li>創意寫作和腦力激盪</li>
        <li>程式碼生成和除錯</li>
      </ul>
    </div>
    <div class="model-tips">
      <strong><i class="fas fa-lightbulb"></i> 提示技巧:</strong>
      <p>使用 System Message 設定角色,User Message 給具體任務</p>
    </div>
  </div>

  <div class="model-card">
    <div class="model-name">Gemini 2.5 (Google)</div>
    <div class="model-strengths">
      <strong><i class="fas fa-star"></i> 強項:</strong>
      <ul>
        <li>多模態理解 (文字+圖片+影片)</li>
        <li>搜尋整合,即時資訊存取</li>
        <li>多語言處理</li>
      </ul>
    </div>
    <div class="model-tips">
      <strong><i class="fas fa-lightbulb"></i> 提示技巧:</strong>
      <p>需要即時資料或視覺分析時優先考慮</p>
    </div>
  </div>
</div>

<div class="best-practice">
  <h4><i class="fas fa-flask"></i> 實驗建議</h4>
  <p>對於關鍵應用,<strong>在多個模型上測試相同 prompt</strong>,比較結果。有時同一個 prompt 在 Claude 表現優異,在 GPT-4 卻普通,反之亦然。</p>
</div>

---

## <i class="fas fa-route"></i> 實戰檢查清單

在提交 prompt 前,用這份清單快速檢查:

<div class="checklist">
  <div class="checklist-item">
    <input type="checkbox" id="check1">
    <label for="check1">
      <strong>明確性:</strong> 是否包含主題、長度、格式、風格?
    </label>
  </div>

  <div class="checklist-item">
    <input type="checkbox" id="check2">
    <label for="check2">
      <strong>脈絡:</strong> 是否提供足夠背景資訊 (受眾、目的、場景)?
    </label>
  </div>

  <div class="checklist-item">
    <input type="checkbox" id="check3">
    <label for="check3">
      <strong>結構:</strong> 是否使用標籤/分隔符清楚區分不同部分?
    </label>
  </div>

  <div class="checklist-item">
    <input type="checkbox" id="check4">
    <label for="check4">
      <strong>範例:</strong> 複雜任務是否提供 2-5 個 few-shot 範例?
    </label>
  </div>

  <div class="checklist-item">
    <input type="checkbox" id="check5">
    <label for="check5">
      <strong>推理:</strong> 需要邏輯推導的任務是否要求「逐步思考」?
    </label>
  </div>

  <div class="checklist-item">
    <input type="checkbox" id="check6">
    <label for="check6">
      <strong>輸出格式:</strong> 是否明確定義回應格式 (Markdown/JSON/表格)?
    </label>
  </div>

  <div class="checklist-item">
    <input type="checkbox" id="check7">
    <label for="check7">
      <strong>矛盾檢查:</strong> 是否存在互相衝突的指令?
    </label>
  </div>

  <div class="checklist-item">
    <input type="checkbox" id="check8">
    <label for="check8">
      <strong>能力匹配:</strong> 是否要求 AI 做它無法做到的事 (即時資料/主觀判斷)?
    </label>
  </div>

  <div class="checklist-item">
    <input type="checkbox" id="check9">
    <label for="check9">
      <strong>迭代計畫:</strong> 是否準備好根據初次結果調整 prompt?
    </label>
  </div>
</div>

---

## <i class="fas fa-lightbulb"></i> 最後的建議

Prompt 工程是一個<strong>實踐導向的技能</strong>,沒有捷徑,只有不斷嘗試。以下是我的核心建議:

<div class="final-tips">
  <div class="tip-card">
    <div class="tip-number">1</div>
    <div class="tip-content">
      <h4>從簡單開始,逐步增加細節</h4>
      <p>不要一開始就寫超級複雜的 prompt。先寫基本版本,看結果,再逐步加入約束條件。</p>
    </div>
  </div>

  <div class="tip-card">
    <div class="tip-number">2</div>
    <div class="tip-content">
      <h4>建立你的 Prompt 範本庫</h4>
      <p>當你找到有效的 prompt 模式,保存下來。久而久之你會累積一個強大的工具箱。</p>
    </div>
  </div>

  <div class="tip-card">
    <div class="tip-number">3</div>
    <div class="tip-content">
      <h4>永遠驗證事實</h4>
      <p>AI 會產生幻覺。任何事實性陳述 (統計、引用、日期) 都必須獨立驗證。</p>
    </div>
  </div>

  <div class="tip-card">
    <div class="tip-number">4</div>
    <div class="tip-content">
      <h4>不同任務用不同模型</h4>
      <p>Claude 擅長長文本分析,GPT-4 擅長創意,Gemini 擅長即時資訊。根據任務選擇工具。</p>
    </div>
  </div>

  <div class="tip-card">
    <div class="tip-number">5</div>
    <div class="tip-content">
      <h4>把 AI 當協作夥伴,不是魔法</h4>
      <p>最好的結果來自人類專業知識 + AI 效率。你負責判斷和策略,AI 負責執行和擴展。</p>
    </div>
  </div>
</div>

---

## <i class="fas fa-rocket"></i> 下一步

現在你已經掌握了 prompt 工程的核心概念和技術。接下來:

<div class="next-steps">
  <div class="next-step-item">
    <span class="step-icon"><i class="fas fa-play"></i></span>
    <div class="step-content">
      <h4>立即實踐</h4>
      <p>選一個你常做的任務 (寫郵件、寫文章、程式碼審查),用今天學到的技術優化你的 prompt</p>
    </div>
  </div>

  <div class="next-step-item">
    <span class="step-icon"><i class="fas fa-flask"></i></span>
    <div class="step-content">
      <h4>實驗比較</h4>
      <p>同一個任務,寫 3 個不同版本的 prompt,記錄哪個效果最好,為什麼</p>
    </div>
  </div>

  <div class="next-step-item">
    <span class="step-icon"><i class="fas fa-book-reader"></i></span>
    <div class="step-content">
      <h4>深入學習</h4>
      <p>完成 Anthropic Interactive Tutorial,特別是 Chain of Thought 和 XML 標籤章節</p>
    </div>
  </div>

  <div class="next-step-item">
    <span class="step-icon"><i class="fas fa-users"></i></span>
    <div class="step-content">
      <h4>分享與學習</h4>
      <p>加入 prompt 工程社群 (Reddit r/PromptEngineering、Discord 群組),觀摩高手技巧</p>
    </div>
  </div>
</div>

---

## <i class="fas fa-book-bookmark"></i> 參考資料

本文基於以下權威來源的研究與最佳實踐:

<div class="references-section">

<div class="ref-category">
<h3>官方文件與指南</h3>

<div class="ref-item">
<div class="ref-number">1</div>
<div class="ref-content">
<strong>Anthropic - Prompt Engineering Overview</strong>
<a href="https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/overview" target="_blank">https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/overview</a>
<p>Claude 官方 prompt 工程指南,特別是 XML 標籤技術</p>
</div>
</div>

<div class="ref-item">
<div class="ref-number">2</div>
<div class="ref-content">
<strong>OpenAI - Best Practices for Prompt Engineering</strong>
<a href="https://help.openai.com/en/articles/6654000-best-practices-for-prompt-engineering-with-the-openai-api" target="_blank">https://help.openai.com/en/articles/6654000</a>
<p>GPT 系列模型的官方最佳實踐</p>
</div>
</div>

<div class="ref-item">
<div class="ref-number">3</div>
<div class="ref-content">
<strong>OpenAI Cookbook - GPT-5 Prompt Optimization</strong>
<a href="https://cookbook.openai.com/examples/gpt-5/prompt-optimization-cookbook" target="_blank">https://cookbook.openai.com/examples/gpt-5/prompt-optimization-cookbook</a>
<p>GPT-5 Prompt Optimizer 工具與使用指南</p>
</div>
</div>

<div class="ref-item">
<div class="ref-number">4</div>
<div class="ref-content">
<strong>Microsoft Azure - Prompt Engineering Techniques</strong>
<a href="https://learn.microsoft.com/en-us/azure/ai-foundry/openai/concepts/prompt-engineering" target="_blank">https://learn.microsoft.com/en-us/azure/ai-foundry/openai/concepts/prompt-engineering</a>
<p>Azure OpenAI 的 prompt 工程技術文件</p>
</div>
</div>

</div>

<div class="ref-category">
<h3>研究資源</h3>

<div class="ref-item">
<div class="ref-number">5</div>
<div class="ref-content">
<strong>Prompt Engineering Guide</strong>
<a href="https://www.promptingguide.ai/" target="_blank">https://www.promptingguide.ai/</a>
<p>開源的全面 prompt 工程指南,涵蓋 Few-Shot、Chain-of-Thought 等技術</p>
</div>
</div>

<div class="ref-item">
<div class="ref-number">6</div>
<div class="ref-content">
<strong>Lakera - The Ultimate Guide to Prompt Engineering in 2025</strong>
<a href="https://www.lakera.ai/blog/prompt-engineering-guide" target="_blank">https://www.lakera.ai/blog/prompt-engineering-guide</a>
<p>2025 年 prompt 工程最新趨勢與最佳實踐</p>
</div>
</div>

<div class="ref-item">
<div class="ref-number">7</div>
<div class="ref-content">
<strong>Palantir - Best Practices for LLM Prompt Engineering</strong>
<a href="https://www.palantir.com/docs/foundry/aip/best-practices-prompt-engineering" target="_blank">https://www.palantir.com/docs/foundry/aip/best-practices-prompt-engineering</a>
<p>企業級 LLM 應用的 prompt 工程指南</p>
</div>
</div>

</div>

<div class="ref-category">
<h3>技術教學</h3>

<div class="ref-item">
<div class="ref-number">8</div>
<div class="ref-content">
<strong>Learn Prompting - Chain-of-Thought & Few-Shot</strong>
<a href="https://learnprompting.org/" target="_blank">https://learnprompting.org/</a>
<p>互動式 prompt 工程課程,涵蓋進階技術</p>
</div>
</div>

<div class="ref-item">
<div class="ref-number">9</div>
<div class="ref-content">
<strong>AWS Machine Learning Blog - Prompt Engineering with Claude 3</strong>
<a href="https://aws.amazon.com/blogs/machine-learning/prompt-engineering-techniques-and-best-practices-learn-by-doing-with-anthropics-claude-3-on-amazon-bedrock/" target="_blank">AWS Blog</a>
<p>AWS 官方的 Claude 3 prompt 工程實戰教學</p>
</div>
</div>

<div class="ref-item">
<div class="ref-number">10</div>
<div class="ref-content">
<strong>Anthropic Interactive Tutorial</strong>
<a href="https://github.com/anthropics/prompt-eng-interactive-tutorial" target="_blank">https://github.com/anthropics/prompt-eng-interactive-tutorial</a>
<p>Anthropic 官方的 9 章節互動式教學</p>
</div>
</div>

</div>

<div class="ref-category">
<h3>常見錯誤與反模式</h3>

<div class="ref-item">
<div class="ref-number">11</div>
<div class="ref-content">
<strong>Common Mistakes in Prompt Engineering</strong>
<a href="https://www.mxmoritz.com/article/common-mistakes-in-prompt-engineering" target="_blank">https://www.mxmoritz.com/article/common-mistakes-in-prompt-engineering</a>
<p>常見 prompt 工程錯誤與修正方法</p>
</div>
</div>

<div class="ref-item">
<div class="ref-number">12</div>
<div class="ref-content">
<strong>PromptJesus - 7 Prompt Engineering Mistakes</strong>
<a href="https://www.promptjesus.com/blog/7-prompt-engineering-mistakes-beginners-must-avoid" target="_blank">https://www.promptjesus.com/blog</a>
<p>新手常犯的 7 大錯誤</p>
</div>
</div>

</div>

<div class="ref-category">
<h3>CO-STAR 框架</h3>

<div class="ref-item">
<div class="ref-number">13</div>
<div class="ref-content">
<strong>Dextralabs - Prompt Engineering for LLM</strong>
<a href="https://dextralabs.com/blog/prompt-engineering-for-llm/" target="_blank">https://dextralabs.com/blog/prompt-engineering-for-llm/</a>
<p>CO-STAR 框架詳細介紹</p>
</div>
</div>

</div>

<div class="ref-category">
<h3>學術研究</h3>

<div class="ref-item">
<div class="ref-number">14</div>
<div class="ref-content">
<strong>Wei et al. (2022) - Chain-of-Thought Prompting</strong>
<p>Google Research 關於思維鏈提示的原始論文,論文顯示 CoT 在推理任務上準確率提升 10-50%</p>
</div>
</div>

</div>

</div>

<div class="references-note">
  <p><i class="fas fa-info-circle"></i> <strong>資料檢索日期:</strong> 2025 年 10 月</p>
  <p>Prompt 工程領域快速演化,建議定期查閱官方文件以獲取最新資訊。</p>
</div>

---

<div class="article-footer">
  <p>這份指南基於 2025 年 OpenAI、Anthropic、Google 等機構的最新研究與最佳實踐。Prompt 工程仍在快速演化,持續學習是關鍵。</p>
  <p><strong>你最常用的 prompt 技巧是什麼?</strong> 歡迎在評論區分享!</p>
</div>

<style>
/* Hero Section */
.hero-section {
  text-align: center;
  padding: 3rem 2rem;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(168, 85, 247, 0.1));
  border-radius: 1rem;
  margin-bottom: 2rem;
}

[data-theme="light"] .hero-section {
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(168, 85, 247, 0.15));
}

.hero-section h2 {
  font-size: 2rem;
  margin-bottom: 1rem;
  color: #ffd700;
}

[data-theme="light"] .hero-section h2 {
  color: #1e40af;
}

.hero-subtitle {
  font-size: 1.1rem;
  color: #94a3b8;
}

[data-theme="light"] .hero-subtitle {
  color: #475569;
}

/* Key Insight Box */
.key-insight {
  display: flex;
  gap: 1.5rem;
  padding: 1.5rem;
  background: rgba(99, 102, 241, 0.1);
  border-left: 4px solid #6366f1;
  border-radius: 0.5rem;
  margin: 2rem 0;
}

[data-theme="light"] .key-insight {
  background: rgba(99, 102, 241, 0.15);
}

.insight-icon {
  font-size: 2.5rem;
  color: #fbbf24;
  flex-shrink: 0;
}

.insight-content h3 {
  color: #ffd700;
  margin-bottom: 0.5rem;
}

[data-theme="light"] .insight-content h3 {
  color: #1e40af;
}

[data-theme="light"] .insight-content p {
  color: #334155;
}

/* Example Comparison */
.example-comparison {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.5rem;
  margin: 2rem 0;
}

@media (min-width: 768px) {
  .example-comparison {
    grid-template-columns: 1fr 1fr;
  }
}

.bad-example,
.good-example {
  border-radius: 0.5rem;
  overflow: hidden;
}

.example-label {
  padding: 0.75rem 1rem;
  font-weight: bold;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.example-label.bad {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
}

.example-label.good {
  background: rgba(34, 197, 94, 0.2);
  color: #22c55e;
}

.example-content {
  padding: 1rem;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

[data-theme="light"] .example-content {
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid rgba(0, 0, 0, 0.1);
}

.example-content pre {
  margin: 0;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.example-content code {
  background: none;
  padding: 0;
  font-size: 0.9rem;
  color: #e2e8f0;
}

[data-theme="light"] .example-content code {
  color: #1e293b;
}

.example-note {
  margin-top: 1rem;
  font-size: 0.9rem;
  font-style: italic;
  color: #94a3b8;
}

[data-theme="light"] .example-note {
  color: #64748b;
}

/* Tech Note */
.tech-note {
  background: rgba(59, 130, 246, 0.1);
  border-left: 4px solid #3b82f6;
  padding: 1.5rem;
  border-radius: 0.5rem;
  margin: 2rem 0;
}

[data-theme="light"] .tech-note {
  background: rgba(59, 130, 246, 0.15);
}

.tech-note h4 {
  color: #60a5fa;
  margin-bottom: 0.75rem;
}

[data-theme="light"] .tech-note h4 {
  color: #2563eb;
}

[data-theme="light"] .tech-note p {
  color: #334155;
}

/* Iteration Flow */
.iteration-flow {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  margin: 2rem 0;
  padding: 2rem 1rem;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 1rem;
}

[data-theme="light"] .iteration-flow {
  background: rgba(255, 255, 255, 0.5);
}

.flow-step {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.5rem;
  background: rgba(99, 102, 241, 0.2);
  border-radius: 0.5rem;
  border: 2px solid #6366f1;
  min-width: 150px;
}

.step-number {
  width: 2.5rem;
  height: 2.5rem;
  background: #6366f1;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  color: white;
  flex-shrink: 0;
}

.step-content h4 {
  margin: 0 0 0.25rem 0;
  color: #ffd700;
  font-size: 0.95rem;
}

[data-theme="light"] .step-content h4 {
  color: #1e40af;
}

.step-content p {
  margin: 0;
  font-size: 0.85rem;
  color: #cbd5e1;
}

[data-theme="light"] .step-content p {
  color: #475569;
}

.flow-arrow {
  font-size: 1.5rem;
  color: #6366f1;
}

/* Technique Demo */
.technique-demo {
  background: rgba(0, 0, 0, 0.3);
  border-radius: 0.5rem;
  padding: 1.5rem;
  margin: 2rem 0;
}

[data-theme="light"] .technique-demo {
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid rgba(0, 0, 0, 0.1);
}

.technique-demo h4 {
  color: #a78bfa;
  margin-bottom: 1rem;
}

[data-theme="light"] .technique-demo h4 {
  color: #7c3aed;
}

.demo-content pre {
  background: rgba(0, 0, 0, 0.5);
  padding: 1rem;
  border-radius: 0.5rem;
  overflow-x: auto;
}

[data-theme="light"] .demo-content pre {
  background: rgba(0, 0, 0, 0.05);
}

.demo-output {
  margin-top: 1rem;
  padding: 1rem;
  background: rgba(34, 197, 94, 0.1);
  border-left: 4px solid #22c55e;
  border-radius: 0.5rem;
}

.demo-output strong {
  color: #22c55e;
}

[data-theme="light"] .demo-output strong {
  color: #16a34a;
}

[data-theme="light"] .demo-output p {
  color: #334155;
}

/* Best Practice */
.best-practice {
  background: rgba(34, 197, 94, 0.1);
  border: 2px solid #22c55e;
  border-radius: 0.5rem;
  padding: 1.5rem;
  margin: 2rem 0;
}

[data-theme="light"] .best-practice {
  background: rgba(34, 197, 94, 0.15);
}

.best-practice h4 {
  color: #22c55e;
  margin-bottom: 1rem;
}

[data-theme="light"] .best-practice h4 {
  color: #16a34a;
}

.best-practice ul {
  list-style: none;
  padding: 0;
}

.best-practice li {
  padding: 0.5rem 0;
  padding-left: 1.5rem;
  position: relative;
}

[data-theme="light"] .best-practice li {
  color: #334155;
}

.best-practice li::before {
  content: '✓';
  position: absolute;
  left: 0;
  color: #22c55e;
  font-weight: bold;
}

/* Role Examples */
.role-examples {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.5rem;
  margin: 2rem 0;
}

@media (min-width: 768px) {
  .role-examples {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1024px) {
  .role-examples {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.role-card {
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 215, 0, 0.3);
  border-radius: 0.5rem;
  padding: 1.5rem;
  transition: all 0.3s ease;
  min-width: 0;
}

[data-theme="light"] .role-card {
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid rgba(99, 102, 241, 0.3);
}

.role-card:hover {
  transform: translateY(-5px);
  border-color: #ffd700;
  box-shadow: 0 10px 30px rgba(255, 215, 0, 0.2);
}

.role-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.role-icon {
  font-size: 1.5rem;
  color: #a78bfa;
}

.role-header h4 {
  color: #ffd700;
  margin: 0;
}

[data-theme="light"] .role-header h4 {
  color: #1e40af;
}

.role-content pre {
  margin: 0;
  background: rgba(0, 0, 0, 0.5);
  padding: 1rem;
  border-radius: 0.5rem;
  font-size: 0.85rem;
  white-space: pre-wrap;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

[data-theme="light"] .role-content pre {
  background: rgba(0, 0, 0, 0.05);
}

/* Warning Box */
.warning-box {
  display: flex;
  gap: 1rem;
  background: rgba(239, 68, 68, 0.1);
  border: 2px solid #ef4444;
  border-radius: 0.5rem;
  padding: 1.5rem;
  margin: 2rem 0;
}

[data-theme="light"] .warning-box {
  background: rgba(239, 68, 68, 0.15);
}

.warning-icon {
  font-size: 2rem;
  color: #ef4444;
  flex-shrink: 0;
}

.warning-content h4 {
  color: #ef4444;
  margin-bottom: 0.5rem;
}

[data-theme="light"] .warning-content p {
  color: #334155;
}

/* Antipattern */
.antipattern {
  background: rgba(239, 68, 68, 0.05);
  border-left: 4px solid #ef4444;
  border-radius: 0.5rem;
  padding: 1.5rem;
  margin: 2rem 0;
}

[data-theme="light"] .antipattern {
  background: rgba(239, 68, 68, 0.1);
}

.antipattern-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.antipattern-icon {
  font-size: 1.5rem;
  color: #ef4444;
}

.antipattern-header h4 {
  color: #ef4444;
  margin: 0;
}

.antipattern p {
  margin: 0.5rem 0;
}

[data-theme="light"] .antipattern p {
  color: #334155;
}

.antipattern-example {
  background: rgba(0, 0, 0, 0.5);
  padding: 1rem;
  border-radius: 0.5rem;
  margin: 1rem 0;
}

[data-theme="light"] .antipattern-example {
  background: rgba(0, 0, 0, 0.05);
}

.antipattern-why {
  margin: 1rem 0;
}

.antipattern-why strong {
  color: #fbbf24;
  display: block;
  margin-bottom: 0.5rem;
}

[data-theme="light"] .antipattern-why strong {
  color: #d97706;
}

.antipattern-fix {
  background: rgba(34, 197, 94, 0.1);
  padding: 1rem;
  border-radius: 0.5rem;
  margin-top: 1rem;
}

.antipattern-fix strong {
  color: #22c55e;
  display: block;
  margin-bottom: 0.5rem;
}

[data-theme="light"] .antipattern-fix strong {
  color: #16a34a;
}

.antipattern ul {
  margin: 0.5rem 0 0 1.5rem;
}

/* Framework Grid */
.framework-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.5rem;
  margin: 2rem 0;
}

@media (min-width: 768px) {
  .framework-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (min-width: 1024px) {
  .framework-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

.framework-card {
  background: rgba(0, 0, 0, 0.3);
  border: 2px solid rgba(139, 92, 246, 0.5);
  border-radius: 0.5rem;
  padding: 1.5rem;
  transition: all 0.3s ease;
}

[data-theme="light"] .framework-card {
  background: rgba(255, 255, 255, 0.8);
  border: 2px solid rgba(139, 92, 246, 0.4);
}

.framework-card:hover {
  transform: translateY(-5px);
  border-color: #a78bfa;
  box-shadow: 0 10px 30px rgba(139, 92, 246, 0.3);
}

.framework-letter {
  width: 3rem;
  height: 3rem;
  background: linear-gradient(135deg, #8b5cf6, #a78bfa);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  font-weight: bold;
  color: white;
  margin-bottom: 1rem;
}

.framework-content h4 {
  color: #a78bfa;
  margin-bottom: 0.5rem;
}

[data-theme="light"] .framework-content h4 {
  color: #7c3aed;
}

.framework-content p {
  color: #cbd5e1;
  font-size: 0.95rem;
  margin-bottom: 1rem;
}

[data-theme="light"] .framework-content p {
  color: #475569;
}

.framework-example {
  background: rgba(139, 92, 246, 0.1);
  padding: 0.75rem;
  border-radius: 0.5rem;
  font-size: 0.85rem;
}

.framework-example em {
  color: #a78bfa;
  font-style: normal;
  font-weight: bold;
}

[data-theme="light"] .framework-example {
  background: rgba(139, 92, 246, 0.15);
  color: #334155;
}

/* CO-STAR Demo */
.costar-demo {
  background: rgba(0, 0, 0, 0.4);
  border: 2px solid #a78bfa;
  border-radius: 0.5rem;
  padding: 1.5rem;
  margin: 2rem 0;
}

[data-theme="light"] .costar-demo {
  background: rgba(255, 255, 255, 0.9);
  border: 2px solid #7c3aed;
}

.costar-demo pre {
  margin: 0;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.costar-demo strong {
  color: #a78bfa;
}

[data-theme="light"] .costar-demo strong {
  color: #7c3aed;
}

/* Tools Grid */
.tools-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.5rem;
  margin: 2rem 0;
}

@media (min-width: 768px) {
  .tools-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

.tool-card {
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: 0.5rem;
  padding: 1.5rem;
  transition: all 0.3s ease;
}

[data-theme="light"] .tool-card {
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid rgba(59, 130, 246, 0.3);
}

.tool-card:hover {
  transform: translateY(-5px);
  border-color: #3b82f6;
  box-shadow: 0 10px 30px rgba(59, 130, 246, 0.3);
}

.tool-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.tool-icon {
  font-size: 1.5rem;
  color: #60a5fa;
}

.tool-header h4 {
  color: #60a5fa;
  margin: 0;
}

[data-theme="light"] .tool-header h4 {
  color: #2563eb;
}

.tool-card p {
  color: #cbd5e1;
  margin-bottom: 1rem;
}

[data-theme="light"] .tool-card p {
  color: #475569;
}

.tool-link {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  color: #3b82f6;
  text-decoration: none;
  font-weight: 600;
  transition: color 0.3s ease;
}

.tool-link:hover {
  color: #60a5fa;
}

/* Resources List */
.resources-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin: 2rem 0;
}

.resource-item {
  display: flex;
  gap: 1rem;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 215, 0, 0.2);
  border-radius: 0.5rem;
  padding: 1rem;
  transition: all 0.3s ease;
}

[data-theme="light"] .resource-item {
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid rgba(99, 102, 241, 0.3);
}

.resource-item:hover {
  border-color: #ffd700;
  transform: translateX(10px);
}

.resource-icon {
  font-size: 1.5rem;
  color: #fbbf24;
  flex-shrink: 0;
}

.resource-content strong {
  color: #ffd700;
  display: block;
  margin-bottom: 0.25rem;
}

[data-theme="light"] .resource-content strong {
  color: #1e40af;
}

.resource-content p {
  color: #cbd5e1;
  margin: 0.25rem 0;
  font-size: 0.9rem;
}

[data-theme="light"] .resource-content p {
  color: #475569;
}

.resource-content a {
  color: #60a5fa;
  text-decoration: none;
  font-size: 0.85rem;
}

.resource-content a:hover {
  text-decoration: underline;
}

/* Model Comparison */
.model-comparison {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.5rem;
  margin: 2rem 0;
}

@media (min-width: 768px) {
  .model-comparison {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (min-width: 1024px) {
  .model-comparison {
    grid-template-columns: repeat(3, 1fr);
  }
}

.model-card {
  background: rgba(0, 0, 0, 0.3);
  border: 2px solid rgba(255, 215, 0, 0.3);
  border-radius: 0.5rem;
  padding: 1.5rem;
}

[data-theme="light"] .model-card {
  background: rgba(255, 255, 255, 0.8);
  border: 2px solid rgba(99, 102, 241, 0.3);
}

.model-name {
  font-size: 1.2rem;
  font-weight: bold;
  color: #ffd700;
  margin-bottom: 1rem;
  padding-bottom: 0.75rem;
  border-bottom: 2px solid rgba(255, 215, 0, 0.3);
}

[data-theme="light"] .model-name {
  color: #1e40af;
  border-bottom: 2px solid rgba(99, 102, 241, 0.3);
}

.model-strengths,
.model-tips {
  margin-bottom: 1rem;
}

.model-strengths strong,
.model-tips strong {
  color: #22c55e;
  display: block;
  margin-bottom: 0.5rem;
}

[data-theme="light"] .model-strengths strong,
[data-theme="light"] .model-tips strong {
  color: #16a34a;
}

.model-card ul {
  list-style: none;
  padding-left: 1rem;
}

.model-card li {
  padding: 0.25rem 0;
  position: relative;
}

[data-theme="light"] .model-card li {
  color: #334155;
}

.model-card li::before {
  content: '▸';
  position: absolute;
  left: -1rem;
  color: #60a5fa;
}

.model-tips p {
  color: #cbd5e1;
  font-style: italic;
  font-size: 0.9rem;
}

[data-theme="light"] .model-tips p {
  color: #475569;
}

/* Checklist */
.checklist {
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 215, 0, 0.2);
  border-radius: 0.5rem;
  padding: 1.5rem;
  margin: 2rem 0;
}

[data-theme="light"] .checklist {
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid rgba(99, 102, 241, 0.3);
}

.checklist-item {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  padding: 0.75rem 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

[data-theme="light"] .checklist-item {
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
}

.checklist-item:last-child {
  border-bottom: none;
}

.checklist-item input[type="checkbox"] {
  margin-top: 0.25rem;
  width: 1.25rem;
  height: 1.25rem;
  flex-shrink: 0;
}

.checklist-item label {
  cursor: pointer;
  color: #cbd5e1;
}

[data-theme="light"] .checklist-item label {
  color: #334155;
}

.checklist-item label strong {
  color: #ffd700;
}

[data-theme="light"] .checklist-item label strong {
  color: #1e40af;
}

/* Final Tips */
.final-tips {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.5rem;
  margin: 2rem 0;
}

.tip-card {
  display: flex;
  gap: 1.5rem;
  background: rgba(0, 0, 0, 0.3);
  border-left: 4px solid #a78bfa;
  border-radius: 0.5rem;
  padding: 1.5rem;
  transition: all 0.3s ease;
}

[data-theme="light"] .tip-card {
  background: rgba(255, 255, 255, 0.8);
  border-left: 4px solid #7c3aed;
}

.tip-card:hover {
  transform: translateX(10px);
  box-shadow: 0 10px 30px rgba(139, 92, 246, 0.2);
}

.tip-number {
  width: 3rem;
  height: 3rem;
  background: linear-gradient(135deg, #8b5cf6, #a78bfa);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  font-weight: bold;
  color: white;
  flex-shrink: 0;
}

.tip-content h4 {
  color: #a78bfa;
  margin-bottom: 0.5rem;
}

[data-theme="light"] .tip-content h4 {
  color: #7c3aed;
}

.tip-content p {
  color: #cbd5e1;
  margin: 0;
}

[data-theme="light"] .tip-content p {
  color: #475569;
}

/* Next Steps */
.next-steps {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
  margin: 2rem 0;
}

@media (min-width: 768px) {
  .next-steps {
    grid-template-columns: repeat(2, 1fr);
  }
}

.next-step-item {
  display: flex;
  gap: 1rem;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(34, 197, 94, 0.3);
  border-radius: 0.5rem;
  padding: 1rem;
  transition: all 0.3s ease;
}

[data-theme="light"] .next-step-item {
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid rgba(34, 197, 94, 0.3);
}

.next-step-item:hover {
  border-color: #22c55e;
  transform: translateY(-5px);
  box-shadow: 0 10px 30px rgba(34, 197, 94, 0.2);
}

.step-icon {
  font-size: 1.5rem;
  color: #22c55e;
  flex-shrink: 0;
}

.step-content h4 {
  color: #22c55e;
  margin-bottom: 0.25rem;
  font-size: 1rem;
}

[data-theme="light"] .step-content h4 {
  color: #16a34a;
}

.step-content p {
  color: #cbd5e1;
  margin: 0;
  font-size: 0.9rem;
}

[data-theme="light"] .step-content p {
  color: #475569;
}

/* References Section */
.references-section {
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 215, 0, 0.2);
  border-radius: 0.5rem;
  padding: 2rem;
  margin: 2rem 0;
}

[data-theme="light"] .references-section {
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid rgba(99, 102, 241, 0.3);
}

.ref-category {
  margin: 2rem 0;
}

.ref-category:first-child {
  margin-top: 0;
}

.ref-category h3 {
  color: #fbbf24;
  margin-bottom: 1.5rem;
  padding-bottom: 0.5rem;
  border-bottom: 2px solid rgba(255, 215, 0, 0.3);
  font-size: 1.2rem;
}

[data-theme="light"] .ref-category h3 {
  color: #1e40af;
  border-bottom: 2px solid rgba(99, 102, 241, 0.3);
}

.ref-item {
  display: flex;
  gap: 1rem;
  padding: 1rem 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

[data-theme="light"] .ref-item {
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}

.ref-item:last-child {
  border-bottom: none;
}

.ref-number {
  width: 2rem;
  height: 2rem;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.9rem;
  font-weight: bold;
  color: white;
  flex-shrink: 0;
}

.ref-content {
  flex: 1;
}

.ref-content strong {
  color: #60a5fa;
  display: block;
  margin-bottom: 0.5rem;
  font-size: 1rem;
}

[data-theme="light"] .ref-content strong {
  color: #2563eb;
}

.ref-content a {
  color: #94a3b8;
  text-decoration: none;
  word-break: break-word;
  font-size: 0.85rem;
  display: block;
  margin-bottom: 0.5rem;
}

.ref-content a:hover {
  color: #60a5fa;
  text-decoration: underline;
}

[data-theme="light"] .ref-content a {
  color: #64748b;
}

[data-theme="light"] .ref-content a:hover {
  color: #2563eb;
}

.ref-content p {
  color: #cbd5e1;
  font-size: 0.9rem;
  margin: 0;
  line-height: 1.5;
}

[data-theme="light"] .ref-content p {
  color: #475569;
}

.references-note {
  background: rgba(59, 130, 246, 0.1);
  border-left: 4px solid #3b82f6;
  padding: 1rem 1.5rem;
  border-radius: 0.5rem;
  margin: 2rem 0;
}

[data-theme="light"] .references-note {
  background: rgba(59, 130, 246, 0.15);
}

.references-note p {
  margin: 0.5rem 0;
  color: #cbd5e1;
}

[data-theme="light"] .references-note p {
  color: #334155;
}

.references-note strong {
  color: #60a5fa;
}

[data-theme="light"] .references-note strong {
  color: #2563eb;
}

/* Article Footer */
.article-footer {
  text-align: center;
  padding: 2rem;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 0.5rem;
  margin-top: 3rem;
  border-top: 2px solid rgba(255, 215, 0, 0.3);
}

[data-theme="light"] .article-footer {
  background: rgba(255, 255, 255, 0.5);
  border-top: 2px solid rgba(99, 102, 241, 0.3);
}

.article-footer p {
  color: #cbd5e1;
  margin: 0.5rem 0;
}

[data-theme="light"] .article-footer p {
  color: #475569;
}

.article-footer strong {
  color: #ffd700;
}

[data-theme="light"] .article-footer strong {
  color: #1e40af;
}
</style>
