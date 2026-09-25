-- ============================================================================
-- 2026092502_avatar_frame_grant.sql
--
-- 目标：让头像框支持「按人发放」（抽奖专属 / 活动限定），并修掉 limit 档位的反向语义。
--
-- 背景（实测自线上）：
--   is_avatar_frame_owned_by 原有四条来源 —— ①tier=free ②限免期内
--   ③user_avatar_frames 台账 ④订阅档位达标。其中只有 ③ 是按人，但没有任何写入口，
--   而 avatar_frames_tier_check 已允许 'limit'（注释与前端清单都写作「活动限定」）。
--
-- 缺陷（已实测确认）：
--   avatar_frame_tier_rank('limit') = -1，而任何用户的档位 rank ≥ 0，
--   于是第 ④ 条 `rank(user_tier) >= rank(frame_tier)` 恒真
--   → tier='limit' 的框对**所有人**自动解锁，与其「活动限定」的意图相反。
--   （对照实验：同一张框改成 ultra，普通用户判定为 false；改成 limit 则为 true。）
--
-- 本迁移：
--   1. 重写 is_avatar_frame_owned_by：limit 在 ③ 之后短路 return false，
--      只认台账白名单（与限免窗口），绝不按档位放开。
--      顺序保持 ①②③ 不变，因此「限免期内仍可戴」「已发放者仍可戴」不受影响。
--   2. 新增 grant_avatar_frame(p_user_id, p_frame_id, p_source)：
--      唯一合法的按人写入口（user_avatar_frames 的 RLS 只开 SELECT，客户端无法直接插）。
--      仅管理员可调；source 由调用方声明（'lottery' / 'activity' / ...），
--      与积分解锁的 'points' 区分开，便于事后审计。
-- ============================================================================

-- 1) 归属判定：limit 只认白名单
create or replace function public.is_avatar_frame_owned_by(p_user_id uuid, p_frame_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_frame_tier text;
  v_free_until date;
  v_status     text;
begin
  if p_frame_id is null or p_frame_id = '' then
    return false;
  end if;

  select f.tier, f.free_until, f.status
    into v_frame_tier, v_free_until, v_status
    from public.avatar_frames f
   where f.id = p_frame_id;

  if not found or v_status <> 'published' then
    return false;
  end if;

  -- ① 全站可戴
  if v_frame_tier = 'free' then
    return true;
  end if;

  -- ② 限时免费期内（含当日）
  if v_free_until is not null and current_date <= v_free_until then
    return true;
  end if;

  -- ③ 按人台账：积分买断 / 活动发放 / 抽奖专属
  if p_user_id is not null and exists (
    select 1 from public.user_avatar_frames uaf
     where uaf.user_id = p_user_id and uaf.frame_id = p_frame_id
  ) then
    return true;
  end if;

  -- ④ 活动限定（limit）：到此为止，只认白名单，绝不按档位放开。
  --    必须放在 ③ 之后：已发放的用户要在这一步之前就已经返回 true。
  --    修复点：rank('limit') = -1，若继续走到 ⑤，任何用户都会因 rank >= -1 而通过。
  if lower(trim(coalesce(v_frame_tier, ''))) = 'limit' then
    return false;
  end if;

  -- ⑤ 订阅档位达成
  if p_user_id is not null
     and public.avatar_frame_tier_rank(public.get_user_subscription_tier(p_user_id))
         >= public.avatar_frame_tier_rank(v_frame_tier) then
    return true;
  end if;

  return false;
end;
$$;

-- 2) 按人授予（管理员 / 服务端）
create or replace function public.grant_avatar_frame(
  p_user_id  uuid,
  p_frame_id text,
  p_source   text default 'activity'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_source text := coalesce(nullif(trim(coalesce(p_source, '')), ''), 'activity');
  v_uid    uuid := auth.uid();
begin
  -- 服务端上下文（auth.uid() 为空，如 cron / service_role）放行；否则必须是管理员
  if v_uid is not null and not public.current_user_is_admin() then
    return jsonb_build_object('ok', false, 'message', 'NOT_ADMIN');
  end if;

  if p_user_id is null then
    return jsonb_build_object('ok', false, 'message', 'MISSING_USER');
  end if;

  if p_frame_id is null or trim(p_frame_id) = '' then
    return jsonb_build_object('ok', false, 'message', 'MISSING_FRAME');
  end if;

  select f.status into v_status from public.avatar_frames f where f.id = trim(p_frame_id);
  if not found then
    return jsonb_build_object('ok', false, 'message', 'FRAME_NOT_FOUND');
  end if;
  if v_status <> 'published' then
    return jsonb_build_object('ok', false, 'message', 'FRAME_NOT_PUBLISHED');
  end if;

  if not exists (select 1 from public.profiles p where p.id = p_user_id) then
    return jsonb_build_object('ok', false, 'message', 'PROFILE_NOT_FOUND');
  end if;

  -- 幂等：已持有（积分买断或此前发放过）时不覆盖原 source，避免抹掉购买凭证
  insert into public.user_avatar_frames (user_id, frame_id, source, cost_points)
  values (p_user_id, trim(p_frame_id), v_source, 0)
  on conflict (user_id, frame_id) do nothing;

  return jsonb_build_object('ok', true, 'source', v_source);
exception
  when others then
    -- 不返回原始 sqlerrm（避免泄露结构信息），失败原因落审计由调用方日志承担
    return jsonb_build_object('ok', false, 'message', 'GRANT_FAILED');
end;
$$;

-- 授权：anon 一律不给；authenticated 可调（函数内再校验管理员）；service_role 用于服务端发放
revoke all on function public.grant_avatar_frame(uuid, text, text) from public;
revoke all on function public.grant_avatar_frame(uuid, text, text) from anon;
grant execute on function public.grant_avatar_frame(uuid, text, text) to authenticated;
grant execute on function public.grant_avatar_frame(uuid, text, text) to service_role;

notify pgrst, 'reload schema';
