begin;

-- ============================================
-- BETA 6 焕新主视觉英雄区（builtin: beta6-renewal）
--
-- 对应前端组件：src/views/Home/components/Beta6RenewalHero.vue
-- 设计：单区块液态玻璃 + 纯白背景 + 漂浮色晕（BETA 6 发布主题「焕新体验」）
-- sort_order=5：序列首位（现有 builtin 从 10 起，0-9 空档预留给动态区，
-- Beta6 主视觉以当期档期身份占用 5，可通过 HeroConsole 调整）。
-- ============================================

insert into public.home_heroes (builtin_key, sort_order, is_archived, template, variant, eyebrow, title, subtitle, label, aria_label, status, published_at, image_config, links)
values
  ('beta6-renewal', 5, false, 'builtin', 'light', 'BOHLITE BETA 6 · 焕新体验', '焕然一新，即刻相见', '液态玻璃设计语言全面升级。界面更轻盈，账本更透明，社区体验更连贯。', 'Beta 6 焕新', 'BOHLITE Beta 6 焕新体验', 'published', now(), '{}'::jsonb, '[]'::jsonb)
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
