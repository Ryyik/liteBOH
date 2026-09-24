# 012 — 修复 SettingToggle 类名 bug 并升级开关手感

- **Status**: TODO
- **Commit**: fc8dfc74
- **Severity**: HIGH（功能性 bug + 高频控件无反馈）
- **Category**: Physicality / State feedback
- **Estimated scope**: 1 文件（~30 行改动）

## Problem

`src/views/user-center/UserSpace/components/SettingToggle.vue` 模板绑定的类名与样式不匹配，导致开关**永远灰色、滑块永不移动**——状态切换完全没有视觉反馈。该组件被 `ProfileSettingsPanel.vue`（隐藏在线状态 / 隐藏关注数据两处开关）复用。

```html
<!-- SettingToggle.vue:5 — current -->
:class="{ enabled: modelValue }"
```

```css
/* SettingToggle.vue:54-60 — current（全仓库不存在 .setting-toggle.enabled 规则） */
.setting-toggle.on { background: #34c759; }
.setting-toggle.on .setting-toggle-knob { transform: translateX(20px); }
```

次要问题：track 过渡用裸 `ease`（:38 `transition: background-color 0.2s ease;`），无按压反馈。

## Target

```html
<!-- 模板第 5 行 -->
:class="{ on: modelValue }"
```

```css
/* target */
.setting-toggle {
  /* 原有声明保留，仅替换 transition */
  transition: background-color 180ms var(--ease-out, ease-out),
    transform 160ms var(--ease-out, ease-out);
}

.setting-toggle:active:not(:disabled) {
  transform: scale(0.96);
}

.setting-toggle-knob {
  /* 原: transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1); */
  transition: transform 220ms cubic-bezier(0.34, 1.3, 0.64, 1);
}

@media (prefers-reduced-motion: reduce) {
  .setting-toggle,
  .setting-toggle-knob {
    transition-duration: 1ms;
  }
  .setting-toggle:active {
    transform: none;
  }
}
```

滑块曲线 `cubic-bezier(0.34, 1.3, 0.64, 1)` = 轻微过冲的弹性手感（22% 过冲量，克制）；`var(--ease-out, ease-out)` 在 `.user-space-page` 作用域内解析为 `cubic-bezier(0.16, 1, 0.3, 1)`（styles/shell-community.css:31 局部定义），是强 ease-out，符合规范。

## Repo conventions to follow

- 全局 motion tokens：`src/styles/common/tokens.css:32-44`（`--ease-out` / `--duration-press: 160ms` 等）。
- 正确样例：本文件 :51 knob 已有 transition 意识；暗色态 `:global([data-theme="dark"] .setting-toggle.on)`（:71）也使用 `.on`，故改模板而非改样式。

## Steps

1. `SettingToggle.vue:5`：`enabled` → `on`。
2. `SettingToggle.vue:38`：track transition 替换为 Target 中两条（background-color + transform）。
3. 紧随其后新增 `:active` 按压规则与 reduce 块（见 Target）。
4. `SettingToggle.vue:51`：knob transition 替换为 `transform 220ms cubic-bezier(0.34, 1.3, 0.64, 1)`。

## Boundaries

- 只改 `SettingToggle.vue`。不改 props / emit / aria 属性。
- 不改 `ProfileSettingsPanel.vue`、不改暗色 `:global` 规则。

## Verification

- **Mechanical**: `npm run build` 通过。
- **Feel check**: 打开 我的 → 设置，点「隐藏在线状态」「隐藏关注数据」开关：
  - 打开时轨道变绿（亮色 #34c759 / 暗色 #30d158），滑块右移 20px 带轻微回弹；
  - 连续快速点击不卡死、无位置残留；
  - 按住开关有轻微缩小（0.96）。
  - DevTools Rendering 面板开 `prefers-reduced-motion: reduce`：状态瞬时切换（无位移动画），颜色反馈保留。
- **Done when**: 两个开关均有完整开/关视觉反馈，reduce 下无位移动画。
