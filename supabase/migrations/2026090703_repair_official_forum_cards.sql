begin;

update public.posts p
set post_kind = 'news',
    tag = 'daily',
    title = n.title,
    body = coalesce(n.excerpt, n.content, ''),
    content = format('【新闻】%s%s%s', n.title, chr(10), coalesce(n.excerpt, n.content, '')),
    cover_image_url = coalesce(n.image, ''),
    author_username = '方块之家',
    updated_at = now()
from public.news n
where p.source_type = 'news'
  and p.source_id = n.id::text;

update public.posts p
set post_kind = 'activity',
    tag = 'daily',
    title = a.title,
    body = coalesce(a.description, ''),
    content = format('【活动】%s%s%s', a.title, chr(10), coalesce(a.description, '')),
    cover_image_url = coalesce(a.image, ''),
    author_username = '方块之家',
    updated_at = now()
from public.activities a
where p.source_type = 'activity'
  and p.source_id = a.id::text;

commit;
