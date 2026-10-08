#!/usr/bin/env node
/**
 * mail-keepalive-ops.mjs — BOH 邮件链路保活的一体化运维脚本
 *
 * 背景：Brevo SMTP key 90 天不活跃会被回收 ⇒ 认证邮件全链路哑火。
 * 方案（2026-10-08）：mail-keepalive Edge Function + pg_cron 每月触发 + 底账表。
 *   EF：     supabase/functions/mail-keepalive/index.ts
 *   迁移：   supabase/migrations/2026100801_mail_keepalive.sql
 *
 * 子命令（可组合，按序执行）：
 *   --deploy   部署/更新 Edge Function（Management API，连 _shared 依赖一起传）
 *   --secret   写 EF secret MAIL_KEEPALIVE_RECIPIENT（upsert，幂等）
 *   --apply    应用迁移（单事务 + 手写 schema_migrations 台账 + notify pgrst，幂等）
 *   --cron     注册/替换 pg_cron 每月任务（service key 从 /secrets 读取后烘焙进命令文本，幂等）
 *   --verify   验证表/RLS/policy/revoke/cron job/台账（只读）
 *   --trigger  手动调一次 EF（真实发一封保活邮件）并查最新底账行
 *   --negative 反证：错误凭证必须 401 且底账不增行（证明鉴权有牙）
 *
 * 凭据：scripts/lib/supabase-admin-api.mjs（环境变量 → macOS 钥匙串 → .temp/project-ref）。
 * ⚠️ 脚本全程不打印完整 service key / access token（只打前 8 位指纹）。
 *
 * ⚠️ 为什么 --cron 不复用 scripts/register-forum-weekly-report-cron.sql 的
 *    app.settings.* 数据库级 GUC 方案：实测（2026-10-08）那对 GUC **从未被设置过**
 *    （pg_db_role_setting 无记录），周报 job 一直在发空 Bearer。这里改为从
 *    Management API GET /secrets 读 SUPABASE_SERVICE_ROLE_KEY 后直接烘焙进
 *    cron 命令文本 —— service key 轮换后重跑 --cron 即可。
 */
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readAccessToken, readProjectRef, runQuery } from './lib/supabase-admin-api.mjs';

const ROOT = process.cwd();
const REF = readProjectRef(ROOT);
const TOKEN = readAccessToken();
const RECIPIENT = String(process.env.MAIL_KEEPALIVE_RECIPIENT || 'ryyik1217@gmail.com').trim();
const VERSION = '2026100801';
const NAME = '2026100801_mail_keepalive';
const JOB_NAME = 'boh_mail_keepalive_monthly';
const FN_SLUG = 'mail-keepalive';
const FN_DIR = join(ROOT, 'supabase', 'functions', FN_SLUG);
const MIGRATION_FILE = join(ROOT, 'supabase', 'migrations', `${VERSION}_mail_keepalive.sql`);

const argv = process.argv.slice(2);
const WANT = (flag) => argv.includes(flag);
const passed = [];
const failed = [];
const check = (name, cond, detail = '') => {
  (cond ? passed : failed).push(name);
  console.log(`  ${cond ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

if (!REF || !TOKEN) {
  console.error(
    '[mail-keepalive] ❌ 缺少 access token / project-ref（见 supabase-admin-api.mjs 头注）。',
  );
  process.exit(2);
}

/** Management API 通用调用（/database/query 之外的端点）。body 为 FormData 时不设 Content-Type（让 fetch 生成 boundary），其余 JSON 序列化。 */
const adminApi = async (path, method = 'GET', body = null) => {
  const isForm = body instanceof FormData;
  const headers = { Authorization: `Bearer ${TOKEN}` };
  if (!isForm && body) headers['Content-Type'] = 'application/json';
  const response = await fetch(`https://api.supabase.com/v1/projects/${REF}${path}`, {
    method,
    headers,
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
    signal: AbortSignal.timeout(120_000),
  });
  const text = await response.text();
  return { ok: response.ok, status: response.status, text: text.slice(0, 1000) };
};

/**
 * ⚠️ /functions/deploy 的 **slug 是 query 参数**（OpenAPI: POST /functions/deploy?slug=...）。
 * 不传的话 server 给函数生成 UUID slug（实测踩过：slug=UUID ⇒ /functions/v1/<name> 404，
 * pg_cron 怎么发都打不到函数）。metadata.name 只是显示名。
 */
const FN_QUERY = `?slug=${FN_SLUG}`;

const sql = async (query, readOnly = true) => {
  try {
    return { ok: true, rows: await runQuery({ ref: REF, token: TOKEN, query, readOnly }) };
  } catch (e) {
    return { ok: false, error: String(e.message).slice(0, 500) };
  }
};

const fingerprint = (value) => (value ? `${String(value).slice(0, 8)}…` : '(空)');

/** 站点侧 function URL。 */
const fnUrl = () => `https://${REF}.supabase.co/functions/v1/${FN_SLUG}`;

/**
 * 从 cron job 命令文本提取保活 token —— cron 命令就是 token 的**单一真源**
 * （--cron 同时写 EF secret 与烘焙进这里，两侧必然一致）。
 * ⚠️ 不从 GET /secrets 读：实测（2026-10-08）读回值与写入值不一致（ebae62e0 ≠ 7b6dc005）。
 */
const readTokenFromCronJob = async () => {
  const r = await sql(`select command from cron.job where jobname = '${JOB_NAME}'`);
  const cmd = r.ok ? String(r.rows[0]?.command || '') : '';
  const m = cmd.match(/'Authorization',\s*'Bearer ([0-9a-f]{64})'/);
  return m ? m[1] : '';
};

// ---------------------------------------------------------------- --deploy
if (WANT('--deploy')) {
  console.log('== 部署 Edge Function ==');
  const entrypoint = readFileSync(join(FN_DIR, 'index.ts'), 'utf-8');
  const cors = readFileSync(join(FN_DIR, '..', '_shared', 'cors.ts'), 'utf-8');
  const supabaseShared = readFileSync(join(FN_DIR, '..', '_shared', 'supabase.ts'), 'utf-8');
  // ⚠️ /functions/deploy 只收 multipart/form-data（纯 JSON 报 "Invalid multipart boundary"）。
  // Management API SDK 契约：body.file（**单数字段名**，每文件一个 part）+ body.metadata（JSON 字符串）。
  // ⚠️ filename 用**相对项目根**的 slash 路径（supabase/functions/...）—— 与 Go CLI 的
  // writeForm/CreateFormFile 完全同构（apps/cli-go/pkg/function/deploy.go），服务器会剥前缀。
  const form = new FormData();
  form.append(
    'metadata',
    JSON.stringify({
      entrypoint_path: 'supabase/functions/mail-keepalive/index.ts',
      name: FN_SLUG,
      // verify_jwt=false：网关层 JWT 校验与 EF 内的 Bearer === service key 校验重复，
      // 且网关 401 连底账都不留（请求不进代码）。安全模型由 EF 内显式校验兜底，可观测。
      verify_jwt: false,
    }),
  );
  form.append(
    'file',
    new Blob([entrypoint], { type: 'text/plain' }),
    'supabase/functions/mail-keepalive/index.ts',
  );
  form.append(
    'file',
    new Blob([cors], { type: 'text/plain' }),
    'supabase/functions/_shared/cors.ts',
  );
  form.append(
    'file',
    new Blob([supabaseShared], { type: 'text/plain' }),
    'supabase/functions/_shared/supabase.ts',
  );
  const result = await adminApi(`/functions/deploy${FN_QUERY}`, 'POST', form);
  check(
    `D1 部署成功（HTTP 2xx）`,
    result.ok,
    result.ok ? '' : `HTTP ${result.status}: ${result.text}`,
  );
  if (!result.ok) {
    console.error('部署失败，后续步骤中止。');
    process.exit(2);
  }
  // 部署后核对 slug 真的落对了（防 UUID slug 复发）。
  const listFull = await fetch(`https://api.supabase.com/v1/projects/${REF}/functions`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
    signal: AbortSignal.timeout(60_000),
  });
  const fns = listFull.ok ? await listFull.json() : [];
  const fn = (Array.isArray(fns) ? fns : []).find((f) => f.slug === FN_SLUG);
  check(
    'D2 函数 slug 正确且 ACTIVE',
    Boolean(fn) && fn.status === 'ACTIVE',
    fn ? `verify_jwt=${fn.verify_jwt} version=${fn.version}` : '未找到',
  );
}

// ---------------------------------------------------------------- --secret
if (WANT('--secret')) {
  console.log('== 写 EF secret ==');
  const result = await adminApi('/secrets', 'POST', [
    { name: 'MAIL_KEEPALIVE_RECIPIENT', value: RECIPIENT },
  ]);
  check(
    'S1 MAIL_KEEPALIVE_RECIPIENT 已写入',
    result.ok,
    result.ok ? RECIPIENT : `HTTP ${result.status}: ${result.text}`,
  );
}

// ---------------------------------------------------------------- --apply
if (WANT('--apply')) {
  console.log('== 应用迁移 ==');
  const existing = await sql(
    `select version from supabase_migrations.schema_migrations where version = '${VERSION}'`,
  );
  if (!existing.ok) {
    check('A0 读台账失败', false, existing.error);
    process.exit(2);
  }
  if (existing.rows.length > 0) {
    console.log(`  ℹ️ ${VERSION} 已在 schema_migrations 中 → 跳过 apply`);
  } else {
    const statements = [
      `create table if not exists public.mail_keepalive_log (id bigint generated always as identity primary key, triggered_at timestamptz not null default now(), recipient text not null, http_status int null, response_body text null, ok boolean not null, error text null)`,
      `alter table public.mail_keepalive_log enable row level security`,
      `revoke all on public.mail_keepalive_log from anon, authenticated`,
      `create policy mail_keepalive_log_service_only on public.mail_keepalive_log for all to service_role using (true) with check (true)`,
      `cron.unschedule(同名) + cron.schedule('boh_mail_keepalive_monthly','0 1 8 * *', net.http_post → /functions/v1/mail-keepalive)`,
    ];
    const ledgerValues = statements.map((s) => `$$${s}$$`).join(',\n    ');
    const migration = readFileSync(MIGRATION_FILE, 'utf-8');
    const applyQuery = `
begin;
${migration}
insert into supabase_migrations.schema_migrations (version, name, statements)
values ('${VERSION}', '${NAME}', array[
    ${ledgerValues}
  ]);
commit;
notify pgrst, 'reload schema';`;
    const applied = await sql(applyQuery, false);
    check('A1 迁移应用成功（单事务 + 台账）', applied.ok, applied.ok ? '' : applied.error);
    if (!applied.ok) {
      console.error('应用失败，中止后续验证。');
      process.exit(2);
    }
  }
}

// ---------------------------------------------------------------- --cron
if (WANT('--cron')) {
  console.log('== 注册/替换 pg_cron 每月任务（含 token 轮换）==');
  // ⚠️ 不用 SUPABASE_SERVICE_ROLE_KEY 做调用方凭证：/secrets 返回值与 EF env 注入值
  //    指纹不一致（2026-10-08 实测 got=70783c62 want=sb_secre）。改用专用 token：
  //    脚本生成 → 写 EF secret → 烘焙进 cron 命令，单值源 = 本脚本。
  const keepaliveToken = randomBytes(32).toString('hex');
  const secretWritten = await adminApi('/secrets', 'POST', [
    { name: 'MAIL_KEEPALIVE_TOKEN', value: keepaliveToken },
  ]);
  check(
    'C0 MAIL_KEEPALIVE_TOKEN 已写入 EF secrets（轮换）',
    secretWritten.ok,
    secretWritten.ok
      ? `token=${fingerprint(keepaliveToken)}`
      : `HTTP ${secretWritten.status}: ${secretWritten.text}`,
  );
  if (!secretWritten.ok) process.exit(2);
  // secrets 更新需要几十秒传播到函数运行时。
  console.log('  … 等待 40s 让 secret 传播到函数运行时');
  await new Promise((resolve) => setTimeout(resolve, 40_000));
  const cronSql = `
begin;
-- job 不存在时本 select 返回 0 行 = 无操作（perform 只能用在 PL/pgSQL，SQL 里用 select）。
select cron.unschedule(jobid)
  from cron.job
 where jobname = '${JOB_NAME}';
select cron.schedule(
  '${JOB_NAME}',
  '0 1 8 * *', -- 每月 8 号 01:00 UTC = 北京时间 09:00
  $cmd$
  select net.http_post(
    url := 'https://${REF}.supabase.co/functions/v1/${FN_SLUG}',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ${keepaliveToken}',
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('trigger', 'pg_cron'),
    timeout_milliseconds := 20000
  );
  $cmd$
);
commit;`;
  const applied = await sql(cronSql, false);
  check('C1 cron job 已写入（幂等替换同名）', applied.ok, applied.ok ? '' : applied.error);
}

// ---------------------------------------------------------------- --verify
if (WANT('--verify')) {
  console.log('== 验证（只读）==');
  const state = await sql(`
    select
      to_regclass('public.mail_keepalive_log') is not null as table_exists,
      (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = 'mail_keepalive_log') as rls_enabled,
      (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = 'mail_keepalive_log') as policy_count,
      has_table_privilege('anon', 'public.mail_keepalive_log', 'SELECT') as anon_select,
      has_table_privilege('anon', 'public.mail_keepalive_log', 'INSERT') as anon_insert,
      has_table_privilege('authenticated', 'public.mail_keepalive_log', 'SELECT') as auth_select,
      (select count(*) from cron.job where jobname = '${JOB_NAME}' and active) as cron_jobs,
      (select schedule from cron.job where jobname = '${JOB_NAME}') as cron_schedule,
      (select count(*) from supabase_migrations.schema_migrations where version = '${VERSION}') as ledger_rows`);
  if (!state.ok) {
    check('V0 状态查询失败', false, state.error);
    process.exit(2);
  }
  const s = state.rows[0] || {};
  check('V1 底账表存在', Boolean(s.table_exists));
  check('V2 RLS 已启用', Boolean(s.rls_enabled));
  check(
    'V3 恰有一条 policy（db-advisors rls_enabled_no_policy 兼容）',
    Number(s.policy_count) === 1,
    `count=${s.policy_count}`,
  );
  check(
    'V4 anon/authenticated 零授权（匿名面为 0）',
    !s.anon_select && !s.anon_insert && !s.auth_select,
    `anon(select=${s.anon_select},insert=${s.anon_insert}) auth(select=${s.auth_select})`,
  );
  check('V5 cron job 已注册且 active', Number(s.cron_jobs) === 1, `schedule=${s.cron_schedule}`);
  check(
    'V5b 调度口径 = 每月 8 号 01:00 UTC（北京 09:00）',
    s.cron_schedule === '0 1 8 * *',
    String(s.cron_schedule),
  );
  check('V6 schema_migrations 台账有行', Number(s.ledger_rows) >= 1);

  const advisors = await sql(`
    select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and c.relname = 'mail_keepalive_log'
       and (c.relrowsecurity = false
            or not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname))`);
  check('V7 不会被 check:db-advisors 三条检查点名', advisors.ok && advisors.rows.length === 0);
}

// ---------------------------------------------------------------- --cloud-trigger
// 本机直连 {ref}.supabase.co 被间歇性阻断时（2026-10-08 实测：api.supabase.com 通、
// supabase.co 全断），用云端 pg_net 代触发：注册一次性 job 在 +2 分钟跑，轮询结果。
if (WANT('--cloud-trigger')) {
  console.log('== 云端代触发（一次性 pg_cron job，+2 分钟）==');
  const target = new Date(Date.now() + 2 * 60_000);
  const minute = target.getUTCMinutes();
  const hour = target.getUTCHours();
  const day = target.getUTCDate();
  const month = target.getUTCMonth() + 1;
  const onceName = `${JOB_NAME}_once_${day}${month}_${hour}${String(minute).padStart(2, '0')}`;
  const keepaliveToken = await readTokenFromCronJob();
  if (!keepaliveToken) {
    check('CT0 从 cron 命令文本提取 token', false, '提取不到（先跑 --cron）');
    process.exit(2);
  }
  check('CT0 从 cron 命令文本提取 token', true, `token=${fingerprint(keepaliveToken)}`);
  const onceSql = `
begin;
select cron.unschedule(jobid) from cron.job where jobname like '${JOB_NAME}_once_%';
select cron.schedule(
  '${onceName}',
  '${minute} ${hour} ${day} ${month} *', -- 一次性：UTC ${hour}:${String(minute).padStart(2, '0')} on ${month}-${day}
  $cmd$
  select net.http_post(
    url := 'https://${REF}.supabase.co/functions/v1/${FN_SLUG}',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ${keepaliveToken}',
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('trigger', 'pg_cron_once_probe'),
    timeout_milliseconds := 20000
  );
  $cmd$
);
commit;`;
  const created = await sql(onceSql, false);
  check('CT1 一次性 job 已注册', created.ok, created.ok ? `job=${onceName}` : created.error);
  if (!created.ok) process.exit(2);

  // 轮询 run_details（最多 4 分钟）。⚠️ cron.job_run_details 没有 jobname 列，须先从
  // cron.job 拿 jobid 再查（jobname 列只在 cron.job 上有）。
  let run = null;
  for (let i = 0; i < 16; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 15_000));
    const r = await sql(`select d.status, d.return_message
      from cron.job j join cron.job_run_details d on d.jobid = j.jobid
     where j.jobname = '${onceName}' order by d.runid desc limit 1`);
    run = r.ok ? r.rows[0] : null;
    console.log(
      `  … 轮询 ${i + 1}/16：${run ? `${run.status} ${run.return_message || ''}` : r.ok ? '未开始' : `查询失败: ${r.error?.slice(0, 80)}`}`,
    );
    if (run && run.status !== 'running' && run.status !== 'starting') break;
  }
  check(
    'CT2 一次性 job 执行成功',
    Boolean(run) && run.status === 'succeeded',
    run ? `${run.status} ${run.return_message || ''}` : '超时未跑',
  );

  const latest = await sql(
    'select triggered_at, recipient, http_status, response_body, ok, error from public.mail_keepalive_log order by id desc limit 1',
  );
  const row = latest.ok ? latest.rows[0] : null;
  check(
    'CT3 底账新增一行且 ok=true / http 200',
    latest.ok && Boolean(row) && row.ok === true && Number(row.http_status) === 200,
    latest.ok ? JSON.stringify(row) : latest.error,
  );

  const cleaned = await sql(
    `select cron.unschedule(jobid) from cron.job where jobname like '${JOB_NAME}_once_%'`,
    false,
  );
  check('CT4 一次性 job 已清理', cleaned.ok);
}

// ---------------------------------------------------------------- --cloud-negative
// 云端反证：一次性 job 发**错误凭证** → 预期 EF 留痕 UNAUTHORIZED_BEARER 且无 ok=true 行。
if (WANT('--cloud-negative')) {
  console.log('== 云端反证（错误凭证必须被拒）==');
  const target = new Date(Date.now() + 2 * 60_000);
  const minute = target.getUTCMinutes();
  const hour = target.getUTCHours();
  const day = target.getUTCDate();
  const month = target.getUTCMonth() + 1;
  const onceName = `boh_mail_keepalive_negative_${day}${month}_${hour}${String(minute).padStart(2, '0')}`;
  const before = await sql('select count(*)::int as n from public.mail_keepalive_log');
  const beforeCount = before.ok ? Number(before.rows[0]?.n ?? 0) : -1;
  const onceSql = `
begin;
select cron.unschedule(jobid) from cron.job where jobname like 'boh_mail_keepalive_negative_%';
select cron.schedule(
  '${onceName}',
  '${minute} ${hour} ${day} ${month} *',
  $cmd$
  select net.http_post(
    url := 'https://${REF}.supabase.co/functions/v1/${FN_SLUG}',
    headers := jsonb_build_object(
      'Authorization', 'Bearer definitely-invalid-token-for-negative-probe',
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('trigger', 'negative_probe'),
    timeout_milliseconds := 20000
  );
  $cmd$
);
commit;`;
  const created = await sql(onceSql, false);
  check('CN1 一次性反证 job 已注册', created.ok, created.ok ? `job=${onceName}` : created.error);
  if (!created.ok) process.exit(2);

  let run = null;
  for (let i = 0; i < 16; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 15_000));
    const r = await sql(`select d.status, d.return_message
      from cron.job j join cron.job_run_details d on d.jobid = j.jobid
     where j.jobname = '${onceName}' order by d.runid desc limit 1`);
    run = r.ok ? r.rows[0] : null;
    console.log(
      `  … 轮询 ${i + 1}/16：${run ? `${run.status} ${run.return_message || ''}` : r.ok ? '未开始' : `查询失败: ${r.error?.slice(0, 80)}`}`,
    );
    if (run && run.status !== 'running' && run.status !== 'starting') break;
  }
  check('CN2 一次性反证 job 执行成功', Boolean(run) && run.status === 'succeeded');

  const latest = await sql(
    `select recipient, http_status, ok, error from public.mail_keepalive_log order by id desc limit 1`,
  );
  const row = latest.ok ? latest.rows[0] : null;
  check(
    'CN3 底账留痕 UNAUTHORIZED_TOKEN（鉴权有牙）',
    latest.ok && Boolean(row) && String(row.error || '').startsWith('UNAUTHORIZED_TOKEN'),
    latest.ok ? JSON.stringify(row) : latest.error,
  );
  const after = await sql('select count(*)::int as n from public.mail_keepalive_log');
  const afterCount = after.ok ? Number(after.rows[0]?.n ?? 0) : -1;
  check(
    'CN4 反证请求未发出保活邮件（留痕行 ok=false）',
    Boolean(row) && row.ok === false,
    `before=${beforeCount} after=${afterCount}`,
  );
  const cleaned = await sql(
    `select cron.unschedule(jobid) from cron.job where jobname like 'boh_mail_keepalive_negative_%'`,
    false,
  );
  check('CN5 一次性反证 job 已清理', cleaned.ok);
}

// ---------------------------------------------------------------- --trigger
if (WANT('--trigger')) {
  console.log('== 手动触发（真实发一封保活邮件）==');
  const keepaliveToken = await readTokenFromCronJob();
  check(
    'T0 从 cron 命令文本提取 token',
    Boolean(keepaliveToken),
    `token=${fingerprint(keepaliveToken)}`,
  );
  if (!keepaliveToken) process.exit(2);

  const before = await sql('select count(*)::int as n from public.mail_keepalive_log');
  const beforeCount = before.ok ? Number(before.rows[0]?.n ?? 0) : -1;

  const response = await fetch(fnUrl(), {
    method: 'POST',
    headers: { Authorization: `Bearer ${keepaliveToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ trigger: 'manual-ops' }),
    signal: AbortSignal.timeout(30_000),
  });
  const bodyText = await response.text();
  check('T1 EF 返回 HTTP 200', response.ok, `HTTP ${response.status}: ${bodyText.slice(0, 300)}`);

  const latest = await sql(
    'select triggered_at, recipient, http_status, response_body, ok, error from public.mail_keepalive_log order by id desc limit 1',
  );
  const row = latest.ok ? latest.rows[0] : null;
  check(
    'T2 底账新增一行且 ok=true',
    latest.ok && Boolean(row) && row.ok === true && beforeCount >= 0,
    latest.ok ? JSON.stringify(row) : latest.error,
  );
  check(
    'T3 recover 调用 HTTP 200（请求已被接受，防枚举语义见 EF 头注）',
    Number(row?.http_status) === 200,
    `http_status=${row?.http_status}`,
  );
}

// ---------------------------------------------------------------- --negative
if (WANT('--negative')) {
  console.log('== 反证：错误凭证必须被拒 ==');
  const before = await sql('select count(*)::int as n from public.mail_keepalive_log');
  const beforeCount = before.ok ? Number(before.rows[0]?.n ?? 0) : null;

  const response = await fetch(fnUrl(), {
    method: 'POST',
    headers: {
      Authorization: 'Bearer definitely-invalid-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ trigger: 'negative-probe' }),
    signal: AbortSignal.timeout(30_000),
  });
  check('N1 错误凭证 → HTTP 401', response.status === 401, `HTTP ${response.status}`);
  const after = await sql('select count(*)::int as n from public.mail_keepalive_log');
  const afterCount = after.ok ? Number(after.rows[0]?.n ?? 0) : null;
  check(
    'N2 底账不增行（鉴权失败不写日志）',
    beforeCount !== null && afterCount === beforeCount,
    `before=${beforeCount} after=${afterCount}`,
  );
}

// ---------------------------------------------------------------- 汇总
if (passed.length + failed.length > 0) {
  console.log(`\n${passed.length}/${passed.length + failed.length} PASS`);
  process.exit(failed.length ? 1 : 0);
}
console.log(
  '（未选择任何子命令：--deploy / --secret / --apply / --verify / --trigger / --negative）',
);
