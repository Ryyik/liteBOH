-- 图片异步复审（image_recheck）+ 帖子「已编辑」时间戳
--
-- 背景（2026-10-29 线上事故）：
--   客户端图片审核是「云端优先 + 本地 nsfwjs 兜底」两级链路。云端超时/不可达时
--   无条件回退本地；而本地模型权重 2.5MB，移动端首次初始化动辄 30s 起，超时后
--   整条图片管线判失败 ⇒ **用户发不出帖**（截图：图片安全检测模型初始化超时）。
--   云端修复（CLOUD_TIMEOUT_MS 2500→6000，2fa89259）只解决了「云端根本没被等到」，
--   没解决「两级都不可用时该不该阻断发布」。
--
-- 本次产品决策（用户 2026-10-29 拍板）：
--   云端不可达 + 本地未就绪 ⇒ **放行 + 事后撤**，最坏约 6 分钟窗口。
--   站内通知必发、邮件可选（独立开关），只在 rejected 时发。
--   处置粒度是**图片级软删**（不动帖子本身），作者收到通知后可重新上传该图。
--
-- 为什么不复用 moderation_status='pending'：
--   列表查询（2026090705_forum_list_kind_filter.sql:164）与两个发帖 RPC 的返回体
--   都只认 moderation_status='approved'。若把待复审图置为 pending，图片**立刻不可见**
--   —— 与「放行后立即可见」的产品口径相反。
--   因此另立 recheck_status：moderation_status 继续表达「当前是否可见」，
--   recheck_status 表达「后台复审进度」。两者解耦，互不影响既有查询。
--
-- 破坏性说明：
--   1) 只新增列/索引/函数，放宽 forum_async_jobs.job_type 的 CHECK（超集，不改既有行）；
--   2) 不改 moderation_status 状态机，不改发帖/编辑 RPC，不改额度与 Cloud+ 同步；
--   3) 尚未 apply —— 需要人工确认后执行（见交付说明）。

begin;

-- ── 1) 图片复审状态 ─────────────────────────────────────────────────────────
-- null      = 从未进入复审（云端已给出裁决的图、历史图）
-- pending   = 待复审（客户端两级审核都没给出有效裁决，先放行）
-- approved  = 复审通过（清标记，之后不再复审）
-- rejected  = 复审拒绝（同时把 moderation_status 置 rejected ⇒ 列表不再返回）
alter table public.forum_post_images
  add column if not exists recheck_status text null;

alter table public.forum_post_images
  drop constraint if exists forum_post_images_recheck_status_check;

alter table public.forum_post_images
  add constraint forum_post_images_recheck_status_check
  check (recheck_status is null or recheck_status = any (array[
    'pending'::text,
    'approved'::text,
    'rejected'::text
  ]));

-- worker 只按 pending 捞活；部分索引避免全表扫
create index if not exists idx_forum_post_images_recheck_pending
  on public.forum_post_images (created_at)
  where recheck_status = 'pending';

comment on column public.forum_post_images.recheck_status is
  '后台异步复审进度：pending=待复审（已放行可见）|approved=复审通过|rejected=复审拒绝（已软删）。null=未进入复审。';

-- ── 2) 帖子「已编辑」时间 ───────────────────────────────────────────────────
-- 与 updated_at 分开：updated_at 会被状态流转/统计类更新污染，编辑标记必须只由
-- 「作者保存内容」写入，否则会到处冒出「已编辑」。
alter table public.posts
  add column if not exists edited_at timestamptz null;

comment on column public.posts.edited_at is
  '作者最近一次保存正文/标题/图片的时间；null=从未编辑。界面据此显示「已编辑 · 时间」。';

-- ── 2b) 审核结果邮件开关（独立于关注邮件）──────────────────────────────────
-- 为什么不复用 follow_mail_enabled：两者语义完全不同（一个是社交动态摘要，
-- 一个是「你的内容被处置了」这类账号级通知）。混在一个开关里，用户想收处置
-- 通知就只能连关注摘要一起收，等于逼他关掉两者之一。
alter table public.profiles
  add column if not exists moderation_mail_enabled boolean not null default false;

comment on column public.profiles.moderation_mail_enabled is
  '是否接收「图片审核未通过」的邮件通知。默认关闭，与 follow_mail_enabled 相互独立。';

-- 列级 UPDATE 授权（profiles 收窄敏感列后必须显式补，见 2026102901_grant_follow_mail_enabled_update.sql）
grant update (moderation_mail_enabled) on table public.profiles to authenticated;

-- ── 3) 异步任务类型放宽（超集）─────────────────────────────────────────────
alter table public.forum_async_jobs
  drop constraint if exists forum_async_jobs_job_type_check;

alter table public.forum_async_jobs
  add constraint forum_async_jobs_job_type_check
  check (job_type = any (array[
    'post_moderation'::text,
    'image_recheck'::text
  ]));

-- ── 4) 标记图片待复审（发布/编辑成功后由客户端调用）────────────────────────
-- 为什么不塞进 create_forum_post_with_images：
--   那两个函数以线上 pg_get_functiondef 为基线维护，体量大（各 300+ 行）；
--   为了一个附加标记去重写它们，风险远大于收益。这里用独立函数做最小侵入。
create or replace function public.mark_forum_images_pending_recheck(
  p_post_id uuid,
  p_public_ids text[] default '{}'::text[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_admin boolean;
  v_author uuid;
  v_count integer := 0;
begin
  if v_user_id is null then
    raise exception using errcode = 'P0001', message = 'NOT_AUTHENTICATED:请先登录';
  end if;

  select author_id into v_author from public.posts where id = p_post_id;
  if v_author is null then
    raise exception using errcode = 'P0001', message = 'POST_NOT_FOUND:帖子不存在';
  end if;

  select public.current_user_is_admin() into v_is_admin;
  if v_author <> v_user_id and not coalesce(v_is_admin, false) then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN:没有权限标记此帖子的图片';
  end if;

  -- 只标记本帖的、当前仍可见的图；已 rejected 的不再进复审队列
  update public.forum_post_images
     set recheck_status = 'pending'
   where post_id = p_post_id
     and moderation_status = 'approved'
     and recheck_status is null
     and (
       coalesce(array_length(p_public_ids, 1), 0) = 0
       or public_id = any (p_public_ids)
     );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.mark_forum_images_pending_recheck(uuid, text[]) from public, anon;
grant execute on function public.mark_forum_images_pending_recheck(uuid, text[]) to authenticated;

-- ── 5) 入队图片复审 ────────────────────────────────────────────────────────
-- 与 enqueue_forum_post_moderation 同构，差别只有 job_type 和延迟：
--   发布成功后等 30s 再跑（给「刚发布就删图」留出窗口，避免复审已不存在的图）。
create or replace function public.enqueue_forum_image_recheck(
  p_post_id uuid,
  p_delay_seconds integer default 30
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_job_id uuid;
  v_delay integer := greatest(0, least(coalesce(p_delay_seconds, 30), 3600));
begin
  if v_user_id is null then
    raise exception using errcode = 'P0001', message = 'NOT_AUTHENTICATED:请先登录';
  end if;

  if not exists (
    select 1 from public.posts p
     where p.id = p_post_id and p.author_id = v_user_id
  ) then
    raise exception using errcode = 'P0001', message = 'FORUM_JOB_FORBIDDEN:没有权限处理此帖子';
  end if;

  insert into public.forum_async_jobs (job_type, post_id, user_id, run_after, max_attempts)
  values ('image_recheck', p_post_id, v_user_id, now() + make_interval(secs => v_delay), 4)
  on conflict (job_type, post_id) where status not in ('canceled')
  do update set
    -- 与 post_moderation 同款坑：已 succeeded/failed 的 job 必须重置回 pending，
    -- 否则编辑后新增的图永远不会被复审（claim 只取 pending/running）。
    status = 'pending',
    attempt_count = 0,
    last_error = null,
    completed_at = null,
    updated_at = now(),
    run_after = least(forum_async_jobs.run_after, now() + make_interval(secs => v_delay))
  returning id into v_job_id;

  return v_job_id;
end;
$$;

revoke all on function public.enqueue_forum_image_recheck(uuid, integer) from public, anon;
grant execute on function public.enqueue_forum_image_recheck(uuid, integer) to authenticated;

-- ── 6) 复审裁决落库（worker 专用，service_role）────────────────────────────
-- 单独做成函数而不是让 worker 直接 update，是为了把「拒绝时必须同时软删」
-- 这条不变量锁在数据库里 —— worker 少写一句就漏一张图的窗口不存在。
create or replace function public.apply_forum_image_recheck_verdict(
  p_image_id uuid,
  p_verdict text,
  p_score numeric default null,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_verdict text := lower(trim(coalesce(p_verdict, '')));
begin
  if v_verdict not in ('approved', 'rejected') then
    raise exception using errcode = 'P0001', message = 'INVALID_VERDICT:裁决值非法';
  end if;

  update public.forum_post_images
     set recheck_status = v_verdict,
         moderation_status = case when v_verdict = 'rejected' then 'rejected' else moderation_status end,
         moderation_score = coalesce(p_score, moderation_score),
         moderation_reason = left(coalesce(p_reason, moderation_reason), 160)
   where id = p_image_id
     and recheck_status = 'pending';

  return found;
end;
$$;

revoke all on function public.apply_forum_image_recheck_verdict(uuid, text, numeric, text)
  from public, anon, authenticated;
grant execute on function public.apply_forum_image_recheck_verdict(uuid, text, numeric, text)
  to service_role;

commit;

notify pgrst, 'reload schema';
