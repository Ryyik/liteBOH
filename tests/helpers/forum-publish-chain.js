/**
 * 「发布链路」源码并集 —— 给「这段契约必须在发帖链路里存在」这类源码守卫用。
 *
 * ── 为什么要这个文件（2026-10-30）────────────────────────────────────
 * 2026-10-30 把整条发布链路（队列 worker / 图片管线消费 / 岛同步 / 重试·取消·编辑）
 * 从 `ForumMain.vue` 外搬到 `composables/useForumPublishQueue.js`（审查报告 P1-1 第 1 步）。
 * 仓库里有一批守卫写的是「在 ForumMain.vue 里找某个调用」，搬家后它们**不是因为契约被破坏
 * 而红**，而是因为「找错了文件」。**不能**把这批断言删掉或改成「找不到就跳过」——
 * 那等于把契约一起删了。
 *
 * 正解：断言「契约在发布链路的**任一处**存在」。两个文件都必须能读到（读不到就抛），
 * 所以搬家不会静默地把守卫变成空断言。
 *
 * ── 边界 ────────────────────────────────────────────────────────────
 * 只负责「取源码」。归一（squeezeSource / flattenSource）与切片由调用方自己做，
 * 各断言的宽容口径不同，别在这里统一掉。
 * ⚠️ 返回值是**剥注释前**的形态（只截了 `<script>` 区）——.vue 模板里的 `accept="image/*"`
 * 会与远处的闭注释符错配，所以必须先 `scriptSection()`。要不要 `stripComments()`
 * 由调用方决定（否定断言必须剥，见 source.js 里的说明）。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { scriptSection } from './source.js';

const root = resolve(import.meta.dirname, '../..');

/** 发布链路的两个载体：宿主（模板 / 入队 / 草稿）与状态机（worker / 岛 / 动作）。 */
export const PUBLISH_CHAIN_FILES = [
  'src/views/Forum/ForumMain.vue',
  'src/views/Forum/composables/useForumPublishQueue.js',
];

/**
 * 按顺序拼接两个载体的 `<script>` 区（未剥注释）。
 * 任一文件缺失会直接抛 ENOENT —— 这是有意的：搬家后忘了建新文件时，守卫必须报错，
 * 而不是拿「半个并集」继续断言出一片假绿。
 */
export const readPublishChainSource = () =>
  PUBLISH_CHAIN_FILES.map((rel) => scriptSection(readFileSync(resolve(root, rel), 'utf8'))).join(
    '\n',
  );
