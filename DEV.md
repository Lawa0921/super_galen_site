# 開發環境設置

## 快速開始

```bash
# 啟動開發環境（Jekyll + Hardhat）
./dev
```

這會同時啟動：
- **Jekyll 網站**: http://127.0.0.1:4000
- **Hardhat 區塊鏈**: http://127.0.0.1:8545

## 手動控制

```bash
# 使用 Foreman 啟動
bundle exec foreman start -f Procfile.dev

# 只啟動 Jekyll
bundle exec jekyll serve --host 127.0.0.1 --port 4000 --livereload

# 只啟動 Hardhat
cd blockchain && npx hardhat node --hostname 127.0.0.1 --port 8545
```

## 服務說明

| 服務 | 端口 | 用途 |
|------|------|------|
| Jekyll | 4000 | 主網站開發服務器 |
| Hardhat | 8545 | 本地區塊鏈節點 |

## 停止服務

按 `Ctrl+C` 即可停止所有服務，Foreman 會自動清理。

## 特色功能

- ✅ **自動重載**: Jekyll 檔案變更時自動重新載入
- ✅ **並行管理**: 一個命令管理多個服務
- ✅ **優雅退出**: Ctrl+C 停止所有服務
- ✅ **彩色日誌**: 不同服務用不同顏色區分