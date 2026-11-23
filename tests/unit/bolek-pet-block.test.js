import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AVATAR_STATES,
  STAGE_STATE,
} from '../../src/views/Bolek/Bolek/components/activity-avatar-engine.js';
import { ACT_MIN_GAP_MS, PET_ACTS, pickPetAct } from '../../src/utils/boh-pet-acts.js';
// 源码守卫断言必须格式宽容：prettier 会把长行拆行、给末项补尾逗号（详见 helpers/source.js）。
import { squeezeSource } from '../helpers/source.js';

const petPath = resolve(import.meta.dirname, '../../src/components/BohPetBlock.vue');
const enginePath = resolve(
  import.meta.dirname,
  '../../src/views/Bolek/Bolek/components/activity-avatar-engine.js',
);
const appPath = resolve(import.meta.dirname, '../../src/App.vue');

/**
 * bolek-pet-block.test.js — 全局挂件「小方」（BohPetBlock，2026-11-22 用户口径）守卫
 *
 * 形态：贴右缘探头（hover/拖拽探出）、沿右缘拖动 + 位置记忆、点击唤起全站唯一 AI 岛
 * （useBohIsland().askDirect —— 不造第二聊天面）、博莱克忙闲全局同步（boh-pet-bus）、
 * 睡觉/摸头、横竖屏适配（竖屏拖拽下界避开底部导航）。
 * 运行时行为由 probe-bolek-pet.mjs 锁；这里锁源码契约。
 */
describe('全局挂件「小方」BohPetBlock（2026-11-22）', () => {
  it('接线守卫：App 挂载 + 唤起走全站唯一 AI 岛（不造第二聊天面）', () => {
    const app = squeezeSource(readFileSync(appPath, 'utf8'));
    expect(app).toContain('<BohPetBlock');
    const pet = squeezeSource(readFileSync(petPath, 'utf8'));
    expect(pet).toContain('useBohIsland');
    expect(pet).toContain('askDirect()');
    // P3 入口收敛口径：挂件绝不内嵌第二个聊天面板/引擎
    expect(pet).not.toContain('useChatEngine');
    expect(pet).not.toContain('sendMessage');
  });

  it('探头守卫：canvas 右对齐 + 容器裁切 + 探出/收回宽度 + 竖屏收窄', () => {
    const pet = squeezeSource(readFileSync(petPath, 'utf8'));
    // 探头 = 容器只露左窄条，canvas 右对齐被容器右缘裁切（视口即右缘）
    expect(pet).toContain('.boh-pet-block {');
    expect(pet).toMatch(/\.boh-pet-block\s*\{[^}]*overflow:\s*hidden/);
    expect(pet).toMatch(/\.boh-pet-canvas\s*\{[^}]*position:\s*absolute/);
    /* 宽度真源已内联（wrapStyle computed）：探头 20/24、全露 56 */
    expect(pet).toContain('w = peekW.value');
    expect(pet).toContain('`${w}px`'); // 内联宽度（模板字面量）
    expect(pet).toContain('portrait.value ? 0.8 : 1');
    expect(pet).toContain('image-rendering: pixelated'); // 像素锐利
  });

  it('拖拽与记忆：位置写 localStorage（boh_pet_block_y）+ 竖屏拖拽下界避底栏', () => {
    const pet = squeezeSource(readFileSync(petPath, 'utf8'));
    expect(pet).toContain("POS_KEY = 'boh_pet_block_pos'"); // v2 {x,y,edge}
    expect(pet).toContain("LEGACY_POS_KEY = 'boh_pet_block_y'"); // v1 一次性迁移
    expect(pet).toContain('localStorage.setItem(');
    expect(pet).toContain('portrait.value ? 120 : 16'); // 竖屏避底栏（拖拽下界）
    expect(pet).toContain("matchMedia('(max-width: 768px)')");
  });

  it('隐藏口径：/ai-chat 与首页开场画在场时退场（与 BohIsland canOpen 同构）', () => {
    const pet = squeezeSource(readFileSync(petPath, 'utf8'));
    expect(pet).toContain("route.name !== 'AiChat'");
    expect(pet).toContain(".home-gate'");
    expect(pet).toContain('setInterval');
  });

  it('状态总线：读 boh-pet-bus，经 STAGE_STATE 映射喂引擎', () => {
    const pet = squeezeSource(readFileSync(petPath, 'utf8'));
    expect(pet).toContain('petStage');
    expect(pet).toContain('STAGE_STATE');
    expect(pet).toContain('createAvatarEngine');
  });

  it('a11y 与降级：可聚焦 + aria 小方 + reduce-motion 静帧', () => {
    const pet = squeezeSource(readFileSync(petPath, 'utf8'));
    expect(pet).toContain('小方 · BOH AI 助手');
    expect(pet).toContain('tabindex="0"');
    expect(pet).toContain("matchMedia('(prefers-reduced-motion: reduce)')");
    expect(pet).toContain('renderStatic');
  });

  it('导演器调度：护栏（输入中/隐藏/忙/reduce 恒不演）+ 最小间隔 + 心情权重', () => {
    const now = 100000;
    /* 护栏：四种「别打扰」场景恒不演 */
    expect(pickPetAct({ typing: true, now })).toBeNull();
    expect(pickPetAct({ hidden: true, now })).toBeNull();
    expect(pickPetAct({ busy: true, now })).toBeNull();
    expect(pickPetAct({ reduced: true, now })).toBeNull();
    /* 最小间隔：刚演过（<20s）恒不演 */
    expect(pickPetAct({ now, lastActId: 'hop', lastActAt: now - 5000 })).toBeNull();
    /* 过了最小间隔：有动作产出 */
    const act = pickPetAct({ now, lastActId: 'hop', lastActAt: now - ACT_MIN_GAP_MS - 1 });
    expect(act).toBeTruthy();
    expect(PET_ACTS).toContain(act);
    /* 同动作冷却：上次是 doze（45s 冷却）且间隔 < 45s ⇒ 不再演 doze */
    for (let i = 0; i < 20; i += 1) {
      expect(pickPetAct({ now: now + 25000, lastActId: 'doze', lastActAt: now }).id).not.toBe(
        'doze',
      );
    }
    /* 心情权重：心情高时 hop 概率显著更高（统计断言，容噪） */
    let hopHigh = 0;
    for (let i = 0; i < 200; i += 1) {
      if (pickPetAct({ mood: 90, now, lastActAt: 0 }).id === 'hop') hopHigh += 1;
    }
    expect(hopHigh).toBeGreaterThan(20);
  });

  it('层级守卫：z 59 —— 抽屉侧栏（45）之上、导航（9999）/岛（10001）之下', () => {
    const pet = squeezeSource(readFileSync(petPath, 'utf8'));
    expect(pet).toContain('z-index: 59');
    /* 引擎常量色（黑身白五官恒定）+ sleeping 态在场 */
    const engine = squeezeSource(readFileSync(enginePath, 'utf8'));
    expect(engine).toContain("'#1d1d1f'");
    expect(AVATAR_STATES.sleeping).toBeTruthy();
    expect(STAGE_STATE.thinking).toBe('thinking'); // 映射真源仍在位
  });
});
