import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(
  resolve(import.meta.dirname, '../../src/views/user-center/UserSpace/components/AssetsHubPanel.vue'),
  'utf8'
);

describe('AssetsHubPanel overview initial load', () => {
  it('starts idle so the first mounted overview request can run', () => {
    expect(source).toMatch(/const overviewLoading = ref\(false\);/);
  });

  it('finishes the overview loading state after its data requests settle', () => {
    const loadOverview = source.match(/const loadOverview = async \(\) => \{[\s\S]*?\n\};\n\nonMounted/)?.[0] || '';

    expect(loadOverview).toContain('finally');
    expect(loadOverview).toContain('overviewLoading.value = false');
  });

  it('ranks a shared insight pool and removes the focused event from recent activity', () => {
    expect(source).toContain('const overviewCandidates = computed(() => {');
    expect(source).toContain('b.priority - a.priority || getOverviewTimestamp(b.time) - getOverviewTimestamp(a.time)');
    expect(source).toContain('const focusActivityIds = new Set(primaryInsight.value.activityIds || []);');
    expect(source).toContain('.filter((item) => !focusActivityIds.has(item.id))');
  });

  it('deduplicates recent activity entries and secondary actions', () => {
    expect(source).toContain('const seenIds = new Set();');
    expect(source).toContain('const seenActions = new Set([primaryInsight.value.action]);');
  });
});
