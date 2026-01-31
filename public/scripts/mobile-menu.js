// 行動版選單控制
class MobileMenuController {
    constructor() {
        this.menuToggle = document.getElementById('mobile-menu-toggle');
        this.menuClose = document.getElementById('mobile-menu-close');
        this.menu = document.getElementById('mobile-menu');
        this.overlay = document.getElementById('mobile-menu-overlay');

        // 共用元件
        this.languageSwitcher = document.getElementById('language-switcher');
        this.themeSwitch = document.getElementById('shared-theme-switch');

        // 容器
        this.desktopNav = document.querySelector('.desktop-nav');
        this.mobileLanguageContainer = document.getElementById('mobile-language-container');
        this.mobileThemeContainer = document.getElementById('mobile-theme-container');

        if (this.menuToggle && this.menu && this.overlay) {
            this.init();
        }
    }

    init() {
        // 根據視窗大小移動共用元件
        this.moveSharedControls();

        // 監聽視窗大小變化
        window.addEventListener('resize', () => this.moveSharedControls());

        // 開啟選單
        this.menuToggle.addEventListener('click', () => this.openMenu());

        // 關閉選單
        this.menuClose.addEventListener('click', () => this.closeMenu());
        this.overlay.addEventListener('click', () => this.closeMenu());

        // ESC 鍵關閉
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.menu.classList.contains('active')) {
                this.closeMenu();
            }
        });

        // 同步錢包狀態
        this.syncWalletState();

        // 監聽語言變更事件，重新同步狀態
        window.addEventListener('languageChanged', () => {
            this.resyncWalletStatus();
        });
        window.addEventListener('i18n:languageChanged', () => {
            this.resyncWalletStatus();
        });
    }

    // 重新同步錢包狀態（語言變更後）
    resyncWalletStatus() {
        // 延遲執行，等待 i18n 系統更新完桌面版
        setTimeout(() => {
            const desktopWalletStatus = document.getElementById('wallet-status-header');
            const mobileWalletStatus = document.getElementById('wallet-status-mobile');

            // 只在錢包已連接時才同步
            if (desktopWalletStatus && !desktopWalletStatus.classList.contains('hidden')) {
                if (mobileWalletStatus) {
                    mobileWalletStatus.classList.remove('hidden');
                }

                // 重新同步網路名稱
                const networkName = document.getElementById('network-name');
                const mobileNetworkName = document.getElementById('network-name-mobile');
                if (networkName && mobileNetworkName) {
                    // 複製 data-i18n 屬性和內容
                    const i18nKey = networkName.getAttribute('data-i18n');
                    if (i18nKey) {
                        mobileNetworkName.setAttribute('data-i18n', i18nKey);
                    }
                    mobileNetworkName.textContent = networkName.textContent;
                }

                // 重新同步地址
                const userAddress = document.getElementById('user-address');
                const mobileUserAddress = document.getElementById('user-address-mobile');
                if (userAddress && mobileUserAddress) {
                    // 檢查是否是真實地址（0x 開頭）還是翻譯文字
                    const addressText = userAddress.textContent;
                    if (addressText && addressText.startsWith('0x')) {
                        // 是真實地址，直接同步，移除 data-i18n
                        mobileUserAddress.textContent = addressText;
                        mobileUserAddress.removeAttribute('data-i18n');
                    } else {
                        // 是翻譯文字，同步 data-i18n
                        const i18nKey = userAddress.getAttribute('data-i18n');
                        if (i18nKey) {
                            mobileUserAddress.setAttribute('data-i18n', i18nKey);
                            mobileUserAddress.textContent = addressText;
                        }
                    }
                }

                // 重新同步網路指示器
                const networkIndicator = document.getElementById('network-indicator');
                const mobileNetworkIndicator = document.getElementById('network-indicator-mobile');
                if (networkIndicator && mobileNetworkIndicator) {
                    mobileNetworkIndicator.innerHTML = networkIndicator.innerHTML;
                }

                // 同步 SGT 餘額
                const desktopSgtBalance = document.getElementById('sgt-balance-header');
                const mobileSgtBalance = document.getElementById('sgt-balance-mobile');
                if (desktopSgtBalance && mobileSgtBalance) {
                    if (!desktopSgtBalance.classList.contains('hidden')) {
                        mobileSgtBalance.classList.remove('hidden');
                        const balanceAmount = document.getElementById('sgt-balance-amount');
                        const mobileBalanceAmount = document.getElementById('sgt-balance-amount-mobile');
                        if (balanceAmount && mobileBalanceAmount) {
                            mobileBalanceAmount.textContent = balanceAmount.textContent;
                        }
                    }
                }
            }
        }, 100); // 延遲 100ms，等待 i18n 更新完成
    }

    // 根據螢幕大小移動共用元件
    moveSharedControls() {
        const isMobile = window.innerWidth <= 1024;

        if (isMobile) {
            // 行動版：移動到行動選單
            if (this.languageSwitcher && this.mobileLanguageContainer) {
                this.mobileLanguageContainer.appendChild(this.languageSwitcher);
            }
            if (this.themeSwitch && this.mobileThemeContainer) {
                this.mobileThemeContainer.appendChild(this.themeSwitch);
            }
        } else {
            // 桌面版：移回桌面導航
            if (this.languageSwitcher && this.desktopNav) {
                this.desktopNav.appendChild(this.languageSwitcher);
            }
            if (this.themeSwitch && this.desktopNav) {
                this.desktopNav.appendChild(this.themeSwitch);
            }
        }
    }

    openMenu() {
        this.menu.classList.add('active');
        this.overlay.classList.add('active');
        document.body.classList.add('menu-open');
    }

    closeMenu() {
        this.menu.classList.remove('active');
        this.overlay.classList.remove('active');
        document.body.classList.remove('menu-open');
    }

    // 同步錢包狀態（桌面版 ↔ 行動版）
    syncWalletState() {
        // 監聽桌面版錢包按鈕變化
        const desktopConnectBtn = document.getElementById('connect-wallet-header');
        const mobileConnectBtn = document.getElementById('connect-wallet-mobile');

        const desktopWalletStatus = document.getElementById('wallet-status-header');
        const mobileWalletStatus = document.getElementById('wallet-status-mobile');

        const desktopSgtBalance = document.getElementById('sgt-balance-header');
        const mobileSgtBalance = document.getElementById('sgt-balance-mobile');

        const desktopNetworkSwitch = document.getElementById('switch-to-polygon-header');
        const mobileNetworkSwitch = document.getElementById('switch-to-polygon-mobile');

        // 使用 MutationObserver 監聽顯示狀態變化
        const observer = new MutationObserver(() => {
            // 同步連接按鈕
            if (desktopConnectBtn && mobileConnectBtn) {
                mobileConnectBtn.style.display = desktopConnectBtn.style.display;
            }

            // 同步錢包狀態
            if (desktopWalletStatus && mobileWalletStatus) {
                if (desktopWalletStatus.classList.contains('hidden')) {
                    mobileWalletStatus.classList.add('hidden');
                } else {
                    mobileWalletStatus.classList.remove('hidden');
                    // 同步網路名稱和地址
                    const networkName = document.getElementById('network-name');
                    const mobileNetworkName = document.getElementById('network-name-mobile');
                    if (networkName && mobileNetworkName) {
                        mobileNetworkName.textContent = networkName.textContent;
                        mobileNetworkName.setAttribute('data-i18n', networkName.getAttribute('data-i18n') || '');
                    }

                    const userAddress = document.getElementById('user-address');
                    const mobileUserAddress = document.getElementById('user-address-mobile');
                    if (userAddress && mobileUserAddress) {
                        mobileUserAddress.textContent = userAddress.textContent;
                    }

                    const networkIndicator = document.getElementById('network-indicator');
                    const mobileNetworkIndicator = document.getElementById('network-indicator-mobile');
                    if (networkIndicator && mobileNetworkIndicator) {
                        mobileNetworkIndicator.innerHTML = networkIndicator.innerHTML;
                    }
                }
            }

            // 同步 SGT 餘額
            if (desktopSgtBalance && mobileSgtBalance) {
                if (desktopSgtBalance.classList.contains('hidden')) {
                    mobileSgtBalance.classList.add('hidden');
                } else {
                    mobileSgtBalance.classList.remove('hidden');
                    const balanceAmount = document.getElementById('sgt-balance-amount');
                    const mobileBalanceAmount = document.getElementById('sgt-balance-amount-mobile');
                    if (balanceAmount && mobileBalanceAmount) {
                        mobileBalanceAmount.textContent = balanceAmount.textContent;
                    }
                }
            }

            // 同步網路切換按鈕
            if (desktopNetworkSwitch && mobileNetworkSwitch) {
                if (desktopNetworkSwitch.classList.contains('hidden')) {
                    mobileNetworkSwitch.classList.add('hidden');
                } else {
                    mobileNetworkSwitch.classList.remove('hidden');
                }
            }
        });

        // 監聽桌面版元素的變化
        if (desktopConnectBtn) {
            observer.observe(desktopConnectBtn, { attributes: true, attributeFilter: ['style'] });
        }
        if (desktopWalletStatus) {
            observer.observe(desktopWalletStatus, { attributes: true, attributeFilter: ['class'], subtree: true, childList: true, characterData: true });
        }
        if (desktopSgtBalance) {
            observer.observe(desktopSgtBalance, { attributes: true, attributeFilter: ['class'], subtree: true, childList: true, characterData: true });
        }
        if (desktopNetworkSwitch) {
            observer.observe(desktopNetworkSwitch, { attributes: true, attributeFilter: ['class'] });
        }

        // 行動版按鈕事件綁定（轉發到桌面版）
        if (mobileConnectBtn && desktopConnectBtn) {
            mobileConnectBtn.addEventListener('click', () => {
                desktopConnectBtn.click();
                this.closeMenu();
            });
        }

        const mobileDisconnectBtn = document.getElementById('disconnect-wallet-mobile');
        const desktopDisconnectBtn = document.getElementById('disconnect-wallet-header');
        if (mobileDisconnectBtn && desktopDisconnectBtn) {
            mobileDisconnectBtn.addEventListener('click', () => {
                desktopDisconnectBtn.click();
                this.closeMenu();
            });
        }

        if (mobileNetworkSwitch && desktopNetworkSwitch) {
            mobileNetworkSwitch.addEventListener('click', () => {
                desktopNetworkSwitch.click();
                this.closeMenu();
            });
        }
    }
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    window.mobileMenuController = new MobileMenuController();
});
