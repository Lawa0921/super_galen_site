/**
 * 錢包管理器 - TypeScript ES Module 版本
 * 使用 ethers.js v6 實作
 */

// 支援的網路配置
export const SUPPORTED_NETWORKS = {
  31337: { name: 'Local Chain', symbol: 'ETH', rpcUrl: 'http://127.0.0.1:8545' },
  137: { name: 'Polygon', symbol: 'MATIC', rpcUrl: 'https://polygon-rpc.com' },
} as const;

export type ChainId = keyof typeof SUPPORTED_NETWORKS;

// 錢包狀態
export interface WalletState {
  isConnected: boolean;
  address: string | null;
  chainId: number | null;
  balance: string | null;
}

// 事件類型
export type WalletEventType =
  | 'connect'
  | 'disconnect'
  | 'chainChanged'
  | 'accountsChanged'
  | 'balanceUpdated';

export type WalletEventHandler = (data: unknown) => void;

// 錢包管理器類
export class WalletManager {
  private state: WalletState;
  private eventListeners: Map<WalletEventType, Set<WalletEventHandler>>;
  private provider: unknown | null = null;
  private signer: unknown | null = null;

  constructor() {
    this.state = {
      isConnected: false,
      address: null,
      chainId: null,
      balance: null,
    };
    this.eventListeners = new Map();
  }

  // 初始化
  async init(): Promise<void> {
    console.log('🚀 初始化錢包管理器...');

    // 檢查是否有 ethereum 物件（MetaMask 等）
    if (typeof window !== 'undefined' && (window as any).ethereum) {
      await this.setupEventListeners();
      console.log('✅ 錢包管理器初始化完成');
    } else {
      console.log('⚠️ 未偵測到 ethereum 提供者');
    }
  }

  // 設置 ethereum 事件監聽
  private async setupEventListeners(): Promise<void> {
    const ethereum = (window as any).ethereum;
    if (!ethereum) return;

    // 帳戶變更
    ethereum.on('accountsChanged', (accounts: string[]) => {
      if (accounts.length === 0) {
        this.handleDisconnect();
      } else {
        this.state.address = accounts[0];
        this.emit('accountsChanged', { address: accounts[0] });
        this.updateBalance();
      }
    });

    // 網路變更
    ethereum.on('chainChanged', (chainIdHex: string) => {
      const chainId = parseInt(chainIdHex, 16);
      this.state.chainId = chainId;
      this.emit('chainChanged', { chainId });
    });

    // 斷開連接
    ethereum.on('disconnect', () => {
      this.handleDisconnect();
    });
  }

  // 連接錢包
  async connect(): Promise<string | null> {
    console.log('🔗 嘗試連接錢包...');

    const ethereum = (window as any).ethereum;
    if (!ethereum) {
      console.error('❌ 未找到 ethereum 提供者，請安裝 MetaMask');
      this.emit('connect', { success: false, error: 'No ethereum provider' });
      return null;
    }

    try {
      // 請求帳戶存取
      const accounts = await ethereum.request({ method: 'eth_requestAccounts' });

      if (accounts.length > 0) {
        this.state.isConnected = true;
        this.state.address = accounts[0];

        // 取得 chainId
        const chainIdHex = await ethereum.request({ method: 'eth_chainId' });
        this.state.chainId = parseInt(chainIdHex, 16);

        // 更新餘額
        await this.updateBalance();

        console.log('✅ 錢包連接成功:', this.state.address);
        this.emit('connect', { success: true, address: this.state.address });

        return this.state.address;
      }
    } catch (error) {
      console.error('❌ 連接錢包失敗:', error);
      this.emit('connect', { success: false, error });
    }

    return null;
  }

  // 斷開連接
  disconnect(): void {
    this.handleDisconnect();
    console.log('🔌 錢包已斷開連接');
  }

  // 處理斷開連接
  private handleDisconnect(): void {
    this.state = {
      isConnected: false,
      address: null,
      chainId: null,
      balance: null,
    };
    this.provider = null;
    this.signer = null;
    this.emit('disconnect', {});
  }

  // 更新餘額
  private async updateBalance(): Promise<void> {
    if (!this.state.address) return;

    const ethereum = (window as any).ethereum;
    if (!ethereum) return;

    try {
      const balanceHex = await ethereum.request({
        method: 'eth_getBalance',
        params: [this.state.address, 'latest'],
      });

      // 將 wei 轉換為 ETH（簡化計算）
      const balanceWei = BigInt(balanceHex);
      const balanceEth = Number(balanceWei) / 1e18;
      this.state.balance = balanceEth.toFixed(4);

      this.emit('balanceUpdated', { balance: this.state.balance });
    } catch (error) {
      console.error('❌ 更新餘額失敗:', error);
    }
  }

  // 切換網路
  async switchNetwork(chainId: ChainId): Promise<boolean> {
    const ethereum = (window as any).ethereum;
    if (!ethereum) return false;

    try {
      await ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${chainId.toString(16)}` }],
      });
      return true;
    } catch (error: any) {
      // 如果網路不存在，嘗試添加
      if (error.code === 4902) {
        return this.addNetwork(chainId);
      }
      console.error('❌ 切換網路失敗:', error);
      return false;
    }
  }

  // 添加網路
  private async addNetwork(chainId: ChainId): Promise<boolean> {
    const ethereum = (window as any).ethereum;
    if (!ethereum) return false;

    const network = SUPPORTED_NETWORKS[chainId];
    if (!network) return false;

    try {
      await ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: `0x${chainId.toString(16)}`,
            chainName: network.name,
            nativeCurrency: {
              name: network.symbol,
              symbol: network.symbol,
              decimals: 18,
            },
            rpcUrls: [network.rpcUrl],
          },
        ],
      });
      return true;
    } catch (error) {
      console.error('❌ 添加網路失敗:', error);
      return false;
    }
  }

  // 取得當前狀態
  getState(): Readonly<WalletState> {
    return { ...this.state };
  }

  // 檢查網路是否支援
  isNetworkSupported(): boolean {
    if (!this.state.chainId) return false;
    return this.state.chainId in SUPPORTED_NETWORKS;
  }

  // 取得網路名稱
  getNetworkName(): string {
    if (!this.state.chainId) return 'Unknown';
    const network = SUPPORTED_NETWORKS[this.state.chainId as ChainId];
    return network?.name || `Chain ${this.state.chainId}`;
  }

  // 事件系統
  on(event: WalletEventType, handler: WalletEventHandler): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(handler);
  }

  off(event: WalletEventType, handler: WalletEventHandler): void {
    this.eventListeners.get(event)?.delete(handler);
  }

  private emit(event: WalletEventType, data: unknown): void {
    this.eventListeners.get(event)?.forEach((handler) => {
      try {
        handler(data);
      } catch (error) {
        console.error(`事件處理器錯誤 (${event}):`, error);
      }
    });

    // 同時觸發 DOM 事件
    if (typeof document !== 'undefined') {
      document.dispatchEvent(new CustomEvent(`wallet:${event}`, { detail: data }));
    }
  }
}

// 單例實例
let walletManagerInstance: WalletManager | null = null;

export function getWalletManager(): WalletManager {
  if (!walletManagerInstance) {
    walletManagerInstance = new WalletManager();
  }
  return walletManagerInstance;
}

// 初始化函數
export async function initWalletManager(): Promise<WalletManager> {
  const manager = getWalletManager();
  await manager.init();
  return manager;
}

// 向後相容：暴露到全局
if (typeof window !== 'undefined') {
  (window as any).WalletManager = WalletManager;
  (window as any).getWalletManager = getWalletManager;
  (window as any).initWalletManager = initWalletManager;
}
