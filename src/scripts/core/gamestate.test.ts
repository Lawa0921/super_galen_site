/**
 * 遊戲狀態管理系統單元測試
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GameStateManager, GAME_CONFIG, type GameState } from './gamestate';

// Mock document.cookie
let mockCookies: Record<string, string> = {};

// 建立測試用 DOM 元素
function createTestElements(): void {
  const ids = ['hp-fill', 'hp-text', 'mp-fill', 'mp-text', 'sp-fill', 'sp-text', 'gold-amount'];

  // 清除現有元素
  ids.forEach(id => {
    const existing = document.getElementById(id);
    if (existing) existing.remove();
  });

  // 建立新元素
  ids.forEach(id => {
    const el = document.createElement('div');
    el.id = id;
    document.body.appendChild(el);
  });
}

beforeEach(() => {
  mockCookies = {};

  // Mock document.cookie
  Object.defineProperty(document, 'cookie', {
    get: () => {
      return Object.entries(mockCookies)
        .map(([key, value]) => `${key}=${value}`)
        .join('; ');
    },
    set: (value: string) => {
      const [cookie] = value.split(';');
      const [key, val] = cookie.split('=');
      if (val === '' || value.includes('expires=Thu, 01 Jan 1970')) {
        delete mockCookies[key];
      } else {
        mockCookies[key] = val;
      }
    },
    configurable: true,
  });

  // 建立測試 DOM
  createTestElements();
});

describe('GAME_CONFIG', () => {
  it('應該有正確的預設最大值', () => {
    expect(GAME_CONFIG.maxValues.hp).toBe(1000);
    expect(GAME_CONFIG.maxValues.mp).toBe(500);
    expect(GAME_CONFIG.maxValues.sp).toBe(300);
  });

  it('應該有正確的初始值', () => {
    expect(GAME_CONFIG.initialValues.hp).toBe(1000);
    expect(GAME_CONFIG.initialValues.mp).toBe(500);
    expect(GAME_CONFIG.initialValues.sp).toBe(300);
    expect(GAME_CONFIG.initialValues.gold).toBe(100000);
  });

  it('應該有正確的復活設定', () => {
    expect(GAME_CONFIG.reviveSettings.countdownSeconds).toBe(60);
    expect(GAME_CONFIG.reviveSettings.reviveHPPercent).toBe(0.1);
    expect(GAME_CONFIG.reviveSettings.reviveSPPercent).toBe(0.1);
  });
});

describe('GameStateManager', () => {
  let manager: GameStateManager;

  beforeEach(() => {
    manager = new GameStateManager();
  });

  describe('初始化', () => {
    it('應該以預設值初始化', () => {
      manager.init();
      const state = manager.getState();

      expect(state.hp).toBe(GAME_CONFIG.initialValues.hp);
      expect(state.mp).toBe(GAME_CONFIG.initialValues.mp);
      expect(state.sp).toBe(GAME_CONFIG.initialValues.sp);
      expect(state.gold).toBe(GAME_CONFIG.initialValues.gold);
      expect(state.isDead).toBe(false);
    });

    it('應該從 Cookie 還原狀態', () => {
      // 預先設定 Cookie
      const savedState: GameState = {
        hp: 500,
        mp: 250,
        sp: 150,
        gold: 50000,
        lastVisit: new Date().toISOString(),
        isDead: false,
        reviveCountdown: 0,
        isReviving: false,
      };
      mockCookies[GAME_CONFIG.cookieName] = encodeURIComponent(JSON.stringify(savedState));

      manager.init();
      const state = manager.getState();

      expect(state.hp).toBe(500);
      expect(state.mp).toBe(250);
      expect(state.sp).toBe(150);
      expect(state.gold).toBe(50000);
    });
  });

  describe('setHP', () => {
    beforeEach(() => {
      manager.init();
    });

    it('應該正確設定 HP', () => {
      manager.setHP(500);
      expect(manager.getState().hp).toBe(500);
    });

    it('不應該超過最大 HP', () => {
      manager.setHP(9999);
      expect(manager.getState().hp).toBe(GAME_CONFIG.maxValues.hp);
    });

    it('不應該低於 0', () => {
      manager.setHP(-100);
      expect(manager.getState().hp).toBe(0);
    });

    it('HP 降到 0 時應該觸發死亡', () => {
      const diedHandler = vi.fn();
      document.addEventListener('playerDied', diedHandler);

      manager.setHP(0);

      expect(manager.getState().isDead).toBe(true);
      expect(diedHandler).toHaveBeenCalled();

      document.removeEventListener('playerDied', diedHandler);
    });
  });

  describe('setMP', () => {
    beforeEach(() => {
      manager.init();
    });

    it('應該正確設定 MP', () => {
      manager.setMP(250);
      expect(manager.getState().mp).toBe(250);
    });

    it('不應該超過最大 MP', () => {
      manager.setMP(9999);
      expect(manager.getState().mp).toBe(GAME_CONFIG.maxValues.mp);
    });
  });

  describe('setSP', () => {
    beforeEach(() => {
      manager.init();
    });

    it('應該正確設定 SP', () => {
      manager.setSP(150);
      expect(manager.getState().sp).toBe(150);
    });

    it('不應該超過最大 SP', () => {
      manager.setSP(9999);
      expect(manager.getState().sp).toBe(GAME_CONFIG.maxValues.sp);
    });
  });

  describe('Gold 管理', () => {
    beforeEach(() => {
      manager.init();
    });

    it('應該正確設定金幣', () => {
      manager.setGold(50000);
      expect(manager.getState().gold).toBe(50000);
    });

    it('應該正確增加金幣', () => {
      const initialGold = manager.getState().gold;
      manager.addGold(1000);
      expect(manager.getState().gold).toBe(initialGold + 1000);
    });

    it('金幣不應該低於 0', () => {
      manager.setGold(-100);
      expect(manager.getState().gold).toBe(0);
    });
  });

  describe('resetWorld', () => {
    beforeEach(() => {
      manager.init();
    });

    it('應該重置所有狀態', () => {
      // 先修改狀態
      manager.setHP(100);
      manager.setMP(50);
      manager.setSP(25);
      manager.setGold(0);

      // 重置
      manager.resetWorld();
      const state = manager.getState();

      expect(state.hp).toBe(GAME_CONFIG.initialValues.hp);
      expect(state.mp).toBe(GAME_CONFIG.initialValues.mp);
      expect(state.sp).toBe(GAME_CONFIG.initialValues.sp);
      expect(state.gold).toBe(GAME_CONFIG.initialValues.gold);
      expect(state.isDead).toBe(false);
    });
  });

  describe('restoreAll', () => {
    beforeEach(() => {
      manager.init();
    });

    it('應該恢復所有狀態到最大值', () => {
      manager.setHP(100);
      manager.setMP(50);
      manager.setSP(25);

      manager.restoreAll();
      const state = manager.getState();

      expect(state.hp).toBe(GAME_CONFIG.maxValues.hp);
      expect(state.mp).toBe(GAME_CONFIG.maxValues.mp);
      expect(state.sp).toBe(GAME_CONFIG.maxValues.sp);
    });
  });

  describe('UI 更新', () => {
    beforeEach(() => {
      manager.init();
    });

    it('應該更新 HP 顯示', () => {
      manager.setHP(500);

      const hpFill = document.getElementById('hp-fill');
      const hpText = document.getElementById('hp-text');

      expect(hpFill?.style.width).toBe('50%');
      expect(hpText?.textContent).toBe('500/1000');
    });

    it('應該更新金幣顯示', () => {
      manager.setGold(12345);

      const goldEl = document.getElementById('gold-amount');
      expect(goldEl?.textContent).toBe('12,345');
    });
  });
});
