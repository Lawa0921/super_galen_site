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
        cookieExpireDays: 365, // Cookie 保存 1 年
        
        // 死亡復活設定
        reviveSettings: {
            countdownSeconds: 60,    // 復活倒數時間 60 秒
            reviveHPPercent: 0.1,    // 復活時 HP 為最大值的 10%
            reviveSPPercent: 0.1     // 復活時 SP 為最大值的 10%
        }
    };

    // 當前遊戲狀態
    let gameState = {
        hp: GAME_CONFIG.initialValues.hp,
        mp: GAME_CONFIG.initialValues.mp,
        sp: GAME_CONFIG.initialValues.sp,
        gold: GAME_CONFIG.initialValues.gold,
        lastVisit: new Date().toISOString(),
        isDead: false,             // 是否處於死亡狀態
        reviveCountdown: 0,        // 復活倒數時間
        isReviving: false          // 是否正在復活倒數中
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
            
            // 檢查是否處於死亡狀態，如果是則重新啟動倒數計時
            if (gameState.isDead && gameState.isReviving && gameState.reviveCountdown > 0) {
                console.log(`檢測到死亡狀態，重新啟動復活倒數: ${gameState.reviveCountdown}秒`);
                this.startReviveCountdown();
            }
            
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

            // 檢查死亡相關狀態的合理性
            if (state.isDead !== undefined && typeof state.isDead !== 'boolean') {
                console.warn(`死亡狀態無效: isDead = ${state.isDead}`);
                return false;
            }

            if (state.isReviving !== undefined && typeof state.isReviving !== 'boolean') {
                console.warn(`復活狀態無效: isReviving = ${state.isReviving}`);
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
            
            // 更新死亡狀態相關的 UI 效果
            this.updateDeathEffects();
        },
        
        // 更新死亡效果
        updateDeathEffects() {
            const avatar = document.querySelector('.player-avatar');
            const avatarPlaceholder = document.querySelector('.avatar-placeholder');
            
            if (gameState.isDead) {
                // 死亡狀態：添加黑白效果
                if (avatar) avatar.classList.add('dead');
                if (avatarPlaceholder) avatarPlaceholder.classList.add('dead');
                
                // 顯示倒數計時（在大頭貝下方）
                this.showReviveCountdown();
            } else {
                // 活著狀態：移除黑白效果
                if (avatar) avatar.classList.remove('dead');
                if (avatarPlaceholder) avatarPlaceholder.classList.remove('dead');
                
                // 隱藏倒數計時
                this.hideReviveCountdown();
            }
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

        // SP 優先扣血機制 - 扣 HP 時會先扣 SP
        damageHP(amount) {
            if (amount <= 0) return; // 只處理傷害（正數）
            if (gameState.isDead) return; // 已死亡時不再受傷
            
            const totalDamage = Math.round(amount);
            let remainingDamage = totalDamage;
            
            // 先扣 SP
            if (gameState.sp > 0) {
                const spDamage = Math.min(remainingDamage, gameState.sp);
                this.setSP(gameState.sp - spDamage);
                remainingDamage -= spDamage;
                console.log(`SP 承受傷害: ${spDamage}, 剩餘傷害: ${remainingDamage}`);
            }
            
            // 如果還有剩餘傷害，扣 HP
            if (remainingDamage > 0) {
                const newHP = Math.max(0, gameState.hp - remainingDamage);
                this.setHP(newHP);
                console.log(`HP 承受傷害: ${remainingDamage}, 當前 HP: ${newHP}`);
                
                // 檢查是否死亡
                if (newHP <= 0) {
                    this.triggerDeath();
                }
            }
        },

        // 增減 HP（原有功能，用於回復等正面效果）
        changeHP(delta) {
            if (gameState.isDead && delta > 0) return; // 死亡時不能回復
            if (delta < 0) {
                // 負數傷害使用 SP 優先扣血機制
                this.damageHP(-delta);
            } else {
                // 正數直接加血
                this.setHP(gameState.hp + delta);
            }
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
            if (!this.canDeductGold()) {
                console.log('死亡狀態下無法扣除金幣');
                return false; // 死亡時不能扣金幣
            }
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
        },

        // 觸發死亡
        triggerDeath() {
            if (gameState.isDead) return; // 已經死亡
            
            console.log('玩家死亡！開始復活倒數...');
            gameState.isDead = true;
            gameState.isReviving = true;
            gameState.reviveCountdown = GAME_CONFIG.reviveSettings.countdownSeconds;
            
            this.updateUI();
            this.saveState();
            
            // 開始復活倒數
            this.startReviveCountdown();
        },

        // 開始復活倒數
        startReviveCountdown() {
            const countdownInterval = setInterval(() => {
                gameState.reviveCountdown--;
                
                // 更新倒數顯示
                this.updateReviveCountdownDisplay();
                
                if (gameState.reviveCountdown <= 0) {
                    clearInterval(countdownInterval);
                    this.revivePlayer();
                }
            }, 1000);
        },

        // 復活玩家
        revivePlayer() {
            console.log('玩家復活！');
            
            const reviveHP = Math.floor(GAME_CONFIG.maxValues.hp * GAME_CONFIG.reviveSettings.reviveHPPercent);
            const reviveSP = Math.floor(GAME_CONFIG.maxValues.sp * GAME_CONFIG.reviveSettings.reviveSPPercent);
            
            gameState.hp = reviveHP;
            gameState.sp = reviveSP;
            gameState.isDead = false;
            gameState.isReviving = false;
            gameState.reviveCountdown = 0;
            
            this.updateUI();
            this.saveState();
            
            // 隱藏復活倒數顯示
            this.hideReviveCountdown();
            
            console.log(`玩家復活完成 - HP: ${reviveHP}, SP: ${reviveSP}`);
        },

        // 顯示復活倒數計時（在大頭貝正下方）
        showReviveCountdown() {
            const avatarFrame = document.querySelector('.avatar-frame');
            if (!avatarFrame) return;
            
            let countdownElement = document.getElementById('player-revive-countdown');
            if (!countdownElement) {
                countdownElement = document.createElement('div');
                countdownElement.id = 'player-revive-countdown';
                countdownElement.style.cssText = `
                    position: absolute;
                    top: 100%;
                    left: 50%;
                    transform: translateX(-50%);
                    background: rgba(0, 0, 0, 0.9);
                    color: #ff4444;
                    padding: 4px 8px;
                    border-radius: 4px;
                    text-align: center;
                    font-family: monospace;
                    font-weight: bold;
                    font-size: 0.75rem;
                    margin-top: 4px;
                    border: 1px solid #ff4444;
                    white-space: nowrap;
                    z-index: 100;
                    min-width: 40px;
                    animation: pulse 1s infinite;
                `;
                
                // 設置父容器為相對定位
                avatarFrame.style.position = 'relative';
                
                // 插入到大頭貝框架內部
                avatarFrame.appendChild(countdownElement);
            }
            
            // 更新倒數時間
            this.updateReviveCountdownDisplay();
        },
        
        // 更新復活倒數顯示
        updateReviveCountdownDisplay() {
            const countdownElement = document.getElementById('player-revive-countdown');
            if (countdownElement && gameState.isReviving) {
                const minutes = Math.floor(gameState.reviveCountdown / 60);
                const seconds = gameState.reviveCountdown % 60;
                countdownElement.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            }
        },

        // 隱藏復活倒數計時
        hideReviveCountdown() {
            const countdownElement = document.getElementById('player-revive-countdown');
            if (countdownElement) {
                countdownElement.remove();
            }
        },

        // 檢查是否在復活狀態（用於禁用金幣扣除）
        isPlayerDead() {
            return gameState.isDead;
        },

        // 檢查是否可以扣除金幣
        canDeductGold() {
            return !gameState.isDead; // 死亡時不能扣金幣
        },

        // 創建資源消耗動畫
        createResourceDamagePopup(resourceType, amount) {
            const bar = document.querySelector(`.${resourceType}-bar`);
            if (!bar) return;
            
            const popup = document.createElement('div');
            // 使用正確的 CSS 類別名稱以匹配現有樣式
            if (resourceType === 'sp') {
                popup.className = 'damage-popup stamina';
            } else if (resourceType === 'hp') {
                popup.className = 'damage-popup damage';
            } else if (resourceType === 'mp') {
                popup.className = 'damage-popup mana';
            }
            
            popup.textContent = `-${amount}`;
            popup.style.position = 'absolute'; // 使用 absolute 定位以配合現有 CSS
            popup.style.pointerEvents = 'none';
            popup.style.zIndex = '1000';
            
            // 獲取資源條的相對位置
            const rect = bar.getBoundingClientRect();
            const containerRect = document.body.getBoundingClientRect();
            
            // 設置相對於頁面的位置，加入隨機偏移
            popup.style.left = `${rect.left - containerRect.left + rect.width / 2 + (Math.random() - 0.5) * 60}px`;
            popup.style.top = `${rect.top - containerRect.top + rect.height / 2}px`;
            
            document.body.appendChild(popup);
            
            // 1.5秒後移除，與 CSS 動畫時間匹配
            setTimeout(() => {
                if (popup.parentNode) {
                    popup.remove();
                }
            }, 1500);
        },

        // 處理點擊消耗 - SP 優先機制
        handleClickDamage() {
            if (gameState.isDead) return; // 死亡時不受傷
            
            if (gameState.sp > 0) {
                // 先扣 SP：1-3 點隨機
                const spDamage = Math.floor(Math.random() * 3) + 1;
                const actualSpDamage = Math.min(spDamage, gameState.sp);
                this.setSP(gameState.sp - actualSpDamage);
                this.createResourceDamagePopup('sp', actualSpDamage);
                console.log(`點擊消耗 SP: ${actualSpDamage}`);
                return 'sp';
            } else {
                // SP 用盡後扣 HP：1-10 點隨機，有爆擊機制
                let hpDamage = Math.floor(Math.random() * 10) + 1; // 基礎 1-10
                let isCritical = false;
                
                // 10% 機率爆擊，傷害翻倍
                if (Math.random() < 0.1) {
                    hpDamage *= 2;
                    isCritical = true;
                    console.log(`💥 爆擊！HP 傷害翻倍: ${hpDamage}`);
                }
                
                const newHP = Math.max(0, gameState.hp - hpDamage);
                this.setHP(newHP);
                
                // 爆擊時使用特殊動畫效果
                if (isCritical) {
                    this.createCriticalDamagePopup('hp', hpDamage);
                } else {
                    this.createResourceDamagePopup('hp', hpDamage);
                }
                
                console.log(`點擊消耗 HP: ${hpDamage}${isCritical ? ' (爆擊)' : ''}`);
                
                // 檢查是否死亡
                if (newHP <= 0) {
                    this.triggerDeath();
                }
                return 'hp';
            }
        },
        
        // 創建爆擊傷害彈出效果
        createCriticalDamagePopup(type, amount) {
            const bar = document.querySelector(`.${type}-bar`);
            if (!bar) return;
            
            const popup = document.createElement('div');
            popup.className = 'damage-popup damage';
            popup.textContent = `爆擊! -${amount}`;
            popup.style.position = 'absolute';
            popup.style.pointerEvents = 'none';
            popup.style.zIndex = '1000';
            popup.style.fontSize = '1.8rem'; // 更大字體
            popup.style.fontWeight = 'bold';
            popup.style.color = '#ff0000';
            popup.style.textShadow = '0 0 10px #ff0000, 0 0 20px #ff0000';
            
            // 獲取資源條位置
            const rect = bar.getBoundingClientRect();
            const containerRect = document.body.getBoundingClientRect();
            
            // 爆擊效果位置偏移更大
            popup.style.left = `${rect.left - containerRect.left + rect.width / 2 + (Math.random() - 0.5) * 100}px`;
            popup.style.top = `${rect.top - containerRect.top + rect.height / 2}px`;
            
            document.body.appendChild(popup);
            
            // 爆擊動畫持續更久
            setTimeout(() => {
                if (popup.parentNode) {
                    popup.remove();
                }
            }, 2000);
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
    
    // 啟動資源自然回復系統
    let regenTimer = null;
    
    function startResourceRegeneration() {
        if (regenTimer) clearInterval(regenTimer);
        
        regenTimer = setInterval(() => {
            const state = GameStateManager.getState();
            
            // HP 自然回復（只有在非死亡狀態且低於最大值時）
            if (!state.isDead && state.hp > 0 && state.hp < GAME_CONFIG.maxValues.hp) {
                GameStateManager.changeHP(3); // 每5秒回復3點HP
            }
            
            // MP 自然回復（死亡狀態下不回復）
            if (!state.isDead && state.mp < GAME_CONFIG.maxValues.mp) {
                GameStateManager.changeMP(1.5); // 每5秒回復1.5點MP
            }
            
            // SP 少量自然回復（死亡狀態下不回復）
            if (!state.isDead && state.sp < GAME_CONFIG.maxValues.sp) {
                GameStateManager.changeSP(3); // 每5秒回復3點SP
            }
        }, 5000); // 每5秒執行一次
        
        console.log('資源自然回復系統已啟動');
    }
    
    // 頁面卸載時清理定時器
    window.addEventListener('beforeunload', () => {
        if (regenTimer) clearInterval(regenTimer);
    });
    
    // DOM 載入完成後更新 UI 並啟動回復系統
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            GameStateManager.updateUI();
            startResourceRegeneration();
        });
    } else {
        // 如果 DOM 已經載入完成，立即更新 UI 並啟動回復系統
        GameStateManager.updateUI();
        startResourceRegeneration();
    }

    console.log('遊戲狀態管理系統已載入');

})();