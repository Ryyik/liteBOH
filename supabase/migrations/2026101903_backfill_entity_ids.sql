-- 一次性回填已有数据的实体 ID（2026-10-19）。
--
-- 背景：entity_ids / people_ids 是新列，存量数据全是空数组。
--   - forum_memory 切片：下一次 sync 会由 EF 的 resolveEntityIdsFromNames 重建，
--     但 KB 切片只有 import_knowledge_base 才重建 —— 等不起，这里直接 SQL 回填。
--   - 事实卡的 people_ids 回填后，下一次 sync 也会直接读到。
--
-- 匹配口径：字面 position（lower 归一）， haystack 分别是
--   KB 切片   = title + sectionPath[1] + sectionPath[2]（人物小节标题，别名都在里面）
--   论坛切片  = content（事实卡正文带「涉及成员：」）
--   事实卡    = people jsonb 数组元素
-- ⚠️ 这是**一次性**回填，不是通用实体链接实现 —— 别名表变更后的增量走
--    import（KB）/ sync（forum）/ 面板保存（admin）。误匹配只影响软加权，不影响过滤。

begin;

-- ============================================================
-- 1) KB 切片：title + sectionPath[1..2]
-- ============================================================

with hay as (
  select
    c.id,
    lower(
      concat(
        ' ',
        coalesce(c.title, ''),
        ' ',
        coalesce(c.metadata -> 'sectionPath' ->> 1, ''),
        ' ',
        coalesce(c.metadata -> 'sectionPath' ->> 2, ''),
        ' '
      )
    ) as text
  from public.boh_ai_knowledge_chunks c
  where c.source_type = 'knowledge_base'
    and c.status = 'active'
),
matched as (
  select
    h.id,
    array_agg(distinct en.slug order by en.slug) as ids
  from hay h
  join public.boh_ai_entity_aliases al
    on position(lower(al.alias) in h.text) > 0
  join public.boh_ai_entities en
    on en.id = al.entity_id
   and en.status = 'active'
   and en.slug <> ''
  group by h.id
)
update public.boh_ai_knowledge_chunks c
set entity_ids = m.ids
from matched m
where c.id = m.id;

-- ============================================================
-- 2) 论坛事实卡切片：content
-- ============================================================

with hay as (
  select
    c.id,
    lower(coalesce(c.content, '')) as text
  from public.boh_ai_knowledge_chunks c
  where c.source_type = 'forum_memory'
    and c.status = 'active'
),
matched as (
  select
    h.id,
    array_agg(distinct en.slug order by en.slug) as ids
  from hay h
  join public.boh_ai_entity_aliases al
    on position(lower(al.alias) in h.text) > 0
  join public.boh_ai_entities en
    on en.id = al.entity_id
   and en.status = 'active'
   and en.slug <> ''
  group by h.id
)
update public.boh_ai_knowledge_chunks c
set entity_ids = m.ids
from matched m
where c.id = m.id;

-- ============================================================
-- 3) 事实卡 people_ids：people jsonb 元素
-- ============================================================

with matched as (
  select
    f.id,
    array_agg(distinct en.slug order by en.slug) as ids
  from public.boh_ai_forum_memories f
  cross join lateral jsonb_array_elements_text(f.people) as p(value)
  join public.boh_ai_entity_aliases al
    on position(lower(al.alias) in lower(p.value)) > 0
  join public.boh_ai_entities en
    on en.id = al.entity_id
   and en.status = 'active'
   and en.slug <> ''
  where f.status in ('active', 'pending_review')
  group by f.id
)
update public.boh_ai_forum_memories f
set people_ids = m.ids
from matched m
where f.id = m.id;

commit;
