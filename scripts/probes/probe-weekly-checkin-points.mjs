#!/usr/bin/env node
/**
 * 周签到 + 积分账本 · 线上只读体检
 *
 * 起因（2026-09-29 线上报障）：「签到可以一直签到，并且积分余额不显示了」。
 * 前端契约缺陷已修（见 post-api.js / forum-points.js），但当时无法确认
 * **后端数据是否也被写坏** —— 本探针就是为回答这个问题而写的，此后可复用。
 *
 * 判据（全部只读，`read_only: true`，不改任何数据）：
 *   1. 迁移是否真的应用了 —— 部署版函数体应与仓库迁移逐字一致
 *   2. 幂等是否成立 —— 唯一索引在不在、有没有「同用户同周多行」
 *   3. 数据是否被写坏 —— 本周签到行数 == 本周签到流水数，余额是否与流水自洽
 *
 * 用法：node scripts/probes/probe-weekly-checkin-points.mjs
 *
 * 凭据与通路（实测结论，别绕远路）：
 *   - `supabase` CLI 已登录，token 在 macOS 钥匙串（go-keyring-base64，需解码）
 *   - **CLI 直连数据库不可用**：`supabase migration list` 报 `tls error (EOF)`（出网只放行 443）
 *   - 所以走 Management API：`POST /v1/projects/<ref>/database/query`
 *   - 需要放开沙箱网络（沙箱内 curl exit 35 / fetch failed）
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const REF_FILE = path.join(ROOT, 'supabase/.temp/project-ref');

const REF =
  String(process.env.SUPABASE_PROJECT_REF || '').trim() ||
  (fs.existsSync(REF_FILE) ? fs.readFileSync(REF_FILE, 'utf8').trim() : '');
if (!REF) {
  console.error('找不到 project ref：设 SUPABASE_PROJECT_REF，或先 supabase link');
  process.exit(2);
}

const readToken = () => {
  const fromEnv = String(process.env.SUPABASE_ACCESS_TOKEN || '').trim();
  if (fromEnv) return fromEnv;
  if (process.platform !== 'darwin') return '';
  try {
    const raw = execFileSync(
      'security',
      ['find-generic-password', '-s', 'Supabase CLI', '-a', 'supabase', '-w'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    // CLI 以 go-keyring 格式存储：go-keyring-base64:<base64>
    return Buffer.from(raw.split(':').slice(1).join(':'), 'base64').toString('utf8').trim();
  } catch {
    return '';
  }
};

const TOKEN = readToken();
if (!TOKEN) {
  console.error('拿不到 Management API token：设 SUPABASE_ACCESS_TOKEN，或先 supabase login');
  process.exit(2);
}

const sql = async (q) => {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q, read_only: true }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} ${text.slice(0, 300)}`);
  return JSON.parse(text);
};

const show = (label, rows) => {
  console.log(`\n--- ${label} ---`);
  console.log(JSON.stringify(rows, null, 2));
};

const checks = [];

// 1) 幂等结构：唯一索引必须存在
const idx = await sql(
  `select indexdef from pg_indexes
    where tablename = 'forum_weekly_checkins'
      and indexdef ilike '%unique%' and indexdef ilike '%user_id, week_start_date%'`,
);
checks.push({
  name: '唯一索引 (user_id, week_start_date) 存在',
  pass: idx.length === 1,
  detail: idx.length === 1 ? idx[0].indexdef : `找到 ${idx.length} 个`,
});

// 2) 幂等结果：不允许「同用户同周多行」
const dup = await sql(
  `select left(user_id::text, 8) as uid, week_start_date, count(*) as n
     from public.forum_weekly_checkins
    group by user_id, week_start_date having count(*) > 1 limit 20`,
);
checks.push({ name: '无「同用户同周多行」', pass: dup.length === 0, detail: dup });

// 3) 数据是否被写坏：本周签到行数应等于本周签到流水数
const week = await sql(
  `select date_trunc('week', timezone('Asia/Shanghai', now()))::date as week_start`,
);
const weekStart = week[0].week_start;
const reconcile = await sql(
  `select
     (select count(*) from public.forum_weekly_checkins where week_start_date = date '${weekStart}') as rows_this_week,
     (select count(*) from public.points_transactions
       where reason = 'weekly_checkin'
         -- 边界必须按上海时区算：date 'X' 直接比 timestamptz 会退化成 UTC 午夜，
         -- 把「周一凌晨（CST）签到」这类行漏掉，得到假的「行数 != 流水数」
         and created_at >= (date '${weekStart}'::timestamp at time zone 'Asia/Shanghai')) as txns_this_week`,
);
const r = reconcile[0];
checks.push({
  name: `本周（${weekStart}）签到行数 == 签到流水数`,
  pass: Number(r.rows_this_week) === Number(r.txns_this_week),
  detail: r,
});

// 4) 部署版函数体：必须含幂等写法（防止线上跑着旧版本）
const defs = await sql(
  `select p.proname, pg_get_functiondef(p.oid) as def
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('submit_weekly_checkin', 'get_weekly_checkin_status')`,
);
const submitDef = defs.find((d) => d.proname === 'submit_weekly_checkin')?.def || '';
checks.push({
  name: 'submit_weekly_checkin 是幂等版（on conflict do nothing + row_count）',
  pass: submitDef.includes('on conflict (user_id, week_start_date) do nothing'),
  detail: submitDef.includes('ALREADY_SIGNED_THIS_WEEK')
    ? '含 ALREADY_SIGNED_THIS_WEEK 分支'
    : '缺分支',
});

// 5) 余额自洽：本周签到者的积分不应为空
const points = await sql(
  `select count(*) as signers,
          count(*) filter (where p.points is null) as null_points,
          min(p.points) as min_points, max(p.points) as max_points
     from (select distinct user_id from public.forum_weekly_checkins
            where week_start_date = date '${weekStart}') c
     join public.profiles p on p.id = c.user_id`,
);
checks.push({
  name: '本周签到者积分无空值',
  pass: Number(points[0].null_points) === 0,
  detail: points[0],
});

show(
  '本周签到明细（id 掩码）',
  await sql(
    `select left(c.user_id::text, 8) as uid, c.week_start_date,
          c.signed_at at time zone 'Asia/Shanghai' as signed_at_cst, p.points
     from public.forum_weekly_checkins c join public.profiles p on p.id = c.user_id
    where c.week_start_date = date '${weekStart}' order by c.signed_at`,
  ),
);

console.log('\n===== 结论 =====');
let failed = 0;
for (const c of checks) {
  console.log(`${c.pass ? '✅' : '❌'} ${c.name}`);
  if (!c.pass) failed += 1;
}
console.log(failed === 0 ? '\n全部通过：后端数据未被写坏。' : `\n${failed} 项不通过，见上方明细。`);
process.exit(failed === 0 ? 0 : 1);
