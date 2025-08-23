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
        const loader = document.createElement('div');
        loader.id = 'page-loader';
        loader.innerHTML = `
            <div class="loader-content">
                <div class="loader-spinner"></div>
                <p>🚀 載入炫酷體驗中...</p>
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
                background: linear-gradient(135deg, #667eea, #764ba2);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 10000;
                color: white;
                font-family: inherit;
            }
            
            .loader-content {
                text-align: center;
            }
            
            .loader-spinner {
                width: 60px;
                height: 60px;
                border: 3px solid rgba(255,255,255,0.3);
                border-top: 3px solid white;
                border-radius: 50%;
                animation: spin 1s linear infinite;
                margin: 0 auto 20px;
            }
            
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            
            .loader-content p {
                font-size: 1.2rem;
                margin: 0;
            }
        `;
        
        document.head.appendChild(loaderStyles);
        document.body.appendChild(loader);
        
        // 2秒後移除載入畫面
        setTimeout(() => {
            if (typeof anime !== 'undefined') {
                anime({
                    targets: '#page-loader',
                    opacity: [1, 0],
                    scale: [1, 1.1],
                    duration: 800,
                    easing: 'easeInExpo',
                    complete: () => {
                        if (loader.parentNode) {
                            loader.parentNode.removeChild(loader);
                        }
                        if (loaderStyles.parentNode) {
                            loaderStyles.parentNode.removeChild(loaderStyles);
                        }
                    }
                });
            } else {
                loader.style.transition = 'opacity 0.8s ease';
                loader.style.opacity = '0';
                setTimeout(() => {
                    if (loader.parentNode) {
                        loader.parentNode.removeChild(loader);
                    }
                    if (loaderStyles.parentNode) {
                        loaderStyles.parentNode.removeChild(loaderStyles);
                    }
                }, 800);
            }
        }, 2000);
    }
}

// 初始化進階動畫系統
document.addEventListener('DOMContentLoaded', () => {
    // 顯示載入動畫
    AdvancedAnimations.createLoadingAnimation();
    
    // 延遲初始化以確保所有 CDN 套件載入完成
    setTimeout(() => {
        window.advancedAnimations = new AdvancedAnimations();
    }, 500);
});