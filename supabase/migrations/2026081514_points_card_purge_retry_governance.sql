-- 修复 #3：points_card purge 重试治理
-- 背景（2026081509 引入的 purge 链路存在三个缺陷）：
--   a) Cloudinary 删除失败时 complete_points_card_preset_purge 无条件把行置回 'active'，
--      对无法删除的资源会无限重试；
--   b) claim_expired_points_card_presets 在认领时清空 last_purge_error，历史排障信息丢失；
--   c) Edge Function 的 complete 回调本身失败（网络异常等）时，行会永久卡在 'pending'，
--      既不能被再次认领，也不能被用户当作正常预设使用。
-- 处理：
--   - purge_state 约束扩展终态 'failed'（重试满 5 次仍失败进入终态，不再自动重试）；
--   - complete 失败分支按 purge_attempts 决定 'failed' / 'active'，错误信息照旧写入；
--   - claim 不再清空 last_purge_error，并新增超时自愈：pending 超过 10 分钟的行被回收
--     （未达重试上限的重置为 'active' 可被重新认领；已达上限的直接进入 'failed' 终态）；
--   - delete_points_card_preset 放行 'failed' 行（用户可手动清理终态失败行）；
--     use_points_card_preset 维持仅认 'active'（本迁移不改动该函数）。
begin;

-- purge_state 约束扩展 'failed' 终态（幂等：已是目标定义则跳过）
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'points_card_presets_purge_state_valid'
      and conrelid = 'public.points_card_presets'::regclass
      and pg_get_constraintdef(oid) like '%failed%'
  ) then
    null;  -- 已包含 failed，无需变更
  else
    if exists (
      select 1 from pg_constraint
      where conname = 'points_card_presets_purge_state_valid'
        and conrelid = 'public.points_card_presets'::regclass
    ) then
      alter table public.points_card_presets
        drop constraint points_card_presets_purge_state_valid;
    end if;

    alter table public.points_card_presets
      add constraint points_card_presets_purge_state_valid
      check (purge_state in ('active', 'pending', 'failed'));
  end if;
end $$;

-- 认领函数：去掉 last_purge_error 清空 + 超时自愈
create or replace function public.claim_expired_points_card_presets(p_limit integer default 50)
returns table (id uuid, image_url text, image_public_id text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED';
  end if;

  -- 自愈：complete 回调失败的行会卡在 'pending'。超过 10 分钟未完成的行回收为可重试状态；
  -- 重试次数已达上限（>=5）的直接进入 'failed' 终态，避免永久循环。
  -- （'pending' 且 purge_requested_at 为空属于异常数据，一并回收。）
  update public.points_card_presets
     set purge_state = case when purge_attempts >= 5 then 'failed' else 'active' end,
         purge_requested_at = null,
         last_purge_error = 'purge timed out'
   where purge_state = 'pending'
     and (purge_requested_at is null or purge_requested_at < now() - interval '10 minutes');

  -- 注意：不再清空 last_purge_error，保留历史错误供排障，新一轮失败会覆盖。
  return query
  with candidates as (
    select p.id
      from public.points_card_presets p
     where p.purge_state = 'active'
       and p.last_used_at < now() - interval '90 days'
       and not exists (
         select 1 from public.profiles u
          where u.id = p.user_id
            and u.points_card_skin = 'custom'
            and u.points_card_image_url = p.image_url
       )
     order by p.last_used_at asc
     limit greatest(1, least(coalesce(p_limit, 50), 100))
     for update skip locked
  )
  update public.points_card_presets p
     set purge_state = 'pending',
         purge_requested_at = now(),
         purge_attempts = p.purge_attempts + 1
    from candidates
   where p.id = candidates.id
  returning p.id, p.image_url, p.image_public_id;
end;
$$;

-- 完成回调：失败满 5 次进入 'failed' 终态，否则维持回 'active' 待重试
create or replace function public.complete_points_card_preset_purge(
  p_preset_id uuid,
  p_deleted boolean,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED';
  end if;

  if p_deleted then
    delete from public.points_card_presets
     where id = p_preset_id
       and purge_state = 'pending';
  else
    update public.points_card_presets
       set purge_state = case when purge_attempts >= 5 then 'failed' else 'active' end,
           purge_requested_at = null,
           last_purge_error = left(coalesce(p_error, 'Cloudinary 删除失败'), 1000)
     where id = p_preset_id
       and purge_state = 'pending';
  end if;
end;
$$;

-- 手动删除：放行 'failed' 终态行（用户可自行清理失败预设），其余逻辑不变
create or replace function public.delete_points_card_preset(p_preset_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_preset public.points_card_presets;
  v_is_current boolean := false;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'message', 'NOT_AUTHENTICATED');
  end if;

  select * into v_preset
    from public.points_card_presets
   where id = p_preset_id
     and user_id = v_user_id
     and purge_state in ('active', 'failed')
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'PRESET_NOT_FOUND');
  end if;

  select points_card_skin = 'custom' and points_card_image_url = v_preset.image_url
    into v_is_current
    from public.profiles
   where id = v_user_id
   for update;

  if v_is_current then
    update public.profiles
       set points_card_skin = 'blank',
           points_card_image_url = null,
           points_card_image_public_id = null
     where id = v_user_id;
  end if;

  delete from public.points_card_presets where id = v_preset.id;

  return jsonb_build_object(
    'ok', true,
    'was_current', coalesce(v_is_current, false),
    'image_url', v_preset.image_url,
    'image_public_id', v_preset.image_public_id
  );
end;
$$;

revoke all on function public.claim_expired_points_card_presets(integer) from public;
revoke all on function public.complete_points_card_preset_purge(uuid, boolean, text) from public;
revoke all on function public.delete_points_card_preset(uuid) from public;

grant execute on function public.claim_expired_points_card_presets(integer) to service_role;
grant execute on function public.complete_points_card_preset_purge(uuid, boolean, text) to service_role;
grant execute on function public.delete_points_card_preset(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
