/**
 * 额度消耗倍率（quota_multiplier）：下界是 0（0 = 免费模型），且**只有一个写入口**。
 *
 * ── 语义变更（2026-10-12）────────────────────────────────────────────
 * 之前有两个写入口：数据管理面板的模型表格编辑器 与「AI 额度」页。两者都写同一列，
 * 且面板保存是「整行 UPDATE」—— 在 AI 额度页改完倍率后，只要有人在面板里保存别的
 * 字段，就会把倍率覆盖回旧值。
 * 现在**唯一写入口是「AI 额度」页**（AiQuotaConfigConsole），面板只读展示。
 *
 * 本文件锁四条：
 *   ① 表单字段定义 min 是 0，不是 0.1（且现在是 disabled 只读）
 *   ② 表单校验器放行 0、拒绝 -1（字段定义本身仍不能夹 0.1）
 *   ③ **面板保存不再写该列**（编辑时 payload 不含 quota_multiplier）——
 *      这条是防双写复发的关键，改回去必红
 *   ④ 新建时给一次初值（DB 该列 NOT NULL）
 * 外加同族回归：AI 额度控制台**不能把读到的 0 抬成 1**（`||` 会把合法 0 吃掉，
 * 而 saveConfig 是全量写回，等于「打开面板再保存」就把免费模型改回 1x）。
 *
 * 背景（2026-10-11）：线上 CHECK 约束在迁移 2026092906 已放宽到 `quota_multiplier >= 0`，
 * 但数据管理面板没跟着改、仍按旧口径 min 0.1 拦人 —— 面板与 DB 两套口径 = 假限制。
 *
 * 反证口径：把 min 改回 0.1 / 让保存策略重新写 quota_multiplier / 把 `?? 1` 改成 `|| 1`，
 * 本文件必须转红。
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

  it('面板不再是倍率写入口：编辑时 payload 不含该列（防双写复发）', async () => {
    const payload = await SAVE_STRATEGIES.bohaiModels({
      editingItem: validModel({ quota_multiplier: 0 }),
      userId: null,
      isEditing: true,
    });
    expect(payload).not.toHaveProperty('quota_multiplier');
  });

  it('新建时给一次初值 1（DB 该列 NOT NULL，不能留空）', async () => {
    const payload = await SAVE_STRATEGIES.bohaiModels({
      editingItem: validModel({ quota_multiplier: 0 }),
      userId: null,
      isEditing: false,
    });
    expect(payload.quota_multiplier).toBe(1);
  });

  it('字段是只读的，且 hint 指向「AI 额度」页（唯一写入口）', () => {
    expect(quotaField().disabled).toBe(true);
    expect(String(quotaField().hint)).toContain('AI 额度');
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
