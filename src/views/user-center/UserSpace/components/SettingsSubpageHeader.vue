<template>
  <!-- 设置二级 / 三级页的极简页头（2026-11-24）
       原来这里是「‹ 设置 + 左对齐标题」的白色胶囊条（.gs-inline-bar 自带
       background + border-radius + 内边距）。它和首页那套（圆形返回按钮 +
       居中标题）是两种语言 —— 从首页点进二级页，标题栏当场换脸。

       现在统一成首页骨架：**圆形返回按钮（同一个 UserCenterBackButton）+ 居中标题，
       没有底板**。三处子页（二级组页 / 三级表单 / 个人信息）共用本组件，
       避免再出现「谁自己又写一条」的漂移。

       ⚠️ class 名保留 `gs-inline-bar` / `gs-inline-back` / `gs-inline-title`：
           scripts/probes/probe-settings-glass.mjs、probe-settings-panels.mjs
           靠它们定位返回入口与标题。改名只换来审美，代价是探针全红。 -->
  <header class="gs-inline-bar">
    <UserCenterBackButton
      class="gs-inline-back"
      :label="backLabel"
      @click="$emit('back', $event)"
    />
    <h2 class="gs-inline-title">{{ title }}</h2>
    <div class="gs-inline-actions">
      <slot name="actions"></slot>
    </div>
  </header>
</template>

<script setup>
import UserCenterBackButton from '@/components/UserCenterBackButton.vue';

defineProps({
  /** 居中标题（二级页 = 组名，三级表单 = 表单名） */
  title: {
    type: String,
    required: true,
  },
  backLabel: {
    type: String,
    default: '返回',
  },
});

defineEmits(['back']);
</script>

<style scoped>
/* ⚠️ 这些规则**必须住在组件自己的 scoped style 里**，不能跟着
   settings-glass.css 走：那个文件是经 `ProfileSettingsPanel.vue` 的
   `<style scoped> @import` 引入的，编译后规则带的是**父组件的 data-v**，
   作用不到本组件的元素上（第一版就这么写的，实测标题停在 h2 默认的
   left/16px、返回按钮也是 48px 默认值 —— 属性全落空）。

   骨架照抄首页页头 UserCenterPageHeader：52px 返回列 / 1fr 标题 / 52px 动作列。 */
.gs-inline-bar {
  position: sticky;
  /* 沉浸态下 --userspace-nav-h 已被外层写成 0，这里再加 4px 就是唯一的顶部呼吸。
     有导航岛时它是岛高 + 4，与旧口径一致。 */
  top: calc(var(--userspace-nav-h, 0px) + 4px);
  z-index: 5;
  display: grid;
  grid-template-columns: 52px 1fr 52px;
  align-items: center;
  min-height: 44px;
  margin: 0 0 2px;
  padding: 0;
  background: transparent;
  border-radius: 0;
}

/* 返回按钮：直接复用首页那颗圆形按钮（UserCenterBackButton），压一档尺寸。
   48px 落在 52px 的列里太满；40px 与 44px 行高更协调，热区仍够（≥40px 是移动端底线）。 */
.gs-inline-back {
  --user-center-back-size: 40px;
  justify-self: start;
}

/* 标题居中，字号跟首页页头一档（不再是被药丸压小的 15/600 左对齐） */
.gs-inline-title {
  grid-column: 2;
  margin: 0;
  color: var(--liquid-text-primary, #1d1d1f);
  font-size: 17px;
  line-height: 1.2;
  font-weight: 600;
  letter-spacing: 0;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  /* 标题自带一层与页底同色的柔光：sticky 时滚过去的行不会从字缝里透出来。
     刻意用页底色而不是白色 —— 卡片是白的，白底会在标题周围显出一个方块。 */
  text-shadow:
    0 0 6px var(--boh-bg-secondary, #f5f5f7),
    0 0 12px var(--boh-bg-secondary, #f5f5f7);
}

/* 右侧动作位（个人信息页的「保存」）：与首页 header-actions 同列 */
.gs-inline-actions {
  grid-column: 3;
  justify-self: end;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

/* 竖屏：内容层是 padding 0（为通栏卡片），页头必须自带 16px 沟槽，
   否则圆形返回按钮会贴住屏幕左缘、保存药丸贴右缘。
   与卡片 / 搜索框那条 16px 沟槽同一档（改版后全页只有这一条竖线）。 */
@media (max-width: 767px) {
  .gs-inline-bar {
    padding: 0 16px;
  }
}

/* 暗色：页底色换了，title 的柔光必须跟着换，否则深底上会出现一圈浅色晕
   （text-shadow 用的是 --boh-bg-secondary，它在 [data-theme='dark'] 下已被翻转，
   这里不改值，只留一句说明：**不要**给 text-shadow 写死 #fff）。 */
</style>
