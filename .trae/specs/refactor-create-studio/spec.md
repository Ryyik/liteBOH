# Create Studio 重构 - Product Requirement Document

## Overview

* **Summary**: 重构Create Studio，采用最基础的逻辑架构，包含项目管理面板和三栏布局的编辑页面。左侧为AI对话，中间为分镜编写，下方为项目思路，右侧为保存与导出功能。

* **Purpose**: 简化现有复杂的Create Studio功能，提供清晰、直观的分镜创作体验。

* **Target Users**: 视频创作者、分镜师、内容创作者

## Goals

* 重构为两个核心界面：项目管理面板和三栏编辑页面

* 实现AI对话、分镜编写、项目思路、保存导出的核心功能

* 支持分镜卡片/表格模式切换和卡片拖动排序

* 支持导出为txt格式和Excel格式

* 复用现有数据库云端保存逻辑

## Non-Goals (Out of Scope)

* 团队协作功能（本期暂不实现）

* 复杂的时间轴视图

* 音频模块和素材管理模块

* 复杂的项目参数配置

## Background & Context

现有Create Studio功能复杂，包含团队协作、时间轴、音频、素材等多个模块。本次重构要求"使用最基础的逻辑"，聚焦核心分镜创作功能。

## Functional Requirements

* **FR-1**: 项目管理面板展示所有项目

* **FR-2**: 点击项目进入三栏编辑页面

* **FR-3**: 左侧面板支持AI对话

* **FR-4**: 中间面板支持分镜编写（含项目思路区）

* **FR-5**: 右侧面板支持保存和导出

* **FR-6**: 分镜支持卡片/表格模式切换

* **FR-7**: 卡片模式支持拖动调整顺序

* **FR-8**: 支持导出为txt格式

* **FR-9**: 分镜表支持导出为Excel

* **FR-10**: 复用现有云端保存逻辑

## Non-Functional Requirements

* **NFR-1**: 界面简洁直观，符合基础逻辑原则

* **NFR-2**: 响应式布局，适配不同屏幕尺寸

* **NFR-3**: 云端保存延迟不超过2秒

* **NFR-4**: 导出功能稳定可靠

## Constraints

* **Technical**: Vue 3, 现有Supabase数据库, 不引入重大新依赖

* **Business**: 复用现有数据库表结构和API

* **Dependencies**: 现有studioData.js、creator-workflow-api.js

## Assumptions

* 现有数据库表结构无需修改

* 现有API可以满足保存需求

* AI对话功能可复用现有BOHAI逻辑或简化实现

## Acceptance Criteria

### AC-1: 项目管理面板可用

* **Given**: 用户进入Create Studio

* **When**: 展示项目列表

* **Then**: 可以看到所有项目，支持创建新项目和打开已有项目

* **Verification**: `programmatic`

### AC-2: 三栏编辑页面布局正确

* **Given**: 用户打开一个项目

* **When**: 进入编辑页面

* **Then**: 显示三栏布局：左侧AI对话、中间分镜编写、右侧保存导出

* **Verification**: `human-judgment`

### AC-3: 分镜卡片/表格模式切换

* **Given**: 用户在编辑页面

* **When**: 切换视图模式

* **Then**: 可以在卡片和表格模式间切换

* **Verification**: `programmatic`

### AC-4: 卡片模式拖动排序

* **Given**: 用户在卡片模式下

* **When**: 拖动分镜卡片

* **Then**: 可以调整分镜顺序，保存后顺序正确

* **Verification**: `programmatic`

### AC-5: 导出txt功能

* **Given**: 用户在编辑页面

* **When**: 点击导出txt

* **Then**: 下载包含项目信息和分镜的txt文件

* **Verification**: `programmatic`

### AC-6: 导出Excel功能

* **Given**: 用户在编辑页面

* **When**: 点击导出Excel

* **Then**: 下载包含分镜表的Excel文件

* **Verification**: `programmatic`

### AC-7: 云端保存功能正常

* **Given**: 用户修改项目内容

* **When**: 自动或手动保存

* **Then**: 内容正确保存到云端数据库

* **Verification**: `programmatic`

## Open Questions

* [ ] AI对话功能是复用现有BOHAI还是简化实现？

  使用DeepSeek R1 8b的模型（在模型广场里），做拍摄脚本分镜的优化

  <br />

