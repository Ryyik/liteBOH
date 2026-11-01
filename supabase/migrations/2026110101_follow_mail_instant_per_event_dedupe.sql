-- 2026110101: 「关注邮件」即时模式改为按【事件】去重
--
-- 报障（2026-11-01 站长）：关注的人评论了我的帖子 —— 站内通知有，邮件没有。
--
-- 线上实证（只读查询，2026-11-01）：
--   · 10-28 15:04:39 雨芙蕖的楼中楼回复 → mail_outbox 立刻 'sent'（有邮件）
--   · 10-28 15:04:58 雨芙蕖的顶层评论（19 秒后）→ mail_outbox **一行都没有**
--   · 10-20 10:29:43 / 10:30:05 同一对「发件人→收件人」同样是「首条有、后面没有」
--
-- 根因（旧函数体，2026102903 版）：
--   去重键 = 收件人:发件人:窗口桶（默认 60 分钟），**不含 kind、不含事件 id**；
--   即时模式建完账本行就 net.http_post 立刻投递，一秒钟后 status 变 'sent'。
--   于是同一窗口内第二条动作：
--     ① 找「pending 的同行」聚合 → 找不到（上一行已经 sent）
--     ② 新建账本行 → dedupe_key 唯一冲突 + `on conflict do nothing` → 静默 return
--   ⇒ 第 2 条及以后的动作（同一人一小时内再评论、或先发帖再评论）**永久静默丢弃**，
--     既没进邮件，也没有任何告警。
--   这不是「聚合」，是丢弃：聚合模式（digest）才真的把多条并进一封。
--
-- 修法：
--   · 即时模式（delivery = 'instant'）→ 去重键按**事件**：
--       recipient:sender:kind:comment_id(或 post_id)
--     同一事件被重复触发（触发器重入）仍然只发一封；不同事件各发一封。
--     这与设置页文案一致：「即时（首条即发）」= 每条即时，不存在「等窗口」。
--   · 聚合模式（digest）→ 保持窗口桶聚合语义不变，只把键加 `w` 前缀，
--     与旧的纯数字桶键区分开（避免升级瞬间把两种键混读成同一行）。
--
-- 30 分钟/60 分钟「同一发件人只发一封」的原意（2026102801 ④）在**聚合模式**下完整保留；
-- 即时模式下它本来就不可能成立（邮件是立即发走的），保留它只剩「丢邮件」这一个后果。
--
-- 幂等：create or replace，签名不变；只动函数体，不动表结构、不动触发器、不动权限。
-- 回滚：恢复 2026102903 版的 boh_enqueue_follow_mail（见该迁移文件）。

begin;

create or replace function public.boh_enqueue_follow_mail(
  p_recipient_id uuid,
  p_sender_id    uuid,
  p_kind         text,
  p_post_id      uuid,
  p_comment_id   uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_outbox_id    uuid;
  v_existing_id  uuid;
  v_bucket       bigint;
  v_dedupe       text;
  v_url          text;
  v_dispatch     text;
  v_enabled      boolean;
  v_window       integer;
  v_digest       boolean;
  v_delivery     text;
begin
  if p_recipient_id is null or p_sender_id is null or p_recipient_id = p_sender_id then
    return;
  end if;

  -- 收件人偏好一次取齐：开关 + 窗口 + 投递方式
  begin
    select coalesce(follow_mail_enabled, false),
           coalesce(follow_mail_window_minutes, 60),
           coalesce(follow_mail_digest, false)
      into v_enabled, v_window, v_digest
      from public.profiles
     where id = p_recipient_id;
  exception when undefined_column then
    -- 迁移未到位时退回旧行为：开关 + 固定 30 分钟 + 及时
    select coalesce(follow_mail_enabled, false) into v_enabled
      from public.profiles where id = p_recipient_id;
    v_window := 30;
    v_digest := false;
  end;

  if not coalesce(v_enabled, false) then
    return;
  end if;

  v_delivery := case when coalesce(v_digest, false) then 'digest' else 'instant' end;

  if v_delivery = 'instant' then
    -- 即时模式：按事件去重。同一封评论重复触发只发一次；不同评论各发一封。
    v_dedupe := p_recipient_id::text
             || ':' || p_sender_id::text
             || ':' || coalesce(p_kind, 'na')
             || ':' || coalesce(p_comment_id::text, p_post_id::text, 'na');
  else
    -- 聚合模式：窗口桶聚合（原语义）。`w` 前缀把新键与旧的纯数字桶键隔开。
    v_bucket := floor(extract(epoch from now()) / (coalesce(v_window, 60) * 60)::numeric)::bigint;
    v_dedupe := p_recipient_id::text || ':' || p_sender_id::text || ':w' || v_bucket::text;
  end if;

  -- ── 同键未投递行：聚合模式追加；即时模式说明是同一事件重入，直接结束 ──
  begin
    select id into v_existing_id
      from public.mail_outbox
     where dedupe_key = v_dedupe
       and status = 'pending'
     order by created_at desc
     limit 1;
  exception when others then
    null;
  end;

  if v_existing_id is not null then
    if v_delivery = 'instant' then
      return;
    end if;

    begin
      update public.mail_outbox
        set extra_items = extra_items || jsonb_build_array(
              jsonb_build_object(
                'kind', p_kind,
                'post_id', p_post_id,
                'comment_id', p_comment_id,
                'at', to_jsonb(now())
              )
            )
        where id = v_existing_id;
    exception when others then
      null;
    end;
    return;
  end if;

  -- ── 首条动作：新建账本行（窗口/投递方式是入账时刻的快照）──
  begin
    insert into public.mail_outbox (
      recipient_id, sender_id, kind, post_id, comment_id,
      dedupe_key, window_minutes, delivery,
      due_at
    ) values (
      p_recipient_id, p_sender_id, p_kind, p_post_id, p_comment_id,
      v_dedupe, coalesce(v_window, 60), v_delivery,
      now() + make_interval(mins => case
        when v_delivery = 'digest' then coalesce(v_window, 60)   -- 聚合：窗口结束才到期
        else 1                                                    -- 及时：失败后 1 分钟即可重投
      end)
    )
    on conflict (dedupe_key) do nothing
    returning id into v_outbox_id;
  exception when others then
    return;
  end;

  if v_outbox_id is null then
    return;  -- 同一事件已入账（重复触发）：不重复发
  end if;

  -- ── 即时模式：尽力立刻投递；聚合模式交给 cron 到期扫描 ──
  if v_delivery = 'digest' then
    return;
  end if;

  begin
    select decrypted_secret into v_url
      from vault.decrypted_secrets where name = 'supabase_url';
    select decrypted_secret into v_dispatch
      from vault.decrypted_secrets where name = 'push_dispatch_key';

    if v_url is null or v_dispatch is null then
      return;
    end if;

    if not exists (select 1 from pg_extension where extname = 'pg_net') then
      return;
    end if;

    perform net.http_post(
      url := rtrim(v_url, '/') || '/functions/v1/follow-mail-send',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || v_dispatch,
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object('action', 'send', 'outboxId', v_outbox_id)
    );
  exception when others then
    null;
  end;
end;
$$;

comment on function public.boh_enqueue_follow_mail(uuid, uuid, text, uuid, uuid) is
  '关注邮件唯一入账口：开关判定 + 去重 + 写 mail_outbox + 尽力立刻投递。即时模式按事件去重（每条评论一封），聚合模式按窗口桶聚合。所有异常都被吞掉。';

-- 登记迁移（与上面的 DDL 同一事务）
insert into supabase_migrations.schema_migrations (version, name)
values ('2026110101', 'follow_mail_instant_per_event_dedupe')
on conflict (version) do nothing;

commit;
