import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FIELD_SEMANTICS, describeField } from '../../src/config/field-semantics';

// =====================================================================
// 跨表同名字段语义守卫
//
//   背景：`model_id` 在三张表里指三个东西，其中 lab_ai_model_configs.model_id
//   存的是 bohai_model_configs.mode_id（列名与语义不符）—— 这是最容易写错代码的坑。
//
//   本测试锁两件事：
//     ① 「声明」本身正确（lab 那条必须点明存的是 mode_id、且不是 freemodels.model_id）；
//     ② 「声明」与「实际读取代码」一致 —— 2026-10-19 实验室（/lab）退场后，
//        前端 4 个 composable 已删；仍在读这张表的是 generate-forum-weekly-report
//        Edge Function（feature_key='forum-weekly-report'），由它锁定同表语义。
//
//   反证：把 src/config/field-semantics.ts 里 lab 那条改成
//   「存 freemodels.model_id」→ 第 1 条必红。
// =====================================================================

const root = resolve(import.meta.dirname, '../..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

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

  it('仍读 lab_ai_model_configs 的消费方（周报 Edge Function）按同表语义取 model_id', () => {
    const fn = read('supabase/functions/generate-forum-weekly-report/index.ts');
    expect(fn).toContain(`from('lab_ai_model_configs')`);
    expect(fn).toContain('model_id');
    // EF 内注释必须复述同表语义（列名与语义不符的坑在服务端同样致命）
    expect(fn).toContain('model_id 存 bohai_model_configs.mode_id');
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
