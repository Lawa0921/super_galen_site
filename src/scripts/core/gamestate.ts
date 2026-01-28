/**
 * 遊戲狀態管理系統
 * 管理玩家的 HP/MP/SP/Gold 等狀態，並持久化到 Cookie
 */

// 遊戲配置
export const GAME_CONFIG = {
  maxValues: {
    hp: 1000,
    mp: 500,
    sp: 300,
  },
  initialValues: {
    hp: 1000,
    mp: 500,
    sp: 300,
    gold: 100000,
  },
  cookieName: 'SuperGalenGameState',
  cookieExpireDays: 365,
  reviveSettings: {
    countdownSeconds: 60,
    reviveHPPercent: 0.1,
    reviveSPPercent: 0.1,
  },
} as const;

// 遊戲狀態介面
export interface GameState {
  hp: number;
  mp: number;
  sp: number;
  gold: number;
  lastVisit: string;
  isDead: boolean;
  reviveCountdown: number;
  isReviving: boolean;
}

// Cookie 管理工具
const CookieManager = {
  set(name: string, value: unknown, days: number): void {
    const expires = new Date();
    expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
    document.cookie = `${name}=${encodeURIComponent(JSON.stringify(value))};expires=${expires.toUTCString()};path=/;SameSite=Lax`;
  },

  get<T>(name: string): T | null {
    const nameEQ = name + '=';
    const ca = document.cookie.split(';');

    for (const c of ca) {
      const trimmed = c.trim();
      if (trimmed.indexOf(nameEQ) === 0) {
        try {
          const value = trimmed.substring(nameEQ.length);
          return JSON.parse(decodeURIComponent(value)) as T;
        } catch (e) {
          console.warn('無法解析 Cookie:', e);
          return null;
        }
      }
    }
    return null;
  },

  delete(name: string): void {
    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;`;
  },
};

// 遊戲狀態管理器類
export class GameStateManager {
  private state: GameState;
  private reviveTimer: number | null = null;

  constructor() {
    this.state = this.createInitialState();
  }

  private createInitialState(): GameState {
    return {
      hp: GAME_CONFIG.initialValues.hp,
      mp: GAME_CONFIG.initialValues.mp,
      sp: GAME_CONFIG.initialValues.sp,
      gold: GAME_CONFIG.initialValues.gold,
      lastVisit: new Date().toISOString(),
      isDead: false,
      reviveCountdown: 0,
      isReviving: false,
    };
  }

  // 驗證狀態資料
  private validateState(state: unknown): state is GameState {
    if (!state || typeof state !== 'object') return false;
    const s = state as Record<string, unknown>;
    return (
      typeof s.hp === 'number' &&
      typeof s.mp === 'number' &&
      typeof s.sp === 'number' &&
      typeof s.gold === 'number'
    );
  }

  // 初始化狀態
  init(): void {
    const savedState = CookieManager.get<GameState>(GAME_CONFIG.cookieName);

    if (savedState && this.validateState(savedState)) {
      this.state = { ...this.state, ...savedState };
    } else {
      this.saveState();
    }

    this.updateUI();

    // 如果處於死亡狀態，重新啟動倒數
    if (this.state.isDead && this.state.isReviving && this.state.reviveCountdown > 0) {
      this.startReviveCountdown();
    }

    // 觸發初始化完成事件
    document.dispatchEvent(new CustomEvent('gameStateInitialized', { detail: this.state }));
  }

  // 保存狀態到 Cookie
  saveState(): void {
    this.state.lastVisit = new Date().toISOString();
    CookieManager.set(GAME_CONFIG.cookieName, this.state, GAME_CONFIG.cookieExpireDays);
  }

  // 取得當前狀態
  getState(): Readonly<GameState> {
    return { ...this.state };
  }

  // 設定 HP
  setHP(value: number): void {
    const maxHP = GAME_CONFIG.maxValues.hp;
    this.state.hp = Math.max(0, Math.min(value, maxHP));

    if (this.state.hp <= 0 && !this.state.isDead) {
      this.die();
    }

    this.saveState();
    this.updateUI();
  }

  // 設定 MP
  setMP(value: number): void {
    const maxMP = GAME_CONFIG.maxValues.mp;
    this.state.mp = Math.max(0, Math.min(value, maxMP));
    this.saveState();
    this.updateUI();
  }

  // 設定 SP
  setSP(value: number): void {
    const maxSP = GAME_CONFIG.maxValues.sp;
    this.state.sp = Math.max(0, Math.min(value, maxSP));
    this.saveState();
    this.updateUI();
  }

  // 設定金幣
  setGold(value: number): void {
    this.state.gold = Math.max(0, value);
    this.saveState();
    this.updateUI();
  }

  // 增加金幣
  addGold(amount: number): void {
    this.setGold(this.state.gold + amount);
  }

  // 死亡處理
  private die(): void {
    this.state.isDead = true;
    this.state.hp = 0;
    this.state.reviveCountdown = GAME_CONFIG.reviveSettings.countdownSeconds;
    this.state.isReviving = true;
    this.saveState();
    this.startReviveCountdown();

    document.dispatchEvent(new CustomEvent('playerDied'));
  }

  // 開始復活倒數
  private startReviveCountdown(): void {
    if (this.reviveTimer) {
      clearInterval(this.reviveTimer);
    }

    this.reviveTimer = window.setInterval(() => {
      if (this.state.reviveCountdown > 0) {
        this.state.reviveCountdown--;
        this.saveState();
        this.updateReviveUI();

        if (this.state.reviveCountdown <= 0) {
          this.revive();
        }
      }
    }, 1000);
  }

  // 復活
  private revive(): void {
    if (this.reviveTimer) {
      clearInterval(this.reviveTimer);
      this.reviveTimer = null;
    }

    const { reviveHPPercent, reviveSPPercent } = GAME_CONFIG.reviveSettings;
    this.state.isDead = false;
    this.state.isReviving = false;
    this.state.reviveCountdown = 0;
    this.state.hp = Math.floor(GAME_CONFIG.maxValues.hp * reviveHPPercent);
    this.state.sp = Math.floor(GAME_CONFIG.maxValues.sp * reviveSPPercent);

    this.saveState();
    this.updateUI();

    document.dispatchEvent(new CustomEvent('playerRevived'));
  }

  // 重置世界（重置所有狀態）
  resetWorld(): void {
    if (this.reviveTimer) {
      clearInterval(this.reviveTimer);
      this.reviveTimer = null;
    }

    this.state = this.createInitialState();
    this.saveState();
    this.updateUI();

    document.dispatchEvent(new CustomEvent('worldReset'));
  }

  // 恢復所有狀態
  restoreAll(): void {
    this.state.hp = GAME_CONFIG.maxValues.hp;
    this.state.mp = GAME_CONFIG.maxValues.mp;
    this.state.sp = GAME_CONFIG.maxValues.sp;
    this.state.isDead = false;
    this.state.isReviving = false;
    this.state.reviveCountdown = 0;

    if (this.reviveTimer) {
      clearInterval(this.reviveTimer);
      this.reviveTimer = null;
    }

    this.saveState();
    this.updateUI();
  }

  // 更新 UI 顯示
  private updateUI(): void {
    const { hp, mp, sp, gold } = this.state;
    const { maxValues } = GAME_CONFIG;

    // 更新 HP 條
    this.updateBar('hp', hp, maxValues.hp);
    // 更新 MP 條
    this.updateBar('mp', mp, maxValues.mp);
    // 更新 SP 條
    this.updateBar('sp', sp, maxValues.sp);
    // 更新金幣
    this.updateGold(gold);

    // 觸發 UI 更新事件
    document.dispatchEvent(new CustomEvent('gameStateUpdated', { detail: this.state }));
  }

  private updateBar(type: 'hp' | 'mp' | 'sp', current: number, max: number): void {
    const fillEl = document.getElementById(`${type}-fill`);
    const textEl = document.getElementById(`${type}-text`);

    if (fillEl) {
      const percent = (current / max) * 100;
      fillEl.style.width = `${percent}%`;
    }

    if (textEl) {
      textEl.textContent = `${current}/${max}`;
    }
  }

  private updateGold(gold: number): void {
    const goldEl = document.getElementById('gold-amount');
    if (goldEl) {
      goldEl.textContent = gold.toLocaleString();
    }
  }

  private updateReviveUI(): void {
    // 觸發復活倒數更新事件
    document.dispatchEvent(
      new CustomEvent('reviveCountdownUpdated', {
        detail: { countdown: this.state.reviveCountdown },
      })
    );
  }
}

// 單例實例
let gameStateInstance: GameStateManager | null = null;

export function getGameState(): GameStateManager {
  if (!gameStateInstance) {
    gameStateInstance = new GameStateManager();
  }
  return gameStateInstance;
}

// 初始化函數（供組件使用）
export function initGameState(): void {
  const gs = getGameState();
  gs.init();
}

// 向後相容：暴露到全局作用域
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).GameStateManager = GameStateManager;
  (window as unknown as Record<string, unknown>).getGameState = getGameState;
  (window as unknown as Record<string, unknown>).initGameState = initGameState;
}
