<template>
  <div class="boh-glass-under" aria-hidden="true" :style="rootStyle">
    <LiquidGlass
      mode="standard"
      :displacement-scale="effectiveDisplacementScale"
      :blur-amount="effectiveBlurAmount"
      :saturation="SPEC.saturation"
      :aberration-intensity="SPEC.aberrationIntensity"
      :elasticity="SPEC.elasticity"
      :corner-radius="props.radius"
      padding="0px"
      :glass-size="{ width: '100%', height: '100%' }"
      :style="GLASS_STYLE"
    >
      <div class="boh-glass-tint" />
    </LiquidGlass>
  </div>
</template>

<script setup>
/**
 * BohGlassRefract — 「折射级」液态玻璃覆盖层（**站点级共享组件**，2026-10-14）
 *
 * ⚠️ 2026-10-14 §21.11：本组件已从 `views/BOHAI/BOHAI/components/` **提升到 `src/components/ui/`**
 *    —— 折射级是**站点级材质**，不再锁在 BOHAI 域内（顶栏等站点 chrome 也用它）。
 *    白膜令牌随之提为站点级 `--refract-tint-rgb` / `--refract-alpha`
 *    （定义在 `src/styles/common/tokens.css`；BOHAI 只在 `.bohai-page` 作用域内覆写三元组）。
 *
 * 口径真源：`docs/未完成任务清单.md` §21.7（原型实测 + 硬约束）+ §21.11（站点级登记）。要点：
 *  1. **覆盖层而非包裹层**：`inset:0` + `pointer-events:none` 垫在原内容之下 ⇒
 *     原 DOM / 交互 / 探针选择器零改动（回滚 = 删宿主里的锚 + 本组件）。
 *  2. `glass-size: 100%`（组件 `autoPx` 对字符串原样透传）⇒ 宿主动态变高（输入框
 *     自动增高）**零 JS 跟随**。
 *  3. **elasticity 恒 0**：弹性位移会让输入框/浮层随鼠标漂移、误点。
 *  4. 只用 `standard` 模式 ⇒ **不加载 shader worker**（原包 `/assets/shader-worker-*.js`
 *     绝对路径只在 shader 模式触发；要在别处用 shader 模式须先按 §21.4 拷 worker）。
 *  5. ⚠️ 宿主祖先链上**不得有堆叠上下文**（z-index/isolation/opacity/filter/transform），
 *     否则背板采样被裁、模糊降级或全灭（实测矩阵见 §21.7）。
 *  6. **观感参数单源**：`src/config/liquid-glass-spec.js`（官方样貌规范）——磨砂/位移/
 *     饱和/色差/弹性的默认值全从那里来，别在这里写死第二份。
 */
import { computed } from 'vue';
import { LiquidGlass } from '@wxperia/liquid-glass-vue';
import { LIQUID_GLASS_SPEC } from '@/config/liquid-glass-spec.js';
import { useGlassBlur } from '@/composables/useGlassBlur.js';

/* ⚠️ 本组件是裸 JS SFC：不能用 `withDefaults`（它只配类型式 defineProps）——
   默认值必须走运行时声明（实测在 dev server 上当场 500，别改成类型式）。 */
const props = defineProps({
  /** 与宿主同圆角，吃 `--boh-radius-*` 的实际值 */
  radius: { type: Number, default: 20 },
  /** 磨砂：实际 blur = (overLight ? 12 : 4) + blurAmount × 32 px（实测公式） */
  blurAmount: { type: Number, default: LIQUID_GLASS_SPEC.blurAmount },
  /** 位移强度 */
  displacementScale: { type: Number, default: LIQUID_GLASS_SPEC.displacementScale },
  /**
   * 磨砂（frosted）档 —— 2026-10-20 用户口径区分两种材质：
   *   · 折射（默认，`frosted: false`）：位移 + 模糊，玻璃会"扭曲"背后的内容；
   *   · 磨砂（`frosted: true`）：**只留模糊、位移归零**，背后内容被均匀糊开但不扭曲。
   * ⚠️ 磨砂**只关位移**，不动 `blurAmount` / 白膜 —— 模糊度仍归全站那档倍数管
   *    （`useGlassBlur`），白膜仍走 spec 的 0.1；任一处另起一份都会让"用户调模糊度"
   *    只生效一半（§21.12 的坑）。
   * ⚠️ 实现是 displacementScale=0 而**不是**换 `mode`：组件只有
   *    standard/polar/prominent/shader 四种，没有"磨砂"档，
   *    而这四种都带位移；关掉位移才是用户要的那个观感。
   */
  frosted: { type: Boolean, default: false },
});

/** 供模板引用的官方样貌常量（饱和 / 色差 / 弹性不做 props，全站一个口径） */
const SPEC = LIQUID_GLASS_SPEC;

/* 全站模糊度（2026-10-14 §21.12）：折射级的模糊**也**吃用户那一档倍数 ——
   与 CSS 侧 `--liquid-blur* = calc(基准 * var(--glass-blur-scale))` 读的是**同一个数**
   （唯一写入者 `useGlassBlur`）。两处各写一份 = 用户调了模糊度只有一半玻璃跟着变。 */
const { blurScale } = useGlassBlur();
const effectiveBlurAmount = computed(() => props.blurAmount * blurScale.value);

/* 磨砂 = 位移归零。⚠️ 别把 `blurAmount` 也一起改：模糊仍吃全站倍数（见 props 注释）。 */
const effectiveDisplacementScale = computed(() => (props.frosted ? 0 : props.displacementScale));

/* 圆角：宿主可用 `--glass-refract-radius` 覆写 —— 顶栏岛会在 100px（常态胶囊）/
   30px（岛展开）之间 morph，而 `radius` 是 Number prop；让 CSS 变量接管，
   宿主就不必把状态判断在 JS 里复刻一份（否则就是第二份真源）。 */
const rootStyle = computed(() => ({
  borderRadius: `var(--glass-refract-radius, ${props.radius}px)`,
}));

/** 组件把整套 style 传给内部所有层 —— position/top/left 决定采样层落点（§21.7） */
const GLASS_STYLE = {
  position: 'absolute',
  top: '50%',
  left: '50%',
  width: '100%',
  height: '100%',
};
</script>

<style scoped>
.boh-glass-under {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}

/* 组件内部两级尺寸链补全：内容层撑满 ⇒ 贴边采样层与宿主等大（§21.7 结构） */
.boh-glass-under :deep(.glass),
.boh-glass-under :deep(.glass > div) {
  width: 100%;
  height: 100%;
}

/* 白膜 tint：组件无 tint 属性，用内容层白膜等效调节透明度。
   RGB 三元组随**站点主题**翻转（BOHAI 域内由 `.bohai-page` 覆写）；
   α 默认来自 spec，BOHAI 域内可被 设置→外观 的用户偏好覆写。 */
.boh-glass-tint {
  width: 100%;
  height: 100%;
  background: rgba(var(--refract-tint-rgb), var(--refract-alpha));
}
</style>
