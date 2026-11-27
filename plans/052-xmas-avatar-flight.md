# 052 — 圣诞参与头像从主按钮飞向树上挂点

- **Status**: DONE
- **Commit**: 52c6882e
- **Severity**: MEDIUM
- **Category**: Missed opportunities / Physicality / Accessibility
- **Estimated scope**: 4 文件（约 130 行，含 1 个浏览器探针与门禁映射）

## Problem

参与成功后，名单刷新、树上头像直接出现，用户能看到结果，但缺少“我的头像从这里过去了”的空间反馈。 `/xmas` 是低频、高情绪场景，适合一次优雅的慢速动画；不能把点击响应一起放慢。

当前提交逻辑：

```js
// src/views/ChristmasGiftTree/index.vue:166-179 — current
async function onSheetConfirm() {
  if (!isLoggedIn.value) {
    sheetMode.value = '';
    showLoginModal.value = true;
    return;
  }
  if (isLeaveSheet.value) {
    const result = await leave();
    if (result.ok) sheetMode.value = '';
    return;
  }
  const result = await join();
  if (result.ok) sheetMode.value = '';
}
```

头像挂饰没有自我标识，动画无法稳定找到本次新参与者的落点：

```html
<!-- src/views/ChristmasGiftTree/components/TreeScene.vue:71-80 — current -->
<button
  v-for="(hanger, index) in hangers"
  :key="hanger.id"
  type="button"
  class="hanger"
  :class="{ 'is-active': String(activeId) === String(hanger.id) }"
  :style="hangerStyle(hanger, index)"
  :aria-label="`${hanger.name} 的头像`"
  :aria-pressed="String(activeId) === String(hanger.id)"
  @click.stop="emit('select', hanger.id)"
>
```

## Target

完整节奏约 **800ms**，但点击反馈仍保持即时：

1. 参与请求成功，弹层按现有 `180ms` 收合。
2. 等待 `--duration-fast: 180ms`，让弹层完全离开。
3. 头像从主按钮中心飞向树上挂点，运动 `--motion-morph-in: 620ms`。
4. 曲线使用现有 `--ease-morph: cubic-bezier(0.3, 0.12, 0.15, 1)`。
5. 路径为轻弧线，不带弹跳；中段最多上抬 `140px`，初始放大系数最多 `1.45`。
6. 落点与真实挂饰中心误差必须 `< 8px`。飞行结束删除克隆，原挂饰恢复显示，不能出现双头像或末帧闪烁。

动态降级：

- `prefers-reduced-motion: reduce`：不生成飞行克隆、不位移；仅用 `motionMs('--duration-press', 160)` 得到的 `110ms` 上限做 `opacity 0 → 1`。
- `html.boh-perf-lite`：同样跳过长距离飞行，只保留淡入。
- 动画中旋转视口、软键盘改变尺寸或用户再次点击主按钮：取消当前动画，立即恢复真实挂饰，不能把用户卡在中间态。

## Repo conventions to follow

- 时长与曲线只从 CSS token 读取，使用现有 `src/utils/motion.js:30-91` 的 `prefersReducedMotion()`、`isLitePerf()`、`motionMs()`、`motionEase()`；JS 不写第二份 `620` / `180` / cubic-bezier。
- 既有空间 morph  exemplar：`plans/035-forum-motion-continuity.md:107-134`，使用源/目标矩形、WAAPI、保存 Animation 句柄、结束后清理。
- 只动 `transform` 与 `opacity`，不动 `top` / `left` / `width` / `height`。
- 不新增依赖，不引入 Three.js、GSAP 或 rAF 循环。

## Steps

1. **给真实挂饰加稳定选择器。**  
   修改 `src/views/ChristmasGiftTree/components/TreeScene.vue:71-80`，在现有 `<button>` 上增加：

   ```html
   :data-self="hanger.isSelf ? 'true' : undefined"
   ```

   其他属性、事件、结构不动。

2. **给主按钮加 ref，并引入现有 motion 工具。**  
   修改 `src/views/ChristmasGiftTree/index.vue`：

   ```js
   import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
   import { isLitePerf, motionEase, motionMs, prefersReducedMotion } from '@/utils/motion.js';

   const ctaRef = ref(null);
   let flightClone = null;
   let flightTarget = null;
   let flightAnimation = null;
   let flightTimer = 0;
   let flightResizeHandler = null;
   ```

   模板中的主按钮增加 `ref="ctaRef"`：

   ```html
   <button ref="ctaRef" type="button" class="xmas-cta" ...>
   ```

3. **实现取消与清理函数。**  
   在 `onHangerSelect` 前加入：

   ```js
   function cancelAvatarFlight() {
     window.clearTimeout(flightTimer);
     flightTimer = 0;
     flightAnimation?.cancel();
     flightAnimation = null;
     flightClone?.remove();
     flightClone = null;
     if (flightTarget) flightTarget.style.opacity = '1';
     flightTarget = null;
     if (flightResizeHandler) {
       window.removeEventListener('resize', flightResizeHandler);
       flightResizeHandler = null;
     }
   }

   onBeforeUnmount(cancelAvatarFlight);
   ```

   在 `onPrimaryClick()` 的第一行调用 `cancelAvatarFlight()`，确保用户在飞行中再次点击退出时，隐藏的真实挂饰先恢复。

4. **实现头像飞行。**  
   在 `cancelAvatarFlight()` 后加入 `async function playSelfAvatarFlight()`：

   - `await nextTick()` 后查询 `ctaRef.value` 与 `.hanger[data-self="true"]`；任一缺失直接返回。
   - `prefersReducedMotion()` 或 `isLitePerf()` 为真时：

     ```js
     flightTarget = target;
     target.style.opacity = '0';
     flightAnimation = target.animate([{ opacity: 0 }, { opacity: 1 }], {
       duration: motionMs('--duration-press', 160),
       easing: motionEase('--ease-out', 'ease-out'),
     });
     await flightAnimation.finished.catch(() => {});
     cancelAvatarFlight();
     return;
     ```

   - 正常路径读取 `source.getBoundingClientRect()` 与 `target.getBoundingClientRect()`，计算：

     ```js
     const size = Math.max(1, targetRect.width);
     const sourceX = sourceRect.left + sourceRect.width / 2;
     const sourceY = sourceRect.top + sourceRect.height / 2;
     const targetX = targetRect.left + targetRect.width / 2;
     const targetY = targetRect.top + targetRect.height / 2;
     const dx = targetX - sourceX;
     const dy = targetY - sourceY;
     const distance = Math.hypot(dx, dy);
     const lift = Math.min(140, Math.max(56, distance * 0.22));
     const startScale = Math.min(1.45, Math.max(1, 52 / size));
     ```

   - 克隆真实挂饰，避免复制第二套头像框样式：

     ```js
     const clone = target.cloneNode(true);
     clone.classList.add('xmas-flight-clone');
     clone.setAttribute('aria-hidden', 'true');
     clone.setAttribute('tabindex', '-1');
     clone.setAttribute('inert', '');
     Object.assign(clone.style, {
       position: 'fixed',
       left: `${sourceX - size / 2}px`,
       top: `${sourceY - size / 2}px`,
       width: `${size}px`,
       height: `${size}px`,
       margin: '0',
       transform: 'none',
       opacity: '0',
       zIndex: '60',
       pointerEvents: 'none',
       contain: 'none',
       willChange: 'transform, opacity',
     });
     clone.querySelector('.hanger-name')?.remove();
     target.style.opacity = '0';
     document.body.appendChild(clone);
     flightClone = clone;
     flightTarget = target;
     ```

   - 使用 WAAPI 播放四段关键帧：

     ```js
     flightAnimation = clone.animate(
       [
         {
           transform: `translate3d(0, 0, 0) rotate(0deg) scale(${startScale})`,
           opacity: 0,
           offset: 0,
         },
         {
           transform: `translate3d(0, 0, 0) rotate(0deg) scale(${startScale})`,
           opacity: 1,
           offset: 0.12,
         },
         {
           transform: `translate3d(${dx * 0.58}px, ${dy * 0.58 - lift}px, 0) rotate(-4deg) scale(0.9)`,
           opacity: 1,
           offset: 0.58,
         },
         {
           transform: `translate3d(${dx}px, ${dy}px, 0) rotate(0deg) scale(1)`,
           opacity: 1,
           offset: 1,
         },
       ],
       {
         duration: motionMs('--motion-morph-in', 620),
         easing: motionEase('--ease-morph', 'cubic-bezier(0.3, 0.12, 0.15, 1)'),
         fill: 'forwards',
       },
     );
     ```

   - 动画期间注册一次性 resize 取消：

     ```js
     flightResizeHandler = cancelAvatarFlight;
     window.addEventListener('resize', flightResizeHandler, { once: true });
     await flightAnimation.finished.catch(() => {});
     cancelAvatarFlight();
     ```

5. **接入参与成功分支。**  
   将 `onSheetConfirm()` 的 join 分支改为：

   ```js
   const result = await join();
   if (!result.ok) return;
   sheetMode.value = '';
   await nextTick();
   window.clearTimeout(flightTimer);
   flightTimer = window.setTimeout(
     playSelfAvatarFlight,
     motionMs('--duration-fast', 180),
   );
   ```

   退出分支、登录分支、错误分支保持原样。

6. **检查克隆样式来源。**  
   确认克隆保留了 `TreeScene.vue` 的 scoped `data-v-*` 属性，因此 `.hanger` / `.hanger-pivot` / `.hanger-ball` 样式继续生效；`contain: none` 与删除 `.hanger-name` 已在第 4 步完成，不新增 CSS 文件。

7. **新增浏览器探针。**  
   创建 `scripts/probes/probe-xmas-avatar-flight.mjs`，遵循仓库 Playwright 约定：`channel: 'chrome'`、直连代理参数、每个场景新 context、mock Supabase RPC、pinia 注入登录、不写真实数据库。

   探针必须覆盖：

   - **A 正常节奏**：点击“参与交换”→弹层“确认参与”；记录 `.xmas-flight-clone` 出现/消失时间与首/中/末矩形。
     - 克隆首帧中心与 `.xmas-cta` 中心误差 `< 8px`。
     - 中帧中心比起点到终点的线性中点至少高 `24px`。
     - 末帧中心与 `.hanger[data-self="true"]` 中心误差 `< 8px`。
     - 克隆存在时间在 `600–800ms`。
     - 结束后克隆数量为 `0`，真实挂饰 `opacity === '1'`。
   - **B reduced-motion**：`reducedMotion: 'reduce'`；不产生 `.xmas-flight-clone`，真实挂饰最终可见。
   - **C lite**：页面加载后添加 `html.boh-perf-lite`；不产生长距离飞行克隆，真实挂饰最终可见。
   - **D 中断**：飞行开始后立即把 hash 切到 `/`；页面卸载后 `document.querySelectorAll('.xmas-flight-clone').length === 0`，无 pageerror。
   - **E 防重复**：参与请求 pending 时连续点击确认按钮；任一时刻克隆数量不超过 `1`。

8. **登记门禁。**  
   在 `scripts/lib/gate-map.json` 为 `src/views/ChristmasGiftTree/index.vue` 增加 `node scripts/probes/probe-xmas-avatar-flight.mjs`；若现有映射已覆盖该目录，则只追加探针命令，不重复注册。

## Boundaries

- 不改活动报名、退出、配对、揭晓、数据库或 Edge Function。
- 不改 `JoinSheet.vue` 的现有入场/退场时长。
- 不改树上现有雪花、星光、挂饰摇摆。
- 不新增 3D、WebGL、物理引擎或依赖。
- 不把 `620ms`、`180ms`、cubic-bezier 再写进 JS 常量；必须从 `tokens.css` 经 `motionMs()` / `motionEase()` 读取。
- 若当前代码与上述片段漂移，停止执行并报告，不自行猜新结构。

## Verification

- **Mechanical**：
  - `./node_modules/.bin/vitest run tests/unit/christmas-exchange-state.test.js tests/unit/xmas-login-gate.test.js tests/unit/xmas-exchange-api.test.js tests/unit/christmas-tree-layout.test.js --pool=forks --maxWorkers=2`
  - `node scripts/probes/probe-xmas-avatar-flight.mjs`
  - `npm run verify:fast`
  - `./node_modules/.bin/prettier --check src/views/ChristmasGiftTree/index.vue src/views/ChristmasGiftTree/components/TreeScene.vue scripts/probes/probe-xmas-avatar-flight.mjs scripts/lib/gate-map.json`
- **Feel check**：
  - 正常速度：点击确认后先看到弹层安静收合，头像从按钮中心沿轻弧线落到树上，全程约 `800ms`，无弹跳、无双头像。
  - DevTools Animations 面板降到 `10%` 播放：确认中段只有一次 `-4deg` 倾斜，落点前回正，`scale` 从 `≤1.45` 平滑收敛到 `1`。
  - `prefers-reduced-motion: reduce`：只有淡入，没有位移、旋转或缩放。
  - `html.boh-perf-lite`：没有长距离飞行，页面仍立即显示已参与状态。
  - 飞行中再次点击主按钮或切换路由：克隆立即清理，不留下隐藏头像或中间态。
- **Done when**：探针 A–E 全绿，正常/reduced/lite/中断四种路径均无 pageerror，且人工 feel check 确认“慢但不拖、轻但不飘”。
