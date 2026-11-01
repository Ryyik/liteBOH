-- 2026110102: 「关注邮件」即时模式补上「摘要尾巴」—— 首条即时、其余不丢也不刷屏
--
-- 本迁移取代 2026110101（那次把即时模式改成「每条各一封」，解决了丢邮件，但丢了防刷屏）。
--
-- 站长 2026-11-01 定稿的两种投递方式（前端文案同步改）：
--   ① 及时与摘要（默认，follow_mail_digest = false）
--        窗口内第一个动作**立刻发**；同窗口其余动作**不丢也不立刻发**，
--        攒进一条 delivery='digest'、due_at=窗口结束 的「尾巴」账本，窗口结束时由 cron 汇总成一封。
--        ⇒ 一个窗口最多 2 封，且没有一条动作被丢掉。
--   ② 减少干扰（follow_mail_digest = true）
--        窗口内全部动作只发一封，窗口结束才发（旧「聚合摘要」语义，一字未改）。
--
-- 为什么必须补「尾巴」这一腿：
--   旧实现（2026102903 版）即时模式下首条立刻投递、账本行一秒后变 sent，
--   同窗口第二条既追加不到 pending 行（已经不是 pending），新建又被 dedupe_key 唯一约束吞掉
--   ⇒ 静默丢弃，一条记录都没有。实测 10-28 15:04:39（有邮件）→ 15:04:58（0 行账本），
--   10-20 10:29:43 → 10:30:05 同样。「首条即发」的文案描述的是「首条 + 其余汇总」，
--   但「其余」这条路径只在 digest 模式存在，即时模式是空着的。
--
-- 键结构（都在 dedupe_key 上，表结构不变）：
--   head  = 收件人:发件人:w<窗口桶>          ← 一个窗口一个，保证「首条」只说一次
--   tail  = 收件人:发件人:w<窗口桶>:t        ← 同窗口其余动作的汇总行
--   两者都靠 UNIQUE(dedupe_key) 保证幂等：同一个动作重复触发不会多出一行。
--
-- 已知取舍：
--   · 尾巴的延迟 = 窗口长度（默认 60 分钟）+ cron 间隔（最多 5 分钟）。
--     想让第二封更早到，改 v_window_end 的口径即可（例如 now()+10min），但会脱离「按窗口」语义。
--   · head 行刚插入、EF 还在读的几百毫秒内到达的动作一律走尾巴（不追加进 head），
--     避免和 EF 的读取产生竞争导致「追加了但邮件里没有」。
--
-- 幂等：create or replace，签名不变；只动函数体，不动表结构、不动触发器、不动权限。
-- 回滚：恢复 2026102903 版的函数体（即 2026110101 之前那版），并把前端文案改回旧词。

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
  v_head_id        uuid;
  v_head_status    text;
  v_head_delivery  text;
  v_tail_id        uuid;
  v_bucket         bigint;
  v_window_end     timestamptz;
  v_head_key       text;
  v_tail_key       text;
  v_url            text;
  v_dispatch       text;
  v_enabled        boolean;
  v_window         integer;
  v_digest         boolean;
  v_item           jsonb;
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

  v_window := greatest(coalesce(v_window, 60), 1);
  v_bucket := floor(extract(epoch from now()) / (v_window * 60)::numeric)::bigint;
  v_window_end := to_timestamp(((v_bucket + 1) * v_window * 60)::double precision);

  v_head_key := p_recipient_id::text || ':' || p_sender_id::text || ':w' || v_bucket::text;
  v_tail_key := v_head_key || ':t';

  v_item := jsonb_build_object(
    'kind', p_kind,
    'post_id', p_post_id,
    'comment_id', p_comment_id,
    'at', to_jsonb(now())
  );

  -- ── ① 找本窗口的 head 行 ──
  select id, status, delivery
    into v_head_id, v_head_status, v_head_delivery
    from public.mail_outbox
   where dedupe_key = v_head_key
   limit 1;

  if v_head_id is null then
    -- 本窗口第一个动作
    begin
      insert into public.mail_outbox (
        recipient_id, sender_id, kind, post_id, comment_id,
        dedupe_key, window_minutes, delivery, due_at
      ) values (
        p_recipient_id, p_sender_id, p_kind, p_post_id, p_comment_id,
        v_head_key, v_window,
        case when v_digest then 'digest' else 'instant' end,
        case when v_digest then v_window_end else now() + interval '1 minute' end
      )
      on conflict (dedupe_key) do nothing
      returning id into v_head_id;
    exception when others then
      return;
    end;

    -- 并发下别人先占了同一窗口：把这次动作交给那条已存在的行处理（下一轮自然走到尾巴）
    if v_head_id is null then
      return;
    end if;

    -- 减少干扰：只等窗口结束，由 cron 汇总投递
    if v_digest then
      return;
    end if;

    -- 及时与摘要：首条立刻投递（失败由 cron 按 due_at 重投）
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
        body := jsonb_build_object('action', 'send', 'outboxId', v_head_id)
      );
    exception when others then
      null;
    end;

    return;
  end if;

  -- ── ② 「减少干扰」：全窗口只一封，追加到那封待发的 head 上 ──
  if v_head_delivery = 'digest' then
    if v_head_status = 'pending' then
      begin
        update public.mail_outbox
           set extra_items = extra_items || jsonb_build_array(v_item)
         where id = v_head_id;
      exception when others then
        null;
      end;
    end if;
    -- 已投递（窗口已走完的极端竞态）就忽略，不再补发
    return;
  end if;

  -- ── ③ 「及时与摘要」且首条已发出：进摘要尾巴 ──
  -- 注：head 还是 pending（EF 正在读）时也走尾巴，避免「追加了但邮件里没有」
  select id into v_tail_id
    from public.mail_outbox
   where dedupe_key = v_tail_key
     and status = 'pending'
   limit 1;

  if v_tail_id is not null then
    begin
      update public.mail_outbox
         set extra_items = extra_items || jsonb_build_array(v_item)
       where id = v_tail_id;
    exception when others then
      null;
    end;
    return;
  end if;

  begin
    insert into public.mail_outbox (
      recipient_id, sender_id, kind, post_id, comment_id,
      dedupe_key, window_minutes, delivery, due_at
    ) values (
      p_recipient_id, p_sender_id, p_kind, p_post_id, p_comment_id,
      v_tail_key, v_window, 'digest', v_window_end
    )
    on conflict (dedupe_key) do nothing
    returning id into v_tail_id;
  exception when others then
    return;
  end;

  -- v_tail_id 为 null = 尾巴已存在（或已投递过），交给现有那一行
  return;
end;
$$;

comment on function public.boh_enqueue_follow_mail(uuid, uuid, text, uuid, uuid) is
  '关注邮件唯一入账口：开关判定 + 写 mail_outbox + 尽力投递。及时与摘要=首条即时、同窗其余进摘要尾巴（窗口末汇总一封）；减少干扰=整窗一封。所有异常都被吞掉，绝不影响业务写入。';

-- 登记迁移（与上面的 DDL 同一事务）
insert into supabase_migrations.schema_migrations (version, name)
values ('2026110102', 'follow_mail_instant_then_digest_tail')
on conflict (version) do nothing;

commit;
