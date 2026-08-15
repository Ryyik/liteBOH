-- Preserve legacy custom card uploads even when the user has since switched
-- their active skin to blank or cats.
begin;

insert into public.points_card_presets (user_id, image_url, image_public_id)
select id, points_card_image_url, points_card_image_public_id
from public.profiles
where nullif(trim(points_card_image_url), '') is not null
on conflict (user_id, image_url) do nothing;

commit;
