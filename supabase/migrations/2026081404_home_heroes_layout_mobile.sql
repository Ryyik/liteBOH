begin;

-- ============================================
-- home_heroes 表扩展：文字位置布局 + 竖屏端独立图片配置
--
-- 1. 新增 content_layout JSONB 字段：控制文字区块的桌面/竖屏位置、对齐、最大宽度
-- 2. image_config 扩展 mobile 独立覆盖字段（mobile_src/mobile_position/mobile_object_fit/mobile_scale）
--    以及 responsive 模板的 portrait_position
--
-- 现有记录无需迁移：content_layout 为 NULL 时前端走默认布局（底部居中）；
-- 旧版扁平对象与新版 { desktop, mobile } 对象均由前端兼容读取。
-- image_config 新字段缺失时继承桌面端配置。
-- ============================================

-- 1. 新增 content_layout 字段
alter table public.home_heroes
  add column if not exists content_layout jsonb;

-- split_cards 是 jsonb 数组，内部各卡片的 content_layout 在应用层处理，
-- 无需单独列。normalize 时缺失则用父级 content_layout 或默认值。

-- 2. image_config 无需改表结构（本就是 jsonb），新字段由应用层 normalize 补全。

commit;
