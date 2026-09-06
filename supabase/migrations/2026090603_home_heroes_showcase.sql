begin;

-- ============================================
-- home_heroes 新增 showcase（设定集书页）模板
-- 视觉：中央 3D 立体书 + 透明底人物立绘环绕 + 晚秋氛围
-- showcase_config 结构：
-- {
--   badge_text:  string          发布徽标文案（如"晚秋发布"）
--   particles:   boolean         飘落像素落叶粒子开关
--   cover_src:   string          书封图片 URL
--   cover_alt:   string          书封 alt 文本
--   characters: [                 环绕人物列表（1~8 位）
--     {
--       key:           string    内置皮肤库 key（skinLibrary），与 src 二选一
--       src:           string    自定义立绘 URL（优先于 key）
--       name:          string    人物名（alt 文本用）
--       side:          'left'|'right'   站位方向
--       depth:         1|2|3     景深层次（1 前景 / 2 中景 / 3 后景）
--       scale:         number    缩放倍率（0.6~1.4）
--       mobile_hidden: boolean   移动端隐藏
--     }
--   ]
-- }
-- ============================================

-- 放开 template 约束，加入 builtin（2026081403 引入但未更新约束）与 showcase
alter table public.home_heroes
  drop constraint if exists home_heroes_template_check;
alter table public.home_heroes
  add constraint home_heroes_template_check
  check (template in ('standard','overlay','split','responsive','builtin','showcase'));

-- showcase 模板专属配置
alter table public.home_heroes
  add column if not exists showcase_config jsonb not null default '{}'::jsonb;

comment on column public.home_heroes.showcase_config is
  'showcase 模板配置：badge_text/particles/cover_src/cover_alt/characters[]';

commit;
