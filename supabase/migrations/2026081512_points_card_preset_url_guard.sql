-- 修复 #1：points_card_preset 上传 URL 安全校验
-- 背景：create_points_card_preset 原先对 p_image_url 无域名白名单，任意外链可被注入为卡面；
-- 且 p_image_public_id 与 URL 之间无一致性校验，归属可伪造（并影响后续 Cloudinary 资产清理）。
-- 本迁移在保持签名、返回结构与既有分支完全兼容的前提下新增两项校验：
--   a) 卡面 URL 必须位于 Cloudinary 分发域名白名单（与 2026042802 boh_cloud 上传守卫同一惯例）；
--   b) p_image_public_id 非空时必须与 URL 路径后缀一致（纯字符串比较，避免正则特殊字符注入）。
begin;

create or replace function public.create_points_card_preset(
  p_image_url text,
  p_image_public_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_tier_code text := 'free';
  v_capacity integer := 3;
  v_current_count integer := 0;
  v_preset public.points_card_presets;
  v_image_url text := trim(coalesce(p_image_url, ''));
  v_image_public_id text := nullif(trim(coalesce(p_image_public_id, '')), '');
  v_path text;
  v_ext text;
  v_stem text;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'message', 'NOT_AUTHENTICATED');
  end if;
  if v_image_url = '' or char_length(v_image_url) > 2048
     or (v_image_public_id is not null and char_length(v_image_public_id) > 512) then
    return jsonb_build_object('ok', false, 'message', 'INVALID_INPUT');
  end if;

  -- (a) 域名白名单：仅接受 Cloudinary 图片分发 URL
  if v_image_url !~ '^https://res[.]cloudinary[.]com/[A-Za-z0-9_-]+/image/upload/' then
    return jsonb_build_object('ok', false, 'message', 'INVALID_IMAGE_URL');
  end if;

  -- (b) public_id 一致性：路径（去掉 query/fragment）必须以
  --     '/' || public_id || '.' || 扩展名（2-5 位字母数字）结尾。
  --     先取末尾扩展名，再对剩余路径做字符串后缀比较，public_id 本身不进入正则，
  --     含正则特殊字符或含 '/'（文件夹前缀，如 boh-points-cards/xxx）的 public_id 均可正确匹配。
  if v_image_public_id is not null then
    v_path := regexp_replace(v_image_url, '[?#].*$', '');
    v_ext := substring(v_path from '[.][A-Za-z0-9]{2,5}$');
    if v_ext is null then
      return jsonb_build_object('ok', false, 'message', 'INVALID_IMAGE_PUBLIC_ID');
    end if;
    v_stem := left(v_path, char_length(v_path) - char_length(v_ext) - 1);
    if right(v_stem, char_length('/' || v_image_public_id)) <> '/' || v_image_public_id then
      return jsonb_build_object('ok', false, 'message', 'INVALID_IMAGE_PUBLIC_ID');
    end if;
  end if;

  perform id from public.profiles where id = v_user_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'PROFILE_NOT_FOUND');
  end if;

  select tier_code, capacity
    into v_tier_code, v_capacity
    from public.points_card_preset_capacity_for_user(v_user_id);

  select count(*) into v_current_count
    from public.points_card_presets
   where user_id = v_user_id
     and purge_state = 'active';

  if v_current_count >= v_capacity then
    return jsonb_build_object(
      'ok', false,
      'message', 'PRESET_CAPACITY_REACHED',
      'tier_code', v_tier_code,
      'capacity', v_capacity,
      'current_count', v_current_count
    );
  end if;

  insert into public.points_card_presets (user_id, image_url, image_public_id, last_used_at)
  values (v_user_id, v_image_url, v_image_public_id, now())
  returning * into v_preset;

  return jsonb_build_object(
    'ok', true,
    'tier_code', v_tier_code,
    'capacity', v_capacity,
    'current_count', v_current_count + 1,
    'preset', jsonb_build_object(
      'id', v_preset.id,
      'image_url', v_preset.image_url,
      'image_public_id', v_preset.image_public_id,
      'created_at', v_preset.created_at,
      'last_used_at', v_preset.last_used_at
    )
  );
end;
$$;

revoke all on function public.create_points_card_preset(text, text) from public;
grant execute on function public.create_points_card_preset(text, text) to authenticated;

notify pgrst, 'reload schema';

commit;
