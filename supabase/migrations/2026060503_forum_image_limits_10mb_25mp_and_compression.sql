begin;

alter table public.forum_post_images
  drop constraint if exists forum_post_images_dimensions_chk;

alter table public.forum_post_images
  add constraint forum_post_images_dimensions_chk
  check (
    width > 0
    and height > 0
    and width <= 8192
    and height <= 8192
    and (width::bigint * height::bigint) <= 25000000
  );

do $$
declare
  function_signature text;
  function_def text;
begin
  foreach function_signature in array array[
    'public.create_forum_post_with_images(text, text, text, jsonb, text)',
    'public.guard_boh_cloud_entry_upload()'
  ]
  loop
    begin
      select pg_get_functiondef(function_signature::regprocedure)
        into function_def;
    exception
      when undefined_function then
        function_def := null;
    end;

    if function_def is not null and position('24000000' in function_def) > 0 then
      execute replace(function_def, '24000000', '25000000');
    end if;
  end loop;
end;
$$;

notify pgrst, 'reload schema';

commit;
