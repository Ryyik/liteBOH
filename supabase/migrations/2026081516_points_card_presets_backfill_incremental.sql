-- 修复 #5：points_card_presets backfill 增量重跑
-- 背景：2026081507 的 legacy backfill 只在当时执行一次；此后仍在运行的旧客户端
-- 会继续把自定义卡面直接写进 profiles（points_card_image_url），这些行不会进入
-- points_card_presets，成为既不能被管理、也不能被 90 天 purge 的死数据。
-- 处理：重跑与 2026081507 相同口径的 backfill（profiles 中非空 points_card_image_url
-- 插入 presets，on conflict (user_id, image_url) do nothing，可重复执行）。
-- public_id 优先取 profiles.points_card_image_public_id；为空时从 URL 反向提取
-- （规则为迁移 2026081512 校验 (b) 的反向：去 query/fragment、去 /image/upload/ 前缀
-- 与版本段 v<数字>/、去末尾 2-5 位字母数字扩展名，保留完整文件夹路径前缀，
-- 与 Cloudinary 返回的 public_id 形态一致）。tier 列结构与 2026081507 保持一致，不额外写入。
begin;

insert into public.points_card_presets (user_id, image_url, image_public_id)
select
  p.id,
  p.points_card_image_url,
  coalesce(
    nullif(trim(coalesce(p.points_card_image_public_id, '')), ''),
    case
      when p.points_card_image_url ~ '^https://res[.]cloudinary[.]com/[A-Za-z0-9_-]+/image/upload/'
        then nullif(
          regexp_replace(
            regexp_replace(
              regexp_replace(p.points_card_image_url, '[?#].*$', ''),
              '^https://res[.]cloudinary[.]com/[A-Za-z0-9_-]+/image/upload/(v[0-9]+/)?',
              ''
            ),
            '[.][A-Za-z0-9]{2,5}$',
            ''
          ),
          ''
        )
      else null
    end
  )
from public.profiles p
where nullif(trim(p.points_card_image_url), '') is not null
on conflict (user_id, image_url) do nothing;

commit;
