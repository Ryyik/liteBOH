import { describe, expect, it } from 'vitest';
import {
  createBolekRetrievalTrace,
  formatBolekRetrievalTraceSummary,
} from '../../src/utils/bolek-observability.js';

describe('bolek-observability: createBolekRetrievalTrace', () => {
  it('creates trace with all fields', () => {
    const trace = createBolekRetrievalTrace({
      queryText: 'What is the weather?',
      retrievalPlan: {
        treehole: true,
        sharedMemory: false,
        memory: true,
        siteGuide: false,
        forum: true,
        userPrivate: false,
      },
      routingReasons: ['User asked about weather', 'Contains location info'],
      connectorResults: [
        {
          connectorId: 'cloud-plus',
          label: 'BOH Cloud+',
          source: 'cloud',
          ok: true,
          total: 5,
          confidence: 0.9,
          evidenceRefs: ['REF001', 'REF002'],
          context: 'Weather data from cloud storage...',
        },
        {
          connectorId: 'memory',
          label: 'Memory',
          source: 'memory',
          ok: false,
          total: 0,
          confidence: 0,
          evidenceRefs: [],
          context: '',
          error: { message: 'No memories found' },
        },
      ],
    });

    expect(trace.queryText).toBe('What is the weather?');
    expect(trace.retrievalPlan.treehole).toBe(true);
    expect(trace.retrievalPlan.sharedMemory).toBe(false);
    expect(trace.retrievalPlan.memory).toBe(true);
    expect(trace.retrievalPlan.forum).toBe(true);
    expect(trace.routingReasons).toHaveLength(2);
    expect(trace.connectors).toHaveLength(2);
    expect(trace.connectors[0].ok).toBe(true);
    expect(trace.connectors[0].confidence).toBe(0.9);
    expect(trace.connectors[1].ok).toBe(false);
    expect(trace.connectors[1].errorMessage).toBe('No memories found');
    expect(trace.evidenceRefs).toEqual(['REF001', 'REF002']);
    expect(trace.activeConnectorCount).toBe(1);
    expect(trace.sourceCount).toBe(2);
  });

  it('handles empty inputs', () => {
    const trace = createBolekRetrievalTrace();
    expect(trace.queryText).toBe('');
    expect(trace.retrievalPlan.treehole).toBe(false);
    expect(trace.routingReasons).toEqual([]);
    expect(trace.connectors).toEqual([]);
    expect(trace.evidenceRefs).toEqual([]);
    expect(trace.activeConnectorCount).toBe(0);
    expect(trace.sourceCount).toBe(0);
  });

  it('deduplicates evidence refs', () => {
    const trace = createBolekRetrievalTrace({
      connectorResults: [
        { evidenceRefs: ['REF001', 'REF002'], ok: true },
        { evidenceRefs: ['REF002', 'REF003'], ok: true },
      ],
    });
    expect(trace.evidenceRefs).toEqual(['REF001', 'REF002', 'REF003']);
  });

  it('truncates long query text', () => {
    const longQuery = 'A'.repeat(300);
    const trace = createBolekRetrievalTrace({ queryText: longQuery });
    expect(trace.queryText.length).toBe(220);
  });

  it('caps routing reasons at 6', () => {
    const trace = createBolekRetrievalTrace({
      routingReasons: ['1', '2', '3', '4', '5', '6', '7', '8'],
    });
    expect(trace.routingReasons).toHaveLength(6);
  });

  it('normalizes connector with missing fields', () => {
    const trace = createBolekRetrievalTrace({
      connectorResults: [{ connectorId: 'c1', ok: true }],
    });
    expect(trace.connectors[0].label).toBe('');
    expect(trace.connectors[0].source).toBe('');
    expect(trace.connectors[0].total).toBe(0);
    expect(trace.connectors[0].confidence).toBe(0);
    expect(trace.connectors[0].contextChars).toBe(0);
  });
});

describe('bolek-observability: formatBolekRetrievalTraceSummary', () => {
  it('formats full trace summary', () => {
    const summary = formatBolekRetrievalTraceSummary({
      retrievalPlan: {
        treehole: true,
        sharedMemory: true,
        memory: false,
        siteGuide: true,
        forum: false,
        userPrivate: false,
      },
      connectors: [{ ok: true }, { ok: true }, { ok: false }],
      evidenceRefs: ['REF001', 'REF002', 'REF003'],
    });

    expect(summary).toContain('Cloud+');
    expect(summary).toContain('公共记忆');
    expect(summary).toContain('操作手册');
    expect(summary).toContain('成功 2');
    expect(summary).toContain('失败 1');
    expect(summary).toContain('REF001');
    expect(summary).toContain('REF002');
    expect(summary).toContain('REF003');
  });

  it('returns empty for empty trace', () => {
    expect(formatBolekRetrievalTraceSummary({})).toBe('');
  });

  it('shows evidence text when no connectors', () => {
    const summary = formatBolekRetrievalTraceSummary({
      retrievalPlan: { treehole: true },
      evidenceRefs: ['REF001'],
    });
    expect(summary).toContain('Cloud+');
    expect(summary).toContain('REF001');
  });

  it('caps evidence refs at 6', () => {
    const summary = formatBolekRetrievalTraceSummary({
      retrievalPlan: { memory: true },
      evidenceRefs: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
      connectors: [{ ok: true }],
    });
    const refs = ['A', 'B', 'C', 'D', 'E', 'F'];
    refs.forEach((ref) => expect(summary).toContain(ref));
    expect(summary).not.toContain('G');
    expect(summary).not.toContain('H');
  });
});
