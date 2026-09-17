#!/usr/bin/env node
/**
 * Gemini 反代端到端验证 —— 部署后跑这一条，三个检查一次过完。
 *
 * 用法：
 *   WORKER_URL=https://boh-gemini-proxy.<你的子域>.workers.dev \
 *   PROXY_TOKEN=<你设的令牌> \
 *   GEMINI_MODEL=<AI Studio 里的模型 id> \
 *   node cloudflare/gemini-proxy/verify.mjs
 *
 * 退出码 0 = 全过；1 = 有失败项。
 */

const WORKER_URL = String(process.env.WORKER_URL || '').replace(/\/+$/, '');
const PROXY_TOKEN = String(process.env.PROXY_TOKEN || '').trim();
const MODEL = String(process.env.GEMINI_MODEL || '').trim();

const results = [];
const record = (name, ok, detail) => results.push({ name, ok, detail });

const authHeaders = () => ({
  'Content-Type': 'application/json',
  ...(PROXY_TOKEN ? { Authorization: `Bearer ${PROXY_TOKEN}` } : {})
});

const explainStatus = (status, bodyText) => {
  if (status === 404) return '路径没重写。Google 没有 /v1/chat/completions，Worker 必须映射到 /v1beta/openai/chat/completions。';
  if (status === 401) return '鉴权失败。PROXY_TOKEN 与 Worker 里设的不一致，或 Worker 未注入 GEMINI_API_KEY。';
  if (status === 400 && /frequency_penalty|presence_penalty|stream_options|unknown|Unsupported/i.test(bodyText)) {
    return '上游拒收 OpenAI 专有字段 —— body 清洗没生效，说明跑的还是旧版裸转代码。';
  }
  if (status === 400) return '上游 400。看下面回显的原始报文，常见原因是 model id 写错或参数越界。';
  if (status === 429) return '上游限流。Gemini 免费额度用完了，等一会儿或换 key。';
  if (status >= 500) return '上游或边缘出错。先看 Worker 日志（wrangler tail）。';
  return '';
};

async function checkHealth() {
  try {
    const res = await fetch(`${WORKER_URL}/health`);
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
      record('1. /health 可达', false, `HTTP ${res.status} ${JSON.stringify(data)}`);
      return false;
    }
    const problems = [];
    if (!data.keyConfigured) problems.push('GEMINI_API_KEY 没读到 → 跑 npx wrangler secret put GEMINI_API_KEY');
    if (!data.tokenRequired) problems.push('PROXY_TOKEN 没设 → 当前是公开代理，任何人都能用');
    record('1. /health 可达', problems.length === 0, problems.length ? problems.join('；') : `reasoning_effort=${data.reasoningEffort}`);
    return true;
  } catch (err) {
    record('1. /health 可达', false, `连不上：${err.message}。域名写错了？还是代理环境的锅？试试 NO_PROXY=${new URL(WORKER_URL).host} node ...`);
    return false;
  }
}

async function checkNonStream() {
  let res;
  try {
    res = await fetch(`${WORKER_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: '只回复两个字：收到' }],
        max_tokens: 64
      })
    });
  } catch (err) {
    record('2. 非流式对话', false, `请求失败：${err.message}`);
    return;
  }

  const raw = await res.text();
  if (!res.ok) {
    record('2. 非流式对话', false, `HTTP ${res.status} — ${explainStatus(res.status, raw)}\n      原始报文：${raw.slice(0, 300)}`);
    return;
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    record('2. 非流式对话', false, `响应不是 JSON，说明不是 OpenAI 兼容格式：${raw.slice(0, 200)}`);
    return;
  }

  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    record(
      '2. 非流式对话',
      false,
      'HTTP 200 但没有 choices[0].message.content —— 典型的「假绿」。' +
        '要么上游仍是原生协议（应见 candidates[].content.parts[]），要么 thinking token 把 max_tokens 吃光了。' +
        `\n      实际报文：${raw.slice(0, 300)}`
    );
    return;
  }

  record('2. 非流式对话', true, `回复「${String(content).trim().slice(0, 30)}」`);
}

async function checkStream() {
  let res;
  try {
    res = await fetch(`${WORKER_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { ...authHeaders(), Accept: 'text/event-stream' },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: '从 1 数到 10，用空格分隔' }],
        max_tokens: 128,
        stream: true
      })
    });
  } catch (err) {
    record('3. 流式逐字返回', false, `请求失败：${err.message}`);
    return;
  }

  if (!res.ok) {
    const raw = await res.text();
    record('3. 流式逐字返回', false, `HTTP ${res.status} — ${explainStatus(res.status, raw)}`);
    return;
  }

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('text/event-stream')) {
    record('3. 流式逐字返回', false, `content-type 是 "${contentType}"，不是 text/event-stream`);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let chunkCount = 0;
  let text = '';
  const firstChunkAt = Date.now();
  let spreadMs = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const parsed = JSON.parse(payload);
        const delta = parsed?.choices?.[0]?.delta?.content || '';
        if (!delta) continue;
        if (chunkCount === 0) spreadMs = Date.now() - firstChunkAt;
        chunkCount += 1;
        text += delta;
      } catch {
        /* 非 JSON 行跳过 */
      }
    }
  }

  if (chunkCount === 0) {
    record('3. 流式逐字返回', false, 'SSE 连上了但一个 delta.content 都没解析出来 —— 格式不是 OpenAI SSE。');
    return;
  }
  if (chunkCount === 1) {
    record(
      '3. 流式逐字返回',
      false,
      `只收到 1 个 chunk（首块就等 ${spreadMs}ms）—— 流被缓冲了，前端会「等半天然后瞬间全出」。检查 Worker 是否 return 了 response.body 而不是 await response.text()。`
    );
    return;
  }

  record('3. 流式逐字返回', true, `${chunkCount} 个 chunk，首块 ${spreadMs}ms，内容「${text.trim().slice(0, 40)}」`);
}

async function main() {
  if (!WORKER_URL) {
    console.error('缺少 WORKER_URL。用法见文件头注释。');
    process.exit(2);
  }
  if (!MODEL) {
    console.error('缺少 GEMINI_MODEL —— 就是你在 AI Studio 里看到的模型 id，例如 gemini-3-flash。');
    process.exit(2);
  }
  if (!PROXY_TOKEN) {
    console.warn('提醒：没传 PROXY_TOKEN，将不带 Authorization 请求（仅当 Worker 未设 PROXY_TOKEN 时能通）。\n');
  }

  console.log(`目标：${WORKER_URL}\n模型：${MODEL}\n`);

  if (await checkHealth()) {
    await checkNonStream();
    await checkStream();
  }

  console.log('结果');
  console.log('─'.repeat(72));
  for (const item of results) {
    console.log(`${item.ok ? 'PASS' : 'FAIL'}  ${item.name}`);
    if (item.detail) console.log(`      ${item.detail}`);
  }
  console.log('─'.repeat(72));

  const failed = results.filter((item) => !item.ok);
  if (failed.length) {
    console.log(`\n${failed.length} 项未通过。修完再跑一次。`);
    process.exit(1);
  }

  console.log('\n三项全过 → 可以接着做后台配置：`bohai_model_configs.api_url` 指向本 Worker 的 /v1/chat/completions。');
}

main();
