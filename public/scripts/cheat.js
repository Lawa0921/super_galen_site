// 金手指功能實現
(function() {
    let clickCount = 0;
    let clickTimer = null;
    const CLICK_TIMEOUT = 2000; // 2秒內要完成5次點擊
    const REQUIRED_CLICKS = 5;

    // 等待DOM加載完成
    document.addEventListener('DOMContentLoaded', function() {
        initCheatSystem();
    });

    function initCheatSystem() {
        const playerAvatar = document.querySelector('.player-avatar');

        if (!playerAvatar) {
            console.warn('找不到玩家大頭貼元素');
            return;
        }

        // 大頭貼連續點擊檢測
        playerAvatar.addEventListener('click', function(e) {
            e.preventDefault();
            clickCount++;
            
            // 重置定時器
            if (clickTimer) {
                clearTimeout(clickTimer);
            }
            
            // 設置新的定時器
            clickTimer = setTimeout(() => {
                clickCount = 0;
            }, CLICK_TIMEOUT);

            // 檢查是否達到5次點擊
            if (clickCount >= REQUIRED_CLICKS) {
                clickCount = 0;
                if (clickTimer) {
                    clearTimeout(clickTimer);
                }
                showCheatModal();
            }
        });

        // ESC鍵關閉
        document.addEventListener('keydown', function(e) {
            const cheatModal = document.getElementById('cheat-modal');
            if (e.key === 'Escape' && cheatModal && cheatModal.classList.contains('show')) {
                hideCheatModal();
            }
        });
    }

    let eventsAlreadyBound = false;

    function bindCheatModalEvents() {
        // 防止重複綁定事件
        if (eventsAlreadyBound) {
            return;
        }

        const cheatModal = document.getElementById('cheat-modal');
        const cheatClose = document.getElementById('cheat-close');
        const resetWorldBtn = document.getElementById('reset-world');
        const addGoldBtn = document.getElementById('add-gold');
        const restoreStatusBtn = document.getElementById('restore-status');
        const goldInput = document.getElementById('gold-input');

        // 彈窗關閉事件
        if (cheatClose) {
            cheatClose.addEventListener('click', hideCheatModal);
        }

        // 點擊背景關閉
        if (cheatModal) {
            cheatModal.addEventListener('click', function(e) {
                if (e.target === cheatModal) {
                    hideCheatModal();
                }
            });
        }

        // 金手指功能按鈕
        if (resetWorldBtn) {
            resetWorldBtn.addEventListener('click', resetWorld);
            console.log('重置世界按鈕事件已綁定');
        }

        if (addGoldBtn) {
            addGoldBtn.addEventListener('click', addGold);
            console.log('增加金幣按鈕事件已綁定');
        }

        if (restoreStatusBtn) {
            restoreStatusBtn.addEventListener('click', restoreStatus);
            console.log('回滿狀態按鈕事件已綁定');
        }

        // 回車鍵快捷添加金幣
        if (goldInput) {
            goldInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    addGold();
                }
            });
        }

        eventsAlreadyBound = true;
        console.log('金手指事件綁定完成');
    }

    function showCheatModal() {
        const cheatModal = document.getElementById('cheat-modal');
        if (cheatModal) {
            cheatModal.classList.add('show');
            
            // 綁定金手指功能事件
            bindCheatModalEvents();
            
            // 播放音效（如果有的話）
            playCheatSound();
            
            // 聚焦到金幣輸入框
            setTimeout(() => {
                const goldInput = document.getElementById('gold-input');
                if (goldInput) {
                    goldInput.focus();
                }
            }, 300);
        }
    }

    function hideCheatModal() {
        const cheatModal = document.getElementById('cheat-modal');
        if (cheatModal) {
            cheatModal.classList.remove('show');
        }
    }

    function resetWorld() {
        // 防止意外觸發的安全檢查
        if (sessionStorage.getItem('isResetting') === 'true') {
            console.warn('重置已在進行中，忽略重複調用');
            return;
        }

        // 確保這是用戶主動觸發的行為
        console.log('resetWorld 被調用，執行安全檢查...');

        const shouldReset = window.showConfirm ?
            window.showConfirm('js.alerts.reset_world_confirm') :
            confirm('⚠️ 警告：這將刪除所有進度和數據，重置為全新狀態。\n\n確定要殺死這個平行世界的蓋倫嗎？');

        if (shouldReset) {
            // 標記重置開始
            sessionStorage.setItem('isResetting', 'true');
            try {
                console.log('🗑️ 開始重置平行世界...');

                // 先清除所有存儲數據
                // 清除所有 localStorage 數據
                const keysToRemove = [
                    'SuperGalenGameState',
                    'playerStats',
                    'gameState', 
                    'playerGold',
                    'playerExperience',
                    'playerLevel',
                    'obtainedCompanions',
                    'summonHistory',
                    'questProgress',
                    'achievements',
                    'settings',
                    'inventoryItems',
                    'completedQuests',
                    'unlockedAchievements'
                ];

                keysToRemove.forEach(key => {
                    if (localStorage.getItem(key)) {
                        localStorage.removeItem(key);
                        console.log(`清除 localStorage: ${key}`);
                    }
                });

                // 清除所有 localStorage（徹底清除）
                localStorage.clear();
                console.log('localStorage 已完全清除');

                // 清除 sessionStorage
                sessionStorage.clear();
                console.log('sessionStorage 已清除');

                // 清除所有 cookies
                const cookies = document.cookie.split(";");
                cookies.forEach(function(cookie) {
                    const eqPos = cookie.indexOf("=");
                    const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
                    if (name) {
                        // 清除不同路徑的 cookie
                        document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
                        document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=" + window.location.hostname;
                        document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=." + window.location.hostname;
                        console.log(`清除 cookie: ${name}`);
                    }
                });

                // 使用 GameState 重置到初始狀態
                if (typeof window.GameState !== 'undefined') {
                    // 先清除保存的狀態
                    window.GameState.clearSavedState();
                    console.log('GameState.clearSavedState() 已調用');
                    
                    // 手動設置初始值（如果 reset 方法有問題的話）
                    try {
                        // 設置到初始狀態
                        window.GameState.setHP(1000);
                        window.GameState.setMP(500); 
                        window.GameState.setSP(300);
                        window.GameState.setGold(100000);
                        console.log('遊戲狀態已重置為初始值: HP=1000, MP=500, SP=300, Gold=100000');
                    } catch (error) {
                        console.log('手動設置初始值時發生錯誤:', error);
                    }
                } else if (typeof window.GameStateManager !== 'undefined') {
                    window.GameStateManager.clearSavedState();
                    console.log('GameStateManager.clearSavedState() 已調用');
                }

                // 嘗試清除 IndexedDB
                if (window.indexedDB) {
                    try {
                        window.indexedDB.deleteDatabase('SuperGalenGame');
                        console.log('IndexedDB 清除嘗試完成');
                    } catch (e) {
                        console.log('IndexedDB 清除失敗，但這是正常的');
                    }
                }

                // 清除緩存
                if ('caches' in window) {
                    caches.keys().then(names => {
                        names.forEach(name => {
                            caches.delete(name);
                        });
                        console.log('瀏覽器緩存已清除');
                    });
                }

                console.log('🗑️ 所有數據清除完成');
                if (window.showAlert) {
                    window.showAlert('js.alerts.reset_world_success');
                } else {
                    alert('💀 平行世界已重置！頁面將重新載入...');
                }
                
                // 延遲重新載入頁面
                setTimeout(() => {
                    console.log('🔄 準備重新載入頁面...');
                    // 再次確認不在重載循環中
                    if (sessionStorage.getItem('isResetting') === 'true') {
                        // 清除重置標記，避免卡在重置狀態
                        sessionStorage.removeItem('isResetting');
                        // 強制重新載入頁面（保持 URL 乾淨）
                        window.location.reload(true);
                    }
                }, 1500);

            } catch (error) {
                console.error('重置世界時發生錯誤:', error);
                // 清除重置標記，避免卡在重置狀態
                sessionStorage.removeItem('isResetting');
                if (window.showAlert) {
                    window.showAlert('js.alerts.reset_world_failed', { error: error.message });
                } else {
                    alert('❌ 重置失敗：' + error.message);
                }
            }
        } else {
            // 如果用戶取消重置，也要清除標記
            sessionStorage.removeItem('isResetting');
        }
    }

    function addGold() {
        const goldInput = document.getElementById('gold-input');
        
        if (!goldInput) {
            if (window.showAlert) {
                window.showAlert('js.alerts.invalid_gold_amount');
            } else {
                alert('❌ 找不到金幣輸入框');
            }
            return;
        }

        const inputValue = parseInt(goldInput.value);
        
        if (isNaN(inputValue) || inputValue <= 0) {
            if (window.showAlert) {
                window.showAlert('js.alerts.invalid_gold_amount');
            } else {
                alert('❌ 請輸入有效的金幣數量');
            }
            return;
        }

        try {
            // 使用遊戲狀態管理系統增加金幣
            if (typeof window.GameState !== 'undefined') {
                window.GameState.changeGold(inputValue);
            } else if (typeof window.GameStateManager !== 'undefined') {
                window.GameStateManager.changeGold(inputValue);
            } else if (typeof window.addGold === 'function') {
                window.addGold(inputValue);
            } else {
                // 備用方案：直接操作顯示和存儲
                const goldAmount = document.getElementById('gold-amount');
                if (goldAmount) {
                    const currentGold = parseInt(goldAmount.textContent.replace(/,/g, '')) || 0;
                    const newGold = currentGold + inputValue;
                    goldAmount.textContent = newGold.toLocaleString();
                    localStorage.setItem('playerGold', newGold.toString());
                }
            }
            
            // 清空輸入框
            goldInput.value = '';
            
            // 顯示成功消息
            showSuccessMessage(`💰 成功增加 ${inputValue.toLocaleString()} 金幣！`);
            
            // 觸發金幣動畫效果
            animateGoldIncrease();

        } catch (error) {
            console.error('增加金幣時發生錯誤:', error);
            if (window.showAlert) {
                window.showAlert('js.alerts.add_gold_failed');
            } else {
                alert('❌ 增加金幣失敗');
            }
        }
    }

    function restoreStatus() {
        try {
            // 使用遊戲狀態管理系統恢復狀態
            if (typeof window.GameState !== 'undefined') {
                // 恢復到最大值
                window.GameState.setHP(1000);
                window.GameState.setMP(500);
                window.GameState.setSP(300);
                
                // 如果處於死亡狀態，復活玩家
                const state = window.GameState.getState();
                if (state.isDead) {
                    // 復活玩家
                    window.GameState.revivePlayer();
                }
                
                // 更新 UI
                window.GameState.updateUI();
            } else if (typeof window.GameStateManager !== 'undefined') {
                // 恢復到最大值
                window.GameStateManager.setHP(1000);
                window.GameStateManager.setMP(500);
                window.GameStateManager.setSP(300);
                
                // 如果處於死亡狀態，復活玩家
                const state = window.GameStateManager.getState();
                if (state.isDead) {
                    // 直接設置狀態為存活
                    window.GameStateManager.gameState.isDead = false;
                    window.GameStateManager.gameState.isReviving = false;
                    window.GameStateManager.gameState.reviveCountdown = 0;
                    
                    // 移除死亡相關的UI效果
                    const playerAvatar = document.querySelector('.player-avatar');
                    if (playerAvatar) {
                        playerAvatar.classList.remove('dead');
                    }
                    
                    // 隱藏復活倒數
                    const reviveCountdown = document.querySelector('.revive-countdown');
                    if (reviveCountdown) {
                        reviveCountdown.remove();
                    }
                    
                    // 保存狀態
                    window.GameStateManager.saveState();
                }
            } else {
                // 備用方案：直接操作UI和存儲
                const hpFill = document.querySelector('.hp-fill');
                const hpText = document.querySelector('.hp-text');
                if (hpFill && hpText) {
                    hpFill.style.width = '100%';
                    hpText.textContent = '1000/1000';
                }

                const mpFill = document.querySelector('.mp-fill');
                const mpText = document.querySelector('.mp-text');
                if (mpFill && mpText) {
                    mpFill.style.width = '100%';
                    mpText.textContent = '500/500';
                }

                const spFill = document.querySelector('.sp-fill');
                const spText = document.querySelector('.sp-text');
                if (spFill && spText) {
                    spFill.style.width = '100%';
                    spText.textContent = '300/300';
                }

                // 保存狀態
                const playerStats = {
                    hp: { current: 1000, max: 1000 },
                    mp: { current: 500, max: 500 },
                    sp: { current: 300, max: 300 }
                };
                localStorage.setItem('playerStats', JSON.stringify(playerStats));

                // 移除死亡狀態
                const playerAvatar = document.querySelector('.player-avatar');
                if (playerAvatar) {
                    playerAvatar.classList.remove('dead');
                }
            }

            showSuccessMessage('⚡ 狀態已完全恢復！');

        } catch (error) {
            console.error('恢復狀態時發生錯誤:', error);
            if (window.showAlert) {
                window.showAlert('js.alerts.restore_status_failed');
            } else {
                alert('❌ 恢復狀態失敗');
            }
        }
    }

    function showSuccessMessage(message) {
        // 創建成功提示元素
        const successMsg = document.createElement('div');
        successMsg.textContent = message;
        successMsg.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, #4ecdc4 0%, #26a69a 100%);
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 8px;
            box-shadow: 0 4px 15px rgba(78, 205, 196, 0.3);
            z-index: 10000;
            font-weight: bold;
            animation: slideInRight 0.3s ease-out;
        `;

        document.body.appendChild(successMsg);

        // 3秒後移除
        setTimeout(() => {
            successMsg.style.animation = 'slideOutRight 0.3s ease-in';
            setTimeout(() => {
                if (successMsg.parentNode) {
                    successMsg.parentNode.removeChild(successMsg);
                }
            }, 300);
        }, 3000);
    }

    function animateGoldIncrease() {
        const goldAmount = document.getElementById('gold-amount');
        if (goldAmount) {
            goldAmount.style.animation = 'goldPulse 0.5s ease-out';
            setTimeout(() => {
                goldAmount.style.animation = '';
            }, 500);
        }
    }

    function playCheatSound() {
        // 如果有音效系統，可以在這裡播放金手指啟動音效
        // 目前先用控制台提示
        console.log('🎮 金手指模式啟動！');
    }

    // 添加必要的CSS動畫到頁面
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideInRight {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOutRight {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(100%); opacity: 0; }
        }
        @keyframes goldPulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.2); color: #ffd700; }
        }
    `;
    document.head.appendChild(style);

})();