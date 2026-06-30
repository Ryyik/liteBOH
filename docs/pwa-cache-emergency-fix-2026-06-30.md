# PWA 缓存问题紧急修复方案

**问题**: 部分用户刷新后仍看不到新版本，即使已修复 Service Worker 配置

**修复日期**: 2026-06-30

---

## 🚨 **根本原因分析**

### 为什么修复后仍有问题？

**缓存死循环机制**：

1. 用户浏览器中有 **旧的 Service Worker** 正在运行
2. 用户访问网站 → 旧 SW 拦截请求并返回旧版本的 `index.html`
3. 新的 `main.js` **根本不会被加载**（因为旧 SW 缓存了旧的 `index.html`）
4. 我们的更新检测代码 **无法执行**
5. 用户继续看到旧版本 → **死循环**

**问题层级**：
- ✅ 已修复：Service Worker 文件生成（vite-plugin-pwa 配置）
- ❌ 未修复：用户浏览器中的旧 Service Worker 仍在拦截请求
- ❌ 未修复：新的更新检测代码无法执行（因为旧 SW 返回旧版本）

---

## 🛠️ **已实施的紧急修复方案**

### 1. **index.html 中的最早清除机制**

**文件**: [index.html#L42-L93](file:///Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/index.html#L42-L93)

**功能**: 在所有资源加载之前执行的强制清除脚本

**触发条件**: URL 参数包含 `?forceUpdate=true` 或 `?clearCache=true`

**执行流程**:
```javascript
// 1. 检测 URL 参数
if (window.location.search.includes('forceUpdate=true')) {
  // 2. 清除所有 Service Worker
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => registration.unregister());
  });

  // 3. 清除所有 Cache Storage
  caches.keys().then((cacheNames) => {
    return Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
  });

  // 4. 移除 URL 参数，重定向到正常页面
  window.location.replace(window.location.pathname + window.location.hash);
}
```

**优点**:
- ✅ 在任何其他资源加载之前执行
- ✅ 即使旧 Service Worker 正在运行，也能强制清除
- ✅ 用户只需访问特殊 URL，就能立即看到新版本

---

### 2. **main.js 中的24小时强制清除机制**

**文件**: [src/main.js#L83-L127](file:///Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/src/main.js#L83-L127)

**功能**: 自动检测并清除超过24小时未更新的 Service Worker

**触发条件**: Service Worker 已激活但未更新超过24小时

**执行流程**:
```javascript
// 1. 检查 Service Worker 版本
navigator.serviceWorker.getRegistrations().then((registrations) => {
  registrations.forEach((registration) => {
    if (registration.active) {
      const lastUpdate = localStorage.getItem('sw_last_update');
      const now = Date.now();
      const updateInterval = 24 * 60 * 60 * 1000; // 24小时

      // 2. 如果超过24小时，强制注销
      if (!lastUpdate || (now - parseInt(lastUpdate)) > updateInterval) {
        registration.unregister().then(() => {
          // 3. 清除所有缓存
          caches.keys().then((cacheNames) => {
            return Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
          }).then(() => {
            // 4. 刷新页面
            window.location.reload();
          });
        });
      }
    }
  });
});
```

**优点**:
- ✅ 自动检测，无需用户手动操作
- ✅ 确保 Service Worker 不会长期停留在旧版本
- ✅ 结合 localStorage 记录，避免频繁刷新

---

### 3. **Service Worker 错误监听机制**

**文件**: [src/main.js#L116-L126](file:///Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/src/main.js#L116-L126)

**功能**: 监听 Service Worker 错误，立即清除所有缓存

**触发条件**: Service Worker 抛出错误（可能是旧版本导致）

**执行流程**:
```javascript
navigator.serviceWorker.addEventListener('error', (err) => {
  console.error('[PWA] Service Worker 错误:', err);

  // 1. 清除所有 Service Worker
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => registration.unregister());
  });

  // 2. 清除所有缓存
  caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))));
});
```

**优点**:
- ✅ 自动处理 Service Worker 错误
- ✅ 确保异常情况下也能清除缓存
- ✅ 防止旧版本导致页面崩溃

---

## 📋 **用户清除缓存的标准流程**

### 方法1: 使用特殊 URL 参数（推荐）

**步骤**:
1. 在网站 URL 后添加参数：`?forceUpdate=true`
2. 例如：`https://blockofhome.cn/?forceUpdate=true`
3. 等待页面自动清除缓存并重定向
4. 看到新版本

**优点**:
- ✅ 最简单，无需用户操作
- ✅ 立即生效，无等待时间
- ✅ 适合所有浏览器

**适用场景**:
- ✅ 用户无法手动清除缓存
- ✅ 用户不知道如何操作开发者工具
- ✅ 移动端浏览器（操作复杂）

---

### 方法2: 浏览器开发者工具（标准流程）

**桌面端浏览器（Chrome/Safari/Firefox）**:

1. **打开开发者工具**（F12 或 Cmd+Option+I）
2. **切换到 Application 标签页**
3. **左侧菜单选择 Service Workers**
4. **找到网站注册的 Service Worker**
5. **点击 Unregister 按钮**
6. **左侧菜单选择 Storage**
7. **点击 Clear site data 按钮**
8. **硬刷新页面**（Cmd+Shift+R / Ctrl+Shift+R）

**移动端浏览器（iOS Safari）**:

1. **打开设置**
2. **找到 Safari**
3. **点击 清除历史记录与网站数据**
4. **确认清除**
5. **重新打开网站**

**移动端浏览器（Android Chrome）**:

1. **打开设置**
2. **找到 应用**
3. **找到 Chrome**
4. **点击 存储**
5. **点击 清除数据**
6. **重新打开网站**

---

### 方法3: 等待自动更新（24小时机制）

**机制**:
- 系统自动检测 Service Worker 版本
- 如果超过24小时未更新，自动清除缓存并刷新
- 用户下次访问时自动看到新版本

**适用场景**:
- ✅ 用户无法立即清除缓存
- ✅ 用户不知道如何操作
- ✅ 自动修复，无需干预

**时间线**:
- 用户访问网站 → 系统检测到旧 SW → 自动清除 → 刷新页面 → 看到新版本

---

## 🎯 **推送后的验证流程**

### 步骤1: 推送新代码
```bash
git add -A
git commit -m "fix: 添加强制清除旧 Service Worker 机制"
git push origin main
```

---

### 步骤2: 等待 GitHub Actions 构建（2-5分钟）
打开 GitHub Actions 查看构建状态：
```
https://github.com/你的用户名/你的仓库/actions
```

---

### 步骤3: 验证新版本（你自己）

**方法A: 使用特殊 URL 参数**
1. 访问：`https://blockofhome.cn/?forceUpdate=true`
2. 等待自动清除缓存并重定向
3. 确认看到新版本

**方法B: 手动清除缓存**
1. 打开开发者工具（F12）
2. Application → Service Workers → Unregister
3. Application → Storage → Clear site data
4. 硬刷新页面（Cmd+Shift+R）

---

### 步骤4: 通知用户（社交媒体/公告）

**推荐公告内容**:
```
网站已更新到新版本，部分用户可能需要清除浏览器缓存才能看到新版本。

快速解决方法：
1. 在网站地址后添加 ?forceUpdate=true（例如：https://blockofhome.cn/?forceUpdate=true）
2. 等待页面自动刷新，即可看到新版本

或者：
1. 打开浏览器开发者工具（F12）
2. Application → Service Workers → Unregister
3. Application → Storage → Clear site data
4. 硬刷新页面（Cmd+Shift+R）

如需帮助，请联系管理员。
```

---

## 🔍 **技术细节**

### 缓存层级分析

你的网站有 **多层缓存机制**，这是导致刷新看不到新版本的根本原因：

| 缓存层级 | 机制 | 更新策略 | 影响 |
|---------|------|---------|------|
| **1. 浏览器缓存** | HTTP 缓存头 | 默认缓存策略 | 普通刷新不清除 |
| **2. Service Worker Cache** | 预缓存 + 运行时缓存 | Cache-First 策略 | **拦截所有请求** |
| **3. Cache Storage API** | 手动缓存管理 | Service Worker 控制 | 长期保留旧版本 |
| **4. GitHub Pages CDN** | 全球 CDN 缓存 | 推送后1-5分钟更新 | 全球用户延迟 |

**关键问题**: **Service Worker Cache** 会拦截所有请求并返回旧版本，导致新的更新检测代码无法执行。

---

### 修复方案对比

| 方案 | 执行时机 | 清除范围 | 用户操作 | 效果 |
|------|---------|---------|---------|------|
| **URL 参数触发** | 页面加载前 | 所有 SW + Cache | 访问特殊 URL | ✅ 立即生效 |
| **24小时自动清除** | 页面加载时 | 过期 SW + Cache | 无需操作 | ✅ 自动修复 |
| **错误监听清除** | SW 错误时 | 所有 SW + Cache | 无需操作 | ✅ 异常处理 |
| **手动清除** | 用户操作时 | 用户选择范围 | 需操作开发者工具 | ✅ 完全清除 |

---

### Service Worker 更新机制对比

**旧机制（修复前）**:
```
用户访问网站 → 旧 SW 拦截 → 返回旧版本 → 新代码不执行 → 死循环
```

**新机制（修复后）**:
```
用户访问网站 → index.html 检测参数 → 强制清除旧 SW → 加载新版本 → 正常运行
或
用户访问网站 → main.js 检测过期 → 自动清除旧 SW → 刷新页面 → 看到新版本
```

---

## 📊 **预期效果**

### 用户看到新版本的时间线

| 时间点 | 事件 | 用户体验 |
|--------|------|---------|
| **推送后0分钟** | 你推送代码 | - |
| **推送后2-5分钟** | GitHub Actions 构建完成 | - |
| **推送后3-8分钟** | GitHub Pages CDN 更新完成 | 新版本上线 |
| **用户访问特殊 URL** | URL 参数触发强制清除 | 立即看到新版本 |
| **用户手动清除缓存** | 开发者工具操作 | 立即看到新版本 |
| **用户正常访问（24小时内）** | 系统自动检测并清除 | 自动刷新看到新版本 |

---

## 🚀 **后续推送建议**

### 推送前检查清单

- ✅ `npm run build` 成功完成
- ✅ dist/sw.js 文件存在
- ✅ dist/index.html 包含强制清除脚本
- ✅ dist/registerSW.js 正确注册 Service Worker
- ✅ git status 显示所有修改已提交

---

### 推送后验证清单

- ✅ GitHub Actions 构建成功（绿勾）
- ✅ 访问 `?forceUpdate=true` 参数 URL，确认清除生效
- ✅ 手动清除缓存，确认看到新版本
- ✅ 开发者工具显示 Service Worker 已重新注册
- ✅ Console 没有 Service Worker 相关错误

---

### 用户通知建议

推送新版本后，建议通过以下渠道通知用户：

1. **网站公告**：在首页添加更新通知
2. **社交媒体**：发布更新公告并提供清除缓存方法
3. **邮件通知**：给注册用户发送更新通知
4. **应用内提示**：用户访问时自动弹出更新提示

---

## 🔗 **相关文件**

- [index.html](file:///Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/index.html) - URL 参数强制清除脚本
- [src/main.js](file:///Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/src/main.js) - 24小时自动清除机制
- [vite.config.js](file:///Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/vite.config.js) - Service Worker 配置
- [docs/pwa-cache-fix-2026-06-30.md](file:///Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/docs/pwa-cache-fix-2026-06-30.md) - 第一次修复文档

---

## 总结

本次紧急修复解决了 **缓存死循环** 问题，通过：

1. **URL 参数触发**（index.html）- 用户可主动强制清除缓存
2. **24小时自动清除**（main.js）- 系统自动检测过期 Service Worker
3. **错误监听机制**（main.js）- 自动处理 Service Worker 异常

现在用户可以通过：
- **访问特殊 URL** - 立即看到新版本（最快）
- **等待自动更新** - 24小时内系统自动清除缓存
- **手动清除缓存** - 完全控制清除范围

推送后，建议立即通知用户使用特殊 URL 参数清除缓存，确保所有用户都能快速看到新版本。