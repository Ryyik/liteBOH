import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REFRACT = readFileSync(resolve('src/components/ui/BohGlassRefract.vue'), 'utf8');
const COMPOSER = readFileSync(resolve('src/views/BOHAI/BOHAI/components/BohComposer.vue'), 'utf8');

describe('磨砂 vs 折射', () => {
  it('组件有 frosted 开关，且把位移归零', () => {
    expect(REFRACT).toContain('frosted: { type: Boolean, default: false }');
    expect(REFRACT).toMatch(/props\.frosted \? 0 : props\.displacementScale/);
    expect(REFRACT).toContain(':displacement-scale="effectiveDisplacementScale"');
  });
  it('磨砂不碰 blurAmount（模糊仍归全站倍数）', () => {
    expect(REFRACT).toContain('props.blurAmount * blurScale.value');
    expect(REFRACT).not.toMatch(/frosted[^;]*blurAmount\s*\*/);
  });
  it('弹层全部磨砂，输入框保持折射', () => {
    // 2026-10-20：斜杠菜单改自带标准玻璃（不再挂折射组件）⇒ 实例 6 → 5，
    // 磨砂 5 → 4。仍在用折射组件的四处弹层（模型/工具/详情卡/用量）全部磨砂。
    const lines = COMPOSER.split('\n').filter((l) => l.includes('<BohGlassRefract'));
    expect(lines.length).toBe(5);
    const frostedCount = lines.filter((l) => l.includes('frosted')).length;
    expect(frostedCount).toBe(4);
    // 唯一没标的是输入框本体（radius 20）
    const plain = lines.filter((l) => !l.includes('frosted'));
    expect(plain.length).toBe(1);
    expect(plain[0]).toContain(':radius="20"');
  });
});
