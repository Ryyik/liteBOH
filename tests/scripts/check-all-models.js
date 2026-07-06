// 验证脚本：直接调用 SiliconFlow API 测试白名单里所有模型是否都能正常响应
// 用法: node tests/scripts/check-all-models.js

import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// 直接读 .env 文件（不依赖 dotenv）
const envPath = resolve(process.cwd(), '.env');
const envContent = readFileSync(envPath, 'utf8');
const envMap = Object.fromEntries(
  envContent
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const idx = line.indexOf('=');
      return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()];
    })
);

const API_KEY = envMap.VITE_SILICON_CLOUD_API_KEY;
const API_URL = envMap.VITE_SILICON_CLOUD_URL || 'https://api.siliconflow.cn/v1/chat/completions';

if (!API_KEY) {
  console.error('No VITE_SILICON_CLOUD_API_KEY found in .env');
  process.exit(1);
}

// 从代码里抓出来的白名单（与 siliconflow-free-models.js 保持一致）
const CHAT_MODELS = [
  'Qwen/Qwen3.5-4B',
  'Qwen/Qwen3-8B',
  'deepseek-ai/DeepSeek-R1-0528-Qwen3-8B',
  'THUDM/GLM-Z1-9B-0414',
  'Qwen/Qwen2.5-7B-Instruct',
  'nex-agi/Nex-N2-Pro', // 新增
  'THUDM/GLM-4-9B-0414',
  'tencent/Hunyuan-MT-7B'
];

// AIPlaza 额外有的模型
const EXTRA_AIPLAZA_MODELS = [
  'deepseek-ai/DeepSeek-R1-Distill-Qwen-7B',
  'internlm/internlm2_5-7b-chat'
];

const ALL_MODELS = [...CHAT_MODELS, ...EXTRA_AIPLAZA_MODELS];

const testPrompt = '用一句话自我介绍，不要超过30字。';

const callModel = async (modelId) => {
  const startTime = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: modelId,
        messages: [
          { role: 'system', content: '<role>你是一个简洁的助手。</role>' },
          { role: 'user', content: testPrompt }
        ],
        max_tokens: 80,
        temperature: 0.5,
        stream: false
      })
    });
    const elapsed = Date.now() - startTime;
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, status: res.status, elapsed, raw: text.slice(0, 300) };
    }
    let payload;
    try { payload = JSON.parse(text); } catch (_e) { payload = null; }
    const content = payload?.choices?.[0]?.message?.content
      || payload?.choices?.[0]?.text
      || '';
    return {
      ok: true,
      status: res.status,
      elapsed,
      reply: String(content).trim().slice(0, 100),
      finishReason: payload?.choices?.[0]?.finish_reason,
      usage: payload?.usage || null
    };
  } catch (err) {
    return {
      ok: false,
      status: 'ERR',
      elapsed: Date.now() - startTime,
      raw: err?.name === 'AbortError' ? 'TIMEOUT 30s' : (err?.message || String(err))
    };
  } finally {
    clearTimeout(timeoutId);
  }
};

const main = async () => {
  console.log('═'.repeat(70));
  console.log(`SiliconFlow 模型健康检查`);
  console.log(`API URL: ${API_URL}`);
  console.log(`模型数: ${ALL_MODELS.length}（含 2 个 AIPlaza 专属）`);
  console.log(`提示词: "${testPrompt}"`);
  console.log('═'.repeat(70));

  const results = [];
  for (const modelId of ALL_MODELS) {
    process.stdout.write(`  ⏳ ${modelId.padEnd(46)} ... `);
    const result = await callModel(modelId);
    results.push({ modelId, ...result });

    if (result.ok) {
      const reply = result.reply ? `"${result.reply}"` : '(空响应)';
      console.log(`✅ ${result.status}  ${String(result.elapsed).padStart(5)}ms  ${reply}`);
    } else {
      console.log(`❌ ${result.status}  ${String(result.elapsed).padStart(5)}ms  ${result.raw}`);
    }
  }

  console.log('\n' + '═'.repeat(70));
  console.log('汇总:');
  const ok = results.filter((r) => r.ok);
  const fail = results.filter((r) => !r.ok);
  console.log(`  成功: ${ok.length}/${results.length}`);
  console.log(`  失败: ${fail.length}/${results.length}`);

  if (fail.length > 0) {
    console.log('\n失败明细:');
    fail.forEach((r) => {
      console.log(`  ❌ ${r.modelId}`);
      console.log(`     status=${r.status} | ${r.raw}`);
    });
  }

  console.log('\n按耗时排序:');
  [...results].sort((a, b) => a.elapsed - b.elapsed).forEach((r) => {
    const flag = r.ok ? '✅' : '❌';
    console.log(`  ${flag} ${String(r.elapsed).padStart(5)}ms  ${r.modelId}`);
  });
};

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
