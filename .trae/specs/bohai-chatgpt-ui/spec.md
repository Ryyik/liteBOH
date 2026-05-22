# BOHAI AI ChatGPT 风格界面优化 - Product Requirement Document

## Overview

* **Summary**: 对 BOHAI AI 聊天界面进行全面重构，打造符合现代 ChatGPT 风格的用户界面，优化用户体验和视觉设计。

* **Purpose**: 提供简洁、高效、美观的 AI 聊天体验，增强用户与 AI 交互的流畅性。

* **Target Users**: 方块之家社区成员，需要 AI 智能助手功能的用户。

## Goals

* 实现纯白色简约设计风格

* 重构对话界面为纯文本展示形式

* 添加 GPT 风格的呼吸动画效果

* 实现模型和模式的下拉选择功能

* 创建功能栏交互（+ 号展开）

* 根据不同模式正确响应（普通 vs 指令）

* 添加毛玻璃效果增强视觉层次

* 确保支持删除对话功能 

## Non-Goals (Out of Scope)

* 不修改后端 API 逻辑

* 不添加新的模型配置

* 不重构数据存储机制

* 不添加其他额外功能（如文件上传等）

## Background & Context

* 当前已有 BOHAI AI 聊天页面和基本功能

* 已存在 `ai-memory.js` 社区知识库和 `minecraft-commands.js` 指令知识库

* 使用 Vue 3 + Vite 技术栈

* 已有 UnifiedNavbar 通用导航栏组件

## Functional Requirements

* **FR-1**: 实现纯白色简约设计风格

* **FR-2**: 对话界面采用纯文本展示（移除头像和气泡）

* **FR-3**: AI 思考状态显示呼吸动画圆点

* **FR-4**: 用户消息样式重新设计

* **FR-5**: 模型选择下拉菜单

* **FR-6**: 模式选择下拉菜单

* **FR-7**: + 号按钮展开功能栏

* **FR-8**: 功能栏包含指令模式选项

* **FR-9**: 指令模式使用 minecraft-commands.js 响应

* **FR-10**: 普通模式使用 ai-memory.js 响应

* **FR-11**: 毛玻璃效果应用

* **FR-12**: 对话列表支持删除功能

* **FR-13**: 流畅的交互动画效果

## Non-Functional Requirements

* **NFR-1**: 响应式设计，适配各种屏幕尺寸

* **NFR-2**: 流畅的动画和过渡效果

* **NFR-3**: 符合现代 UI/UX 设计标准

* **NFR-4**: 统一的视觉风格和配色

## Constraints

* **Technical**: Vue 3, Vite, CSS 原生

* **Business**: 必须保留现有核心功能，只做 UI 优化

* **Dependencies**: 现有 useChatEngine composable

## Assumptions

* 用户希望获得类似 ChatGPT 的简洁体验

* 现有知识库文件结构保持不变

* 开发环境可以正常运行

## Acceptance Criteria

### AC-1: 整体设计风格

* **Given**: 用户访问 BOHAI AI 页面

* **When**: 页面加载完成

* **Then**: 页面呈现以白色为主的简约设计风格

* **Verification**: `human-judgment`

### AC-2: 纯文本对话展示

* **Given**: 有对话历史记录

* **When**: 用户查看对话

* **Then**: AI 回答区域没有头像和气泡，采用纯文本展示

* **Verification**: `human-judgment`

### AC-3: 呼吸动画效果

* **Given**: 用户发送消息

* **When**: AI 正在思考/处理请求

* **Then**: 显示类似 GPT 的呼吸动画圆点

* **Verification**: `human-judgment`

### AC-4: 用户消息设计

* **Given**: 用户发送消息

* **When**: 消息显示在对话中

* **Then**: 用户消息采用符合简约风格的样式

* **Verification**: `human-judgment`

### AC-5: 模型切换下拉

* **Given**: 用户在聊天界面

* **When**: 用户点击模型选择器

* **Then**: 显示下拉列表，可选择不同模型

* **Verification**: `human-judgment`

### AC-6: 模式切换下拉

* **Given**: 用户在聊天界面

* **When**: 用户点击模式选择器

* **Then**: 显示下拉列表，可选择不同模式

* **Verification**: `human-judgment`

### AC-7: + 号功能栏

* **Given**: 用户在聊天界面

* **When**: 用户点击 + 号按钮

* **Then**: 展开功能栏

* **Verification**: `human-judgment`

### AC-8: 指令模式选项

* **Given**: 功能栏已展开

* **When**: 用户查看功能栏

* **Then**: 包含"指令模式"选项

* **Verification**: `human-judgment`

### AC-9: 指令模式响应

* **Given**: 用户选择指令模式

* **When**: AI 响应 Minecraft 相关问题

* **Then**: 参考 minecraft-commands.js 进行回答

* **Verification**: `programmatic`

### AC-10: 普通模式响应

* **Given**: 用户选择普通模式

* **When**: AI 回答社区相关问题

* **Then**: 参考 ai-memory.js 进行回答

* **Verification**: `programmatic`

### AC-11: 毛玻璃效果

* **Given**: 用户在聊天界面

* **When**: 查看 UI 元素（导航栏、菜单等）

* **Then**: 适当元素应用毛玻璃效果

* **Verification**: `human-judgment`

### AC-12: 删除对话功能

* **Given**: 有多个对话

* **When**: 用户点击删除按钮

* **Then**: 对应的对话被删除

* **Verification**: `programmatic`

### AC-13: 流畅交互

* **Given**: 用户进行各种操作

* **When**: 触发交互（点击、发送、删除等）

* **Then**: 所有交互响应流畅，动画自然

* **Verification**: `human-judgment`

## Open Questions

* 无已知开放问题

