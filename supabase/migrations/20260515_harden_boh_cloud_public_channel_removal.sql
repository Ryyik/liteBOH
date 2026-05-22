begin;

-- Follow-up hardening for environments where
-- 20260514_remove_boh_cloud_public_channels.sql was already executed once.
-- This does not delete private Cloud+ entries or token share channels.

alter table public.boh_cloud_entries
  add column if not exists visibility text not null default 'private';

alter table public.boh_cloud_share_channels
  add column if not exists visibility text not null default 'token';

alter table public.boh_cloud_share_channels
  add column if not exists description text not null default '';

alter table public.boh_cloud_entries
  alter column visibility set default 'private';

alter table public.boh_cloud_share_channels
  alter column visibility set default 'token';

alter table public.boh_cloud_share_channels
  alter column description set default '';

update public.boh_cloud_entries
   set visibility = 'private'
 where visibility is distinct from 'private';

delete from public.boh_cloud_share_channels
 where visibility = 'public';

update public.boh_cloud_share_channels
   set visibility = 'token',
       description = left(coalesce(description, ''), 160)
 where visibility is distinct from 'token'
    or description is null
    or char_length(coalesce(description, '')) > 160;

alter table public.boh_cloud_entries
  alter column visibility set not null;

alter table public.boh_cloud_share_channels
  alter column visibility set not null;

alter table public.boh_cloud_share_channels
  alter column description set not null;

alter table public.boh_cloud_entries
  drop constraint if exists boh_cloud_entries_visibility_chk;

alter table public.boh_cloud_entries
  add constraint boh_cloud_entries_visibility_chk
  check (visibility = 'private');

alter table public.boh_cloud_share_channels
  drop constraint if exists boh_cloud_share_channels_visibility_chk;

alter table public.boh_cloud_share_channels
  add constraint boh_cloud_share_channels_visibility_chk
  check (visibility = 'token');

alter table public.boh_cloud_share_channels
  drop constraint if exists boh_cloud_share_channels_description_len_chk;

alter table public.boh_cloud_share_channels
  add constraint boh_cloud_share_channels_description_len_chk
  check (char_length(description) <= 160);

drop index if exists public.idx_boh_cloud_share_channels_public;
drop index if exists public.idx_boh_cloud_entries_user_visibility_updated;

comment on column public.boh_cloud_share_channels.visibility is 'Cloud+ 频道可见性：仅支持 token 私密令牌访问。公开频道功能已卸载。';
comment on column public.boh_cloud_share_channels.description is 'Cloud+ 私密令牌频道描述，最多 160 字。';
comment on column public.boh_cloud_entries.visibility is 'Cloud+ 内容可见性：仅支持 private 私密内容。公开频道功能已卸载。';

commit;
