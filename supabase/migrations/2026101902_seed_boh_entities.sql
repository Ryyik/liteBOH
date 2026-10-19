-- 由 scripts/build-boh-entity-seed-sql.mjs 从 src/data/boh-entity-aliases.json 生成。
-- 不要手改；改 JSON 后重新生成并 db push。
-- 幂等：实体按 (entity_type, canonical_name) upsert；只替换 source='bootstrap-json' 的别名，
-- 不会覆盖后台手工维护的别名。

begin;

insert into public.boh_ai_entities (slug, entity_type, canonical_name, display_name, summary)
values
  ('person-yier', 'person', '一二', '发毕业证的一二', ''),
  ('person-liuzhenfu', 'person', '刘镇福', '是LF是锂铁分子', ''),
  ('person-xiaoniu', 'person', '小牛', '小牛无聊', ''),
  ('person-dinglaoshi', 'person', '丁老师', '丁老师', ''),
  ('person-end', 'person', 'End', '叫我End～喵～', ''),
  ('person-eleven', 'person', 'Eleven', 'PVP大神Eleven', ''),
  ('person-yufuqu', 'person', '雨芙蕖', '很有梗 雨芙蕖', ''),
  ('person-baicheng', 'person', '百城小悠', '百城小悠', ''),
  ('person-hanbao', 'person', '汉堡', '汉堡', ''),
  ('person-hetun', 'person', '河豚', '河豚 / IzaQ', ''),
  ('person-luoqiu', 'person', '洛邱', '洛邱', ''),
  ('person-xiaofeng', 'person', '晓枫', '晓枫', ''),
  ('person-chengzi', 'person', '橙子', '橙子 / 86岁少奶奶出逃', ''),
  ('person-xiaogaogao', 'person', '小高糕糕', '小高糕糕', ''),
  ('person-maonu', 'person', '传说中的猫奴', '传说中的猫奴', ''),
  ('person-arisu', 'person', 'くおんじ ありす', 'くおんじ ありす', ''),
  ('person-ryyik', 'person', 'ryyik', 'ryyik', ''),
  ('person-baiye', 'person', '白烨', '白烨', ''),
  ('person-xiaotianguang', 'person', '小天光', '小天光', ''),
  ('person-xiaoxian', 'person', '小仙', '小仙', '')
on conflict (entity_type, canonical_name) do update set
  slug = excluded.slug,
  display_name = excluded.display_name,
  summary = excluded.summary,
  status = 'active';

delete from public.boh_ai_entity_aliases where source = 'bootstrap-json';

insert into public.boh_ai_entity_aliases
  (entity_id, alias, normalized_alias, alias_type, source, confidence, is_ambiguous)
select
  e.id,
  v.alias,
  v.normalized_alias,
  v.alias_type,
  'bootstrap-json',
  v.confidence,
  v.is_ambiguous
from (values
  ('person-yier', '发毕业证的一二', '发毕业证的一二', 'display', 1, false),
  ('person-yier', '翼儿', '翼儿', 'nickname', 1, false),
  ('person-yier', '一二', '一二', 'nickname', 0.9, true),
  ('person-yier', '胡俊杰', '胡俊杰', 'real_name', 1, false),
  ('person-yier', 'hjj', 'hjj', 'initial', 0.9, false),
  ('person-yier', '群主', '群主', 'role', 0.7, true),
  ('person-liuzhenfu', '是LF是锂铁分子', '是lf是锂铁分子', 'display', 1, false),
  ('person-liuzhenfu', '笔墨', '笔墨', 'nickname', 1, true),
  ('person-liuzhenfu', '刘镇福', '刘镇福', 'real_name', 1, false),
  ('person-liuzhenfu', 'LF', 'lf', 'nickname', 0.9, true),
  ('person-liuzhenfu', 'lzf', 'lzf', 'initial', 0.9, false),
  ('person-xiaoniu', '小牛无聊', '小牛无聊', 'display', 1, false),
  ('person-xiaoniu', '小牛', '小牛', 'nickname', 1, true),
  ('person-dinglaoshi', '丁老师', '丁老师', 'nickname', 1, false),
  ('person-end', '叫我End～喵～', '叫我end喵', 'display', 1, false),
  ('person-end', 'End', 'end', 'nickname', 0.9, true),
  ('person-eleven', 'PVP大神Eleven', 'pvp大神eleven', 'display', 1, false),
  ('person-eleven', '武宇轩', '武宇轩', 'real_name', 1, false),
  ('person-eleven', 'wyx', 'wyx', 'initial', 0.9, false),
  ('person-eleven', '轩轩', '轩轩', 'nickname', 0.9, false),
  ('person-eleven', 'Eleven', 'eleven', 'nickname', 1, false),
  ('person-yufuqu', '很有梗 雨芙蕖', '很有梗雨芙蕖', 'display', 1, false),
  ('person-yufuqu', '雨芙蕖', '雨芙蕖', 'nickname', 1, false),
  ('person-baicheng', '百城小悠', '百城小悠', 'display', 1, false),
  ('person-baicheng', '百城', '百城', 'nickname', 0.9, true),
  ('person-hanbao', '汉堡', '汉堡', 'nickname', 0.9, true),
  ('person-hanbao', '蒋龙', '蒋龙', 'real_name', 1, false),
  ('person-hetun', '河豚', '河豚', 'nickname', 0.9, true),
  ('person-hetun', 'IzaQ', 'izaq', 'nickname', 1, false),
  ('person-luoqiu', '洛邱', '洛邱', 'nickname', 1, false),
  ('person-xiaofeng', '晓枫', '晓枫', 'nickname', 1, false),
  ('person-chengzi', '橙子', '橙子', 'nickname', 0.9, true),
  ('person-chengzi', '86岁少奶奶出逃', '86岁少奶奶出逃', 'nickname', 1, false),
  ('person-xiaogaogao', '小高糕糕', '小高糕糕', 'nickname', 1, false),
  ('person-maonu', '传说中的猫奴', '传说中的猫奴', 'nickname', 1, false),
  ('person-arisu', 'くおんじ ありす', 'くおんじありす', 'nickname', 1, false),
  ('person-ryyik', 'ryyik', 'ryyik', 'nickname', 1, false),
  ('person-baiye', '白烨', '白烨', 'nickname', 1, false),
  ('person-xiaotianguang', '小天光', '小天光', 'nickname', 1, false),
  ('person-xiaoxian', '小仙', '小仙', 'nickname', 1, false)
) as v(slug, alias, normalized_alias, alias_type, confidence, is_ambiguous)
join public.boh_ai_entities e on e.slug = v.slug;

commit;
