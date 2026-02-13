document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const body = document.body;
    const modeSelector = document.getElementById('modeSelector');
    const modeCards = document.querySelectorAll('.mode-card');
    const modeToggle = document.getElementById('modeToggle');
    const modeLabel = document.getElementById('modeLabel');
    const navMenuToggle = document.getElementById('navMenuToggle');
    const navMenuDropdown = document.getElementById('navMenuDropdown');
    const navMenuItems = document.querySelectorAll('.nav-menu-item');

    // State
    let currentMode = 'retro';

    // 1. Mode Selection Interaction
    if (modeCards.length > 0) {
        modeCards.forEach(card => {
            card.addEventListener('click', () => {
                const mode = card.dataset.mode;
                if (mode) {
                    setMode(mode);
                    enterSite();
                }
            });
        });
    }

    function setMode(mode) {
        currentMode = mode;
        body.dataset.mode = mode;
        if (modeLabel) {
            modeLabel.textContent = mode.toUpperCase();
        }

        // Update charts if needed
        updateChartColors(mode);
    }

    function enterSite() {
        if (modeSelector) {
            modeSelector.classList.add('hidden');
        }
        body.classList.remove('mode-selecting');

        // Trigger entrance animations
        animateHero();

        // ScrollTrigger positions were calculated while sections had display:none.
        // Refresh after browser reflows to get correct trigger positions.
        if (typeof ScrollTrigger !== 'undefined') {
            requestAnimationFrame(() => {
                ScrollTrigger.refresh();
            });
        }
    }

    // Mode Toggle Button
    if (modeToggle) {
        modeToggle.addEventListener('click', () => {
            const newMode = currentMode === 'retro' ? 'cyber' : 'retro';
            setMode(newMode);
        });
    }

    // Navigation Menu
    if (navMenuToggle && navMenuDropdown) {
        navMenuToggle.addEventListener('click', () => {
            navMenuDropdown.classList.toggle('active');
        });

        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!navMenuToggle.contains(e.target) && !navMenuDropdown.contains(e.target)) {
                navMenuDropdown.classList.remove('active');
            }
        });
    }

    // Smooth Scroll
    if (navMenuItems.length > 0) {
        navMenuItems.forEach(item => {
            item.addEventListener('click', () => {
                const sectionId = item.dataset.section;
                const section = document.getElementById(sectionId);
                if (section) {
                    section.scrollIntoView({ behavior: 'smooth' });
                    if (navMenuDropdown) {
                        navMenuDropdown.classList.remove('active');
                    }
                }
            });
        });
    }

    // GSAP Animations
    if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
        gsap.registerPlugin(ScrollTrigger);
    }

    function animateHero() {
        if (typeof gsap === 'undefined') return;

        // Hero animations
        gsap.from('.hero-title', {
            y: 100,
            opacity: 0,
            duration: 1,
            ease: 'power4.out',
            delay: 0.5
        });

        gsap.from('.hero-subtitle', {
            y: 50,
            opacity: 0,
            duration: 1,
            ease: 'power3.out',
            delay: 0.7
        });

        gsap.from('.hero-bio', {
            x: -50,
            opacity: 0,
            duration: 1,
            ease: 'power3.out',
            delay: 0.9
        });

        gsap.from('.stat', {
            y: 30,
            opacity: 0,
            duration: 0.8,
            stagger: 0.2,
            ease: 'back.out(1.7)',
            delay: 1.1
        });

        gsap.from('.avatar-frame', {
            rotation: -10,
            scale: 0.8,
            opacity: 0,
            duration: 1.2,
            ease: 'elastic.out(1, 0.5)',
            delay: 0.5
        });

        // Section Headers
        gsap.utils.toArray('.section-header').forEach(header => {
            gsap.from(header, {
                scrollTrigger: {
                    trigger: header,
                    start: 'top 80%',
                    toggleActions: 'play none none reverse'
                },
                y: 50,
                opacity: 0,
                duration: 0.8
            });
        });
    }

    // Initialize Charts
    initCharts();

    // Populate Content
    populateAdWall();
    populateTimeline();
    populateSocialWall();
});

let charts = {};

function initCharts() {
    if (typeof Chart === 'undefined') return;

    // Radar Chart
    const ctxRadar = document.getElementById('skillsRadar');
    if (ctxRadar) {
        charts.radar = new Chart(ctxRadar, {
            type: 'radar',
            data: {
                labels: ['Data Analysis', 'Creative Strategy', 'Project Mgmt', 'AI Automation', 'Communication', 'Technical'],
                datasets: [{
                    label: 'Skill Level',
                    data: [90, 85, 88, 80, 95, 75],
                    backgroundColor: 'rgba(216, 67, 21, 0.2)',
                    borderColor: '#d84315',
                    pointBackgroundColor: '#d84315',
                    pointBorderColor: '#fff',
                    pointHoverBackgroundColor: '#fff',
                    pointHoverBorderColor: '#d84315'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    r: {
                        angleLines: { color: 'rgba(0,0,0,0.1)' },
                        grid: { color: 'rgba(0,0,0,0.1)' },
                        pointLabels: {
                            font: { family: 'Courier Prime', size: 12 },
                            color: '#4e342e'
                        },
                        ticks: { display: false }
                    }
                },
                plugins: {
                    legend: { display: false }
                }
            }
        });
    }

    // Trend Chart
    const ctxTrend = document.getElementById('trendChart');
    if (ctxTrend) {
         charts.trend = new Chart(ctxTrend, {
            type: 'line',
            data: {
                labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
                datasets: [{
                    label: 'ROAS',
                    data: [2.5, 3.2, 3.8, 3.5, 4.2, 4.8],
                    borderColor: '#d84315',
                    backgroundColor: 'rgba(216, 67, 21, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { grid: { display: false } },
                    y: { grid: { color: 'rgba(0,0,0,0.05)' } }
                },
                plugins: {
                    legend: { display: false }
                }
            }
         });
    }

     // Pie Chart
    const ctxPie = document.getElementById('skillPieChart');
    if (ctxPie) {
         charts.pie = new Chart(ctxPie, {
            type: 'doughnut',
            data: {
                labels: ['Strategy', 'Execution', 'Analysis'],
                datasets: [{
                    data: [40, 30, 30],
                    backgroundColor: ['#d84315', '#f57c00', '#ffa726'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom' }
                }
            }
         });
    }
}

function updateChartColors(mode) {
    if (!charts.radar && !charts.trend && !charts.pie) return;

    const colors = mode === 'cyber' ? {
        primary: '#fcd440',
        secondary: '#74a7d3',
        text: '#e6eef5',
        grid: 'rgba(255,255,255,0.1)'
    } : {
        primary: '#d84315',
        secondary: '#f57c00',
        text: '#4e342e',
        grid: 'rgba(0,0,0,0.1)'
    };

    if (charts.radar) {
        charts.radar.data.datasets[0].borderColor = colors.primary;
        charts.radar.data.datasets[0].backgroundColor = mode === 'cyber' ? 'rgba(252, 212, 64, 0.2)' : 'rgba(216, 67, 21, 0.2)';
        charts.radar.data.datasets[0].pointBackgroundColor = colors.primary;
        charts.radar.options.scales.r.pointLabels.color = colors.text;
        charts.radar.options.scales.r.grid.color = colors.grid;
        charts.radar.options.scales.r.angleLines.color = colors.grid;
        charts.radar.update();
    }

    if (charts.trend) {
        charts.trend.data.datasets[0].borderColor = colors.primary;
        charts.trend.data.datasets[0].backgroundColor = mode === 'cyber' ? 'rgba(252, 212, 64, 0.1)' : 'rgba(216, 67, 21, 0.1)';
        charts.trend.update();
    }

    if (charts.pie) {
        charts.pie.data.datasets[0].backgroundColor = mode === 'cyber'
            ? ['#fcd440', '#74a7d3', '#e8dcb9']
            : ['#d84315', '#f57c00', '#ffa726'];
        charts.pie.update();
    }
}

function populateAdWall() {
    const wall = document.getElementById('adWall');
    if (!wall) return;

    const ads = [
        { title: 'Brand Lift', desc: 'Increased brand awareness across target demographics.', metric: '2M+', label: 'Impressions', icon: 'fa-bullhorn' },
        { title: 'Conversion Opt', desc: 'Optimized bidding strategy to reduce acquisition costs.', metric: '-40%', label: 'CPA', icon: 'fa-cart-shopping' },
        { title: 'Retention', desc: 'Implemented email automation for customer lifecycle.', metric: '3.5x', label: 'LTV', icon: 'fa-rotate' },
        { title: 'Social Viral', desc: 'Organic growth campaign leveraging user content.', metric: '15%', label: 'Eng. Rate', icon: 'fa-hashtag' },
        { title: 'Video Ads', desc: 'Short-form video strategy for higher retention.', metric: '60s', label: 'Avg Watch', icon: 'fa-play' },
        { title: 'Lead Gen', desc: 'B2B lead generation via targeted LinkedIn ads.', metric: '500+', label: 'Leads', icon: 'fa-user-tie' }
    ];

    ads.forEach(ad => {
        const el = document.createElement('div');
        el.className = 'ad-card'; // Added class without gsap-init for simplicity, logic below handles anim
        el.classList.add('gsap-init');
        el.innerHTML = `
            <i class="fa-solid ${ad.icon} ad-icon"></i>
            <h3 class="ad-title">${ad.title}</h3>
            <p class="ad-desc">${ad.desc}</p>
            <div class="ad-metrics">
                <div class="metric-item">
                    <div class="metric-value">${ad.metric}</div>
                    <div class="metric-label">${ad.label}</div>
                </div>
            </div>
        `;
        wall.appendChild(el);
    });

    if (typeof gsap !== 'undefined') {
        gsap.to('.ad-card.gsap-init', {
            scrollTrigger: {
                trigger: '#adWall',
                start: 'top 80%'
            },
            y: 0,
            opacity: 1,
            duration: 0.6,
            stagger: 0.1,
            ease: 'power2.out',
            onComplete: () => {
                document.querySelectorAll('.ad-card').forEach(c => c.classList.remove('gsap-init'));
            }
        });
    }
}

function populateTimeline() {
    const timeline = document.getElementById('timelineContent');
    if (!timeline) return;

    const events = [
        { year: '2024', title: 'Senior Project Manager', desc: 'Leading cross-functional teams in global campaigns. Specializing in data-driven decision making.' },
        { year: '2021', title: 'Data Strategist', desc: 'Implemented AI-driven analytics workflows to automate reporting and insight generation.' },
        { year: '2018', title: 'Digital Marketer', desc: 'Managed multi-channel ad budgets > $100k/mo across Facebook, Google, and LinkedIn.' },
        { year: '2016', title: 'Ad Designer', desc: 'Started journey in creative advertising, focusing on visual communication and brand identity.' }
    ];

    events.forEach(item => {
        const el = document.createElement('div');
        el.className = 'timeline-item';
        el.innerHTML = `
            <div class="timeline-dot"></div>
            <div class="timeline-content">
                <div class="timeline-year">${item.year}</div>
                <h3 class="timeline-title">${item.title}</h3>
                <p class="timeline-desc">${item.desc}</p>
            </div>
        `;
        timeline.appendChild(el);
    });

    if (typeof gsap !== 'undefined') {
         gsap.utils.toArray('.timeline-item').forEach(item => {
            gsap.from(item.querySelector('.timeline-content'), {
                scrollTrigger: {
                    trigger: item,
                    start: 'top 85%'
                },
                y: 30,
                opacity: 0,
                duration: 0.8
            });
         });
    }
}

function populateSocialWall() {
    const wall = document.getElementById('socialWall');
    if (!wall) return;

    const posts = [
        { platform: 'fa-instagram', time: '2 days ago', content: 'Data isn\'t just numbers; it\'s the voice of your customers whispering what they need. #DataStorytelling #Marketing', likes: 124, comments: 18 },
        { platform: 'fa-linkedin', time: '1 week ago', content: 'Just wrapped up a major project analyzing Q3 performance. The key takeaway? Personalization is still king.', likes: 450, comments: 32 },
        { platform: 'fa-twitter', time: '2 weeks ago', content: 'AI won\'t replace marketers, but marketers who use AI will replace those who don\'t. #FutureOfWork', likes: 89, comments: 12 },
        { platform: 'fa-instagram', time: '3 weeks ago', content: 'Behind the scenes of our latest campaign shoot. Chaos, coffee, and creativity! ☕📸', likes: 210, comments: 45 },
        { platform: 'fa-linkedin', time: '1 month ago', content: 'Proud to share that our team achieved a 200% ROI on the latest product launch. Hard work pays off!', likes: 560, comments: 78 },
        { platform: 'fa-facebook', time: '1 month ago', content: 'Learning never stops. Just completed a new certification in Advanced Data Analytics.', likes: 150, comments: 24 }
    ];

    posts.forEach(post => {
        const el = document.createElement('div');
        el.className = 'social-post';
        el.innerHTML = `
            <div class="post-header">
                <i class="fa-brands ${post.platform} post-platform"></i>
                <span class="post-time">${post.time}</span>
            </div>
            <p class="post-content">${post.content}</p>
            <div class="post-stats">
                <div class="post-stat"><i class="fa-solid fa-heart"></i> ${post.likes}</div>
                <div class="post-stat"><i class="fa-solid fa-comment"></i> ${post.comments}</div>
            </div>
        `;
        wall.appendChild(el);
    });

    if (typeof gsap !== 'undefined') {
        gsap.from('.social-post', {
            scrollTrigger: {
                trigger: '#socialWall',
                start: 'top 80%'
            },
            y: 50,
            opacity: 0,
            duration: 0.8,
            stagger: 0.1,
            ease: 'power2.out'
        });
    }
}
