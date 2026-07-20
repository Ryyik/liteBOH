# 005 — 路由切换加 fade 过渡

- **Status**: TODO
- **Commit**: eed9baf
- **Severity**: LOW (Missed Opportunity)
- **Category**: Missed opportunities
- **Estimated scope**: 1 文件

## Problem

[App.vue:217](file:///Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/src/App.vue#L217) 中 `<router-view />` 直接渲染，路由切换时页面瞬间替换（teleport 状态变化无任何过渡），感觉硬。

**当前代码：**

```vue
<!-- src/App.vue:217 (within <Suspense>) -->
<router-view />
```

**违反的规则**（来自 AUDIT.md §8 "Missed opportunities"）：
- "State changes that teleport (content swaps, layout jumps) where a brief transition would prevent a jarring change."

## Target

用 `<Transition mode="out-in">` 包裹 `<router-view>`，路由切换时旧页面 fade out → 新页面 fade in，duration 200ms ease-out（UI 上限）。

```vue
<!-- src/App.vue — 修改后 -->
<template>
  <Suspense>
    <template #default>
      <RouterView v-slot="{ Component }">
        <Transition name="route-fade" mode="out-in">
          <component :is="Component" :key="$route.path" />
        </Transition>
      </RouterView>
    </template>
    <template #fallback>
      <div class="page-suspense-fallback">
        ... 原有 fallback 内容 ...
      </div>
    </template>
  </Suspense>
</template>

<style>
/* App.vue 中已有 <style>；新增（或追加到 style.css） */
.route-fade-enter-active,
.route-fade-leave-active {
  transition: opacity 200ms var(--ease-out);
}

.route-fade-enter-from,
.route-fade-leave-to {
  opacity: 0;
}
```

**说明**：
- `mode="out-in"` 保证旧组件完全淡出后新组件才淡入，避免重叠。
- `:key="$route.path"` 强制组件在路由变化时重新渲染（如果路由参数变化也触发过渡，可改为 `:key="$route.fullPath"`）。
- 仅动画 `opacity`，不动画 transform — 路由切换不应有位移感（位移会让人觉得"页面在动"）。
- duration 200ms 是 AUDIT.md 中 UI 动画的下限，足够感知但不拖沓。

## Repo conventions to follow

- **Token 来源**：Plan 001 新建的 `src/styles/common/tokens.css` 定义了 `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`。
- **现有过渡类命名约定**：项目已在 [animations.css](file:///Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/src/styles/common/animations.css) 用 `.animate-*` 命名。Vue `<Transition>` 的 `name="route-fade"` 会自动生成 `.route-fade-enter-active` 等类名，不冲突。
- **App.vue 已有 `<style>` 块**：把过渡类追加到 App.vue 的现有 `<style>` 中（不需要新文件）。

## Steps

1. 读取 [App.vue](file:///Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/src/App.vue) 的 template 部分，定位 `<router-view />` 的精确位置（L217）。
2. 替换为：
   ```vue
   <RouterView v-slot="{ Component }">
     <Transition name="route-fade" mode="out-in">
       <component :is="Component" :key="$route.path" />
     </Transition>
   </RouterView>
   ```
3. 在 App.vue 的 `<style>` 块中追加 `.route-fade-enter-active`、`.route-fade-leave-active`、`.route-fade-enter-from`、`.route-fade-leave-to` 四个类（如 Target 所示）。
4. 如果 App.vue 使用 `<style scoped>`，把过渡类放在非 scoped 的 `<style>` 块中（因为 `<Transition>` 的类名要作用于子组件根元素，scoped 会失效）。
5. `npm run build` 验证。

## Boundaries

- **不动** [router/index.ts](file:///Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/src/router/index.ts) — 不添加路由级 meta 控制过渡（保持简单）。
- **不动** 各页面组件的根元素样式 — 不要为了过渡强行加 transform/opacity 初始值。
- **不引入** `vue-router` 的 `ScrollBehavior` 改动。
- **不添加新依赖**。
- **不动** Suspense 的 fallback 实现。
- 不用 `transition: all`，仅 `transition: opacity`。

## Verification

- **机械验证**：
  - `npm run build` 通过
  - `npm run lint` 通过
  - `grep -n "route-fade" src/App.vue` 至少 4 处（4 个过渡类）

- **Feel check**：
  - 启动 `npm run dev`，访问 `http://localhost:5173`。
  - 在主导航点击不同菜单项（如 首页 → 论坛 → 个人中心），观察：
    - 旧页面在 200ms 内淡出（不是瞬间消失）。
    - 新页面在 200ms 内淡入（不是瞬间出现）。
    - 切换过程中无明显重叠（因为 `mode="out-in"`）。
  - DevTools Animations 面板：每次路由切换应显示两个连续的 200ms opacity 动画。
  - DevTools Performance 录制：路由切换时只有 paint/composite，无 layout（因为只动 opacity）。
  - DevTools Rendering → 勾选 `prefers-reduced-motion: reduce`：路由切换应几乎瞬间（100ms 内）但有极轻微淡入，不是完全瞬移。

- **回归检查**：
  - 检查带 `?query=xxx` 的路由是否触发过渡（`:key="$route.path"` 不会因为 query 变化触发，这是预期行为）。
  - 检查登录后跳转、登出跳转等程序化导航是否触发过渡。
  - 检查 [PostDetail](file:///Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/src/views/PostDetail) 这类带 `<Suspense>` 内嵌的页面是否仍正常加载。
  - 检查 BOHAI 工作区切换会话时是否仍流畅（BOHAI 内部会话切换已有自己的过渡）。

- **Done when**：
  - App.vue 中 `<RouterView>` 用 `<Transition mode="out-in">` 包裹
  - 路由切换有 200ms opacity 淡入淡出
  - reduce-motion 下过渡时间缩短但仍可感知（来自 Plan 003 全局基线）
  - build 通过，无路由切换白屏或闪烁
