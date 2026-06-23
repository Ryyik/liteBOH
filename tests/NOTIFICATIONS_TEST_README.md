# 消息中心修复验证测试

## 📋 测试概述

本测试套件用于验证消息中心修复后的逻辑，包括：
- 全局事件监听器管理
- 重复的 onMounted 钩子合并
- 错误状态优先显示
- TypeScript 类型安全
- 实时订阅连接管理
- Store 单例模式竞态
- 自操作通知过滤

## 🚀 快速开始

### 1. 运行测试脚本

```bash
# 方式1: 使用脚本运行
cd tests/scripts
chmod +x run-notifications-test.sh
./run-notifications-test.sh

# 方式2: 使用 npm 命令
npm run test:unit notifications-fix-validation.test.js

# 方式3: 使用 Vitest 直接运行
vitest run tests/unit/notifications-fix-validation.test.js
```

### 2. 查看详细输出

```bash
# 使用 verbose reporter
npm run test:unit notifications-fix-validation.test.js -- --reporter=verbose

# 或
vitest run tests/unit/notifications-fix-validation.test.js --reporter=verbose
```

## 📁 文件结构

```
tests/
├── mock/
│   └── notifications-mock-data.js      # Mock 数据和辅助函数
├── unit/
│   └── notifications-fix-validation.test.js  # 修复验证测试
└── scripts/
    └── run-notifications-test.sh       # 测试运行脚本
```

## 🧪 Mock 数据说明

### Mock 用户数据
- 4个测试用户（张三、李四、王五、系统）
- 包含完整的用户信息（id, username, avatar_url, email）

### Mock 通知数据
- 10条不同类型的通知（点赞、评论、印象、系统、中奖）
- 包含已读/未读状态
- 包含已归档/未归档状态
- 包含自操作通知（自己点赞自己）

### Mock API 响应
- `getUserNotifications`: 获取用户通知列表
- `getArchivedNotifications`: 获取已归档通知
- `getUnreadNotificationCount`: 获取未读计数
- `archiveNotification`: 归档单条通知
- `unarchiveNotification`: 取消归档
- `markNotificationAsRead`: 标记已读
- `markAllNotificationsAsRead`: 标记全部已读

### Mock 实时订阅
- `MockRealtimeChannel`: 模拟 Supabase Realtime Channel
- 支持事件监听和状态变化模拟
- 可模拟 INSERT、UPDATE、DELETE 事件

## 🔧 自定义测试数据

### 修改 Mock 数据

编辑 `tests/mock/notifications-mock-data.js`:

```javascript
// 添加新的通知类型
export const mockNotifications = [
  {
    id: 'notif-new',
    recipient_id: 'user-001',
    sender_id: 'user-002',
    type: 'new_type', // 自定义类型
    status: 'unread',
    created_at: new Date().toISOString(),
    // ... 其他字段
  },
  // ... 其他通知
];

// 修改测试场景
export const testScenarios = {
  custom: {
    userId: 'user-001',
    notifications: [...mockNotifications],
    unreadCount: 5
  }
};
```

### 生成随机通知

```javascript
import { generateRandomNotification } from './mock/notifications-mock-data.js';

// 生成随机点赞通知
const randomLike = generateRandomNotification('user-001', 'like');

// 生成随机评论通知
const randomComment = generateRandomNotification('user-001', 'comment');
```

## 📊 测试场景

### 正常场景
- 用户有多个通知
- 包含不同类型的通知
- 包含已读和未读通知

### 空数据场景
- 用户没有任何通知
- 未读计数为 0

### 大量数据场景
- 100条通知
- 测试性能和内存使用

### 错误场景
- 网络错误
- 服务器错误
- 认证错误

## 🐛 调试技巧

### 1. 查看详细日志

```bash
# 启用 debug 日志
DEBUG=* npm run test:unit notifications-fix-validation.test.js
```

### 2. 单独运行某个测试

```bash
# 运行特定测试
vitest run -t "修复1: 全局事件监听器管理"
```

### 3. 监听模式

```bash
# 监听文件变化，自动重新运行测试
vitest watch tests/unit/notifications-fix-validation.test.js
```

## ✅ 验证修复效果

### 修复1: 全局事件监听器管理
✅ 事件监听器在组件挂载时注册
✅ 事件监听器在组件卸载时清理

### 修复2: 合并重复的 onMounted 钩子
✅ 初始化逻辑按正确顺序执行
✅ 无竞态条件

### 修复3: 错误状态优先显示
✅ 错误状态优先于加载状态显示
✅ 用户不会长时间看到骨架屏

### 修复4: TypeScript 类型安全
✅ notifications 是 NotificationItem[] 类型
✅ notificationSubscription 是 RealtimeChannel | null 类型

### 修复5: 实时订阅连接管理
✅ 监听连接状态变化
✅ 处理连接断开
✅ 记录连接日志

### 修复6: Store 单例模式竞态
✅ 首次加载成功
✅ 重复加载返回同一实例
✅ 加载失败记录错误
✅ 清除错误后允许重试

### 修复7: 自操作通知过滤
✅ 过滤掉自己点赞自己的通知
✅ 过滤掉自己评论自己的通知

## 📝 测试报告

测试完成后，查看报告：
- ✅ 通过的测试数量
- ❌ 失败的测试数量
- ⏱️ 测试执行时间
- 📊 测试覆盖率（如果启用）

## 🔗 相关文件

- 修复代码: `src/views/user-center/Messages/index.vue`
- 修复代码: `src/stores/notifications.ts`
- 修复代码: `src/stores/notification-loader.ts`
- 修复代码: `src/utils/api/notifications-api.js`

## 💡 提示

1. **测试前确保依赖已安装**: `npm install`
2. **修改代码后重新运行测试**: 测试会自动检测文件变化
3. **查看详细输出**: 使用 `--reporter=verbose` 参数
4. **调试特定测试**: 使用 `-t` 参数指定测试名称

## 🆘 常见问题

### Q: 测试失败怎么办？
A: 检查 mock 数据是否正确，确保修复代码已应用。

### Q: 如何添加新的测试？
A: 在 `notifications-fix-validation.test.js` 中添加新的 `describe` 块。

### Q: 如何修改 Mock 数据？
A: 编辑 `notifications-mock-data.js` 文件。

### Q: 测试运行很慢怎么办？
A: 使用 `--reporter=dot` 参数简化输出，或单独运行特定测试。

---

**祝测试顺利！** 🎉