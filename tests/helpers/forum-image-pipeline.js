/**
 * 「发帖图片管线」源码并集 —— 给「这段接线必须存在于图片管线」这类源码守卫用。
 *
 * ── 为什么要这个文件（2026-10-30）────────────────────────────────────
 * 2026-10-30 把图片管线（选图落位 / 卡顿提示 / 压缩·检测·上传三级有界池 / 清理）
 * 从 `ForumMain.vue` 外搬到 `composables/useForumDraftImagePipelines.js`
 * （审查报告 P1-1 第 2 步）。原有的三份守卫写的是「在 ForumMain.vue 里找某个调用」，
 * 搬家后它们**不是因为契约被破坏而红**，而是因为「找错了文件」。
 * **不能**把断言删掉或改成「找不到就跳过」—— 那等于把契约一起删了。
 *
 * 正解：断言「契约在图片管线的**任一处**存在」。两个文件都必须能读到（读不到就抛），
 * 所以搬家不会静默地把守卫变成空断言。
 *
 * ── 边界 ────────────────────────────────────────────────────────────
 * 只负责「取源码」。归一（squeezeSource / flattenSource）与切片由调用方自己做。
 * ⚠️ 返回值是**剥注释前**的形态（只截了 `<script>` 区）：.vue 模板里的 `accept="image/*"`
 * 会与远处的闭注释符错配，所以必须先 `scriptSection()`。
 *
 * ── 但并集会带来一种新的假绿，必须由调用方补一道 ────────────────────
 * 并集只回答「有没有」，不回答「只有一份」。图片管线**有两处不能重复**：
 *   ① 并发池（acquire/release 的计数器）：两份池 = 实际并发翻倍，正好绕开
 *      「3 路是安全上限」这条约束，且谁都不会报错；
 *   ② 管线表 `draftImagePipelines`：两份 Map ⇒ 预热写一份、发布读另一份，
 *      表现为「点发布后又重新压缩上传一遍」。
 * 所以凡是用并集的地方，都要另加一条「宿主不得自建」的否定断言。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { scriptSection } from './source.js';

const root = resolve(import.meta.dirname, '../..');

/** 图片管线的两个载体：宿主（模板绑定 / 状态 ref / 冷却读数）与管线实现。 */
export const IMAGE_PIPELINE_FILES = [
  'src/views/Forum/ForumMain.vue',
  'src/views/Forum/composables/useForumDraftImagePipelines.js',
];

/**
 * 按顺序拼接两个载体的 `<script>` 区（未剥注释）。
 * 任一文件缺失会直接抛 ENOENT —— 这是有意的：搬家后忘了建新文件时，守卫必须报错，
 * 而不是拿「半个并集」继续断言出一片假绿。
 */
export const readImagePipelineSource = () =>
  IMAGE_PIPELINE_FILES.map((rel) => scriptSection(readFileSync(resolve(root, rel), 'utf8'))).join(
    '\n',
  );
