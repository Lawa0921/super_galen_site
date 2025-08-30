/* ===== 遊戲狀態管理系統 ===== */

(function() {
    'use strict';

    // 遊戲狀態配置
    const GAME_CONFIG = {
        // 預設的最大值和初始值
        maxValues: {
            hp: 1000,
            mp: 500,
            sp: 300
        },
        initialValues: {
            hp: 1000,    // 首次訪問時 HP 滿血
            mp: 500,     // 首次訪問時 MP 滿值
            sp: 300,     // 首次訪問時 SP 滿值
            gold: 100000 // 首次訪問時金幣數量
        },
        // Cookie 設定
        cookieName: 'SuperGalenGameState',
        cookieExpireDays: 365 // Cookie 保存 1 年
    };

    // 當前遊戲狀態
    let gameState = {
        hp: GAME_CONFIG.initialValues.hp,
        mp: GAME_CONFIG.initialValues.mp,
        sp: GAME_CONFIG.initialValues.sp,
        gold: GAME_CONFIG.initialValues.gold,
        lastVisit: new Date().toISOString()
    };

    // Cookie 工具函數
    const CookieManager = {
        // 設置 Cookie
        set(name, value, days) {
            const expires = new Date();
            expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
            const expiresStr = expires.toUTCString();
            document.cookie = `${name}=${encodeURIComponent(JSON.stringify(value))};expires=${expiresStr};path=/;SameSite=Lax`;
        },

        // 取得 Cookie
        get(name) {
            const nameEQ = name + "=";
            const ca = document.cookie.split(';');
            
            for (let i = 0; i < ca.length; i++) {
                let c = ca[i].trim();
                if (c.indexOf(nameEQ) === 0) {
                    try {
                        const value = c.substring(nameEQ.length, c.length);
                        return JSON.parse(decodeURIComponent(value));
                    } catch (e) {
                        console.warn('無法解析 Cookie 數據:', e);
                        return null;
                    }
                }
            }
            return null;
        },

        // 刪除 Cookie
        delete(name) {
            document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;`;
        }
    };

    // 狀態管理函數
    const GameStateManager = {
        // 初始化遊戲狀態
        init() {
            console.log('遊戲狀態管理系統初始化...');
            
            // 嘗試從 Cookie 讀取狀態
            const savedState = CookieManager.get(GAME_CONFIG.cookieName);
            
            if (savedState && this.validateState(savedState)) {
                // 如果有有效的保存狀態，使用保存的狀態
                gameState = { ...gameState, ...savedState };
                console.log('已載入保存的遊戲狀態:', gameState);
            } else {
                // 如果沒有保存狀態或狀態無效，使用初始值
                console.log('使用初始遊戲狀態:', gameState);
                this.saveState(); // 立即保存初始狀態
            }

            // 更新 UI 顯示
            this.updateUI();
            
            // 設置定期保存（每 30 秒自動保存一次）
            setInterval(() => {
                this.saveState();
            }, 30000);

            console.log('遊戲狀態管理系統初始化完成');
        },

        // 驗證狀態數據的有效性
        validateState(state) {
            // 檢查必要的屬性是否存在
            const requiredKeys = ['hp', 'mp', 'sp', 'gold'];
            for (const key of requiredKeys) {
                if (typeof state[key] !== 'number' || state[key] < 0) {
                    console.warn(`狀態數據無效: ${key} = ${state[key]}`);
                    return false;
                }
            }

            // 檢查數值是否在合理範圍內
            if (state.hp > GAME_CONFIG.maxValues.hp || 
                state.mp > GAME_CONFIG.maxValues.mp || 
                state.sp > GAME_CONFIG.maxValues.sp ||
                state.gold > 10000000) { // 金幣上限 1000 萬
                console.warn('狀態數據超出合理範圍');
                return false;
            }

            return true;
        },

        // 保存狀態到 Cookie
        saveState() {
            gameState.lastVisit = new Date().toISOString();
            CookieManager.set(GAME_CONFIG.cookieName, gameState, GAME_CONFIG.cookieExpireDays);
            console.log('遊戲狀態已保存:', gameState);
        },

        // 更新 UI 顯示
        updateUI() {
            this.updateResourceBar('hp', gameState.hp, GAME_CONFIG.maxValues.hp);
            this.updateResourceBar('mp', gameState.mp, GAME_CONFIG.maxValues.mp);
            this.updateResourceBar('sp', gameState.sp, GAME_CONFIG.maxValues.sp);
            this.updateGoldDisplay();
        },

        // 更新資源條顯示
        updateResourceBar(type, current, max) {
            const barText = document.querySelector(`.${type}-bar .bar-text`);
            const barFill = document.querySelector(`.${type}-bar .bar-fill`);
            
            if (barText) {
                barText.textContent = `${current}/${max}`;
            }
            
            if (barFill) {
                const percentage = Math.max(0, Math.min(100, (current / max) * 100));
                barFill.style.width = `${percentage}%`;
                
                // 根據血量百分比調整顏色（僅針對 HP）
                if (type === 'hp') {
                    if (percentage <= 25) {
                        barFill.style.backgroundColor = '#ff4444'; // 紅色
                    } else if (percentage <= 50) {
                        barFill.style.backgroundColor = '#ff8844'; // 橘色
                    } else {
                        barFill.style.backgroundColor = '#44ff44'; // 綠色
                    }
                }
            }
        },

        // 更新金幣顯示
        updateGoldDisplay() {
            const goldAmountElements = document.querySelectorAll('.gold-amount, #gold-amount');
            goldAmountElements.forEach(element => {
                if (element) {
                    element.textContent = gameState.gold.toLocaleString();
                }
            });
        },

        // 獲取當前狀態
        getState() {
            return { ...gameState };
        },

        // 設置 HP
        setHP(value) {
            const newHP = Math.max(0, Math.min(GAME_CONFIG.maxValues.hp, Math.round(value)));
            if (gameState.hp !== newHP) {
                gameState.hp = newHP;
                this.updateResourceBar('hp', gameState.hp, GAME_CONFIG.maxValues.hp);
                this.saveState();
                console.log(`HP 更新為: ${gameState.hp}`);
            }
        },

        // 設置 MP
        setMP(value) {
            const newMP = Math.max(0, Math.min(GAME_CONFIG.maxValues.mp, Math.round(value)));
            if (gameState.mp !== newMP) {
                gameState.mp = newMP;
                this.updateResourceBar('mp', gameState.mp, GAME_CONFIG.maxValues.mp);
                this.saveState();
                console.log(`MP 更新為: ${gameState.mp}`);
            }
        },

        // 設置 SP
        setSP(value) {
            const newSP = Math.max(0, Math.min(GAME_CONFIG.maxValues.sp, Math.round(value)));
            if (gameState.sp !== newSP) {
                gameState.sp = newSP;
                this.updateResourceBar('sp', gameState.sp, GAME_CONFIG.maxValues.sp);
                this.saveState();
                console.log(`SP 更新為: ${gameState.sp}`);
            }
        },

        // 設置金幣
        setGold(value) {
            const newGold = Math.max(0, Math.round(value));
            if (gameState.gold !== newGold) {
                gameState.gold = newGold;
                this.updateGoldDisplay();
                this.saveState();
                console.log(`金幣更新為: ${gameState.gold}`);
            }
        },

        // 增減 HP
        changeHP(delta) {
            this.setHP(gameState.hp + delta);
        },

        // 增減 MP
        changeMP(delta) {
            this.setMP(gameState.mp + delta);
        },

        // 增減 SP
        changeSP(delta) {
            this.setSP(gameState.sp + delta);
        },

        // 增減金幣
        changeGold(delta) {
            this.setGold(gameState.gold + delta);
        },

        // 檢查是否有足夠的金幣
        hasEnoughGold(amount) {
            return gameState.gold >= amount;
        },

        // 扣除金幣（用於購買等操作）
        deductGold(amount) {
            if (this.hasEnoughGold(amount)) {
                this.changeGold(-amount);
                return true;
            }
            return false;
        },

        // 重置狀態到初始值（重新開始）
        reset() {
            gameState = {
                hp: GAME_CONFIG.initialValues.hp,
                mp: GAME_CONFIG.initialValues.mp,
                sp: GAME_CONFIG.initialValues.sp,
                gold: GAME_CONFIG.initialValues.gold,
                lastVisit: new Date().toISOString()
            };
            this.updateUI();
            this.saveState();
            console.log('遊戲狀態已重置');
        },

        // 清除保存的狀態
        clearSavedState() {
            CookieManager.delete(GAME_CONFIG.cookieName);
            console.log('已清除保存的遊戲狀態');
        }
    };

    // 暴露給全域使用的函數
    window.GameState = GameStateManager;
    
    // 為了向後兼容，暴露一些常用函數到 window
    window.hasEnoughGold = (amount) => GameStateManager.hasEnoughGold(amount);
    window.deductGold = (amount) => GameStateManager.deductGold(amount);
    window.getPlayerGold = () => GameStateManager.getState().gold;
    window.addGold = (amount) => GameStateManager.changeGold(amount);

    // 立即初始化狀態管理系統（不依賴 DOM）
    GameStateManager.init();
    
    // DOM 載入完成後更新 UI
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            GameStateManager.updateUI();
        });
    } else {
        // 如果 DOM 已經載入完成，立即更新 UI
        GameStateManager.updateUI();
    }

    console.log('遊戲狀態管理系統已載入');

})();