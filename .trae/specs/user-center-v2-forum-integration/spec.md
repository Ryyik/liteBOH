# 个人中心V2论坛组件集成 Spec

## Why
当前 UserCenterV2.vue 中的帖子部分是重新实现的代码，与 Forum.vue 存在大量重复。为了代码复用和维护性，应该直接引入 Forum.vue 组件作为帖子部分的内容。

## What Changes
- 将 UserCenterV2.vue 的帖子部分替换为 Forum.vue 组件的引入
- 移除 UserCenterV2.vue 中重复的帖子相关代码（模板、脚本、样式）
- 保持底部导航栏和其他 tab 页面不变

## Impact
- Affected specs: user-center-v2
- Affected code: src/views/UserCenterV2.vue

## ADDED Requirements
### Requirement: 论坛组件集成
系统应当在个人中心V2的帖子标签页中直接渲染 Forum.vue 组件的内容。

#### Scenario: 用户切换到帖子标签
- **WHEN** 用户在个人中心V2页面点击"帖子"标签
- **THEN** 系统显示 Forum.vue 组件的内容（包含发帖、帖子列表等功能）

#### Scenario: 论坛功能完整性
- **WHEN** 用户在个人中心V2的帖子页面操作
- **THEN** 所有论坛功能（发帖、点赞、评论、分享等）正常工作

## MODIFIED Requirements
### Requirement: UserCenterV2 帖子部分
UserCenterV2.vue 的帖子部分 SHALL 通过引入 Forum.vue 组件实现，而非独立实现。

## REMOVED Requirements
### Requirement: 独立帖子实现
**Reason**: 避免代码重复，提高可维护性
**Migration**: 使用组件引入替代独立实现
