# 个人空间V2底部消息红点提示 Spec

## Why
用户在个人空间V2页面无法直观看到是否有未读消息，需要点击进入消息页面才能知道。通过在底部导航栏的"消息"项上添加红点提示，用户可以快速了解是否有新消息，提升用户体验。

## What Changes
- 在 UserCenterV2.vue 底部导航栏的"消息"导航项上添加红点消息提示
- 红点显示逻辑完全参考 UnifiedNavbar.vue 中现有的红点实现
- 用户已读消息后红点自动消失

## Impact
- Affected specs: 无
- Affected code: 
  - `src/views/UserCenterV2.vue` - 添加红点显示逻辑和样式

## ADDED Requirements

### Requirement: 底部导航消息红点提示
系统 SHALL 在个人空间V2底部导航栏的"消息"项上显示未读消息红点提示。

#### Scenario: 有未读消息时显示红点
- **WHEN** 用户有未读消息（unreadCount > 0）
- **THEN** 在底部导航"消息"项上显示红点，红点内显示未读消息数量
- **AND** 当未读数量超过99时显示"99+"

#### Scenario: 无未读消息时隐藏红点
- **WHEN** 用户没有未读消息（unreadCount = 0）
- **THEN** 红点不显示

#### Scenario: 用户标记已读后红点消失
- **WHEN** 用户在消息页面标记消息为已读
- **THEN** 红点自动更新显示正确的未读数量
- **AND** 如果全部已读则红点消失

#### Scenario: 实时更新未读状态
- **WHEN** 用户收到新消息通知
- **THEN** 红点实时更新显示新的未读数量

## Implementation Notes
- 使用 `useNotificationStore` 获取 `unreadCount`
- 使用 `storeToRefs` 保持响应式
- 监听 `boh_unread_refresh` 事件同步更新
- 红点样式参考 UnifiedNavbar.vue 中的 `.unread-badge-nav`
