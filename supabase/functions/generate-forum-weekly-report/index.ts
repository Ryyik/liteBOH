import { createClient } from 'npm:@supabase/supabase-js@2.99.1';
import { buildCorsHeaders, jsonResponse } from '../_shared/cors.ts';

const supabaseUrl = String(Deno.env.get('SUPABASE_URL') || '').trim();
const serviceRoleKey = String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();
const vaultMasterKey = String(Deno.env.get('API_KEY_VAULT_MASTER_KEY') || '').trim();
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const client = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

const bearer = (request: Request) => String(request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
const safeText = (value: unknown, max = 5000) => String(value || '').trim().slice(0, max);
const isoDate = (date: Date) => date.toISOString().slice(0, 10);

const getShanghaiDate = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return `${value('year')}-${value('month')}-${value('day')}`;
};

const getPreviousWeek = (input?: string) => {
  const anchorDate = /^\d{4}-\d{2}-\d{2}$/.test(String(input || '')) ? String(input) : getShanghaiDate();
  // Use UTC noon only as a date arithmetic carrier; the source date is Shanghai-local.
  const anchor = new Date(`${anchorDate}T12:00:00Z`);
  const day = anchor.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  const monday = new Date(anchor.getTime() - (daysSinceMonday + 7) * 86400000);
  const sunday = new Date(monday.getTime() + 6 * 86400000);
  return { weekStart: isoDate(monday), weekEnd: isoDate(sunday) };
};

const base64ToBytes = (value: string) => {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

const decryptSecret = async (payload: string) => {
  if (!vaultMasterKey || vaultMasterKey.length < 24) throw new Error('未配置 API_KEY_VAULT_MASTER_KEY。');
  const [rawIv, rawCiphertext] = String(payload || '').split('.');
  if (!rawIv || !rawCiphertext) throw new Error('API Key 密文格式无效。');
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(vaultMasterKey));
  const key = await crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['decrypt']);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(rawIv) },
    key,
    base64ToBytes(rawCiphertext),
  );
  return decoder.decode(plaintext);
};

const parseJson = (text: string) => {
  const clean = String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const fenced = clean.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] || clean;
  const start = fenced.indexOf('{');
  const end = fenced.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('AI 未返回有效 JSON。');
  return JSON.parse(fenced.slice(start, end + 1));
};

const normalizeArray = (value: unknown, max: number) => Array.isArray(value) ? value.slice(0, max) : [];

const callProvider = async (provider: string, apiKey: string, apiUrl: string, payload: Record<string, unknown>) => {
  const defaults: Record<string, string> = {
    siliconflow: 'https://api.siliconflow.cn/v1/chat/completions',
    zhipu: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    openrouter: 'https://openrouter.ai/api/v1/chat/completions',
  };
  let response: Response;
  try {
    response = await fetch(apiUrl || defaults[provider] || defaults.siliconflow, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(140000),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new Error('周报模型响应超时，请减少帖子范围或更换更快的模型后重试。');
    }
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('周报模型请求被中止，请稍后重试。');
    }
    throw error;
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(safeText(data?.error?.message || data?.message || `AI 请求失败 (${response.status})`, 300));
  return safeText(data?.choices?.[0]?.message?.content, 30000);
};

const isAdminRequest = async (request: Request) => {
  const token = bearer(request);
  if (!token) return false;
  if (serviceRoleKey && token === serviceRoleKey) return true;
  const { data } = await client.auth.getUser(token).catch(() => ({ data: null }));
  const userId = String(data?.user?.id || '').trim();
  if (!userId) return false;
  const { data: profile } = await client.from('profiles').select('role').eq('id', userId).maybeSingle();
  return ['admin', 'superadmin'].includes(String(profile?.role || '').trim());
};

Deno.serve(async (request) => {
  const origin = request.headers.get('origin');
  if (request.method === 'OPTIONS') return new Response('ok', { headers: buildCorsHeaders(origin) });
  if (request.method !== 'POST') return jsonResponse({ ok: false, message: '仅支持 POST 请求。' }, 405, origin);

  try {
    if (!(await isAdminRequest(request))) return jsonResponse({ ok: false, message: '仅管理员可生成论坛周报。' }, 403, origin);
    const body = await request.json().catch(() => ({}));
    const { weekStart, weekEnd } = body?.weekStart && body?.weekEnd
      ? { weekStart: safeText(body.weekStart, 10), weekEnd: safeText(body.weekEnd, 10) }
      : getPreviousWeek(body?.anchorDate);

    const { data: config, error: configError } = await client
      .from('lab_ai_model_configs')
      .select('feature_key, model_id, temperature, max_tokens, api_key_purpose, is_active')
      .eq('feature_key', 'forum-weekly-report')
      .maybeSingle();
    if (configError) throw configError;
    if (!config?.is_active) throw new Error('论坛周报 AI 配置未启用。');

    const { data: model, error: modelError } = await client
      .from('freemodels')
      .select('model_id, provider, provider_label')
      .eq('model_id', config.model_id)
      .eq('is_active', true)
      .maybeSingle();
    if (modelError) throw modelError;
    if (!model) throw new Error('周报配置的模型不在启用的免费模型库中。');

    const purpose = safeText(config.api_key_purpose || 'chat', 60).toLowerCase();
    const { data: keyRow, error: keyError } = await client
      .from('api_key_vault')
      .select('encrypted_value, status, metadata')
      .eq('provider', model.provider)
      .eq('purpose', purpose)
      .maybeSingle();
    if (keyError) throw keyError;
    if (!keyRow?.encrypted_value || keyRow.status !== 'active') throw new Error(`未找到启用的 ${model.provider}/${purpose} API Key。`);
    const apiKey = await decryptSecret(keyRow.encrypted_value);
    const apiUrl = safeText(keyRow.metadata?.apiUrl, 240);

    const { data: posts, error: postsError } = await client
      .from('posts')
      .select('id, title, content, author_username, tag, created_at, like_count, comment_count')
      .or('status.is.null,status.eq.approved')
      .gte('created_at', `${weekStart}T00:00:00+08:00`)
      .lt('created_at', `${new Date(new Date(`${weekEnd}T12:00:00+08:00`).getTime() + 86400000).toISOString().slice(0, 10)}T00:00:00+08:00`)
      .order('created_at', { ascending: false })
      .limit(50);
    if (postsError) throw postsError;

    const allPostRows = (posts || []).map((post) => ({
      id: post.id,
      title: safeText(post.title || '无标题', 160),
      content: safeText(post.content, 360),
      author: safeText(post.author_username || '社区成员', 80),
      tag: safeText(post.tag, 40),
      created_at: post.created_at,
      likes: Number(post.like_count || 0),
      comments: Number(post.comment_count || 0),
    }));
    // Keep the prompt bounded while prioritizing posts that actually drove discussion.
    const postRows = [...allPostRows]
      .sort((a, b) => (b.likes + b.comments) - (a.likes + a.comments))
      .slice(0, 30);
    const communityMetrics = {
      post_count: allPostRows.length,
      active_authors: new Set(allPostRows.map((post) => post.author).filter(Boolean)).size,
      comment_count: allPostRows.reduce((total, post) => total + post.comments, 0),
      like_count: allPostRows.reduce((total, post) => total + post.likes, 0),
    };

    const prompt = `你是 BOH 社区编辑。请基于 ${weekStart} 至 ${weekEnd} 的论坛帖子，生成一份详细但易读的中文周报。必须只返回 JSON，不要 Markdown 代码围栏。\nJSON 结构：{\n  "summary": "120-220字总览",\n  "metrics": {"post_count": 0, "active_authors": 0, "comment_count": 0, "like_count": 0},\n  "topics": [{"name":"主题名","summary":"80-150字总结","post_count":0,"post_ids":[]}],\n  "featured_posts": [{"post_id":"原始id","title":"帖子标题","summary":"80-180字详细摘要","reason":"入选理由"}],\n  "open_questions": ["值得继续讨论的问题"]\n}\n要求：topics 最多 5 个，featured_posts 最多 6 个；帖子摘要要说明背景、关键观点和讨论价值，不要虚构原文没有的信息；优先覆盖不同主题。\n帖子数据：${JSON.stringify(postRows)}`;

    const content = await callProvider(String(model.provider), apiKey, apiUrl, {
      model: config.model_id,
      messages: [
        { role: 'system', content: '你是严谨的中文社区周报编辑。' },
        { role: 'user', content: prompt },
      ],
      stream: false,
      temperature: Number(config.temperature ?? 0.2),
      max_tokens: Math.min(2600, Math.max(256, Number(config.max_tokens || 4096))),
    });
    const report = parseJson(content);
    const sourceIds = postRows.map((post) => post.id).filter(Boolean);
    const payload = {
      week_start: weekStart,
      week_end: weekEnd,
      status: 'published',
      summary: safeText(report.summary, 1200),
      metrics: communityMetrics,
      topics: normalizeArray(report.topics, 5),
      featured_posts: normalizeArray(report.featured_posts, 6),
      open_questions: normalizeArray(report.open_questions, 8),
      source_post_ids: sourceIds,
      model_id: config.model_id,
      config_snapshot: { temperature: config.temperature, max_tokens: config.max_tokens, api_key_purpose: purpose },
      generated_at: new Date().toISOString(),
      error_message: '',
    };
    const { data: saved, error: saveError } = await client
      .from('forum_weekly_reports')
      .upsert(payload, { onConflict: 'week_start,week_end' })
      .select('*')
      .single();
    if (saveError) throw saveError;
    return jsonResponse({ ok: true, data: saved }, 200, origin);
  } catch (error) {
    const message = safeText(error instanceof Error ? error.message : error, 500);
    return jsonResponse({ ok: false, message }, 500, origin);
  }
});
