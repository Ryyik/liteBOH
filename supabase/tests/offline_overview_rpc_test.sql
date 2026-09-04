-- offline_overview_rpc_test.sql
-- get_offline_overview 真实数据调用测试
-- 用法：supabase db query --linked -f supabase/tests/offline_overview_rpc_test.sql
-- 特性：整体包在一个事务里，结束时 ROLLBACK —— 临时插入的测试帖子和新闻不落库，可反复执行。
-- 依赖：线上已应用 2026090301_offline_overview.sql

begin;

-- ---------------------------------------------------------------
-- 临时测试数据（事务内可见，回滚即消失）
-- 1) 一条"刚刚发布"的新闻：验证新闻通路 + 立即出现在锚点后的结果里
-- 2) 一条"刚刚发布"但未审核的帖子：验证 status='approved' 过滤不会泄漏
-- ---------------------------------------------------------------
insert into public.news (id, category, title, excerpt, date, author, content)
values (999901, 'update', '测试-离线概览-临时新闻', '这是一条用于集成测试的临时新闻摘要', current_date, '方块之家', '测试内容');

insert into public.posts (content, author_id, author_username, status, title, tag)
values ('测试内容：未审核帖子不应出现在离线概览中',
        '82de6acb-fb26-4da0-a223-df1bf0b09a4b', 'EGGY', 'pending', '测试-未审核帖', 'daily');

-- 结果登记表（最终一次性输出）
create temp table tr (ord serial, test text, pass boolean, expected text, actual text, note text);
grant all on tr to authenticated;

-- ---------------------------------------------------------------
-- 切换到 authenticated 角色（复刻真实调用路径：RLS 全程生效）
-- ---------------------------------------------------------------
select set_config('role', 'authenticated', true);

-- T0：未登录（auth.uid() 为空）必须抛异常
select set_config('request.jwt.claims', '{}', true);
do $$
declare v_err text;
begin
  begin
    perform public.get_offline_overview(p_limit => 5);
    v_err := '未抛出异常';
  exception when others then
    v_err := sqlerrm;
  end;
  insert into tr (test, pass, expected, actual, note)
  values ('T0 未登录拒绝',
          v_err like '%概览需要登录后使用%',
          '抛出异常：概览需要登录后使用',
          v_err, '');
end $$;

-- ---------------------------------------------------------------
-- 以 admin 身份测试（真实用户，last_active_at = 2026-06-22，离线约 74 天）
-- ---------------------------------------------------------------
select set_config('request.jwt.claims',
  json_build_object('sub', '0df7d756-1146-4d20-b1ed-f78aa7d76310', 'role', 'authenticated')::text, true);

-- T1：不传锚点 → 回退 profiles.last_active_at，只统计锚点后的已批准帖 + 新闻
create temp table r1 as select public.get_offline_overview(p_limit => 50) as res;
insert into tr (test, pass, expected, actual, note)
select 'T1 锚点回退(profile)',
       (r.res->>'total')::int = b.exp_total
       and r.res->>'anchor_source' = 'profile'
       and (r.res->>'is_first_login')::boolean = false
       and jsonb_array_length(r.res->'items') = b.exp_total,
       format('%s 条（已批准帖 + 临时新闻，未审核帖不计入）', b.exp_total),
       format('%s 条, src=%s, items=%s', r.res->>'total', r.res->>'anchor_source', jsonb_array_length(r.res->'items')),
       format('锚点=%s', r.res->>'anchor')
from r1 r,
     (select (select count(*) from public.posts where status = 'approved' and created_at > p.last_active_at)
           + (select count(*) from public.news where created_at > p.last_active_at) as exp_total
      from public.profiles p where p.id = '0df7d756-1146-4d20-b1ed-f78aa7d76310') b;

-- T2：锚点=24小时前 → 只应有临时新闻 1 条（未审核帖虽在窗口内但被状态过滤排除）
create temp table r2 as
select public.get_offline_overview(p_anchor => now() - interval '1 day', p_limit => 50) as res;
insert into tr (test, pass, expected, actual, note)
select 'T2 近1天锚点+状态过滤',
       (r.res->>'total')::int = 1
       and jsonb_array_length(r.res->'items') = 1
       and r.res->'items'->0->>'type' = 'news'
       and r.res->'items'->0->>'id' = '999901'
       and (r.res->>'has_more')::boolean = false,
       '1 条临时新闻（pending 帖被排除）',
       format('%s 条, 首项 type=%s id=%s',
              r.res->>'total', r.res->'items'->0->>'type', r.res->'items'->0->>'id'),
       '若为 2 条说明未审核帖泄漏';

-- T3：锚点=30天前 → 30天内已批准帖 + 临时新闻，混排倒序，新闻为最新项
create temp table r3 as
select public.get_offline_overview(p_anchor => now() - interval '30 days', p_limit => 50) as res;
insert into tr (test, pass, expected, actual, note)
select 'T3 30天窗口混排',
       (r.res->>'total')::int = b.exp_total
       and r.res->'items'->0->>'id' = '999901',
       format('%s 条，首项为临时新闻', b.exp_total),
       format('%s 条, 首项 type=%s', r.res->>'total', r.res->'items'->0->>'type'),
       format('has_more=%s', r.res->>'has_more')
from r3 r,
     (select (select count(*) from public.posts where status = 'approved' and created_at > now() - interval '30 days')
           + (select count(*) from public.news where created_at > now() - interval '30 days') as exp_total) b;

-- T4：锚点=200天前 → 钳制到90天，src=clamped
create temp table r4 as
select public.get_offline_overview(p_anchor => now() - interval '200 days', p_limit => 50) as res;
insert into tr (test, pass, expected, actual, note)
select 'T4 90天上限钳制',
       r.res->>'anchor_source' = 'clamped'
       and (r.res->>'total')::int = b.exp_total,
       format('src=clamped, %s 条', b.exp_total),
       format('src=%s, %s 条', r.res->>'anchor_source', r.res->>'total'),
       format('钳制后锚点=%s', r.res->>'anchor')
from r4 r,
     (select (select count(*) from public.posts where status = 'approved' and created_at > now() - interval '90 days')
           + (select count(*) from public.news where created_at > now() - interval '90 days') as exp_total) b;

-- T5：未来锚点 → 钳制到当前时间 → 0 条
create temp table r5 as
select public.get_offline_overview(p_anchor => now() + interval '1 day', p_limit => 50) as res;
insert into tr (test, pass, expected, actual, note)
select 'T5 未来锚点钳制',
       (r.res->>'total')::int = 0
       and jsonb_array_length(r.res->'items') = 0,
       '0 条',
       format('%s 条, src=%s', r.res->>'total', r.res->>'anchor_source'),
       '';

-- T7：分页（admin 锚点，total 与 T1 一致）
create temp table r7a as select public.get_offline_overview(p_limit => 5, p_offset => 0) as res;
create temp table r7b as select public.get_offline_overview(p_limit => 5, p_offset => 20) as res;
create temp table r7c as select public.get_offline_overview(p_limit => 5, p_offset => 100) as res;
insert into tr (test, pass, expected, actual, note)
select 'T7 分页',
       (a.res->>'total')::int = (t1.res->>'total')::int
       and jsonb_array_length(a.res->'items') = 5
       and (a.res->>'has_more')::boolean = true
       and jsonb_array_length(b.res->'items') = greatest(0, (a.res->>'total')::int - 20)
       and (b.res->>'has_more')::boolean = ((a.res->>'total')::int > 25)
       and jsonb_array_length(c.res->'items') = 0
       and (c.res->>'has_more')::boolean = false,
       'limit5/offset0→5条+has_more；offset20→尾页；offset100→空',
       format('total=%s, 页1=%s条, 页5=%s条, 越界=%s条',
              a.res->>'total', jsonb_array_length(a.res->'items'),
              jsonb_array_length(b.res->'items'), jsonb_array_length(c.res->'items')),
       ''
from r7a a, r7b b, r7c c, r1 t1;

-- T8：字段完整性与倒序校验（用 T3 的 13+ 条真实结果）
insert into tr (test, pass, expected, actual, note)
select 'T8 字段与倒序',
       (select bool_and(i ? 'type' and i ? 'id' and i ? 'title' and i ? 'author'
                          and i ? 'published_at' and i ? 'category'
                          and i->>'type' in ('post', 'news')
                          and length(coalesce(i->>'id', '')) > 0
                          and length(coalesce(i->>'title', '')) > 0)
          from jsonb_array_elements(r.res->'items') x(i))
       and not exists (
         select 1
         from jsonb_array_elements(r.res->'items') with ordinality a(i, ai),
              jsonb_array_elements(r.res->'items') with ordinality b(i, bi)
         where a.ai < b.bi
           and (a.i->>'published_at') < (b.i->>'published_at')
       ),
       '所有字段齐全且严格倒序',
       format('%s 项校验通过', jsonb_array_length(r.res->'items')),
       ''
from r3 r;

-- ---------------------------------------------------------------
-- 以 EGGY 身份测试（真实用户，last_active_at 为 NULL → 首次登录模式）
-- ---------------------------------------------------------------
select set_config('request.jwt.claims',
  json_build_object('sub', '82de6acb-fb26-4da0-a223-df1bf0b09a4b', 'role', 'authenticated')::text, true);

create temp table r6 as select public.get_offline_overview(p_limit => 50) as res;
insert into tr (test, pass, expected, actual, note)
select 'T6 首次登录模式',
       r.res->>'anchor_source' = 'first_login'
       and (r.res->>'is_first_login')::boolean = true
       and (r.res->>'total')::int = b.exp_total,
       format('src=first_login, 最近7天 %s 条', b.exp_total),
       format('src=%s, %s 条', r.res->>'anchor_source', r.res->>'total'),
       format('锚点=%s', r.res->>'anchor')
from r6 r,
     (select (select count(*) from public.posts where status = 'approved' and created_at > now() - interval '7 days')
           + (select count(*) from public.news where created_at > now() - interval '7 days') as exp_total) b;

-- T10：非法参数边界（limit=0 → 至少1条；offset=-5 → 视为0）
create temp table r10 as
select public.get_offline_overview(p_anchor => now() - interval '1 day', p_limit => 0, p_offset => -5) as res;
insert into tr (test, pass, expected, actual, note)
select 'T10 参数边界钳制',
       jsonb_array_length(r.res->'items') = 1
       and (r.res->>'total')::int = 1
       and (r.res->>'has_more')::boolean = false,
       'limit=0→1, offset=-5→0, 返回1条',
       format('items=%s, total=%s', jsonb_array_length(r.res->'items'), r.res->>'total'),
       ''
from r10 r;

-- T9：函数执行权限（anon 拒绝已由 REST 实测返回 42501）
insert into tr (test, pass, expected, actual, note)
select 'T9 EXECUTE 权限',
       (select count(*) from information_schema.routine_privileges
          where routine_schema = 'public' and routine_name = 'get_offline_overview'
            and grantee in ('authenticated', 'service_role')) = 2
       and not exists (select 1 from information_schema.routine_privileges
          where routine_schema = 'public' and routine_name = 'get_offline_overview'
            and grantee in ('public', 'anon')),
       'authenticated+service_role 可执行，public/anon 无权限',
       (select coalesce(string_agg(grantee, ',' order by grantee), '无')
          from information_schema.routine_privileges
          where routine_schema = 'public' and routine_name = 'get_offline_overview'),
       'anon 已被 REST 实测拒绝（42501）';

-- 最终报告（本语句的结果会返回给调用方）
select ord, test as 测试项, pass as 通过, expected as 预期, actual as 实际, note as 备注
from tr
order by ord;

rollback;
