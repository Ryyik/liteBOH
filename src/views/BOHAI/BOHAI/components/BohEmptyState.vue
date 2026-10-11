<template>
  <!-- 2026-10-11 用户样稿：空态只剩一行**虚影 BOHAI**，压在居中的输入框上方。
       原来的「logo + 今天想聊点什么？+ 四张建议卡」整套下线（用户口径「按图全删」）。
       ⚠️ 这几个类名是探针 / 单测的抓手（probe-bohai-composer A20、bohai-empty-state.test.js），
          改名等于让那些断言测不到东西。 -->
  <div class="boh-empty" :class="{ 'is-island': overlayMode }">
    <div class="boh-empty__ghost" aria-hidden="true">BOHAI</div>
  </div>
</template>

<script setup>
/**
 * BohEmptyState.vue — 空态（2026-10-11 重做）
 *
 * 口径真源：用户样稿（Codex 式）—— 只有一行虚影字标，输入框居中；
 * 第一条消息发出时由壳（`BOHAIMain`）把输入框 FLIP 到底部、消息区接管空间。
 *
 * ⚠️ 为什么把「今天想聊点什么 + 建议卡」整块删掉（用户 2026-10-11 拍板「按图全删」）：
 *   空态的价值是**安静**——一屏白 + 一个可写的框。建议卡把注意力从输入框拉走，
 *   而且那四张卡每张都是一次「随便点点」的暗示。命令入口另有斜杠菜单与工具胶囊，
 *   不依赖建议卡教。
 *
 * ⚠️ 旧类名（`empty-state` / `empty-brand` / `empty-subtitle` / `full-ai-suggestions` /
 * `quick-context-suggestions`）**不迁移**（DESIGN §5：旧类名随旧 DOM 一起死）。
 * 断点与基座同文件 —— 理由见 `styles/layout.css` 文件头纪律 2。
 */
defineProps({
  /** 浮层（岛）形态 */
  overlayMode: { type: Boolean, default: false },
});
</script>

<style scoped src="./styles/boh-empty-state.css"></style>
