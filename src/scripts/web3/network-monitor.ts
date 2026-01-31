/**
 * 網路監控器 - TypeScript ES Module 版本
 * 監控區塊鏈網路狀態，處理網路切換
 */

import { getWalletManager, SUPPORTED_NETWORKS, type ChainId } from './wallet-manager';

// 網路狀態介面
export interface NetworkState {
  currentChainId: string | null;
  decimalChainId: number | null;
  isNetworkSupported: boolean;
  networkName: string;
  isDev: boolean;
}

// 網路監控事件類型
export type NetworkEventType = 'networkChanged' | 'networkSupported' | 'networkUnsupported';
export type NetworkEventHandler = (state: NetworkState) => void;

/**
 * 網路監控器類
 */
export class NetworkMonitor {
  private currentChainId: string | null = null;
  private isNetworkSupported: boolean = false;
  private eventListeners: Map<NetworkEventType, Set<NetworkEventHandler>> = new Map();

  // 支援的網路配置
  private supportedNetworks = {
    137: { name: 'Polygon', symbol: 'MATIC', chainId: '0x89', rpcUrl: 'https://polygon-rpc.com' },
    31337: { name: 'Local Chain', symbol: 'ETH', chainId: '0x7a69', rpcUrl: 'http://127.0.0.1:8545' },
  } as const;

  constructor() {
    console.log('📡 [NetworkMonitor] 建立網路監控器實例');
  }

  /**
   * 啟動網路監控
   */
  async start(): Promise<void> {
    console.log('📡 [NetworkMonitor] 啟動網路監控...');

    if (typeof window === 'undefined' || !(window as any).ethereum) {
      console.log('❌ [NetworkMonitor] MetaMask 未安裝');
      this.updateUI();
      return;
    }

    const ethereum = (window as any).ethereum;

    // 設置網路變化監聽器
    ethereum.on('chainChanged', (chainId: string) => {
      console.log('🔄 [NetworkMonitor] 網路變化偵測:', chainId);
      this.handleNetworkChange(chainId);
    });

    // 初始網路檢測
    try {
      const chainId = await ethereum.request({ method: 'eth_chainId' });
      this.handleNetworkChange(chainId);
      console.log('✅ [NetworkMonitor] 網路監控已啟動');
    } catch (error) {
      console.error('❌ [NetworkMonitor] 網路檢測失敗:', error);
    }
  }

  /**
   * 處理網路變化
   */
  private handleNetworkChange(chainId: string): void {
    const oldChainId = this.currentChainId;
    this.currentChainId = chainId;
    const decimalChainId = parseInt(chainId, 16);
    this.isNetworkSupported = decimalChainId in this.supportedNetworks;

    console.log('🔄 [NetworkMonitor] 網路變化:', oldChainId, '→', chainId);

    const state = this.getState();
    this.logNetworkStatus(state);
    this.updateUI();

    // 發送事件
    this.emit('networkChanged', state);
    if (this.isNetworkSupported) {
      this.emit('networkSupported', state);
    } else {
      this.emit('networkUnsupported', state);
    }
  }

  /**
   * 記錄網路狀態
   */
  private logNetworkStatus(state: NetworkState): void {
    console.log('📊 [NetworkMonitor] 當前網路狀態:', {
      chainId: state.currentChainId,
      decimalChainId: state.decimalChainId,
      networkName: state.networkName,
      isSupported: state.isNetworkSupported,
    });
  }

  /**
   * 更新 UI 顯示
   */
  updateUI(): void {
    const switchBtnHeader = document.getElementById('switch-to-polygon-header');

    if (!switchBtnHeader) return;

    if (typeof window === 'undefined' || !(window as any).ethereum) {
      // 沒有 MetaMask 時，顯示安裝按鈕
      switchBtnHeader.classList.remove('hidden');
      switchBtnHeader.textContent = '🦊 安裝 MetaMask';
      switchBtnHeader.dataset.action = 'install-metamask';
      return;
    }

    const decimalChainId = this.currentChainId ? parseInt(this.currentChainId, 16) : null;
    const isPolygon = decimalChainId === 137;
    const isLocal = decimalChainId === 31337;
    const isSupportedNetwork = isPolygon || isLocal;

    if (isSupportedNetwork) {
      // 在支援的網路中，顯示切換到另一個網路的按鈕
      switchBtnHeader.classList.remove('hidden');
      switchBtnHeader.dataset.action = 'switch-network';

      if (isPolygon) {
        switchBtnHeader.textContent = '🏠 切換至本地鏈';
        switchBtnHeader.dataset.targetChain = '31337';
      } else if (isLocal) {
        switchBtnHeader.textContent = '🔗 切換至 Polygon';
        switchBtnHeader.dataset.targetChain = '137';
      }
    } else {
      // 不在支援的網路中
      switchBtnHeader.classList.remove('hidden');
      switchBtnHeader.dataset.action = 'switch-network';
      switchBtnHeader.textContent = '🔗 切換至 Polygon';
      switchBtnHeader.dataset.targetChain = '137';
    }
  }

  /**
   * 設置切換按鈕事件監聽器
   */
  setupSwitchButton(): void {
    const switchBtnHeader = document.getElementById('switch-to-polygon-header');
    if (!switchBtnHeader) return;

    switchBtnHeader.addEventListener('click', async () => {
      const action = switchBtnHeader.dataset.action;
      const targetChainId = parseInt(switchBtnHeader.dataset.targetChain || '0');

      // 處理安裝 MetaMask 的情況
      if (action === 'install-metamask') {
        window.open('https://metamask.io/download/', '_blank');
        return;
      }

      // 處理切換網路的情況
      if (!targetChainId) {
        console.error('❌ [NetworkMonitor] 找不到目標網路 ID');
        return;
      }

      switchBtnHeader.setAttribute('disabled', 'true');
      const originalText = switchBtnHeader.textContent || '';
      switchBtnHeader.textContent = '🔄 切換中...';

      console.log('🔄 [NetworkMonitor] 開始切換網路:', targetChainId);
      const success = await this.switchToNetwork(targetChainId);

      setTimeout(() => {
        switchBtnHeader.removeAttribute('disabled');
        if (!success) {
          switchBtnHeader.textContent = originalText;
        }
        // 成功時文字會由 updateUI 更新
      }, 1000);
    });
  }

  /**
   * 切換網路
   */
  async switchToNetwork(targetChainId: number): Promise<boolean> {
    if (typeof window === 'undefined' || !(window as any).ethereum) {
      console.error('❌ [NetworkMonitor] MetaMask 未安裝');
      return false;
    }

    const networkInfo = this.supportedNetworks[targetChainId as keyof typeof this.supportedNetworks];
    if (!networkInfo) {
      console.error('❌ [NetworkMonitor] 不支援的網路 ID:', targetChainId);
      return false;
    }

    try {
      console.log(`🔄 [NetworkMonitor] 嘗試切換到 ${networkInfo.name} 網路...`);

      await (window as any).ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: networkInfo.chainId }],
      });

      console.log(`✅ [NetworkMonitor] 成功切換到 ${networkInfo.name} 網路`);
      return true;
    } catch (error: any) {
      console.error('❌ [NetworkMonitor] 切換網路失敗:', error);

      // 如果是 Polygon 網路且網路不存在，嘗試添加
      if (error.code === 4902 && targetChainId === 137) {
        return await this.addPolygonNetwork();
      }

      // 本地鏈無法添加到 MetaMask，提示用戶手動配置
      if (targetChainId === 31337) {
        alert(
          '請確保本地 Hardhat 節點正在運行，並手動添加網路:\n' +
            'Network Name: Local Chain\n' +
            'RPC URL: http://127.0.0.1:8545\n' +
            'Chain ID: 31337\n' +
            'Currency Symbol: ETH'
        );
      }

      return false;
    }
  }

  /**
   * 添加 Polygon 網路到 MetaMask
   */
  private async addPolygonNetwork(): Promise<boolean> {
    try {
      console.log('➕ [NetworkMonitor] 嘗試添加 Polygon 網路...');

      await (window as any).ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: '0x89',
            chainName: 'Polygon Mainnet',
            nativeCurrency: {
              name: 'MATIC',
              symbol: 'MATIC',
              decimals: 18,
            },
            rpcUrls: ['https://polygon-rpc.com'],
            blockExplorerUrls: ['https://polygonscan.com'],
          },
        ],
      });

      console.log('✅ [NetworkMonitor] 成功添加並切換到 Polygon 網路');
      return true;
    } catch (error) {
      console.error('❌ [NetworkMonitor] 添加網路失敗:', error);
      return false;
    }
  }

  /**
   * 檢測是否為開發環境
   */
  isDevEnvironment(): boolean {
    return this.currentChainId === '0x7a69'; // Hardhat local
  }

  /**
   * 取得當前狀態
   */
  getState(): NetworkState {
    const decimalChainId = this.currentChainId ? parseInt(this.currentChainId, 16) : null;
    const network = decimalChainId
      ? this.supportedNetworks[decimalChainId as keyof typeof this.supportedNetworks]
      : null;

    return {
      currentChainId: this.currentChainId,
      decimalChainId,
      isNetworkSupported: this.isNetworkSupported,
      networkName: network?.name || `不支援的網路 (${this.currentChainId || 'N/A'})`,
      isDev: this.isDevEnvironment(),
    };
  }

  // 事件系統
  on(event: NetworkEventType, handler: NetworkEventHandler): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(handler);
  }

  off(event: NetworkEventType, handler: NetworkEventHandler): void {
    this.eventListeners.get(event)?.delete(handler);
  }

  private emit(event: NetworkEventType, state: NetworkState): void {
    this.eventListeners.get(event)?.forEach((handler) => {
      try {
        handler(state);
      } catch (error) {
        console.error(`[NetworkMonitor] 事件處理器錯誤 (${event}):`, error);
      }
    });

    // 同時觸發 DOM 事件
    if (typeof document !== 'undefined') {
      document.dispatchEvent(new CustomEvent(`network:${event}`, { detail: state }));
    }
  }
}

// 單例實例
let networkMonitorInstance: NetworkMonitor | null = null;

export function getNetworkMonitor(): NetworkMonitor {
  if (!networkMonitorInstance) {
    networkMonitorInstance = new NetworkMonitor();
  }
  return networkMonitorInstance;
}

/**
 * 初始化網路監控器
 */
export async function initNetworkMonitor(): Promise<NetworkMonitor> {
  const monitor = getNetworkMonitor();
  await monitor.start();
  monitor.setupSwitchButton();
  return monitor;
}

// 向後相容：暴露到全局
if (typeof window !== 'undefined') {
  (window as any).NetworkMonitor = NetworkMonitor;
  (window as any).getNetworkMonitor = getNetworkMonitor;
  (window as any).initNetworkMonitor = initNetworkMonitor;
}

export default getNetworkMonitor;
