---
goal: 论坛交互优化 - 图片上传、帖子编辑、AI抽屉、分享提示、草稿存储重构
version: 1.0
date_created: 2026-06-27
last_updated: 2026-06-27
owner: BOH 开发团队
status: Planned
tags: feature, frontend, interaction, forum, UX
---

# Introduction

![Status: Planned](https://img.shields.io/badge/status-Planned-blue)

本实施计划旨在优化论坛核心交互体验，涵盖图片上传、帖子编辑、AI侧边栏布局、分享链接提示和草稿存储逻辑等5个关键模块。通过渐进式重构方案，提升用户体验和功能完整性。

## 1. Requirements & Constraints

**功能需求**：
- **REQ-001**: 图片上传交互优化 - 首张图片上传后，在预览grid旁显示"+"号添加方框，提供直观的追加入口
- **REQ-002**: 帖子编辑图片操作 - 编辑模式下支持删除、替换、追加、重排已上传图片
- **REQ-003**: AI侧边抽屉动态安全边距 - 使用`env(safe-area-inset-bottom)`适配移动端竖屏浏览器地址栏
- **REQ-004**: 分享链接灵动岛提示 - 论坛相关页面复制链接成功后，触发BottomNavIsland组件展示提示
- **REQ-005**: 草稿存储逻辑重构 - 移除自动保存定时器，改为用户主动确认保存（beforeunload、发布取消询问、手动保存按钮）

**技术约束**：
- **CON-001**: 必须复用现有PostComposer组件，避免重复代码
- **CON-002**: 必须保持现有交互一致性，不破坏用户习惯
- **CON-003**: 必须支持多端适配（移动端竖屏、横屏、桌面）
- **CON-004**: 图片上传最多6张，需严格遵守上限约束

**安全要求**：
- **SEC-001**: 图片上传需通过Cloudinary审核机制，阻止违规内容
- **SEC-002**: 草稿存储需使用Supabase安全API，避免未授权访问
- **SEC-001**: 分享链接复制需使用`navigator.clipboard.writeText`，确保安全

**设计模式**：
- **PAT-001**: 组件复用模式 - PostComposer通过props切换编辑模式
- **PAT-002**: 事件驱动模式 - 通过emit触发灵动岛提示
- **PAT-003**: CSS环境变量模式 - 使用`env(safe-area-inset-bottom)`动态适配

## 2. Implementation Steps

### Phase 1: 图片上传交互优化（P0）

- **GOAL-001**: 实现图片预览grid旁的"+"号添加方框，提供直观的追加入口

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-001 | 在PostComposer.vue第568-617行图片预览grid区域，新增"+"号添加方框按钮组件 | | |
| TASK-002 | 添加CSS样式：虚线边框（`border: 2px dashed rgba(0, 113, 227, 0.24)`）、半透明背景、hover效果、禁用状态 | | |
| TASK-003 | 导入lucide-vue-next的Plus图标，设置尺寸32px、stroke-width 1.5 | | |
| TASK-004 | 绑定点击事件到`handleImagePickerRequest`，复用现有图片选择逻辑 | | |
| TASK-005 | 添加显示条件：`v-if="postImages.length < maxPostImages"`，达到6张上限时方框消失 | | |
| TASK-006 | 添加禁用条件：`:disabled="isUploadingPostImage || isSubmitting"`，上传中禁用方框 | | |
| TASK-007 | 测试：连续添加6张图片，验证方框消失；点击方框触发图片选择；支持多选 | | |

### Phase 2: 帖子编辑图片操作增强（P1）

- **GOAL-002**: 实现编辑模式下的完整图片操作能力

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-008 | PostComposer.vue添加`editMode` prop（type: Boolean, default: false） | | |
| TASK-009 | PostComposer.vue添加`existingImages` prop（type: Array, default: () => []），用于传入编辑时的已有图片 | | |
| TASK-010 | PostComposer.vue图片预览grid逻辑调整：编辑模式下优先显示`existingImages`，新增图片追加到列表 | | |
| TASK-011 | PostDetailMain.vue修改编辑逻辑：点击编辑按钮后，使用PostComposer替代纯文本编辑器 | | |
| TASK-012 | PostDetailMain.vue传入`existingImages`：从`post.images`提取，格式化为`{ url, publicId, uploadStatus: 'approved' }` | | |
| TASK-013 | PostComposer.vue删除图片逻辑验证：编辑模式下删除`existingImages`中的图片，需要同步到父组件 | | |
| TASK-014 | PostComposer.vue替换图片逻辑：点击图片触发重选，替换当前图片URL和publicId | | |
| TASK-015 | PostComposer.vue拖拽排序逻辑：编辑模式下支持拖拽重排`existingImages` | | |
| TASK-016 | 测试：编辑帖子删除图片、替换图片、追加图片、重排图片，验证数据同步正确 | | |

### Phase 3: AI侧边抽屉动态安全边距（P2）

- **GOAL-003**: 实现移动端竖屏下AI抽屉底部不被浏览器地址栏遮挡

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-017 | GlobalAiGlassOverlay.vue第225行添加基础安全边距：`padding-bottom: max(8px, env(safe-area-inset-bottom, 0px))` | | |
| TASK-018 | GlobalAiGlassOverlay.vue添加移动端竖屏增强样式：`@media (max-width: 1023px) and (orientation: portrait)` | | |
| TASK-019 | 移动端竖屏增强样式设置：`padding-bottom: calc(var(--global-ai-bottom-nav-clearance) + max(12px, env(safe-area-inset-bottom, 0px)))` | | |
| TASK-020 | BohaiSidebar.vue第322-341行验证安全边距逻辑，确保与GlobalAiGlassOverlay一致 | | |
| TASK-021 | 测试：iOS Safari移动端竖屏，滚动浏览器地址栏，验证AI抽屉底部不被遮挡 | | |

### Phase 4: 分享链接灵动岛提示（P2）

- **GOAL-004**: 实现论坛相关页面分享链接复制成功后的灵动岛提示

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-022 | PostDetailMain.vue第1346行sharePost函数修改：复制成功后emit('island-message')事件 | | |
| TASK-023 | island-message事件数据：`{ title: '分享链接已复制到剪贴板', icon: 'success', catSticker: 'success', actionLabel: '知道了' }` | | |
| TASK-024 | ForumMain.vue添加分享按钮逻辑（如果需要）：复用PostDetailMain的emit逻辑 | | |
| TASK-025 | App.vue或UserSpaceMain.vue监听`island-message`事件，渲染BottomNavIsland组件 | | |
| TASK-026 | BottomNavIsland.vue验证样式和动画：Transition动画、猫咪贴纸显示逻辑 | | |
| TASK-027 | 测试：帖子详情页点击分享按钮，验证灵动岛弹出、动画流畅、文案正确 | | |

### Phase 5: 草稿存储逻辑重构（P1）

- **GOAL-005**: 移除自动保存机制，改为用户主动确认保存

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-028 | ForumMain.vue移除autoSaveDraftTimer定时器（450-696行相关代码） | | |
| TASK-029 | ForumMain.vue添加beforeunload事件监听：`window.addEventListener('beforeunload', handleBeforeUnload)` | | |
| TASK-030 | handleBeforeUnload函数实现：检查`hasUnsavedChanges()`，设置`e.returnValue = '编辑内容尚未保存，是否保存为草稿？'` | | |
| TASK-031 | ForumMain.vue修改handlePost函数：发布成功后调用`deleteForumPostDraft()`删除草稿 | | |
| TASK-032 | ForumMain.vue添加发布确认弹窗取消时的询问逻辑：弹出二次确认框，询问"是否将当前编辑内容保存为草稿？" | | |
| TASK-033 | PostComposer.vue添加横屏保存草稿按钮：桌面端工具栏（第700-736行区域）新增`<button class="desktop-save-draft-btn" @click="emit('save-draft')">` | | |
| TASK-034 | PostComposer.vue保存草稿按钮样式：`border-radius: 14px`、`padding: 10px 16px`、使用FileText图标 | | |
| TASK-035 | ForumMain.vue监听PostComposer的`save-draft`事件，调用`upsertForumPostDraft()`保存草稿 | | |
| TASK-036 | 测试：刷新页面触发beforeunload确认框；发布成功后验证草稿删除；横屏点击保存按钮验证草稿保存 | | |

## 3. Alternatives

**替代方案1：独立组件重构**
- **ALT-001**: 创建独立的EditImagePanel组件处理编辑图片操作
- **未采用原因**: 会产生大量重复代码，与PostComposer逻辑重复，维护成本高

**替代方案2：全局架构重构**
- **ALT-002**: 重新设计整个编辑流程，统一草稿管理、图片操作等
- **未采用原因**: 改动范围巨大，风险高，耗时长，不符合渐进式迭代原则

**替代方案3：纯CSS图片按钮显示**
- **ALT-003**: 仅修改CSS，让图片按钮始终显示
- **未采用原因**: 不够直观，用户体验不如"+"方框设计，不符合现代交互规范

## 4. Dependencies

**外部依赖**：
- **DEP-001**: lucide-vue-next图标库（Plus、FileText图标）
- **DEP-002**: Cloudinary图片上传服务（uploadForumImage API）
- **DEP-003**: Supabase数据库（草稿存储API：upsertForumPostDraft、deleteForumPostDraft）
- **DEP-004**: navigator.clipboard API（剪贴板写入）

**内部依赖**：
- **DEP-005**: BottomNavIsland组件（灵动岛渲染）
- **DEP-006**: PostComposer组件（图片上传逻辑）
- **DEP-007**: forum-api.js（草稿操作API）
- **DEP-008**: forum-config.js（常量：maxPostImages=6）

## 5. Files

**需要修改的文件**：
- **FILE-001**: `src/views/Forum/components/PostComposer.vue` - 图片上传交互、编辑模式props、横屏保存按钮
- **FILE-002**: `src/views/Forum/ForumMain.vue` - 草稿存储逻辑、beforeunload事件、分享灵动岛触发
- **FILE-003**: `src/views/PostDetail/PostDetailMain.vue` - 编辑模式图片操作、分享灵动岛触发
- **FILE-004**: `src/components/GlobalAiGlassOverlay.vue` - AI抽屉动态安全边距CSS
- **FILE-005**: `src/views/BOHAI/BOHAI/components/BohaiSidebar.vue` - AI侧边栏安全边距验证
- **FILE-006**: `src/App.vue` 或 `src/views/user-center/UserSpace/UserSpaceMain.vue` - 灵动岛监听逻辑

**设计文档**：
- **FILE-007**: `docs/superpowers/specs/2026-06-27-forum-interaction-enhancements-design.md` - 完整设计文档

## 6. Testing

**功能测试**：
- **TEST-001**: 图片上传连续添加 - 测试添加6张图片，验证"+"方框消失；点击方框触发选择；支持多选
- **TEST-002**: 帖子编辑图片操作 - 测试删除、替换、追加、重排图片，验证编辑流程完整性
- **TEST-003**: AI抽屉安全边距 - iOS Safari移动端竖屏，滚动浏览器地址栏，验证底部不被遮挡
- **TEST-004**: 分享链接灵动岛 - 帖子详情页点击分享，验证灵动岛弹出、动画、文案
- **TEST-005**: 草稿存储beforeunload - 刷新页面触发系统确认框，验证文案、保存逻辑
- **TEST-006**: 草稿手动保存 - 横屏点击保存按钮，验证草稿保存成功
- **TEST-007**: 草稿发布删除 - 发布帖子成功后，验证对应草稿被删除

**边界测试**：
- **TEST-008**: 图片上限约束 - 尝试添加第7张图片，验证被阻止（方框消失或禁用）
- **TEST-009**: 编辑模式切换 - 从新建切换到编辑，验证图片数据正确传入
- **TEST-010**: 多端适配 - 移动端竖屏、横屏、桌面三端测试，验证交互一致性

## 7. Risks & Assumptions

**风险**：
- **RISK-001**: 草稿存储重构风险 - 移除autoSaveDraftTimer可能影响用户习惯，需要测试beforeunload事件兼容性
- **RISK-002**: 帖子编辑模式切换风险 - PostComposer切换编辑模式可能引入状态管理复杂性，需要验证数据流
- **RISK-003**: 灵动岛事件监听风险 - App.vue监听island-message可能存在事件传递延迟，需要测试实时性
- **RISK-004**: CSS环境变量兼容性风险 - env(safe-area-inset-bottom)在部分旧浏览器可能不支持，需要降级方案

**假设**：
- **ASSUMPTION-001**: 用户已熟悉PostComposer的图片上传交互，"+"方框设计不会引起困惑
- **ASSUMPTION-002**: BottomNavIsland组件动画和样式已稳定，可直接复用
- **ASSUMPTION-003**: beforeunload事件在现代浏览器中支持良好，无需降级方案
- **ASSUMPTION-004**: 图片上传最多6张上限已在前端和后端双重验证，无需额外约束

## 8. Related Specifications / Further Reading

**设计文档**：
- [docs/superpowers/specs/2026-06-27-forum-interaction-enhancements-design.md](file:///Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/docs/superpowers/specs/2026-06-27-forum-interaction-enhancements-design.md)

**相关代码**：
- [src/views/Forum/components/PostComposer.vue](file:///Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/src/views/Forum/components/PostComposer.vue)
- [src/views/Forum/ForumMain.vue](file:///Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/src/views/Forum/ForumMain.vue)
- [src/views/PostDetail/PostDetailMain.vue](file:///Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/src/views/PostDetail/PostDetailMain.vue)
- [src/components/GlobalAiGlassOverlay.vue](file:///Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/src/components/GlobalAiGlassOverlay.vue)
- [src/views/user-center/UserSpace/components/BottomNavIsland.vue](file:///Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/src/views/user-center/UserSpace/components/BottomNavIsland.vue)

**外部文档**：
- [MDN - env(safe-area-inset-*)](https://developer.mozilla.org/en-US/docs/Web/CSS/env)
- [MDN - beforeunload event](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event)
- [MDN - navigator.clipboard](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API)

---

**实施计划状态**: Planned
**下一步**: 开始Phase 1 - 图片上传交互优化