# 个推推送服务迁移规范

## Why
当前项目使用 OneSignal 作为 Web Push 推送服务，现需要迁移到个推（Getui）平台。个推是国内领先的推送服务提供商，具有更好的国内网络支持和稳定性。

## What Changes
- **BREAKING** 移除 OneSignal SDK 和相关配置
- 集成个推 Web Push SDK
- 更新推送 API 调用逻辑
- 更新用户关联和标签管理功能

## Impact
- Affected specs: `integrate-onesignal-notifications`
- Affected code:
  - `index.html` - 移除 OneSignal SDK，添加个推 SDK
  - `src/composables/useNotifications.js` - 重写推送逻辑
  - `src/utils/onesignal.js` - 重命名为 `getui.js` 并重写 API 调用
  - `src/stores/auth.js` - 更新用户关联逻辑
  - `src/stores/notifications.js` - 更新推送发送逻辑
  - `public/OneSignalSDKWorker.js` - 删除或替换

## 个推配置信息
| 配置项 | 值 |
|--------|-----|
| APP ID | NO3jm2GOKV8KJZ2sShrxq |
| App Key | FS5qLs9dAj98zaFNXT88s1 |
| App Secret | hUQECeIulaAUWoKRt6V1g5 |
| Master Secret | i6auJBobcjADbUNeI9s1oA |

## ADDED Requirements

### Requirement: 个推 SDK 集成
系统 SHALL 集成个推 Web Push SDK，实现浏览器推送通知功能。

#### Scenario: SDK 初始化
- **WHEN** 用户访问网站
- **THEN** 个推 SDK 自动初始化
- **AND** 使用配置的 APP ID 和 App Key

#### Scenario: 用户订阅通知
- **WHEN** 用户点击允许通知权限
- **THEN** 设备成功注册到个推平台
- **AND** 获取唯一的 Client ID (CID)

### Requirement: 用户关联功能
系统 SHALL 支持将个推 CID 与用户 ID 关联，实现精准推送。

#### Scenario: 用户登录关联
- **WHEN** 用户成功登录网站
- **THEN** 系统将个推 CID 与用户 ID 绑定
- **AND** 支持通过用户 ID 定向推送

#### Scenario: 用户登出解绑
- **WHEN** 用户登出网站
- **THEN** 系统解除 CID 与用户 ID 的绑定

### Requirement: 推送通知发送
系统 SHALL 通过个推 REST API 发送 Web Push 通知。

#### Scenario: 发送单用户推送
- **WHEN** 系统需要给特定用户发送通知
- **THEN** 调用个推 API 发送推送
- **AND** 用户收到浏览器通知

#### Scenario: 推送失败处理
- **WHEN** 推送发送失败
- **THEN** 系统记录错误日志
- **AND** 不影响站内通知功能

### Requirement: 用户标签管理
系统 SHALL 支持为用户设置标签，支持按标签筛选推送。

#### Scenario: 设置用户标签
- **WHEN** 用户订阅通知并登录
- **THEN** 系统自动设置用户标签（用户名、角色等）
- **AND** 支持后续按标签筛选推送

## MODIFIED Requirements

### Requirement: 推送服务配置
原 OneSignal 配置替换为个推配置，保持相同的功能接口。

## REMOVED Requirements

### Requirement: OneSignal 集成
**Reason**: 迁移到个推平台
**Migration**: 
- 删除 OneSignal SDK 引用
- 删除 `public/OneSignalSDKWorker.js`
- 移除 `VITE_ONESIGNAL_REST_API_KEY` 环境变量

## 技术实现要点

### 个推 Web Push SDK 集成
```javascript
// 个推 SDK 初始化
const gtConfig = {
  appId: 'NO3jm2GOKV8KJZ2sShrxq',
  appKey: 'FS5qLs9dAj98zaFNXT88s1',
  // ...其他配置
};
```

### 个推 REST API
个推提供 REST API 用于服务端推送：
- API 地址: `https://restapi.getui.com/v2/$APP_ID`
- 鉴权方式: 使用 App Key 和 Master Secret 获取 Token
- 推送接口: `/push/single/cid` 或 `/push/single/alias`

### 环境变量
```
VITE_GETUI_APP_ID=NO3jm2GOKV8KJZ2sShrxq
VITE_GETUI_APP_KEY=FS5qLs9dAj98zaFNXT88s1
VITE_GETUI_APP_SECRET=hUQECeIulaAUWoKRt6V1g5
VITE_GETUI_MASTER_SECRET=i6auJBobcjADbUNeI9s1oA
```
