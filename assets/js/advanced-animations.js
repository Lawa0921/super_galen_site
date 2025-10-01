// 進階動畫效果 - 使用 Three.js 和 Anime.js (CDN 版本)
class AdvancedAnimations {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.particleSystem = null;
        this.init();
    }

    init() {
        // 確保 Three.js 已載入
        if (typeof THREE === 'undefined') {
            console.log('等待 Three.js 載入...');
            setTimeout(() => this.init(), 100);
            return;
        }
        
        this.initThreeJS();
        this.createParticleSystem();
        this.initScrollAnimations();
        this.initMouseEffects();
        this.animate();
    }

    initThreeJS() {
        const canvas = document.getElementById('hero-canvas');
        if (!canvas) return;

        // 場景設置
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, canvas.offsetWidth / canvas.offsetHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
        
        this.renderer.setSize(canvas.offsetWidth, canvas.offsetHeight);
        this.renderer.setClearColor(0x000000, 0);
        
        this.camera.position.z = 5;

        // 響應式調整
        window.addEventListener('resize', () => this.onWindowResize());
    }

    createParticleSystem() {
        if (!this.scene) return;

        // 創建幾何體和材質
        const geometry = new THREE.BufferGeometry();
        const particleCount = 500; // 減少粒子數量提高效能
        const positions = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);

        // 隨機分布粒子
        for (let i = 0; i < particleCount * 3; i += 3) {
            positions[i] = (Math.random() - 0.5) * 15;
            positions[i + 1] = (Math.random() - 0.5) * 15;
            positions[i + 2] = (Math.random() - 0.5) * 15;

            // 漸層色彩
            const hue = Math.random() * 360;
            const color = new THREE.Color(`hsl(${hue}, 70%, 60%)`);
            colors[i] = color.r;
            colors[i + 1] = color.g;
            colors[i + 2] = color.b;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 0.03,
            vertexColors: true,
            transparent: true,
            opacity: 0.7,
            blending: THREE.AdditiveBlending
        });

        this.particleSystem = new THREE.Points(geometry, material);
        this.scene.add(this.particleSystem);

        // 添加環境光
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(ambientLight);
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
                                translateY: [50, 0],
                                opacity: [0, 1],
                                rotateX: [15, 0],
                                duration: 600,
                                delay: anime.stagger(100),
                                easing: 'easeOutElastic(1, 0.5)'
                            });
                        }
                    }
                });
            }, { threshold: 0.2 });

            // 觀察元素
            const skillsSection = document.querySelector('.skills-section');
            const postsSection = document.querySelector('.recent-posts');
            
            if (skillsSection) observer.observe(skillsSection);
            if (postsSection) observer.observe(postsSection);

            // 頁面載入動畫
            anime.timeline()
                .add({
                    targets: '.hero h1',
                    opacity: [0, 1],
                    translateY: [50, 0],
                    duration: 1500,
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
        let mouseX = 0, mouseY = 0;
        let targetX = 0, targetY = 0;

        document.addEventListener('mousemove', (event) => {
            targetX = (event.clientX / window.innerWidth) * 2 - 1;
            targetY = -(event.clientY / window.innerHeight) * 2 + 1;
        });

        // 平滑滑鼠跟隨
        const updateCamera = () => {
            mouseX += (targetX - mouseX) * 0.05;
            mouseY += (targetY - mouseY) * 0.05;

            if (this.camera) {
                this.camera.position.x = mouseX * 1.5;
                this.camera.position.y = mouseY * 1.5;
                this.camera.lookAt(0, 0, 0);
            }
            
            requestAnimationFrame(updateCamera);
        };
        updateCamera();

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

    animate() {
        requestAnimationFrame(() => this.animate());

        if (this.particleSystem) {
            // 緩慢旋轉
            this.particleSystem.rotation.x += 0.0005;
            this.particleSystem.rotation.y += 0.001;

            // 粒子浮動效果
            const positions = this.particleSystem.geometry.attributes.position;
            const time = Date.now() * 0.001;
            
            for (let i = 0; i < positions.count; i++) {
                positions.array[i * 3 + 1] += Math.sin(time + i * 0.1) * 0.002;
            }
            
            positions.needsUpdate = true;
        }

        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    }

    onWindowResize() {
        if (!this.camera || !this.renderer) return;

        const canvas = document.getElementById('hero-canvas');
        if (!canvas) return;

        this.camera.aspect = canvas.offsetWidth / canvas.offsetHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(canvas.offsetWidth, canvas.offsetHeight);
    }

    // 炫酷的載入動畫
    static createLoadingAnimation() {
        // 防止重複創建載入動畫
        if (document.getElementById('page-loader')) {
            console.log('載入動畫已存在，跳過重複創建');
            return;
        }

        console.log('🎬 開始創建載入動畫');
        const loader = document.createElement('div');
        loader.id = 'page-loader';

        // 設置全域引用，方便調試和手動移除
        window.__pageLoader = loader;
        loader.innerHTML = `
            <video class="loader-video" autoplay muted loop playsinline>
                <source src="assets/video/video_overlay_right40_top20.mp4" type="video/mp4">
            </video>
            <div class="loader-overlay"></div>
            <div class="loader-content">
                <div class="loader-portal"></div>
                <h2 class="loader-title">即將抵達 SuperGalen's Dungeon</h2>
                <div class="loader-progress">
                    <div class="progress-bar"></div>
                </div>
                <div class="particles-container"></div>
            </div>
        `;
        
        const loaderStyles = document.createElement('style');
        loaderStyles.textContent = `
            #page-loader {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: #000;
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 10000;
                color: white;
                font-family: inherit;
                overflow: hidden;
            }
            
            .loader-video {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 100%;
                height: 100%;
                z-index: -2;
                object-fit: contain;
                filter: brightness(0.8);
            }
            
            .loader-overlay {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: radial-gradient(ellipse at center, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.6) 50%, rgba(0,0,0,0.8) 100%);
                z-index: -1;
            }
            
            .loader-content {
                text-align: center;
                position: relative;
                z-index: 1;
            }
            
            .loader-portal {
                width: 120px;
                height: 120px;
                border-radius: 50%;
                margin: 0 auto 30px;
                position: relative;
                animation: portal-pulse 2s ease-in-out infinite;
            }
            
            .loader-portal::before,
            .loader-portal::after {
                content: '';
                position: absolute;
                width: 100%;
                height: 100%;
                border-radius: 50%;
                border: 3px solid;
                animation: portal-rotate 3s linear infinite;
            }
            
            .loader-portal::before {
                border-color: #667eea transparent #667eea transparent;
                animation-duration: 3s;
            }
            
            .loader-portal::after {
                border-color: transparent #764ba2 transparent #764ba2;
                animation-duration: 2s;
                animation-direction: reverse;
                width: 80%;
                height: 80%;
                top: 10%;
                left: 10%;
            }
            
            @keyframes portal-pulse {
                0%, 100% { transform: scale(1); opacity: 0.8; }
                50% { transform: scale(1.1); opacity: 1; }
            }
            
            @keyframes portal-rotate {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            
            .loader-title {
                font-size: 1.8rem;
                margin: 0 0 30px;
                font-weight: bold;
                text-transform: uppercase;
                letter-spacing: 2px;
                animation: title-glow 2s ease-in-out infinite;
                text-shadow: 0 0 20px rgba(102, 126, 234, 0.8);
            }
            
            @keyframes title-glow {
                0%, 100% { opacity: 0.8; }
                50% { opacity: 1; text-shadow: 0 0 30px rgba(102, 126, 234, 1), 0 0 60px rgba(118, 75, 162, 0.8); }
            }
            
            .loader-progress {
                width: 300px;
                height: 4px;
                background: rgba(255,255,255,0.1);
                border-radius: 2px;
                overflow: hidden;
                margin: 0 auto;
                box-shadow: 0 0 10px rgba(102, 126, 234, 0.5);
            }
            
            .progress-bar {
                height: 100%;
                background: linear-gradient(90deg, #667eea, #764ba2);
                width: 0%;
                animation: progress-fill 2s ease-out forwards;
                box-shadow: 0 0 10px rgba(102, 126, 234, 0.8);
            }
            
            @keyframes progress-fill {
                0% { width: 0%; }
                100% { width: 100%; }
            }
            
            .particles-container {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                pointer-events: none;
            }
            
            .particle {
                position: absolute;
                width: 4px;
                height: 4px;
                background: radial-gradient(circle, rgba(102,126,234,0.9) 0%, transparent 70%);
                border-radius: 50%;
                animation: particle-float 4s linear infinite;
            }
            
            @keyframes particle-float {
                0% {
                    transform: translateY(100vh) scale(0);
                    opacity: 0;
                }
                10% {
                    opacity: 1;
                }
                90% {
                    opacity: 1;
                }
                100% {
                    transform: translateY(-100vh) scale(1);
                    opacity: 0;
                }
            }
        `;
        
        document.head.appendChild(loaderStyles);
        document.body.appendChild(loader);
        
        // 創建飄浮粒子
        const particlesContainer = loader.querySelector('.particles-container');
        const createParticle = () => {
            const particle = document.createElement('div');
            particle.className = 'particle';
            particle.style.left = Math.random() * 100 + '%';
            particle.style.animationDelay = Math.random() * 4 + 's';
            particle.style.animationDuration = (Math.random() * 2 + 3) + 's';
            particlesContainer.appendChild(particle);
            
            setTimeout(() => {
                if (particle.parentNode) {
                    particle.parentNode.removeChild(particle);
                }
            }, 5000);
        };
        
        // 持續創建粒子
        const particleInterval = setInterval(createParticle, 200);
        
        // 定義移除函數
        const removeLoader = () => {
            try {
                console.log('🗑️ 移除載入動畫');
                const loaderElement = document.getElementById('page-loader') || loader;
                if (loaderElement && loaderElement.parentNode) {
                    loaderElement.parentNode.removeChild(loaderElement);
                    console.log('✅ 載入動畫 DOM 已移除');
                }
                if (loaderStyles && loaderStyles.parentNode) {
                    loaderStyles.parentNode.removeChild(loaderStyles);
                    console.log('✅ 載入動畫樣式已移除');
                }
                // 清除全域引用
                delete window.__pageLoader;
            } catch (error) {
                console.error('❌ 移除載入動畫時發生錯誤:', error);
            }
        };

        // 2.5秒後移除載入畫面（主要方法）
        const primaryRemovalTimer = setTimeout(() => {
            console.log('⏰ 主要移除計時器觸發 (2.5秒)');
            clearInterval(particleInterval);

            if (typeof anime !== 'undefined') {
                console.log('🎨 使用 Anime.js 移除載入動畫');
                try {
                    anime({
                        targets: '#page-loader',
                        opacity: [1, 0],
                        scale: [1, 1.05],
                        duration: 1000,
                        easing: 'easeInExpo',
                        complete: removeLoader
                    });
                } catch (error) {
                    console.error('Anime.js 移除失敗，使用備用方法:', error);
                    removeLoader();
                }
            } else {
                console.log('🎨 使用 CSS 過渡移除載入動畫');
                loader.style.transition = 'opacity 1s ease';
                loader.style.opacity = '0';
                setTimeout(removeLoader, 1000);
            }
        }, 2500);

        // 儲存計時器 ID 以便可能的提前清除
        window.__loaderRemovalTimer = primaryRemovalTimer;

        // 緊急移除機制 1：5秒後檢查（如果主要移除失敗）
        setTimeout(() => {
            const existingLoader = document.getElementById('page-loader');
            if (existingLoader) {
                console.warn('⚠️ 5秒後載入動畫仍存在，執行緊急移除');
                removeLoader();
            }
        }, 5000);

        // 緊急移除機制 2：10秒後強制移除（最後防線）
        setTimeout(() => {
            const existingLoader = document.getElementById('page-loader');
            if (existingLoader) {
                console.error('🚨 10秒後載入動畫仍存在，執行強制移除');
                try {
                    existingLoader.remove();
                    // 同時移除所有相關樣式
                    const allStyles = document.querySelectorAll('style');
                    allStyles.forEach(style => {
                        if (style.textContent && style.textContent.includes('#page-loader')) {
                            style.remove();
                        }
                    });
                    // 清除全域引用
                    delete window.__pageLoader;
                    delete window.__loaderRemovalTimer;
                    console.log('✅ 強制移除完成');
                } catch (error) {
                    console.error('❌ 強制移除載入動畫時發生錯誤:', error);
                }
            } else {
                console.log('✅ 載入動畫已正常移除');
            }
        }, 10000);
    }

    // 添加手動移除載入動畫的方法
    static forceRemoveLoadingAnimation() {
        const loader = document.getElementById('page-loader');
        if (loader) {
            console.log('手動移除載入動畫');
            loader.remove();

            // 移除相關樣式
            const allStyles = document.querySelectorAll('style');
            allStyles.forEach(style => {
                if (style.textContent.includes('#page-loader')) {
                    style.remove();
                }
            });
        }
    }
}

// 初始化進階動畫系統
document.addEventListener('DOMContentLoaded', () => {
    // 檢查是否為日誌頁面或文章頁面
    const currentPath = window.location.pathname;
    const isJournalPage = currentPath.includes('/journal');
    const isPostPage = currentPath.includes('/2024-') || currentPath.includes('/2025-') ||
                       currentPath.includes('/2023-') || currentPath.includes('/202');

    // 只在非日誌和非文章頁面顯示載入動畫
    if (!isJournalPage && !isPostPage) {
        // 顯示載入動畫
        AdvancedAnimations.createLoadingAnimation();
    }

    // 延遲初始化以確保所有 CDN 套件載入完成
    setTimeout(() => {
        window.advancedAnimations = new AdvancedAnimations();
    }, 500);
});

// 添加鍵盤快捷鍵來手動移除載入動畫（按 Escape 鍵）
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const loader = document.getElementById('page-loader');
        if (loader) {
            console.log('用戶按下 Escape 鍵，手動移除載入動畫');
            AdvancedAnimations.forceRemoveLoadingAnimation();
        }
    }
});

// 添加點擊載入動畫來移除的功能
document.addEventListener('click', (e) => {
    if (e.target.closest('#page-loader')) {
        console.log('用戶點擊載入動畫，手動移除');
        AdvancedAnimations.forceRemoveLoadingAnimation();
    }
});