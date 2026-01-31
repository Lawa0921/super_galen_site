/**
 * SGT 購買管理器 - TypeScript ES Module 版本
 * 負責處理 SGT 代幣的購買流程
 */

import { getWalletManager, type WalletState } from './wallet-manager';
import { getContractsConfig } from './contracts-config';
import { getSGTBalance } from './sgt-balance';

// 購買管理器狀態介面
export interface PurchaseManagerState {
  isConnected: boolean;
  currentChainId: number | null;
  userAddress: string | null;
  balances: {
    sgt: string;
    usdt: string;
  };
  isApproving: boolean;
  isPurchasing: boolean;
}

// 購買步驟狀態
export type StepStatus = 'pending' | 'processing' | 'completed' | 'error';

/**
 * SGT 購買管理器類
 */
export class PurchaseManager {
  // 狀態
  private isConnected: boolean = false;
  private currentChainId: number | null = null;
  private userAddress: string | null = null;
  private provider: any = null;
  private signer: any = null;
  private sgtContract: any = null;
  private usdtContract: any = null;

  // 餘額
  private balances = {
    sgt: '0',
    usdt: '0',
  };

  // 交易狀態
  private isApproving: boolean = false;
  private isPurchasing: boolean = false;

  // 防抖機制
  private updateUITimeout: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    console.log('🛒 [PurchaseManager] 建立購買管理器實例');
  }

  /**
   * 初始化
   */
  async init(): Promise<void> {
    console.log('🔧 [PurchaseManager] 初始化 SGT 購買管理器...');

    // 設置 UI
    if (typeof document !== 'undefined') {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => this.setupUI());
      } else {
        this.setupUI();
      }
    }

    // 設置錢包監聽器
    this.setupWalletListeners();

    console.log('✅ [PurchaseManager] SGT 購買管理器初始化完成');
  }

  /**
   * 設置錢包監聽器
   */
  private setupWalletListeners(): void {
    console.log('🔗 [PurchaseManager] 設置錢包狀態監聽器...');

    const wallet = getWalletManager();

    // 監聽錢包事件
    wallet.on('connect', (data: any) => {
      this.handleWalletStateChange(wallet.getState());
    });

    wallet.on('disconnect', () => {
      this.handleDisconnect();
    });

    wallet.on('chainChanged', () => {
      this.handleWalletStateChange(wallet.getState());
    });

    wallet.on('accountsChanged', () => {
      this.handleWalletStateChange(wallet.getState());
    });

    // 監聽 DOM 事件
    document.addEventListener('wallet:connect', () => {
      this.handleWalletStateChange(wallet.getState());
    });

    document.addEventListener('wallet:disconnect', () => {
      this.handleDisconnect();
    });

    document.addEventListener('wallet:chainChanged', () => {
      this.handleWalletStateChange(wallet.getState());
    });

    // 初始狀態同步
    const initialState = wallet.getState();
    if (initialState.isConnected) {
      this.handleWalletStateChange(initialState);
    }

    console.log('✅ [PurchaseManager] 錢包狀態監聽器設置完成');
  }

  /**
   * 處理錢包狀態變化
   */
  private async handleWalletStateChange(state: WalletState): Promise<void> {
    console.log('🔄 [PurchaseManager] 錢包狀態變化:', state);

    this.isConnected = state.isConnected;
    this.userAddress = state.address;
    this.currentChainId = state.chainId;

    // 更新網路狀態顯示
    this.updateNetworkStatusDisplay();

    // 更新合約實例
    if (this.isConnected && this.currentChainId) {
      await this.updateContractInstances();

      // 延遲更新餘額
      setTimeout(async () => {
        if (this.sgtContract || this.usdtContract) {
          await this.updateBalances();
          this.updateBalanceDisplay();
        }
      }, 500);
    }

    // 更新 UI
    this.updateUI();
  }

  /**
   * 處理斷開連接
   */
  private handleDisconnect(): void {
    console.log('🔌 [PurchaseManager] 錢包已斷開');
    this.isConnected = false;
    this.currentChainId = null;
    this.userAddress = null;
    this.provider = null;
    this.signer = null;
    this.sgtContract = null;
    this.usdtContract = null;
    this.balances = { sgt: '0', usdt: '0' };

    this.updateNetworkStatusDisplay();
    this.updateUI();
  }

  /**
   * 更新合約實例
   */
  private async updateContractInstances(): Promise<void> {
    if (!this.currentChainId) {
      this.sgtContract = null;
      this.usdtContract = null;
      return;
    }

    const contractsConfig = getContractsConfig();
    const addresses = contractsConfig.getAddresses(this.currentChainId);

    if (!addresses) {
      console.log('❌ [PurchaseManager] 不支援的網路:', this.currentChainId);
      this.sgtContract = null;
      this.usdtContract = null;
      return;
    }

    try {
      const ethers = (window as any).ethers;
      this.provider = new ethers.BrowserProvider((window as any).ethereum);
      this.signer = await this.provider.getSigner();

      // SGT 合約
      if (addresses.sgt) {
        this.sgtContract = new ethers.Contract(
          addresses.sgt,
          [
            'function buyTokensWithUSDT(uint256 usdtAmount) external',
            'function balanceOf(address account) view returns (uint256)',
            'function calculateSGTAmount(uint256 usdtAmount) view returns (uint256)',
            'function purchasesPaused() view returns (bool)',
          ],
          this.signer
        );
        console.log('✅ [PurchaseManager] SGT 合約已連接');
      }

      // USDT 合約
      if (addresses.usdt) {
        this.usdtContract = new ethers.Contract(
          addresses.usdt,
          [
            'function balanceOf(address account) view returns (uint256)',
            'function approve(address spender, uint256 amount) external returns (bool)',
            'function allowance(address owner, address spender) view returns (uint256)',
            'function decimals() view returns (uint8)',
          ],
          this.signer
        );
        console.log('✅ [PurchaseManager] USDT 合約已連接');
      }
    } catch (error) {
      console.error('❌ [PurchaseManager] 更新合約實例失敗:', error);
    }
  }

  /**
   * 設置 UI
   */
  private setupUI(): void {
    console.log('🎨 [PurchaseManager] 設置購買頁面 UI...');
    this.bindEvents();
  }

  /**
   * 綁定事件
   */
  private bindEvents(): void {
    // 連接錢包按鈕
    const connectBtn = document.getElementById('connect-wallet');
    if (connectBtn) {
      connectBtn.addEventListener('click', () => this.connectWallet());
    }

    // 複製地址按鈕
    const copyBtn = document.getElementById('copy-address');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => this.copyAddress());
    }

    // USDT 輸入框
    const usdtInput = document.getElementById('usdt-input') as HTMLInputElement;
    if (usdtInput) {
      usdtInput.addEventListener('input', () => this.onUSDTAmountChange());
    }

    // MAX 按鈕
    const maxBtn = document.getElementById('max-usdt');
    if (maxBtn) {
      maxBtn.addEventListener('click', () => this.setMaxUSDT());
    }

    // 授權按鈕
    const approveBtn = document.getElementById('approve-btn');
    if (approveBtn) {
      approveBtn.addEventListener('click', () => this.approveUSDT());
    }

    // 購買按鈕
    const purchaseBtn = document.getElementById('purchase-btn');
    if (purchaseBtn) {
      purchaseBtn.addEventListener('click', () => this.purchaseSGT());
    }

    // 彈窗按鈕
    const closePurchaseModal = document.getElementById('close-purchase-modal');
    if (closePurchaseModal) {
      closePurchaseModal.addEventListener('click', () => this.closePurchaseModal());
    }

    const cancelPurchase = document.getElementById('cancel-purchase');
    if (cancelPurchase) {
      cancelPurchase.addEventListener('click', () => this.closePurchaseModal());
    }

    const confirmPurchase = document.getElementById('confirm-purchase');
    if (confirmPurchase) {
      confirmPurchase.addEventListener('click', () => this.confirmPurchase());
    }
  }

  /**
   * 連接錢包
   */
  async connectWallet(): Promise<void> {
    const wallet = getWalletManager();

    try {
      console.log('🔗 [PurchaseManager] 連接錢包...');
      await wallet.connect();
    } catch (error: any) {
      console.error('❌ [PurchaseManager] 連接錢包失敗:', error);
      alert('連接錢包失敗：' + error.message);
    }
  }

  /**
   * 更新餘額
   */
  async updateBalances(): Promise<void> {
    if (!this.userAddress) return;

    try {
      const ethers = (window as any).ethers;

      // 如果是 Polygon，只查詢 USDT 餘額
      if (this.currentChainId === 137) {
        if (this.usdtContract) {
          const usdtBalance = await this.usdtContract.balanceOf(this.userAddress);
          this.balances.usdt = ethers.formatUnits(usdtBalance, 6);
          this.balances.sgt = '0';
          console.log('💰 [PurchaseManager] [Polygon] USDT 餘額:', this.balances.usdt);
        }
      } else if (this.sgtContract && this.usdtContract) {
        // 查詢 SGT 餘額
        const sgtBalance = await this.sgtContract.balanceOf(this.userAddress);
        this.balances.sgt = ethers.formatEther(sgtBalance);

        // 查詢 USDT 餘額
        const usdtBalance = await this.usdtContract.balanceOf(this.userAddress);
        this.balances.usdt = ethers.formatUnits(usdtBalance, 6);

        console.log('💰 [PurchaseManager] 餘額更新:', this.balances);
      }
    } catch (error) {
      console.error('❌ [PurchaseManager] 更新餘額失敗:', error);
    }
  }

  /**
   * 更新 UI（防抖）
   */
  updateUI(): void {
    if (this.updateUITimeout) {
      clearTimeout(this.updateUITimeout);
    }

    this.updateUITimeout = setTimeout(() => {
      this._actualUpdateUI();
    }, 50);
  }

  /**
   * 實際更新 UI
   */
  private _actualUpdateUI(): void {
    const walletConnected = document.getElementById('wallet-connected');
    const walletDisconnected = document.getElementById('wallet-disconnected');
    const purchaseSection = document.getElementById('purchase-section');

    if (this.isConnected && this.userAddress) {
      // 錢包已連接
      if (walletConnected) walletConnected.style.display = 'block';
      if (walletDisconnected) walletDisconnected.style.display = 'none';

      // 更新地址顯示
      const addressElement = document.getElementById('purchase-user-address');
      if (addressElement) {
        addressElement.textContent = this.userAddress;
      }

      // 購買區域始終顯示
      if (purchaseSection) purchaseSection.style.display = 'block';

      // 檢查 Polygon 網路
      const polygonNotice = document.getElementById('polygon-notice');
      if (this.currentChainId === 137) {
        if (polygonNotice) polygonNotice.style.display = 'block';
        this.setupPolygonSwitchButton();
      } else {
        if (polygonNotice) polygonNotice.style.display = 'none';
      }

      // 更新餘額顯示
      this.updateBalanceDisplay();
    } else {
      // 錢包未連接
      if (walletConnected) walletConnected.style.display = 'none';
      if (walletDisconnected) walletDisconnected.style.display = 'block';
      if (purchaseSection) purchaseSection.style.display = 'block';
    }

    // 更新按鈕狀態
    this.updateButtonStates();
  }

  /**
   * 更新網路狀態顯示
   */
  private updateNetworkStatusDisplay(): void {
    const networkIndicator = document.getElementById('purchase-network-indicator');
    const networkNameElement = document.getElementById('purchase-network-name');

    if (!networkIndicator || !networkNameElement) return;

    if (!this.isConnected) {
      networkIndicator.textContent = '🔴';
      networkNameElement.textContent = '未連接';
      return;
    }

    const contractsConfig = getContractsConfig();
    if (this.currentChainId && contractsConfig.isChainSupported(this.currentChainId)) {
      networkIndicator.textContent = '🟢';

      if (this.currentChainId === 31337) {
        networkNameElement.textContent = 'Local Chain';
      } else if (this.currentChainId === 137) {
        networkNameElement.textContent = 'Polygon';
      }
    } else {
      networkIndicator.textContent = '🔴';
      networkNameElement.textContent = `網路 ${this.currentChainId}`;
    }
  }

  /**
   * 更新餘額顯示
   */
  updateBalanceDisplay(): void {
    const sgtBalanceElement = document.getElementById('sgt-balance');
    const usdtBalanceElement = document.getElementById('usdt-balance');
    const availableUsdtElement = document.getElementById('available-usdt');

    if (sgtBalanceElement) {
      sgtBalanceElement.textContent = parseFloat(this.balances.sgt).toFixed(2);
    }

    if (usdtBalanceElement) {
      usdtBalanceElement.textContent = parseFloat(this.balances.usdt).toFixed(2);
    }

    if (availableUsdtElement) {
      availableUsdtElement.textContent = parseFloat(this.balances.usdt).toFixed(2);
    }
  }

  /**
   * 設置 Polygon 切換按鈕
   */
  private setupPolygonSwitchButton(): void {
    const switchBtn = document.getElementById('switch-to-local');
    if (!switchBtn) return;

    // 移除舊的事件監聽器
    const newSwitchBtn = switchBtn.cloneNode(true) as HTMLElement;
    switchBtn.parentNode?.replaceChild(newSwitchBtn, switchBtn);

    newSwitchBtn.addEventListener('click', async () => {
      try {
        console.log('🔄 [PurchaseManager] 切換到本地測試網...');
        const wallet = getWalletManager();
        await wallet.switchNetwork(31337);
      } catch (error: any) {
        console.error('❌ [PurchaseManager] 切換網路失敗:', error);
        alert('切換網路失敗，請手動在 MetaMask 中切換');
      }
    });
  }

  /**
   * 複製地址
   */
  async copyAddress(): Promise<void> {
    if (this.userAddress) {
      try {
        await navigator.clipboard.writeText(this.userAddress);
        alert('地址已複製到剪貼板！');
      } catch (error) {
        console.error('複製失敗:', error);
      }
    }
  }

  /**
   * USDT 金額變更處理
   */
  onUSDTAmountChange(): void {
    const usdtInput = document.getElementById('usdt-input') as HTMLInputElement;
    const sgtOutput = document.getElementById('sgt-output');

    if (usdtInput && sgtOutput) {
      const usdtAmount = parseFloat(usdtInput.value) || 0;
      const sgtAmount = usdtAmount * 30; // 1 USDT = 30 SGT

      sgtOutput.textContent = sgtAmount.toFixed(2);

      // 更新交易詳情
      this.updateTransactionDetails(usdtAmount, sgtAmount);

      // 更新按鈕狀態
      this.updateButtonStates();
    }
  }

  /**
   * 設置最大 USDT
   */
  setMaxUSDT(): void {
    const usdtInput = document.getElementById('usdt-input') as HTMLInputElement;
    if (usdtInput) {
      usdtInput.value = this.balances.usdt;
      this.onUSDTAmountChange();
    }
  }

  /**
   * 更新交易詳情
   */
  private updateTransactionDetails(usdtAmount: number, sgtAmount: number): void {
    const detailsSection = document.getElementById('transaction-details');
    const payAmountElement = document.getElementById('pay-amount');
    const receiveAmountElement = document.getElementById('receive-amount');

    if (usdtAmount > 0) {
      if (detailsSection) detailsSection.style.display = 'block';
      if (payAmountElement) payAmountElement.textContent = `${usdtAmount.toFixed(6)} USDT`;
      if (receiveAmountElement) receiveAmountElement.textContent = `${sgtAmount.toFixed(2)} SGT`;
    } else {
      if (detailsSection) detailsSection.style.display = 'none';
    }
  }

  /**
   * 更新按鈕狀態
   */
  updateButtonStates(): void {
    const usdtInput = document.getElementById('usdt-input') as HTMLInputElement;
    const approveBtn = document.getElementById('approve-btn') as HTMLButtonElement;
    const purchaseBtn = document.getElementById('purchase-btn') as HTMLButtonElement;

    const usdtAmount = parseFloat(usdtInput?.value) || 0;
    const hasValidAmount = usdtAmount > 0;

    if (approveBtn) {
      approveBtn.disabled = !hasValidAmount || this.isApproving;
      if (this.isConnected) {
        approveBtn.textContent = this.isApproving ? '授權中...' : '🔓 授權 USDT';
      } else {
        approveBtn.textContent = '🔗 連接錢包';
      }
    }

    if (purchaseBtn) {
      purchaseBtn.disabled = !hasValidAmount || this.isPurchasing;
      if (this.isConnected) {
        purchaseBtn.textContent = this.isPurchasing ? '購買中...' : '🛒 購買 SGT';
      } else {
        purchaseBtn.textContent = '🔗 連接錢包';
      }
    }
  }

  /**
   * 授權 USDT
   */
  async approveUSDT(): Promise<void> {
    if (this.isApproving) return;

    const usdtInput = document.getElementById('usdt-input') as HTMLInputElement;
    const usdtAmount = parseFloat(usdtInput?.value) || 0;

    if (usdtAmount <= 0) {
      alert('請輸入有效的 USDT 數量');
      return;
    }

    try {
      this.isApproving = true;
      this.updateButtonStates();
      this.updateStepStatus('approve', 'processing');

      console.log('🔗 [PurchaseManager] USDT 授權流程開始...');

      // 連接錢包
      if (!this.isConnected) {
        await this.connectWallet();
        if (!this.isConnected || !this.usdtContract) {
          throw new Error('錢包連接或合約載入失敗');
        }
      }

      // 檢查購買功能是否暫停
      if (this.sgtContract) {
        const isPaused = await this.sgtContract.purchasesPaused();
        if (isPaused) {
          throw new Error('購買功能暫時維護中，請稍後再試');
        }
      }

      // 執行授權
      console.log('🔓 [PurchaseManager] 授權 USDT...');
      const contractsConfig = getContractsConfig();
      const sgtAddress = contractsConfig.getSGTAddress(this.currentChainId!);
      const ethers = (window as any).ethers;
      const amountToApprove = ethers.parseUnits(usdtAmount.toString(), 6);

      const tx = await this.usdtContract.approve(sgtAddress, amountToApprove);

      console.log('⏳ [PurchaseManager] 等待授權交易確認...');
      await tx.wait();

      console.log('✅ [PurchaseManager] USDT 授權成功');
      this.updateStepStatus('approve', 'completed');
    } catch (error: any) {
      console.error('❌ [PurchaseManager] USDT 授權失敗:', error);
      this.updateStepStatus('approve', 'error');
      alert('授權失敗：' + error.message);
    } finally {
      this.isApproving = false;
      this.updateButtonStates();
    }
  }

  /**
   * 購買 SGT
   */
  async purchaseSGT(): Promise<void> {
    if (this.isPurchasing) return;

    const usdtInput = document.getElementById('usdt-input') as HTMLInputElement;
    const usdtAmount = parseFloat(usdtInput?.value) || 0;

    if (usdtAmount <= 0) {
      alert('請輸入有效的 USDT 數量');
      return;
    }

    try {
      this.isPurchasing = true;
      this.updateButtonStates();
      this.updateStepStatus('purchase', 'processing');

      console.log('🛒 [PurchaseManager] SGT 購買流程開始...');

      // 連接錢包
      if (!this.isConnected) {
        await this.connectWallet();
        if (!this.isConnected || !this.sgtContract) {
          throw new Error('錢包連接或合約載入失敗');
        }
      }

      // 檢查購買功能是否暫停
      const isPaused = await this.sgtContract.purchasesPaused();
      if (isPaused) {
        throw new Error('購買功能暫時維護中，請稍後再試');
      }

      // 執行購買
      console.log('💰 [PurchaseManager] 購買 SGT...');
      const ethers = (window as any).ethers;
      const amountToPay = ethers.parseUnits(usdtAmount.toString(), 6);

      const tx = await this.sgtContract.buyTokensWithUSDT(amountToPay);

      console.log('⏳ [PurchaseManager] 等待購買交易確認...');
      await tx.wait();

      console.log('✅ [PurchaseManager] SGT 購買成功');
      this.updateStepStatus('purchase', 'completed');

      // 更新餘額
      await this.updateBalances();
      this.updateBalanceDisplay();

      // 觸發 header SGT 餘額更新
      this.updateHeaderBalance();

      // 重置輸入
      if (usdtInput) usdtInput.value = '';
      this.onUSDTAmountChange();

      // 顯示成功訊息
      alert('🎉 SGT 購買成功！');
    } catch (error: any) {
      console.error('❌ [PurchaseManager] SGT 購買失敗:', error);
      this.updateStepStatus('purchase', 'error');
      alert('購買失敗：' + error.message);
    } finally {
      this.isPurchasing = false;
      this.updateButtonStates();
    }
  }

  /**
   * 更新步驟狀態
   */
  private updateStepStatus(step: string, status: StepStatus): void {
    const stepElement = document.getElementById(`step-${step}`);
    const statusElement = document.getElementById(`${step}-status`);

    if (!stepElement || !statusElement) return;

    // 清除所有狀態類
    stepElement.classList.remove('active', 'completed', 'error');

    switch (status) {
      case 'processing':
        stepElement.classList.add('active');
        statusElement.textContent = '處理中...';
        break;
      case 'completed':
        stepElement.classList.add('completed');
        statusElement.textContent = '已完成';
        break;
      case 'error':
        stepElement.classList.add('error');
        statusElement.textContent = '失敗';
        break;
      default:
        statusElement.textContent = '待處理';
    }
  }

  /**
   * 關閉購買彈窗
   */
  closePurchaseModal(): void {
    const modal = document.getElementById('purchase-modal');
    if (modal) {
      modal.style.display = 'none';
    }
  }

  /**
   * 確認購買
   */
  async confirmPurchase(): Promise<void> {
    this.closePurchaseModal();
    await this.purchaseSGT();
  }

  /**
   * 更新 header 中的 SGT 餘額顯示
   */
  private updateHeaderBalance(): void {
    console.log('🔄 [PurchaseManager] 觸發 header SGT 餘額更新...');

    // 刷新 SGT 餘額顯示器
    getSGTBalance().refresh();

    // 發送自定義事件通知其他組件
    const event = new CustomEvent('sgtBalanceUpdated', {
      detail: {
        newBalance: this.balances.sgt,
        userAddress: this.userAddress,
        source: 'purchase',
      },
    });

    document.dispatchEvent(event);
  }

  /**
   * 手動刷新
   */
  async refresh(): Promise<void> {
    console.log('🔄 [PurchaseManager] 手動刷新購買管理器...');

    const wallet = getWalletManager();
    const currentState = wallet.getState();
    await this.handleWalletStateChange(currentState);
  }

  /**
   * 取得當前狀態
   */
  getState(): PurchaseManagerState {
    return {
      isConnected: this.isConnected,
      currentChainId: this.currentChainId,
      userAddress: this.userAddress,
      balances: { ...this.balances },
      isApproving: this.isApproving,
      isPurchasing: this.isPurchasing,
    };
  }
}

// 單例實例
let purchaseManagerInstance: PurchaseManager | null = null;

export function getPurchaseManager(): PurchaseManager {
  if (!purchaseManagerInstance) {
    purchaseManagerInstance = new PurchaseManager();
  }
  return purchaseManagerInstance;
}

/**
 * 初始化購買管理器
 */
export async function initPurchaseManager(): Promise<PurchaseManager> {
  const manager = getPurchaseManager();
  await manager.init();
  return manager;
}

// 向後相容：暴露到全局
if (typeof window !== 'undefined') {
  (window as any).PurchaseManager = PurchaseManager;
  (window as any).getPurchaseManager = getPurchaseManager;
  (window as any).initPurchaseManager = initPurchaseManager;

  // 全域刷新函數
  (window as any).refreshSGTPurchase = () => {
    getPurchaseManager().refresh();
  };
}

export default getPurchaseManager;
