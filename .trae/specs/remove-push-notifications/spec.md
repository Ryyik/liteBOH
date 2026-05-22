# 移除推送通知功能 Spec

## Why
用户不再需要消息推送功能（OneSignal、个推等），只保留原有的站内消息系统。

## What Changes
- 删除 OneSignal SDK 及相关代码
- 删除个推迁移相关未完成的代码
- 清理 useNotifications composable 中的推送相关逻辑
- 清理 auth store 中的 OneSignal 用户同步逻辑
- 清理 notifications store 中的 Web Push 发送逻辑
- 清理 NotificationBell 组件中的推送相关逻辑
- **BREAKING**: 移除所有外部推送通知能力，仅保留站内消息

## Impact
- Affected specs: integrate-onesignal-notifications, migrate-to-getui-push
- Affected code: 
  - `index.html`
  - `src/composables/useNotifications.js`
  - `src/utils/onesignal.js`
  - `src/stores/auth.js`
  - `src/stores/notifications.js`
  - `src/components/NotificationBell.vue`
  - `public/OneSignalSDKWorker.js`
  - `.env` 和 `.env.example`

## REMOVED Requirements

### Requirement: OneSignal Web Push 集成
**Reason**: 用户不再需要外部推送通知服务
**Migration**: 站内消息系统保持不变，用户仍可在站内接收通知

### Requirement: 个推推送迁移
**Reason**: 用户不再需要外部推送通知服务
**Migration**: 无需迁移，直接移除

## RETAINED Requirements

### Requirement: 站内消息系统
系统 SHALL 继续提供站内消息功能：
- 实时消息监听（通过 Supabase Realtime）
- 未读消息计数
- 消息列表展示
- 未读消息计数
- 消息 Toast 提示（站内）
