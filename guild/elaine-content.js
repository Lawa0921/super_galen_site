// Elaine 個人頁面互動腳本 - 雙模式內容系統

// Register GSAP plugin
if (typeof gsap !== 'undefined') {
    gsap.registerPlugin(ScrollTrigger);
}

// Mode Toggle
const body = document.body;
const toggleBtn = document.getElementById('modeToggle');
const modeLabel = document.getElementById('modeLabel');
let mode = 'retro';

// ========================================
// RETRO MODE DATA - 創意與數據的平衡者
// ========================================
const retroData = {
    subtitle: 'The Creative-Data Balancer',
    bio: '嗨～我是 Elaine，廣告投手半路出家，目前在外商修煉專案管理。背景有點雜：學廣告設計，做的是行銷，但都在看數據。曾嘗試在廣告投放中尋找藝術與成效的平衡點，也曾在智慧產權的條文中活用 AI 實現自動化減少工作量並梳理邏輯，製作完整的成效追蹤。工作之餘時間則窩在自媒體的小天地裡觀察世界。',
    stats: [
        { number: '創意', label: 'Creative' },
        { number: '數據', label: 'Data' },
        { number: '平衡', label: 'Balance' }
    ],
    campaigns: [
        {
            icon: 'fa-palette',
            title: '廣告設計起源',
            desc: '從視覺傳達開始，學習用設計說故事',
            metrics: { field: '設計', skill: '視覺', approach: '創意' }
        },
        {
            icon: 'fa-bullhorn',
            title: '行銷實戰',
            desc: '投入行銷工作，但總是離不開數據分析',
            metrics: { field: '行銷', focus: '數據', mindset: '科學化' }
        },
        {
            icon: 'fa-chart-mixed',
            title: '廣告投放',
            desc: '半路出家的廣告投手，在藝術與成效之間找平衡',
            metrics: { role: '投手', challenge: '藝術vs成效', goal: '平衡' }
        },
        {
            icon: 'fa-robot',
            title: 'AI 自動化',
            desc: '利用 App Script 與 Gemini 打造數位助手，將案件分類與簡報製作自動化，釋放更多創意時間。',
            metrics: { tool: 'AI', application: 'App Script', result: '自動化' }
        },
        {
            icon: 'fa-chart-line',
            title: '成效追蹤',
            desc: '建立完整的追蹤體系，讓數據說話',
            metrics: { method: '追蹤', base: '數據', output: '洞察' }
        },
        {
            icon: 'fa-users',
            title: '專案管理',
            desc: '目前在外商環境中修煉團隊協作與專案管理',
            metrics: { context: '外商', role: 'PM', focus: '協作' }
        }
    ],
    timeline: [
        { year: '起點', title: '廣告設計', desc: '學習廣告設計，打下視覺傳達的基礎' },
        { year: '實踐', title: '行銷工作', desc: '投入行銷領域，開始接觸數據分析' },
        { year: '探索', title: '廣告投放', desc: '半路出家成為廣告投手，尋找藝術與成效的平衡' },
        { year: '突破', title: 'AI 應用', desc: '運用 App Script 與 Gemini 打造自動化助手。將繁雜的案件梳理與備份工作交給 AI，讓自己能專注於跨部門溝通與決策，實現優雅的高效工作。' },
        { year: '深化', title: '成效追蹤', desc: '建立完整的成效追蹤體系' },
        { year: '轉型', title: '專案管理', desc: '在外商環境中修煉專案管理能力' },
        { year: '持續', title: '自媒體觀察', desc: '在小天地裡觀察世界，分享跨界心得' }
    ],
    socialPosts: [
        {
            platform: 'fa-solid fa-palette',
            time: '最近',
            content: '廣告設計的核心：用視覺說故事，讓創意與訊息完美結合',
            stats: { type: '設計', theme: '視覺', focus: '創意' }
        },
        {
            platform: 'fa-solid fa-chart-line',
            time: '最近',
            content: '數據告訴我們「是什麼」，但只有洞察能告訴我們「為什麼」',
            stats: { type: '思考', theme: '數據', focus: '洞察' }
        },
        {
            platform: 'fa-solid fa-balance-scale',
            time: '最近',
            content: '在廣告投放中尋找藝術與成效的平衡點 - 這是半路出家廣告投手的日常',
            stats: { type: '經驗', theme: '平衡', focus: '廣告' }
        },
        {
            platform: 'fa-solid fa-robot',
            time: '最近',
            content: 'AI 不是取代人，而是讓我們有更多時間思考「為什麼」而非「怎麼做」',
            stats: { type: '工具', theme: 'AI', focus: '效率' }
        },
        {
            platform: 'fa-solid fa-handshake',
            time: '最近',
            content: '從廣告到專案管理，我學到最重要的一件事：換位思考',
            stats: { type: '學習', theme: '跨界', focus: '溝通' }
        },
        {
            platform: 'fa-solid fa-globe',
            time: '最近',
            content: '工作之餘窩在自媒體的小天地裡觀察世界，歡迎交流成長',
            stats: { type: '分享', theme: '觀察', focus: '成長' }
        }
    ]
};

// ========================================
// CYBER MODE DATA - 跨界探索者
// ========================================
const cyberData = {
    subtitle: 'The Cross-Domain Navigator',
    bio: '從廣告設計出發，在行銷與數據之間找到平衡點。在智慧產權的條文迷宮中活用 AI 梳理邏輯，在專案管理中追求效率與品質。自媒體觀察者，跨界學習實踐者。',
    stats: [
        { number: '跨界', label: 'Mindset' },
        { number: '數據', label: 'Driven' },
        { number: '實戰', label: 'Focused' }
    ],
    campaigns: [
        {
            icon: 'fa-chart-line',
            title: '數據洞察',
            desc: '從數字中解讀故事，將成效追蹤轉化為決策依據',
            metrics: { focus: '成效', approach: '數據驅動', goal: '優化' }
        },
        {
            icon: 'fa-robot',
            title: 'AI 自動化',
            desc: '以 Gemini 核心驅動 App Script 自動化，建構案件處理與協作的高效能迴路。',
            metrics: { method: 'Gemini', tool: 'App Script', benefit: '效率' }
        },
        {
            icon: 'fa-diagram-project',
            title: '專案管理',
            desc: '在外商環境中修煉跨團隊協作與流程設計',
            metrics: { context: '外商', role: '專案管理', skill: '協調整合' }
        },
        {
            icon: 'fa-bullseye',
            title: '廣告投放',
            desc: '在藝術與成效之間尋找平衡點，半路出家的廣告投手',
            metrics: { challenge: '藝術vs成效', identity: '廣告投手', style: '平衡' }
        },
        {
            icon: 'fa-rss',
            title: '自媒體觀察',
            desc: '工作之餘窩在自己的小天地裡觀察世界',
            metrics: { space: '自媒體', action: '觀察', perspective: '世界' }
        },
        {
            icon: 'fa-arrows-turn-to-dots',
            title: '跨界學習',
            desc: '從廣告設計到行銷到數據到專案管理，持續跨界成長',
            metrics: { background: '雜', experience: '豐富', attitude: '交流成長' }
        }
    ],
    timeline: [
        { year: '起點', title: '廣告設計', desc: '學習視覺溝通與創意思考的基礎' },
        { year: '探索', title: '行銷實戰', desc: '在行銷工作中開始接觸數據分析' },
        { year: '深化', title: '數據思維', desc: '在廣告投放中追求藝術與成效的平衡' },
        { year: '突破', title: 'AI 自動化', desc: '整合 Gemini 與 App Script 建構智慧工作流。實現案件分類、簡報生成與歷程回溯的全自動化迴路，大幅提升資訊處理的精準度與協作產能。' },
        { year: '轉型', title: '專案管理', desc: '在外商環境中修煉跨團隊協作能力' },
        { year: '拓展', title: '自媒體觀察', desc: '在小天地裡觀察世界，持續學習成長' },
        { year: '現在', title: '跨界整合', desc: '整合過往經驗，在不同領域間靈活切換' }
    ],
    socialPosts: [
        {
            platform: 'fa-solid fa-rss',
            time: '最近',
            content: '分享：從廣告設計到專案管理的跨界心得 - 換位思考比專業知識更重要',
            stats: { type: '觀察', theme: '跨界', focus: '成長' }
        },
        {
            platform: 'fa-solid fa-lightbulb',
            time: '最近',
            content: '如何在智慧產權條文中活用 AI？分享自動化減少工作量的實戰經驗',
            stats: { type: '實戰', theme: 'AI應用', focus: '效率' }
        },
        {
            platform: 'fa-solid fa-chart-simple',
            time: '最近',
            content: '數據告訴我們「是什麼」，但洞察才能告訴我們「為什麼」',
            stats: { type: '思考', theme: '數據', focus: '洞察' }
        },
        {
            platform: 'fa-solid fa-bullhorn',
            time: '最近',
            content: '廣告投放的藝術與成效平衡 - 半路出家廣告投手的心路歷程',
            stats: { type: '經驗', theme: '廣告', focus: '平衡' }
        },
        {
            platform: 'fa-solid fa-users',
            time: '最近',
            content: '在外商修煉專案管理：跨文化溝通與團隊協作的挑戰與收穫',
            stats: { type: '分享', theme: '專案管理', focus: '協作' }
        },
        {
            platform: 'fa-solid fa-book-open',
            time: '最近',
            content: '不專業，但實戰經驗豐富 - 歡迎一起交流跨界學習心得',
            stats: { type: '邀請', theme: '學習', focus: '交流' }
        }
    ]
};

// ========================================
// Content Update Functions
// ========================================

function updateHeroContent() {
    const data = mode === 'retro' ? retroData : cyberData;

    // Update subtitle
    const subtitle = document.querySelector('.hero-subtitle');
    if (subtitle) {
        subtitle.textContent = data.subtitle;
    }

    // Update bio
    const bio = document.querySelector('.hero-bio');
    if (bio) {
        bio.textContent = data.bio;
    }

    // Update stats
    const statsContainer = document.querySelector('.hero-stats');
    if (statsContainer) {
        statsContainer.textContent = '';
        data.stats.forEach(stat => {
            const statDiv = document.createElement('div');
            statDiv.className = 'stat';

            const number = document.createElement('span');
            number.className = 'stat-number';
            number.textContent = stat.number;

            const label = document.createElement('span');
            label.className = 'stat-label';
            label.textContent = stat.label;

            statDiv.appendChild(number);
            statDiv.appendChild(label);
            statsContainer.appendChild(statDiv);
        });
    }
}

function createAdWall() {
    return new Promise((resolve) => {
        const data = mode === 'retro' ? retroData : cyberData;
        const wall = document.getElementById('adWall');
        if (!wall) {
            resolve();
            return;
        }

        wall.textContent = '';

        data.campaigns.forEach((ad) => {
            const card = document.createElement('div');
            card.className = 'ad-card gsap-init';

            const icon = document.createElement('div');
            icon.className = 'ad-icon';
            const iconElement = document.createElement('i');
            iconElement.className = `fa-solid ${ad.icon}`;
            icon.appendChild(iconElement);

            const title = document.createElement('h3');
            title.className = 'ad-title';
            title.textContent = ad.title;

            const desc = document.createElement('p');
            desc.className = 'ad-desc';
            desc.textContent = ad.desc;

            const metrics = document.createElement('div');
            metrics.className = 'ad-metrics';

            Object.entries(ad.metrics).forEach(([key, value]) => {
                const metricItem = document.createElement('div');
                metricItem.className = 'metric-item';

                const metricValue = document.createElement('div');
                metricValue.className = 'metric-value';
                metricValue.textContent = value;

                const metricLabel = document.createElement('div');
                metricLabel.className = 'metric-label';
                metricLabel.textContent = key;

                metricItem.appendChild(metricValue);
                metricItem.appendChild(metricLabel);
                metrics.appendChild(metricItem);
            });

            card.appendChild(icon);
            card.appendChild(title);
            card.appendChild(desc);
            card.appendChild(metrics);
            wall.appendChild(card);

            // Add click animation
            card.addEventListener('click', function () {
                if (typeof gsap !== 'undefined') {
                    gsap.to(this, {
                        scale: 0.95,
                        duration: 0.1,
                        yoyo: true,
                        repeat: 1
                    });
                }
            });
        });

        // Wait for DOM to actually render the elements
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                resolve();
            });
        });
    });
}

function createTimeline() {
    const data = mode === 'retro' ? retroData : cyberData;
    const timeline = document.getElementById('timelineContent');
    if (!timeline) return;

    timeline.textContent = '';

    data.timeline.forEach(item => {
        const timelineItem = document.createElement('div');
        timelineItem.className = 'timeline-item';

        const dot = document.createElement('div');
        dot.className = 'timeline-dot';

        const content = document.createElement('div');
        content.className = 'timeline-content';

        const year = document.createElement('div');
        year.className = 'timeline-year';
        year.textContent = item.year;

        const title = document.createElement('div');
        title.className = 'timeline-title';
        title.textContent = item.title;

        const desc = document.createElement('div');
        desc.className = 'timeline-desc';
        desc.textContent = item.desc;

        content.appendChild(year);
        content.appendChild(title);
        content.appendChild(desc);

        timelineItem.appendChild(dot);
        timelineItem.appendChild(content);
        timeline.appendChild(timelineItem);
    });

    // Scroll animations - with GSAP check
    if (typeof gsap !== 'undefined') {
        gsap.from('.timeline-item', {
            scrollTrigger: {
                trigger: '.timeline',
                start: 'top 80%',
                toggleActions: 'play none none reverse'
            },
            opacity: 0,
            y: 50,
            stagger: 0.2,
            duration: 0.8
        });
    }
}

function createSocialWall() {
    const data = mode === 'retro' ? retroData : cyberData;
    const wall = document.getElementById('socialWall');
    if (!wall) return;

    wall.textContent = '';

    data.socialPosts.forEach(post => {
        const postElement = document.createElement('div');
        postElement.className = 'social-post';

        const header = document.createElement('div');
        header.className = 'post-header';

        const platformIcon = document.createElement('i');
        platformIcon.className = `${post.platform} post-platform`;

        const time = document.createElement('span');
        time.className = 'post-time';
        time.textContent = post.time;

        header.appendChild(platformIcon);
        header.appendChild(time);

        const content = document.createElement('div');
        content.className = 'post-content';
        content.textContent = post.content;

        const stats = document.createElement('div');
        stats.className = 'post-stats';

        Object.entries(post.stats).forEach(([key, value]) => {
            const stat = document.createElement('span');
            stat.className = 'post-stat';

            const icon = document.createElement('i');
            const iconMap = {
                likes: 'fa-heart', stars: 'fa-star', reactions: 'fa-face-smile', claps: 'fa-hands-clapping', views: 'fa-eye', votes: 'fa-arrow-up',
                comments: 'fa-comment', replies: 'fa-reply', responses: 'fa-message',
                shares: 'fa-share', forks: 'fa-code-fork', saves: 'fa-bookmark', reads: 'fa-book-open', subs: 'fa-user-plus',
                commits: 'fa-code-commit', accepts: 'fa-check', mentions: 'fa-at',
                type: 'fa-tag', theme: 'fa-layer-group', focus: 'fa-bullseye', background: 'fa-user', experience: 'fa-chart-line', attitude: 'fa-handshake',
                context: 'fa-building', role: 'fa-user-tie', skill: 'fa-star', challenge: 'fa-exclamation', identity: 'fa-id-card', style: 'fa-palette',
                space: 'fa-globe', action: 'fa-play', perspective: 'fa-eye'
            };
            icon.className = `fa-solid ${iconMap[key] || 'fa-circle'}`;

            const text = document.createTextNode(` ${value}`);

            stat.appendChild(icon);
            stat.appendChild(text);
            stats.appendChild(stat);
        });

        postElement.appendChild(header);
        postElement.appendChild(content);
        postElement.appendChild(stats);
        wall.appendChild(postElement);

        // Hover effects - with GSAP check
        postElement.addEventListener('mouseenter', function () {
            if (typeof gsap !== 'undefined') {
                gsap.to(this, { scale: 1.02, duration: 0.3 });
            }
        });
        postElement.addEventListener('mouseleave', function () {
            if (typeof gsap !== 'undefined') {
                gsap.to(this, { scale: 1, duration: 0.3 });
            }
        });
    });
}

// Charts
let radarChart, trendChart, pieChart;

function createRadar() {
    const ctx = document.getElementById('skillsRadar');
    if (!ctx) return;

    const colors = mode === 'retro' ? {
        bg: 'rgba(255, 87, 34, 0.2)',
        border: 'rgba(255, 87, 34, 1)',
        point: 'rgba(255, 87, 34, 1)',
        text: '#4e342e',
        grid: 'rgba(78, 52, 46, 0.2)'
    } : {
        bg: 'rgba(252, 212, 64, 0.2)',
        border: 'rgba(252, 212, 64, 1)',
        point: 'rgba(252, 212, 64, 1)',
        text: '#e6eef5',
        grid: 'rgba(116, 167, 211, 0.3)'
    };

    const labels = mode === 'retro'
        ? ['廣告設計', '數據分析', '專案管理', 'AI 自動化', '內容創作', '跨界整合']
        : ['數據思維', 'AI 應用', '流程優化', '專案管理', '自媒體觀察', '跨界學習'];

    const values = mode === 'retro'
        ? [85, 90, 95, 80, 88, 92]
        : [95, 92, 88, 85, 94, 90];

    if (radarChart) radarChart.destroy();

    radarChart = new Chart(ctx.getContext('2d'), {
        type: 'radar',
        data: {
            labels: labels,
            datasets: [{
                label: mode === 'retro' ? '能力值' : 'Proficiency',
                data: values,
                backgroundColor: colors.bg,
                borderColor: colors.border,
                pointBackgroundColor: colors.point,
                pointBorderColor: '#fff',
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: colors.border,
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
                r: {
                    beginAtZero: true,
                    max: 100,
                    ticks: {
                        stepSize: 20,
                        color: colors.text,
                        backdropColor: 'transparent',
                        font: {
                            size: 13,
                            weight: mode === 'cyber' ? 'bold' : 'normal'
                        }
                    },
                    grid: {
                        color: colors.grid
                    },
                    pointLabels: {
                        color: colors.text,
                        font: {
                            size: 13,
                            weight: mode === 'cyber' ? 'bold' : 'normal'
                        }
                    }
                }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}

function createCharts() {
    const colors = mode === 'retro' ? {
        primary: 'rgba(216, 67, 21, 1)',
        secondary: 'rgba(245, 124, 0, 1)',
        tertiary: 'rgba(255, 167, 38, 1)'
    } : {
        primary: 'rgba(252, 212, 64, 1)',
        secondary: 'rgba(116, 167, 211, 1)',
        tertiary: 'rgba(232, 220, 185, 1)'
    };

    // Trend Chart
    const trendCtx = document.getElementById('trendChart');
    if (trendCtx) {
        if (trendChart) trendChart.destroy();

        const trendLabels = mode === 'retro' ? ['Q1', 'Q2', 'Q3', 'Q4'] : ['Jan', 'Apr', 'Jul', 'Oct'];
        const trendData = mode === 'retro' ? [65, 78, 85, 92] : [72, 85, 91, 96];

        trendChart = new Chart(trendCtx.getContext('2d'), {
            type: 'line',
            data: {
                labels: trendLabels,
                datasets: [{
                    label: mode === 'retro' ? '專案成效' : 'System Performance',
                    data: trendData,
                    borderColor: colors.primary,
                    backgroundColor: colors.primary.replace('1)', '0.2)'),
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { color: getComputedStyle(document.body).getPropertyValue('--text') }
                    },
                    x: {
                        ticks: { color: getComputedStyle(document.body).getPropertyValue('--text') }
                    }
                }
            }
        });
    }

    // Pie Chart
    const pieCtx = document.getElementById('skillPieChart');
    if (pieCtx) {
        if (pieChart) pieChart.destroy();

        const pieLabels = mode === 'retro'
            ? ['廣告設計', '數據分析', '專案管理', 'AI 自動化', '內容創作']
            : ['AI Application', 'Workflow Auto', 'Data Analysis', 'Project Mgmt', 'Strategy'];

        const pieData = mode === 'retro' ? [20, 25, 25, 15, 15] : [30, 25, 20, 15, 10];

        pieChart = new Chart(pieCtx.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: pieLabels,
                datasets: [{
                    data: pieData,
                    backgroundColor: [
                        colors.primary,
                        colors.secondary,
                        colors.tertiary,
                        colors.primary.replace('1)', '0.6)'),
                        colors.secondary.replace('1)', '0.6)')
                    ]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: getComputedStyle(document.body).getPropertyValue('--text'),
                            font: { size: 11 }
                        }
                    }
                }
            }
        });
    }

    createRadar();
}

// Mode Toggle Handler
if (toggleBtn) {
    toggleBtn.addEventListener('click', async () => {
        mode = mode === 'retro' ? 'cyber' : 'retro';
        body.setAttribute('data-mode', mode);
        if (modeLabel) {
            modeLabel.textContent = mode === 'retro' ? 'RETRO' : 'CYBER';
        }

        // Update all content
        updateHeroContent();
        await createAdWall();

        // Create other content - wrapped in try-catch to ensure card animations still run
        try { createCharts(); } catch (e) { /* continue */ }
        try { createTimeline(); } catch (e) { /* continue */ }
        try { createSocialWall(); } catch (e) { /* continue */ }

        // Re-animate cards after mode switch
        const adCards = document.querySelectorAll('.ad-card');

        // Force layout calculation
        adCards.forEach(card => void card.offsetHeight);

        if (typeof gsap !== 'undefined' && adCards.length > 0) {
            gsap.to(adCards, {
                opacity: 1,
                y: 0,
                stagger: 0.15,
                duration: 0.8,
                ease: 'power2.out',
                onStart: function() {
                    adCards.forEach(card => {
                        card.style.transform = '';
                    });
                },
                onComplete: function() {
                    adCards.forEach(card => {
                        card.classList.remove('gsap-init');
                        card.style.opacity = '1';
                        card.style.transform = '';
                    });
                }
            });
        } else if (adCards.length > 0) {
            adCards.forEach(card => {
                card.classList.remove('gsap-init');
                card.style.opacity = '1';
                card.style.transform = '';
            });
        }
    });
}

// Initialize
async function initializePage() {
    // Create essential content first
    updateHeroContent();
    await createAdWall();

    // Create other content - wrapped in try-catch to ensure card animations still run
    try {
        createCharts();
    } catch (e) { /* Chart creation failed, continue */ }

    try {
        createTimeline();
    } catch (e) { /* Timeline creation failed, continue */ }

    try {
        createSocialWall();
    } catch (e) { /* Social wall creation failed, continue */ }

    // Apply animations after content is confirmed ready
    const heroText = document.querySelector('.hero-text');
    const adCards = document.querySelectorAll('.ad-card');

    // Force layout calculation before animation
    adCards.forEach(card => {
        // Reading offsetHeight forces browser to calculate layout
        void card.offsetHeight;
    });

    if (typeof gsap !== 'undefined') {
        if (heroText) {
            gsap.fromTo('.hero-text',
                { opacity: 0, y: 50 },
                { opacity: 1, y: 0, duration: 1, delay: 0.2 }
            );
        }

        if (adCards.length > 0) {
            // Animate from CSS initial state (gsap-init class) to visible
            gsap.to(adCards, {
                opacity: 1,
                y: 0,
                stagger: 0.15,
                duration: 0.8,
                ease: 'power2.out',
                delay: 0.3,
                onStart: function() {
                    // Clear the CSS class transform so GSAP has full control
                    adCards.forEach(card => {
                        card.style.transform = '';
                    });
                },
                onComplete: function() {
                    // Remove init class and ensure visible state
                    adCards.forEach(card => {
                        card.classList.remove('gsap-init');
                        card.style.opacity = '1';
                        card.style.transform = '';
                    });
                }
            });
        }
    } else {
        // Fallback if GSAP is not loaded - ensure cards are visible
        adCards.forEach(card => {
            card.classList.remove('gsap-init');
            card.style.opacity = '1';
            card.style.transform = '';
        });
    }
}

// Mode selection handler
document.addEventListener('DOMContentLoaded', () => {
    const modeSelector = document.getElementById('modeSelector');
    const modeCards = document.querySelectorAll('.mode-card');

    modeCards.forEach(card => {
        card.addEventListener('click', async () => {
            const selectedMode = card.getAttribute('data-mode');
            mode = selectedMode;
            body.setAttribute('data-mode', selectedMode);
            if (modeLabel) {
                modeLabel.textContent = selectedMode === 'retro' ? 'RETRO' : 'CYBER';
            }

            // Remove mode-selecting immediately so content can render
            body.classList.remove('mode-selecting');

            // Initialize page content with error handling
            if (document.getElementById('adWall')) {
                try {
                    await initializePage();
                } catch (err) {
                    // Ensure cards are visible even if animation fails
                    const adCards = document.querySelectorAll('.ad-card');
                    adCards.forEach(c => {
                        c.style.opacity = '1';
                        c.style.transform = 'none';
                    });
                }
            }

            // Start fade out animation (content already rendering behind it)
            modeSelector.classList.add('hidden');
        });
    });
});

// Parallax effect
document.addEventListener('mousemove', (e) => {
    if (typeof gsap !== 'undefined') {
        const mouseX = e.clientX / window.innerWidth - 0.5;
        const mouseY = e.clientY / window.innerHeight - 0.5;

        gsap.to('.avatar-frame', {
            rotateY: mouseX * 20,
            rotateX: -mouseY * 20,
            duration: 0.5
        });
    }
});

// ========================================
// Quick Navigation Menu
// ========================================
const navMenuToggle = document.getElementById('navMenuToggle');
const navMenuDropdown = document.getElementById('navMenuDropdown');
const navMenuItems = document.querySelectorAll('.nav-menu-item');

// Toggle menu
navMenuToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    navMenuDropdown.classList.toggle('active');
});

// Navigate to section
navMenuItems.forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        const sectionId = item.getAttribute('data-section');
        const section = document.getElementById(sectionId);

        if (section) {
            const offset = 80;
            const sectionTop = section.getBoundingClientRect().top + window.pageYOffset - offset;

            window.scrollTo({
                top: sectionTop,
                behavior: 'smooth'
            });
        }

        // Close menu after clicking
        navMenuDropdown.classList.remove('active');
    });
});

// Close menu when clicking outside
document.addEventListener('click', (e) => {
    if (!navMenuToggle.contains(e.target) && !navMenuDropdown.contains(e.target)) {
        navMenuDropdown.classList.remove('active');
    }
});

// Close menu on scroll
let scrollTimeout;
window.addEventListener('scroll', () => {
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
        navMenuDropdown.classList.remove('active');
    }, 150);
});
