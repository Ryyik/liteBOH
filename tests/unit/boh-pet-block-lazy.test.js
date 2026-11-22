/**
 * boh-pet-block-lazy.test.js — 「小方」挂件必须懒加载（2026-11-22 首屏预算事故回归）
 *
 * 事故：`fa7c349d` 把 BohPetBlock 静态 import 进 App.vue，它以 App 级常驻身份
 * 落进**入口 app.js**。实测首屏 gzip 从 12.0KB 涨到 29.3KB（CI 报 +17.3KB，
 * 本机 +2.3KB —— 分块组合跨平台不可复现，两边都超上限）：
 *
 *   首屏合计 262.1 KB > 上限 259.9 KB（基线 257.9 + 容差 2.0），超 4.2 KB
 *
 * `check:first-paint-budget` 只挂在 deploy.yml 的 Build 步骤上，**不在**
 * `verify:serial` 链里 ⇒ 本地 `npm run verify` 全绿、deploy 才红。
 * 也就是说这条契约原本没有任何本地守卫能拦住，只能等部署失败才发现。
 *
 * 体积归属（为什么不是「可以接受的代价」）：BohPetBlock 723 行 canvas 渲染
 * + activity-avatar-engine（17.9KB）+ boh-pet-bus / boh-pet-acts 全被拖进入口图。
 * 而它本身是**浮层**（平时靠内部状态隐藏），与 BohIsland 的回答面同性质 ——
 * `vite.config.js` 的 SHELL_CHUNKS 注释已立过同款裁决（第 224-228 行）：
 * 「修法不是把它们加进本名单，而是把回答面改回懒加载」。
 *
 * 本测试锁两点：
 *   ① App.vue 不得静态 import BohPetBlock（必须走 createPanelAsync）；
 *   ② 懒加载必须带 silent —— 它是浮层，chunk 失败时不能在页面角落裸露
 *      「正在加载…」占位（同 App.vue 里另外三个浮层的口径）。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { flattenSource, squeezeSource, stripComments } from '../helpers/source.js';

const appPath = resolve(import.meta.dirname, '../../src/App.vue');
const readApp = () => readFileSync(appPath, 'utf8');

/** 只取 `<script setup>` 段，避免模板里的 <BohPetBlock /> 标签干扰 */
const scriptSection = (source) => {
  const m = source.match(/<script[^>]*>([\s\S]*?)<\/script>/);
  return m ? m[1] : source;
};

describe('BohPetBlock 首屏预算契约（懒加载）', () => {
  it('不许静态 import BohPetBlock —— 它必须经 createPanelAsync 懒加载', () => {
    const script = squeezeSource(scriptSection(readApp()));
    /* 静态 import 的两种写法都不许出现（默认导入 / 具名导入） */
    expect(script).not.toMatch(/import\s+BohPetBlock\s+from/);
    expect(script).not.toMatch(/import\s*\{[^}]*BohPetBlock[^}]*\}\s*from/);
  });

  it('必须用 createPanelAsync 包一层 dynamic import', () => {
    const script = squeezeSource(scriptSection(readApp()));
    /* 懒加载声明：const BohPetBlock = createPanelAsync(() => import('...BohPetBlock.vue')… */
    expect(script).toMatch(
      /const BohPetBlock = createPanelAsync\(\s*\(\) => import\(['"]@\/components\/BohPetBlock\.vue['"]\)/,
    );
  });

  it('懒加载必须带 silent: true —— 浮层失败时不许在页面角落留加载占位', () => {
    const script = squeezeSource(scriptSection(readApp()));
    const decl = script.match(
      /const BohPetBlock = createPanelAsync\([\s\S]*?\);\s*(?:\/\*[\s\S]*?\*\/\s*)?(?=\/\/|const |$)/,
    );
    const block = decl ? decl[0] : script;
    expect(block).toContain('silent: true');
    expect(block).toContain("label: 'BohPetBlock'");
  });

  it('反向断言：入口绝不能把 canvas 引擎直接卷进来（BohPetBlock 只在懒加载 chunk 里）', () => {
    /* 若有人把 activity-avatar-engine 或 boh-pet-acts 直接 import 进 App.vue，
       同样会把挂件的渲染逻辑拖回入口图 —— 这是同一笔预算的第二个口子。
       ⚠️ 必须先 stripComments：本文件的注释里就写着这两个模块名，
       不剥注释的断言会被自己「讲道理的文字」判红（自证过）。 */
    const script = flattenSource(stripComments(scriptSection(readApp())));
    expect(script).not.toContain('activity-avatar-engine');
    expect(script).not.toContain('boh-pet-acts');
    expect(script).not.toContain('boh-pet-bus');
  });
});
