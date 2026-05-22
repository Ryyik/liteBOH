# SELECT-star Refactor Checklist

This checklist is focused on high-traffic read paths first, then admin/long-tail paths.

## 1) Goal

- Remove `select('*')` from hot paths.
- Keep payloads minimal and predictable.
- Reduce db read I/O, response size, and browser parse cost.

## 2) Detection command

```bash
rg -n "select\(\s*'\*'|\.select\('\*'\)|SELECT \*" src supabase/functions -S
```

## 3) P0 (hot path) targets

| Priority | File | Current | Replace with |
|---|---|---|---|
| P0 | `src/utils/api/auth-api.js:338` | `profiles.select('*')` | Use paged endpoint only, or explicit fields: `id,username,role,avatar_url,bio,join_date,birth_month,birth_day,points,experience` |
| P0 | `src/utils/api/auth-api.js:401` | `profiles.select('*').single()` | `id,username,role,avatar_url,bio,join_date,birth_month,birth_day,email,points,experience,pushplus_enabled` |
| P0 | `src/utils/api/forum-api.js:611` | `posts.select('*', {count, head:true})` | `posts.select('id', {count, head:true})` |
| P0 | `src/utils/api/forum-api.js:635` | `comments.select('*', {count, head:true})` | `comments.select('id', {count, head:true})` |
| P0 | `src/utils/api/forum-api.js:640` | `likes.select('*', {count, head:true})` | `likes.select('id', {count, head:true})` |
| P0 | `src/utils/api/forum-api.js:882` | `likes.select('*').single()` | `likes.select('id').single()` |
| P0 | `src/utils/api/notifications-api.js:186` | `messages.select('*', {count, head:true})` | `messages.select('id', {count, head:true})` |
| P0 | `src/utils/api/treehole-api.js:1040` | `boh_treehole_memories.select('*', {count})` | `id,user_id,content,mood,tags,is_starred,source,created_at,updated_at` |
| P0 | `src/utils/api/treehole-api.js:1113` | `boh_treehole_memories.select('*', {count})` | `id,user_id,content,mood,tags,is_starred,source,created_at,updated_at` |
| P0 | `src/utils/api/treehole-api.js:1242` | `boh_treehole_memories.select('*')` | Use explicit AI payload columns only (`id,content,mood,tags,source,updated_at,created_at`) |
| P0 | `src/utils/api/treehole-api.js:1284` | `boh_ai_shared_memories.select('*')` | `id,owner_user_id,content,mood,tags,confidence,evidence,source,status,moderation_status,updated_at,created_at` |
| P0 | `src/utils/api/treehole-api.js:1293` | fallback `select('*')` | Same explicit field list as above |
| P0 | `src/utils/api/treehole-api.js:1477` | `boh_ai_shared_memories.select('*', {count})` | Explicit list + `{ count }` |
| P0 | `src/utils/api/treehole-api.js:1709` | `boh_treehole_memory_candidates.select('*')` | `id,user_id,content,mood,tags,confidence,evidence,status,session_id,reason,model,memory_id,updated_at,created_at` |

## 4) P1 (secondary path) targets

| Priority | File | Current | Replace with |
|---|---|---|---|
| P1 | `src/composables/useNews.js:27` | `news.select('*')` | Columns used by card list only (`id,title,excerpt,date,author,image,category`) |
| P1 | `src/composables/useActivities.js:27` | `activities.select('*')` | Card list fields only (`id,title,date,image,description`) |
| P1 | `src/views/Mailbox/index.vue:389` | `messages.select('*')` | Render fields only |
| P1 | `src/views/user-center/Address/index.vue:696` | `addresses.select('*')` | Render/edit fields only |

## 5) P2 (admin/internal screens)

These may be acceptable for low-QPS admin tools, but still worth cleanup:

- `src/views/DataManagement/index.vue`
- `src/views/user-center/Messages/index.vue`

## 6) Implementation pattern

- Create per-table column constants near API modules, for example:

```js
const PROFILE_BASE_COLUMNS = `
  id,
  username,
  role,
  avatar_url,
  bio,
  join_date,
  birth_month,
  birth_day
`;
```

- Reuse constants in all list/detail calls.
- Keep count-only queries as `select('id', { count: 'exact', head: true })`.
- Keep joins explicit and minimal.

## 7) Acceptance criteria

- No `select('*')` in `src/utils/api/auth-api.js`.
- No `select('*')` in `src/utils/api/forum-api.js` count-only code paths.
- No `select('*')` in treehole list/search hot paths.
- Response payload size reduced by at least 20% in top three APIs.

## 8) Validation commands

```bash
# ensure star-query count is reduced
rg -n "select\(\s*'\*'|\.select\('\*'\)" src/utils/api -S

# run unit tests
npm run test
```

If your npm script name differs, run your current test command instead.
