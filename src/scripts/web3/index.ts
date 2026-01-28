/**
 * Web3 模組統一入口點
 * 匯出所有 Web3 相關模組
 */

// 錢包管理器
export {
  WalletManager,
  getWalletManager,
  initWalletManager,
  SUPPORTED_NETWORKS,
  type ChainId,
  type WalletState,
  type WalletEventType,
  type WalletEventHandler,
} from './wallet-manager';

// 合約配置
export {
  ContractsConfig,
  getContractsConfig,
  type SupportedChainId,
  type ContractAddresses,
  type ContractsConfigType,
} from './contracts-config';

// 網路監控器
export {
  NetworkMonitor,
  getNetworkMonitor,
  initNetworkMonitor,
  type NetworkState,
  type NetworkEventType,
  type NetworkEventHandler,
} from './network-monitor';

// SGT 餘額顯示器
export {
  SGTBalance,
  getSGTBalance,
  initSGTBalance,
  type SGTBalanceState,
} from './sgt-balance';

// 購買管理器
export {
  PurchaseManager,
  getPurchaseManager,
  initPurchaseManager,
  type PurchaseManagerState,
  type StepStatus,
} from './purchase-manager';

/**
 * 初始化所有 Web3 模組
 */
export async function initAllWeb3Modules(): Promise<void> {
  console.log('🚀 [Web3] 開始初始化所有 Web3 模組...');

  const { initWalletManager } = await import('./wallet-manager');
  const { initNetworkMonitor } = await import('./network-monitor');
  const { initSGTBalance } = await import('./sgt-balance');
  const { initPurchaseManager } = await import('./purchase-manager');

  // 依序初始化（有依賴關係）
  await initWalletManager();
  await initNetworkMonitor();
  await initSGTBalance();
  await initPurchaseManager();

  console.log('✅ [Web3] 所有 Web3 模組初始化完成');
}

// 向後相容：暴露到全局
if (typeof window !== 'undefined') {
  (window as any).initAllWeb3Modules = initAllWeb3Modules;
}
