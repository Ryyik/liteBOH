/**
 * bohai-memory-dedupe.test.js — 锁记忆判重 / 覆盖分类（2026-10-08）
 *
 * 背景：旧实现只有「是否重复」一个布尔出口，导致两类真实缺陷：
 *   ① 短的新事实被长的旧记忆双向 `includes` 吞掉（该记的没记）；
 *   ② 同一条事实被用户改口（「我在上海」→「我现在在北京」）被当成重复静默丢弃，
 *      旧事实永久占位、用户改了也改不掉。
 *
 * 三条关键口径：
 *   - `classifyMemoryWrite` 的三个出口：exact（跳过）/ supersede（归档旧+写新）/ none（写新）
 *   - 长度比门槛 0.5：真重复不受影响，改口能被抓到
 *   - `findSupersededMemory` 必须能定位到**带 id** 的那条（没有 id 就不该归档）
 */
import { describe, expect, it } from 'vitest';
import {
  classifyMemoryWrite,
  extractExplicitMemoryContent,
  findSupersededMemory,
  isLikelyMemoryDuplicate,
  normalizeMemoryCompareText,
} from '@/views/BOHAI/utils/memory/dedupe.js';

describe('BOHAI 记忆判重（dedupe）', () => {
  describe('normalizeMemoryCompareText', () => {
    it('去掉标点与空白、大小写归一，保留中英文数字', () => {
      expect(normalizeMemoryCompareText('我喜欢猫， 和狗。')).toBe('我喜欢猫和狗');
      expect(normalizeMemoryCompareText('Hello, World!')).toBe('helloworld');
    });

    it('空输入返回空串（不抛）', () => {
      expect(normalizeMemoryCompareText('')).toBe('');
      expect(normalizeMemoryCompareText(null)).toBe('');
      expect(normalizeMemoryCompareText(undefined)).toBe('');
    });
  });

  describe('isLikelyMemoryDuplicate —— 长度比门槛', () => {
    it('完全相同 ⇒ 重复', () => {
      expect(isLikelyMemoryDuplicate('我喜欢猫', [{ content: '我喜欢猫' }])).toBe(true);
    });

    it('仅差标点/语气 ⇒ 仍算重复（真重复不被门槛误伤）', () => {
      expect(
        isLikelyMemoryDuplicate('我的生日是 3 月 1 号', [{ content: '我的生日是3月1号' }]),
      ).toBe(true);
    });

    it('⚠️ 回归：短事实不再被长记忆吞掉（双向 includes 的老坑）', () => {
      // 旧实现：normalizedCandidate 被长句 includes ⇒ 判重 ⇒ 新事实被丢弃
      const existing = [{ content: '我喜欢猫和狗，也养过金鱼' }];
      expect(isLikelyMemoryDuplicate('我喜欢猫', existing)).toBe(false);
    });

    it('长事实也不再被短记忆吞掉', () => {
      const existing = [{ content: '咖啡' }];
      expect(isLikelyMemoryDuplicate('我最近每天都喝手冲咖啡豆', existing)).toBe(false);
    });

    it('空 candidate ⇒ 不重复；空 existing ⇒ 不重复', () => {
      expect(isLikelyMemoryDuplicate('', [{ content: '我喜欢猫' }])).toBe(false);
      expect(isLikelyMemoryDuplicate('我喜欢猫', [])).toBe(false);
      expect(isLikelyMemoryDuplicate('我喜欢猫', [{ content: '' }])).toBe(false);
    });

    it('兼容 string 形态的 existing item', () => {
      expect(isLikelyMemoryDuplicate('我喜欢猫', ['我喜欢猫'])).toBe(true);
    });
  });

  describe('classifyMemoryWrite —— 三出口', () => {
    it('同一句话说两遍 ⇒ exact（调用方应跳过写入）', () => {
      expect(classifyMemoryWrite('我喜欢猫', [{ id: '1', content: '我喜欢猫' }])).toBe('exact');
    });

    it('⚠️ 回归：同主题改口 ⇒ supersede（旧事实要被归档，不是丢弃）', () => {
      const existing = [{ id: 'old-1', content: '我现在住在上海' }];
      expect(classifyMemoryWrite('我现在住在北京', existing)).toBe('supersede');
    });

    it('完全无关的新记忆 ⇒ none（正常写入）', () => {
      const existing = [{ id: '1', content: '我现在住在上海' }];
      expect(classifyMemoryWrite('我这周开始学吉他', existing)).toBe('none');
    });

    it('⚠️ 反证：长度相近但主题无关 ⇒ 不能误判成改口（第一版实现踩过这个坑）', () => {
      // 两句都 7~8 字，长度比 0.875 —— 若用长度比当同主题信号，这句会被误判 supersede，
      // 于是「记学吉他」会误归档「住上海」。同主题必须看公共子串，不是长度。
      expect(
        classifyMemoryWrite('我这周开始学吉他', [{ id: '1', content: '我现在住在上海' }]),
      ).toBe('none');
      expect(
        classifyMemoryWrite('我最近每天早上跑步', [{ id: '1', content: '我现在住在上海' }]),
      ).toBe('none');
    });

    it('同主题改口但长度差异大 ⇒ 仍是 supersede（只要句式够像）', () => {
      expect(
        classifyMemoryWrite('我现在住在上海徐汇区', [{ id: '1', content: '我现在住在北京' }]),
      ).toBe('supersede');
    });

    it('空 candidate ⇒ none（不阻断写入）', () => {
      expect(classifyMemoryWrite('', [{ id: '1', content: '我喜欢猫' }])).toBe('none');
    });

    it('非数组 existing ⇒ none（不抛）', () => {
      expect(classifyMemoryWrite('我喜欢猫', null)).toBe('none');
      expect(classifyMemoryWrite('我喜欢猫', undefined)).toBe('none');
    });
  });

  describe('findSupersededMemory —— 定位待归档的那条', () => {
    it('定位到主题重合度最高、且内容不等的那条', () => {
      const existing = [
        { id: 'a', content: '我喜欢喝咖啡' },
        { id: 'b', content: '我现在住在上海' },
      ];
      const hit = findSupersededMemory('我现在住在北京', existing);
      expect(hit?.id).toBe('b');
    });

    it('内容完全相同 ⇒ 不返回（那是 exact，不该归档）', () => {
      expect(findSupersededMemory('我喜欢猫', [{ id: '1', content: '我喜欢猫' }])).toBeNull();
    });

    it('无主题重合 ⇒ null', () => {
      expect(
        findSupersededMemory('我这周开始学吉他', [{ id: '1', content: '我现在住在上海' }]),
      ).toBeNull();
    });

    it('同主题的有多条时，选最像的那条（不按数组顺序瞎猜）', () => {
      const existing = [
        { id: 'a', content: '我现在住在上海市浦东新区' },
        { id: 'b', content: '我现在住在上海' },
      ];
      expect(findSupersededMemory('我现在住在广州', existing)?.id).toBe('b');
    });

    it('⚠️ string 形态 item 不返回（没有 id 就无法归档，宁可不处理）', () => {
      expect(findSupersededMemory('我现在住在北京', ['我现在住在上海'])).toBeNull();
    });
  });

  describe('extractExplicitMemoryContent（顺带锁住抽取没被改坏）', () => {
    it('识别「记住 X」并取出内容', () => {
      expect(extractExplicitMemoryContent('记住我喜欢猫')).toBe('我喜欢猫');
      expect(extractExplicitMemoryContent('记下来：我现在住在上海')).toBe('我现在住在上海');
      expect(extractExplicitMemoryContent('记忆沉淀：我在学吉他')).toBe('我在学吉他');
    });

    it('⚠️ 前缀只认单个敬语词：「请帮我」这种叠写仍不匹配（既有行为，本次未改）', () => {
      // 正则是 `(?:请|麻烦|帮我)?(?:记住|记下来|…)`，三选一，不支持「请帮我」叠写。
      // 这里锁住现状，避免有人以为它已经支持；若日后要支持，改的是这 4 条正则。
      expect(extractExplicitMemoryContent('请帮我记下来：我现在住在上海')).toBe('');
    });

    it('非记忆指令 ⇒ 空串', () => {
      expect(extractExplicitMemoryContent('今天天气怎么样')).toBe('');
      expect(extractExplicitMemoryContent('')).toBe('');
    });
  });
});
