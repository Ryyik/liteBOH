-- Beta5: 方块积分卡面及用户自定义卡片资源。
alter table public.profiles
  add column if not exists points_card_skin text not null default 'blank',
  add column if not exists points_card_image_url text null,
  add column if not exists points_card_image_public_id text null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_points_card_skin_valid'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_points_card_skin_valid
      check (points_card_skin in ('blank', 'cats', 'custom'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_points_card_image_url_len'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_points_card_image_url_len
      check (points_card_image_url is null or char_length(points_card_image_url) <= 2048);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_points_card_image_public_id_len'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_points_card_image_public_id_len
      check (points_card_image_public_id is null or char_length(points_card_image_public_id) <= 512);
  end if;
end $$;

comment on column public.profiles.points_card_skin is 'Beta5 方块积分卡皮肤：blank、cats 或 custom';
comment on column public.profiles.points_card_image_url is 'Beta5 用户自定义积分卡面 Cloudinary secure_url';
comment on column public.profiles.points_card_image_public_id is 'Beta5 用户自定义积分卡面 Cloudinary public_id';
