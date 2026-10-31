-- 2026-10-31 万圣夜抽奖 + 开屏绑定（一次性运维脚本，不进 migrations）
--
-- 做什么：
--   ① 建一条「万圣节就要喝南瓜拿铁」抽奖：今晚 22:00 截止报名、22:00 自动开奖，1 名中奖；
--   ② 把开屏 CTA 绑到这条抽奖（点「看看有什么惊喜」→ 直接弹出该抽奖详情）；
--   ③ 把开屏结束时间设成 11/1 00:00 —— 明天首屏自动回归「欢迎回到方块街」。
--
-- 幂等：按 title 判重。重复执行不会建出第二条，也不会把已绑定的 cta_lottery_id 清空。
-- 执行位置：Supabase Dashboard → SQL Editor（整段粘贴执行）。

begin;

with created as (
  insert into public.lotteries (
    title,
    description,
    prize_title,
    prize_description,
    status,
    is_home_visible,
    is_community_visible,
    winner_count,
    entry_deadline_at,
    draw_at,
    enforce_account_age_check
  )
  select
    '万圣节就要喝南瓜拿铁',
    '万圣夜限定抽奖。今晚 22:00 截止并开奖，中奖后凭站内通知联系管理员领取。',
    '库迪咖啡 · 南瓜燕麦拿铁 / 南瓜燕麦奶（2 选 1）',
    '中奖后到店任选其一：南瓜燕麦拿铁，或南瓜燕麦奶。',
    'open',
    false,   -- 不在首页英雄区重复推，宣传只走开屏
    true,    -- 社区抽奖页可见
    1,       -- 1 名中奖
    timestamptz '2026-10-31 22:00:00+08',   -- 报名截止（约束要求 <= draw_at）
    timestamptz '2026-10-31 22:00:00+08',   -- 开奖时间（pg_cron 到点自动抽）
    true     -- 账号需满 24h 才能参与（防刷；想放开改成 false）
  where not exists (
    select 1 from public.lotteries where title = '万圣节就要喝南瓜拿铁'
  )
  returning id
)
update public.home_gate_config
set cta_lottery_id = coalesce(
      (select id from created),
      (select id from public.lotteries
        where title = '万圣节就要喝南瓜拿铁'
        order by created_at desc
        limit 1)
    ),
    ends_at = timestamptz '2026-11-01 00:00:00+08',
    updated_at = now()
where id = 1;

commit;

-- 执行后自查（应看到 1 行抽奖 + 开屏已绑定）：
-- select l.id, l.title, l.status, l.entry_deadline_at, l.draw_at, l.winner_count
--   from public.lotteries l where l.title = '万圣节就要喝南瓜拿铁';
-- select enabled, theme, cta_text, cta_target_type, cta_lottery_id, starts_at, ends_at
--   from public.home_gate_config where id = 1;
