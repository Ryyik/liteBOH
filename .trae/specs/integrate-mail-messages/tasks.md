# 邮件整合到消息中心 - 实施计划

## [x] Task 1: 在 Messages.vue 中添加邮件标签页
- **Priority**: P0
- **Depends On**: None
- **Description**: 
  - 在消息中心的标签栏添加"邮件"标签
  - 添加邮件标签页的内容区域
  - 实现收件箱/已发送切换
  - 集成写信功能
- **Acceptance Criteria Addressed**: 消息中心邮件标签页需求
- **Test Requirements**:
  - `human-judgement` TR-1.1: 消息中心显示"邮件"标签
  - `human-judgement` TR-1.2: 点击标签可切换到邮件视图
  - `human-judgement` TR-1.3: 收件箱/已发送切换正常
  - `human-judgement` TR-1.4: 写信功能正常

## [x] Task 2: 更新 UserSpace.vue 邮件入口
- **Priority**: P0
- **Depends On**: Task 1
- **Description**: 
  - 更新邮件入口链接指向 `/user-center/messages?tab=mail`
  - 或使用路由跳转并传递参数
- **Acceptance Criteria Addressed**: 邮件入口更新需求
- **Test Requirements**:
  - `human-judgement` TR-2.1: 点击邮件入口跳转到消息中心
  - `human-judgement` TR-2.2: 自动切换到邮件标签

## [x] Task 3: 更新 UserCenterIndex.vue 导航链接
- **Priority**: P1
- **Depends On**: Task 1
- **Description**: 
  - 更新导航页面中的邮件链接
- **Acceptance Criteria Addressed**: 导航入口更新需求
- **Test Requirements**:
  - `human-judgement` TR-3.1: 导航页面链接正确

# Task Dependencies
- [Task 2] depends on [Task 1]
- [Task 3] depends on [Task 1]
