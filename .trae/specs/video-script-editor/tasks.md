# 专业级视频拍摄脚本编辑器 - The Implementation Plan (Decomposed and Prioritized Task List)

## [x] Task 1: 数据库表结构设计与创建
- **Priority**: P0
- **Depends On**: None
- **Description**: 
  - 设计并创建视频脚本项目相关的数据库表
  - 包括：项目表、场景表、镜头表、角色表
  - 配置 Supabase 策略和权限
  - 实现用户云端项目数量限制（最多3个）
  - 创建 SQL 迁移文件
- **Acceptance Criteria Addressed**: [AC-10, AC-11]
- **Test Requirements**:
  - `programmatic` TR-1.1: 数据库表创建成功且结构正确
  - `programmatic` TR-1.2: RLS 策略配置正确，用户只能访问自己的项目
  - `programmatic` TR-1.3: 云端项目数量限制正常工作
- **Notes**: 参考现有的 creator_studio_workflow 表结构

## [x] Task 2: Pinia Store 状态管理设计
- **Priority**: P0
- **Depends On**: [Task 1]
- **Description**: 
  - 创建视频脚本编辑器的 Pinia Store
  - 实现项目、场景、镜头的状态管理
  - 实现撤销/重做功能的状态管理
  - 集成 Supabase 数据持久化
- **Acceptance Criteria Addressed**: [AC-2, AC-10]
- **Test Requirements**:
  - `programmatic` TR-2.1: Store 正确管理项目、场景、镜头数据
  - `programmatic` TR-2.2: 撤销/重做功能正常工作
  - `programmatic` TR-2.3: 数据正确保存和加载

## [x] Task 3: 主界面布局框架搭建
- **Priority**: P0
- **Depends On**: [Task 2]
- **Description**: 
  - 创建视频脚本编辑器主视图组件
  - 实现可调整大小的多面板布局（项目面板、编辑区、时间线、属性面板）
  - 根据当前产品决策固定为白色编辑主题，不再提供深浅色切换
  - 集成到现有路由系统
- **Acceptance Criteria Addressed**: [AC-1]
- **Test Requirements**:
  - `human-judgement` TR-3.1: 界面布局符合专业非线性编辑软件风格
  - `programmatic` TR-3.2: 面板大小可调整
  - `programmatic` TR-3.3: 白色主题在编辑器全界面保持一致

## [x] Task 4: 项目管理面板实现
- **Priority**: P1
- **Depends On**: [Task 3]
- **Description**: 
  - 实现项目列表显示
  - 实现创建新项目、打开项目、删除项目功能
  - 实现项目元数据编辑
  - 显示当前用户已创建项目数量和剩余配额
  - 当达到3个项目上限时，禁用创建新项目按钮并显示提示
- **Acceptance Criteria Addressed**: [AC-2, AC-10, AC-11]
- **Test Requirements**:
  - `programmatic` TR-4.1: 项目列表正确显示
  - `programmatic` TR-4.2: 创建/打开/删除项目功能正常
  - `programmatic` TR-4.3: 项目元数据正确保存
  - `programmatic` TR-4.4: 项目数量配额显示正确
  - `programmatic` TR-4.5: 达到上限时无法创建新项目

## [x] Task 5: 脚本编辑区域核心功能
- **Priority**: P0
- **Depends On**: [Task 3]
- **Description**: 
  - 实现场景编辑器组件
  - 实现镜头编辑器组件
  - 支持专业脚本格式（场景标题、动作、对白、拍摄提示）
  - 实现富文本编辑基础功能
  - 实现添加/删除/重排序场景和镜头
- **Acceptance Criteria Addressed**: [AC-2]
- **Test Requirements**:
  - `programmatic` TR-5.1: 场景和镜头可以正常添加/删除/编辑
  - `human-judgement` TR-5.2: 编辑界面专业且易用
  - `programmatic` TR-5.3: 数据变更正确反映在 Store 中

## [x] Task 6: 时间线可视化编辑组件
- **Priority**: P1
- **Depends On**: [Task 5]
- **Description**: 
  - 实现时间线可视化组件
  - 支持场景/镜头的拖拽重排序
  - 支持剪切、复制、粘贴操作
  - 实现时间缩放功能
  - 与脚本编辑区同步
- **Acceptance Criteria Addressed**: [AC-3]
- **Test Requirements**:
  - `programmatic` TR-6.1: 时间线正确显示场景和镜头
  - `programmatic` TR-6.2: 拖拽操作正常工作
  - `programmatic` TR-6.3: 时间线与编辑区数据同步

## [x] Task 7: 属性面板实现
- **Priority**: P1
- **Depends On**: [Task 5]
- **Description**: 
  - 实现选中项目/场景/镜头的属性显示
  - 实现属性编辑功能
  - 支持镜头类型、时长、备注等元数据
- **Acceptance Criteria Addressed**: [AC-2]
- **Test Requirements**:
  - `programmatic` TR-7.1: 属性面板正确显示选中项属性
  - `programmatic` TR-7.2: 属性编辑正确保存

## [x] Task 8: 搜索和替换功能
- **Priority**: P2
- **Depends On**: [Task 5]
- **Description**: 
  - 实现全文搜索功能
  - 实现替换和全部替换功能
  - 高亮显示匹配结果
- **Acceptance Criteria Addressed**: [AC-2]
- **Test Requirements**:
  - `programmatic` TR-8.1: 搜索功能正确找到匹配内容
  - `programmatic` TR-8.2: 替换功能正常工作

## [x] Task 9: 导出功能实现
- **Priority**: P1
- **Depends On**: [Task 5]
- **Description**: 
  - 实现 Markdown 格式导出
  - 实现 PDF 格式导出
  - 实现 Word 格式导出
  - 实现行业标准脚本格式导出（Fountain）
- **Acceptance Criteria Addressed**: [AC-9]
- **Test Requirements**:
  - `programmatic` TR-9.1: Markdown 导出格式正确
  - `programmatic` TR-9.2: PDF 导出成功
  - `human-judgement` TR-9.3: 导出的脚本格式专业

## [x] Task 10: AI 服务集成层
- **Priority**: P0
- **Depends On**: None
- **Description**: 
  - 集成现有 BOHAI AI 服务
  - 创建 AI 功能 API 封装
  - 实现请求缓存和错误处理
  - 当远端 RPC 不可用时提供本地智能回退，保证编辑流程可用
- **Acceptance Criteria Addressed**: [AC-4, AC-5, AC-6, AC-7, AC-8]
- **Test Requirements**:
  - `programmatic` TR-10.1: AI API 调用成功
  - `programmatic` TR-10.2: 错误处理正常
  - `programmatic` TR-10.3: 缓存机制工作正常

## [x] Task 11: AI 智能脚本建议功能
- **Priority**: P1
- **Depends On**: [Task 5, Task 10]
- **Description**: 
  - 实现 AI 脚本建议 UI
  - 集成 AI 建议生成功能
  - 实现建议预览和接受/拒绝功能
- **Acceptance Criteria Addressed**: [AC-4]
- **Test Requirements**:
  - `human-judgement` TR-11.1: AI 建议质量符合预期
  - `programmatic` TR-11.2: 建议可以被正确接受或拒绝

## [x] Task 12: AI 场景自动识别功能
- **Priority**: P1
- **Depends On**: [Task 5, Task 10]
- **Description**: 
  - 实现场景识别触发 UI
  - 集成 AI 场景识别功能
  - 自动标记场景要素（内/外景、时间、地点）
- **Acceptance Criteria Addressed**: [AC-5]
- **Test Requirements**:
  - `programmatic` TR-12.1: 场景要素正确识别
  - `programmatic` TR-12.2: 识别结果正确应用到场景元数据

## [x] Task 13: AI 镜头类型推荐功能
- **Priority**: P2
- **Depends On**: [Task 5, Task 10]
- **Description**: 
  - 实现镜头推荐 UI
  - 集成 AI 镜头推荐功能
  - 支持一键应用推荐
- **Acceptance Criteria Addressed**: [AC-6]
- **Test Requirements**:
  - `human-judgement` TR-13.1: 镜头推荐合理
  - `programmatic` TR-13.2: 推荐可以正确应用

## [x] Task 14: AI 对白优化功能
- **Priority**: P2
- **Depends On**: [Task 5, Task 10]
- **Description**: 
  - 实现对白优化 UI
  - 集成 AI 对白优化功能
  - 支持原文/优化版对比查看
  - 支持部分接受优化
- **Acceptance Criteria Addressed**: [AC-7]
- **Test Requirements**:
  - `human-judgement` TR-14.1: 对白优化质量良好
  - `programmatic` TR-14.2: 对比查看功能正常
  - `programmatic` TR-14.3: 部分接受功能正常

## [x] Task 15: AI 拍摄提示生成功能
- **Priority**: P2
- **Depends On**: [Task 5, Task 10]
- **Description**: 
  - 实现拍摄提示生成 UI
  - 集成 AI 拍摄提示生成功能
  - 支持保存拍摄提示到镜头元数据
- **Acceptance Criteria Addressed**: [AC-8]
- **Test Requirements**:
  - `human-judgement` TR-15.1: 拍摄提示详细且实用
  - `programmatic` TR-15.2: 拍摄提示正确保存

## [x] Task 16: AI 对话式交互面板
- **Priority**: P2
- **Depends On**: [Task 3, Task 10]
- **Description**: 
  - 实现 AI 聊天面板
  - 支持自然语言指令修改脚本
  - 与现有 BOHAI 聊天系统风格一致
- **Acceptance Criteria Addressed**: [AC-4, AC-5, AC-6, AC-7, AC-8]
- **Test Requirements**:
  - `human-judgement` TR-16.1: 对话式交互流畅
  - `programmatic` TR-16.2: 指令能正确修改脚本

## [x] Task 17: 性能优化和测试
- **Priority**: P1
- **Depends On**: [Task 5, Task 6]
- **Description**: 
  - 优化大脚本（100+场景）的渲染性能
  - 添加自动保存功能
  - 编写单元测试和集成测试
  - 无障碍支持检查
- **Acceptance Criteria Addressed**: [AC-1, AC-2, AC-10]
- **Test Requirements**:
  - `programmatic` TR-17.1: 100+场景脚本编辑流畅
  - `programmatic` TR-17.2: 自动保存功能正常
  - `programmatic` TR-17.3: 测试覆盖率达标

## [ ] Task 18: 文档和用户指南
- **Priority**: P2
- **Depends On**: [Task 17]
- **Description**: 
  - 编写功能使用文档
  - 添加界面引导提示
  - 创建示例脚本模板
- **Acceptance Criteria Addressed**: [AC-1]
- **Test Requirements**:
  - `human-judgement` TR-18.1: 文档清晰易懂
  - `programmatic` TR-18.2: 引导提示正确显示
