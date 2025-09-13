---
layout: post
title: "Git 工作流程最佳實踐"
date: 2024-09-05
categories: tools
tags: [Git, 版本控制, 開發工具]
---

良好的 Git 工作流程對團隊協作至關重要。讓我們來看看一些最佳實踐。

## Git Flow 工作流程

Git Flow 是一種流行的分支管理策略：

- **main/master**: 生產環境代碼
- **develop**: 開發分支
- **feature/**: 功能分支
- **hotfix/**: 緊急修復分支
- **release/**: 發布準備分支

## 提交訊息規範

良好的提交訊息應該：

```
feat: 新增使用者登入功能

- 實作 JWT 認證
- 加入記住我選項
- 更新登入介面設計
```

## 有用的 Git 命令

```bash
# 互動式 rebase
git rebase -i HEAD~3

# 暫存當前修改
git stash

# 查看分支圖
git log --graph --oneline --all

# 撤銷最後一次提交
git reset --soft HEAD~1
```

## 分支命名規範

- feature/user-authentication
- bugfix/login-error
- hotfix/security-patch

遵循這些實踐可以讓版本管理更加有序！