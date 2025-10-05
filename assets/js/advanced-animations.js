// 進階動畫效果 - 使用 Anime.js
// 移除了未使用的 Three.js 相關代碼 (約 150+ 行死代碼)
class AdvancedAnimations {
    constructor() {
        this.init();
    }

    init() {
        // 直接初始化實際使用的功能，不浪費時間等待 Three.js
        this.initScrollAnimations();
        this.initMouseEffects();
    }

    initScrollAnimations() {
        // 使用 Anime.js 創建滾動觸發動畫
        if (typeof anime !== 'undefined') {
            // 創建滾動觀察器
            const observer = new IntersectionObserver((entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        const target = entry.target;

                        // 技能卡片動畫
                        if (target.classList.contains('skills-section')) {
                            anime({
                                targets: '.skill-card',
                                translateY: [100, 0],
                                opacity: [0, 1],
                                scale: [0.8, 1],
                                duration: 800,
                                delay: anime.stagger(150),
                                easing: 'easeOutBack'
                            });
                        }

                        // 文章卡片動畫
                        if (target.classList.contains('recent-posts')) {
                            anime({
                                targets: '.post-card',
                                translateX: [-100, 0],
                                opacity: [0, 1],
                                duration: 1000,
                                delay: anime.stagger(200),
                                easing: 'easeOutExpo'
                            });
                        }
                    }
                });
            }, { threshold: 0.2 });

            // 觀察所有目標區塊
            document.querySelectorAll('.skills-section, .recent-posts').forEach((el) => {
                observer.observe(el);
            });

            // Hero 區域動畫序列
            anime.timeline({ loop: false })
                .add({
                    targets: '.hero-title',
                    opacity: [0, 1],
                    translateY: [-50, 0],
                    duration: 1200,
                    easing: 'easeOutExpo'
                })
                .add({
                    targets: '.hero-subtitle',
                    opacity: [0, 1],
                    translateY: [30, 0],
                    duration: 1000,
                    easing: 'easeOutExpo'
                }, '-=1000')
                .add({
                    targets: '.social-link',
                    scale: [0, 1],
                    rotate: [180, 0],
                    duration: 800,
                    delay: anime.stagger(80),
                    easing: 'easeOutBounce'
                }, '-=500')
                .add({
                    targets: '.hero-buttons .btn',
                    opacity: [0, 1],
                    translateY: [30, 0],
                    duration: 600,
                    delay: anime.stagger(100),
                    easing: 'easeOutExpo'
                }, '-=400');
        }
    }

    initMouseEffects() {
        // 點擊波紋效果
        document.addEventListener('click', (event) => {
            this.createRipple(event.clientX, event.clientY);
        });
    }

    createRipple(x, y) {
        const ripple = document.createElement('div');
        ripple.style.cssText = `
            position: fixed;
            left: ${x}px;
            top: ${y}px;
            width: 0;
            height: 0;
            border-radius: 50%;
            background: radial-gradient(circle, rgba(102,126,234,0.4) 0%, transparent 70%);
            pointer-events: none;
            z-index: 9999;
            transform: translate(-50%, -50%);
        `;

        document.body.appendChild(ripple);

        if (typeof anime !== 'undefined') {
            anime({
                targets: ripple,
                width: '200px',
                height: '200px',
                opacity: [0.4, 0],
                duration: 800,
                easing: 'easeOutExpo',
                complete: () => {
                    if (ripple.parentNode) {
                        ripple.parentNode.removeChild(ripple);
                    }
                }
            });
        }
    }

    // 炫酷的載入動畫
    static createLoadingAnimation() {
        // 防止重複創建載入動畫
        if (document.getElementById('page-loader')) {
            console.log('載入動畫已存在，跳過重複創建');
            return;
        }

        const loader = document.createElement('div');
        loader.id = 'page-loader';
        loader.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: #000;
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 99999;
            opacity: 1;
            transition: opacity 0.5s ease;
        `;

        // 創建背景影片
        const video = document.createElement('video');
        video.className = 'loader-video';
        video.autoplay = true;
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 100%;
            height: 100%;
            object-fit: contain;
            filter: brightness(0.8);
            z-index: -2;
        `;

        const source = document.createElement('source');
        source.src = 'assets/video/video_overlay_right40_top20.mp4';
        source.type = 'video/mp4';
        video.appendChild(source);

        // 創建遮罩層
        const overlay = document.createElement('div');
        overlay.className = 'loader-overlay';
        overlay.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: radial-gradient(ellipse at center, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.6) 50%, rgba(0,0,0,0.8) 100%);
            z-index: -1;
        `;

        loader.appendChild(video);
        loader.appendChild(overlay);

        const loadingContent = document.createElement('div');
        loadingContent.style.cssText = `
            text-align: center;
            color: white;
            position: relative;
            z-index: 1;
        `;

        // 創建 SVG 動畫圈
        const svgCircle = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svgCircle.setAttribute('width', '100');
        svgCircle.setAttribute('height', '100');
        svgCircle.style.cssText = 'margin-bottom: 20px;';

        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', '50');
        circle.setAttribute('cy', '50');
        circle.setAttribute('r', '45');
        circle.setAttribute('fill', 'none');
        circle.setAttribute('stroke', 'white');
        circle.setAttribute('stroke-width', '4');
        circle.setAttribute('stroke-dasharray', '283');
        circle.setAttribute('stroke-dashoffset', '283');
        circle.style.cssText = 'transform-origin: center; transform: rotate(-90deg);';

        svgCircle.appendChild(circle);
        loadingContent.appendChild(svgCircle);

        const loadingText = document.createElement('div');
        loadingText.textContent = 'Loading...';
        loadingText.style.cssText = `
            font-size: 1.5rem;
            font-weight: 600;
            letter-spacing: 2px;
        `;
        loadingContent.appendChild(loadingText);

        const loadingPercentage = document.createElement('div');
        loadingPercentage.id = 'loading-percentage';
        loadingPercentage.textContent = '0%';
        loadingPercentage.style.cssText = `
            font-size: 2rem;
            font-weight: 700;
            margin-top: 10px;
        `;
        loadingContent.appendChild(loadingPercentage);

        loader.appendChild(loadingContent);
        document.body.appendChild(loader);

        // 使用 Anime.js 創建圓圈動畫
        if (typeof anime !== 'undefined') {
            anime({
                targets: circle,
                strokeDashoffset: [283, 0],
                duration: 1500,
                easing: 'easeInOutQuart',
                loop: true
            });
        }

        // 模擬載入進度
        let progress = 0;
        const interval = setInterval(() => {
            progress += Math.random() * 30;
            if (progress > 100) {
                progress = 100;
                clearInterval(interval);
            }
            loadingPercentage.textContent = Math.round(progress) + '%';
        }, 200);

        return loader;
    }

    // 移除載入動畫（帶淡出效果）
    static removeLoadingAnimation() {
        const loader = document.getElementById('page-loader');
        if (!loader) {
            console.log('⚠️ 找不到載入動畫元素');
            return;
        }

        console.log('🗑️ 移除載入動畫');

        // 使用 Anime.js 創建淡出動畫
        if (typeof anime !== 'undefined') {
            anime({
                targets: loader,
                opacity: [1, 0],
                duration: 500,
                easing: 'easeOutQuad',
                complete: () => {
                    if (loader.parentNode) {
                        loader.parentNode.removeChild(loader);
                        console.log('✅ 載入動畫 DOM 已移除');
                    }
                }
            });
        } else {
            // 回退：直接移除
            loader.style.opacity = '0';
            setTimeout(() => {
                if (loader.parentNode) {
                    loader.parentNode.removeChild(loader);
                }
            }, 500);
        }

        // 移除載入動畫的樣式標籤
        const loadingStyles = document.getElementById('loading-styles');
        if (loadingStyles) {
            loadingStyles.remove();
            console.log('✅ 載入動畫樣式已移除');
        }
    }

    // 載入動畫移除（帶檢查和超時機制）
    static async removeLoadingAnimationSafely() {
        // 等待關鍵資源載入
        const checkResources = () => {
            return new Promise((resolve) => {
                if (document.readyState === 'complete') {
                    resolve(true);
                } else {
                    window.addEventListener('load', () => resolve(true));
                }
            });
        };

        // 等待 DOM 完全載入
        await checkResources();

        // 額外延遲確保視覺穩定
        await new Promise(resolve => setTimeout(resolve, 300));

        // 移除載入動畫
        AdvancedAnimations.removeLoadingAnimation();
    }
}

// 自動初始化
document.addEventListener('DOMContentLoaded', () => {
    new AdvancedAnimations();
    console.log('✅ 進階動畫系統已初始化');
});

// 頁面完全載入後移除載入動畫
window.addEventListener('load', () => {
    // 設置主要移除計時器（2.5秒後）
    const mainRemovalTimer = setTimeout(() => {
        console.log('⏰ 主要移除計時器觸發 (2.5秒)');
        AdvancedAnimations.removeLoadingAnimation();
    }, 2500);

    // 使用 Anime.js 移除載入動畫
    if (typeof anime !== 'undefined') {
        console.log('🎨 使用 Anime.js 移除載入動畫');
        clearTimeout(mainRemovalTimer);

        // 短暫延遲後移除，確保頁面渲染完成
        setTimeout(() => {
            AdvancedAnimations.removeLoadingAnimation();
        }, 500);
    }
});

// 緊急備援移除機制（最多等 5 秒）
setTimeout(() => {
    const loader = document.getElementById('page-loader');
    if (loader) {
        console.log('🚨 緊急備援觸發：強制移除載入動畫');
        AdvancedAnimations.removeLoadingAnimation();
    }
}, 5000);

console.log('✅ 進階動畫模組載入完成');
