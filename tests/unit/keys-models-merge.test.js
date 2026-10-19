import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  PROVIDER_META,
  MODEL_PLATFORM_IDS,
  TOOL_SERVICE_IDS,
} from '@/views/DataManagement/composables/useKeyVault.js';
import { scriptSection, squeezeSource, stripComments } from '../helpers/source.js';

// =====================================================================
// 「密钥与模型」合并页的守卫
//
//   合并做的事：原来的「API Key」页 + 「免费模型库」页合成一个页面
//   （左栏平台、右栏密钥与模型）。合并最大的风险是**能力悄悄丢**：
//   某条 API 调用没搬过来、某个保护（Secrets 兜底不可停用）被重写时忘掉。
//   下面这几条就是为此设的 —— 每一条对应一个「合并前的既有能力」。
//
//   反证：把 useKeyVault 里的 `if (item.readonly)` 保护删掉 → 第 3 条必红；
//        把 tabIds 里的 keys-models 换回 api-keys → 第 1 条必红。
// =====================================================================

const root = resolve(import.meta.dirname, '../..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const sq = (path) => squeezeSource(read(path));

const PAGE = 'src/views/DataManagement/components/KeysAndModels.vue';
const KEY_VAULT = 'src/views/DataManagement/composables/useKeyVault.js';
const FREEMODELS = 'src/views/DataManagement/composables/useFreemodels.js';
const FREEMODELS_API = 'src/utils/api/freemodels-api.js';

describe('密钥与模型：tab 合并的接线', () => {
  it('ai-config 的 tabIds 用 keys-models 取代了 api-keys / freemodels', () => {
    const tabs = sq('src/views/DataManagement/config/tabs.js');
    expect(tabs).toContain("{ id: 'keys-models', label: '密钥与模型'");
    // ⚠️ 按「数组项」断言，不要写 `tabIds: [ 'keys-models'` 这种字面量：
    //    prettier 会把短数组折成单行，`[` 后面是换行还是空格随格式变 ——
    //    2026-10-13 实测：提交钩子（lint-staged）格式化 tabs.js 后，原先的
    //    squeezeSource 字面量断言直接假红（多行版本 squeezed 成 `[ 'keys-models'`，
    //    单行版本是 `['keys-models'`）。按项比较对格式免疫，还更严格（顺序也被钉住）。
    const aiConfigTabIds = tabs.match(/id:\s*'ai-config'[\s\S]*?tabIds:\s*\[([^\]]*)\]/)?.[1] ?? '';
    // 2026-10-18：aiMemories（AI 沉淀记忆）与 forumMemories（论坛事实卡）归入 ai-config
    // 模块，合法新增成员，顺序随 tabs.js
    expect(aiConfigTabIds.match(/'[^']+'/g)).toEqual([
      "'keys-models'",
      "'bohaiModels'",
      "'aiMemories'",
      "'forumMemories'",
      "'ai-quota'",
      "'moderation-model'",
      "'lab-ai-model'",
    ]);
  });

  it('DataAdmin 挂上了新组件（旧页映射暂留兜底）', () => {
    const admin = sq('src/views/DataManagement/DataAdmin.vue');
    expect(admin).toContain("import KeysAndModels from './components/KeysAndModels.vue'");
    expect(admin).toContain("'keys-models': KeysAndModels");
  });

  it('旧 section 别名落到新 tab（旧书签不迷路）', () => {
    const qc = sq('src/views/DataManagement/query-config.js');
    expect(qc).toContain("'api-keys': 'keys-models'");
    expect(qc).toContain("freemodels: 'keys-models'");
    expect(qc).toContain("'keys-models'");
  });
});

describe('合并后能力没有丢', () => {
  it('密钥侧六件事都在（列 / 存 / 测 / 启停 / 删 / 发现模型）', () => {
    const src = read(KEY_VAULT);
    [
      'listApiKeys',
      'upsertApiKey',
      'testApiKey',
      'updateApiKeyStatus',
      'deleteApiKey',
      'discoverModels',
    ].forEach((fn) => expect(src, fn).toContain(fn));
  });

  it('Secrets 兜底项仍然拒绝停用（改版不能丢掉这条保护）', () => {
    expect(read(KEY_VAULT)).toContain('Secrets 兜底项不能在页面停用');
    expect(sq(PAGE)).toContain(':disabled="item.readonly"');
  });

  it('模型侧六件事都在（列 / 增 / 改 / 删 / 批量 / 查重续号）', () => {
    const api = read(FREEMODELS_API);
    [
      'listFreemodels',
      'insertFreemodel',
      'insertFreemodels',
      'updateFreemodel',
      'deleteFreemodel',
      'findExistingFreemodelIds',
      'maxFreemodelSortOrder',
    ].forEach((fn) => expect(api, fn).toContain(`export async function ${fn}`));
  });

  it('批量导入的查重与续号都保留了（防重复插入与顺序错乱）', () => {
    const comp = read(FREEMODELS);
    expect(comp).toContain('findExistingFreemodelIds');
    expect(comp).toContain('maxFreemodelSortOrder');
    expect(comp).toContain('skipped');
  });

  it('两个主入口都在：添加平台（含保存后自动拉取）与手动添加模型', () => {
    const page = read(PAGE);
    expect(page).toContain('添加平台');
    expect(page).toContain('fetchAfterSave');
    expect(page).toContain('从平台拉取');
    expect(page).toContain('手动添加');
  });

  it('自定义平台显示用户填的名字，而不是写死的枚举名「自定义」', () => {
    const page = read(PAGE);
    // custom 是一种接入方式、不是平台名 —— 用户填的 label 必须被用起来
    expect(page).toContain('const customPlatformLabel = computed');
    expect(page).toContain("if (keys.length === 1) return keys[0].label || '自定义'");
    expect(page).toMatch(/id === 'custom' \? customPlatformLabel\.value/);
  });

  it('自定义平台多于一个时说明「共用同一份模型清单」（数据模型限制要讲明白，不假装分得清）', () => {
    const page = read(PAGE);
    expect(page).toContain('它们共用同一份模型清单');
  });

  it('新页不自己定义 provider 列表（必须取自单一真源）', () => {
    const page = read(PAGE);
    expect(page).toContain('MODEL_PLATFORM_IDS');
    expect(page).toContain('TOOL_SERVICE_IDS');
    expect(page).not.toMatch(/\[\s*'siliconflow'/);
  });

  it('数据访问收口在 utils 层（组件与组合式函数不得直连表）', () => {
    // 否定断言必须先剥注释 —— 这几个文件的注释里正当地复述了 `supabase.from(...)`
    // 来交代「为什么收口」，直接在原文上断言会假红（本仓库既有纪律）。
    [PAGE, KEY_VAULT, FREEMODELS].forEach((file) => {
      const code = stripComments(scriptSection(read(file)));
      expect(code, file).not.toContain('supabase.from(');
    });
  });
});

describe('provider 元数据的单一真源', () => {
  it('分成「模型平台」与「工具服务」两组，且两组都非空', () => {
    expect(MODEL_PLATFORM_IDS.length).toBeGreaterThan(0);
    expect(TOOL_SERVICE_IDS.length).toBeGreaterThan(0);
    expect(MODEL_PLATFORM_IDS.every((id) => PROVIDER_META[id].group === 'model')).toBe(true);
    expect(TOOL_SERVICE_IDS.every((id) => PROVIDER_META[id].group === 'tool')).toBe(true);
  });

  it('工具类服务没有模型发现能力（界面不该给它们显示「该平台的模型」）', () => {
    expect(TOOL_SERVICE_IDS.every((id) => !PROVIDER_META[id].supportsDiscovery)).toBe(true);
  });

  it('每个 provider 都有默认用途与用途选项（下拉不会空）', () => {
    Object.entries(PROVIDER_META).forEach(([id, meta]) => {
      expect(meta.defaultPurpose, id).toBeTruthy();
      expect(Array.isArray(meta.purposes), id).toBe(true);
      expect(meta.purposes.length, id).toBeGreaterThan(0);
    });
  });
});

// =====================================================================
// 「一个平台的一种用途只能存一个密钥」这条契约，必须让用户看得见
//
//   背景（2026-10-12，用户报「自定义为啥不显示平台名」顺带查出来的）：
//   `api_key_vault` 的唯一键是 (provider, purpose)，EF 也是 upsert(onConflict 同键)
//   ⇒ 同一平台 + 同一用途只有一行。对预设平台这是预期行为（「替换密钥」），
//   但对 `custom` 是**静默覆盖**：用户以为在加第二个自定义网关，
//   实际把第一个的密钥和名字一起换掉了，界面还提示「已加密保存」。
//
//   反证：把 submitKey 里的 `await confirm(...)` 挪到 `vault.save` **之后** →
//        第 3 条必红；把对话框里的警示块删掉 → 第 2 条必红。
// =====================================================================

describe('「一个平台的一种用途只能一个密钥」—— 不能静默覆盖', () => {
  it('前提：api_key_vault 的唯一键仍是 (provider, purpose)（契约变了这条守卫就该重审）', () => {
    const migration = read('supabase/migrations/2026061001_api_key_vault.sql');
    expect(migration).toMatch(/unique\s*\(\s*provider\s*,\s*purpose\s*\)/);
    const ef = read('supabase/functions/api-key-vault/index.ts');
    expect(ef).toContain("onConflict: 'provider,purpose'");
  });

  it('对话框在点保存之前就点明会覆盖哪一行（不是只弹个 toast）', () => {
    const page = read(PAGE);
    expect(page).toContain('const overwrittenKey = computed');
    expect(page).toContain('data-km="overwrite-warning"');
    expect(page).toContain('这会覆盖已有的密钥');
    // 警示必须点名「被顶掉的那一行」，否则用户不知道该不该继续
    expect(page).toContain('overwrittenKey.label ||');
    expect(page).toContain('v-if="overwrittenKey"');
  });

  it('保存时才做二次确认，且确认发生在写库之前（顺序不能反）', () => {
    const script = stripComments(scriptSection(read(PAGE)));
    const start = script.indexOf('async function submitKey()');
    expect(start, '找不到 submitKey').toBeGreaterThan(-1);
    const nextFn = script.indexOf('async function', start + 10);
    const body = script.slice(start, nextFn === -1 ? undefined : nextFn);
    const confirmAt = body.indexOf('await confirm(');
    const saveAt = body.indexOf('vault.save(');
    expect(confirmAt, 'submitKey 里必须有二次确认').toBeGreaterThan(-1);
    expect(saveAt).toBeGreaterThan(confirmAt);
    // 取消（拒绝）必须能中止，不能继续往下写库
    expect(body).toContain('if (!ok) return;');
  });

  it('按钮文案跟着后果走（要覆盖时不写「保存」）', () => {
    const page = read(PAGE);
    expect(page).toContain('const keySubmitLabel = computed');
    expect(sq(PAGE)).toContain(
      squeezeSource(`if (overwrittenKey.value) return fetch ? '覆盖并拉取' : '覆盖保存';`),
    );
    expect(page).not.toContain("keyDialog.form.fetchAfterSave ? '保存并拉取' : '保存'");
  });
});
