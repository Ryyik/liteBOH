-- 2026092203_home_heroes_street_scene.sql
-- 首页改版（任务 A + D1）：新增「首屏街景」单例 hero 模板。
--
-- 变更三件：
--   1. template CHECK 增加 'street-scene'（现有白名单 standard/overlay/split/responsive/builtin/showcase）
--   2. 新增双构图图片字段 image_portrait / image_landscape
--      （竖 1170x2532 / 横 2560x1440，WebP；横竖分别裁切，不用一张图硬拉两用）
--   3. 已发布 street-scene 的 partial unique index —— 单例语义的并发防呆
--
-- 单例口径与前端一致：前端可见集合 = status='published' AND is_archived=false
-- （见 src/stores/homeHeroes.ts publishedHeroes），故索引谓词同口径 ——
-- 归档一条即可腾出槽位，草稿不占用槽位。
--
-- 权限面：不新增任何表级/列级授权。anon 仍只有 SELECT（策略 home_heroes_select_public
-- 限 status='published'），写通道仍由 home_heroes_admin_all(current_user_is_admin()) 管控。

-- 1. template 白名单扩展
alter table public.home_heroes
  drop constraint if exists home_heroes_template_check;

alter table public.home_heroes
  add constraint home_heroes_template_check
  check (template = any (array[
    'standard'::text,
    'overlay'::text,
    'split'::text,
    'responsive'::text,
    'builtin'::text,
    'showcase'::text,
    'street-scene'::text
  ]));

-- 2. 双构图图片字段
alter table public.home_heroes
  add column if not exists image_portrait text,
  add column if not exists image_landscape text;

comment on column public.home_heroes.image_portrait is
  'street-scene 竖屏构图图（1170x2532 WebP）；仅 template=street-scene 使用';
comment on column public.home_heroes.image_landscape is
  'street-scene 横屏构图图（2560x1440 WebP）；仅 template=street-scene 使用';

-- 3. 已发布 street-scene 单例约束
create unique index if not exists home_heroes_street_scene_singleton
  on public.home_heroes ((template))
  where template = 'street-scene'
    and status = 'published'
    and is_archived = false;

notify pgrst, 'reload schema';
