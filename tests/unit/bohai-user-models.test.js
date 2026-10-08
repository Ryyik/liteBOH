import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { squeezeSource } from '../helpers/source.js';
import {
  applyUserEndpointsPayload,
  resetUserEndpoints,
  useUserEndpoints,
  USER_MODE_PREFIX,
} from '../../src/views/BOHAI/composables/useUserEndpoints.js';

// ─────────────────────────────────────────────────────────────────────────────
// 用户自定义厂商 / 模型（BYOK，2026-10-08）
//
//   需求：「支持自定义模型厂商和模型，支持填入 Baseurl 与 apikey」
//   已确认口径：① 用户级自带 Key ② 不扣 BOH 额度 ③ 服务端加密存储 ④ 混进现有模式选择器
//
// 这条链路横跨四个地方（迁移 / EF / 引擎 / 设置页），而**每一处单独看都像是对的**：
//   · 迁移少了 revoke ⇒ 前端能直连读到密文列（RLS 无 policy 时其实也读不到，但那是靠 policy 兜）
//   · EF 少了 `eq('user_id')` ⇒ 任何登录用户能用别人的 Key 打别人的付费端点
//   · 引擎少注入 ⇒ 设置页里配好了，输入框里却找不到
//   · API 层不读服务端 body ⇒ 用户只看到「Edge Function returned a non-2xx status code」
// 所以本文件用「源码守卫 + 一条真实的状态映射断言」把这四处焊在一起。
// ─────────────────────────────────────────────────────────────────────────────

const read = (rel) => readFileSync(resolve(import.meta.dirname, '../..', rel), 'utf8');

const MIGRATION = 'supabase/migrations/2026100802_user_ai_endpoints.sql';
const EF = 'supabase/functions/api-key-vault/index.ts';
const API = 'src/utils/api/user-endpoint-api.js';
const ENGINE = 'src/views/BOHAI/composables/useChatEngine.js';
const COMPOSER = 'src/views/BOHAI/BOHAI/components/BohComposer.vue';
const SETTINGS = 'src/views/BOHAI/BOHAI/components/BohaiSettingsPanel.vue';
const MODE_RATE = 'src/views/BOHAI/utils/mode-rate-label.js';

describe('自定义模型：前端注入模式选择器（真实状态映射）', () => {
  it('厂商与模型 → 模式 / 模型 / 生成参数三张表的映射正确', () => {
    applyUserEndpointsPayload({
      endpoints: [
        {
          id: 'ep-1',
          name: '我的中转站',
          baseUrl: 'https://api.example.com/v1/chat/completions',
          keyMasked: 'sk-1****cdef',
          models: [
            {
              id: 'model-1',
              modeId: `${USER_MODE_PREFIX}model-1`,
              modelId: 'gpt-4o-mini',
              displayName: 'GPT-4o mini',
              temperature: 0.4,
              maxTokens: 2048,
            },
          ],
        },
      ],
      limits: { endpoints: 8, modelsPerEndpoint: 12 },
    });

    const { chatModes, availableModels, generationProfiles } = useUserEndpoints();
    expect(chatModes.value).toHaveLength(1);
    const mode = chatModes.value[0];
    // 模式 id 必须是 EF 认识的那种（'user:<uuid>' 前缀），否则运行时会 404
    expect(mode.id.startsWith(USER_MODE_PREFIX)).toBe(true);
    // 自带 Key 的模型不受订阅档位限制，且必须带 byok 标记 —— UI 靠它区分「免费」与「自有 Key」
    expect(mode.byok).toBe(true);
    expect(mode.minTier).toBe('free');
    expect(mode.quotaMultiplier).toBe(0);
    expect(mode.name).toBe('GPT-4o mini');
    // 引擎按 `mode.model` 反查模型表，两边必须一致
    expect(availableModels.value[0].id).toBe(mode.model);
    expect(availableModels.value[0].url).toBe('');
    expect(availableModels.value[0].apiKey).toBe('');
    expect(generationProfiles.value[mode.id]).toEqual({ temperature: 0.4, max_tokens: 2048 });

    resetUserEndpoints();
    expect(chatModes.value).toHaveLength(0);
  });

  it('空列表 / 脏数据不炸（未登录、加载失败、后端字段缺失都会走到这里）', () => {
    applyUserEndpointsPayload({});
    expect(useUserEndpoints().chatModes.value).toEqual([]);
    applyUserEndpointsPayload({ endpoints: [{ id: 'ep-x', name: 'x' }] });
    expect(useUserEndpoints().chatModes.value).toEqual([]);
    resetUserEndpoints();
  });
});

describe('自定义模型：EF 侧的四道硬约束（源码守卫）', () => {
  const ef = squeezeSource(read(EF));

  it('五个 user-endpoint-* action 齐全，且都要求登录（不是管理员）', () => {
    for (const action of [
      'user-endpoint-list',
      'user-endpoint-upsert',
      'user-endpoint-delete',
      'user-endpoint-test',
      'user-endpoint-models',
    ]) {
      expect(ef).toContain(`'${action}'`);
    }
    expect(ef).toContain("action.startsWith('user-endpoint-')");
    expect(ef).toContain('const user = await requireUser(request, client);');
    // 这两个 action 会真的向外发请求 ⇒ 必须限流，否则 EF 变免费代理
    expect(ef).toContain('user_endpoint_probe:');
  });

  it('归属校验必须在 SQL 谓词里（按 user_id 过滤），不能只信前端传来的 id', () => {
    // 每个查询都必须带 user_id 过滤；少一处就是「用别人的 Key 打别人的端点」
    expect(ef).toContain(".eq('id', modelRowId)");
    expect(ef).toContain(".eq('user_id', userId)");
    expect(ef).toContain(".eq('id', id)");
    // 归属不匹配时的错误码（前端据此提示，而不是当成网络错）
    expect(ef).toContain('USER_MODEL_NOT_FOUND');
    expect(ef).toContain('USER_ENDPOINT_NOT_FOUND');
  });

  it('BYOK 不走全局 vault 密钥，且不扣 BOH 额度', () => {
    expect(ef).toContain('const resolveChatSecret');
    expect(ef).toContain('if (policy.byok)');
    // 两处聊天函数都要经过 resolveChatSecret（否则 BYOK 会去 vault 查一个不存在的 provider）
    expect(ef.match(/await resolveChatSecret\(client, provider, purpose, policy\)/g)?.length).toBe(
      2,
    );
    // 额度：BYOK 不预约、不记账，但限流照旧（限流在 action 分支里，不在记账函数里）
    expect(ef).toContain('if (quota.byok) return;');
    expect(ef).toContain('let quota: TokenQuota = policy.byok');
  });

  it('秘密只在服务端解密，返回体只带掩码', () => {
    expect(ef).toContain('const apiKey = await decryptSecret');
    expect(ef).toContain('maskSecret(apiKeyInput)');
    expect(ef).toContain('encrypted_value: encryptedValue');
    // 列表查询不许把 encrypted_value 选出来（哪怕不返回，也没必要带进内存）
    expect(ef).not.toContain(".select('id, name, base_url, encrypted_value, masked_value, status");
  });

  it('Base URL 走与 runtime 同一套 SSRF 判据（https + 拒内网）', () => {
    expect(ef).toContain('const normalizeUserChatUrl');
    expect(ef).toContain('isPrivateOrLocalHost(parsed.hostname)');
    expect(ef).toContain("parsed.protocol !== 'https:'");
  });
});

describe('自定义模型：迁移把表锁死（源码守卫）', () => {
  const sql = read(MIGRATION);
  const flat = sql.replace(/\s+/g, ' ');

  it('两张表都开 RLS，并且撤销 anon/authenticated 的全部权限', () => {
    expect(flat).toContain('create table if not exists public.user_ai_endpoints');
    expect(flat).toContain('create table if not exists public.user_ai_models');
    expect(flat.match(/enable row level security/g)?.length).toBe(2);
    expect(flat).toContain(
      'revoke all on table public.user_ai_endpoints from anon, authenticated, public',
    );
    expect(flat).toContain(
      'revoke all on table public.user_ai_models from anon, authenticated, public',
    );
  });

  it('不建任何 RLS policy（前端永不直连，密钥从 PostgREST 出去就是事故）', () => {
    expect(flat.toLowerCase()).not.toContain('create policy');
  });

  it('Key 密文列存在，且外键级联（删厂商要带走它的模型）', () => {
    expect(flat).toContain('encrypted_value text not null');
    expect(flat).toContain('references public.user_ai_endpoints(id) on delete cascade');
    expect(flat).toContain('unique (endpoint_id, model_id)');
  });
});

describe('自定义模型：前端不许直连这两张表，且必须读回服务端错误', () => {
  it('src/ 里没有任何对 user_ai_endpoints / user_ai_models 的直连', () => {
    const api = read(API);
    expect(api).not.toContain("from('user_ai");
    // 前端只通过 Edge Function 的 action 走
    expect(api).toContain("action: 'user-endpoint-list'");
    expect(api).toContain("action: 'user-endpoint-upsert'");
    expect(api).toContain("action: 'user-endpoint-delete'");
  });

  it('API 层必须从错误响应里抠服务端文案（否则用户只看到 invoke 的通用报错）', () => {
    const api = squeezeSource(read(API));
    expect(api).toContain('readServerErrorBody');
    expect(api).toContain('error?.context');
    expect(api).toContain('serverError?.message || error.message');
  });

  it('引擎把用户模型**追加**在官方模式之后（不抢默认模式位）', () => {
    const engine = squeezeSource(read(ENGINE));
    expect(engine).toContain('officialRuntimeConfig.chatModes, ...userAiChatModes.value');
    expect(engine).toContain('watch(userAiChatModes, mergeRuntimeModelConfig)');
    // 登出要清空，否则同一台机器上的下一个账号会看到上一个人的模型
    expect(engine).toContain('resetUserEndpoints()');
  });

  it('BYOK 显示「自有 Key」而不是 0.00x（两者 quotaMultiplier 都是 0，极易混）', () => {
    // 2026-10-08：文案从「两个组件各写一份」收敛到单一真源 —— 分叉的代价是实测过的：
    // 同一个 Fast 在输入区显示「免费」、在设置页显示「1x」（设置页那份漏了免费分支）。
    // 所以断言也改成「真源里有 byok 分支 + 两个入口都引它」，而不是分别去搜字面量。
    const util = squeezeSource(read(MODE_RATE));
    expect(util).toContain("if (mode?.byok) return '自有 Key'");
    expect(squeezeSource(read(COMPOSER))).toContain('mode-rate-label.js');
    expect(squeezeSource(read(SETTINGS))).toContain('mode-rate-label.js');
  });

  it('未登录时设置页不发请求、只提示登录', () => {
    const settings = squeezeSource(read(SETTINGS));
    // ⚠️ 期望串也要过同一个归一函数：squeezeSource 会吃掉闭括号前的空格
    //    （`({ force: true })` → `({force: true})`），直接写字面量会假红。
    expect(settings).toContain(
      squeezeSource('if (isLoggedIn.value) void loadUserEndpoints({ force: true });'),
    );
    expect(settings).toContain('接入你自己的模型');
  });
});
