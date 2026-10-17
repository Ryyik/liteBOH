-- 官方内容自动扩充知识库（2026-10-17）：新增 site_news / site_activity 两个知识源。
-- 新闻与活动是管理员维护的官方内容，BOH 每晚自动摄取（boh-ai-forum-memory 的 cron 收尾
-- 一次性同步 forum_memory + site_news + site_activity）+ 管理员保存触发 + 检索时
-- ensureIndexed（admin）。内容本身即事实，无需 LLM 抽取。
-- ⚠️ 三处一致性（任一漏加 = 检索静默少一类结果，守卫：
--    tests/unit/bohai-knowledge-source-types-consistency.test.js）：
--    本约束 ↔ supabase/functions/boh-ai-retrieval SOURCE_TYPES ↔ 前端 ALLOWED_KNOWLEDGE_SOURCE_TYPES

alter table public.boh_ai_knowledge_chunks
  drop constraint if exists boh_ai_knowledge_chunks_source_type_check;

alter table public.boh_ai_knowledge_chunks
  add constraint boh_ai_knowledge_chunks_source_type_check
  check (
    source_type in (
      'core_memory',
      'shared_memory',
      'cloud_entry',
      'knowledge_base',
      'forum_memory',
      'site_news',
      'site_activity'
    )
  );
