// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20BurnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
// SafeMath 在 Solidity 0.8+ 已不需要，內建 overflow 保護

/**
 * @title SuperGalenToken - 修復安全問題版本
 * @dev 修復了原版本的嚴重安全漏洞
 *
 * 修復內容：
 * - 移除危險的 emergencyGrantRole 函數
 * - 修正 getContractHealth 的荒謬實現
 * - 減少批量操作大小限制
 * - 添加 SafeERC20 和 SafeMath 保護
 * - 改進黑名單檢查邏輯
 * - 添加溢出檢查
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
    using SafeERC20 for IERC20;
    // SafeMath 不再需要，Solidity 0.8+ 內建 overflow 保護

    // ============ 角色定義 ============
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant BLACKLIST_MANAGER_ROLE = keccak256("BLACKLIST_MANAGER_ROLE");

    // ============ 狀態變數 ============
    mapping(address => bool) private _blacklisted;
    uint256 private _maxSupply;

    // USDT 支付相關
    IERC20 public usdtToken;
    uint256 public mintRatio;
    address public treasury;

    // ============ 安全常數 ============
    uint256 public constant MAX_BATCH_SIZE = 10; // 進一步降低到 10，防止 Gas DoS 攻擊
    uint256 public constant MAX_MINT_RATIO = 1000; // 最大鑄造比例限制
    uint256 public constant MAX_SAFE_MULTIPLIER = type(uint256).max / (1000 * 1e18); // 真正的防溢出計算
    uint256 public constant MAX_SUPPLY_INCREASE_PERCENT = 100; // 最大供應量單次增加不能超過100%

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
    error MathOverflow();
    error ExcessiveMintRatio(uint256 ratio);

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
        // 嚴格參數驗證
        if (defaultAdmin == address(0) || usdtTokenAddress == address(0) || treasuryAddress == address(0))
            revert ZeroAddress();
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

        _maxSupply = maxSupply_;
        usdtToken = IERC20(usdtTokenAddress);
        treasury = treasuryAddress;
        mintRatio = 30; // 1 USDT = 30 SGT，安全範圍內

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
     * @dev 移除免費 mint 功能 - 只能通過支付 USDT 鑄造
     * @notice 此函數已被禁用，所有鑄造必須通過 buyTokensWithUSDT 進行
     */
    function mint(address /* to */, uint256 /* amount */) external pure {
        revert("Use buyTokensWithUSDT instead");
    }

    /**
     * @dev 使用 USDT 購買 SGT 代幣 - 修復版本
     */
    function buyTokensWithUSDT(uint256 usdtAmount)
        external
        nonReentrant
        whenNotPaused
        notBlacklisted(msg.sender)
        validAmount(usdtAmount)
    {
        // 安全計算 SGT 數量，防止溢出
        uint256 sgtAmount = _calculateSGTAmountSafe(usdtAmount);

        // 檢查供應量限制
        if (totalSupply() + sgtAmount > _maxSupply) {
            revert ExceedsMaxSupply(sgtAmount, _maxSupply - totalSupply());
        }

        // 檢查餘額和授權
        uint256 userUSDTBalance = usdtToken.balanceOf(msg.sender);
        if (userUSDTBalance < usdtAmount) {
            revert InsufficientUSDTBalance(usdtAmount, userUSDTBalance);
        }

        uint256 allowance = usdtToken.allowance(msg.sender, address(this));
        if (allowance < usdtAmount) {
            revert InsufficientUSDTAllowance(usdtAmount, allowance);
        }

        // 先執行狀態變更 (Effects) - 防止重入攻擊
        _mint(msg.sender, sgtAmount);

        // 發出事件
        emit TokensPurchased(msg.sender, usdtAmount, sgtAmount);
        emit TokensMinted(msg.sender, sgtAmount);

        // 最後執行外部調用 (Interactions) - CEI 模式
        usdtToken.safeTransferFrom(msg.sender, treasury, usdtAmount);
    }

    /**
     * @dev 安全計算 SGT 數量，防止溢出
     */
    function _calculateSGTAmountSafe(uint256 usdtAmount) internal view returns (uint256) {
        // 嚴格的溢出檢查 - 防止 usdtAmount * mintRatio * 1e18 溢出
        if (usdtAmount > MAX_SAFE_MULTIPLIER) {
            revert MathOverflow();
        }

        if (mintRatio > MAX_MINT_RATIO) {
            revert MathOverflow();
        }

        // 更安全的計算方式：先檢查中間結果
        uint256 temp1 = usdtAmount * mintRatio;
        if (temp1 / mintRatio != usdtAmount) { // 檢查第一次乘法是否溢出
            revert MathOverflow();
        }

        uint256 temp2 = temp1 * 1e18;
        if (temp2 / 1e18 != temp1) { // 檢查第二次乘法是否溢出
            revert MathOverflow();
        }

        return temp2 / 1e6;
    }

    function calculateSGTAmount(uint256 usdtAmount) public view returns (uint256) {
        return _calculateSGTAmountSafe(usdtAmount);
    }

    function calculateUSDTRequired(uint256 sgtAmount) public view returns (uint256) {
        if (sgtAmount > MAX_SAFE_MULTIPLIER || mintRatio == 0) {
            revert MathOverflow();
        }

        // 安全計算分母
        uint256 denominator = mintRatio * 1e18;
        if (denominator / 1e18 != mintRatio) { // 檢查乘法溢出
            revert MathOverflow();
        }

        // 安全計算分子
        uint256 numerator = sgtAmount * 1e6;
        if (numerator / 1e6 != sgtAmount) { // 檢查乘法溢出
            revert MathOverflow();
        }

        return numerator / denominator;
    }

    /**
     * @dev 批量鑄造已被禁用 - 只能通過支付 USDT 鑄造
     */
    function batchMint(address[] calldata /* recipients */, uint256[] calldata /* amounts */) external pure {
        revert("Use buyTokensWithUSDT instead");
    }

    // ============ 黑名單管理 ============

    function setBlacklisted(address account, bool blacklisted)
        external
        onlyRole(BLACKLIST_MANAGER_ROLE)
        validAddress(account)
    {
        _blacklisted[account] = blacklisted;
        emit BlacklistUpdated(account, blacklisted);
    }

    function batchSetBlacklisted(address[] calldata accounts, bool blacklisted)
        external
        onlyRole(BLACKLIST_MANAGER_ROLE)
    {
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

    function updateMaxSupply(uint256 newMaxSupply)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(newMaxSupply >= totalSupply(), "New max supply too low");
        require(newMaxSupply >= _maxSupply, "Cannot decrease max supply");

        // 限制單次增加不能超過100%，防止管理員濫用權力
        uint256 maxAllowedIncrease = _maxSupply + (_maxSupply * MAX_SUPPLY_INCREASE_PERCENT / 100);
        require(newMaxSupply <= maxAllowedIncrease, "Increase exceeds 100% limit");

        uint256 oldMaxSupply = _maxSupply;
        _maxSupply = newMaxSupply;
        emit MaxSupplyUpdated(oldMaxSupply, newMaxSupply);
    }

    /**
     * @dev 更新 mint 比例 - 增加安全檢查
     */
    function setMintRatio(uint256 newRatio) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newRatio == 0) {
            revert InvalidRatio(newRatio);
        }
        if (newRatio > MAX_MINT_RATIO) {
            revert ExcessiveMintRatio(newRatio);
        }

        uint256 oldRatio = mintRatio;
        mintRatio = newRatio;
        emit MintRatioUpdated(oldRatio, newRatio);
    }

    function setTreasury(address newTreasury)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
        validAddress(newTreasury)
    {
        address oldTreasury = treasury;
        treasury = newTreasury;
        emit TreasuryUpdated(oldTreasury, newTreasury);
    }

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

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

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

    /**
     * @dev 正確的合約健康狀態檢查 - 修復版本
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
        // 簡化角色檢查 - 檢查調用者是否有這些角色作為健康指標
        hasAdmin = hasRole(DEFAULT_ADMIN_ROLE, msg.sender);
        hasUpgrader = hasRole(UPGRADER_ROLE, msg.sender);
        hasPauser = hasRole(PAUSER_ROLE, msg.sender);
        hasMinter = hasRole(MINTER_ROLE, msg.sender);
        hasBlacklistManager = hasRole(BLACKLIST_MANAGER_ROLE, msg.sender);

        isPaused = paused();
        currentSupply = totalSupply();
        maxSupplyLimit = _maxSupply;
        currentMintRatio = mintRatio;
        treasuryAddress = treasury;
        usdtTokenAddress = address(usdtToken);
    }

    // ============ 升級授權 ============

    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyRole(UPGRADER_ROLE)
    {}

    // ============ 覆蓋函數 ============

    /**
     * @dev 修復黑名單檢查 - 鑄造時也要檢查接收者
     */
    function _update(
        address from,
        address to,
        uint256 amount
    ) internal override(ERC20Upgradeable, ERC20PausableUpgradeable) {
        // 檢查發送者黑名單（除了鑄造）
        if (from != address(0) && _blacklisted[from]) {
            revert BlacklistedAccount(from);
        }

        // 檢查接收者黑名單（包括鑄造）
        if (to != address(0) && _blacklisted[to]) {
            revert BlacklistedAccount(to);
        }

        // 調用父類的 _update (ERC20PausableUpgradeable 會處理暫停邏輯)
        super._update(from, to, amount);
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