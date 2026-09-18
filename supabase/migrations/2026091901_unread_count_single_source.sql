begin;

-- ============================================
-- 「未读通知数」定义收敛为单一真相源
--
-- 背景：Web Push 上线后，角标数字有两条读取路径：
--   1) 前端徽标 / 未读展示 → get_unread_notification_count(uuid)
--   2) 后台推送时把角标数塞进 payload → Edge Function（service_role）
-- 若各写一份 WHERE 条件，两处迟早会跑偏（而"两套数字"是最难查的一类 bug）。
--
-- 但现有的 get_unread_notification_count 是 security definer **且校验调用者**：
--   caller_id := auth.uid();  if caller_id is null then raise '用户未认证'
-- service_role 调用时 auth.uid() 为 NULL → 必然抛错，后台路径根本走不通。
--
-- 因此这里把计数口径抽成 boh_count_unread_notifications()：
--   · 承载唯一口径（status='unread' + archived_at is null + 排除自操作 like/comment）
--   · 不带身份校验，只授权 service_role —— 它能算任意用户，但外部拿不到
--   · get_unread_notification_count 保留原有签名与身份校验，内部改为委托调用
--     → 对前端完全是行为不变的重构
--
-- 幂等：create or replace，可重复执行。
-- ============================================

-- ------------------------------------------------------------------
-- 1) 唯一口径
-- ------------------------------------------------------------------
create or replace function public.boh_count_unread_notifications(p_recipient_id uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(1)::bigint
  from public.notifications n
  where n.recipient_id = p_recipient_id
    and n.status = 'unread'
    and n.archived_at is null
    and (
      n.sender_id is null
      or n.sender_id is distinct from p_recipient_id
      or n.type not in ('like', 'comment')
    );
$$;

comment on function public.boh_count_unread_notifications(uuid) is
  '未读通知数的唯一口径：未读 + 未归档 + 排除自己对自己的 like/comment。仅供服务端（推送角标）调用；前端请走 get_unread_notification_count。';

-- 只给 service_role：外部角色调不到，避免被拿来探测他人未读数
revoke all on function public.boh_count_unread_notifications(uuid) from public;
revoke all on function public.boh_count_unread_notifications(uuid) from anon;
revoke all on function public.boh_count_unread_notifications(uuid) from authenticated;
grant execute on function public.boh_count_unread_notifications(uuid) to service_role;

-- ------------------------------------------------------------------
-- 2) 前端入口改为委托（签名、校验、返回形状全部不变）
-- ------------------------------------------------------------------
create or replace function public.get_unread_notification_count(p_recipient_id uuid)
returns table (count bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid;
begin
  -- 参数 NULL 检查
  if p_recipient_id is null then
    raise exception 'p_recipient_id 不能为空';
  end if;

  -- 获取当前用户ID
  caller_id := auth.uid();

  -- 验证用户已认证
  if caller_id is null then
    raise exception '用户未认证';
  end if;

  -- 验证只能查询自己的未读数量
  if caller_id != p_recipient_id then
    raise exception '只能查询自己的未读通知数量';
  end if;

  -- 计数口径统一由 boh_count_unread_notifications 提供，此处不再重复写 WHERE
  return query select public.boh_count_unread_notifications(p_recipient_id);
end;
$$;

comment on function public.get_unread_notification_count(uuid) is
  '获取用户未读通知数量（带调用者校验，仅本人）。计数口径委托给 boh_count_unread_notifications。';

revoke all on function public.get_unread_notification_count(uuid) from public;
grant execute on function public.get_unread_notification_count(uuid) to authenticated;
grant execute on function public.get_unread_notification_count(uuid) to service_role;

notify pgrst, 'reload schema';

commit;
