begin;

-- Create missing historical news cards.
insert into public.posts (
  content, title, body, author_id, author_username, status, tag,
  cover_image_url, post_kind, source_type, source_id, created_at, updated_at
)
select
  format('【新闻】%s%s%s', n.title, chr(10), coalesce(n.excerpt, n.content, '')),
  n.title,
  coalesce(n.excerpt, n.content, ''),
  null,
  '方块之家',
  'approved',
  'daily',
  coalesce(n.image, ''),
  'news',
  'news',
  n.id::text,
  coalesce(n.created_at, now()),
  now()
from public.news n
where not exists (
  select 1 from public.posts p
  where p.source_type = 'news' and p.source_id = n.id::text
);

-- Create missing historical activity cards.
insert into public.posts (
  content, title, body, author_id, author_username, status, tag,
  cover_image_url, post_kind, source_type, source_id, created_at, updated_at
)
select
  format('【活动】%s%s%s', a.title, chr(10), coalesce(a.description, '')),
  a.title,
  coalesce(a.description, ''),
  null,
  '方块之家',
  'approved',
  'daily',
  coalesce(a.image, ''),
  'activity',
  'activity',
  a.id::text,
  coalesce(a.created_at, now()),
  now()
from public.activities a
where not exists (
  select 1 from public.posts p
  where p.source_type = 'activity' and p.source_id = a.id::text
);

-- Repair cards created by the first rollout.
update public.posts p
set cover_image_url = coalesce(n.image, ''),
    post_kind = 'news',
    tag = 'daily',
    updated_at = now()
from public.news n
where p.source_type = 'news' and p.source_id = n.id::text;

update public.posts p
set cover_image_url = coalesce(a.image, ''),
    post_kind = 'activity',
    tag = 'daily',
    updated_at = now()
from public.activities a
where p.source_type = 'activity' and p.source_id = a.id::text;

commit;
