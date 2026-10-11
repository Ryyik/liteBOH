/**
 * 数据管理面板必须放行 quota_multiplier = 0（免费模型）。
 *
 * 背景（2026-10-11）：线上 CHECK 约束在迁移 2026092906 已放宽到 `quota_multiplier >= 0`
 * （0 = 免费模型：billed_tokens 记 0，不扣额度也不扣积分），但数据管理面板**没有跟着改**，
 * 仍按旧口径 min 0.1 拦人 —— 保存 0 倍率模型时表单报「额度消耗倍率不能小于 0.1」。
 * 面板与 DB 两套口径 = 事实上的假限制，所以这里锁三条路径：
 *   ① 表单字段定义（tables.js 的 min）
 *   ② 表单校验器（useDataAdminValidation 按 field.min 判）
 *   ③ 保存策略（saveStrategies.js 写库前的二次校验）
 * 外加同族回归：AI 额度控制台**不能把读到的 0 抬成 1**（`||` 会把合法 0 吃掉，
 * 而 saveConfig 是全量写回，等于「打开面板再保存」就把免费模型改回 1x）。
 *
 * 反证口径：把 min 改回 0.1 / `< 0.1` / `|| 1`，本文件必须转红。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { dataConfig } from '@/views/DataManagement/config/tables.js';
import { createFieldValidator } from '@/views/DataManagement/composables/useDataAdminValidation.js';
import { SAVE_STRATEGIES } from '@/views/DataManagement/config/saveStrategies.js';
import { scriptSection, squeezeSource } from '../helpers/source.js';

const root = resolve(import.meta.dirname, '../..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const quotaField = () =>
  dataConfig.bohaiModels.fields.find((field) => field.key === 'quota_multiplier');

const makeValidator = () => {
  const fieldErrors = {};
  const editingItemRef = { value: {} };
  const validateField = createFieldValidator({
    getCurrentFields: () => dataConfig.bohaiModels.fields,
    editingItemRef,
    fieldErrors,
    getCurrentTab: () => 'bohaiModels',
    clearFieldError: (key) => {
      delete fieldErrors[key];
    },
  });
  return { validateField, fieldErrors, editingItemRef };
};

const validModel = (overrides = {}) => ({
  mode_id: 'free-demo',
  display_name: '免费演示',
  provider: 'siliconflow',
  model_id: 'Qwen/Qwen3-8B',
  capability: 'chat',
  icon: 'zap',
  temperature: 0.2,
  top_p: 0.7,
  frequency_penalty: 0,
  max_tokens: 1024,
  quota_multiplier: 1,
  sort_order: 100,
  min_tier: 'free',
  status: 'active',
  ...overrides,
});

describe('额度消耗倍率下界是 0（0 = 免费模型）', () => {
  it('表单字段定义 min 是 0，不是 0.1', () => {
    expect(quotaField().min).toBe(0);
  });

  it('表单校验器放行 0，拒绝 -1（下界仍是 0，不是无限放宽）', () => {
    const pass = makeValidator();
    pass.editingItemRef.value.quota_multiplier = 0;
    expect(pass.validateField('quota_multiplier')).toBe(true);
    expect(pass.fieldErrors.quota_multiplier).toBeUndefined();

    const fail = makeValidator();
    fail.editingItemRef.value.quota_multiplier = -1;
    expect(fail.validateField('quota_multiplier')).toBe(false);
    expect(fail.fieldErrors.quota_multiplier).toContain('不能小于 0');
  });

  it('保存策略把 0 落进 payload（之前在这里被 0.1 拦下）', async () => {
    const payload = await SAVE_STRATEGIES.bohaiModels({
      editingItem: validModel({ quota_multiplier: 0 }),
      userId: null,
      isEditing: false,
    });
    expect(payload.quota_multiplier).toBe(0);
  });

  it('保存策略仍拒绝负数与空串（空串不能静默落成 0）', async () => {
    await expect(
      SAVE_STRATEGIES.bohaiModels({
        editingItem: validModel({ quota_multiplier: -1 }),
        userId: null,
        isEditing: false,
      }),
    ).rejects.toThrow(/额度倍率/);

    await expect(
      SAVE_STRATEGIES.bohaiModels({
        editingItem: validModel({ quota_multiplier: '' }),
        userId: null,
        isEditing: false,
      }),
    ).rejects.toThrow(/额度倍率/);
  });
});

describe('AI 额度控制台不把合法的 0 抬成 1', () => {
  const consoleSource = squeezeSource(
    scriptSection(read('src/views/DataManagement/components/AiQuotaConfigConsole.vue')),
  );

  it('读回模式倍率用 `?? 1`，不用 `|| 1`', () => {
    expect(consoleSource).toContain(squeezeSource('Number(row.quota_multiplier ?? 1)'));
    expect(consoleSource).not.toContain(squeezeSource('Number(row.quota_multiplier || 1)'));
  });

  it('控制台校验器下界仍是 0（0 = 免费模型）', () => {
    expect(consoleSource).toContain(squeezeSource('Number(row.quota_multiplier) < 0'));
  });
});
