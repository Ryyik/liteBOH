# 论坛举报 + AI 复核下架方案

日期：2026-04-30

## 目标

为论坛增加举报能力：用户举报帖子后，由服务端触发 AI 复核；如果 AI 判定举报成立，则自动下架帖子，并通知发帖人。

第一版建议只做 **帖子举报**。评论举报可以复用同一套表和函数，在第二版扩展。

## 核心原则

- 举报结果不能由前端决定，必须由服务端复核。
- AI 只负责快速判断，所有举报记录都要保留，便于管理员追踪。
- 举报成立后不物理删除帖子，而是把 `posts.status` 改为 `rejected`，复用现有隐藏机制。
- 同一用户对同一帖子只能举报一次。
- 举报本身也要限频，避免恶意举报刷接口。

## 整体流程

1. 用户在帖子上点击「举报」。
2. 前端弹出举报原因选择框。
3. 前端调用 Supabase Edge Function：`forum-report-review`。
4. Edge Function 用当前登录用户身份校验举报人。
5. Edge Function 用 service role 读取帖子内容。
6. 写入 `content_reports` 举报记录，状态为 `reviewing`。
7. 调用 AI 对「帖子内容 + 举报原因」做复核。
8. 如果 AI 判定举报成立：
   - 更新 `posts.status = 'rejected'`
   - 更新举报状态为 `resolved`
   - 给发帖人写入通知
9. 如果 AI 判定不成立：
   - 更新举报状态为 `rejected`
10. 前端提示用户举报处理结果。

## 数据库设计

新增 migration，例如：

`supabase/migrations/20260501_forum_content_reports.sql`

```sql
begin;

create table if not exists public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('post', 'comment')),
  target_id uuid not null,
  target_author_id uuid null references public.profiles(id) on delete set null,
  reason_code text not null check (
    reason_code in (
      'spam',
      'porn',
      'harassment',
      'illegal',
      'privacy',
      'malicious',
      'other'
    )
  ),
  reason_text text null,
  ai_result text null check (ai_result in ('approved', 'rejected')),
  ai_reason text null,
  status text not null default 'pending'
    check (status in ('pending', 'reviewing', 'resolved', 'rejected')),
  handled_by uuid null references public.profiles(id) on delete set null,
  handled_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (reporter_id, target_type, target_id)
);

create index if not exists idx_content_reports_status_created
  on public.content_reports (status, created_at desc);

create index if not exists idx_content_reports_target
  on public.content_reports (target_type, target_id);

create index if not exists idx_content_reports_reporter_created
  on public.content_reports (reporter_id, created_at desc);

alter table public.content_reports enable row level security;

drop policy if exists content_reports_select_own on public.content_reports;
create policy content_reports_select_own on public.content_reports
  for select to authenticated
  using (auth.uid() = reporter_id);

drop policy if exists content_reports_admin_select on public.content_reports;
create policy content_reports_admin_select on public.content_reports
  for select to authenticated
  using (public.current_user_is_admin());

-- 不开放普通 insert/update。举报统一走 Edge Function，避免用户伪造 ai_result/status。

commit;
```

## 通知类型

建议新增通知类型：

```js
export const POST_REPORT_REJECTED_NOTIFICATION_TYPE = 'post_report_rejected';
```

通知文案：

```js
export const POST_REPORT_REJECTED_NOTICE_TEXT =
  '您的帖子经举报复核后未通过社区规范，已被下架。如有疑问请联系管理员。';
```

通知写入仍使用现有 `notifications` 表：

```js
{
  recipient_id: post.author_id,
  sender_id: reporterId,
  type: 'post_report_rejected',
  post_id: post.id,
  status: 'unread',
  content: '您的帖子经举报复核后未通过社区规范，已被下架。'
}
```

如果当前 `notifications` 表没有 `content` 字段，现有 `insertNotificationWithCompatibility` 会自动降级移除缺失字段。服务端 SQL 直接插入时，则不要写 `content`，或者先补字段。

建议补字段：

```sql
alter table public.notifications
  add column if not exists content text null;
```

## Edge Function 设计

新增：

`supabase/functions/forum-report-review/index.ts`

环境变量建议：

```bash
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
MODERATION_API_URL=https://api.siliconflow.cn/v1/chat/completions
MODERATION_API_KEY=
MODERATION_MODEL_ID=Qwen/Qwen2.5-7B-Instruct
```

完整草案：

```ts
import { buildCorsHeaders, jsonResponse } from '../_shared/cors.ts';
import { createServiceClient } from '../_shared/supabase.ts';

const MODERATION_API_URL = String(Deno.env.get('MODERATION_API_URL') || 'https://api.siliconflow.cn/v1/chat/completions').trim();
const MODERATION_API_KEY = String(Deno.env.get('MODERATION_API_KEY') || '').trim();
const MODERATION_MODEL_ID = String(Deno.env.get('MODERATION_MODEL_ID') || 'Qwen/Qwen2.5-7B-Instruct').trim();

const REPORT_REASON_LABELS: Record<string, string> = {
  spam: '垃圾广告',
  porn: '色情低俗',
  harassment: '人身攻击/骚扰',
  illegal: '违法违规',
  privacy: '侵犯隐私',
  malicious: '恶意刷屏/引战',
  other: '其他',
};

const normalizeText = (value: unknown, max = 1000) =>
  String(value || '').trim().slice(0, max);

const parseModerationJson = (raw: string) => {
  const text = String(raw || '').trim();
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    return {
      status: 'approved',
      confidence: 0,
      reason: 'AI 返回格式无法解析，按举报不成立处理',
    };
  }

  try {
    const parsed = JSON.parse(match[0]);
    const status = String(parsed.status || '').trim().toLowerCase() === 'rejected'
      ? 'rejected'
      : 'approved';
    return {
      status,
      confidence: Number(parsed.confidence || 0),
      reason: String(parsed.reason || '').trim().slice(0, 240),
    };
  } catch (_error) {
    return {
      status: 'approved',
      confidence: 0,
      reason: 'AI 返回 JSON 解析失败，按举报不成立处理',
    };
  }
};

async function runReportModeration({
  content,
  reasonCode,
  reasonText,
}: {
  content: string;
  reasonCode: string;
  reasonText: string;
}) {
  if (!MODERATION_API_KEY) {
    return {
      status: 'approved',
      confidence: 0,
      reason: '未配置审核 API Key，举报已记录但未自动下架',
    };
  }

  const reasonLabel = REPORT_REASON_LABELS[reasonCode] || '其他';
  const response = await fetch(MODERATION_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${MODERATION_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODERATION_MODEL_ID,
      stream: false,
      temperature: 0,
      max_tokens: 160,
      messages: [
        {
          role: 'system',
          content: [
            '你是社区举报复核助手。',
            '请判断被举报内容是否明确违反社区规范。',
            '只有在非常确定存在色情低俗、违法交易、人身攻击骚扰、隐私泄露、垃圾广告、恶意刷屏等问题时，才输出 rejected。',
            '普通争论、正常吐槽、观点不同、轻微负面情绪，默认输出 approved。',
            '请严格只输出 JSON：{"status":"approved|rejected","confidence":0~1,"reason":"简短原因"}',
          ].join('\n'),
        },
        {
          role: 'user',
          content: [
            `举报原因：${reasonLabel}`,
            reasonText ? `补充说明：${reasonText}` : '',
            `被举报内容：\n${content}`,
          ].filter(Boolean).join('\n\n'),
        },
      ],
    }),
  });

  if (!response.ok) {
    return {
      status: 'approved',
      confidence: 0,
      reason: `审核服务请求失败：${response.status}`,
    };
  }

  const data = await response.json();
  const aiText = data?.choices?.[0]?.message?.content || '';
  return parseModerationJson(aiText);
}

Deno.serve(async (request) => {
  const origin = request.headers.get('origin');

  if (request.method === 'OPTIONS') {
    return new Response('ok', {
      headers: buildCorsHeaders(origin),
    });
  }

  if (request.method !== 'POST') {
    return jsonResponse(
      { ok: false, code: 'METHOD_NOT_ALLOWED', message: '仅支持 POST 请求。' },
      405,
      origin,
    );
  }

  try {
    const authHeader = request.headers.get('authorization') || '';
    const body = await request.json();
    const targetType = normalizeText(body?.targetType, 20);
    const targetId = normalizeText(body?.targetId, 80);
    const reasonCode = normalizeText(body?.reasonCode, 40);
    const reasonText = normalizeText(body?.reasonText, 300);

    if (targetType !== 'post') {
      return jsonResponse(
        { ok: false, code: 'UNSUPPORTED_TARGET', message: '第一版仅支持举报帖子。' },
        400,
        origin,
      );
    }

    if (!targetId || !REPORT_REASON_LABELS[reasonCode]) {
      return jsonResponse(
        { ok: false, code: 'INVALID_INPUT', message: '请选择举报原因。' },
        400,
        origin,
      );
    }

    const serviceClient = createServiceClient();
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    const { data: userData, error: userError } = await serviceClient.auth.getUser(token);
    const reporterId = userData?.user?.id || '';

    if (userError || !reporterId) {
      return jsonResponse(
        { ok: false, code: 'NOT_AUTHENTICATED', message: '请先登录后再举报。' },
        401,
        origin,
      );
    }

    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { count: recentReportCount } = await serviceClient
      .from('content_reports')
      .select('id', { count: 'exact', head: true })
      .eq('reporter_id', reporterId)
      .gte('created_at', tenMinutesAgo);

    if (Number(recentReportCount || 0) >= 10) {
      return jsonResponse(
        { ok: false, code: 'REPORT_RATE_LIMIT', message: '举报提交较频繁，请稍后再试。' },
        429,
        origin,
      );
    }

    const { data: post, error: postError } = await serviceClient
      .from('posts')
      .select('id, content, author_id, status')
      .eq('id', targetId)
      .single();

    if (postError || !post?.id) {
      return jsonResponse(
        { ok: false, code: 'POST_NOT_FOUND', message: '帖子不存在或已被删除。' },
        404,
        origin,
      );
    }

    if (post.author_id === reporterId) {
      return jsonResponse(
        { ok: false, code: 'SELF_REPORT_NOT_ALLOWED', message: '不能举报自己的帖子。' },
        400,
        origin,
      );
    }

    const { data: existingReport } = await serviceClient
      .from('content_reports')
      .select('id, status')
      .eq('reporter_id', reporterId)
      .eq('target_type', 'post')
      .eq('target_id', targetId)
      .maybeSingle();

    if (existingReport?.id) {
      return jsonResponse(
        { ok: false, code: 'ALREADY_REPORTED', message: '你已经举报过这条帖子了。' },
        409,
        origin,
      );
    }

    const { data: report, error: reportError } = await serviceClient
      .from('content_reports')
      .insert({
        reporter_id: reporterId,
        target_type: 'post',
        target_id: post.id,
        target_author_id: post.author_id,
        reason_code: reasonCode,
        reason_text: reasonText || null,
        status: 'reviewing',
      })
      .select('id')
      .single();

    if (reportError || !report?.id) {
      return jsonResponse(
        { ok: false, code: 'REPORT_CREATE_FAILED', message: '举报提交失败，请稍后重试。' },
        500,
        origin,
      );
    }

    const moderation = await runReportModeration({
      content: String(post.content || ''),
      reasonCode,
      reasonText,
    });

    const isViolation = moderation.status === 'rejected' && Number(moderation.confidence || 0) >= 0.9;

    if (isViolation) {
      await serviceClient
        .from('posts')
        .update({
          status: 'rejected',
          updated_at: new Date().toISOString(),
        })
        .eq('id', post.id);

      await serviceClient
        .from('notifications')
        .insert({
          recipient_id: post.author_id,
          sender_id: reporterId,
          type: 'post_report_rejected',
          post_id: post.id,
          status: 'unread',
          content: '您的帖子经举报复核后未通过社区规范，已被下架。',
        });
    }

    await serviceClient
      .from('content_reports')
      .update({
        status: isViolation ? 'resolved' : 'rejected',
        ai_result: moderation.status,
        ai_reason: moderation.reason || null,
        handled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', report.id);

    return jsonResponse(
      {
        ok: true,
        reportId: report.id,
        result: isViolation ? 'removed' : 'recorded',
        message: isViolation
          ? '举报已通过复核，相关帖子已下架。'
          : '举报已收到，本次自动复核暂未判定违规。',
      },
      200,
      origin,
    );
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        code: 'REPORT_REVIEW_FAILED',
        message: error instanceof Error ? error.message : '举报处理失败，请稍后重试。',
      },
      500,
      origin,
    );
  }
});
```

## 前端 API 草案

新增或放入 `src/utils/api/forum-api.js`：

```js
export async function reportPostWithAIReview(postId, reasonCode, reasonText = '') {
  const safePostId = String(postId || '').trim();
  const safeReasonCode = String(reasonCode || '').trim();
  const safeReasonText = String(reasonText || '').trim().slice(0, 300);

  if (!safePostId || !safeReasonCode) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({ message: '请选择举报原因' })
    };
  }

  const { data, error } = await supabase.functions.invoke('forum-report-review', {
    body: {
      targetType: 'post',
      targetId: safePostId,
      reasonCode: safeReasonCode,
      reasonText: safeReasonText
    }
  });

  if (error || !data?.ok) {
    return {
      ok: false,
      data,
      error: normalizeDbError(error || { message: data?.message || '举报提交失败' })
    };
  }

  invalidateByTags(['posts', 'notifications']);
  return { ok: true, data, error: null };
}
```

## 前端 UI 草案

举报原因：

```js
const REPORT_REASONS = [
  { value: 'spam', label: '垃圾广告' },
  { value: 'porn', label: '色情低俗' },
  { value: 'harassment', label: '人身攻击/骚扰' },
  { value: 'illegal', label: '违法违规' },
  { value: 'privacy', label: '侵犯隐私' },
  { value: 'malicious', label: '恶意刷屏/引战' },
  { value: 'other', label: '其他' }
];
```

帖子操作栏加按钮：

```vue
<button
  v-if="isLoggedIn && post.author_id !== userInfo.id"
  class="action-item-v2 report-btn-v2"
  @click="openReportDialog(post)"
>
  举报
</button>
```

提交逻辑：

```js
const reportDialog = ref({
  visible: false,
  post: null,
  reasonCode: '',
  reasonText: '',
  submitting: false
});

const openReportDialog = (post) => {
  if (!isLoggedIn.value) {
    showLoginModal.value = true;
    return;
  }

  reportDialog.value = {
    visible: true,
    post,
    reasonCode: '',
    reasonText: '',
    submitting: false
  };
};

const submitReport = async () => {
  if (!reportDialog.value.post?.id || !reportDialog.value.reasonCode) {
    showModal('warning', '请选择原因', '请选择一个举报原因后再提交。');
    return;
  }

  reportDialog.value.submitting = true;
  try {
    const result = await reportPostWithAIReview(
      reportDialog.value.post.id,
      reportDialog.value.reasonCode,
      reportDialog.value.reasonText
    );

    if (!result.ok) throw result.error;

    reportDialog.value.visible = false;
    showModal('success', '举报已提交', result.data?.message || '我们会尽快处理。');

    if (result.data?.result === 'removed') {
      forumData.value = forumData.value.filter((post) => post.id !== reportDialog.value.post.id);
    }
  } catch (error) {
    showModal('error', '举报失败', error?.message || '请稍后重试');
  } finally {
    reportDialog.value.submitting = false;
  }
};
```

弹窗模板草案：

```vue
<div v-if="reportDialog.visible" class="report-modal-overlay" @click.self="reportDialog.visible = false">
  <div class="report-modal">
    <h3>举报帖子</h3>
    <div class="report-reason-list">
      <button
        v-for="reason in REPORT_REASONS"
        :key="reason.value"
        type="button"
        :class="{ active: reportDialog.reasonCode === reason.value }"
        @click="reportDialog.reasonCode = reason.value"
      >
        {{ reason.label }}
      </button>
    </div>
    <textarea
      v-model="reportDialog.reasonText"
      maxlength="300"
      placeholder="补充说明（可选）"
    ></textarea>
    <div class="report-actions">
      <button @click="reportDialog.visible = false">取消</button>
      <button :disabled="reportDialog.submitting" @click="submitReport">
        {{ reportDialog.submitting ? '提交中...' : '提交举报' }}
      </button>
    </div>
  </div>
</div>
```

## 消息中心展示

在 `getNotificationTitle` / `getNotificationPreview` 增加：

```js
case 'post_report_rejected':
  return '举报复核：帖子已下架';
```

```js
if (notification.type === 'post_report_rejected') {
  return notification.content || '您的帖子经举报复核后未通过社区规范，已被下架。';
}
```

## 与现有机制的关系

当前已有：

- `posts.status = approved/rejected`
- 帖子列表只读 approved
- 发帖异步审核失败时会下架并通知
- `moderation_logs` 审核日志

举报复核可以复用 `posts.status = rejected`，不需要新下架字段。

建议后续把举报 AI 结果也写入 `moderation_logs`：

```sql
insert into public.moderation_logs (
  target_id,
  target_type,
  ai_result,
  ai_reason,
  moderator_id
) values (
  post.id,
  'post_report',
  moderation.status,
  moderation.reason,
  reporterId
);
```

## 风险与处理策略

### AI 误杀

第一版建议阈值严格一点：

```ts
const isViolation = moderation.status === 'rejected'
  && Number(moderation.confidence || 0) >= 0.9;
```

低于 0.9 的举报只记录，不自动下架。

### 恶意举报

已做两层限制：

- 同一用户同一帖子只能举报一次。
- 10 分钟最多举报 10 次。

后续可加：

- 多次举报不成立的用户限制举报功能。
- 多人举报同一帖子达到 3 次，先临时隐藏，再人工复核。

### AI 服务不可用

服务不可用时：

- 举报记录保留。
- 不自动下架。
- 返回“举报已记录，等待人工处理”。

## 第一版实施清单

1. 新增 `content_reports` 表和 RLS。
2. 新增 `forum-report-review` Edge Function。
3. 新增 `reportPostWithAIReview` 前端 API。
4. 帖子列表和帖子详情页增加「举报」按钮。
5. 增加举报弹窗。
6. 消息中心识别 `post_report_rejected` 类型。
7. 配置 Edge Function 环境变量。
8. 手动测试：
   - 正常举报低风险帖子，不下架。
   - 举报高风险测试帖，自动下架。
   - 发帖人收到通知。
   - 同一用户重复举报同一帖子被拦截。
   - 未登录举报被拦截。

