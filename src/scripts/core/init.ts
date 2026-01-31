/**
 * 客戶端初始化腳本
 * 負責初始化所有遊戲系統
 */

import { initGameState, getGameState } from './gamestate';

// 初始化函數
function init(): void {
  console.log('🎮 SuperGalen Dungeon 初始化中...');

  // 1. 初始化遊戲狀態
  initGameState();
  console.log('✓ 遊戲狀態已初始化');

  // 2. 監聽遊戲事件
  setupEventListeners();
  console.log('✓ 事件監聽器已設置');

  // 3. 觸發初始化完成事件
  document.dispatchEvent(new CustomEvent('gameInitialized'));
  console.log('🏰 SuperGalen Dungeon 準備就緒！');
}

// 設置事件監聽器
function setupEventListeners(): void {
  // 玩家死亡事件
  document.addEventListener('playerDied', () => {
    console.log('💀 玩家死亡，開始復活倒數...');
  });

  // 玩家復活事件
  document.addEventListener('playerRevived', () => {
    console.log('✨ 玩家已復活！');
  });

  // 世界重置事件
  document.addEventListener('worldReset', () => {
    console.log('🌍 世界已重置');
  });

  // Tab 切換事件
  document.addEventListener('tabChanged', (e: Event) => {
    const customEvent = e as CustomEvent<{ tabId: string }>;
    console.log(`📑 切換到頁籤: ${customEvent.detail.tabId}`);
  });
}

// 等待 DOM 載入完成後初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// 匯出給其他模組使用
export { init, getGameState };
