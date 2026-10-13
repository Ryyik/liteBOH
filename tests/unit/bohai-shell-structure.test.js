/**
 * bohai-shell-structure.test.js — BOHAIMain 薄壳 + BOHAI 行数阈值（plans/025 v2 · Step 7）
 *
 * 背景：Step 7 把 BOHAIMain.vue 的 `<script setup>` 顶层声明收进
 * `composables/useBohShell.js`，壳薄化为「布局装配 + 形态切换」；同时把
 * BOHAI 目录的行数阈值（组件 400 / 模块 500）并入 check-project-structure。
 *
 * 两类断言的分工：
 *   · 「壳是真的薄」—— 数据断言（行数、import、解构、expose 转发），不认文案；
 *   · 「壳没接断」—— 壳仍导入/解构/转发 composable，composable 仍持有引擎接线
 *     与生命周期钩子（防下一轮回退把状态搬回壳里）。
 *
 * ⚠️ 否定断言的判据只取**代码形态**（如 `useChatEngine()` 调用点），注释里
 *    复述名字不算满足 —— 与本仓其它源码守卫同一纪律。
 */
import { readFileSync } from 'node:fs';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { collectStructureReport } from '../../scripts/check-project-structure.mjs';

const root = resolve(import.meta.dirname, '../..');
const read = (rel) => readFileSync(resolve(root, rel), 'utf8');
// 与门禁同一口径：split(/\r?\n/) 计行（末行换行会多算一格）
const lineCount = (rel) => read(rel).split(/\r?\n/).length;

const MAIN = 'src/views/BOHAI/BOHAI/BOHAIMain.vue';
const SHELL = 'src/views/BOHAI/composables/useBohShell.js';

describe('BOHAIMain 薄壳（Step 7：布局装配 + 形态切换）', () => {
  it('BOHAIMain.vue 收敛到 400 行阈值以内', () => {
    expect(lineCount(MAIN)).toBeLessThan(400);
  });

  it('壳仍接线：导入 useBohShell、解构状态、转发对外 API', () => {
    const src = read(MAIN);
    expect(src).toContain("import { useBohShell } from '../composables/useBohShell.js'");
    expect(src).toMatch(/\}\s*=\s*useBohShell\(props,\s*emit\);/);
    // 形态开关仍是编译宏，留在壳里
    expect(src).toContain('defineProps(');
    expect(src).toContain("defineEmits(['island-message', 'overlay-state'])");
    // 对外 API 由壳的 defineExpose 转发（名单定义在 composable 的 exposedApi）
    expect(src).toContain('defineExpose(exposedApi);');
    expect(read(SHELL)).toContain('const exposedApi = {');
  });

  it('useBohShell.js 承接状态与接线（引擎 / 钩子 / 闸门都在）', () => {
    const src = read(SHELL);
    expect(src).toContain('export function useBohShell(props, emit)');
    for (const needle of [
      '} = useChatEngine();',
      'const handleSend = () =>',
      'onMounted(',
      'onActivated(',
      'onUnmounted(',
      'syncThemeAttribute',
      'executeSlashCommand',
    ]) {
      expect(src, `useBohShell 应保留 ${needle}`).toContain(needle);
    }
  });

  it('壳不再自带引擎接线（抽走后不许留第二份）', () => {
    // 只取 <script setup> 区：模板里合法地引用这些名字（绑定），
    // 要锁的是「壳的脚本不再自己调引擎 / 不再自己拉额度」。
    const main = read(MAIN);
    const script = main.slice(main.indexOf('<script setup>'));
    expect(script).not.toContain('useChatEngine()');
    expect(script).not.toContain('getAiQuotaStatus');
    expect(script).not.toContain('parseSlashInput');
  });
});

describe('BOHAI 行数阈值收紧（Step 7-1：组件 400 / 模块 500）', () => {
  it('阈值并入 collectStructureReport，且 BOHAI 文件不受 top-20 窗口限制', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'boh-bohai-limits-'));
    try {
      const composablesDir = path.join(dir, 'src/views/BOHAI/composables');
      const componentsDir = path.join(dir, 'src/views/BOHAI/BOHAI/components');
      mkdirSync(composablesDir, { recursive: true });
      mkdirSync(componentsDir, { recursive: true });
      // 501 行模块（.js）应被 500 阈值抓到（即便全仓排名很靠后）
      writeFileSync(path.join(composablesDir, 'fat.js'), Array(501).fill('//').join('\n'));
      // 401 行组件（.vue）应被 400 阈值抓到
      writeFileSync(path.join(componentsDir, 'Fat.vue'), Array(401).fill('<!--').join('\n'));
      // 压线：499 行模块 / 399 行组件不报（阈值语义是 >= limit 才报）
      writeFileSync(path.join(composablesDir, 'ok.js'), Array(499).fill('//').join('\n'));
      writeFileSync(path.join(componentsDir, 'Ok.vue'), Array(399).fill('<!--').join('\n'));

      const report = collectStructureReport(dir);

      expect(
        report.warnings.some((w) => w.includes('fat.js') && w.includes('501 行，建议阈值 500 行')),
      ).toBe(true);
      expect(
        report.warnings.some((w) => w.includes('Fat.vue') && w.includes('401 行，建议阈值 400 行')),
      ).toBe(true);
      expect(report.warnings.some((w) => w.includes('ok.js'))).toBe(false);
      expect(report.warnings.some((w) => w.includes('Ok.vue'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
