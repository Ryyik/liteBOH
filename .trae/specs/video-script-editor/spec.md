# 专业级视频拍摄脚本编辑器 - Product Requirement Document

## Overview
- **Summary**: 设计并开发一个专业级视频拍摄脚本编辑器，具备类似 Adobe Premiere Pro 和 Final Cut Pro 的专业界面与核心功能，并集成 AI 辅助功能集（智能脚本建议、场景自动识别、镜头类型推荐、对白优化、拍摄提示生成）。
- **Purpose**: 满足专业视频创作者的工作需求，提供直观高效的操作流程和强大的智能辅助功能。
- **Target Users**: 专业视频创作者、独立导演、内容创作者、影视制作人。

## Goals
- 提供专业级非线性编辑软件的界面设计和交互逻辑
- 实现完整的专业视频脚本编辑核心功能模块
- 集成 AI 辅助功能集，提升创作效率
- 支持专业级脚本格式（场景、镜头、对白、动作等）
- 与现有 BOH 生态系统集成

## Non-Goals (Out of Scope)
- 不实现实际的视频剪辑和渲染功能
- 不提供视频预览和编辑功能
- 不实现团队协作功能（第一版）
- 不集成外部视频存储服务

## Background & Context
- 当前项目基于 Vue 3 + Vite + Pinia + Supabase 技术栈
- 已有 CreatorStudio 模块作为基础参考
- 用户群体主要为内容创作者，有专业视频制作需求
- 现有产品已具备 AI 聊天和内容创建相关功能

## Functional Requirements

### 核心编辑器功能
- **FR-1**: 支持多面板布局（项目面板、脚本编辑区、时间线、属性面板）
- **FR-2**: 专业脚本格式编辑（场景标题、镜头描述、动作、对白、拍摄提示）
- **FR-3**: 时间线可视化编辑（拖拽、剪切、复制、粘贴场景/镜头）
- **FR-4**: 项目管理（创建、打开、保存、导出脚本）
- **FR-5**: 场景/镜头管理（添加、删除、重排序、嵌套）
- **FR-6**: 富文本编辑（格式化、样式、注释）
- **FR-7**: 搜索和替换功能
- **FR-8**: 撤销/重做功能
- **FR-9**: 导出功能（PDF、Word、Markdown、Fountain 行业标准格式）
- **FR-16**: 云端项目数量限制（每个用户最多存储3个云端项目）

### AI 辅助功能集
- **FR-10**: 智能脚本建议（基于上下文生成下一场景/镜头）
- **FR-11**: 场景自动识别（从文本中自动识别场景要素）
- **FR-12**: 镜头类型推荐（基于场景内容推荐合适的镜头类型）
- **FR-13**: 对白优化（改进对话自然度、节奏和角色一致性）
- **FR-14**: 拍摄提示生成（为每个镜头生成详细拍摄指导）
- **FR-15**: AI 对话式交互（自然语言指令修改脚本）

## Non-Functional Requirements
- **NFR-1**: 界面响应时间 < 100ms
- **NFR-2**: 支持同时编辑至少 100 个场景的脚本
- **NFR-3**: 遵循 WCAG 2.1 AA 级无障碍标准
- **NFR-4**: 编辑器界面统一使用白色主题并保持视觉一致性
- **NFR-5**: AI 功能响应时间 < 3秒（在理想网络条件下）
- **NFR-6**: 数据持久化到 Supabase 数据库

## Constraints
- **Technical**: 必须使用现有的 Vue 3 + Vite + Pinia + Supabase 技术栈
- **Business**: 需要与现有 BOH 生态系统无缝集成
- **Dependencies**: 依赖现有 BOHAI AI 服务、Supabase 数据库

## Assumptions
- 现有 BOHAI AI 服务可以支持所需的 AI 功能集
- 用户已登录 BOH 系统
- 有足够的服务器资源支持 AI 功能调用
- 编辑器主题以白色为准，不再提供深色模式切换

## Acceptance Criteria

### AC-1: 专业级界面布局
- **Given**: 用户打开视频脚本编辑器
- **When**: 编辑器加载完成
- **Then**: 显示符合专业非线性编辑软件的多面板布局（项目面板、编辑区、时间线、属性面板）
- **Verification**: `human-judgment`
- **Notes**: 参考 Adobe Premiere Pro / Final Cut Pro 的布局设计

### AC-2: 脚本编辑核心功能
- **Given**: 用户在编辑器中
- **When**: 用户进行添加/删除/编辑场景和镜头操作
- **Then**: 所有操作都能正确执行并反映在界面上
- **Verification**: `programmatic`

### AC-3: 时间线可视化编辑
- **Given**: 用户在时间线视图
- **When**: 用户拖拽、剪切、复制场景/镜头
- **Then**: 时间线正确更新并同步到脚本内容
- **Verification**: `programmatic`

### AC-4: AI 智能脚本建议
- **Given**: 用户正在编辑脚本且有上下文内容
- **When**: 用户请求 AI 脚本建议
- **Then**: AI 生成符合上下文的下一场景/镜头建议
- **Verification**: `human-judgment`

### AC-5: 场景自动识别
- **Given**: 用户输入文本内容
- **When**: 用户触发场景识别
- **Then**: 系统自动识别并标记场景要素（内/外景、时间、地点）
- **Verification**: `programmatic`

### AC-6: 镜头类型推荐
- **Given**: 用户正在编辑一个场景
- **When**: 用户请求镜头推荐
- **Then**: AI 推荐适合该场景的镜头类型（广角、特写、中景等）
- **Verification**: `human-judgment`

### AC-7: 对白优化
- **Given**: 用户选择一段对话
- **When**: 用户请求对白优化
- **Then**: AI 提供改进后的对话版本，保持角色一致性
- **Verification**: `human-judgment`

### AC-8: 拍摄提示生成
- **Given**: 用户选择一个镜头
- **When**: 用户请求拍摄提示
- **Then**: AI 生成详细的拍摄指导（构图、灯光、角度建议）
- **Verification**: `human-judgment`

### AC-9: 导出功能
- **Given**: 用户完成脚本编辑
- **When**: 用户选择导出格式并导出
- **Then**: 脚本以所选格式成功导出
- **Verification**: `programmatic`

### AC-10: 数据持久化
- **Given**: 用户正在编辑项目
- **When**: 用户保存或自动保存触发
- **Then**: 项目数据成功保存到 Supabase 数据库
- **Verification**: `programmatic`

### AC-11: 云端项目数量限制
- **Given**: 用户已创建3个云端项目
- **When**: 用户尝试创建第4个云端项目
- **Then**: 系统提示已达到上限，无法创建新项目
- **Verification**: `programmatic`

## Open Questions
- [ ] AI 功能是否需要调用外部 API，还是使用现有的 BOHAI 服务？
- [ ] 是否需要支持导入其他脚本编辑软件的格式？
- [ ] 第一版是否需要实现版本控制/历史记录功能？
