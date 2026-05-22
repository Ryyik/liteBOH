# 个人中心V2个人区域设计 - 产品需求文档

## Why
个人中心V2的"个人"tab目前只是一个占位符（显示"个人内容区域"），需要设计一个完整的个人区域界面，包含用户卡片入口和快捷功能入口，为用户提供便捷的个人功能访问。

## What Changes
- 在"个人"tab中创建用户头像+ID卡片组件，点击可前往个人空间
- 添加礼物、邮件、订阅与积分三个快捷入口
- 采用卡片式布局，保持与现有玻璃UI风格一致
- 支持多设备适配

## Impact
- Affected specs: user-center-v2
- Affected code: 
  - src/views/UserCenterV2.vue（主要修改）
  - 可能需要创建新的子组件

## ADDED Requirements

### Requirement: 用户卡片组件
The system SHALL 在个人区域顶部显示用户卡片

#### Scenario: 显示用户信息
- **WHEN** 用户进入个人区域
- **THEN** 显示用户头像和用户ID的卡片
- **AND** 卡片具有玻璃UI效果

#### Scenario: 点击跳转
- **WHEN** 用户点击用户卡片
- **THEN** 跳转到个人空间页面（/profile/:username）

#### Scenario: 未登录状态
- **WHEN** 用户未登录
- **THEN** 显示登录提示或引导登录

### Requirement: 快捷功能入口
The system SHALL 在个人区域显示快捷功能入口

#### Scenario: 功能入口显示
- **WHEN** 用户进入个人区域
- **THEN** 显示礼物、邮件、订阅与积分三个功能入口
- **AND** 每个入口显示图标和名称

#### Scenario: 礼物入口
- **WHEN** 用户点击"礼物"入口
- **THEN** 跳转到礼物页面（/gift 或 /user-center/address）

#### Scenario: 邮件入口
- **WHEN** 用户点击"邮件"入口
- **THEN** 跳转到信箱页面（/mailbox）
- **AND** 如有未读邮件显示红点或数量提示

#### Scenario: 订阅与积分入口
- **WHEN** 用户点击"订阅与积分"入口
- **THEN** 跳转到订阅与积分页面（/user-center/points）

### Requirement: 视觉设计
The system SHALL 保持与现有设计风格一致

#### Scenario: 卡片样式
- **WHEN** 渲染个人区域组件
- **THEN** 使用玻璃UI效果
- **AND** 与底部导航栏和整体页面风格一致

#### Scenario: 交互动效
- **WHEN** 用户悬停或点击卡片
- **THEN** 提供流畅的视觉反馈

### Requirement: 多设备适配
The system SHALL 支持多种设备尺寸

#### Scenario: 桌面端适配
- **WHEN** 屏幕宽度 > 1024px
- **THEN** 卡片居中显示，最大宽度限制

#### Scenario: 移动端适配
- **WHEN** 屏幕宽度 < 768px
- **THEN** 卡片全宽显示，保持良好的触摸区域

## MODIFIED Requirements
无

## REMOVED Requirements
无
