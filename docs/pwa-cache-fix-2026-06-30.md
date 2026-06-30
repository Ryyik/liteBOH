# PWA 缓存问题修复报告

**修复日期**: 2026-06-30
**问题**: 网站推送成功但刷新后看不到新版本

---

## 问题根源

### 1. Service Worker 文件缺失
- **现象**: `registerSW.js` 尝试注册 `./sw.js`，但 dist 目录中没有生成 sw.js 文件
- **原因**: vite-plugin-pwa 配置缺少必要的参数，导致 Service Worker 未正确生成
- **影响**: Service Worker 注册失败，但旧的 SW 可能仍在运行，导致用户看到旧版本

### 2. GitHub Pages 缓存限制
- **现象**: `_headers` 文件配置了正确的 HTTP 缓存策略，但未生效
- **原因**: GitHub Pages 不支持自定义 HTTP 头（`_headers` 文件注释已明确说明）
- **影响**: 实际缓存完全依赖浏览器默认行为 + Service Worker

### 3. PWA 缓存策略过于激进
- **现象**: Service Worker 预缓存所有静态资源（248个文件，约14MB）
- **配置**: 使用 Cache-First 策略，优先使用缓存而非网络
- **影响**: 即使推送新代码，用户可能长时间看到旧版本

---

## 修复方案

### 1. 修复 vite-plugin-pwa 配置

**修改文件**: [vite.config.js](file:///vite.config.js)

**关键修改**:
```javascript
VitePWA({
  // 明确指定使用 generateSW 策略
  strategies: 'generateSW',
  
  // 注册类型改为 prompt（提示用户更新，而非自动更新）
  registerType: 'prompt',
  
  // 确保 Service Worker 文件名正确
  filename: 'sw.js',
  
  // 禁用开发环境 SW（避免干扰调试）
  devOptions: {
    enabled: false,
  },
  
  workbox: {
    // 强制更新机制
    skipWaiting: true,
    clientsClaim: true,
    
    // 预缓存配置
    globPatterns: ['**/*.{js,css,html,woff,woff2,ico,png,webp,svg}'],
    maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
    
    // 运行时缓存策略
    runtimeCaching: [
      {
        // Supabase API：Network-First（优先网络）
        urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'api-supabase',
          expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 },
          networkTimeoutSeconds: 8,
        },
      },
      {
        // 图片资源：Stale-While-Revalidate（后台更新）
        urlPattern: /^https:\/\/cdn\.blockofhome\.cn\/.*/i,
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'images-cloudinary',
          expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 },
        },
      },
      {
        // Google Fonts：Cache-First（离线可用）
        urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'google-fonts',
          expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
        },
      },
    ],
  },
})
```

**效果**:
- ✅ sw.js 文件正确生成
- ✅ workbox 运行时文件生成（workbox-07e28819.js）
- ✅ 预缓存248个文件（约14MB）

---

### 2. 添加版本检测机制

**修改文件**: [src/main.js](file:///src/main.js)

**添加功能**:
```javascript
// PWA 更新检测机制
if ('serviceWorker' in navigator) {
  // 1. 定期检查更新（每60分钟）
  navigator.serviceWorker.ready.then((registration) => {
    setInterval(() => {
      registration.update().catch((err) => {
        logger.warn('pwa', 'SW 更新检查失败', err);
      });
    }, 60 * 60 * 1000);
  });

  // 2. 监听新 Service Worker 激活事件
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    logger.info('pwa', '新 Service Worker 已激活，正在刷新页面');
    window.location.reload(); // 强制刷新
  });

  // 3. 监听 Service Worker 更新等待事件
  navigator.serviceWorker.ready.then((registration) => {
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (newWorker) {
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // 新版本已准备好，提示用户刷新
            if (confirm('网站已更新到新版本，是否立即刷新？')) {
              newWorker.postMessage({ type: 'SKIP_WAITING' });
            }
          }
        });
      }
    });
  });
}
```

**工作机制**:
1. **定期检查**: 每60分钟自动检查 Service Worker 更新
2. **自动刷新**: 新 Service Worker 激活时强制刷新页面
3. **用户提示**: 新版本安装时弹出提示，用户可选择立即刷新
4. **跳过等待**: 发送 `SKIP_WAITING` 消息，跳过等待状态立即激活

---

## 用户清除缓存方法

### 方法1: 清除 Service Worker（最快）

**步骤**:
1. 打开浏览器开发者工具（F12）
2. 切换到 **Application** 标签页
3. 左侧菜单选择 **Service Workers**
4. 找到 `https://blockofhome.cn` 的注册信息
5. 点击 **Unregister** 按钮
6. 切换到 **Storage** 标签页
7. 点击 **Clear site data** 清除所有缓存
8. 硬刷新页面（Cmd+Shift+R / Ctrl+Shift+R）

**效果**: 立即看到新版本

---

### 方法2: 禁用 PWA（临时）

**步骤**:
1. 打开开发者工具（F12）
2. 切换到 **Application** → **Service Workers**
3. 勾选 **Bypass for network** 选项
4. 刷新页面

**效果**: Service Worker 被暂时禁用，所有请求直接访问网络

---

### 方法3: 等待自动更新

**机制**:
- 用户打开网站后，系统每60分钟自动检查更新
- 检测到新版本时弹出提示："网站已更新到新版本，是否立即刷新？"
- 点击"确定"后立即刷新，看到新版本
- 点击"取消"后继续使用旧版本，下次访问时再次提示

---

## 后续推送建议

### 1. 推送前检查构建产物

**必须包含的文件**:
- ✅ `dist/sw.js` - Service Worker 主文件
- ✅ `dist/workbox-*.js` - Workbox 运行时
- ✅ `dist/registerSW.js` - SW 注册脚本
- ✅ `dist/manifest.webmanifest` - PWA 配置文件

**检查命令**:
```bash
ls -la dist/
```

---

### 2. 推送后验证

**立即验证**:
1. 推送完成后，清除本地 Service Worker（方法1）
2. 打开网站，验证是否看到新版本
3. 检查开发者工具 Application → Service Workers，确认新 SW 已注册

**等待用户反馈**:
- 用户下次访问时，系统会自动检测更新并提示刷新
- 最多等待60分钟，所有用户都会收到更新提示

---

### 3. 紧急修复情况

**如果推送后仍有问题**:
1. **重新构建**: `npm run build`
2. **检查产物**: 确保 sw.js 文件存在
3. **强制推送**: `git add dist/ && git commit -m "fix: 强制更新 SW" && git push`
4. **通知用户**: 在社交媒体/公告中提醒用户清除缓存

---

## 技术细节

### Service Worker 更新流程

**正常流程**:
1. 用户访问网站
2. 浏览器检查 sw.js 文件是否有变化（通过 HTTP 响应头）
3. 如果有变化，下载新的 sw.js 并安装
4. 新 SW 进入 `waiting` 状态，等待旧 SW 控制的页面关闭
5. 用户关闭所有标签页或刷新页面
6. 新 SW 进入 `active` 状态，接管所有请求

**强制更新流程**（已实现）:
1. 检测到新 SW 安装完成
2. 发送 `SKIP_WAITING` 消息
3. 新 SW 立即进入 `active` 状态
4. 触发 `controllerchange` 事件
5. 强制刷新页面，加载新版本

---

### 缓存策略对比

| 资源类型 | 旧策略 | 新策略 | 效果 |
|---------|--------|--------|------|
| HTML/CSS/JS | Cache-First | 预缓存 + Hash | 文件名变化立即更新 |
| Supabase API | Network-First | Network-First（保持） | 优先网络，确保数据最新 |
| 图片资源 | Stale-While-Revalidate | Stale-While-Revalidate（保持） | 后台更新，不阻塞渲染 |
| Google Fonts | Cache-First | Cache-First（保持） | 离线可用，长期缓存 |

---

## 性能影响

### 构建产物大小
- **sw.js**: 约 1.5 KB（压缩后）
- **workbox-07e28819.js**: 约 50 KB（压缩后）
- **预缓存资源**: 248个文件，约 14 MB

### 预缓存影响
- **首次加载**: 需下载约 14 MB 预缓存资源（后台进行）
- **后续访问**: 所有静态资源从缓存加载，速度极快
- **更新时**: 仅下载变化的文件（文件名 Hash 变化）

### 内存占用
- **Cache Storage**: 约 14 MB（浏览器自动管理）
- **Service Worker 线程**: 约 1-2 MB（独立线程）

---

## 相关文件

- [vite.config.js](file:///vite.config.js) - PWA 配置
- [src/main.js](file:///src/main.js) - Service Worker 注册和更新检测
- [dist/sw.js](file:///dist/sw.js) - Service Worker 主文件
- [dist/registerSW.js](file:///dist/registerSW.js) - SW 注册脚本
- [dist/_headers](file:///dist/_headers) - HTTP 缓存策略（GitHub Pages不支持）

---

## 验证清单

推送前必须检查：
- ✅ `npm run build` 成功完成
- ✅ dist/sw.js 文件存在
- ✅ dist/workbox-*.js 文件存在
- ✅ dist/registerSW.js 文件存在
- ✅ dist/index.html 包含 `<script src="./registerSW.js"></script>`
- ✅ git status 显示 dist/ 目录有变化
- ✅ git push 成功完成

推送后验证：
- ✅ 清除本地 Service Worker
- ✅ 打开网站，看到新版本
- ✅ 开发者工具显示新 SW 已注册
- ✅ Console 没有 SW 相关错误

---

## 总结

本次修复解决了 **Service Worker 文件缺失** 和 **缓存策略过于激进** 的两个核心问题。通过：

1. **修复 vite-plugin-pwa 配置** - 确保 sw.js 正确生成
2. **添加版本检测机制** - 自动检查更新并提示用户
3. **优化更新流程** - 新版本立即激活，无需等待用户关闭标签页

现在用户可以通过：
- **手动清除缓存** - 立即看到新版本
- **等待自动更新** - 系统每60分钟检查并提示刷新
- **接受更新提示** - 点击"确定"立即刷新

未来推送时，建议遵循推送前检查清单，确保构建产物完整，避免类似问题再次发生。