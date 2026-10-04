import { describe, expect, it } from 'vitest';
import {
  buildModrinthFacets,
  buildResourceSearchQuery,
  detectBohAIResourceSearchIntent,
  inferMinecraftVersion,
  inferResourceLoader,
} from '../../src/utils/api/resource-search-api.js';

// ─────────────────────────────────────────────────────────────────────────────
// 2026-10-04：资源搜索（Modrinth，plans/020 组 D）此前**零测试覆盖**。
// 这条链路的产物是「送给 Modrinth 的查询词 + facets」，一旦判定退化，
// 症状是「搜出来的东西不对」，不会报错 —— 所以必须有守卫。
//
// 本文件同时锁住当天修掉的一个真 bug：剥停用词后只剩量词时（「个 包」「一个」），
// 原先会把这种噪音当查询词送出去。
// ─────────────────────────────────────────────────────────────────────────────

describe('BOH AI 资源搜索意图', () => {
  describe('detectBohAIResourceSearchIntent 命中边界', () => {
    it('「搜索词 + 资源词」命中', () => {
      expect(detectBohAIResourceSearchIntent('推荐一个整合包').matched).toBe(true);
      expect(detectBohAIResourceSearchIntent('帮我找个光影包').matched).toBe(true);
    });

    it('识别资源类型', () => {
      expect(detectBohAIResourceSearchIntent('推荐一个整合包').type).toBe('modpack');
      expect(detectBohAIResourceSearchIntent('帮我找个光影包').type).toBe('shader');
      expect(detectBohAIResourceSearchIntent('有没有宝可梦模组').type).toBe('mod');
    });

    it('普通闲聊与站内写作不命中', () => {
      expect(detectBohAIResourceSearchIntent('今天天气不错').matched).toBe(false);
      expect(detectBohAIResourceSearchIntent('帮我写个帖子').matched).toBe(false);
    });

    it('空输入安全', () => {
      const intent = detectBohAIResourceSearchIntent('');
      expect(intent.matched).toBe(false);
      expect(intent.query).toBe('');
      expect(intent.type).toBe('all');
    });
  });

  describe('buildResourceSearchQuery', () => {
    it('⚠️ 剥完只剩量词时不返回噪音查询词（2026-10-04 修复）', () => {
      // 「帮我找个光影包」剥掉「帮我 / 找 / 光影」后只剩「个 包」——
      // 这种查询词送进 Modrinth 等于没搜，类型信息已由 type=shader 的 facet 承担。
      const shader = detectBohAIResourceSearchIntent('帮我找个光影包');
      expect(shader.query).toBe('');
      expect(shader.query).not.toContain('个');

      const modpack = detectBohAIResourceSearchIntent('推荐一个整合包');
      expect(modpack.query).toBe('');
    });

    it('已知别名照常展开', () => {
      expect(detectBohAIResourceSearchIntent('有没有宝可梦模组').query).toContain('cobblemon');
      expect(detectBohAIResourceSearchIntent('有没有宝可梦模组').query).toContain('pixelmon');
    });

    it('有实义内容时保留（回归：修复不能把正常查询词一起吃掉）', () => {
      // 「优化」会经 QUERY_ALIASES 映射成英文 performance —— 这是有意的（Modrinth 检索词是英文）
      expect(buildResourceSearchQuery('找个优化模组')).toContain('performance');
      expect(buildResourceSearchQuery('推荐一个机械动力')).toContain('create');
      expect(buildResourceSearchQuery('找个暮色森林')).toContain('twilight forest');
    });

    it('空输入返回空串', () => {
      expect(buildResourceSearchQuery('')).toBe('');
    });
  });

  describe('buildModrinthFacets', () => {
    it('按类型 / 版本 / 加载器生成 facets', () => {
      expect(buildModrinthFacets({ type: 'modpack' })).toBe('[["project_type:modpack"]]');
      expect(buildModrinthFacets({ type: 'mod', version: '1.20.1' })).toBe(
        '[["project_type:mod"],["versions:1.20.1"]]',
      );
    });

    it('type=all 不生成类型 facet', () => {
      expect(buildModrinthFacets({ type: 'all' })).toBe('[]');
    });

    it('光影 / 材质包不叠加加载器 facet（加载器对它们无意义）', () => {
      expect(buildModrinthFacets({ type: 'shader', loader: 'fabric' })).toBe(
        '[["project_type:shader"]]',
      );
      expect(buildModrinthFacets({ type: 'mod', loader: 'fabric' })).toBe(
        '[["project_type:mod"],["categories:fabric"]]',
      );
    });
  });

  describe('loader / version 推断', () => {
    it('识别加载器', () => {
      expect(inferResourceLoader('找个 fabric 的模组')).toBe('fabric');
      expect(inferResourceLoader('forge 整合包')).toBe('forge');
      expect(inferResourceLoader('随便推荐')).toBe('');
    });

    it('识别游戏版本', () => {
      expect(inferMinecraftVersion('1.20.1 的模组')).toBe('1.20.1');
      expect(inferMinecraftVersion('1.12 整合包')).toBe('1.12');
      expect(inferMinecraftVersion('最新版')).toBe('');
    });
  });
});
