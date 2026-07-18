import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

describe('AI quota admin console', () => {
  it('is registered in the AI configuration module', () => {
    expect(read('src/views/DataManagement/config/tabs.js')).toContain("{ id: 'ai-quota', label: 'AI 额度'");
    expect(read('src/views/DataManagement/DataAdmin.vue')).toContain("'ai-quota': AiQuotaConfigConsole");
  });

  it('edits mode multipliers and Token/Web limits', () => {
    const component = read('src/views/DataManagement/components/AiQuotaConfigConsole.vue');
    expect(component).toContain('mode.quota_multiplier');
    expect(component).toContain('tier.daily_token_limit');
    expect(component).toContain('tier.web_search_daily_limit');
    expect(component).toContain('resetAllAiQuotas');
  });
});
