import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FIELD_SEMANTICS, describeField } from '../../src/config/field-semantics';
import { squeezeSource } from '../helpers/source.js';

// =====================================================================
// 跨表同名字段语义守卫
//
//   背景：`model_id` 在三张表里指三个东西，其中 lab_ai_model_configs.model_id
//   存的是 bohai_model_configs.mode_id（列名与语义不符）—— 这是最容易写错代码的坑。
//
//   本测试锁两件事：
//     ① 「声明」本身正确（lab 那条必须点明存的是 mode_id、且不是 freemodels.model_id）；
//     ② 「声明」与「实际读取代码」一致 —— Lab 侧 4 个 composable 确实读的是
//        同一张表的 model_id，且都指向单一真源而不是各自复述语义。
//
//   反证：把 src/config/field-semantics.ts 里 lab 那条改成
//   「存 freemodels.model_id」→ 第 1 条必红。
// =====================================================================

const root = resolve(import.meta.dirname, '../..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const LAB_COMPOSABLES = [
  'useCodeGenerator.js',
  'useDocumentAI.js',
  'usePPTGenerator.js',
  'useWordGenerator.js',
];

describe('跨表同名字段语义（model_id 三义）', () => {
  it('lab 的 model_id 点明「存的是 mode_id、不是 freemodels.model_id」', () => {
    const text = describeField('lab_ai_model_configs.model_id');
    expect(text).toBeTruthy();
    expect(text).toContain('mode_id');
    expect(text).toMatch(/不是\s*freemodels\.model_id/);
  });

  it('三个 model_id 的说明互不相同（同名不同义必须写清）', () => {
    const texts = [
      FIELD_SEMANTICS['freemodels.model_id'],
      FIELD_SEMANTICS['bohai_model_configs.model_id'],
      FIELD_SEMANTICS['lab_ai_model_configs.model_id'],
    ];
    expect(new Set(texts).size).toBe(3);
  });

  it('未登记的键返回空串（不抛错、也不假装知道）', () => {
    expect(describeField('whatever.unknown')).toBe('');
  });

  it('实验室 4 个 composable 都读同表的 model_id，并指向单一真源', () => {
    LAB_COMPOSABLES.forEach((file) => {
      const code = squeezeSource(read(`src/views/Lab/composables/${file}`));
      expect(code, file).toContain(`.from('lab_ai_model_configs')`);
      expect(code, file).toContain('model_id');
      // 语义说明只应存在于单一真源；各文件只留一行指针，不复述
      expect(code, file).toContain('src/config/field-semantics.js');
    });
  });

  it('面板的模型下拉以 bohai mode_id 作为选项值', () => {
    const vue = read('src/views/DataManagement/components/LabAiModelConfig.vue');
    expect(vue).toMatch(/:value="m\.mode_id"/);
  });

  it('DB 侧有对应注释（防止前端单方面改口径）', () => {
    const migration = read('supabase/migrations/2026091201_lab_model_use_bohai_modes.sql');
    expect(migration).toContain('model_id 存 bohai_model_configs.mode_id');
  });
});
