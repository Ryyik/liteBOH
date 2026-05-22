# 个人空间V2消息页面引入消息中心组件 - 产品需求文档

## Why
个人空间V2的消息页面目前只是一个占位符（显示"消息内容区域"），需要引入现有的消息中心组件，为用户提供完整的通知消息功能。

## What Changes
- 在 UserCenterV2.vue 的消息 tab 中引入 Messages.vue 组件
- 采用全屏布局，移除 Messages.vue 中的返回按钮和标题栏（因为已在 UserCenterV2 中有底部导航）
- 极简布局设计，只保留核心消息列表功能
- 适配 UserCenterV2 的玻璃UI风格

## Impact
- Affected specs: user-center-v2
- Affected code: 
  - src/views/UserCenterV2.vue
  - src/views/user-center/Messages.vue（可能需要添加极简模式props）

## ADDED Requirements

### Requirement: 消息中心组件集成
The system SHALL 在 UserCenterV2 的消息 tab 中集成消息中心组件

#### Scenario: 正常显示
- **WHEN** 用户切换到消息 tab
- **THEN** 显示消息中心组件，展示用户的通知列表

#### Scenario: 全屏布局
- **WHEN** 消息中心组件在 UserCenterV2 中渲染
- **THEN** 组件占据整个内容区域，无额外边距和标题栏

#### Scenario: 极简模式
- **WHEN** 消息中心以嵌入模式显示
- **THEN** 隐藏返回按钮和"通知"标题，只保留标签筛选和消息列表

#### Scenario: 交互功能
- **WHEN** 用户点击消息项
- **THEN** 正常显示消息详情抽屉

#### Scenario: 标记已读
- **WHEN** 用户点击"全部已读"按钮
- **THEN** 所有未读消息标记为已读

## MODIFIED Requirements
无

## REMOVED Requirements
无
