alter table public.profiles
  add column if not exists profile_background_url text null,
  add column if not exists profile_background_public_id text null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_profile_background_url_len'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_profile_background_url_len
      check (profile_background_url is null or char_length(profile_background_url) <= 2048);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_profile_background_public_id_len'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_profile_background_public_id_len
      check (profile_background_public_id is null or char_length(profile_background_public_id) <= 512);
  end if;
end $$;

comment on column public.profiles.profile_background_url is '个人卡片背景图 Cloudinary secure_url';
comment on column public.profiles.profile_background_public_id is '个人卡片背景图 Cloudinary public_id，用于替换背景时删除旧图';
