-- home_heroes 表 - 首页展示型英雄区配置
--
-- 用途：数据驱动的首页英雄区管理，替代硬编码。
-- 支持五种模板：standard（标准卡片）、overlay（全幅图片叠加）、
--               split（分栏并排）、responsive（横竖屏适配）、
--               builtin（内置组件，按 builtin_key 分发到对应硬编码组件）。
-- 草稿/发布分离：首页仅渲染 status='published' 且 is_archived=false 的记录。
-- 归档的英雄区（is_archived=true）显示在 Footer 历史回顾区。
-- 配套表：home_heroes_revisions 保留发布历史快照，支持回滚。

CREATE TABLE IF NOT EXISTS public.home_heroes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  -- 排序与显隐
  sort_order integer NOT NULL DEFAULT 0,
  is_archived boolean NOT NULL DEFAULT false,
  -- 模板类型（决定渲染组件与字段解析方式）
  template text NOT NULL CHECK (template IN ('standard','overlay','split','responsive','builtin')),
  variant text NOT NULL DEFAULT 'light' CHECK (variant IN ('light','dark')),
  -- 内置组件标识（仅 template='builtin' 时使用，对应前端 BuiltinHeroRenderer 的分发 key）
  -- UNIQUE 约束允许 NULL，非 builtin 记录不受影响
  builtin_key text NULL,
  CONSTRAINT home_heroes_builtin_key_unique UNIQUE (builtin_key),
  -- 文字内容
  eyebrow text NULL,
  title text NOT NULL,
  subtitle text NULL,
  -- 图片资源（JSONB，按模板不同字段不同）
  --   standard:   { src, alt, position?, mobile_src?, mobile_position?, mobile_object_fit? }
  --   overlay:    { src, alt, position, mobile_src?, mobile_position?, mobile_object_fit?, mobile_scale? }
  --   responsive: { landscapeSrc, portraitSrc, portrait_position?, alt }
  --   split:      空（使用 split_cards 内各自的 image_config）
  --   builtin:    空（内容由组件自带）
  image_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- 文字区块位置。旧版 { align, valign, text_align, max_width }；
  -- 新版 { desktop: {..., offset_x, offset_y}, mobile: {...} }，mobile 缺失时继承 desktop。
  -- split 模板的每张子卡片也可在 split_cards 内配置同名字段。
  content_layout jsonb NULL,
  -- 按钮链接数组
  -- [{ text, type: 'primary'|'secondary', to?, href?, onClick?: 'modal:<key>' }]
  links jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- split 模板的子卡片配置（仅 template='split' 时使用，固定 2 张）
  -- [{ title, subtitle, variant, image_config, content_layout, links }]
  split_cards jsonb NULL,
  -- 管理面板展示用的内部标识
  label text NULL,
  aria_label text NULL,
  -- 草稿/发布分离
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  published_at timestamp with time zone NULL,
  published_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  -- 审计字段
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT home_heroes_pkey PRIMARY KEY (id)
) TABLESPACE pg_default;

-- 索引：首页查询命中 (status, is_archived, sort_order)
CREATE INDEX IF NOT EXISTS idx_home_heroes_published
  ON public.home_heroes USING btree (status, is_archived, sort_order) TABLESPACE pg_default;

-- updated_at 触发器
CREATE TRIGGER update_home_heroes_updated_at
  BEFORE UPDATE ON public.home_heroes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- RLS 策略
-- ============================================
ALTER TABLE public.home_heroes ENABLE ROW LEVEL SECURITY;

-- 公开读：首页需要匿名访问已发布英雄区
CREATE POLICY home_heroes_select_public ON public.home_heroes
  FOR SELECT
  USING (status = 'published' OR public.current_user_is_admin());

-- 管理员全权写
CREATE POLICY home_heroes_admin_all ON public.home_heroes
  FOR ALL
  TO authenticated
  USING (public.current_user_is_admin())
  WITH CHECK (public.current_user_is_admin());


-- ============================================
-- home_heroes_revisions 表 - 发布历史快照
-- ============================================
CREATE TABLE IF NOT EXISTS public.home_heroes_revisions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  hero_id uuid NOT NULL REFERENCES public.home_heroes(id) ON DELETE CASCADE,
  snapshot jsonb NOT NULL,
  published_at timestamp with time zone NOT NULL DEFAULT now(),
  published_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT home_heroes_revisions_pkey PRIMARY KEY (id)
) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_home_heroes_revisions_hero
  ON public.home_heroes_revisions USING btree (hero_id, published_at DESC) TABLESPACE pg_default;

ALTER TABLE public.home_heroes_revisions ENABLE ROW LEVEL SECURITY;

-- 管理员可查看发布历史
CREATE POLICY home_heroes_revisions_admin_select ON public.home_heroes_revisions
  FOR SELECT
  USING (public.current_user_is_admin());

-- 管理员可写入快照（发布时自动写入）
CREATE POLICY home_heroes_revisions_admin_insert ON public.home_heroes_revisions
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_is_admin());

-- 管理员可删除旧快照（清理历史）
CREATE POLICY home_heroes_revisions_admin_delete ON public.home_heroes_revisions
  FOR DELETE
  USING (public.current_user_is_admin());
