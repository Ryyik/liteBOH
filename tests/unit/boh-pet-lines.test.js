/**
 * boh-pet-lines —— 小方台词系统的调度真源。
 *
 * 为什么这块必须有测试：台词是「不给提示」之后唯一会对用户说话的东西，
 * 一旦它也开始播报系统消息，就等于把刚删掉的弹窗换成了带脸版本。
 * 所以这里锁两条：**宁可不说**（护栏）和 **主语是小方**（内容边界）。
 */
import { describe, expect, it } from 'vitest';
import {
  LINE_MIN_GAP_MS,
  PET_LINES,
  SCENE_MIN_GAP_MS,
  lineDuration,
  pickPetLine,
} from '../../src/utils/boh-pet-lines.js';

const NOW = 1_800_000_000_000;

describe('pickPetLine 调度', () => {
  it('未知场景返回 null（不随机兜底，否则哪都在说话）', () => {
    expect(pickPetLine({ scene: '', now: NOW })).toBeNull();
    expect(pickPetLine({ scene: 'not-a-scene', now: NOW })).toBeNull();
  });

  it('用户正在输入 ⇒ 恒不出声', () => {
    expect(pickPetLine({ scene: 'hello', typing: true, now: NOW })).toBeNull();
  });

  it('页面隐藏 ⇒ 恒不出声', () => {
    expect(pickPetLine({ scene: 'hello', hidden: true, now: NOW })).toBeNull();
  });

  it('博莱克忙 ⇒ 让位给状态动效', () => {
    expect(pickPetLine({ scene: 'hello', busy: true, now: NOW })).toBeNull();
  });

  it('reduce-motion ⇒ 恒不出声', () => {
    expect(pickPetLine({ scene: 'hello', reduced: true, now: NOW })).toBeNull();
  });

  it('两句之间的最小间隔：刚说过就不再出', () => {
    const line = pickPetLine({ scene: 'hello', now: NOW });
    expect(line).not.toBeNull();
    expect(pickPetLine({ scene: 'hello', now: NOW + 1000, lastLineAt: NOW })).toBeNull();
    // 过了间隔就可以
    expect(
      pickPetLine({ scene: 'hello', now: NOW + LINE_MIN_GAP_MS + 1, lastLineAt: NOW }),
    ).not.toBeNull();
  });

  it('同一场景有最小间隔（同类话不连着说）', () => {
    expect(
      pickPetLine({
        scene: 'hello',
        now: NOW + LINE_MIN_GAP_MS + 1,
        lastLineAt: NOW,
        lastSceneAt: NOW,
      }),
    ).toBeNull();
    expect(
      pickPetLine({
        scene: 'hello',
        now: NOW + LINE_MIN_GAP_MS + SCENE_MIN_GAP_MS + 1,
        lastLineAt: NOW,
        lastSceneAt: NOW,
      }),
    ).not.toBeNull();
  });

  it('同一句在冷却期内不重复', () => {
    // 只剩一句可选时，冷却必须真的把它挡住
    const only = [{ id: 'x', scene: 's', text: '唯一', weight: 1, cooldown: 60_000 }];
    expect(
      pickPetLine({ scene: 's', now: NOW, lines: only, lastLineId: 'x', lastLineAt: NOW - 30_000 }),
    ).toBeNull();
    expect(
      pickPetLine({ scene: 's', now: NOW, lines: only, lastLineId: 'x', lastLineAt: NOW - 61_000 }),
    ).not.toBeNull();
  });

  it('时段限定：深夜台词白天不出现', () => {
    const night = [{ id: 'n', scene: 's', text: '深夜', weight: 1, hours: [0, 1, 2] }];
    expect(pickPetLine({ scene: 's', hour: 14, now: NOW, lines: night })).toBeNull();
    expect(pickPetLine({ scene: 's', hour: 1, now: NOW, lines: night })).not.toBeNull();
  });

  it('心情区间：低落时才说的那句，心情好时不说', () => {
    const low = [{ id: 'l', scene: 's', text: '低落', weight: 1, mood: { max: 40 } }];
    expect(pickPetLine({ scene: 's', mood: 90, now: NOW, lines: low })).toBeNull();
    expect(pickPetLine({ scene: 's', mood: 20, now: NOW, lines: low })).not.toBeNull();
  });

  it('返回结构带 duration，且随字数增长但封顶', () => {
    const line = pickPetLine({ scene: 'hello', now: NOW });
    expect(line).toMatchObject({ id: expect.any(String), text: expect.any(String) });
    expect(line.duration).toBeGreaterThan(0);
    expect(lineDuration('短')).toBeLessThan(lineDuration('这是一句明显更长的台词内容'));
    expect(lineDuration('很长'.repeat(50))).toBeLessThanOrEqual(4600);
  });

  it('交互型台词（被摸/被拖）绕开全局间隔 —— 否则刚进站打完招呼，第一次摸它没反应', () => {
    /* 2026-11-23 探针实测踩到的：开场 hello 说完后 25s 内摸头完全没反应，
       观感是「坏了」。摸头是对用户当场动作的回应，必须立刻有反馈。 */
    // 刚说过话（1 秒前），非交互场景被挡住
    expect(
      pickPetLine({ scene: 'idle', now: NOW, lastLineAt: NOW - 1000, lastSceneAt: 0 }),
    ).toBeNull();
    // 同样条件下，交互场景照常出
    const petted = pickPetLine({
      scene: 'petted',
      now: NOW,
      lastLineAt: NOW - 1000,
      lastSceneAt: 0,
    });
    expect(petted).not.toBeNull();
    expect(petted.scene).toBe('petted');
  });

  it('交互型台词仍受自己的 cooldown 管束（摸个不停不会一直说）', () => {
    const petted = PET_LINES.filter((l) => l.scene === 'petted');
    // 刚说过 pet-1，1 秒后再摸 ⇒ 只会挑另一句（或不挑），不会重复同一句
    const again = pickPetLine({
      scene: 'petted',
      now: NOW,
      lastLineAt: NOW - 1000,
      lastLineId: petted[0].id,
      lastSceneAt: 0,
    });
    expect(again?.id).not.toBe(petted[0].id);
  });
});

describe('台词内容的边界（这条比调度更重要）', () => {
  it('没有任何一句在播报系统消息', () => {
    /* 用户 2026-11-23 定稿「更新不弹窗、也不做通知」的直接推论：
       小方的台词只许来自「它自己想说」，不许转述系统状态。
       一旦它开始说「有新版本」「网络异常」「上传失败」，它就变成了带脸的弹窗。 */
    const banned = [
      '新版本',
      '更新',
      '刷新',
      '加载失败',
      '网络',
      '上传',
      '下载',
      '错误',
      '异常',
      '失败',
      '重试',
      '登录',
      '密码',
      '权限',
    ];
    const offenders = PET_LINES.filter((line) =>
      banned.some((word) => line.text.includes(word)),
    ).map((line) => `${line.id}: ${line.text}`);
    expect(offenders).toEqual([]);
  });

  it('台词都足够短（气泡放得下）', () => {
    const tooLong = PET_LINES.filter((line) => line.text.length > 24).map((line) => line.id);
    expect(tooLong).toEqual([]);
  });

  it('id 唯一（否则冷却记账会串）', () => {
    const ids = PET_LINES.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
