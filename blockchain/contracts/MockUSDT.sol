// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockUSDT
 * @dev Mock USDT 合約，用於本地測試
 * @notice 這是一個測試用的 USDT 代幣合約，模擬真實的 USDT 行為
 */
contract MockUSDT is ERC20, Ownable {

    constructor() ERC20("Mock USDT", "USDT") Ownable(msg.sender) {}

    /**
     * @dev 返回代幣的小數位數 (USDT 是 6 位小數)
     */
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /**
     * @dev 鑄造代幣 (僅供測試使用)
     * @param to 接收地址
     * @param amount 鑄造數量 (6 位小數)
     */
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /**
     * @dev 給任何人鑄造一些測試 USDT (用於簡化測試)
     * @param amount 鑄造數量
     */
    function faucet(uint256 amount) external {
        require(amount <= 10000 * 10**decimals(), "Too much USDT requested");
        _mint(msg.sender, amount);
    }

    /**
     * @dev 批量鑄造給多個地址
     * @param recipients 接收地址數組
     * @param amounts 數量數組
     */
    function batchMint(address[] calldata recipients, uint256[] calldata amounts) external onlyOwner {
        require(recipients.length == amounts.length, "Arrays length mismatch");

        for (uint256 i = 0; i < recipients.length; i++) {
            _mint(recipients[i], amounts[i]);
        }
    }

    /**
     * @dev 銷毀代幣
     * @param amount 銷毀數量
     */
    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }
}