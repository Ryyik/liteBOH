-- ============================================================================
-- B3 · 推送 endpoint 出站白名单（DB 侧）
--
-- 问题：`push_subscriptions.endpoint` 由浏览器订阅后**前端直接写入**，
--   `push-send` 再拿它作 fetch 目标。这是全站唯一「出站目标由用户决定」的入口
--   —— 登录用户可以把它填成内网地址，借 Edge Function 的网络位置做盲 SSRF
--   （推送要 VAPID 签名，回包拿不到，但「是否收到请求 / 耗时差」足以探测主机与端口）。
--
-- 做法：正向白名单，只允许已知推送服务。判别函数与 Edge Function 里的
--   `_shared/push-endpoint.ts` 一一对应，两处必须同时改（否则会出现
--   「能订阅但永远发不出去」或「EF 拒绝但库里能写」的静默错配）。
--
-- 为什么不用「禁内网 IP」：
--   RFC1918 / link-local / IPv6 ULA / 十进制与八进制变体 / DNS 重绑定 —— 黑名单
--   永远漏。白名单漏一个最多是「某小众浏览器收不到推送」，可见、可补。
--
-- 现有数据：3 行，host 全为 `web.push.apple.com` ⇒ 加约束不会拒掉任何历史行。
--
-- ⚠️ 这是一条会**阻断写入**的约束（不是仅告警）。将来某浏览器换端点域名时，
--   用户订阅会直接失败 —— 这是刻意的：可见的失败优于「订阅成功但永远收不到」。
--   加白名单只需在下面函数与本注释列出的名单里各加一行，然后：
--     supabase db push --yes && supabase functions deploy push-send
-- ============================================================================

create or replace function public.is_allowed_push_endpoint(p_endpoint text)
returns boolean
language sql
immutable
parallel safe
set search_path = public
as $function$
  select
    p_endpoint is not null
    and char_length(p_endpoint) <= 2048
    and p_endpoint ~ '^https://'
    -- userinfo 形式（https://fcm.googleapis.com@evil.com/）直接拒
    and p_endpoint !~ '^https://[^/?#]*@'
    -- host 段不能带端口（真实推送端点都在 443）
    and substring(p_endpoint from '^https://([^/?#]+)') !~ ':'
    and (
      lower(substring(p_endpoint from '^https://([^/?#]+)')) in (
        'fcm.googleapis.com',      -- Chrome / Edge(Chromium) / Opera / Samsung
        'android.googleapis.com',  -- 旧版 Android WebView
        'web.push.apple.com'       -- Safari（macOS / iOS PWA）
      )
      or lower(substring(p_endpoint from '^https://([^/?#]+)')) like '%.push.services.mozilla.com' -- Firefox
      or lower(substring(p_endpoint from '^https://([^/?#]+)')) like '%.notify.windows.com'         -- Edge WNS 分片
      or lower(substring(p_endpoint from '^https://([^/?#]+)')) like '%.push.apple.com'             -- Apple 其他分片
    );
$function$;

comment on function public.is_allowed_push_endpoint(text) is
  '推送 endpoint 出站白名单（与 supabase/functions/_shared/push-endpoint.ts 保持一致）';

alter table public.push_subscriptions
  add constraint push_subscriptions_endpoint_allowed
  check (public.is_allowed_push_endpoint(endpoint));
