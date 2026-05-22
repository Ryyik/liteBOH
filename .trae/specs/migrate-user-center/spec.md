# 个人中心迁移与整合 Spec

## Why
当前项目中存在多个个人中心相关页面（`/user-center/info` 和 `/user-center-v2`），造成功能重复和用户困惑。需要废除旧的个人信息页面，将所有功能整合到个人空间V2，并更名为"个人空间"，同时保留"我的空间"(Profile)不变。

## What Changes
- **BREAKING**: 废除 `/user-center/info` 路由和 `UserInfo.vue` 页面
- 将 `UserCenterV2.vue` 重命名为 `UserSpace.vue`（个人空间）
- 更新路由 `/user-center-v2` 为 `/user-space`
- 将 `UserInfo.vue` 中的所有功能迁移到 `UserSpace.vue` 的"个人"标签页
- 更新所有引用旧路由的导航链接
- 保留 `/profile/:username`（我的空间）不变
- 更新 `UserCenterNav.vue` 组件的导航链接
- 更新 `UnifiedNavbar.vue` 中的个人中心入口

## Impact
- Affected specs: user-center-v2, user-center-v2-profile-area
- Affected code:
  - `src/views/UserCenterV2.vue` → 重命名为 `UserSpace.vue`
  - `src/views/user-center/UserInfo.vue` → 废除
  - `src/router/index.js` → 路由更新
  - `src/components/UserCenterNav.vue` → 导航链接更新
  - `src/components/UnifiedNavbar.vue` → 入口链接更新
  - `src/views/UserCenter.vue` → 可能需要更新子路由

## ADDED Requirements

### Requirement: 个人空间页面整合
系统 SHALL 提供一个统一的"个人空间"页面，整合原个人信息页面的所有功能。

#### Scenario: 用户访问个人空间
- **WHEN** 用户访问 `/user-space` 或点击"个人空间"入口
- **THEN** 系统显示个人空间页面，包含帖子、社区、消息、个人四个标签
- **AND** "个人"标签页包含原 UserInfo.vue 的所有功能（头像管理、生日设置、加群时间、功能入口等）

### Requirement: 旧路由重定向
系统 SHALL 将旧路由重定向到新路由以保持向后兼容。

#### Scenario: 用户访问旧路由
- **WHEN** 用户访问 `/user-center/info` 或 `/user-center-v2`
- **THEN** 系统重定向到 `/user-space`

### Requirement: 导航入口更新
系统 SHALL 更新所有导航入口指向新的个人空间路由。

#### Scenario: 用户点击导航栏个人中心
- **WHEN** 用户在导航栏点击个人中心相关入口
- **THEN** 系统导航到 `/user-space`

## MODIFIED Requirements

### Requirement: 个人空间命名
系统 SHALL 将"个人中心V2"更名为"个人空间"。

- 页面标题显示为"个人空间"
- 导航链接文字显示为"个人空间"

## REMOVED Requirements

### Requirement: UserInfo.vue 页面
**Reason**: 功能已整合到个人空间的"个人"标签页
**Migration**: 
- 头像管理功能迁移到个人空间"个人"标签
- 生日设置功能迁移到个人空间"个人"标签
- 加群时间设置功能迁移到个人空间"个人"标签
- 功能入口卡片迁移到个人空间"个人"标签
