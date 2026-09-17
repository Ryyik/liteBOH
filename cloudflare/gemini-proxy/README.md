# Gemini 反代 Worker

给 BOH 的 `api-key-vault` Edge Function 当上游。**这个 Worker 是必需的，不能省** —— 见下面「为什么不能裸转」。

## 部署

```bash
cd cloudflare/gemini-proxy
npx wrangler login                 # 浏览器点一次授权，之后就不用再登
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put PROXY_TOKEN
npx wrangler deploy
```

`PROXY_TOKEN` 自己编一串随机字符串（`openssl rand -hex 24`）。它会被存进 Supabase 的 `api_keys` 表，用来代替真 Key。

可选：`npx wrangler secret put GEMINI_REASONING_EFFORT`，默认 `low`，设 `off` 则不注入。

## 验证

```bash
WORKER_URL=https://boh-gemini-proxy.<你的子域>.workers.dev \
PROXY_TOKEN=<刚设的令牌> \
GEMINI_MODEL=<AI Studio 里的模型 id> \
node cloudflare/gemini-proxy/verify.mjs
```

三项全 PASS 才算通：`/health` 可达 → 非流式拿到 `choices[0].message.content` → 流式收到多个 chunk。

## 为什么不能裸转

原来那版是 `url.host = 'generativelanguage.googleapis.com'` 的纯透传，有四个问题：

| 问题 | 症状 |
|---|---|
| 路径没重写 | `/v1/chat/completions` 打到 Google → **404**。Google 的 OpenAI 兼容层在 `/v1beta/openai/` 下 |
| body 没清洗 | vault 的 `buildRuntimePayload` 硬编码发 `frequency_penalty`（默认 0.06）→ **已实测 400**，见下 |
| 响应头透传 | 边缘已解压 body 但 `content-encoding` 还传下去 → 下游二次解码 |
| 无鉴权 | `ACAO: *` + 无限转发 = 公开 Gemini 代理，别人能刷你的 Cloudflare 配额 |

另外 `newHeaders.set('Host', ...)` 在 Workers 里是无效操作，已删。

## 实测结论（2026-09-17，直打 Google 确认，非推测）

**1. `frequency_penalty` 会被拒，清洗是必需的**

```
POST /v1beta/openai/chat/completions
{..., "frequency_penalty": 0.06, "stream_options": {"include_usage": true}}
→ HTTP 400  Invalid JSON payload received.
            Unknown name "frequency_penalty": Cannot find field.
```

Vertex 版的兼容层会静默忽略不支持的参数；**AI Studio 版（generativelanguage）直接 400**。vault 一定会发这个字段，所以不剥就必挂。

**2. `reasoning_effort` 只能给 `low`，`minimal` 会 400**

```
reasoning_effort: "minimal"  → HTTP 400  Thinking level MINIMAL is not supported for this model
reasoning_effort: "low"      → HTTP 200  正常
```

本 Worker 默认注入 `low`，是对的。别改成 `minimal`。

**3. `max_tokens` 太小时输出为空（假绿的原样复现）**

thinking 也从这个预算里扣。`max_tokens: 16` 实测 `finish_reason: "length"`、content 为空、耗时 12.9 秒；`64` 起才稳定 `finish=stop`。

顺带说明流式下这个现象的报文长这样 —— 形状完全合法，只是没内容，**不报错**：

```json
data: {"choices":[{"delta":{"extra_content":{"google":{"thought_signature":"EsIBCr8B..."}},
       "role":"assistant"},"finish_reason":"length","index":0}]}
data: [DONE]
```

→ `bohai_model_configs.max_tokens` 别设太小，建议 ≥ 512。

**4. 非流式带 usage，流式不带**

非流式响应默认就有 `usage`。流式在剥掉 `stream_options` 后不返回 usage，vault 的 `normalizeTokenUsage`（`api-key-vault/index.ts:1081`）会退化成按字符估算配额。有 fallback，不会报错，只是统计精度下降。

**5. `reasoning_effort` 只能注入给 Gemini 系**

实测 `gemma-4-31b-it` / `gemma-4-26b-a4b-it` 一旦收到这个字段就 `400 Thinking level is not supported for this model`。所以 `sanitizeBody` 按 `model` 前缀放行：只有 `gemini*` 才注入。反证已做 —— 修复前两个 gemma 都是 400，修复后转 200。

但 Gemma 即便能调通也不建议用：它不受 `reasoning_effort` 约束，会把思考过程以 `<thought>` 标签**混进正文**（实测原文 `"<thought>* Input: \"用一句话介绍你自己\" ...`），直接展示给用户会出问题。

**6. 免费额度很紧**

连续探测十几次就吃到 `429 You exceeded your current quota`。上线前想清楚 BOH 的日活会不会撞上 —— vault 那边**没有 provider 降级机制**，429 就是直接失败给用户。

## 已验证可用

`gemini-flash-latest` 三项端到端全过（非流式拿到「收到」、流式 2 个 chunk）。`/v1/models` 返回 58 个模型。

## 代理环境注意事项

本机有 `http_proxy` / `https_proxy` 环境变量时，wrangler 会走代理，OAuth 回调（`localhost:8976`）容易卡住。登录或部署失败时：

```bash
NO_PROXY=localhost,127.0.0.1 npx wrangler login
```

挂自定义域时 URL 必须是 **https**：`validateRuntimeApiUrl`（`supabase/functions/api-key-vault/index.ts:77`）会拒绝 http 和私有地址，而且是**静默回退**到 siliconflow 默认地址 —— 症状是「莫名 401」，不是「URL 非法」。
