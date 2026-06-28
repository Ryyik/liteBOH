-- profiles 表增加 hide_follow_data 字段
-- 允许用户隐藏自己的关注/粉丝数据
--
-- Down Migration (回滚):
--   ALTER TABLE public.profiles DROP COLUMN IF EXISTS hide_follow_data;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'hide_follow_data'
  ) then
    alter table public.profiles
      add column hide_follow_data boolean not null default false;
  end if;
end $$;

COMMENT ON COLUMN public.profiles.hide_follow_data IS '是否隐藏关注/粉丝数据';
