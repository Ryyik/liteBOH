/**
 * mail-keepalive-policy.mjs — 邮件保活「什么时候该发、算不算健康」的**唯一判定源**
 *
 * 背景（2026-10-27 实测复盘）：
 *   旧设计 = pg_cron 每月 8 号固定发一次。上线后 19 天里 `cron.job_run_details`
 *   **一条执行记录都没有**（首次排期在 2026-11-08），底账 9 行里只有 1 行真成功。
 *   也就是说「保活到底有没有生效」这个问题，在第一个月里根本无从验证；
 *   更糟的是——若那一次失败（token 漂移 / EF 未部署 / 临时网络故障），
 *   下一次机会要等整整 30 天后，而 Brevo 的回收窗口只有 90 天。
 *
 * 现在的设计（本文件 + ops 脚本的 `--watchdog`）：
 *   把「什么时候发」从**固定日历**改成**由真实成功记录驱动**——
 *   每天巡检一次，只有「距上次成功 ≥ 21 天」才真发一封。
 *
 *   由此得到的性质：
 *     ① 自愈：某次失败不会把下次机会推到下个月，**第二天就会重试**，
 *        90 天窗口内有 ~90 次机会（旧的固定日历只有 3 次）。
 *     ② 不刷屏：健康时 21 天才发一封，一年约 17 封。
 *     ③ 可观测：连续失败会往管理员写一条 `system` 站内信
 *        （notifications 上有 `trg_notifications_enqueue_web_push` 触发器，
 *         站内信落地即自动排一条浏览器推送 —— 不依赖「邮件通」这个前提）。
 *
 * ⚠️ 为什么阈值是 21 天而不是 89 天：21 天 ≈ 90 天窗口的 1/4.3，
 *    允许连续失败 4 次（约 3 周）仍不动摇「不超 90 天不活跃」这条硬线。
 *    改这个数字必须同步改 `KEEPALIVE_STALE_DAYS` 与 ops 脚本 `--verify` 的断言。
 */

/** 距上次「成功保活」超过这么多天，就该补发一封。 */
export const KEEPALIVE_STALE_DAYS = 21;

/** 连续这么多次「真实尝试」都失败 ⇒ 给管理员发站内信告警。 */
export const KEEPALIVE_ALERT_AFTER_FAILURES = 2;

/** 每日巡检 job（自愈主通道）。 */
export const WATCHDOG_JOB_NAME = 'boh_mail_keepalive_watchdog';

/** 固定心跳 job（旧 job，保留作兜底：万一巡检 SQL 自身写坏，日历仍然会响一次）。 */
export const MONTHLY_JOB_NAME = 'boh_mail_keepalive_monthly';

/** 巡检调度：每天 01:00 UTC = 北京 09:00（沿用原月度任务的时间点，运维心智不变）。 */
export const WATCHDOG_SCHEDULE = '0 1 * * *';

/** 告警去重窗口：同一管理员 20 小时内只收一条保活告警。 */
export const ALERT_DEDUPE_HOURS = 20;

const DAY_MS = 86_400_000;

/**
 * 判定保活链路健康度。纯函数，不碰网络/数据库。
 *
 * @param {object} input
 * @param {Date|string|null} input.lastOkAt   最近一次 ok=true 的时间（无则 null）
 * @param {number} [input.recentFailures]     最近 `alertAfterFailures` 次「真实尝试」里的失败数
 * @param {Date|string} [input.now]           当前时间（测试注入）
 * @param {number} [input.staleDays]          超过多少天算过期
 * @param {number} [input.alertAfterFailures] 连续失败达到多少算红
 * @returns {{status:'never'|'stale'|'failing'|'ok', ok:boolean, ageDays:number|null, reasons:string[]}}
 *   - `never`   从未成功过（首装未跑通 / 底账被清空）
 *   - `stale`   距上次成功已超过 staleDays —— 巡检本该补发却没成功
 *   - `failing` 最近连续失败达到阈值（说明当下就是坏的，别等 age 涨上去）
 *   - `ok`      健康
 */
export const evaluateKeepaliveHealth = ({
  lastOkAt = null,
  recentFailures = 0,
  now = new Date(),
  staleDays = KEEPALIVE_STALE_DAYS,
  alertAfterFailures = KEEPALIVE_ALERT_AFTER_FAILURES,
} = {}) => {
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const okMs = lastOkAt
    ? lastOkAt instanceof Date
      ? lastOkAt.getTime()
      : new Date(lastOkAt).getTime()
    : null;
  const validOk = Number.isFinite(okMs);
  const ageDays = validOk ? (nowMs - okMs) / DAY_MS : null;
  const failures = Number(recentFailures) || 0;

  // 顺序有讲究：`never` 优先于 `failing`（从没成功过是最严重的那条），
  // `failing` 优先于 `stale`（当下坏了的处置更紧急：先修 EF/token，再谈补发）。
  if (!validOk) {
    return {
      status: 'never',
      ok: false,
      ageDays: null,
      reasons: ['底账里没有任何 ok=true 的记录（保活从未成功过）'],
    };
  }
  if (failures >= alertAfterFailures) {
    return {
      status: 'failing',
      ok: false,
      ageDays,
      reasons: [`最近 ${failures} 次真实保活尝试全部失败`],
    };
  }
  if (ageDays > staleDays) {
    return {
      status: 'stale',
      ok: false,
      ageDays,
      reasons: [`距上次成功 ${ageDays.toFixed(1)} 天，已超过 ${staleDays} 天阈值`],
    };
  }
  return { status: 'ok', ok: true, ageDays, reasons: [] };
};

/** 把「距上次成功多少天」翻译成 cron 命令里的 interval 字面量。 */
const intervalLiteral = (days) => `interval '${Number(days)} days'`;

/**
 * 生成每日巡检 cron 的**命令文本**（不含 cron.schedule 包装）。
 *
 * 两段，依次执行：
 *   ① 按需补发：`net.http_post` 只在「距上次成功 ≥ staleDays」时求值
 *      —— `select … where <cond>` 无 FROM 时，条件不成立 ⇒ 零行 ⇒ 函数根本不被调用。
 *   ② 连续失败告警：往管理员写一条 `system` 站内信（触发器会自动排浏览器推送）。
 *
 * ⚠️ 「真实尝试」用 `recipient <> ''` 区分：EF 在鉴权失败时写的是 `recipient: ''`
 *    （见 supabase/functions/mail-keepalive/index.ts 的 UNAUTHORIZED_TOKEN 分支）。
 *    半年前那种「外部扫描器拿 anon key 打端点」不算保活失败，不能把告警刷出来。
 */
export const buildWatchdogCommand = ({
  ref,
  token,
  staleDays = KEEPALIVE_STALE_DAYS,
  alertAfterFailures = KEEPALIVE_ALERT_AFTER_FAILURES,
  dedupeHours = ALERT_DEDUPE_HOURS,
} = {}) => {
  if (!ref || !token) throw new Error('buildWatchdogCommand 需要 ref 与 token');
  const n = Number(alertAfterFailures);
  return `
  -- ① 自愈补发：距上次成功 >= ${Number(staleDays)} 天才发一封
  select net.http_post(
    url := 'https://${ref}.supabase.co/functions/v1/mail-keepalive',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ${token}',
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('trigger', 'pg_cron_watchdog'),
    timeout_milliseconds := 20000
  )
  where coalesce(
          (select max(triggered_at) from public.mail_keepalive_log where ok),
          to_timestamp(0)
        ) < now() - ${intervalLiteral(staleDays)};

  -- ② 连续失败告警：管理员站内信（notifications 触发器自动排浏览器推送）
  insert into public.notifications (recipient_id, type, content, status)
  select
    p.id,
    'system',
    '【邮件保活】连续 ${n} 次保活失败，注册/找回密码邮件可能发不出去。最近错误：'
      || coalesce((
           select string_agg(coalesce(e.error, '未知'), ' | ')
             from (select error from public.mail_keepalive_log
                    where recipient <> '' order by id desc limit ${n}) e
         ), '无'),
    'unread'
  from public.profiles p
  where p.role = 'admin'
    and (
      select count(*) from (
        select ok from public.mail_keepalive_log
         where recipient <> '' order by id desc limit ${n}
      ) t where t.ok is false
    ) >= ${n}
    and not exists (
      select 1 from public.notifications n2
       where n2.recipient_id = p.id
         and n2.type = 'system'
         and n2.content like '【邮件保活】%'
         and n2.created_at > now() - interval '${Number(dedupeHours)} hours'
    );
`;
};

/** 生成「注册/替换巡检 job」的完整 SQL（幂等：先 unschedule 同名，再 schedule）。 */
export const buildWatchdogScheduleSql = ({
  ref,
  token,
  schedule = WATCHDOG_SCHEDULE,
  jobName = WATCHDOG_JOB_NAME,
  staleDays = KEEPALIVE_STALE_DAYS,
  alertAfterFailures = KEEPALIVE_ALERT_AFTER_FAILURES,
  dedupeHours = ALERT_DEDUPE_HOURS,
} = {}) => {
  const command = buildWatchdogCommand({ ref, token, staleDays, alertAfterFailures, dedupeHours });
  return `
begin;
-- job 不存在时本 select 返回 0 行 = 无操作（perform 只能用在 PL/pgSQL，SQL 里用 select）。
select cron.unschedule(jobid)
  from cron.job
 where jobname = '${jobName}';
select cron.schedule(
  '${jobName}',
  '${schedule}',
  $cmd$${command}$cmd$
);
commit;`;
};

/**
 * 从 cron job 命令文本里提取保活 token。
 * token 的**单一真源就是 cron 命令本身**（`--cron` 同时写 EF secret 与这里）。
 * ⚠️ 不从 Management API 的 GET /secrets 读：读回值与写入值指纹不一致（2026-10-08 实测）。
 */
export const extractTokenFromCommand = (command) => {
  const m = String(command || '').match(/'Authorization',\s*'Bearer ([0-9a-f]{64})'/);
  return m ? m[1] : '';
};
