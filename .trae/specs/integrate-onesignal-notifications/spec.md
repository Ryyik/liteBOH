# OneSignal 通知与消息中心集成规范

## Why
当前 OneSignal 后台没有用户数据，无法针对特定用户发送 Web Push 通知。需要将 OneSignal 订阅与网站用户系统关联，实现精准推送，同时保持原有站内消息提示功能正常运行。

## What Changes
- 使用 `OneSignal.login(userId)` 将 Supabase 用户 ID 与 OneSignal 订阅绑定
- 用户登录时自动关联 OneSignal 用户，登出时调用 `OneSignal.logout()` 解除关联
- 发送站内通知时同步发送 OneSignal Web Push 通知
- 保持原有站内 Toast 提示功能不变

## Impact
- Affected specs: 消息中心通知系统、用户认证流程
- Affected code: 
  - `src/composables/useNotifications.js` - 扩展 OneSignal 用户关联功能
  - `src/stores/notifications.js` - 添加 Web Push 发送逻辑
  - `src/utils/auth.js` - 登录/登出时处理 OneSignal 关联
  - `index.html` - OneSignal 初始化配置

## ADDED Requirements

### Requirement: OneSignal 用户关联
系统 SHALL 在用户登录时调用 `OneSignal.login(userId)` 将 Supabase 用户 ID 与 OneSignal 订阅绑定。

#### Scenario: 用户登录成功
- **WHEN** 用户成功登录网站
- **THEN** 系统自动调用 `OneSignal.login(user.id)` 关联用户
- **AND** 用户自动出现在 OneSignal 后台 Audience -> All Users 列表
- **AND** 该用户的 External ID 显示为 Supabase 用户 ID

#### Scenario: 用户登出
- **WHEN** 用户登出网站
- **THEN** 系统调用 `OneSignal.logout()` 解除用户关联
- **AND** 设备订阅状态保留（用户仍可接收广播通知）

#### Scenario: 用户订阅通知
- **WHEN** 用户点击允许通知权限
- **THEN** 该设备自动添加到 OneSignal Audience 列表
- **AND** 如果用户已登录，设备自动与用户 ID 关联

### Requirement: Web Push 通知发送
系统 SHALL 在产生站内通知时同步发送 OneSignal Web Push 通知给目标用户。

#### Scenario: 产生新通知
- **WHEN** 用户收到点赞、评论、印象或私信通知
- **THEN** 系统同时发送站内 Toast 提示和 OneSignal Web Push 通知
- **AND** 用户在浏览器外也能收到推送提醒

#### Scenario: 用户未订阅 Push
- **WHEN** 目标用户未订阅 OneSignal Push 通知
- **THEN** 系统仅发送站内通知，不报错

### Requirement: 用户标签管理
系统 SHALL 为每个订阅用户设置标签，支持按条件筛选推送。

#### Scenario: 设置用户标签
- **WHEN** 用户订阅通知并登录
- **THEN** 系统自动设置用户标签（用户名、角色等）
- **AND** 支持后续按标签筛选推送

## MODIFIED Requirements

### Requirement: 通知订阅流程
原通知订阅功能增加用户关联逻辑，确保订阅后能识别用户身份。

## 重要说明：不要手动导入用户

### 为什么不能手动导入？
OneSignal 的"导入"页面是给用 Excel 表格或旧数据库管理系统的场景准备的，不适合现代 Web 开发。

如果手动添加一个邮箱，OneSignal 根本不知道这个"邮箱"对应哪台具体的设备（手机/电脑），它无法发送推送。

### 正确的实现方式
用户的"添加"是自动完成的，整个过程通过"订阅"来实现：

1. **监听用户登录状态**：当 Supabase 确认用户已登录，立刻调用 `OneSignal.login(userId)`
2. **自动订阅**：用户访问网站时，OneSignal SDK 自动弹窗请求权限
3. **自动关联**：用户点击"允许"后，设备自动添加到 Audience 列表，并通过 `OneSignal.login()` 与用户 ID 建立映射

### 查看用户
不要在"导入"页面查看，要去：
- **Audience -> All Users**

完成代码后登录网站，刷新该页面即可看到用户出现在列表中，点击用户可看到 External ID。

## OneSignal 后台配置指南

### 1. 确认应用配置
在 Settings > Keys & IDs 中确认：
- **App ID**: `259c209a-a6ab-40dd-904d-e5ce6beba2b5`（已配置）
- **REST API Key**: 需要获取用于服务端发送通知

### 2. 创建 API Key（用于发送通知）
1. 进入 Settings > Keys & IDs
2. 点击 "Create API Key"
3. 选择权限：`Notifications: Send` 和 `Users: View`
4. 保存 API Key 到环境变量 `VITE_ONESIGNAL_REST_API_KEY`

### 3. 配置 Web Push 设置（可选）
在 Settings > Web Push 中配置：
- **Permission Prompt**: 自定义订阅提示文案
- **Welcome Notification**: 配置欢迎通知
- **Click Action**: 设置点击通知后的跳转行为

### 4. External User ID
OneSignal 默认支持 External User ID，通过 `OneSignal.login()` API 自动设置，无需额外配置。

## 技术实现要点

### 用户关联（核心）
```javascript
// 登录时关联 - 这是连接 Supabase 和 OneSignal 的唯一桥梁
const { data: { user } } = await supabase.auth.getUser();
if (user) {
  await OneSignal.login(user.id);
  console.log("用户已同步到 OneSignal:", user.id);
}

// 登出时解除
await OneSignal.logout();
```

### 发送通知 API
使用 OneSignal REST API 发送给特定用户：
```javascript
POST https://api.onesignal.com/notifications
{
  "app_id": "APP_ID",
  "include_external_user_ids": ["user_id"],
  "headings": {"en": "标题"},
  "contents": {"en": "内容"},
  "url": "点击跳转链接"
}
```

### 用户标签
```javascript
// 设置标签
await OneSignal.User.addTags({
  username: "用户名",
  role: "user"
});
```
