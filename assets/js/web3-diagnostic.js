/* ===== Web3 診斷工具 ===== */

(function() {
    'use strict';

    class Web3Diagnostic {
        constructor() {
            this.isOpen = false;
            this.diagnosticPanel = null;
            this.setupDiagnosticButton();
        }

        // 設置診斷按鈕
        setupDiagnosticButton() {
            document.addEventListener('DOMContentLoaded', () => {
                const diagnosticBtn = document.getElementById('web3-diagnostic-btn');
                if (diagnosticBtn) {
                    diagnosticBtn.addEventListener('click', this.toggleDiagnosticPanel.bind(this));
                    console.log('Web3Diagnostic: 診斷按鈕事件已綁定');
                }
            });
        }

        // 切換診斷面板
        toggleDiagnosticPanel() {
            if (this.isOpen) {
                this.closeDiagnosticPanel();
            } else {
                this.openDiagnosticPanel();
            }
        }

        // 打開診斷面板
        openDiagnosticPanel() {
            if (this.diagnosticPanel) {
                this.diagnosticPanel.remove();
            }

            this.diagnosticPanel = this.createDiagnosticPanel();
            document.body.appendChild(this.diagnosticPanel);
            this.isOpen = true;

            // 執行初始診斷
            this.runFullDiagnostic();
        }

        // 關閉診斷面板
        closeDiagnosticPanel() {
            if (this.diagnosticPanel) {
                this.diagnosticPanel.remove();
                this.diagnosticPanel = null;
            }
            this.isOpen = false;
        }

        // 創建診斷面板
        createDiagnosticPanel() {
            const panel = document.createElement('div');
            panel.className = 'web3-diagnostic-panel';
            panel.innerHTML = `
                <div class="diagnostic-header">
                    <h3><i class="fas fa-stethoscope"></i> Web3 診斷工具</h3>
                    <button class="close-btn" onclick="window.Web3Diagnostic.closeDiagnosticPanel()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="diagnostic-content">
                    <div class="diagnostic-section">
                        <h4>MetaMask 狀態</h4>
                        <div id="metamask-status" class="status-display">檢查中...</div>
                    </div>
                    <div class="diagnostic-section">
                        <h4>網路檢測</h4>
                        <div id="network-status" class="status-display">檢查中...</div>
                    </div>
                    <div class="diagnostic-section">
                        <h4>事件監聽器</h4>
                        <div id="event-listeners-status" class="status-display">檢查中...</div>
                    </div>
                    <div class="diagnostic-actions">
                        <button class="action-btn" onclick="window.Web3Diagnostic.runFullDiagnostic()">
                            <i class="fas fa-sync"></i> 重新診斷
                        </button>
                        <button class="action-btn clear-cache" onclick="window.Web3Diagnostic.triggerCacheClearing()">
                            <i class="fas fa-broom"></i> 清理快取
                        </button>
                        <button class="action-btn refresh-network" onclick="window.Web3Diagnostic.triggerNetworkRefresh()">
                            <i class="fas fa-network-wired"></i> 重新整理網路
                        </button>
                        <button class="action-btn monitor-toggle" onclick="window.Web3Diagnostic.toggleAggressiveMonitoring()">
                            <i class="fas fa-eye"></i> 積極監控
                        </button>
                        <button class="action-btn deep-reset" onclick="window.Web3Diagnostic.triggerDeepReset()">
                            <i class="fas fa-power-off"></i> 深度重置
                        </button>
                        <button class="action-btn" onclick="window.Web3Diagnostic.exportDiagnosticReport()">
                            <i class="fas fa-download"></i> 匯出報告
                        </button>
                    </div>
                    <div class="diagnostic-log">
                        <h4>診斷日誌</h4>
                        <div id="diagnostic-log-content" class="log-content"></div>
                    </div>
                </div>
            `;
            return panel;
        }

        // 執行完整診斷
        async runFullDiagnostic() {
            this.log('🔍 開始 Web3 完整診斷...');

            // MetaMask 狀態檢查
            await this.checkMetaMaskStatus();

            // 網路狀態檢查
            await this.checkNetworkStatus();

            // 事件監聽器檢查
            await this.checkEventListeners();

            this.log('✅ 診斷完成');
        }

        // 檢查 MetaMask 狀態
        async checkMetaMaskStatus() {
            const statusElement = document.getElementById('metamask-status');
            if (!statusElement) return;

            try {
                const hasEthereum = typeof window.ethereum !== 'undefined';
                const isMetaMask = window.ethereum?.isMetaMask;

                let status = '';
                let statusClass = '';

                if (!hasEthereum) {
                    status = '❌ 未安裝 MetaMask';
                    statusClass = 'error';
                } else if (!isMetaMask) {
                    status = '⚠️ 檢測到其他 Web3 錢包';
                    statusClass = 'warning';
                } else {
                    const accounts = await window.ethereum.request({ method: 'eth_accounts' });
                    const chainId = await window.ethereum.request({ method: 'eth_chainId' });

                    status = `✅ MetaMask 已連接
                        <br>帳戶: ${accounts.length > 0 ? accounts[0] : '未連接'}
                        <br>網路 ID: ${chainId}`;
                    statusClass = 'success';
                }

                statusElement.innerHTML = status;
                statusElement.className = `status-display ${statusClass}`;

                this.log(`MetaMask 狀態: ${status.replace(/<br>/g, ' | ')}`);
            } catch (error) {
                statusElement.innerHTML = `❌ 檢查失敗: ${error.message}`;
                statusElement.className = 'status-display error';
                this.log(`❌ MetaMask 狀態檢查失敗: ${error.message}`);
            }
        }

        // 檢查網路狀態
        async checkNetworkStatus() {
            const statusElement = document.getElementById('network-status');
            if (!statusElement) return;

            try {
                if (!window.ethereum) {
                    statusElement.innerHTML = '❌ 無法檢查網路狀態';
                    statusElement.className = 'status-display error';
                    return;
                }

                const chainId = await window.ethereum.request({ method: 'eth_chainId' });
                const web3State = window.getWeb3State ? window.getWeb3State() : null;

                const networks = {
                    '0x1': 'Ethereum Mainnet',
                    '0x89': 'Polygon Mainnet',
                    '0x7a69': 'Hardhat Local'
                };

                const networkName = networks[chainId] || `未知網路 (${chainId})`;
                const isSupported = ['0x89', '0x7a69'].includes(chainId);

                let status = `當前網路: ${networkName}`;
                let statusClass = '';

                if (isSupported) {
                    status += '<br>✅ 支援的網路';
                    statusClass = 'success';
                } else {
                    status += '<br>⚠️ 不支援的網路';
                    statusClass = 'warning';
                }

                if (web3State) {
                    const storedChainId = web3State.chainId;
                    if (storedChainId !== chainId) {
                        status += `<br>🚨 狀態不一致！儲存: ${storedChainId}`;
                        statusClass = 'error';
                    }
                }

                statusElement.innerHTML = status;
                statusElement.className = `status-display ${statusClass}`;

                this.log(`網路狀態: ${status.replace(/<br>/g, ' | ')}`);
            } catch (error) {
                statusElement.innerHTML = `❌ 檢查失敗: ${error.message}`;
                statusElement.className = 'status-display error';
                this.log(`❌ 網路狀態檢查失敗: ${error.message}`);
            }
        }

        // 檢查事件監聽器
        async checkEventListeners() {
            const statusElement = document.getElementById('event-listeners-status');
            if (!statusElement) return;

            try {
                let status = '';
                let statusClass = 'success';

                if (!window.ethereum) {
                    status = '❌ 無法檢查事件監聽器';
                    statusClass = 'error';
                } else {
                    const events = window.ethereum._events || {};
                    const chainChangedCount = events.chainChanged?.length || 0;
                    const accountsChangedCount = events.accountsChanged?.length || 0;

                    status = `事件監聽器狀態:
                        <br>chainChanged: ${chainChangedCount} 個
                        <br>accountsChanged: ${accountsChangedCount} 個`;

                    if (chainChangedCount === 0 || accountsChangedCount === 0) {
                        status += '<br>⚠️ 某些監聽器可能未設置';
                        statusClass = 'warning';
                    } else {
                        status += '<br>✅ 事件監聽器正常';
                    }
                }

                statusElement.innerHTML = status;
                statusElement.className = `status-display ${statusClass}`;

                this.log(`事件監聽器: ${status.replace(/<br>/g, ' | ')}`);
            } catch (error) {
                statusElement.innerHTML = `❌ 檢查失敗: ${error.message}`;
                statusElement.className = 'status-display error';
                this.log(`❌ 事件監聽器檢查失敗: ${error.message}`);
            }
        }

        // 觸發快取清理
        async triggerCacheClearing() {
            this.log('🧹 開始清理 MetaMask 快取...');

            try {
                if (window.clearMetaMaskCache) {
                    const result = await window.clearMetaMaskCache();
                    if (result) {
                        this.log('✅ 快取清理成功');
                        // 重新診斷
                        setTimeout(() => this.runFullDiagnostic(), 1000);
                    } else {
                        this.log('❌ 快取清理失敗');
                    }
                } else {
                    this.log('❌ 快取清理功能不可用');
                }
            } catch (error) {
                this.log(`❌ 快取清理錯誤: ${error.message}`);
            }
        }

        // 觸發網路重新整理
        async triggerNetworkRefresh() {
            this.log('🔄 開始網路重新整理...');

            try {
                if (window.forceNetworkRefresh) {
                    const result = await window.forceNetworkRefresh();
                    if (result) {
                        this.log('✅ 網路狀態已重新整理');
                    } else {
                        this.log('ℹ️ 網路狀態無需更新');
                    }
                    // 重新診斷
                    setTimeout(() => this.runFullDiagnostic(), 500);
                } else {
                    this.log('❌ 網路重新整理功能不可用');
                }
            } catch (error) {
                this.log(`❌ 網路重新整理錯誤: ${error.message}`);
            }
        }

        // 切換積極監控
        toggleAggressiveMonitoring() {
            this.log('🔄 切換積極監控狀態...');

            try {
                if (window.testWeb3Events && window.testWeb3Events.getMonitoringStatus) {
                    const isMonitoring = window.testWeb3Events.getMonitoringStatus();

                    if (isMonitoring) {
                        // 停止監控
                        if (window.stopAggressiveNetworkMonitoring) {
                            window.stopAggressiveNetworkMonitoring();
                            this.log('🛑 積極監控已停止');
                        }
                    } else {
                        // 啟動監控
                        if (window.startAggressiveNetworkMonitoring) {
                            window.startAggressiveNetworkMonitoring();
                            this.log('🚀 積極監控已啟動 (500ms 間隔)');
                        }
                    }

                    // 更新按鈕狀態
                    this.updateMonitorButtonState(!isMonitoring);

                    // 重新診斷
                    setTimeout(() => this.runFullDiagnostic(), 500);
                } else {
                    this.log('❌ 監控功能不可用');
                }
            } catch (error) {
                this.log(`❌ 切換監控失敗: ${error.message}`);
            }
        }

        // 更新監控按鈕狀態
        updateMonitorButtonState(isMonitoring) {
            const button = document.querySelector('.action-btn.monitor-toggle');
            if (button) {
                if (isMonitoring) {
                    button.innerHTML = '<i class="fas fa-eye-slash"></i> 停止監控';
                    button.classList.add('monitoring-active');
                } else {
                    button.innerHTML = '<i class="fas fa-eye"></i> 積極監控';
                    button.classList.remove('monitoring-active');
                }
            }
        }

        // 觸發深度重置
        async triggerDeepReset() {
            this.log('🔥 開始 MetaMask 深度重置...');

            try {
                // 先診斷當前問題
                this.log('🕵️ 先診斷當前網路狀態...');
                if (window.testWeb3Events && window.testWeb3Events.diagnoseNetworkMismatch) {
                    const diagnosis = await window.testWeb3Events.diagnoseNetworkMismatch();

                    if (diagnosis.mismatch) {
                        this.log('🚨 確認發現網路狀態不一致問題！');
                        this.log(`📊 API 返回: ${diagnosis.uniqueChainIds[0]}`);
                        this.log(`💾 本地狀態: ${diagnosis.currentWeb3State}`);
                    } else {
                        this.log('✅ 網路狀態目前正常');
                    }
                }

                // 執行深度重置
                this.log('🔥 執行深度重置...');
                if (window.deepResetMetaMask) {
                    const result = await window.deepResetMetaMask();

                    if (result.success) {
                        this.log('✅ 深度重置成功！');
                        this.log(`🔗 最終網路: ${result.finalChainId}`);
                        this.log(`👤 帳戶: ${result.account}`);
                        this.log(`📋 檢查記錄: ${JSON.stringify(result.checks)}`);

                        // 重新診斷
                        setTimeout(() => this.runFullDiagnostic(), 2000);
                    } else {
                        this.log(`❌ 深度重置失敗: ${result.error}`);
                    }
                } else {
                    this.log('❌ 深度重置功能不可用');
                }
            } catch (error) {
                this.log(`❌ 深度重置過程中發生錯誤: ${error.message}`);
            }
        }

        // 匯出診斷報告
        exportDiagnosticReport() {
            const logContent = document.getElementById('diagnostic-log-content');
            if (!logContent) return;

            const report = {
                timestamp: new Date().toISOString(),
                userAgent: navigator.userAgent,
                web3State: window.getWeb3State ? window.getWeb3State() : null,
                diagnosticLog: logContent.textContent,
                metaMaskInfo: {
                    hasEthereum: typeof window.ethereum !== 'undefined',
                    isMetaMask: window.ethereum?.isMetaMask,
                    chainId: window.ethereum?.chainId,
                    networkVersion: window.ethereum?.networkVersion
                }
            };

            const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `web3-diagnostic-${Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            this.log('📁 診斷報告已匯出');
        }

        // 記錄日誌
        log(message) {
            const logContent = document.getElementById('diagnostic-log-content');
            if (logContent) {
                const timestamp = new Date().toLocaleTimeString();
                logContent.innerHTML += `<div class="log-entry">[${timestamp}] ${message}</div>`;
                logContent.scrollTop = logContent.scrollHeight;
            }
            console.log(`Web3Diagnostic: ${message}`);
        }
    }

    // 全域實例
    window.Web3Diagnostic = new Web3Diagnostic();

})();