-- 2026092401_home_heroes_greeting_hint.sql
-- 首屏街景文案可配：新增 greeting_text / hint_text 两个字段。
--
-- 背景：首屏开场画的问候语与「往下逛逛」提示此前是组件内硬编码
--   （src/views/Home/components/StreetSceneHero.vue 的 greetingText / 模板字面量），
--   运营只能换图、不能改字。本次把这两处文案提升为 street-scene 行的可配字段。
--
-- 口径：
--   greeting_text  问候语模板，支持 {greeting} 占位符（运行时替换为时段词：
--                  早上好 / 中午好 / 下午好 / 晚上好）。
--                  留空 → 回落默认模板 '{greeting}，欢迎回到方块街'（与改动前逐字一致）。
--   hint_text      底部呼吸提示文案（箭头 ↓ 仍是组件固定装饰，不落库）。
--                  留空 → 回落默认 '往下逛逛'。
--
-- 两个字段均可空，旧数据（含 builtin/overlay/showcase 等其它模板）保持 null，
-- 行为与改动前完全一致 —— 非 street-scene 模板即使被写入这两个字段也不参与渲染。
--
-- 权限面：不新增任何表级/列级授权。写通道仍由 home_heroes_admin_all(current_user_is_admin()) 管控。

alter table public.home_heroes
  add column if not exists greeting_text text,
  add column if not exists hint_text text;

comment on column public.home_heroes.greeting_text is
  'street-scene 首屏问候语模板，支持 {greeting} 占位符（替换为时段词）；留空回落 "{greeting}，欢迎回到方块街"';
comment on column public.home_heroes.hint_text is
  'street-scene 首屏底部提示文案；留空回落 "往下逛逛"';

notify pgrst, 'reload schema';
