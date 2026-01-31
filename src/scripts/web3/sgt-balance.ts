/**
 * SGT 餘額顯示器 - TypeScript ES Module 版本
 * 顯示用戶的 SGT 代幣餘額
 */

import { getWalletManager, type WalletState } from './wallet-manager';
import { getContractsConfig } from './contracts-config';

// SGT 餘額狀態介面
export interface SGTBalanceState {
  balance: string;
  formattedBalance: string;
  isLoading: boolean;
  error: string | null;
}

/**
 * SGT 餘額顯示器類
 */
export class SGTBalance {
  private balance: string = '0';
  private isLoading: boolean = false;
  private error: string | null = null;

  constructor() {
    console.log('🚀 [SGTBalance] 建立 SGT 餘額顯示器實例');
  }

  /**
   * 初始化
   */
  async init(): Promise<void> {
    console.log('🔧 [SGTBalance] 初始化 SGT 餘額顯示器...');

    // 等待依賴載入
    await this.waitForDependencies();

    // 設置錢包狀態監聽器
    this.setupWalletListeners();

    // 設置餘額更新事件監聯器
    this.setupBalanceUpdateListener();

    // 初始顯示
    await this.displayBalance();

    console.log('✅ [SGTBalance] SGT 餘額顯示器初始化完成');
  }

  /**
   * 等待依賴載入
   */
  private async waitForDependencies(): Promise<void> {
    const promises: Promise<void>[] = [];

    // 等待 DOM 完全載入
    if (typeof document !== 'undefined' && document.readyState !== 'complete') {
      promises.push(
        new Promise((resolve) => {
          window.addEventListener('load', () => resolve(), { once: true });
        })
      );
    }

    // 等待 ethers.js 載入
    if (typeof window !== 'undefined' && typeof (window as any).ethers === 'undefined') {
      promises.push(
        new Promise((resolve) => {
          const checkEthers = () => {
            if (typeof (window as any).ethers !== 'undefined') {
              resolve();
            } else {
              setTimeout(checkEthers, 50);
            }
          };
          checkEthers();
        })
      );
    }

    await Promise.all(promises);
  }

  /**
   * 設置錢包狀態監聽器
   */
  private setupWalletListeners(): void {
    console.log('🔗 [SGTBalance] 設置錢包狀態監聽器...');

    const wallet = getWalletManager();

    // 監聽錢包事件
    wallet.on('connect', () => this.displayBalance());
    wallet.on('disconnect', () => this.displayBalance());
    wallet.on('chainChanged', () => this.displayBalance());
    wallet.on('accountsChanged', () => this.displayBalance());

    // 監聯 DOM 事件
    document.addEventListener('wallet:connect', () => this.displayBalance());
    document.addEventListener('wallet:disconnect', () => this.displayBalance());
    document.addEventListener('wallet:chainChanged', () => this.displayBalance());

    console.log('✅ [SGTBalance] 錢包狀態監聽器設置完成');
  }

  /**
   * 設置餘額更新事件監聽器
   */
  private setupBalanceUpdateListener(): void {
    // 監聽購買完成事件
    document.addEventListener('sgtBalanceUpdated', () => {
      this.displayBalance();
    });
  }

  /**
   * 顯示餘額
   */
  async displayBalance(): Promise<void> {
    const container = document.getElementById('sgt-balance-header');
    const amountElement = document.getElementById('sgt-balance-amount');
    const switchButton = document.getElementById('switch-to-polygon-header');

    if (!container || !amountElement) {
      console.log('⚠️ [SGTBalance] SGT 餘額 DOM 元素未找到');
      return;
    }

    const wallet = getWalletManager();
    const walletState = wallet.getState();

    // 檢查錢包是否已連接
    if (!walletState.isConnected || !walletState.address) {
      console.log('👤 [SGTBalance] 錢包未連接，隱藏 SGT 餘額顯示');
      container.classList.add('hidden');
      if (switchButton) switchButton.classList.add('hidden');
      return;
    }

    const chainId = walletState.chainId;
    const userAddress = walletState.address;

    if (!chainId) {
      this.showConnectPrompt();
      return;
    }

    const contractsConfig = getContractsConfig();

    // 確認是支援的網路
    if (!contractsConfig.isChainSupported(chainId)) {
      this.showSwitchButton();
      return;
    }

    // 檢查合約是否已部署
    if (!contractsConfig.isSGTDeployed(chainId)) {
      if (chainId === 137) {
        this.showPolygonComingSoon();
      } else {
        this.showSwitchButton();
      }
      return;
    }

    try {
      this.isLoading = true;

      // 取得合約地址
      const sgtAddress = contractsConfig.getSGTAddress(chainId);
      if (!sgtAddress) {
        throw new Error('SGT 合約地址未找到');
      }

      // 創建 provider 和合約實例
      const ethers = (window as any).ethers;
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const contract = new ethers.Contract(
        sgtAddress,
        ['function balanceOf(address account) view returns (uint256)'],
        provider
      );

      // 查詢餘額
      const balance = await contract.balanceOf(userAddress);
      const balanceInEther = parseFloat(ethers.formatEther(balance));

      // 格式化顯示
      const displayBalance = this.formatBalance(balanceInEther);

      // 取得網路名稱
      let networkName = '';
      if (chainId === 31337) {
        networkName = '本地網路';
      } else if (chainId === 137) {
        networkName = 'Polygon';
      }

      // 更新 UI
      this.showBalance(displayBalance, networkName, balanceInEther);
      this.balance = balanceInEther.toString();
      this.error = null;
    } catch (error: any) {
      console.error('❌ [SGTBalance] SGT 餘額查詢失敗:', error);

      // 顯示錯誤狀態
      amountElement.textContent = '0';
      container.classList.remove('hidden');
      container.title = '查詢餘額失敗';

      if (switchButton) switchButton.classList.add('hidden');

      this.error = error.message;
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * 格式化餘額顯示
   */
  private formatBalance(balance: number): string {
    if (balance >= 1000000) {
      return (balance / 1000000).toFixed(1) + 'M';
    } else if (balance >= 1000) {
      return (balance / 1000).toFixed(1) + 'K';
    } else {
      return balance.toFixed(2);
    }
  }

  /**
   * 顯示餘額
   */
  private showBalance(balance: string, networkName: string, exactBalance: number | null = null): void {
    const container = document.getElementById('sgt-balance-header');
    const amountElement = document.getElementById('sgt-balance-amount');
    const switchButton = document.getElementById('switch-to-polygon-header');

    if (!container || !amountElement) return;

    // 顯示餘額
    amountElement.textContent = balance;
    container.classList.remove('hidden');

    // 更新 title 屬性顯示精確餘額
    if (exactBalance !== null) {
      const formattedExactBalance = exactBalance.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 6,
      });
      container.title = `${formattedExactBalance} SGT`;
    } else {
      container.title = '餘額載入中...';
    }

    // 隱藏切換按鈕
    if (switchButton) switchButton.classList.add('hidden');
  }

  /**
   * 顯示切換按鈕
   */
  private showSwitchButton(): void {
    const container = document.getElementById('sgt-balance-header');
    const switchButton = document.getElementById('switch-to-polygon-header');

    if (container) container.classList.add('hidden');

    if (switchButton) {
      switchButton.classList.remove('hidden');
      switchButton.textContent = '🔗 切換至 Polygon';
    }
  }

  /**
   * 顯示 Polygon 即將推出訊息
   */
  private showPolygonComingSoon(): void {
    const wallet = getWalletManager();
    const walletState = wallet.getState();

    if (!walletState.isConnected) {
      console.log('👤 [SGTBalance] 錢包未連接，不顯示 Polygon 即將推出訊息');
      this.showConnectPrompt();
      return;
    }

    const container = document.getElementById('sgt-balance-header');
    const amountElement = document.getElementById('sgt-balance-amount');
    const switchButton = document.getElementById('switch-to-polygon-header');

    if (!container || !amountElement) return;

    // 顯示即將推出訊息
    amountElement.textContent = '即將推出';
    container.classList.remove('hidden');
    container.title = 'Polygon 網路即將推出';

    if (switchButton) switchButton.classList.add('hidden');
  }

  /**
   * 顯示連接提示
   */
  private showConnectPrompt(): void {
    const container = document.getElementById('sgt-balance-header');
    const switchButton = document.getElementById('switch-to-polygon-header');

    if (container) container.classList.add('hidden');
    if (switchButton) switchButton.classList.add('hidden');

    console.log('👤 [SGTBalance] 錢包未連接，隱藏 SGT 餘額顯示');
  }

  /**
   * 手動刷新餘額
   */
  async refresh(): Promise<void> {
    console.log('🔄 [SGTBalance] 手動刷新 SGT 餘額...');
    await this.displayBalance();
  }

  /**
   * 取得當前狀態
   */
  getState(): SGTBalanceState {
    return {
      balance: this.balance,
      formattedBalance: this.formatBalance(parseFloat(this.balance)),
      isLoading: this.isLoading,
      error: this.error,
    };
  }
}

// 單例實例
let sgtBalanceInstance: SGTBalance | null = null;

export function getSGTBalance(): SGTBalance {
  if (!sgtBalanceInstance) {
    sgtBalanceInstance = new SGTBalance();
  }
  return sgtBalanceInstance;
}

/**
 * 初始化 SGT 餘額顯示器
 */
export async function initSGTBalance(): Promise<SGTBalance> {
  const balance = getSGTBalance();
  await balance.init();
  return balance;
}

// 向後相容：暴露到全局
if (typeof window !== 'undefined') {
  (window as any).SGTBalance = SGTBalance;
  (window as any).getSGTBalance = getSGTBalance;
  (window as any).initSGTBalance = initSGTBalance;

  // 全域刷新函數
  (window as any).refreshSimpleSGT = () => {
    getSGTBalance().refresh();
  };
}

export default getSGTBalance;
