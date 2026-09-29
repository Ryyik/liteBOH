#!/usr/bin/env node
/**
 * check-bohai-generation-params.mjs — BOH AI 生成参数单一真源门禁
 *
 * 背景：2026-09-29 审计发现 21 处 temperature / max_tokens / top_p 字面量散在 9 个文件
 * （含 Orchestrator / Synthesizer 等集群核心），调参要改 N 处且行为不可审计。
 * 真源：src/views/BOHAI/generation-params.js（TASK_GENERATION_PRESETS，按「任务语义」取参）；
 * chat-engine-config.js 的 GENERATION_PROFILE_BY_MODE 按「对话模式」取参，是另一张真源表。
 * 两张表所在文件豁免，其余文件一律禁止。
 *
 * 口径（刻意收窄，避免满屏假阳性然后被习惯性绕过）：
 *   只匹配「冒号后直接跟数字」的简单字面量（temperature: 0.18 / maxTokens: 512）。
 *   派生表达式（Math.min(..., 900)、toFiniteNumber(x, 1800)、generationProfile.temperature ?? x）
 *   与真源表本身不在范围内 —— 它们是逻辑，不是散落的配置。
 *
 * 这是严格门禁不是棘轮：存量已全部收口到真源，从零起步，新增一处即红。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SCAN_ROOTS = ['src/views/BOHAI'];
const EXTRA_FILES = ['src/utils/bohai-model-client.js'];
// 豁免两张真源表所在文件：
//   generation-params.js  —— TASK_GENERATION_PRESETS（按「任务语义」取参）
//   chat-engine-config.js —— GENERATION_PROFILE_BY_MODE / 访谈参数 / THINKING_SPEED_DELTAS（按「对话模式」取参）
// 除这两处外，任何文件出现简单字面量即红。
const EXEMPT = /(generation-params|chat-engine-config)\.js$/;
const PARAM_LITERAL_RE =
  /\b(temperature|max_tokens|maxTokens|top_p|topP|frequency_penalty|frequencyPenalty|presence_penalty|presencePenalty)\s*:\s*-?(?:0|[1-9]\d*)(?:\.\d+)?\b/g;

const collectFiles = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) collectFiles(full, out);
    else if (/\.(js|vue|ts)$/.test(name)) out.push(full);
  }
  return out;
};

const files = SCAN_ROOTS.flatMap((root) => collectFiles(root)).concat(
  EXTRA_FILES.filter((file) => {
    try {
      statSync(file);
      return true;
    } catch {
      return false;
    }
  }),
);

const violations = [];
for (const file of files) {
  if (EXEMPT.test(file)) continue;
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, index) => {
    PARAM_LITERAL_RE.lastIndex = 0;
    if (PARAM_LITERAL_RE.test(line)) {
      violations.push(`${file}:${index + 1}: ${line.trim().slice(0, 120)}`);
    }
  });
}

if (violations.length > 0) {
  console.error(
    `❌ BOH AI 生成参数出现内联字面量（唯一真源：src/views/BOHAI/generation-params.js），共 ${violations.length} 处：`,
  );
  violations.forEach((item) => console.error(`  ${item}`));
  console.error(
    '改法：在 TASK_GENERATION_PRESETS 增加或复用任务预设，调用点引用预设。确需新真源表必须在 commit message 里交代理由。',
  );
  process.exit(1);
}

console.log(`✅ 生成参数单一真源检查通过：扫描 ${files.length} 个文件，0 处内联字面量`);
