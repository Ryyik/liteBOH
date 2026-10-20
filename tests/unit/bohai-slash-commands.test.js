import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { flattenSource, squeezeSource, scriptSection, stripComments } from '../helpers/source.js';
import {
  BOH_SLASH_COMMANDS,
  buildSlashMenuItems,
  filterSlashItems,
  formatSlashHelp,
  parseSlashInput,
  slashMenuQuery,
} from '../../src/views/BOHAI/BOHAI/bohai-slash-commands.js';

// ─────────────────────────────────────────────────────────────────────────────
// 斜杠命令真源的行为 + 接线守卫（2026-10-08 报障修复的防回归锁）。
//
// 事故：命令执行只挂在 keydown / 菜单 mousedown 上，发送按钮走另一条线且零斜杠分支
// ⇒ 点发送键把 `/cloud` 当普通文本发给模型（探针 probe-bohai-slash-commands.mjs
// 修复前 1/7）。本文件锁两件事：
//   ① 解析契约（纯命令 / 带参数 / 未知 / 非斜杠 / 全角 / `//` 转义）；
//   ② 壳里**只有一个闸门**（handleSend），且三个入口都汇到 executeSlashCommand。
// ⚠️ 改断言前先读 tests/helpers/source.js 的归一规则（prettier 会重排源码）。
// ─────────────────────────────────────────────────────────────────────────────

const read = (relPath) => readFileSync(resolve(import.meta.dirname, '../..', relPath), 'utf8');
// Step 7：发送闸门（handleSend / executeSlashCommand）搬进 composables/useBohShell.js
// ⇒ 代码侧断言改指新文件；模板侧接线（@send / @run-slash-command）仍读 BOHAIMain。
const SHELL = 'src/views/BOHAI/composables/useBohShell.js';
const MAIN = 'src/views/BOHAI/BOHAI/BOHAIMain.vue';
const MODULE = 'src/views/BOHAI/BOHAI/bohai-slash-commands.js';

describe('parseSlashInput · 六类解析契约', () => {
  it('非斜杠输入 ⇒ none（含 "/" 的普通消息不被误判）', () => {
    const r = parseSlashInput('路径是 /user-space?tab=posts 怎么走');
    expect(r.kind).toBe('none');
    expect(r.command).toBeNull();
  });

  it('纯命令 ⇒ command，无参数', () => {
    const r = parseSlashInput('/web');
    expect(r.kind).toBe('command');
    expect(r.keyword).toBe('web');
    expect(r.args).toBe('');
    expect(r.command.action).toBe('web');
  });

  it('带参数 ⇒ 第一个空白前是命令字、之后是参数', () => {
    const r = parseSlashInput('/cloud 素材盘点成表格');
    expect(r.kind).toBe('command');
    expect(r.keyword).toBe('cloud');
    expect(r.args).toBe('素材盘点成表格');
  });

  it('未知命令 ⇒ unknown（不许静默当普通文本放行）', () => {
    const r = parseSlashInput('/zzz-not-a-command');
    expect(r.kind).toBe('unknown');
    expect(r.keyword).toBe('zzz-not-a-command');
  });

  it('单个 / ⇒ unknown（不是命令，也不能当普通消息发出去）', () => {
    expect(parseSlashInput('/').kind).toBe('unknown');
  });

  it('全角斜杠 ／ 归一成半角后照样识别', () => {
    const r = parseSlashInput('／web');
    expect(r.kind).toBe('command');
    expect(r.keyword).toBe('web');
  });

  it('// 前缀是转义：发字面量 /foo', () => {
    const r = parseSlashInput('//foo');
    expect(r.kind).toBe('literal');
    expect(r.text).toBe('/foo');
  });

  it('动态模式项**不再生成**（2026-10-20 用户口径「/模型名这种不要」）', () => {
    // 模式切换只走底行胶囊；斜杠菜单不再镜像每个模式名。
    const items = buildSlashMenuItems({ chatModes: [{ id: 'think', name: 'Deep Think' }] });
    expect(items.some((i) => i.modeId === 'think')).toBe(false);
    expect(items.map((i) => i.keyword)).not.toContain('deep-think');
    // /model 命令本身仍在（它带参数，是"一个入口"而不是"每个模式一条"）
    const r = parseSlashInput('/model deep-think', { commands: items });
    expect(r.kind).toBe('command');
    expect(r.command.action).toBe('mode');
    expect(r.args).toBe('deep-think');
  });
});

describe('buildSlashMenuItems · 只返回固定命令', () => {
  it('清单恒等于固定命令表（模式项已整体移除）', () => {
    const items = buildSlashMenuItems({ chatModes: [{ id: 'pro', name: 'Pro' }] });
    expect(items.length).toBe(BOH_SLASH_COMMANDS.length);
    expect(items).toEqual(BOH_SLASH_COMMANDS);
    // 传不传 chatModes 都得同一个结果
    expect(buildSlashMenuItems()).toEqual(items);
  });

  it('缺省 chatModes 不报错', () => {
    expect(buildSlashMenuItems().length).toBe(BOH_SLASH_COMMANDS.length);
  });
});

describe('命令清单 ↔ 壳里分派的不变量（2026-10-16 补）', () => {
  it('/memory 可解析；/shared 与 /community 从菜单移除但**旧关键字仍可解析**', () => {
    const memory = parseSlashInput('/memory');
    expect(memory.kind).toBe('command');
    expect(memory.command.action).toBe('memory');

    // 2026-10-20：三者本就切换同一个站内知识总开关，菜单只留 /memory。
    // ⚠️ 但**解析器**要认旧关键字 —— 老用户手打 /shared 不能突然变成「未知命令」。
    //    这条依赖壳里保留 case 'shared' / case 'community'（见下一条断言）。
    const legacy = ['/shared', '/community'];
    for (const raw of legacy) {
      const r = parseSlashInput(raw);
      expect(r.kind, `${raw} 仍应被解析为命令`).toBe('command');
    }
  });

  it('每条固定命令的 action 在壳里都有对应 case', () => {
    // 事故形态（2026-10-16 实际发生）：给「官方记忆」加了设置面板开关与
    // handleKnowledgeBaseToggle，却没在 executeSlashCommand 的 switch 里加 case
    // ⇒ 用户敲 /memory 只会得到「未知命令」。这条断言把该形态永久堵住。
    const code = squeezeSource(stripComments(scriptSection(read(SHELL))));
    const actions = [...new Set(BOH_SLASH_COMMANDS.map((command) => command.action))];
    expect(actions.length).toBeGreaterThan(0);
    for (const action of actions) {
      expect(code).toContain(squeezeSource(`case '${action}':`));
    }
  });

  it('检索组去重后只剩 /web /cloud /memory（一条命令一个入口）', () => {
    const items = buildSlashMenuItems();
    const keywords = items.map((item) => item.keyword);
    expect(keywords).toContain('memory');
    // 重复入口已移除
    expect(keywords).not.toContain('shared');
    expect(keywords).not.toContain('community');
    // /help 文案与菜单同源（都从 BOH_SLASH_COMMANDS 生成）
    expect(formatSlashHelp()).toContain('/memory');
    expect(formatSlashHelp()).not.toContain('/shared');
  });
});

describe('slashMenuQuery / filterSlashItems', () => {
  it('只有「以 / 开头且无空白」才开菜单', () => {
    expect(slashMenuQuery('/we')).toBe('we');
    expect(slashMenuQuery('/cloud 素材')).toBeNull();
    expect(slashMenuQuery('路径是 /x')).toBeNull();
    expect(slashMenuQuery('//foo')).toBeNull();
    expect(slashMenuQuery('')).toBeNull();
  });

  it('空串查询返回全部，否则按关键字 / 标签模糊匹配', () => {
    const items = buildSlashMenuItems();
    expect(filterSlashItems(items, '').length).toBe(items.length);
    expect(filterSlashItems(items, 'web').map((i) => i.keyword)).toContain('web');
    expect(filterSlashItems(items, '联网').map((i) => i.keyword)).toContain('web');
  });

  it('help 文案覆盖全部固定命令', () => {
    const help = formatSlashHelp();
    for (const command of BOH_SLASH_COMMANDS) expect(help).toContain(`/${command.keyword}`);
  });
});

describe('接线守卫 · 壳里只有一个发送闸门', () => {
  const raw = read(SHELL);
  // ⚠️ 必须剥注释：壳里解释「为什么删掉 startsWith('/')」的注释本身就含那个字面量
  const code = squeezeSource(stripComments(scriptSection(raw)));
  const mainRaw = read(MAIN);
  const template = squeezeSource(mainRaw.slice(0, mainRaw.indexOf('<script setup>')));

  it('发送按钮与菜单项都接新入口，不再直连 sendMessage', () => {
    expect(template).toContain(squeezeSource('@send="handleSend"'));
    expect(template).not.toContain(squeezeSource('@send="sendMessage"'));
    expect(template).toContain(squeezeSource('@run-slash-command="executeSlashCommand"'));
  });

  it('handleSend 是唯一的斜杠分流点，且解析只走真源', () => {
    expect(code).toContain('const handleSend = () =>');
    expect(code).toContain('parseSlashInput(inputMessage.value');
    // 壳里不许再有第二份 startsWith('/') 判断（规则散两处正是本次事故的成因）
    expect(code).not.toContain("startsWith('/')");
  });

  it('回车与菜单高亮项都汇到 executeSlashCommand', () => {
    // 菜单关着时的 Enter 走闸门
    expect(code).toContain(squeezeSource('handleSend();'));
    // 菜单开着时的 Enter 执行高亮项（prettier 会在实参开括号后断行 ⇒ 必须 flatten 两边）
    expect(flattenSource(code)).toContain(
      flattenSource('executeSlashCommand(filteredSlashCommands.value[slashActiveIndex.value]'),
    );
  });

  it('真源模块不反向依赖壳（保持纯函数）', () => {
    const moduleCode = squeezeSource(stripComments(scriptSection(read(MODULE))));
    expect(moduleCode).not.toContain('BOHAIMain');
    expect(moduleCode).not.toContain('from vue');
  });
});
