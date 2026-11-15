import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_GREETING_TEMPLATE,
  DEFAULT_HINT_TEXT,
  resolveGreetingWord,
  resolveGreetingText,
  resolveHintText,
} from '../../src/utils/street-scene-copy.js';

// ---------------------------------------------------------------------------
// 2026-09-24：首屏街景问候语 / 底部提示改为可配（home_heroes.greeting_text / hint_text）
//
// 关键不变量：**留空必须等于「当前默认文案」** —— 否则改默认值会静默漂移；
// 默认值本身有明确出处（2026-11-14 起为品牌固定句「这里不只有方块」），由本文件锁住。
// ---------------------------------------------------------------------------

const at = (hour) => new Date(2026, 0, 1, hour, 0, 0);

describe('时段词', () => {
  it('按小时分段，阈值与改动前一致', () => {
    expect(resolveGreetingWord(at(4))).toBe('晚上好');
    expect(resolveGreetingWord(at(5))).toBe('早上好');
    expect(resolveGreetingWord(at(10))).toBe('早上好');
    expect(resolveGreetingWord(at(11))).toBe('中午好');
    expect(resolveGreetingWord(at(12))).toBe('中午好');
    expect(resolveGreetingWord(at(13))).toBe('下午好');
    expect(resolveGreetingWord(at(17))).toBe('下午好');
    expect(resolveGreetingWord(at(18))).toBe('晚上好');
    expect(resolveGreetingWord(at(23))).toBe('晚上好');
  });
});

describe('问候语：留空回落默认（回归护栏）', () => {
  it('null / undefined / 空串 / 纯空白 都回落默认文案', () => {
    for (const empty of [null, undefined, '', '   ', '\n']) {
      expect(resolveGreetingText(empty, '早上好')).toBe('这里不只有方块');
    }
  });

  it('默认文案是固定句「这里不只有方块」，不随时段变化', () => {
    expect(DEFAULT_GREETING_TEMPLATE).toBe('这里不只有方块');
    expect(resolveGreetingText(null, '晚上好')).toBe('这里不只有方块');
    expect(resolveGreetingText(null, at(9))).toBe('这里不只有方块');
    expect(resolveGreetingText(null, at(20))).toBe('这里不只有方块');
  });

  it('传 Date 时自定义模板里的 {greeting} 仍按时段替换', () => {
    expect(resolveGreetingText('{greeting}，今天也要开心', at(9))).toBe('早上好，今天也要开心');
    expect(resolveGreetingText('{greeting}，今天也要开心', at(20))).toBe('晚上好，今天也要开心');
  });
});

describe('问候语：自定义', () => {
  it('含占位符 → 逐处替换', () => {
    expect(resolveGreetingText('{greeting}，今天也要开心', '下午好')).toBe('下午好，今天也要开心');
    expect(resolveGreetingText('{greeting}·{greeting}', '中午好')).toBe('中午好·中午好');
  });

  it('不含占位符 → 固定文案，与时段无关', () => {
    expect(resolveGreetingText('欢迎来到方块街', '早上好')).toBe('欢迎来到方块街');
    expect(resolveGreetingText('欢迎来到方块街', '晚上好')).toBe('欢迎来到方块街');
  });

  it('两侧空白会被 trim', () => {
    expect(resolveGreetingText('  {greeting}，久等了  ', '早上好')).toBe('早上好，久等了');
  });

  it('未知占位符原样保留（不做静默吞掉）', () => {
    expect(resolveGreetingText('{greeting}，{name}', '早上好')).toBe('早上好，{name}');
  });
});

describe('底部提示文案', () => {
  it('留空回落「往下逛逛」', () => {
    expect(DEFAULT_HINT_TEXT).toBe('往下逛逛');
    for (const empty of [null, undefined, '', '  ']) {
      expect(resolveHintText(empty)).toBe('往下逛逛');
    }
  });

  it('自定义时 trim 后原样返回', () => {
    expect(resolveHintText('  下滑看看  ')).toBe('下滑看看');
  });
});

// ---------------------------------------------------------------------------
// 接线守卫：两个消费方必须共用本模块，不得各自维护副本
// （否则装修台预览与线上渲染会漂移 —— 这正是本次改动要消除的那类问题）
// ---------------------------------------------------------------------------
describe('接线守卫', () => {
  const ROOT = path.resolve(__dirname, '../..');
  const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const HERO = 'src/views/Home/components/StreetSceneHero.vue';
  const CONSOLE = 'src/views/HeroConsole/index.vue';

  it('线上组件从共享模块取值，且不再硬编码问候语模板', () => {
    const src = read(HERO);
    expect(src).toContain("from '@/utils/street-scene-copy.js'");
    expect(src).toContain('resolveGreetingText(props.hero?.greeting_text');
    expect(src).toContain('resolveHintText(props.hero?.hint_text)');
    // 硬编码的默认文案不得在组件内复现
    expect(src).not.toContain("'，欢迎回到方块街'");
    expect(src).not.toContain('`${greetingWord.value}，欢迎回到方块街`');
  });

  it('时段词实现只在共享模块一处，组件不得另立副本', () => {
    const src = read(HERO);
    expect(src).toContain('resolveGreetingWord');
    // 组件里出现 return '早上好' 就说明又抄了一份分段阈值
    expect(src).not.toContain("return '早上好'");
    expect(src).not.toContain('hour >= 5 && hour < 11');
  });

  it('装修台预览从同一共享模块取值', () => {
    const src = read(CONSOLE);
    expect(src).toContain("from '@/utils/street-scene-copy.js'");
    expect(src).toContain('resolveGreetingText(draftHero.value?.greeting_text)');
    expect(src).toContain('resolveHintText(draftHero.value?.hint_text)');
  });

  it('装修台保存 payload 带上两个文案字段，且仅 street-scene 模板生效', () => {
    const src = read(CONSOLE);
    expect(src).toContain("greeting_text: draft.template === 'street-scene'");
    expect(src).toContain("hint_text: draft.template === 'street-scene'");
  });
});
