import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  MODERATION_TEXT_MODE_ID,
  MODERATION_IMAGE_MODE_ID,
  INTERNAL_MODE_PREFIX,
  excludeInternalBohaiModes,
} from '@/views/DataManagement/config/bohai-internal-modes.js';
import { squeezeSource, stripComments } from '../helpers/source.js';

// =====================================================================
// 审核专用模式 ↔ 用户侧模式列表 的隔离守卫
//
//   背景：审核的两行（moderation-text / moderation-image）与面向用户的 BOHAI 模式
//   共用 bohai_model_configs 一张表。它们该只出现在「审核模型」页，不该出现在
//   「BOHAI 模型」列表里 —— 否则管理员会看到并误改（历史上只能靠 notes 里的口头约定）。
//
//   锁三件事：
//     ① 两个审核 mode_id 都落在保留前缀下（否则排除条件会漏掉它们）；
//     ② 排除函数生成的就是「按前缀 not like」；
//     ③ 列表查询与计数查询**共用同一个函数**，且代码里不存在第二处硬编码前缀。
//
//   反证：把 excludeInternalBohaiModes 从 DataAdmin 的计数行删掉 → 第 3 条必红；
//        把 INTERNAL_MODE_PREFIX 改成 'moderation_' → 第 1 条必红。
// =====================================================================

const root = resolve(import.meta.dirname, '../..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
/** 剥掉 SQL 的 `--` 行注释：注释里会合法地复述排除条件，直接在原文上断言会「自己满足自己」。 */
const stripSqlComments = (sql) => String(sql).replace(/(^|\s)--[^\n]*/g, '$1');

describe('审核专用模式与用户侧模式列表的隔离', () => {
  it('两个审核 mode_id 都落在保留前缀下（否则排除条件会漏掉它们）', () => {
    expect(MODERATION_TEXT_MODE_ID.startsWith(INTERNAL_MODE_PREFIX)).toBe(true);
    expect(MODERATION_IMAGE_MODE_ID.startsWith(INTERNAL_MODE_PREFIX)).toBe(true);
  });

  it('excludeInternalBohaiModes 生成「按前缀 not like」的过滤', () => {
    const calls = [];
    const fakeQuery = {
      not: (...args) => {
        calls.push(args);
        return 'QUERY';
      },
    };
    expect(excludeInternalBohaiModes(fakeQuery)).toBe('QUERY');
    expect(calls).toEqual([['mode_id', 'like', `${INTERNAL_MODE_PREFIX}%`]]);
  });

  it('列表查询与计数查询共用同一个排除口径，且没有第二处硬编码前缀', () => {
    const code = squeezeSource(read('src/views/DataManagement/DataAdmin.vue'));
    expect(code).toContain(squeezeSource(`} else if (tabId === 'bohaiModels') {`));
    expect(code).toContain('excludeInternalBohaiModes(query)');
    expect(code).toContain("fetchCount('bohai_model_configs', excludeInternalBohaiModes)");
    expect(code).not.toContain(`'${INTERNAL_MODE_PREFIX}%'`);
  });

  it('写入端从单一真源取 mode_id（不再各自硬编码字面量）', () => {
    const vue = squeezeSource(
      read('src/views/DataManagement/components/ModerationModelConfig.vue'),
    );
    expect(vue).toContain('MODERATION_TEXT_MODE_ID');
    expect(vue).toContain('MODERATION_IMAGE_MODE_ID');
    expect(vue).not.toContain(`'${MODERATION_TEXT_MODE_ID}'`);
    expect(vue).not.toContain(`'${MODERATION_IMAGE_MODE_ID}'`);
  });

  // ── 2026-10-18 报障：「启用审核后，用户模式菜单里出现『审核·文本 0.1x』」─────────
  // 后台列表（上面第 3 条）排掉了不算完 —— 用户侧读的是 RPC list_public_bohai_modes，
  // 它当时只有 status='active'。审核行一启用就漏进选择器，而且 0.1x 的 gemini
  // 等于一条公开的廉价聊天通道。这里锁住两个口子。
  it('公开模式 RPC 用同一前缀排除审核行（用户侧选择器不出现审核模式）', () => {
    // 真源 = 本仓「最后一次重建该 RPC」的迁移（线上函数就是它 push 上去的）
    const dir = resolve(root, 'supabase/migrations');
    const files = readdirSync(dir)
      .filter((name) => name.endsWith('.sql'))
      .sort();
    const defining = files.filter((name) =>
      readFileSync(resolve(dir, name), 'utf8').includes('function public.list_public_bohai_modes'),
    );
    expect(defining.length).toBeGreaterThan(0);
    const latest = defining[defining.length - 1];
    const sql = stripSqlComments(readFileSync(resolve(dir, latest), 'utf8'));
    // 断言「排除条件」而不是「某个文件名」：谁重建这个函数都要带上这一条
    expect(squeezeSource(sql)).toContain(`mode_id not like '${INTERNAL_MODE_PREFIX}%'`);
  });

  it('api-key-vault 按 purpose 拦住直连伪造的审核 mode', () => {
    // 列表排掉 ≠ 调不到：mode 是请求体字段，直连 runtime-chat 仍可指定它
    const ef = stripComments(read('supabase/functions/api-key-vault/index.ts'));
    expect(ef).toContain(`mode.startsWith('${INTERNAL_MODE_PREFIX}')`);
    expect(ef).toContain('MODE_INTERNAL_ONLY');
  });
});
