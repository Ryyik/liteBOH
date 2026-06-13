create or replace function public.admin_apply_moderation_action(
  p_target_type text,
  p_target_id uuid,
  p_action_status text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role text := '';
  v_target_type text := lower(trim(coalesce(p_target_type, '')));
  v_rows integer := 0;
  v_forum_status text := lower(trim(coalesce(p_action_status, '')));
begin
  if v_actor_id is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED', 'message', '未登录，无法执行管理员审核操作');
  end if;

  select coalesce(role, '')
    into v_actor_role
    from public.profiles
   where id = v_actor_id
   limit 1;

  if v_actor_role <> 'admin' then
    return jsonb_build_object('ok', false, 'code', 'NOT_ADMIN', 'message', '仅管理员可执行审核操作');
  end if;

  if p_target_id is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_TARGET_ID', 'message', '目标 ID 不能为空');
  end if;

  if v_forum_status not in ('approved', 'rejected') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_STATUS', 'message', '审核状态仅支持 approved / rejected');
  end if;

  if v_target_type = 'post' then
    update public.posts
       set status = v_forum_status,
           updated_at = now()
     where id = p_target_id;
    get diagnostics v_rows = row_count;
  elsif v_target_type = 'comment' then
    update public.comments
       set status = v_forum_status
     where id = p_target_id;
    get diagnostics v_rows = row_count;
  else
    return jsonb_build_object('ok', false, 'code', 'INVALID_TARGET_TYPE', 'message', '目标类型仅支持 post / comment');
  end if;

  return jsonb_build_object(
    'ok', v_rows > 0,
    'affected', v_rows,
    'target_type', v_target_type,
    'target_id', p_target_id
  );
end;
$$;

grant execute on function public.admin_apply_moderation_action(text, uuid, text, text) to authenticated;
grant execute on function public.admin_apply_moderation_action(text, uuid, text, text) to service_role;

create or replace function public.admin_data_management_counts()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.current_user_is_admin() then
    return jsonb_build_object('ok', false, 'code', 'NOT_ADMIN');
  end if;

  return jsonb_build_object(
    'ok', true,
    'users', (select count(*) from public.profiles),
    'points', (select count(*) from public.profiles),
    'subscriptions', (select count(*) from public.user_subscriptions),
    'activeSubscriptions', (
      select count(*)
        from public.user_subscriptions
       where status = 'active'
         and expires_at > now()
    ),
    'gifts', (select count(*) from public.user_gifts),
    'forum', (select count(*) from public.posts),
    'reportedPosts', (select count(*) from public.posts where status = 'limited'),
    'reviewPosts', (select count(*) from public.posts where status ilike 'rejected'),
    'reviewComments', (select count(*) from public.comments where status ilike 'rejected'),
    'coreMemories', (select count(*) from public.boh_ai_core_memories),
    'lotteries', (select count(*) from public.lotteries),
    'lotteryEntries', (select count(*) from public.lottery_entries),
    'lotteryDrawLogs', (select count(*) from public.lottery_draw_logs),
    'lotteryJoinAttempts', (select count(*) from public.lottery_join_attempts),
    'news', (select count(*) from public.news),
    'activities', (select count(*) from public.activities),
    'products', (select count(*) from public.products)
  );
end;
$$;

revoke all on function public.admin_data_management_counts() from public;
grant execute on function public.admin_data_management_counts() to authenticated;
grant execute on function public.admin_data_management_counts() to service_role;

do $$
begin
  if to_regclass('public.moderation_jobs') is not null then
    delete from public.moderation_jobs where target_type = 'message';
  end if;
end $$;

do $$
begin
  if to_regclass('public.messages') is not null then
    drop trigger if exists trg_queue_message_moderation_job on public.messages;
    drop policy if exists messages_admin_manage on public.messages;

    if exists (
      select 1
        from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'messages'
    ) then
      alter publication supabase_realtime drop table public.messages;
    end if;
  end if;
end $$;

drop table if exists public.messages cascade;

update public.bohai_model_configs
   set status = 'disabled'
 where mode_id not in ('fast', 'pro', 'multimodal', 'plan', 'agent-cluster');

insert into public.bohai_model_configs (
  mode_id,
  display_name,
  tagline,
  description,
  provider,
  provider_label,
  model_id,
  api_url,
  capability,
  icon,
  temperature,
  top_p,
  frequency_penalty,
  max_tokens,
  status,
  sort_order
) values
  ('fast', 'Fast', '极速响应', '轻量模型，秒回', 'siliconflow', 'SiliconFlow', 'nex-agi/Nex-N2-Pro', 'https://api.siliconflow.cn/v1/chat/completions', 'chat', 'zap', 0.22, 0.74, 0.08, 1200, 'active', 10),
  ('pro', 'Pro', '质量', 'Qwen 旗舰通用', 'siliconflow', 'SiliconFlow', 'Qwen/Qwen3-8B', 'https://api.siliconflow.cn/v1/chat/completions', 'chat', 'sparkles', 0.18, 0.70, 0.06, 1800, 'active', 20),
  ('multimodal', '多模态', '图片/视频/文件', 'GLM 4.6V Flash', 'zhipu', '智谱 AI', 'glm-4.6v-flash', 'https://open.bigmodel.cn/api/paas/v4/chat/completions', 'multimodal', 'image', 0.20, 0.75, 0.06, 1800, 'active', 30),
  ('plan', 'Plan', '超级高质量', '分步推进，深度推理', 'siliconflow', 'SiliconFlow', 'deepseek-ai/DeepSeek-R1-0528-Qwen3-8B', 'https://api.siliconflow.cn/v1/chat/completions', 'plan', 'list-checks', 0.08, 0.55, 0.04, 2400, 'active', 40),
  ('agent-cluster', 'Agent', '工作', '多 Agent 并行', 'siliconflow', 'SiliconFlow', 'Qwen/Qwen3-8B', 'https://api.siliconflow.cn/v1/chat/completions', 'agent', 'users', 0.18, 0.70, 0.06, 1600, 'active', 50)
on conflict (mode_id) do update set
  display_name = excluded.display_name,
  tagline = excluded.tagline,
  description = excluded.description,
  provider = excluded.provider,
  provider_label = excluded.provider_label,
  model_id = excluded.model_id,
  api_url = excluded.api_url,
  capability = excluded.capability,
  icon = excluded.icon,
  temperature = excluded.temperature,
  top_p = excluded.top_p,
  frequency_penalty = excluded.frequency_penalty,
  max_tokens = excluded.max_tokens,
  status = excluded.status,
  sort_order = excluded.sort_order;
