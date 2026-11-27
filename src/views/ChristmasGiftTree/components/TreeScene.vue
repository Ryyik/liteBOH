<script setup>
/**
 * 圣诞树场景：像素画本体（SVG 字符串）+ 叠在上面的头像挂饰（HTML）。
 *
 * 为什么美术在本体里用 v-html 注入 SVG 字符串：
 *  像素画要逐格铺 rect，节点量大，写成模板会有上千个 v-for 分支；
 *  而生成逻辑是纯函数（`data/tree-pixels.js`），与万圣节开屏同一套范式，
 *  单测可以直接断言「确定性 / 画布尺寸 / 挂点是否落在树内」。
 *
 * 为什么挂饰仍是 HTML：
 *  头像要裁剪、要叠头像框、要 hover 浮名字；SVG 的 foreignObject 在 Safari 上
 *  裁剪与动画都不可靠。两层同尺寸叠放（100×120 与 600×720 同比例），
 *  坐标统一走 tree-layout 的百分比，对齐是精确的。
 */
import { TREE_VIEWBOX } from '../data/tree-layout.js';
import { buildTreeSceneSvg } from '../data/tree-pixels.js';

// defineProps 的返回值不接：模板里直接用同名 prop，接手反而多一个恒等解构
defineProps({
  /** [{ id, name, avatarUrl, frameUrl, x, y, size }]，x/y/size 都是 viewBox 基准单位 */
  hangers: { type: Array, default: () => [] },
  /** 当前被点开的挂饰 id（移动端没有 hover，点一下才浮名字） */
  activeId: { type: [String, Number], default: null },
  /** 静默模式：系统开了「减少动态效果」时由父级传 true，雪花与彩灯停止 */
  still: { type: Boolean, default: false },
});

const emit = defineEmits(['select']);

const VIEW_W = TREE_VIEWBOX.width;
const VIEW_H = TREE_VIEWBOX.height;

// 纯函数只跑一次：换季只改 tree-pixels.js 里的种子与色板
const sceneSvg = buildTreeSceneSvg();

/**
 * 挂饰的定位一律换算成百分比 ⇒ 容器怎么缩放，挂饰都贴在同一个树面位置。
 * 像素画是 100×120 格、挂点是 600×720 基准，两者同比例，百分比可以直接复用。
 */
function hangerStyle(hanger, index) {
  return {
    left: `${(hanger.x / VIEW_W) * 100}%`,
    top: `${(hanger.y / VIEW_H) * 100}%`,
    width: `${(hanger.size / VIEW_W) * 100}%`,
    '--swing-delay': `${(Number(hanger.id) % 9) * -0.47}s`,
    // 每块牌子歪一点：全部正对镜头会像一排贴纸，歪 1~3° 才像挂上去的
    '--tilt': `${((index * 5) % 7) - 3}deg`,
  };
}

function initials(name) {
  return String(name || '?')
    .trim()
    .slice(0, 1)
    .toUpperCase();
}
</script>

<template>
  <div class="tree-scene" :class="{ 'is-still': still }">
    <!-- eslint-disable-next-line vue/no-v-html -->
    <div class="tree-pixels" role="img" aria-label="圣诞树，挂有参与者头像" v-html="sceneSvg"></div>

    <!-- 挂饰层：与像素画像素级对齐（容器 aspect-ratio 锁死等于画布比例） -->
    <div class="tree-hangers">
      <button
        v-for="(hanger, index) in hangers"
        :key="hanger.id"
        type="button"
        class="hanger"
        :data-self="hanger.isSelf ? 'true' : undefined"
        :class="{ 'is-active': String(activeId) === String(hanger.id) }"
        :style="hangerStyle(hanger, index)"
        :aria-label="`${hanger.name} 的头像`"
        :aria-pressed="String(activeId) === String(hanger.id)"
        @click.stop="emit('select', hanger.id)"
      >
        <span class="hanger-pivot">
          <span class="hanger-thread"></span>
          <span class="hanger-ball">
            <img v-if="hanger.avatarUrl" :src="hanger.avatarUrl" alt="" loading="lazy" />
            <span v-else class="hanger-initial">{{ initials(hanger.name) }}</span>
            <img
              v-if="hanger.frameUrl"
              class="hanger-frame"
              :src="hanger.frameUrl"
              alt=""
              loading="lazy"
            />
          </span>
        </span>
        <span class="hanger-name" aria-hidden="true">{{ hanger.name }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
@import './tree-scene.css';
</style>
