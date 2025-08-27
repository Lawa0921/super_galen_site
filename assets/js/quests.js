// 任務系統互動效果
(function() {
    'use strict';
    
    // 任務系統狀態
    let questsInitialized = false;
    
    // 初始化任務系統
    function initQuestSystem() {
        if (questsInitialized) return;
        
        // 綁定任務點擊事件
        bindQuestClickEvents();
        
        // 綁定任務 hover 效果
        bindQuestHoverEffects();
        
        // 初始化任務進度動畫
        initProgressAnimations();
        
        // 添加任務完成特效
        initQuestCompletionEffects();
        
        // 添加看板裝飾動畫
        initBoardDecorations();
        
        questsInitialized = true;
        console.log('🎯 任務系統初始化完成');
    }
    
    // 綁定任務點擊事件
    function bindQuestClickEvents() {
        const questItems = document.querySelectorAll('.quest-item');
        
        questItems.forEach(quest => {
            quest.addEventListener('click', function(e) {
                e.preventDefault();
                
                // 如果是已完成任務，播放完成提示
                if (this.classList.contains('completed')) {
                    showQuestCompletedMessage(this);
                    return; // 已完成任務不給金幣
                }
                
                // 觸發金幣增加（如果金幣系統存在）
                if (typeof addGold === 'function') {
                    addGold(Math.floor(Math.random() * 5) + 1);
                }
                
                // 移除波紋效果以避免佈局問題
            });
        });
    }
    
    // 綁定任務 hover 效果
    function bindQuestHoverEffects() {
        const questItems = document.querySelectorAll('.quest-item');
        
        questItems.forEach(quest => {
            quest.addEventListener('mouseenter', function() {
                // 播放 hover 音效（模擬）
                playQuestHoverSound();
                
                // 顯示額外資訊
                showQuestPreview(this);
                
                // 高亮相關任務
                highlightRelatedQuests(this);
            });
            
            quest.addEventListener('mouseleave', function() {
                // 隱藏預覽
                hideQuestPreview();
                
                // 取消高亮
                removeQuestHighlights();
            });
        });
    }
    
    // 初始化進度條動畫
    function initProgressAnimations() {
        const progressBars = document.querySelectorAll('.progress-bar');
        
        // 使用 Intersection Observer 來觸發動畫
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    animateProgressBar(entry.target);
                }
            });
        }, { threshold: 0.5 });
        
        progressBars.forEach(bar => {
            observer.observe(bar);
            
            // 初始設置寬度為 0
            const targetWidth = bar.style.width;
            bar.style.width = '0%';
            bar.dataset.targetWidth = targetWidth;
        });
    }
    
    // 動畫進度條
    function animateProgressBar(progressBar) {
        const targetWidth = progressBar.dataset.targetWidth;
        if (!targetWidth) return;
        
        // 延遲執行動畫
        setTimeout(() => {
            progressBar.style.transition = 'width 1.5s cubic-bezier(0.4, 0, 0.2, 1)';
            progressBar.style.width = targetWidth;
            
            // 添加進度增加特效
            const currentPercent = parseInt(targetWidth);
            if (currentPercent > 80) {
                // 高進度時添加特殊效果
                progressBar.style.animation = 'progressGlow 2s ease-in-out infinite';
            }
        }, Math.random() * 500 + 200);
    }
    
    // 任務完成特效
    function initQuestCompletionEffects() {
        const completedQuests = document.querySelectorAll('.quest-item.completed');
        
        completedQuests.forEach(quest => {
            // 為已完成任務添加特殊樣式
            addCompletionParticles(quest);
        });
    }
    
    
    
    
    
    // 顯示已完成任務訊息
    function showQuestCompletedMessage(questElement) {
        const title = questElement.querySelector('.quest-title').textContent;
        
        // 創建訊息氣泡
        const bubble = document.createElement('div');
        bubble.className = 'quest-completed-bubble';
        bubble.textContent = `${title} - 已完成！`;
        bubble.style.position = 'fixed';
        bubble.style.top = '50%';
        bubble.style.left = '50%';
        bubble.style.transform = 'translate(-50%, -50%)';
        bubble.style.background = 'linear-gradient(135deg, #32CD32, #228B22)';
        bubble.style.color = 'white';
        bubble.style.padding = '1rem 2rem';
        bubble.style.borderRadius = '12px';
        bubble.style.fontSize = '1.2rem';
        bubble.style.fontWeight = 'bold';
        bubble.style.textShadow = '1px 1px 2px rgba(0, 0, 0, 0.8)';
        bubble.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.4)';
        bubble.style.zIndex = '2000';
        bubble.style.animation = 'completedBubble 3s ease-out forwards';
        
        document.body.appendChild(bubble);
        
        setTimeout(() => {
            if (bubble.parentNode) {
                bubble.remove();
            }
        }, 3000);
    }
    
    
    
    // 播放 hover 音效（模擬）
    function playQuestHoverSound() {
        // 這裡可以添加實際的音效播放邏輯
        console.log('🔊 任務 hover 音效');
    }
    
    // 顯示任務預覽
    function showQuestPreview(questElement) {
        // 添加預覽效果的邏輯
        questElement.style.zIndex = '10';
    }
    
    // 隱藏任務預覽
    function hideQuestPreview() {
        const questItems = document.querySelectorAll('.quest-item');
        questItems.forEach(quest => {
            quest.style.zIndex = '';
        });
    }
    
    // 高亮相關任務
    function highlightRelatedQuests(questElement) {
        // 這裡可以添加高亮邏輯
    }
    
    // 移除任務高亮
    function removeQuestHighlights() {
        // 移除高亮效果
    }
    
    
    // 添加完成粒子效果
    function addCompletionParticles(questElement) {
        // 為已完成任務添加粒子效果
        questElement.style.position = 'relative';
    }
    
    // 初始化看板裝飾動畫
    function initBoardDecorations() {
        const boardIcons = document.querySelectorAll('.board-icon');
        
        // 為看板圖標添加交互動畫
        boardIcons.forEach(icon => {
            icon.addEventListener('mouseenter', () => {
                icon.style.animation = 'none';
                setTimeout(() => {
                    icon.style.animation = 'iconBounce 0.6s ease-out';
                }, 10);
            });
        });
    }
    
    // 當 Tab 切換到任務時初始化
    document.addEventListener('DOMContentLoaded', () => {
        // 監聽任務 Tab 的激活
        const questTab = document.querySelector('[data-tab="quests"]');
        if (questTab) {
            questTab.addEventListener('click', () => {
                setTimeout(initQuestSystem, 100);
            });
        }
        
        // 如果一開始就在任務頁面，直接初始化
        if (window.location.hash === '#quests') {
            setTimeout(initQuestSystem, 500);
        }
    });
    
    // 導出初始化函數
    window.initQuestSystem = initQuestSystem;
    
})();