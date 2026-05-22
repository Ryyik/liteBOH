# 卸载毛玻璃依赖库 Spec

## Why
使用 `glass-ui-vue` 和 `liquid-glass-vue` 毛玻璃依赖库导致论坛等页面性能问题（特别卡顿）。项目已有完善的纯CSS毛玻璃样式实现，无需第三方库。

## What Changes
- 从 `package.json` 移除 `glass-ui-vue` 依赖
- 从 `package.json` 移除 `@wxperia/liquid-glass-vue` 本地依赖
- 从 `main.js` 移除 GlassUI 导入和注册
- 移除 `liquid-glass-vue-main` 本地目录
- 保留现有的 `glass-ui.css` 纯CSS毛玻璃样式

## Impact
- Affected specs: 无
- Affected code: 
  - `package.json`
  - `src/main.js`
  - `liquid-glass-vue-main/` 目录

## ADDED Requirements
### Requirement: 纯CSS毛玻璃效果
系统 SHALL 使用纯CSS `backdrop-filter` 实现毛玻璃效果，不依赖任何第三方毛玻璃库。

#### Scenario: 页面渲染
- **WHEN** 用户访问任何页面
- **THEN** 毛玻璃效果通过CSS `backdrop-filter` 正常渲染
- **AND** 页面性能显著提升，无卡顿

## REMOVED Requirements
### Requirement: glass-ui-vue 依赖
**Reason**: 性能问题，CSS实现已足够
**Migration**: 移除导入，保留 `glass-ui.css`

### Requirement: liquid-glass-vue 依赖
**Reason**: 性能问题，未被实际使用
**Migration**: 移除本地目录
