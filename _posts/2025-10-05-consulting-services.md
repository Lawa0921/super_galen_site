---
layout: post
title: "開發諮詢 & 軟體開發服務"
date: 2025-10-05
categories: services
tags: [諮詢, 開發服務, Web3, 全端開發]
---

<style>
/* 賽博龐克風格的服務卡片 */
.service-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 2rem;
    margin: 2rem 0;
}

.service-card {
    background: linear-gradient(135deg, rgba(102, 126, 234, 0.1), rgba(118, 75, 162, 0.1));
    border: 2px solid rgba(102, 126, 234, 0.3);
    border-radius: 12px;
    padding: 2rem;
    position: relative;
    overflow: hidden;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    cursor: pointer;
}

.service-card::before {
    content: '';
    position: absolute;
    top: -2px;
    left: -2px;
    right: -2px;
    bottom: -2px;
    background: linear-gradient(45deg, #667eea, #764ba2, #667eea);
    background-size: 400% 400%;
    border-radius: 12px;
    z-index: -1;
    opacity: 0;
    transition: opacity 0.3s;
}

.service-card:hover::before {
    opacity: 1;
    animation: gradientShift 3s ease infinite;
}

.service-card:hover {
    transform: translateY(-8px) scale(1.02);
    box-shadow: 0 20px 40px rgba(102, 126, 234, 0.4);
}

@keyframes gradientShift {
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
}

.service-icon {
    font-size: 3rem;
    margin-bottom: 1rem;
    display: inline-block;
    transition: transform 0.3s;
}

.service-card:hover .service-icon {
    transform: scale(1.2) rotate(5deg);
}

.service-title {
    font-size: 1.5rem;
    font-weight: bold;
    color: #667eea;
    margin-bottom: 1rem;
}

.service-description {
    color: var(--text-color-muted);
    line-height: 1.6;
    margin-bottom: 1rem;
}

.service-features {
    list-style: none;
    padding: 0;
}

.service-features li {
    padding: 0.5rem 0;
    padding-left: 1.5rem;
    position: relative;
}

.service-features li::before {
    content: '▸';
    position: absolute;
    left: 0;
    color: #667eea;
    font-weight: bold;
}

/* 技術棧展示 */
.tech-stack {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    margin: 2rem 0;
    justify-content: center;
}

.tech-badge {
    background: linear-gradient(135deg, rgba(102, 126, 234, 0.2), rgba(118, 75, 162, 0.2));
    border: 1px solid rgba(102, 126, 234, 0.4);
    border-radius: 20px;
    padding: 0.5rem 1.5rem;
    font-weight: 500;
    transition: all 0.3s;
    cursor: pointer;
    position: relative;
    overflow: hidden;
}

.tech-badge::before {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    width: 0;
    height: 0;
    background: rgba(255, 255, 255, 0.3);
    border-radius: 50%;
    transform: translate(-50%, -50%);
    transition: width 0.6s, height 0.6s;
}

.tech-badge:hover::before {
    width: 300px;
    height: 300px;
}

.tech-badge:hover {
    transform: translateY(-3px);
    box-shadow: 0 10px 20px rgba(102, 126, 234, 0.3);
    border-color: #667eea;
}

/* 關於我的區塊 */
.about-section {
    background: linear-gradient(135deg, rgba(102, 126, 234, 0.05), rgba(118, 75, 162, 0.05));
    border-left: 4px solid #667eea;
    padding: 2rem;
    margin: 3rem 0;
    border-radius: 8px;
    position: relative;
}

.about-section::before {
    content: '💡';
    position: absolute;
    top: 1rem;
    right: 1rem;
    font-size: 3rem;
    opacity: 0.2;
}

.about-title {
    font-size: 2rem;
    font-weight: bold;
    margin-bottom: 1rem;
    background: linear-gradient(45deg, #667eea, #764ba2);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
}

/* CTA 按鈕 */
.cta-container {
    text-align: center;
    margin: 3rem 0;
}

.cta-button {
    display: inline-block;
    background: linear-gradient(45deg, #667eea, #764ba2);
    color: white;
    padding: 1rem 3rem;
    border-radius: 50px;
    font-size: 1.2rem;
    font-weight: bold;
    text-decoration: none;
    transition: all 0.3s;
    box-shadow: 0 10px 30px rgba(102, 126, 234, 0.4);
    position: relative;
    overflow: hidden;
}

.cta-button::before {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    width: 0;
    height: 0;
    background: rgba(255, 255, 255, 0.3);
    border-radius: 50%;
    transform: translate(-50%, -50%);
    transition: width 0.6s, height 0.6s;
}

.cta-button:hover::before {
    width: 400px;
    height: 400px;
}

.cta-button:hover {
    transform: translateY(-5px);
    box-shadow: 0 15px 40px rgba(102, 126, 234, 0.6);
}

.cta-button:active {
    transform: translateY(-2px);
}

/* 統計數據 */
.stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 2rem;
    margin: 2rem 0;
}

.stat-item {
    text-align: center;
    padding: 1.5rem;
    background: rgba(102, 126, 234, 0.1);
    border-radius: 12px;
    transition: transform 0.3s;
}

.stat-item:hover {
    transform: scale(1.05);
}

.stat-number {
    font-size: 3rem;
    font-weight: bold;
    background: linear-gradient(45deg, #667eea, #764ba2);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    display: block;
}

.stat-label {
    color: var(--text-color-muted);
    margin-top: 0.5rem;
    font-size: 0.9rem;
}

/* 互動式技能雷達圖 */
.skills-radar {
    margin: 3rem 0;
    text-align: center;
}

.skills-radar canvas {
    max-width: 500px;
    margin: 0 auto;
}
</style>

## 你好，我是 SuperGalen 👋

一位熱愛技術、擁抱挑戰的**全端 / 區塊鏈工程師**。同時也是露營區管理員、桌遊玩家和自豪的肥宅。

<div class="about-section">
<h3 class="about-title">為什麼選擇我？</h3>

我不只是寫程式碼，我解決問題。從概念到部署，從前端到後端，從 Web2 到 Web3，我都能為你提供全方位的技術支援。

**我的特色：**
- ✨ **技術廣度**：全端開發 + 區塊鏈整合，一站式解決方案
- 🚀 **實戰經驗**：真實專案開發，不是紙上談兵
- 💡 **創新思維**：結合最新技術，打造獨特體驗
- 🎯 **結果導向**：不只是完成功能，更注重使用者體驗
- 🔧 **持續學習**：緊跟技術潮流，採用最佳實踐
</div>

## 提供的服務 🛠️

<div class="service-cards">
    <div class="service-card">
        <div class="service-icon">💻</div>
        <h3 class="service-title">全端開發</h3>
        <p class="service-description">從零到一打造完整的網頁應用程式</p>
        <ul class="service-features">
            <li>響應式網頁設計（RWD）</li>
            <li>前端框架整合（React/Vue）</li>
            <li>後端 API 開發（Ruby/Node.js）</li>
            <li>資料庫設計與優化</li>
            <li>CI/CD 自動化部署</li>
        </ul>
    </div>

    <div class="service-card">
        <div class="service-icon">⛓️</div>
        <h3 class="service-title">Web3 整合</h3>
        <p class="service-description">為你的應用加入區塊鏈功能</p>
        <ul class="service-features">
            <li>智能合約開發（Solidity）</li>
            <li>錢包連接整合（MetaMask）</li>
            <li>NFT/代幣系統開發</li>
            <li>DApp 前端開發</li>
            <li>區塊鏈諮詢與培訓</li>
        </ul>
    </div>

    <div class="service-card">
        <div class="service-icon">🎨</div>
        <h3 class="service-title">UI/UX 優化</h3>
        <p class="service-description">打造令人驚豔的使用者體驗</p>
        <ul class="service-features">
            <li>互動式動畫效果</li>
            <li>賽博龐克風格設計</li>
            <li>效能優化與調校</li>
            <li>可訪問性改善（a11y）</li>
            <li>使用者體驗分析</li>
        </ul>
    </div>

    <div class="service-card">
        <div class="service-icon">🔍</div>
        <h3 class="service-title">技術諮詢</h3>
        <p class="service-description">解決你的技術難題</p>
        <ul class="service-features">
            <li>架構設計諮詢</li>
            <li>程式碼審查（Code Review）</li>
            <li>效能瓶頸分析</li>
            <li>技術選型建議</li>
            <li>最佳實踐指導</li>
        </ul>
    </div>
</div>

## 技術棧 🔧

<div class="tech-stack">
    <div class="tech-badge">Ruby on Rails</div>
    <div class="tech-badge">React</div>
    <div class="tech-badge">Vue.js</div>
    <div class="tech-badge">Node.js</div>
    <div class="tech-badge">TypeScript</div>
    <div class="tech-badge">Solidity</div>
    <div class="tech-badge">Ethers.js</div>
    <div class="tech-badge">PostgreSQL</div>
    <div class="tech-badge">Redis</div>
    <div class="tech-badge">Docker</div>
    <div class="tech-badge">AWS</div>
    <div class="tech-badge">Git</div>
    <div class="tech-badge">TDD</div>
    <div class="tech-badge">Agile</div>
</div>

## 專案經驗 📊

<div class="stats-grid">
    <div class="stat-item">
        <span class="stat-number">5+</span>
        <span class="stat-label">年開發經驗</span>
    </div>
    <div class="stat-item">
        <span class="stat-number">20+</span>
        <span class="stat-label">完成專案</span>
    </div>
    <div class="stat-item">
        <span class="stat-number">10+</span>
        <span class="stat-label">技術棧</span>
    </div>
    <div class="stat-item">
        <span class="stat-number">100%</span>
        <span class="stat-label">客戶滿意度</span>
    </div>
</div>

## 工作流程 🔄

1. **需求分析** - 深入了解你的需求和目標
2. **技術規劃** - 制定最適合的技術方案
3. **迭代開發** - 採用敏捷開發，快速交付
4. **測試驗證** - 嚴格的品質把關（TDD）
5. **部署上線** - CI/CD 自動化部署
6. **持續維護** - 提供技術支援與優化

## 合作方式 🤝

- **時薪制**：適合短期諮詢、緊急問題解決
- **專案制**：適合明確需求的完整專案
- **顧問制**：長期技術夥伴，提供持續支援

<div class="cta-container">
    <a href="mailto:lawa0921@gmail.com" class="cta-button">
        <span style="position: relative; z-index: 1;">📧 聯繫我開始合作</span>
    </a>
</div>

## 關於我這個人 🎮

技術之外，我也熱愛：

- **露營** ⛺ - 在大自然中尋找靈感（同時兼任露營區管理員）
- **桌遊** 🎲 - 策略思考與團隊合作的訓練場
- **肥宅生活** 🍕 - 因為優秀的工程師需要良好的能量補給

我相信，生活的多元體驗能夠為技術工作帶來不同的視角。就像寫程式碼一樣，生活也需要平衡、策略和一點點的隨機性。

---

**準備好開始你的下一個專案了嗎？** 讓我們一起打造些酷東西吧！ 🚀

<script>
// 添加粒子效果
document.addEventListener('DOMContentLoaded', function() {
    // 為服務卡片添加鼠標移動視差效果
    const serviceCards = document.querySelectorAll('.service-card');

    serviceCards.forEach(card => {
        card.addEventListener('mousemove', function(e) {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            const centerX = rect.width / 2;
            const centerY = rect.height / 2;

            const rotateX = (y - centerY) / 20;
            const rotateY = (centerX - x) / 20;

            card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-8px) scale(1.02)`;
        });

        card.addEventListener('mouseleave', function() {
            card.style.transform = '';
        });
    });

    // 數字動畫
    const statNumbers = document.querySelectorAll('.stat-number');
    const observerOptions = {
        threshold: 0.5
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const target = entry.target;
                const text = target.textContent;
                const number = parseInt(text);

                if (!isNaN(number)) {
                    animateNumber(target, 0, number, 2000);
                }
                observer.unobserve(target);
            }
        });
    }, observerOptions);

    statNumbers.forEach(stat => observer.observe(stat));

    function animateNumber(element, start, end, duration) {
        const startTime = performance.now();
        const originalText = element.textContent;
        const suffix = originalText.replace(/[\d,]/g, '');

        function update(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

            const current = Math.floor(start + (end - start) * easeOutQuart(progress));
            element.textContent = current + suffix;

            if (progress < 1) {
                requestAnimationFrame(update);
            }
        }

        requestAnimationFrame(update);
    }

    function easeOutQuart(x) {
        return 1 - Math.pow(1 - x, 4);
    }

    // 技術標籤點擊彩蛋
    const techBadges = document.querySelectorAll('.tech-badge');
    techBadges.forEach(badge => {
        badge.addEventListener('click', function() {
            // 創建飛出的粒子效果
            for (let i = 0; i < 6; i++) {
                createParticle(badge);
            }
        });
    });

    function createParticle(element) {
        const particle = document.createElement('div');
        const rect = element.getBoundingClientRect();

        particle.style.cssText = `
            position: fixed;
            left: ${rect.left + rect.width / 2}px;
            top: ${rect.top + rect.height / 2}px;
            width: 8px;
            height: 8px;
            background: linear-gradient(45deg, #667eea, #764ba2);
            border-radius: 50%;
            pointer-events: none;
            z-index: 9999;
        `;

        document.body.appendChild(particle);

        const angle = Math.random() * Math.PI * 2;
        const velocity = 2 + Math.random() * 3;
        const vx = Math.cos(angle) * velocity;
        const vy = Math.sin(angle) * velocity;

        let x = 0, y = 0, opacity = 1;

        function animate() {
            x += vx;
            y += vy;
            opacity -= 0.02;

            particle.style.transform = `translate(${x}px, ${y}px)`;
            particle.style.opacity = opacity;

            if (opacity > 0) {
                requestAnimationFrame(animate);
            } else {
                particle.remove();
            }
        }

        requestAnimationFrame(animate);
    }
});
</script>
