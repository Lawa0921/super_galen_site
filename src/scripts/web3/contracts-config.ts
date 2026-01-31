/**
 * 合約配置 - TypeScript ES Module 版本
 * 支援多網路的動態合約地址
 */

// 支援的網路 Chain ID
export type SupportedChainId = 31337 | 137;

// 合約地址配置介面
export interface ContractAddresses {
  sgt: string | null;
  usdt: string | null;
  deployedAt: string | null;
}

// 完整配置類型
export type ContractsConfigType = Record<SupportedChainId, ContractAddresses>;

// 預設合約配置
// 注意：本地開發環境的地址會由部署腳本動態更新
const defaultConfig: ContractsConfigType = {
  // 本地開發網路 (Hardhat)
  31337: {
    sgt: null,
    usdt: null,
    deployedAt: null,
  },

  // Polygon 主網
  137: {
    sgt: null, // 待部署
    usdt: '0xc2132d05d31c914a87c6611c10748aeb04b58e8f', // Polygon 官方 USDT
    deployedAt: null,
  },
};

// 合約配置類
class ContractsConfig {
  private config: ContractsConfigType;

  constructor() {
    // 嘗試從全域載入動態配置
    if (typeof window !== 'undefined' && (window as any).ContractsConfig) {
      this.config = (window as any).ContractsConfig;
      console.log('📄 [ContractsConfig] 使用動態合約配置');
    } else {
      this.config = { ...defaultConfig };
      console.log('📄 [ContractsConfig] 使用預設合約配置');
    }
  }

  /**
   * 取得指定網路的合約地址
   */
  getAddresses(chainId: number): ContractAddresses | null {
    if (chainId in this.config) {
      return this.config[chainId as SupportedChainId];
    }
    return null;
  }

  /**
   * 取得 SGT 合約地址
   */
  getSGTAddress(chainId: number): string | null {
    return this.getAddresses(chainId)?.sgt || null;
  }

  /**
   * 取得 USDT 合約地址
   */
  getUSDTAddress(chainId: number): string | null {
    return this.getAddresses(chainId)?.usdt || null;
  }

  /**
   * 檢查網路是否支援
   */
  isChainSupported(chainId: number): boolean {
    return chainId in this.config;
  }

  /**
   * 檢查指定網路的 SGT 合約是否已部署
   */
  isSGTDeployed(chainId: number): boolean {
    const addresses = this.getAddresses(chainId);
    return addresses?.sgt !== null && addresses?.sgt !== undefined;
  }

  /**
   * 更新配置（用於動態載入）
   */
  updateConfig(chainId: SupportedChainId, addresses: Partial<ContractAddresses>): void {
    if (chainId in this.config) {
      this.config[chainId] = { ...this.config[chainId], ...addresses };
      console.log(`📄 [ContractsConfig] 更新 Chain ${chainId} 配置:`, addresses);
    }
  }

  /**
   * 取得完整配置
   */
  getFullConfig(): Readonly<ContractsConfigType> {
    return { ...this.config };
  }
}

// 單例實例
let contractsConfigInstance: ContractsConfig | null = null;

export function getContractsConfig(): ContractsConfig {
  if (!contractsConfigInstance) {
    contractsConfigInstance = new ContractsConfig();
  }
  return contractsConfigInstance;
}

// 向後相容：暴露到全局
if (typeof window !== 'undefined') {
  (window as any).getContractsConfig = getContractsConfig;
}

export { ContractsConfig };
export default getContractsConfig;
