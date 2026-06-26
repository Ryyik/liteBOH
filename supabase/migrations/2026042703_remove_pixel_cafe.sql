begin;

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) and exists (
    select 1
    from pg_class as c
    join pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'pixel_cafe_board_messages'
      and c.relkind = 'r'
  ) then
    begin
      alter publication supabase_realtime drop table public.pixel_cafe_board_messages;
    exception
      when undefined_object or invalid_parameter_value then
        null;
    end;
  end if;
end $$;

drop table if exists public.pixel_cafe_board_messages cascade;
drop table if exists public.pixel_cafe_player_profiles cascade;
drop table if exists public.pixel_cafe_business_profiles cascade;

drop function if exists public.touch_pixel_cafe_board_messages_updated_at() cascade;
drop function if exists public.touch_pixel_cafe_player_profiles_updated_at() cascade;
drop function if exists public.touch_pixel_cafe_business_profiles_updated_at() cascade;

commit;
