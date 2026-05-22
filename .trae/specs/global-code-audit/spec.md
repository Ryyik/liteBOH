# 全局代码审计 Spec

## Why
对 BOH Beta 2.5.4 项目进行全面代码审计，重点检查 Supabase 集成、性能优化、业务逻辑正确性，确保代码质量和系统稳定性，并将审计结果更新到 PROJECT_MANUAL.md。

## What Changes
- 全面审计 Supabase 相关代码（认证、数据库操作、实时订阅）
- 检查性能瓶颈（渲染性能、内存泄漏、不必要的重渲染）
- 验证业务逻辑正确性（状态管理、数据流、权限控制）
- 检查代码规范和最佳实践
- 更新 PROJECT_MANUAL.md 版本号为 2.5.4

## Impact
- Affected specs: 所有涉及 Supabase、状态管理、性能优化的模块
- Affected code:
  - `src/utils/auth.js` - Supabase 认证与 API 封装
  - `src/stores/*.js` - Pinia 状态管理
  - `src/views/**/*.vue` - 页面组件
  - `src/components/**/*.vue` - UI 组件
  - `src/composables/**/*.js` - 组合式函数
  - `PROJECT_MANUAL.md` - 项目文档

## ADDED Requirements

### Requirement: Supabase 集成审计
系统 SHALL 确保所有 Supabase 相关代码遵循最佳实践。

#### Scenario: 认证流程检查
- **WHEN** 检查认证相关代码
- **THEN** 应验证：
  - 会话管理正确（token 刷新、过期处理）
  - 错误处理完善（网络错误、权限错误）
  - 敏感信息不暴露（不在前端暴露 service_role key）

#### Scenario: 数据库操作检查
- **WHEN** 检查数据库查询代码
- **THEN** 应验证：
  - 使用正确的 RLS 策略
  - 查询优化（避免 N+1 查询）
  - 错误处理和回滚机制

#### Scenario: 实时订阅检查
- **WHEN** 检查实时订阅代码
- **THEN** 应验证：
  - 订阅正确启动和停止
  - 内存泄漏防护（组件卸载时取消订阅）
  - 重复订阅防护

### Requirement: 性能审计
系统 SHALL 识别并记录性能瓶颈。

#### Scenario: 渲染性能检查
- **WHEN** 检查组件渲染
- **THEN** 应验证：
  - 避免不必要的重渲染
  - 合理使用 computed 和 watch
  - 大型列表使用虚拟滚动（如需要）

#### Scenario: 内存泄漏检查
- **WHEN** 检查组件生命周期
- **THEN** 应验证：
  - 事件监听器正确移除
  - 定时器正确清理
  - 订阅正确取消

#### Scenario: 资源加载优化
- **WHEN** 检查资源加载
- **THEN** 应验证：
  - 图片懒加载
  - 代码分割
  - 不必要的依赖移除

### Requirement: 业务逻辑审计
系统 SHALL 确保业务逻辑正确性。

#### Scenario: 状态管理检查
- **WHEN** 检查 Pinia stores
- **THEN** 应验证：
  - 单一数据源原则
  - 状态变更可追溯
  - 异步操作正确处理

#### Scenario: 权限控制检查
- **WHEN** 检查权限相关代码
- **THEN** 应验证：
  - 前端权限校验
  - 后端 RLS 策略
  - 敏感操作二次确认

#### Scenario: 数据流检查
- **WHEN** 检查数据流动
- **THEN** 应验证：
  - 数据流向清晰
  - 无循环依赖
  - 错误边界处理

### Requirement: 代码规范审计
系统 SHALL 确保代码符合项目规范。

#### Scenario: 代码风格检查
- **WHEN** 检查代码风格
- **THEN** 应验证：
  - 统一的命名规范
  - 一致的代码格式
  - 适当的注释

#### Scenario: 类型安全
- **WHEN** 检查 TypeScript/JavaScript 代码
- **THEN** 应验证：
  - 类型定义完整
  - 无隐式类型转换
  - 错误类型处理

## MODIFIED Requirements

### Requirement: PROJECT_MANUAL.md 更新
PROJECT_MANUAL.md SHALL 更新为版本 2.5.4，包含审计结果和改进建议。

**新增内容:**
- 审计发现的问题清单
- 性能优化建议
- 代码改进建议
- 最佳实践更新

## REMOVED Requirements

无
