begin;

-- ============================================
-- home_heroes 表扩展：支持内置英雄区（builtin 模板）
--
-- 目的：统一硬编码英雄区与数据库英雄区的加载机制。
-- 硬编码英雄区（MascotNewHero/AgentPreviewHero 等）作为 builtin 记录写入 DB，
-- 排序/显隐/归档统一由 DB 字段控制，渲染时按 builtin_key 分发到对应组件。
-- 内容字段（image_config/links/split_cards）留空，由组件自带。
-- ============================================

-- 1. 新增 builtin_key 字段：标识对应的内置组件
alter table public.home_heroes
  add column if not exists builtin_key text;

-- builtin_key 唯一约束：确保每个内置组件只注册一次
-- PostgreSQL UNIQUE 允许多个 NULL 值，非 builtin 记录的 builtin_key 为 NULL 不受影响
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'home_heroes_builtin_key_unique'
  ) then
    alter table public.home_heroes
      add constraint home_heroes_builtin_key_unique unique (builtin_key);
  end if;
end $$;

-- 2. 放宽 template CHECK 约束：新增 'builtin' 类型
alter table public.home_heroes
  drop constraint if exists home_heroes_template_check;
alter table public.home_heroes
  add constraint home_heroes_template_check
  check (template in ('standard','overlay','split','responsive','builtin'));

-- 3. Seed 内置英雄区记录（幂等：按 builtin_key upsert）
-- sort_order 从 10 起，预留 0-9 给数据库动态英雄区（保持现状：动态在前）
insert into public.home_heroes (builtin_key, sort_order, is_archived, template, variant, eyebrow, title, subtitle, label, aria_label, status, published_at, image_config, links)
values
  ('mascot-new',        10, false, 'builtin', 'light', '全新上线',       '全新吉祥物现已上线',   null,                         '吉祥物·新版',   '全新吉祥物现已上线',       'published', now(), '{}'::jsonb, '[]'::jsonb),
  ('agent-preview',     20, false, 'builtin', 'light', 'Agent',          'BOH Agent Preview',    null,                         'BOH Agent',     'BOH Agent Preview',        'published', now(), '{}'::jsonb, '[]'::jsonb),
  ('birthday',          30, false, 'builtin', 'light', '纪念日',          '今日生日',             null,                         '今日生日',      '今日生日',                 'published', now(), '{}'::jsonb, '[]'::jsonb),
  ('block-wall',        40, false, 'builtin', 'light', '社区 · 故事收集处','方块墙',              '把心情、祝福或想记住的瞬间钉在墙上。', '方块墙',        '方块墙',                   'published', now(), '{}'::jsonb, '[]'::jsonb),
  ('mascot-evolution',  50, true,  'builtin', 'light', 'BOH 吉祥物',      '吉祥物进化史',         '从熊到面包，再到下一个故事。',     '吉祥物·进化史', '方块之家吉祥物',           'published', now(), '{}'::jsonb, '[]'::jsonb),
  ('anniversary-8',     60, false, 'builtin', 'light', '方块之家八周年',  '八周年庆典',           '八周年纪念海报、订阅礼与 Ryyik 的信。', '八周年',        '方块之家八周年',           'published', now(), '{}'::jsonb, '[]'::jsonb),
  ('cloud-cafe',        70, false, 'builtin', 'light', '八周年 · 网页游戏','云上咖啡店',           '招待方块熟客，亲手完成研磨、萃取、奶泡与拉花。', '云上咖啡店',    '云上咖啡店网页游戏',       'published', now(), '{}'::jsonb, '[]'::jsonb),
  ('fuzhou',            80, false, 'builtin', 'light', '遇见系列',        '遇见福州',             'Halo，福州。有福之州，等待与你相遇。', '遇见福州',      '遇见福州',                 'published', now(), '{}'::jsonb, '[]'::jsonb),
  ('split-theme-cloud', 90, true,  'builtin', 'light', '主题与云端',      'BOH X 小猫主题 × BOH Cloud+', '小猫主题与云端内容的分栏英雄区。', '主题与云端',    '主题与云端',               'published', now(), '{}'::jsonb, '[]'::jsonb),
  ('split-brand-letter',100, false, 'builtin', 'light', '品牌与八周年寄语','BOH 与 Ryyik 的信',    '了解什么是 BOH，以及一封给方块之家的信。', '品牌与信件',    '品牌与八周年寄语',         'published', now(), '{}'::jsonb, '[]'::jsonb)
on conflict (builtin_key) do update set
  sort_order  = excluded.sort_order,
  is_archived = excluded.is_archived,
  template    = excluded.template,
  variant     = excluded.variant,
  eyebrow     = excluded.eyebrow,
  title       = excluded.title,
  subtitle    = excluded.subtitle,
  label       = excluded.label,
  aria_label  = excluded.aria_label,
  status      = excluded.status,
  updated_at  = now();

commit;
