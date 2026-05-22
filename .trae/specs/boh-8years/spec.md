# BOH 八年社群纪念 - 产品需求文档

## Overview
- **Summary**: 设计并实现一个具有 Apple 风格的沉浸式滚动纪念网页，通过滚动叙事讲述 BOH 社群八年的故事，重点展示一封写给社群成员的信。
- **Purpose**: 纪念 BOH 社群成立八周年，通过沉浸式的视觉和情感体验，向社群成员表达感谢和展望未来。
- **Target Users**: BOH 社群成员、社区参与者、关注者。

## Goals
- 通过沉浸式滚动体验讲述八年社群故事
- 呈现克制而有力量的情绪表达
- 以一封写给社群的信为页面核心
- 实现 Apple 风格的极简、高级视觉效果
- 提供流畅的交互动画体验

## Non-Goals (Out of Scope)
- 不实现复杂的用户交互功能（如评论、分享）
- 不涉及后端数据存储和数据库
- 不实现社交登录或用户认证
- 不开发移动端 APP，仅响应式网页

## Background & Context
- 项目基于现有 Vue3 + Vite + Tailwind CSS 技术栈
- 参考 Apple 官网的叙事式滚动体验
- 使用社区已有的历史图片资源
- 遵循现有项目的代码风格和架构模式

## Functional Requirements
- **FR-1**: 开场黑屏动画，文案缓慢出现
- **FR-2**: 2018-2026 时间轴滚动叙事
- **FR-3**: 高光瞬间横向滚动区域
- **FR-4**: 信件部分 sticky 定位，文字逐行出现
- **FR-5**: 结尾区域，包含有力文案和交互按钮
- **FR-6**: 响应式设计，支持移动端和桌面端

## Non-Functional Requirements
- **NFR-1**: 页面加载时间 < 2s
- **NFR-2**: 动画流畅度 60fps
- **NFR-3**: 支持主流现代浏览器（Chrome、Safari、Firefox、Edge）
- **NFR-4**: 代码结构清晰，可维护性高

## Constraints
- **Technical**: Vue3 + Vite + Tailwind CSS，不能引入新的大型依赖
- **Business**: 保持极简、克制的设计风格，不使用过度装饰
- **Dependencies**: 使用项目现有的图片资源

## Assumptions
- 用户会在现代浏览器中访问
- 用户会使用滚动浏览整个页面
- 社区历史图片资源可正常加载
- 现有技术栈足以实现所有需求

## Acceptance Criteria

### AC-1: 开场动画
- **Given**: 用户打开页面
- **When**: 页面加载完成
- **Then**: 显示黑屏，一句文案（"已经八年了"）缓慢渐显
- **Verification**: `human-judgment`
- **Notes**: 动画时长约 2-3 秒

### AC-2: 时间轴叙事
- **Given**: 用户开始向下滚动
- **When**: 滚动经过时间轴区域
- **Then**: 2018-2026 各年份内容依次渐入，包含文字和图片
- **Verification**: `human-judgment`
- **Notes**: 元素入场动画使用 fade in + translateY

### AC-3: 高光瞬间
- **Given**: 用户滚动到高光瞬间区域
- **When**: 进入该区域
- **Then**: 显示横向滚动或拼接的图片展示
- **Verification**: `human-judgment`
- **Notes**: 视觉冲击力强，图片展示有层次感

### AC-4: 信件部分
- **Given**: 用户滚动到信件区域
- **When**: 滚动时信件区域保持 sticky 定位
- **Then**: 信件文字一行一行逐字出现，情绪递进
- **Verification**: `human-judgment`
- **Notes**: 阅读体验流畅，文字出现节奏适中

### AC-5: 结尾收束
- **Given**: 用户滚动到页面底部
- **When**: 到达结尾区域
- **Then**: 显示有力文案（"第九年，我们还在"）和交互按钮
- **Verification**: `human-judgment`

### AC-6: 响应式适配
- **Given**: 用户在不同设备上访问
- **When**: 屏幕尺寸变化
- **Then**: 页面布局自适应，在移动端和桌面端都有良好体验
- **Verification**: `programmatic`

### AC-7: 动画流畅性
- **Given**: 用户滚动浏览页面
- **When**: 触发各种动画效果
- **Then**: 动画流畅，无卡顿，体验自然
- **Verification**: `human-judgment`

## Open Questions
- [ ] 信件部分的具体文案内容需要确认
- [ ] 各年份的具体记忆片段和图片需要提供
- [ ] 高光瞬间的具体图片内容需要确认
- [ ] 结尾按钮的具体链接或功能需要确认
