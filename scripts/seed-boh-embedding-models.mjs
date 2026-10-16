/**
 * seed-boh-embedding-models.mjs — 把硅基流动**免费档**的嵌入/重排模型登记进「免费模型库」。
 *
 * 背景（2026-10-16，用户口径）：
 *   用户在硅基流动控制台确认免费档里有 `bge-m3` / `bge-reranker-v2-m3` / `bge-large-zh-v1.5` /
 *   `bge-large-en-v1.5`，要求「加进免费模型库」并由本会话**选定检索链路用哪个**。
 *
 * 选型结论（同时落在 `boh-ai-retrieval` 的默认值里）：
 *   · 嵌入（embedding）＝ `BAAI/bge-m3` —— 保持不动：整套 `boh_ai_knowledge_chunks` 表
 *     （vector(1024) + `embedding_model` 默认值）从建表起就是按它建的（见迁移 2026050805），
 *     换模型要全量重灌向量，无收益。
 *   · 重排（rerank）＝ `BAAI/bge-reranker-v2-m3` —— 从 `netease-youdao/bce-reranker-base_v1`
 *     升级（同为免费档、v2 多语言版更强）；bce 版保留在白名单里可用 env 切回。
 *   · `bge-large-zh-v1.5` / `bge-large-en-v1.5`：**登记但不启用**（单语、老版本，bge-m3 已覆盖；
 *     留作备选，需要时在「免费模型库」页一键启用）。
 *
 * ⚠️ 这些行**不是**聊天模型（api_base_url 分别指向 /v1/embeddings 与 /v1/rerank），
 *    只进 `freemodels` 供后台「免费模型库」查阅管理；检索管道不读这张表（选型在 EF 默认值里）。
 *
 * 幂等：`on conflict (model_id) do nothing` + `sort_order` 按当前最大值顺延 ⇒ 可重复执行。
 *
 * 用法：
 *   node scripts/seed-boh-embedding-models.mjs           # dry-run，打印将写入的行
 *   node scripts/seed-boh-embedding-models.mjs --sql     # 打印 SQL（不执行）
 *   node scripts/seed-boh-embedding-models.mjs --apply   # 通过 Management API 写入线上库
 *
 * 凭据：同 seed-boh-core-memories.mjs —— ① 环境变量 `SUPABASE_ACCESS_TOKEN`；
 *   ② macOS 钥匙串条目 `Supabase CLI`（`go-keyring-base64:` 前缀需 base64 解码）。不打印 token。
 */
import process from 'node:process';
import { execFileSync } from 'node:child_process';

const PROJECT_REF = 'nplnlefdwfgtyimfkyih';

/** 本次登记的四行。`provider`/`provider_label` 与页面上其它 SiliconFlow 行一致。 */
const MODELS = [
  {
    model_id: 'BAAI/bge-m3',
    name: 'BAAI/bge-m3（嵌入）',
    family_label: '嵌入',
    best_for: '检索向量化（RAG；1024 维、中英多语言）—— BOHAI 记忆检索在用',
    is_active: true,
    api_base_url: 'https://api.siliconflow.cn/v1/embeddings',
  },
  {
    model_id: 'BAAI/bge-reranker-v2-m3',
    name: 'BAAI/bge-reranker-v2-m3（重排）',
    family_label: '重排',
    best_for: '检索结果重排序（免费、多语言）—— BOHAI 记忆检索在用',
    is_active: true,
    api_base_url: 'https://api.siliconflow.cn/v1/rerank',
  },
  {
    model_id: 'BAAI/bge-large-zh-v1.5',
    name: 'BAAI/bge-large-zh-v1.5（嵌入）',
    family_label: '嵌入',
    best_for: '中文嵌入备选（1024 维）—— 未启用（bge-m3 已覆盖，需要时在此页启用）',
    is_active: false,
    api_base_url: 'https://api.siliconflow.cn/v1/embeddings',
  },
  {
    model_id: 'BAAI/bge-large-en-v1.5',
    name: 'BAAI/bge-large-en-v1.5（嵌入）',
    family_label: '嵌入',
    best_for: '英文嵌入备选（1024 维）—— 未启用（bge-m3 已覆盖，需要时在此页启用）',
    is_active: false,
    api_base_url: 'https://api.siliconflow.cn/v1/embeddings',
  },
];

const PROVIDER = 'siliconflow';
const PROVIDER_LABEL = 'SiliconFlow';

const args = process.argv.slice(2);
const hasFlag = (name) => args.includes(name);

const sqlEscape = (value) => String(value).replace(/'/g, "''");

/** @param {number} baseSort 当前最大 sort_order（行按 +1 起顺延） */
const buildSql = (baseSort) => {
  const values = MODELS.map((item, index) => {
    const fields = [
      `'${sqlEscape(item.model_id)}'`,
      `'${sqlEscape(item.name)}'`,
      `'${sqlEscape(item.family_label)}'`,
      `'${sqlEscape(item.best_for)}'`,
      item.is_active ? 'true' : 'false',
      String(baseSort + 1 + index),
      `'${PROVIDER}'`,
      `'${PROVIDER_LABEL}'`,
      `'${sqlEscape(item.api_base_url)}'`,
    ];
    return `  (${fields.join(', ')})`;
  });
  return [
    'insert into public.freemodels',
    '  (model_id, name, family_label, best_for, is_active, sort_order, provider, provider_label, api_base_url)',
    'values',
    values.join(',\n'),
    'on conflict (model_id) do nothing;',
  ].join('\n');
};

const resolveAccessToken = () => {
  const fromEnv = String(process.env.SUPABASE_ACCESS_TOKEN || '').trim();
  if (fromEnv) return fromEnv;
  if (process.platform !== 'darwin') return '';
  try {
    const raw = execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-w'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const base64 = raw.replace(/^go-keyring-base64:/, '');
    const decoded = raw.startsWith('go-keyring-base64:')
      ? Buffer.from(base64, 'base64').toString('utf8').trim()
      : raw;
    return decoded;
  } catch {
    return '';
  }
};

const runSql = async (token, query) => {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    },
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Management API ${response.status}: ${JSON.stringify(payload).slice(0, 400)}`);
  }
  return payload;
};

const main = async () => {
  if (hasFlag('--help') || hasFlag('-h')) {
    console.log('Usage: node scripts/seed-boh-embedding-models.mjs [--sql] [--apply]');
    process.exit(0);
  }

  if (!hasFlag('--apply')) {
    const sql = buildSql(0);
    if (hasFlag('--sql')) {
      console.log(sql);
    } else {
      console.log(
        `将写入 ${MODELS.length} 行到 public.freemodels（sort_order 按线上最大值顺延）：\n`,
      );
      for (const item of MODELS) {
        console.log(
          `· ${item.model_id}  [${item.family_label}]  active=${item.is_active}\n    ${item.best_for}\n    ${item.api_base_url}`,
        );
      }
      console.log('\n（dry-run；加 --apply 真正写入，--sql 打印 SQL）');
    }
    return;
  }

  const token = resolveAccessToken();
  if (!token) {
    console.error(
      '缺少 Management API token（设 SUPABASE_ACCESS_TOKEN 或本机 Supabase CLI 登录）。',
    );
    process.exit(1);
  }

  const maxRow = await runSql(
    token,
    'select coalesce(max(sort_order), 0)::int as max_sort from public.freemodels;',
  );
  const maxSort = Number(maxRow?.[0]?.max_sort || 0);
  console.log(
    `线上当前 max(sort_order)=${maxSort}，新行取 ${maxSort + 1}..${maxSort + MODELS.length}`,
  );

  const sql = buildSql(maxSort);
  const result = await runSql(token, sql);
  console.log('写入结果：', JSON.stringify(result).slice(0, 200));

  const verify = await runSql(
    token,
    `select model_id, name, is_active, sort_order, provider from public.freemodels
      where model_id in (${MODELS.map((m) => `'${sqlEscape(m.model_id)}'`).join(', ')})
      order by sort_order;`,
  );
  console.log('复核（读回）：');
  for (const row of verify || []) {
    console.log(
      `· ${row.model_id} | ${row.name} | active=${row.is_active} | sort=${row.sort_order} | ${row.provider}`,
    );
  }
};

main().catch((error) => {
  console.error(String(error?.message || error));
  process.exit(1);
});
