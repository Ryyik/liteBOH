# NewsRoom 新闻中心骨架屏实现计划

## 目标
为新闻中心 (NewsRoom) 添加骨架屏加载效果，提升用户加载体验，不破坏现有功能。

## 当前状态分析

### 文件位置
- 主文件: `/Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/src/views/Newsroom/index.vue`
- 样式文件: `/Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/src/views/Newsroom/style.scoped.css`

### 当前加载逻辑
1. **新闻列表加载**: 使用 `loading` 状态控制，显示 spinner 旋转动画
2. 当前加载状态位于第 50-53 行，使用简单的 spinner + "加载新闻中..." 文字
3. 新闻卡片采用网格布局 (grid)，每卡片包含：图片、日期标签、分类、标题、摘要、作者信息

### 需要添加骨架屏的位置
1. **新闻卡片网格区域** (news-grid) - 当 `loading` 为 true 时

## 实现方案

### 1. 骨架屏组件设计

新闻卡片骨架屏结构（与真实卡片保持一致）：
- **图片区域**: 矩形占位 (100% x 280px)，圆角 32px 顶部
- **内容区域**:
  - 分类标签占位 (短条，圆角)
  - 标题占位 (两行)
  - 摘要占位 (三行)
  - 底部作者区域：头像占位 + 作者名占位

### 2. 动画效果
- 使用 shimmer 闪光动画效果
- 背景渐变移动，模拟内容加载中
- 动画时长 1.5s，循环播放

### 3. 实现步骤

#### 步骤 1: 添加骨架屏 HTML 结构
在 `index.vue` 中替换现有的 loading spinner（第 50-53 行）:

```vue
<!-- 骨架屏加载状态 -->
<div v-if="loading" class="skeleton-grid">
  <div v-for="i in 6" :key="i" class="skeleton-card">
    <div class="skeleton-image"></div>
    <div class="skeleton-content">
      <div class="skeleton-category"></div>
      <div class="skeleton-title"></div>
      <div class="skeleton-title short"></div>
      <div class="skeleton-excerpt"></div>
      <div class="skeleton-excerpt"></div>
      <div class="skeleton-excerpt"></div>
      <div class="skeleton-meta">
        <div class="skeleton-avatar"></div>
        <div class="skeleton-author"></div>
      </div>
    </div>
  </div>
</div>
```

#### 步骤 2: 添加骨架屏 CSS 样式
在 `style.scoped.css` 末尾添加：

```css
/* 骨架屏网格 */
.skeleton-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 40px;
}

/* 骨架屏卡片 */
.skeleton-card {
  background-color: #ffffff;
  border-radius: 32px;
  overflow: hidden;
  box-shadow: 0 2px 20px rgba(0, 0, 0, 0.04);
  border: 1px solid rgba(0, 0, 0, 0.03);
  display: flex;
  flex-direction: column;
}

/* 骨架屏图片区域 */
.skeleton-image {
  width: 100%;
  height: 280px;
  background: linear-gradient(90deg, #f5f5f7 25%, #ebebed 50%, #f5f5f7 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}

/* 骨架屏内容区域 */
.skeleton-content {
  padding: 40px;
  display: flex;
  flex-direction: column;
  flex: 1;
}

/* 骨架屏分类标签 */
.skeleton-category {
  width: 80px;
  height: 28px;
  border-radius: 100px;
  background: linear-gradient(90deg, #f5f5f7 25%, #ebebed 50%, #f5f5f7 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  margin-bottom: 20px;
}

/* 骨架屏标题 */
.skeleton-title {
  width: 100%;
  height: 24px;
  border-radius: 6px;
  background: linear-gradient(90deg, #f5f5f7 25%, #ebebed 50%, #f5f5f7 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  margin-bottom: 8px;
}

.skeleton-title.short {
  width: 70%;
  margin-bottom: 16px;
}

/* 骨架屏摘要 */
.skeleton-excerpt {
  width: 100%;
  height: 16px;
  border-radius: 4px;
  background: linear-gradient(90deg, #f5f5f7 25%, #ebebed 50%, #f5f5f7 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  margin-bottom: 8px;
}

.skeleton-excerpt:last-of-type {
  margin-bottom: 32px;
}

/* 骨架屏底部元信息 */
.skeleton-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-top: 24px;
  border-top: 1px solid rgba(0, 0, 0, 0.05);
  margin-top: auto;
}

.skeleton-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(90deg, #f5f5f7 25%, #ebebed 50%, #f5f5f7 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  flex-shrink: 0;
}

.skeleton-author {
  width: 100px;
  height: 16px;
  border-radius: 4px;
  background: linear-gradient(90deg, #f5f5f7 25%, #ebebed 50%, #f5f5f7 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
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

/* 移动端响应式 */
@media (max-width: 768px) {
  .skeleton-grid {
    grid-template-columns: 1fr;
    gap: 32px;
  }

  .skeleton-image {
    height: 220px;
  }

  .skeleton-content {
    padding: 24px;
  }

  .skeleton-title {
    height: 20px;
  }

  .skeleton-excerpt {
    height: 15px;
  }

  .skeleton-excerpt:nth-child(5) {
    display: none;
  }
}

/* 平板响应式 */
@media (min-width: 769px) and (max-width: 1180px) {
  .skeleton-grid {
    gap: 32px;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  }

  .skeleton-image {
    height: 240px;
  }

  .skeleton-content {
    padding: 32px;
  }
}
```

### 4. 代码修改位置

#### index.vue 修改点
- **第 50-53 行**: 替换现有的 loading spinner 为骨架屏网格

#### style.scoped.css 修改点
- 在文件末尾（第 784 行之后）添加骨架屏相关样式

## 验证清单
- [ ] 骨架屏在 loading 时正确显示
- [ ] 骨架屏有 shimmer 闪光动画
- [ ] 显示 6 个骨架卡片（与网格布局匹配）
- [ ] 响应式布局正常（移动端、平板、桌面端）
- [ ] 数据加载完成后骨架屏消失，显示真实新闻卡片
- [ ] 原有功能不受影响（筛选、搜索、模态框等）
- [ ] 无控制台错误

## 注意事项
1. 保留原有的 `loading` 状态控制逻辑
2. 骨架屏样式与现有设计系统保持一致（圆角、间距、阴影等）
3. 移动端需要适配竖屏布局（单列显示）
4. 平板设备需要适配（2-3 列显示）
