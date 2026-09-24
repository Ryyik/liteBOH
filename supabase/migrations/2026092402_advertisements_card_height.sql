begin;

-- 广告卡片高度：默认「帖子大小」——广告在帖子流里与帖子卡片同高，横竖屏分别生效。
--   card_size = 'post'   → 内置帖子卡片实测高度（横屏 520px / 竖屏 400px，随视口自动切换）【默认】
--   card_size = 'auto'   → 跟随图片原始比例自适应（旧行为，图片会撑高卡片）
--   card_size = 'custom' → 使用下面两列自定义像素值；某屏填 0 表示该屏沿用「帖子大小」档
alter table public.advertisements
  add column if not exists card_size text not null default 'post';
alter table public.advertisements
  add column if not exists card_height_landscape integer not null default 520;
alter table public.advertisements
  add column if not exists card_height_portrait integer not null default 400;

alter table public.advertisements
  drop constraint if exists advertisements_card_size_check;
alter table public.advertisements
  add constraint advertisements_card_size_check check (card_size in ('post', 'auto', 'custom'));

alter table public.advertisements
  drop constraint if exists advertisements_card_height_range;
alter table public.advertisements
  add constraint advertisements_card_height_range check (
    card_height_landscape >= 0 and card_height_landscape <= 1200
    and card_height_portrait >= 0 and card_height_portrait <= 1200
  );

comment on column public.advertisements.card_size is '广告卡片高度档位：post = 帖子大小（默认，横屏 520 / 竖屏 400）；auto = 跟随图片比例；custom = 用 card_height_* 自定义。';
comment on column public.advertisements.card_height_landscape is '自定义档位下的横屏卡片高度（px）；0 = 沿用「帖子大小」档。';
comment on column public.advertisements.card_height_portrait is '自定义档位下的竖屏卡片高度（px）；0 = 沿用「帖子大小」档。';

commit;