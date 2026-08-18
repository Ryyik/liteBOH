-- Restore image configuration lost by the historical sort-only save bug.
-- Only fills currently empty configs from a prior non-empty published snapshot.
-- Split heroes intentionally keep image_config empty because their images live in split_cards.

with latest_valid_snapshots as (
  select distinct on (hero_id)
    hero_id,
    snapshot -> 'image_config' as image_config
  from public.home_heroes_revisions
  where jsonb_typeof(snapshot -> 'image_config') = 'object'
    and jsonb_object_length(snapshot -> 'image_config') > 0
    and coalesce(snapshot ->> 'template', '') <> 'split'
  order by hero_id, published_at desc
)
update public.home_heroes as hero
set image_config = snapshot.image_config,
    updated_at = now()
from latest_valid_snapshots as snapshot
where hero.id = snapshot.hero_id
  and hero.template <> 'split'
  and coalesce(hero.image_config, '{}'::jsonb) = '{}'::jsonb;
