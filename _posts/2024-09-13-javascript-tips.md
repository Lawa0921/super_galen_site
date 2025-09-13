---
layout: post
title: "實用的 JavaScript 技巧分享"
date: 2024-09-13
categories: programming
tags: [JavaScript, 網頁開發, 前端技術]
---

在網頁開發中，JavaScript 是不可或缺的一部分。今天來分享一些實用的 JavaScript 技巧。

## 解構賦值

解構賦值讓我們可以更優雅地從陣列或物件中提取數據：

```javascript
// 陣列解構
const [first, second] = [1, 2, 3];

// 物件解構
const { name, age } = { name: 'John', age: 30 };
```

## 展開運算符

展開運算符 (...) 可以用來複製陣列或物件：

```javascript
// 複製陣列
const newArray = [...oldArray];

// 合併物件
const merged = { ...obj1, ...obj2 };
```

## 條件鏈接運算符

條件鏈接運算符 (?.) 讓我們可以安全地訪問嵌套屬性：

```javascript
const value = user?.profile?.email;
```

## 空值合併運算符

空值合併運算符 (??) 只在左側值為 null 或 undefined 時返回右側值：

```javascript
const port = process.env.PORT ?? 3000;
```

這些技巧能讓你的程式碼更簡潔且易讀！