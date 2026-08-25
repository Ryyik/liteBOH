-- 修复：年度会员福利触发器此前仅匹配规范化档位，遗漏订阅档位别名
-- （boh-ai-plus / boh-plus / boh-pro / boh-max / boh-ultra），
-- 导致别名档位的年度订阅用户拿不到「年度会员纪念徽章」。
-- 与 2026082301 归一化逻辑、2026071901 周年礼的别名处理保持一致。

begin;

create or replace function public.apply_yearly_membership_gift()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.billing_cycle = 'yearly'
     and lower(trim(new.plan_code)) in (
       'plus', 'boh-ai-plus', 'boh-plus',
       'pro', 'boh-pro',
       'max', 'boh-max',
       'ultra', 'boh-ultra'
     ) then
    new.metadata := coalesce(new.metadata, '{}'::jsonb) || jsonb_build_object(
      'yearly_gift', jsonb_build_object(
        'code', 'annual-member-badge',
        'label', '年度会员纪念徽章',
        'granted_at', now()
      )
    );
  end if;
  return new;
end;
$$;

-- 回填：为历史上按别名档位订阅年度会员、但尚未写入徽章的用户补发
update public.user_subscriptions
   set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
     'yearly_gift', jsonb_build_object(
       'code', 'annual-member-badge',
       'label', '年度会员纪念徽章',
       'granted_at', now()
     )
   )
 where billing_cycle = 'yearly'
   and lower(trim(plan_code)) in (
     'plus', 'boh-ai-plus', 'boh-plus',
     'pro', 'boh-pro',
     'max', 'boh-max',
     'ultra', 'boh-ultra'
   )
   and not (coalesce(metadata, '{}'::jsonb) ? 'yearly_gift');

commit;