/**
 * 賽博龐克音效和觸覺回饋系統
 * 提供沉浸式的聲音體驗
 */

console.log('🔊 載入賽博龐克音效系統...');

class CyberAudio {
    constructor() {
        this.isEnabled = true;
        this.volume = 0.7;
        this.audioContext = null;
        this.sounds = new Map();
        this.oscillators = new Set();

        // 音效狀態
        this.ambientPlaying = false;
        this.ambientGain = null;

        // 觸覺回饋支援檢測
        this.hapticSupported = 'vibrate' in navigator;

        this.init();
    }

    async init() {
        console.log('🔊 [Audio] 初始化音效系統...');

        try {
            // 創建音訊上下文
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

            // 生成所有音效
            this.generateSounds();

            // 綁定事件
            this.bindEvents();

            console.log('🔊 [Audio] 音效系統初始化完成');
            console.log(`🔊 [Audio] 觸覺回饋支援: ${this.hapticSupported ? '是' : '否'}`);
        } catch (error) {
            console.warn('🔊 [Audio] 音效系統初始化失敗:', error);
            this.isEnabled = false;
        }
    }

    generateSounds() {
        // 打字機音效 - 機械鍵盤聲音
        this.sounds.set('keypress', () => {
            const freq = 800 + Math.random() * 400; // 800-1200Hz
            const duration = 0.05;
            this.playBeep(freq, duration, 0.1, 'square');
        });

        console.log('🔊 [Audio] 音效庫生成完成，共 1 種音效');
    }

    // 播放基本嗶聲
    playBeep(frequency, duration, volume = 0.3, type = 'sine') {
        if (!this.isEnabled || !this.audioContext) return;

        try {
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);

            oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
            oscillator.type = type;

            gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
            gainNode.gain.linearRampToValueAtTime(volume * this.volume, this.audioContext.currentTime + 0.01);
            gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + duration);

            oscillator.start(this.audioContext.currentTime);
            oscillator.stop(this.audioContext.currentTime + duration);

            this.oscillators.add(oscillator);
            oscillator.onended = () => this.oscillators.delete(oscillator);
        } catch (error) {
            console.warn('🔊 [Audio] 播放音效失敗:', error);
        }
    }



    // 播放指定音效
    play(soundName, options = {}) {
        if (!this.isEnabled) return;

        const sound = this.sounds.get(soundName);
        if (sound) {
            sound(options);

            // 觸覺回饋
            this.hapticFeedback(soundName);
        } else {
            console.warn(`🔊 [Audio] 未知音效: ${soundName}`);
        }
    }

    // 觸覺回饋
    hapticFeedback(soundName) {
        if (!this.hapticSupported) return;

        // 只為打字音效提供觸覺回饋
        if (soundName === 'keypress') {
            try {
                navigator.vibrate(10);
            } catch (error) {
                console.warn('🔊 [Audio] 觸覺回饋失敗:', error);
            }
        }
    }

    // 綁定事件監聽器
    bindEvents() {
        // 監聽終端輸入
        document.addEventListener('keydown', (e) => {
            if (e.target.classList.contains('terminal-input')) {
                // 過濾特殊按鍵，只播放字符鍵的打字音效
                if (e.key.length === 1 && !e.ctrlKey && !e.altKey) {
                    this.play('keypress');
                }
            }
        });

        // 離開頁面時停止所有音效
        window.addEventListener('beforeunload', () => {
            this.stopAll();
        });

        console.log('🔊 [Audio] 事件監聽器綁定完成');
    }

    // 設置音量
    setVolume(volume) {
        this.volume = Math.max(0, Math.min(1, volume));
        console.log(`🔊 [Audio] 音量設置為: ${Math.round(this.volume * 100)}%`);
    }

    // 切換音效開關
    toggle() {
        this.isEnabled = !this.isEnabled;
        console.log(`🔊 [Audio] 音效系統: ${this.isEnabled ? '開啟' : '關閉'}`);

        if (!this.isEnabled) {
            this.stopAll();
        }

        return this.isEnabled;
    }

    // 停止所有音效
    stopAll() {
        console.log('🔊 [Audio] 停止所有音效...');

        // 停止所有振盪器
        this.oscillators.forEach(osc => {
            try {
                osc.stop();
            } catch (error) {
                // 振盪器可能已經停止
            }
        });
        this.oscillators.clear();
    }

    // 獲取音效系統狀態
    getStatus() {
        return {
            enabled: this.isEnabled,
            volume: this.volume,
            hapticSupported: this.hapticSupported,
            soundsLoaded: this.sounds.size,
            activeOscillators: this.oscillators.size
        };
    }
}

// 全局實例
window.CyberAudio = CyberAudio;

// 自動初始化
document.addEventListener('DOMContentLoaded', () => {
    // 等待用戶互動後初始化音訊上下文
    const initAudio = () => {
        if (!window.cyberAudio) {
            window.cyberAudio = new CyberAudio();
            console.log('🔊 [Audio] 賽博龐克音效系統已初始化');
        }
        document.removeEventListener('click', initAudio);
        document.removeEventListener('keydown', initAudio);
    };

    // 等待首次用戶互動
    document.addEventListener('click', initAudio);
    document.addEventListener('keydown', initAudio);
});

console.log('🔊 賽博龐克音效模組載入完成');