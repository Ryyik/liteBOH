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
const SHELL = 'src/views/BOHAI/BOHAI/BOHAIMain.vue';
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

  it('动态模式项也能被解析（命令清单由壳传入）', () => {
    const items = buildSlashMenuItems({ chatModes: [{ id: 'think', name: 'Deep Think' }] });
    const r = parseSlashInput('/deep-think 帮我规划', { commands: items });
    expect(r.kind).toBe('command');
    expect(r.command.action).toBe('mode');
    expect(r.command.modeId).toBe('think');
    expect(r.args).toBe('帮我规划');
  });
});

describe('buildSlashMenuItems · 固定命令优先', () => {
  it('固定命令永远在列，且模式项拼在后面', () => {
    const items = buildSlashMenuItems({ chatModes: [{ id: 'pro', name: 'Pro' }] });
    // ⚠️ 不能用「action !== 'mode'」来数固定命令：固定项里的 `/model` 本身 action 就是 'mode'
    expect(items.length).toBe(BOH_SLASH_COMMANDS.length + 1);
    expect(items.slice(0, BOH_SLASH_COMMANDS.length)).toEqual(BOH_SLASH_COMMANDS);
    expect(items.at(-1)).toMatchObject({ action: 'mode', modeId: 'pro' });
  });

  it('模式名撞固定命令时跳过该模式项（否则 /stop 会有两条）', () => {
    const items = buildSlashMenuItems({
      chatModes: [
        { id: 'x', name: 'stop' },
        { id: 'y', name: 'Pro' },
      ],
    });
    const stops = items.filter((i) => i.keyword === 'stop');
    expect(stops).toHaveLength(1);
    expect(stops[0].action).toBe('stop');
    expect(items.some((i) => i.modeId === 'y')).toBe(true);
    expect(items.some((i) => i.modeId === 'x')).toBe(false);
  });

  it('缺省 chatModes 不报错', () => {
    expect(buildSlashMenuItems().length).toBe(BOH_SLASH_COMMANDS.length);
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
  const template = squeezeSource(raw.slice(0, raw.indexOf('<script setup>')));

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
