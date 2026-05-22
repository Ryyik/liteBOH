# 消息中心骨架屏实现计划

## 目标

为消息中心添加骨架屏加载效果，不破坏现有功能。

## 当前状态分析

### 文件位置

* 主文件: `/Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/src/views/user-center/Messages/index.vue`

* 样式文件: `/Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/src/views/user-center/Messages/style.scoped.css`

### 当前加载逻辑

1. **通知列表加载**: 使用 `loading` 状态控制，显示 spinner 加载动画
2. **邮件列表加载**: 使用 `loadingMails` 状态控制，显示 spinner 加载动画
3. 当前使用简单的 spinner 旋转动画，用户体验不够友好

### 需要添加骨架屏的位置

1. **通知列表区域** (x-list) - 当 `loading` 为 true 时
2. **邮件列表区域** (x-mail-section) - 当 `loadingMails` 为 true 时

## 实现方案

### 1. 骨架屏组件设计

#### 通知项骨架屏

* 左侧：圆形头像占位 (52x52px)

* 中间：

  * 用户名占位 (短条)

  * 操作类型标签占位

  * 内容文本占位 (两行)

* 右侧：

  * 时间占位

  * 状态标签占位

#### 邮件项骨架屏

* 左侧：圆形头像占位 (52x52px)

* 中间：

  * 发件人占位

  * 主题占位

  * 内容摘要占位 (两行)

* 右侧：时间占位

### 2. 动画效果

* 使用 shimmer 闪光动画效果

* 背景渐变移动，模拟内容加载中

### 3. 实现步骤

#### 步骤 1: 添加骨架屏 HTML 结构

在 `index.vue` 中替换现有的简单 loading spinner：

**通知列表骨架屏** (替代第 95-99 行的 loading 区域):

```vue
<div v-if="loading" class="x-skeleton-list">
  <div v-for="i in 5" :key="i" class="x-skeleton-item">
    <div class="x-skeleton-avatar"></div>
    <div class="x-skeleton-content">
      <div class="x-skeleton-line x-skeleton-title"></div>
      <div class="x-skeleton-line x-skeleton-text"></div>
      <div class="x-skeleton-line x-skeleton-text short"></div>
    </div>
    <div class="x-skeleton-right">
      <div class="x-skeleton-line x-skeleton-badge"></div>
    </div>
  </div>
</div>
```

**邮件列表骨架屏** (替代第 176-180 行的 loadingMails 区域):

```vue
<div v-if="loadingMails" class="x-skeleton-list">
  <div v-for="i in 4" :key="i" class="x-skeleton-item x-skeleton-mail">
    <div class="x-skeleton-avatar"></div>
    <div class="x-skeleton-content">
      <div class="x-skeleton-line x-skeleton-title"></div>
      <div class="x-skeleton-line x-skeleton-text"></div>
      <div class="x-skeleton-line x-skeleton-text short"></div>
    </div>
    <div class="x-skeleton-right">
      <div class="x-skeleton-line x-skeleton-time"></div>
    </div>
  </div>
</div>
```

#### 步骤 2: 添加骨架屏 CSS 样式

在 `style.scoped.css` 中添加：

```css
/* 骨架屏列表 */
.x-skeleton-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 0 16px;
}

/* 骨架屏项 */
.x-skeleton-item {
  display: flex;
  align-items: flex-start;
  padding: 20px;
  background: #fff;
  border-radius: 16px;
  border: 1px solid rgba(0, 0, 0, 0.04);
  gap: 16px;
}

/* 骨架屏头像 */
.x-skeleton-avatar {
  width: 52px;
  height: 52px;
  border-radius: 18px;
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  flex-shrink: 0;
}

/* 骨架屏内容区 */
.x-skeleton-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 骨架屏行 */
.x-skeleton-line {
  height: 12px;
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 6px;
}

.x-skeleton-title {
  width: 40%;
  height: 16px;
  margin-bottom: 4px;
}

.x-skeleton-text {
  width: 80%;
}

.x-skeleton-text.short {
  width: 60%;
}

/* 骨架屏右侧 */
.x-skeleton-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  flex-shrink: 0;
  min-width: 70px;
}

.x-skeleton-badge {
  width: 50px;
  height: 24px;
  border-radius: 12px;
}

.x-skeleton-time {
  width: 60px;
  height: 20px;
  border-radius: 10px;
}

/* 闪光动画 */
@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

/* 邮件骨架屏特殊样式 */
.x-skeleton-mail .x-skeleton-title {
  width: 30%;
}

/* 响应式适配 */
@media (max-width: 600px) {
  .x-skeleton-list {
    padding: 0 4px;
    gap: 12px;
  }
  
  .x-skeleton-item {
    padding: 14px;
    border-radius: 14px;
    flex-direction: column;
    gap: 12px;
  }
  
  .x-skeleton-avatar {
    width: 44px;
    height: 44px;
    border-radius: 14px;
  }
  
  .x-skeleton-right {
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    min-width: auto;
    margin-top: 4px;
    padding-top: 8px;
    border-top: 1px solid rgba(0, 0, 0, 0.04);
  }
}
```

### 3. 代码修改位置

#### index.vue 修改点

1. **第 95-99 行**: 替换通知列表 loading 区域
2. **第 176-180 行**: 替换邮件列表 loading 区域

#### style.scoped.css 修改点

在文件末尾添加骨架屏相关样式

## 验证清单

* [ ] 骨架屏在 loading 时正确显示

* [ ] 骨架屏有 shimmer 闪光动画

* [ ] 通知列表和邮件列表都有骨架屏

* [ ] 响应式布局正常（移动端适配）

* [ ] 数据加载完成后骨架屏消失，显示真实内容

* [ ] 原有功能不受影响（标记已读、写信、删除等）

* [ ] 无控制台错误

## 注意事项

1. 保留原有的 `loading` 和 `loadingMails` 状态控制逻辑
2. 骨架屏样式与现有设计系统保持一致（圆角、间距等）
3. 移动端需要适配竖屏布局

