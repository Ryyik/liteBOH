# 状态管理优化 Spec

## Why
当前项目中用户状态分散在多个组件中，导致数据同步困难、代码冗余和潜在的状态不一致问题。需要统一状态管理，提升代码可维护性和性能。

## What Changes
- 将分散在 Profile.vue、UserSpace.vue 中的用户信息统一到 authStore
- 使用 pinia-plugin-persistedstate 统一管理持久化
- 添加登出时的状态重置机制
- 优化深度 watch 使用，提升性能
- 统一通知状态管理，避免重复的未读计数计算

## Impact
- Affected specs: 用户认证、通知系统、用户中心
- Affected code: 
  - `src/stores/auth.js`
  - `src/stores/notifications.js`
  - `src/views/Profile.vue`
  - `src/views/user-center/UserSpace.vue`
  - `src/views/user-center/Messages.vue`

## ADDED Requirements

### Requirement: 统一用户状态管理
系统 SHALL 将所有用户相关状态集中在 authStore 中管理，组件通过 storeToRefs 获取用户信息。

#### Scenario: 组件获取用户信息
- **WHEN** 组件需要访问用户信息
- **THEN** 应通过 `useAuthStore()` 和 `storeToRefs()` 获取，而非本地复制

#### Scenario: 用户信息更新
- **WHEN** 用户更新个人资料
- **THEN** 应通过 authStore 的 action 统一处理，自动同步到所有组件

### Requirement: 状态持久化
系统 SHALL 使用 pinia-plugin-persistedstate 统一管理状态持久化。

#### Scenario: 页面刷新后状态恢复
- **WHEN** 用户刷新页面
- **THEN** 用户登录状态和基本信息应自动恢复

#### Scenario: 敏感信息保护
- **WHEN** 持久化状态
- **THEN** 不应持久化敏感信息如 token

### Requirement: 状态重置机制
系统 SHALL 在用户登出时清理所有相关状态。

#### Scenario: 用户登出
- **WHEN** 用户点击登出
- **THEN** authStore 和 notificationsStore 的状态应被重置为初始值

### Requirement: 性能优化
系统 SHALL 减少不必要的深度 watch 使用。

#### Scenario: 监听用户状态变化
- **WHEN** 需要监听用户状态变化
- **THEN** 应使用具体属性监听而非深度 watch 整个对象

### Requirement: 统一通知管理
系统 SHALL 将通知状态统一在 notificationsStore 中管理。

#### Scenario: 未读计数计算
- **WHEN** 需要显示未读计数
- **THEN** 应从 notificationsStore 获取单一数据源，避免多处计算

## MODIFIED Requirements

### Requirement: authStore 扩展
authStore SHALL 包含完整的用户信息字段和统一的更新方法。

**新增字段:**
- `bio` - 用户简介
- `experience` - 经验值
- `tags` - 用户标签

**新增方法:**
- `updateUserProfile(updates)` - 统一更新用户资料
- `resetState()` - 重置所有状态

### Requirement: notificationsStore 扩展
notificationsStore SHALL 作为通知状态的唯一数据源。

**新增方法:**
- `resetState()` - 重置通知状态

## REMOVED Requirements

### Requirement: 组件本地用户状态
**Reason**: 用户状态应统一管理，避免数据不一致
**Migration**: 组件中的本地用户信息 ref 应改为从 store 获取
