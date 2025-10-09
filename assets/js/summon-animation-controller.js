/* ===== 召喚動畫控制器 ===== */

(function() {
    'use strict';

    /**
     * 召喚動畫控制器
     * 負責管理召喚影片播放和視覺特效
     */
    class SummonAnimationController {
        constructor() {
            this.video = null;
            this.portalImage = null;
            this.interactiveArea = null;
            this.container = null;
            this.aura = null;
            this.particleContainer = null;
            this.isPlaying = false;
            this.safetyTimeout = null;
        }

        /**
         * 初始化動畫控制器（綁定 DOM 元素）
         */
        initialize() {
            this.video = document.getElementById('summonVideo');
            this.portalImage = document.getElementById('portalImage');
            this.interactiveArea = document.querySelector('.portal-interactive-area');
            this.container = document.querySelector('.summon-portal-container');
            this.aura = document.getElementById('summonAura');
            this.particleContainer = document.getElementById('particleContainer');

            if (!this.video || !this.portalImage) {
                console.error('[動畫控制器] 無法找到必要的 DOM 元素');
                return false;
            }

            console.log('[動畫控制器] 初始化完成');
            return true;
        }

        /**
         * 檢查影片是否可以播放
         */
        canPlay() {
            if (!this.video) return false;
            // readyState >= 3: HAVE_FUTURE_DATA 或 HAVE_ENOUGH_DATA
            return this.video.readyState >= 3;
        }

        /**
         * 開始播放召喚動畫
         * @param {number} rarity - 稀有度（1-5星）
         * @param {Function} onComplete - 動畫完成回調
         */
        async play(rarity, onComplete) {
            if (this.isPlaying) {
                console.warn('[動畫控制器] 動畫已在播放中');
                return;
            }

            // 檢查影片是否可播放
            if (!this.canPlay()) {
                console.warn('[動畫控制器] 影片無法播放，跳過動畫 (readyState:', this.video?.readyState, ')');
                onComplete();
                return;
            }

            this.isPlaying = true;

            // 設置超時保護
            this.safetyTimeout = setTimeout(() => {
                console.warn('[動畫控制器] 動畫超時，強制結束');
                this.stop();
                onComplete();
            }, 7000);

            // 準備動畫環境
            this._prepareAnimation(rarity);

            // 播放影片
            try {
                this.video.classList.add('playing');
                this.video.currentTime = 0;
                await this.video.play();
                console.log('[動畫控制器] 影片開始播放');

                // 設置特效時間軸
                this._setupEffectsTimeline(rarity, onComplete);

                // 監聽影片結束（備用）
                this.video.addEventListener('ended', () => {
                    console.log('[動畫控制器] 影片播放完成');
                    this._clearSafetyTimeout();
                }, { once: true });

            } catch (error) {
                console.error('[動畫控制器] 播放失敗:', error);
                this._clearSafetyTimeout();
                this.stop();
                onComplete();
            }
        }

        /**
         * 準備動畫環境
         */
        _prepareAnimation(rarity) {
            // 隱藏召喚門圖片
            if (this.portalImage) {
                this.portalImage.style.opacity = '0';
            }

            // 隱藏互動區域
            if (this.interactiveArea) {
                this.interactiveArea.style.display = 'none';
            }

            // 啟動容器脈動
            if (this.container) {
                this.container.classList.add('summoning');
            }

            // 設置光暈
            if (this.aura) {
                this.aura.className = 'summon-aura';
                this.aura.classList.add(`star-${rarity}`);
            }
        }

        /**
         * 設置特效時間軸
         */
        _setupEffectsTimeline(rarity, onComplete) {
            // 2秒：粒子效果
            setTimeout(() => {
                this._createParticleEffect(rarity);
            }, 2000);

            // 3秒：光暈初現
            setTimeout(() => {
                if (this.aura) this.aura.classList.add('initial');
            }, 3000);

            // 4秒：光暈完全顯示
            setTimeout(() => {
                if (this.aura) {
                    this.aura.classList.add('transitioning');
                    setTimeout(() => {
                        this.aura.classList.remove('initial');
                        this.aura.classList.add('show');
                        setTimeout(() => this.aura.classList.remove('transitioning'), 1000);
                    }, 50);
                }
            }, 4000);

            // 5秒：強光爆發
            setTimeout(() => {
                if (this.aura) {
                    this.aura.classList.add('transitioning');
                    setTimeout(() => {
                        this.aura.classList.remove('show');
                        this.aura.classList.add('burst');
                        this.aura.classList.remove('transitioning');
                    }, 50);
                }
            }, 5000);

            // 5.5秒：淡出
            setTimeout(() => {
                if (this.aura) {
                    this.aura.classList.remove('burst');
                    this.aura.classList.add('fade-out');
                }
            }, 5500);

            // 6秒：完成
            setTimeout(() => {
                console.log('[動畫控制器] 特效序列完成');
                this._clearSafetyTimeout();
                this.stop();
                onComplete();
            }, 6000);
        }

        /**
         * 創建粒子特效
         */
        _createParticleEffect(rarity) {
            if (!this.particleContainer) return;

            // 清除舊粒子
            this.particleContainer.innerHTML = '';

            // 粒子數量
            const particleCount = rarity * 40 + 60;

            for (let i = 0; i < particleCount; i++) {
                const particle = document.createElement('div');

                // 五星用彩色粒子
                if (rarity === 5) {
                    const colors = [1, 2, 3, 4, 5];
                    const randomColor = colors[Math.floor(Math.random() * colors.length)];
                    particle.className = `particle star-${randomColor} rainbow-particle`;
                } else {
                    particle.className = `particle star-${rarity}`;
                }

                // 隨機位置（向外擴散）
                const angle = (Math.PI * 2 * i) / particleCount + (Math.random() - 0.5) * 1.5;
                const radius = 30 + Math.random() * 200;
                const centerX = 50;
                const centerY = 50;
                const x = centerX + Math.cos(angle) * (radius / 100) * 50;
                const y = centerY + Math.sin(angle) * (radius / 100) * 50;

                particle.style.left = `${x}%`;
                particle.style.top = `${y}%`;
                particle.style.animationDelay = `${Math.random() * (rarity === 5 ? 1.2 : 0.8)}s`;
                particle.style.animationDuration = `${2 + Math.random() * 1.5}s`;

                this.particleContainer.appendChild(particle);

                // 觸發動畫
                setTimeout(() => particle.classList.add('show'), Math.random() * 200);
            }
        }

        /**
         * 停止動畫
         */
        stop() {
            this.isPlaying = false;

            // 恢復召喚門
            if (this.portalImage) {
                this.portalImage.style.opacity = '1';
            }

            // 顯示互動區域
            if (this.interactiveArea) {
                this.interactiveArea.style.display = 'block';
            }

            // 停止容器脈動
            if (this.container) {
                this.container.classList.remove('summoning');
            }

            // 清理光暈
            if (this.aura) {
                this.aura.className = 'summon-aura';
            }

            // 清理粒子
            if (this.particleContainer) {
                this.particleContainer.innerHTML = '';
            }

            // 隱藏影片
            if (this.video) {
                this.video.classList.remove('playing');
                this.video.currentTime = 0;
                this.video.pause();
            }
        }

        /**
         * 清除安全超時
         */
        _clearSafetyTimeout() {
            if (this.safetyTimeout) {
                clearTimeout(this.safetyTimeout);
                this.safetyTimeout = null;
            }
        }

        /**
         * 強制停止（錯誤恢復用）
         */
        forceStop() {
            console.warn('[動畫控制器] 強制停止');
            this._clearSafetyTimeout();
            this.stop();
        }
    }

    // 暴露到全域
    window.SummonAnimationController = SummonAnimationController;

})();
