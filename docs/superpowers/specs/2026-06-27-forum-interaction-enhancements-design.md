# 论坛交互优化设计文档

**日期**: 2026-06-27
**状态**: 已批准，待实施
**涉及模块**: 图片上传、帖子编辑、AI侧边栏、分享链接、草稿存储

---

## 1. 图片上传交互优化

### 1.1 问题描述
用户上传首张图片后，无法追加更多图片，上传按钮消失。

### 1.2 设计方案
在图片预览grid中，始终显示一个"+"号添加方框，与图片预览卡片同等尺寸，提供直观的添加入口。

### 1.3 实现细节

**文件**: `src/views/Forum/components/PostComposer.vue`

**修改位置**: 第568-617行图片预览grid区域

**新增组件**:
```vue
<button
  v-if="postImages.length < maxPostImages"
  type="button"
  class="post-image-add-more-card"
  :disabled="isUploadingPostImage || isSubmitting"
  @click="handleImagePickerRequest"
>
  <Plus :size="32" :stroke-width="1.5" />
  <span class="add-more-label">添加图片</span>
</button>
```

**样式**: 虚线边框、半透明背景、hover效果、禁用状态

**交互逻辑**:
- 始终显示，除非达到上限（6张）
- 点击触发图片选择
- 上传中禁用
- 支持多选

---

## 2. 帖子编辑图片操作增强

### 2.1 功能需求
编辑帖子时，支持完整的图片操作：删除、替换、追加、重排。

### 2.2 设计方案
复用PostComposer的图片操作逻辑，通过`editMode` prop区分新建/编辑模式。

### 2.3 实现细节

**文件**:
- `src/views/Forum/components/PostComposer.vue` (添加editMode prop)
- `src/views/PostDetail/PostDetailMain.vue` (编辑时使用PostComposer)

**新增prop**:
```js
editMode: { type: Boolean, default: false },
existingImages: { type: Array, default: () => [] }
```

**交互逻辑**:
- 编辑模式下传入existingImages
- 复用删除（×按钮）、替换（点击图片重选）、拖拽排序
- 通过"+方框"追加新图片

---

## 3. AI侧边抽屉动态安全边距

### 3.1 问题描述
移动端竖屏场景下，AI侧边栏底部被浏览器地址栏遮挡。

### 3.2 设计方案
使用`env(safe-area-inset-bottom)`动态安全边距，适配浏览器地址栏高度变化。

### 3.3 实现细节

**文件**:
- `src/components/GlobalAiGlassOverlay.vue`
- `src/views/BOHAI/BOHAI/components/BohaiSidebar.vue`

**CSS修改**:
```css
.global-ai-glass-overlay {
  padding-bottom: max(8px, env(safe-area-inset-bottom, 0px));
}

/* 移动端竖屏增强 */
@media (max-width: 1023px) and (orientation: portrait) {
  .global-ai-glass-overlay {
    padding-bottom: calc(
      var(--global-ai-bottom-nav-clearance)
      + max(12px, env(safe-area-inset-bottom, 0px))
    );
  }
}
```

---

## 4. 分享链接灵动岛提示

### 4.1 功能需求
论坛相关页面（论坛列表、帖子详情）分享链接复制成功后，调用BottomNavIsland组件展示提示。

### 4.2 设计方案
通过`emit('island-message')`事件触发灵动岛，复用现有动画和样式。

### 4.3 实现细节

**文件**:
- `src/views/PostDetail/PostDetailMain.vue`
- `src/views/Forum/ForumMain.vue`

**触发逻辑**:
```js
// PostDetailMain.vue - sharePost函数
async function sharePost() {
  await navigator.clipboard.writeText(shareUrl);
  emit('island-message', {
    title: '分享链接已复制到剪贴板',
    icon: 'success',
    catSticker: 'success',
    actionLabel: '知道了'
  });
}
```

**监听逻辑**: App.vue或UserSpaceMain监听island-message事件，渲染BottomNavIsland。

---

## 5. 草稿存储逻辑重构

### 5.1 功能需求
移除退出页面自动保存机制，改为用户主动确认保存。

### 5.2 需要支持的场景
1. 帖子发布成功后，自动删除对应草稿
2. 发布确认弹窗点击取消时，询问是否保存草稿
3. beforeunload触发系统确认框
4. 横屏新增保存草稿按钮

### 5.3 实现细节

**文件**: `src/views/Forum/ForumMain.vue`

**移除**: autoSaveDraftTimer定时器（450-696行）

**新增**:
```js
// 1. beforeunload事件监听
window.addEventListener('beforeunload', handleBeforeUnload);

function handleBeforeUnload(e) {
  if (!hasUnsavedChanges()) return;
  e.preventDefault();
  e.returnValue = '编辑内容尚未保存，是否保存为草稿？';
  // 用户选择保存 → 调用saveDraft()
}

// 2. 发布成功后删除草稿
async function handlePost() {
  await createPost(postData);
  deleteForumPostDraft();
}

// 3. 发布确认弹窗取消时询问
if (confirmResult === 'cancel') {
  const saveDraft = await askUser('是否将当前编辑内容保存为草稿？');
  if (saveDraft) saveDraft();
}

// 4. 横屏保存草稿按钮
<button class="desktop-save-draft-btn" @click="saveDraft">
  <FileText :size="18" />
  保存草稿
</button>
```

---

## 6. 实施优先级

**P0（必须）**: 图片上传交互优化（用户体验关键）
**P1（高优）**: 帖子编辑图片操作、草稿存储重构
**P2（中优）**: AI侧边抽屉安全边距、分享链接提示

---

## 7. 风险评估

**低风险**: 图片上传UI改动、CSS安全边距调整
**中风险**: 草稿存储重构（需要移除定时器，测试beforeunload）
**高风险**: 帖子编辑模式切换（需要验证编辑流程完整性）

---

## 8. 测试要点

1. 图片上传：连续添加6张图片，验证方框消失
2. 帖子编辑：删除/替换/追加图片，验证数据同步
3. AI抽屉：iOS Safari地址栏滚动，验证底部不被遮挡
4. 分享链接：复制后验证灵动岛弹出
5. 草稿存储：刷新页面验证系统确认框，验证手动保存

---

**设计已批准，下一步：创建实施计划**