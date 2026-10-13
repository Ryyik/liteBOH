/**
 * ==============================================
 * 跨表同名字段的语义对照 —— 防误读的单一真源
 * ==============================================
 *
 * ── 为什么需要这个文件 ──────────────────────────────────────────────
 * 本仓库有几个**同名不同义**的字段。最典型的是 `model_id`，它在三张表里
 * 指三个完全不同的东西：
 *
 *   · freemodels.model_id            → 供应商的模型标识（上游真实模型名）
 *   · bohai_model_configs.model_id   → 外键式引用上面那个（"这个模式调哪个上游模型"）
 *   · lab_ai_model_configs.model_id  → ⚠️ 存的是 bohai_model_configs.mode_id
 *
 * 最后一条是真正的坑：**列名写着 model_id，值是 mode_id**（形如 `fast`）。
 * 它由 `supabase/migrations/2026091201_lab_model_use_bohai_modes.sql` 的
 * 语义变更引入，DB 侧已有表注释；这里是同一份语义在**前端**的声明点。
 *
 * ── 单一真源约定 ───────────────────────────────────────────────────
 * 语义的**完整说明只写在这个文件里**。读取该字段的代码（如
 * `src/views/Lab/composables/use*Generator.js`）只留一行指向本文件的注释，
 * 不再各自复述一遍 —— 改语义只改这里一处，不必动四处。
 * `tests/unit/field-semantics.test.js` 锁住「声明」与「实际读取代码」一致。
 *
 * ⚠️ 改这个文件前先读那条测试：它锁的是**语义**（例如不允许把 lab 那条改成
 *    “存 freemodels.model_id”），不是文案措辞。
 */

export const FIELD_SEMANTICS = {
  'freemodels.model_id':
    '供应商的模型标识（上游真实模型名），例：Qwen/Qwen3-8B。由平台方定义，本站不可改。',

  'bohai_model_configs.model_id':
    '引用 freemodels.model_id —— 说明「这个模式实际调用哪个上游模型」。面板上是下拉选择。',

  'bohai_model_configs.mode_id':
    '管理员自起的运行时路由键（例：fast / pro / multimodal）。api-key-vault 按它查配置；' +
    '已被 lab_ai_model_configs 或前端引用后不要改，改了要重新绑定。',

  'lab_ai_model_configs.model_id':
    '⚠️ 列名与语义不符：这里存的是 bohai_model_configs.mode_id，不是 freemodels.model_id。' +
    'Lab 侧把该值作为 mode 传给运行时，由 api-key-vault 按 bohai_model_configs 路由 provider / 模型 / 参数。',

  'lab_ai_model_configs.feature_key':
    '实验室功能键。当前 5 个：doc-formatting / ppt-generator / code-generator / ' +
    'word-generator / forum-weekly-report。',

  'lab_ai_model_configs.temperature':
    '仅前端展示参考值。运行时以 bohai_model_configs 的配置为准（PPT 生成前端还会 clamp 到 ≤0.5）。',
} as const;

export type FieldSemanticKey = keyof typeof FIELD_SEMANTICS;

/** 取某个 `table.column` 的语义说明；未登记的键返回空串（调用方自行兜底）。 */
export const describeField = (key: string): string =>
  Object.prototype.hasOwnProperty.call(FIELD_SEMANTICS, key)
    ? FIELD_SEMANTICS[key as FieldSemanticKey]
    : '';
