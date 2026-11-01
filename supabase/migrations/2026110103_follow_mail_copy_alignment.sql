-- 2026110103: 关注邮件的「库内文案」与行为对齐（只改列注释，不改数据/结构/权限）
--
-- 背景：2026110102 把即时模式补上「摘要尾巴」后，三种行为的文案全都过时了，
--   而列注释是 `\d+ profiles` / DB 文档 / 后续排查的第一手说明，写错会直接误导判断：
--   · follow_mail_digest  仍写「false=及时(首条即发,同窗后续丢弃)」
--     ——「同窗后续丢弃」正是 2026110102 修掉的缺陷，留着等于把 bug 写成规格。
--   · follow_mail_enabled 仍写「发帖/回复我」，漏了「评论我的帖子」这一类。
--   · follow_mail_window_minutes 没说明它现在同时服务于「摘要尾巴」的归并窗口。
--
-- 只动 comment on column；不碰数据、不碰约束、不碰函数、不碰权限。
-- 回滚（如需）：把下列 comment on column 换回旧文案即可，旧文案见 2026102902 / 2026102903 迁移文件。

begin;

comment on column public.profiles.follow_mail_enabled is
  '是否接收「关注的人发帖 / 评论我的帖子 / 回复我」的邮件通知。默认关闭，由用户在通知设置里主动开启。';

comment on column public.profiles.follow_mail_digest is
  '「关注的人邮件通知」投递方式：false=及时与摘要（首条立刻发，同窗口其余动作在窗口末汇总成一封，最多 2 封且一条不丢），true=减少干扰（整窗口只发一封，窗口末送达）。';

comment on column public.profiles.follow_mail_window_minutes is
  '「关注的人邮件通知」的归并窗口（分钟）：15=实时（Max+ Only），60=标准（无门槛）。两种投递方式都用它切窗口桶；即时模式的摘要尾巴也在窗口末到期。写入只经 boh_set_follow_mail_window。';

-- 登记迁移（与上面的 DDL 同一事务）
insert into supabase_migrations.schema_migrations (version, name)
values ('2026110103', 'follow_mail_copy_alignment')
on conflict (version) do nothing;

commit;
