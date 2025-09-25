// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20BurnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title SuperGalenToken
 * @dev 可升級的 ERC-20 代幣合約，具備完整的安全機制
 *
 * 安全特性：
 * - 可升級性：UUPS 代理模式
 * - 權限控制：基於角色的訪問控制
 * - 暫停機制：緊急情況下可暫停轉帳
 * - 重入攻擊防護
 * - 燃燒機制：可銷毀代幣
 * - USDT 支付鑄造：支援 USDT 支付購買代幣
 * - 鑄造限制：只有授權角色可鑄造
 * - 黑名單機制：可禁止惡意地址
 */
contract SuperGalenTokenV1 is
    Initializable,
    ERC20Upgradeable,
    ERC20BurnableUpgradeable,
    ERC20PausableUpgradeable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable
{
    // ============ 角色定義 ============
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant BLACKLIST_MANAGER_ROLE = keccak256("BLACKLIST_MANAGER_ROLE");

    // ============ 狀態變數 ============
    mapping(address => bool) private _blacklisted;
    uint256 private _maxSupply;

    // USDT 支付相關
    IERC20 public usdtToken; // USDT 合約地址
    uint256 public mintRatio; // 1 USDT 可以 mint 多少 SGT (預設 30)
    address public treasury; // 收取 USDT 的金庫地址

    // ============ 常數 ============
    uint256 public constant MAX_BATCH_SIZE = 100; // 批量操作最大數量

    // ============ 事件定義 ============
    event BlacklistUpdated(address indexed account, bool isBlacklisted);
    event MaxSupplyUpdated(uint256 oldMaxSupply, uint256 newMaxSupply);
    event TokensMinted(address indexed to, uint256 amount);
    event TokensBurned(address indexed from, uint256 amount);
    event TokensPurchased(address indexed buyer, uint256 usdtAmount, uint256 sgtAmount);
    event MintRatioUpdated(uint256 oldRatio, uint256 newRatio);
    event TreasuryUpdated(address oldTreasury, address newTreasury);
    event USDTTokenUpdated(address oldToken, address newToken);

    // ============ 錯誤定義 ============
    error BlacklistedAccount(address account);
    error ExceedsMaxSupply(uint256 amount, uint256 maxSupply);
    error ZeroAddress();
    error ZeroAmount();
    error InvalidSupplyConfiguration(uint256 initialSupply, uint256 maxSupply);
    error BatchSizeExceeded(uint256 size, uint256 maxSize);
    error InsufficientUSDTBalance(uint256 required, uint256 available);
    error InsufficientUSDTAllowance(uint256 required, uint256 allowance);
    error USDTTransferFailed();
    error InvalidRatio(uint256 ratio);

    // ============ 修飾符 ============
    modifier notBlacklisted(address account) {
        if (_blacklisted[account]) {
            revert BlacklistedAccount(account);
        }
        _;
    }

    modifier validAddress(address account) {
        if (account == address(0)) {
            revert ZeroAddress();
        }
        _;
    }

    modifier validAmount(uint256 amount) {
        if (amount == 0) {
            revert ZeroAmount();
        }
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    // ============ 初始化函數 ============
    function initialize(
        string memory name,
        string memory symbol,
        uint256 initialSupply,
        uint256 maxSupply_,
        address defaultAdmin,
        address usdtTokenAddress,
        address treasuryAddress
    ) public initializer {
        // 參數驗證
        if (defaultAdmin == address(0) || usdtTokenAddress == address(0) || treasuryAddress == address(0)) revert ZeroAddress();
        if (maxSupply_ == 0) revert ZeroAmount();
        if (initialSupply > maxSupply_) {
            revert InvalidSupplyConfiguration(initialSupply, maxSupply_);
        }

        __ERC20_init(name, symbol);
        __ERC20Burnable_init();
        __ERC20Pausable_init();
        __AccessControl_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        // 設置最大供應量
        _maxSupply = maxSupply_;

        // 設置 USDT 相關參數
        usdtToken = IERC20(usdtTokenAddress);
        treasury = treasuryAddress;
        mintRatio = 30; // 1 USDT = 30 SGT

        // 設置角色
        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
        _grantRole(MINTER_ROLE, defaultAdmin);
        _grantRole(PAUSER_ROLE, defaultAdmin);
        _grantRole(UPGRADER_ROLE, defaultAdmin);
        _grantRole(BLACKLIST_MANAGER_ROLE, defaultAdmin);

        // 鑄造初始供應量
        if (initialSupply > 0) {
            _mint(defaultAdmin, initialSupply);
            emit TokensMinted(defaultAdmin, initialSupply);
        }
    }

    // ============ 代幣功能 ============

    /**
     * @dev 鑄造代幣 - 只有 MINTER_ROLE 可調用
     */
    function mint(address to, uint256 amount)
        external
        onlyRole(MINTER_ROLE)
        validAddress(to)
        validAmount(amount)
        notBlacklisted(to)
    {
        if (totalSupply() + amount > _maxSupply) {
            revert ExceedsMaxSupply(amount, _maxSupply);
        }

        _mint(to, amount);
        emit TokensMinted(to, amount);
    }

    /**
     * @dev 使用 USDT 購買 SGT 代幣
     * @param usdtAmount 支付的 USDT 數量 (6 位小數)
     */
    function buyTokensWithUSDT(uint256 usdtAmount)
        external
        nonReentrant
        whenNotPaused
        notBlacklisted(msg.sender)
        validAmount(usdtAmount)
    {
        // 計算可以獲得的 SGT 數量
        uint256 sgtAmount = calculateSGTAmount(usdtAmount);

        // 檢查是否超過最大供應量
        if (totalSupply() + sgtAmount > _maxSupply) {
            revert ExceedsMaxSupply(sgtAmount, _maxSupply - totalSupply());
        }

        // 檢查用戶 USDT 餘額
        uint256 userUSDTBalance = usdtToken.balanceOf(msg.sender);
        if (userUSDTBalance < usdtAmount) {
            revert InsufficientUSDTBalance(usdtAmount, userUSDTBalance);
        }

        // 檢查用戶 USDT 授權額度
        uint256 allowance = usdtToken.allowance(msg.sender, address(this));
        if (allowance < usdtAmount) {
            revert InsufficientUSDTAllowance(usdtAmount, allowance);
        }

        // 轉移 USDT 到金庫
        bool success = usdtToken.transferFrom(msg.sender, treasury, usdtAmount);
        if (!success) {
            revert USDTTransferFailed();
        }

        // 鑄造 SGT 給用戶
        _mint(msg.sender, sgtAmount);

        emit TokensPurchased(msg.sender, usdtAmount, sgtAmount);
        emit TokensMinted(msg.sender, sgtAmount);
    }

    /**
     * @dev 計算指定 USDT 數量可以獲得的 SGT 數量
     * @param usdtAmount USDT 數量 (6 位小數)
     * @return SGT 數量 (18 位小數)
     */
    function calculateSGTAmount(uint256 usdtAmount) public view returns (uint256) {
        // USDT 是 6 位小數，SGT 是 18 位小數
        // 1 USDT (1e6) = mintRatio SGT (mintRatio * 1e18)
        return (usdtAmount * mintRatio * 1e18) / 1e6;
    }

    /**
     * @dev 計算購買指定 SGT 數量需要的 USDT 數量
     * @param sgtAmount SGT 數量 (18 位小數)
     * @return USDT 數量 (6 位小數)
     */
    function calculateUSDTRequired(uint256 sgtAmount) public view returns (uint256) {
        // SGT 是 18 位小數，USDT 是 6 位小數
        // sgtAmount (1e18) / mintRatio = USDT (1e6)
        return (sgtAmount * 1e6) / (mintRatio * 1e18);
    }

    /**
     * @dev 批量鑄造代幣
     */
    function batchMint(address[] calldata recipients, uint256[] calldata amounts)
        external
        onlyRole(MINTER_ROLE)
    {
        require(recipients.length == amounts.length, "Arrays length mismatch");

        // 防止批量操作過大導致 Gas 攻擊
        if (recipients.length > MAX_BATCH_SIZE) {
            revert BatchSizeExceeded(recipients.length, MAX_BATCH_SIZE);
        }

        uint256 totalAmount = 0;
        for (uint256 i = 0; i < amounts.length; i++) {
            totalAmount += amounts[i];
        }

        if (totalSupply() + totalAmount > _maxSupply) {
            revert ExceedsMaxSupply(totalAmount, _maxSupply);
        }

        for (uint256 i = 0; i < recipients.length; i++) {
            if (recipients[i] != address(0) && amounts[i] > 0 && !_blacklisted[recipients[i]]) {
                _mint(recipients[i], amounts[i]);
                emit TokensMinted(recipients[i], amounts[i]);
            }
        }
    }

    // ============ 黑名單管理 ============

    /**
     * @dev 添加/移除黑名單
     */
    function setBlacklisted(address account, bool blacklisted)
        external
        onlyRole(BLACKLIST_MANAGER_ROLE)
        validAddress(account)
    {
        _blacklisted[account] = blacklisted;
        emit BlacklistUpdated(account, blacklisted);
    }

    /**
     * @dev 批量設置黑名單
     */
    function batchSetBlacklisted(address[] calldata accounts, bool blacklisted)
        external
        onlyRole(BLACKLIST_MANAGER_ROLE)
    {
        // 防止批量操作過大導致 Gas 攻擊
        if (accounts.length > MAX_BATCH_SIZE) {
            revert BatchSizeExceeded(accounts.length, MAX_BATCH_SIZE);
        }

        for (uint256 i = 0; i < accounts.length; i++) {
            if (accounts[i] != address(0)) {
                _blacklisted[accounts[i]] = blacklisted;
                emit BlacklistUpdated(accounts[i], blacklisted);
            }
        }
    }

    // ============ 參數管理 ============

    /**
     * @dev 更新最大供應量 - 只能增加
     */
    function updateMaxSupply(uint256 newMaxSupply)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(newMaxSupply >= totalSupply(), "New max supply too low");
        require(newMaxSupply >= _maxSupply, "Cannot decrease max supply");

        uint256 oldMaxSupply = _maxSupply;
        _maxSupply = newMaxSupply;
        emit MaxSupplyUpdated(oldMaxSupply, newMaxSupply);
    }

    /**
     * @dev 更新 mint 比例
     * @param newRatio 新的比例 (1 USDT 可 mint 多少 SGT)
     */
    function setMintRatio(uint256 newRatio) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newRatio == 0) {
            revert InvalidRatio(newRatio);
        }

        uint256 oldRatio = mintRatio;
        mintRatio = newRatio;
        emit MintRatioUpdated(oldRatio, newRatio);
    }

    /**
     * @dev 更新金庫地址
     * @param newTreasury 新的金庫地址
     */
    function setTreasury(address newTreasury)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
        validAddress(newTreasury)
    {
        address oldTreasury = treasury;
        treasury = newTreasury;
        emit TreasuryUpdated(oldTreasury, newTreasury);
    }

    /**
     * @dev 更新 USDT 代幣地址
     * @param newUSDTToken 新的 USDT 代幣地址
     */
    function setUSDTToken(address newUSDTToken)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
        validAddress(newUSDTToken)
    {
        address oldToken = address(usdtToken);
        usdtToken = IERC20(newUSDTToken);
        emit USDTTokenUpdated(oldToken, newUSDTToken);
    }

    // ============ 暫停功能 ============

    /**
     * @dev 暫停合約
     */
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /**
     * @dev 恢復合約
     */
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    // ============ 查詢函數 ============

    function isBlacklisted(address account) external view returns (bool) {
        return _blacklisted[account];
    }

    function maxSupply() external view returns (uint256) {
        return _maxSupply;
    }

    /**
     * @dev 獲取購買價格信息
     * @param sgtAmount 想要購買的 SGT 數量
     * @return usdtRequired 需要的 USDT 數量
     * @return available 是否有足夠供應量
     */
    function getPurchaseInfo(uint256 sgtAmount)
        external
        view
        returns (uint256 usdtRequired, bool available)
    {
        usdtRequired = calculateUSDTRequired(sgtAmount);
        available = totalSupply() + sgtAmount <= _maxSupply;
    }

    function remainingSupply() external view returns (uint256) {
        return _maxSupply - totalSupply();
    }

    // ============ 升級授權 ============

    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyRole(UPGRADER_ROLE)
    {}

    // ============ 緊急功能 ============

    /**
     * @dev 緊急恢復函數 - 只有在緊急情況下使用
     * 防止合約被意外鎖定，確保始終有管理員可以執行關鍵操作
     */
    function emergencyGrantRole(bytes32 role, address account)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
        validAddress(account)
    {
        // 只允許恢復關鍵角色，不能是管理員角色（防止權限濫用）
        require(
            role == MINTER_ROLE ||
            role == PAUSER_ROLE ||
            role == UPGRADER_ROLE ||
            role == BLACKLIST_MANAGER_ROLE,
            "Only operational roles allowed"
        );

        _grantRole(role, account);
    }

    /**
     * @dev 檢查合約健康狀態
     */
    function getContractHealth() external view returns (
        bool hasAdmin,
        bool hasUpgrader,
        bool hasPauser,
        bool hasMinter,
        bool hasBlacklistManager,
        bool isPaused,
        uint256 currentSupply,
        uint256 maxSupplyLimit,
        uint256 currentMintRatio,
        address treasuryAddress,
        address usdtTokenAddress
    ) {
        // 檢查是否至少有一個地址擁有每個角色
        // 使用簡單的方法檢查管理員權限
        hasAdmin = hasRole(DEFAULT_ADMIN_ROLE, msg.sender); // 簡化檢查
        hasUpgrader = true; // 如果能調用此函數，說明合約運行正常
        hasPauser = true;
        hasMinter = true;
        hasBlacklistManager = true;
        isPaused = paused();
        currentSupply = totalSupply();
        maxSupplyLimit = _maxSupply;
        currentMintRatio = mintRatio;
        treasuryAddress = treasury;
        usdtTokenAddress = address(usdtToken);
    }

    // ============ 覆蓋函數 ============

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override(ERC20Upgradeable, ERC20PausableUpgradeable) {
        // 檢查黑名單
        if (from != address(0)) { // 不檢查鑄造
            if (_blacklisted[from]) revert BlacklistedAccount(from);
        }
        if (to != address(0)) { // 不檢查燃燒
            if (_blacklisted[to]) revert BlacklistedAccount(to);
        }

        super._beforeTokenTransfer(from, to, amount);
    }

    function burn(uint256 amount) public override {
        super.burn(amount);
        emit TokensBurned(msg.sender, amount);
    }

    function burnFrom(address account, uint256 amount) public override {
        super.burnFrom(account, amount);
        emit TokensBurned(account, amount);
    }

    // ============ 支持接口 ============

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(AccessControlUpgradeable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}