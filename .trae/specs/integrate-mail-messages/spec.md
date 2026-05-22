# 邮件整合到消息中心 Spec

## Why
当前项目中消息中心（Messages.vue）和信箱（Mailbox.vue）是两个独立的页面，用户需要分别访问。为了简化用户体验，将邮件功能整合到消息中心，作为消息中心的一个标签页/入口。

## What Changes
- 在 Messages.vue 中新增"邮件"标签页
- 将 Mailbox.vue 的核心功能（收件箱、已发送、写信）整合到消息中心
- 更新 UserSpace.vue 中的"邮件"入口，指向消息中心的邮件标签
- 保留 Mailbox.vue 作为独立页面（可通过路由直接访问）

## Impact
- Affected specs: user-center-v2-messages
- Affected code:
  - `src/views/user-center/Messages.vue` - 新增邮件标签页
  - `src/views/user-center/UserSpace.vue` - 更新邮件入口链接
  - `src/views/user-center/UserCenterIndex.vue` - 更新导航链接

## ADDED Requirements

### Requirement: 消息中心邮件标签页
系统 SHALL 在消息中心提供"邮件"标签页，整合信箱功能。

#### Scenario: 用户查看邮件
- **WHEN** 用户在消息中心点击"邮件"标签
- **THEN** 系统显示邮件列表（收件箱/已发送）
- **AND** 用户可以写信、查看邮件详情

### Requirement: 邮件入口更新
系统 SHALL 更新个人空间的邮件入口指向消息中心。

#### Scenario: 用户点击邮件入口
- **WHEN** 用户在个人空间点击"邮件"
- **THEN** 系统跳转到消息中心并自动切换到邮件标签

## MODIFIED Requirements

### Requirement: 消息中心标签
消息中心 SHALL 包含以下标签：
- 全部
- 点赞
- 回复
- 印象
- 邮件（新增）

## REMOVED Requirements

无移除的功能，Mailbox.vue 保持独立可访问。
