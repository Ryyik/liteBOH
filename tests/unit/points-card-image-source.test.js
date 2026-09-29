import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { flattenSource, scriptSection, squeezeSource, stripComments } from '../helpers/source.js';

const root = resolve(import.meta.dirname, '../..');
const read = (rel) => readFileSync(resolve(root, rel), 'utf8');

/**
 * 2026-09-29 事故守卫：方块积分卡「自定义卡面」裂图。
 *
 * 根因：`profiles.points_card_image_url` / `points_card_presets.image_url` 存的是
 * Cloudinary 原始地址（`https://res.cloudinary.com/<cloud>/image/upload/...`），
 * 中国大陆实测不可达（`curl` → http 000）。渲染端若不改写，`<img>` 必然裂。
 * 同一类根因此前已在活动页 id=16/17 上咬过一次（见 `utils/db-image-url.js` 文件头）。
 *
 * 这个守卫锁的是**渲染出口**而不是数据：允许 DB 里继续存原始 Cloudinary 地址，
 * 但任何把它喂给 `<img src>` 的地方都必须先过 CDN 改写。
 */

/** 只取顶层 `<template>` 段（内部还有嵌套 template，故用贪婪匹配到最后一个闭合标签） */
const templateSection = (vueSource) => {
  const matched = String(vueSource).match(/<template>([\s\S]*)<\/template>/);
  return matched ? matched[1] : '';
};

/** 断言前先剥注释，且必须先取 `<script>` 区（理由见 tests/helpers/source.js 文件头） */
const codeOf = (rel) => stripComments(scriptSection(read(rel)));

describe('方块积分卡卡面：渲染出口必须过 CDN 改写', () => {
  it('PointsCard 内部收口，调用 resolveDbPointsCardImage(props.imageUrl)', () => {
    // 六个宿主（ProfileMain / ProfileHomePanel / AssetsHubPanel / WeeklyCheckinCalendar /
    // SubscriptionPlans / Shop）都只透传原始 DB 值，改写必须收口在组件内，否则要改六处。
    expect(
      flattenSource(codeOf('src/views/user-center/UserSpace/components/PointsCard.vue')),
    ).toContain(flattenSource('resolveDbPointsCardImage(props.imageUrl)'));
  });

  it('PointsCard 的 <img> 绑定归一后的 resolvedImageUrl，不是原始 imageUrl', () => {
    const tpl = read('src/views/user-center/UserSpace/components/PointsCard.vue');
    expect(flattenSource(templateSection(tpl))).toContain(flattenSource(':src="resolvedImageUrl"'));
  });

  it('AssetsHubPanel 的自定义卡面预设缩略图同样走改写（它不经 PointsCard）', () => {
    const src = read('src/views/user-center/UserSpace/components/AssetsHubPanel.vue');
    expect(
      flattenSource(codeOf('src/views/user-center/UserSpace/components/AssetsHubPanel.vue')),
    ).toContain(flattenSource('resolveDbCardImage(preset?.imageUrl)'));
    expect(flattenSource(templateSection(src))).toContain(
      flattenSource(':src="pointsCardPresetThumb(preset)"'),
    );
  });

  it('反证：若把 :src 绑回原始 imageUrl，第 2 条会当场变红', () => {
    // 用一份「修复前」的模板片段跑同一个断言，确认它不是恒真。
    const before = '<img class="points-card-custom-image" :src="imageUrl" alt="" loading="lazy">';
    expect(squeezeSource(before)).not.toContain(squeezeSource(':src="resolvedImageUrl"'));
  });

  it('预设的 active 比较仍用原始值（一边改写一边不改写会丢选中态）', () => {
    const src = read('src/views/user-center/UserSpace/components/AssetsHubPanel.vue');
    expect(flattenSource(templateSection(src))).toContain(
      flattenSource('userInfo?.pointsCardImageUrl === preset.imageUrl'),
    );
  });
});
