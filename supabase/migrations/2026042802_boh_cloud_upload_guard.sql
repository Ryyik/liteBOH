begin;

create or replace function public.boh_cloud_count_entry_images(p_blocks jsonb)
returns integer
language sql
immutable
as $$
  select count(*)::integer
    from jsonb_array_elements(
      case
        when jsonb_typeof(coalesce(p_blocks, '[]'::jsonb)) = 'array' then coalesce(p_blocks, '[]'::jsonb)
        else '[]'::jsonb
      end
    ) as block
   where block ->> 'type' = 'image';
$$;

create or replace function public.boh_cloud_image_limit_for_user(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_limit integer := 0;
begin
  select max(
    case lower(trim(plan_code))
      when 'boh-ai-plus' then 150
      when 'boh-plus' then 150
      when 'boh-pro' then 200
      when 'boh-max' then 400
      else 0
    end
  )
    into v_plan_limit
    from public.user_subscriptions
   where user_id = p_user_id
     and status = 'active'
     and expires_at > now();

  return greatest(100, coalesce(v_plan_limit, 0));
end;
$$;

create or replace function public.guard_boh_cloud_entry_upload()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_block jsonb;
  v_block_type text;
  v_url text;
  v_public_id text;
  v_width integer;
  v_height integer;
  v_block_count integer := 0;
  v_image_count integer := 0;
  v_text_count integer := 0;
  v_existing_image_count integer := 0;
  v_image_limit integer := 100;
  v_recent_entry_count integer := 0;
  v_recent_image_count integer := 0;
begin
  new.content_blocks := coalesce(new.content_blocks, '[]'::jsonb);
  new.title := left(coalesce(new.title, ''), 120);
  new.content_text := left(coalesce(new.content_text, ''), 40000);
  new.cover_image_url := left(coalesce(new.cover_image_url, ''), 2048);
  new.mood := left(coalesce(new.mood, ''), 24);

  if jsonb_typeof(new.content_blocks) <> 'array' then
    raise exception 'INVALID_CLOUD_BLOCKS';
  end if;

  v_block_count := jsonb_array_length(new.content_blocks);
  if v_block_count <= 0 then
    raise exception 'EMPTY_CLOUD_ENTRY';
  end if;
  if v_block_count > 30 then
    raise exception 'CLOUD_BLOCKS_TOO_MANY';
  end if;

  for v_block in
    select value from jsonb_array_elements(new.content_blocks)
  loop
    if jsonb_typeof(v_block) <> 'object' then
      raise exception 'INVALID_CLOUD_BLOCK';
    end if;

    v_block_type := lower(trim(coalesce(v_block ->> 'type', '')));
    if v_block_type = 'text' then
      v_text_count := v_text_count + 1;
      if char_length(coalesce(v_block ->> 'text', '')) > 12000 then
        raise exception 'CLOUD_TEXT_BLOCK_TOO_LONG';
      end if;
    elsif v_block_type = 'image' then
      v_image_count := v_image_count + 1;
      v_url := trim(coalesce(v_block ->> 'url', ''));
      v_public_id := trim(coalesce(v_block ->> 'publicId', v_block ->> 'public_id', ''));
      v_width := coalesce(nullif(v_block ->> 'width', '')::integer, 0);
      v_height := coalesce(nullif(v_block ->> 'height', '')::integer, 0);

      if char_length(v_url) > 2048
         or v_url !~ '^https://res[.]cloudinary[.]com/[A-Za-z0-9_-]+/image/upload/'
         or v_url !~* '[.](png|jpe?g|webp|gif)([?#].*)?$' then
        raise exception 'INVALID_CLOUD_IMAGE_URL';
      end if;

      if v_public_id = ''
         or char_length(v_public_id) > 255
         or v_public_id like '/%'
         or v_public_id like '%..%'
         or position(chr(92) in v_public_id) > 0 then
        raise exception 'INVALID_CLOUD_IMAGE_PUBLIC_ID';
      end if;

      if char_length(coalesce(v_block ->> 'alt', '')) > 120 then
        raise exception 'CLOUD_IMAGE_ALT_TOO_LONG';
      end if;

      if v_width <= 0
         or v_height <= 0
         or v_width > 8192
         or v_height > 8192
         or (v_width::bigint * v_height::bigint) > 25000000 then
        raise exception 'INVALID_CLOUD_IMAGE_DIMENSIONS';
      end if;
    else
      raise exception 'INVALID_CLOUD_BLOCK_TYPE';
    end if;
  end loop;

  if v_image_count > 9 then
    raise exception 'CLOUD_ENTRY_IMAGE_LIMIT_EXCEEDED';
  end if;
  if v_text_count > 10 then
    raise exception 'CLOUD_TEXT_BLOCKS_TOO_MANY';
  end if;
  if trim(new.content_text) = '' and v_image_count = 0 then
    raise exception 'EMPTY_CLOUD_ENTRY';
  end if;

  if trim(new.cover_image_url) <> ''
     and (
       new.cover_image_url !~ '^https://res[.]cloudinary[.]com/[A-Za-z0-9_-]+/image/upload/'
       or new.cover_image_url !~* '[.](png|jpe?g|webp|gif)([?#].*)?$'
     ) then
    raise exception 'INVALID_CLOUD_COVER_IMAGE_URL';
  end if;

  if v_image_count > 0 and v_text_count > 0 then
    new.entry_type := 'mixed';
  elsif v_image_count > 0 then
    new.entry_type := 'image';
  else
    new.entry_type := 'text';
  end if;

  v_image_limit := public.boh_cloud_image_limit_for_user(new.user_id);
  select coalesce(sum(public.boh_cloud_count_entry_images(content_blocks)), 0)
    into v_existing_image_count
    from public.boh_cloud_entries
   where user_id = new.user_id
     and (tg_op = 'INSERT' or id <> new.id);

  if v_existing_image_count + v_image_count > v_image_limit then
    raise exception 'CLOUD_IMAGE_LIMIT_EXCEEDED';
  end if;

  if tg_op = 'INSERT' then
    select count(*)
      into v_recent_entry_count
      from public.boh_cloud_entries
     where user_id = new.user_id
       and created_at > now() - interval '10 minutes';

    if v_recent_entry_count >= 30 then
      raise exception 'CLOUD_ENTRY_RATE_LIMITED';
    end if;

    select coalesce(sum(public.boh_cloud_count_entry_images(content_blocks)), 0)
      into v_recent_image_count
      from public.boh_cloud_entries
     where user_id = new.user_id
       and created_at > now() - interval '1 hour';

    if v_recent_image_count + v_image_count > 60 then
      raise exception 'CLOUD_IMAGE_RATE_LIMITED';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_boh_cloud_entries_upload_guard on public.boh_cloud_entries;
create trigger trg_boh_cloud_entries_upload_guard
before insert or update of title, entry_type, content_text, content_blocks, cover_image_url, mood on public.boh_cloud_entries
for each row
execute function public.guard_boh_cloud_entry_upload();

revoke all on function public.boh_cloud_count_entry_images(jsonb) from public;
revoke all on function public.boh_cloud_image_limit_for_user(uuid) from public;
revoke all on function public.guard_boh_cloud_entry_upload() from public;

grant execute on function public.boh_cloud_count_entry_images(jsonb) to authenticated;
grant execute on function public.boh_cloud_count_entry_images(jsonb) to service_role;
grant execute on function public.boh_cloud_image_limit_for_user(uuid) to authenticated;
grant execute on function public.boh_cloud_image_limit_for_user(uuid) to service_role;
grant execute on function public.guard_boh_cloud_entry_upload() to service_role;

comment on function public.guard_boh_cloud_entry_upload() is 'BOH Cloud+ 上传兜底防护：校验结构化块、Cloudinary 图片来源、单条/总额度与短周期频率。';

commit;
