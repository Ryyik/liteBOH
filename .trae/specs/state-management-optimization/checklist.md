# Checklist

## Task 1: pinia-plugin-persistedstate 配置
- [x] pinia-plugin-persistedstate 依赖已安装
- [x] main.js 中正确配置了持久化插件
- [x] authStore 添加了 persist 配置选项

## Task 2: authStore 扩展
- [x] authStore 包含 bio, experience, tags 字段
- [x] updateUserProfile action 已实现并可正确更新用户资料
- [x] resetState action 已实现并可正确重置状态
- [x] updateLocalState 方法正确更新所有字段

## Task 3: notificationsStore 扩展
- [x] notificationsStore 包含 resetState action
- [x] unreadCount 为唯一未读计数数据源

## Task 4: Profile.vue 重构
- [x] 移除了本地 profile ref
- [x] 使用 storeToRefs 从 authStore 获取用户信息
- [x] 使用 authStore.updateUserProfile 更新用户资料
- [x] 移除了深度 watch

## Task 5: UserSpace.vue 重构
- [x] 移除了本地用户信息 ref (userBirthday, avatarUrl 等)
- [x] 使用 storeToRefs 从 authStore 获取用户信息
- [x] 移除了深度 watch userInfo
- [x] 使用 authStore.updateUserProfile 更新用户资料

## Task 6: Messages.vue 重构
- [x] 移除了本地 messages ref（如适用）
- [x] 未读计数从 notificationsStore.unreadCount 获取
- [x] 移除了重复的未读计数计算逻辑

## Task 7: 登出流程完善
- [x] logout action 调用 resetState
- [x] localStorage 中的相关数据已清理
- [x] 实时订阅已停止

## Task 8: 验证测试
- [x] 用户登录后状态正确持久化
- [x] 页面刷新后状态正确恢复
- [x] 用户登出后状态正确清理
- [x] 用户资料更新后多组件同步正确
