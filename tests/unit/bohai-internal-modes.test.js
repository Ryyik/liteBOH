import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  MODERATION_TEXT_MODE_ID,
  MODERATION_IMAGE_MODE_ID,
  INTERNAL_MODE_PREFIX,
  excludeInternalBohaiModes,
} from '@/views/DataManagement/config/bohai-internal-modes.js';
import { squeezeSource } from '../helpers/source.js';

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
});
