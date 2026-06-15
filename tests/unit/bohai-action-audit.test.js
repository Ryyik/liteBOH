import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BOHAI_ACTION_AUDIT_MAX_ITEMS,
  createBohAIActionAuditEntry,
  loadBohAIActionAuditsFromStorage,
  saveBohAIActionAuditsToStorage,
  appendBohAIActionAudit,
  clearBohAIActionAuditsStorage,
} from '../../src/utils/bohai-action-audit.js';

const mockStorage = () => {
  const store = {};
  return {
    getItem: vi.fn((key) => store[key] || null),
    setItem: vi.fn((key, value) => { store[key] = value; }),
    removeItem: vi.fn((key) => { delete store[key]; }),
  };
};

describe('bohai-action-audit: createBohAIActionAuditEntry', () => {
  it('creates entry with all fields', () => {
    const entry = createBohAIActionAuditEntry({
      result: { actionId: 'createPost', label: '发帖', source: 'forum', ok: true, message: '成功' },
      payload: { content: '测试内容', title: '测试标题' },
      auth: { userId: 'u1', username: 'testuser' },
    });

    expect(entry.id).toBeDefined();
    expect(entry.actionId).toBe('createPost');
    expect(entry.label).toBe('发帖');
    expect(entry.source).toBe('forum');
    expect(entry.ok).toBe(true);
    expect(entry.userId).toBe('u1');
    expect(entry.username).toBe('testuser');
    expect(entry.createdAt).toBeGreaterThan(0);
    expect(entry.payload.title).toBe('测试标题');
    expect(entry.payload.contentPreview).toBe('测试内容');
  });

  it('creates entry for saveCloud action', () => {
    const entry = createBohAIActionAuditEntry({
      result: { actionId: 'saveCloud', label: '保存云', source: 'boh', ok: true },
      payload: { content: '云内容', title: '云标题' },
      auth: { userId: 'u1', username: 'testuser' },
    });

    expect(entry.actionId).toBe('saveCloud');
    expect(entry.payload.contentPreview).toBe('云内容');
    expect(entry.payload.title).toBe('云标题');
  });

  it('creates entry for unknown actionId with JSON preview', () => {
    const entry = createBohAIActionAuditEntry({
      result: { actionId: 'unknownAction', label: '未知', source: 'unknown', ok: false },
      payload: { custom: 'data' },
      auth: { userId: 'u1', username: 'testuser' },
    });

    expect(entry.actionId).toBe('unknownAction');
    expect(entry.payload.preview).toBeDefined();
  });

  it('handles empty input', () => {
    const entry = createBohAIActionAuditEntry();
    expect(entry.id).toBeDefined();
    expect(entry.actionId).toBe('');
    expect(entry.ok).toBe(false);
    expect(entry.userId).toBe('');
  });

  it('handles null payload', () => {
    const entry = createBohAIActionAuditEntry({
      result: { actionId: 'createPost' },
      payload: null,
      auth: null,
    });
    expect(entry.payload.title).toBe('');
  });

  it('caps content length', () => {
    const longContent = 'x'.repeat(500);
    const entry = createBohAIActionAuditEntry({
      result: { actionId: 'createPost' },
      payload: { content: longContent, title: 'x'.repeat(200) },
      auth: {},
    });
    expect(entry.payload.contentPreview.length).toBeLessThanOrEqual(160);
    expect(entry.payload.title.length).toBeLessThanOrEqual(80);
  });

  it('includes metadata when present', () => {
    const entry = createBohAIActionAuditEntry({
      result: { actionId: 'createPost', metadata: { key: 'value' } },
    });
    expect(entry.metadata).toEqual({ key: 'value' });
  });
});

describe('bohai-action-audit: loadBohAIActionAuditsFromStorage', () => {
  it('returns empty array when no storage', () => {
    const result = loadBohAIActionAuditsFromStorage({ storage: null });
    expect(result).toEqual([]);
  });

  it('returns empty array when storage is empty', () => {
    const storage = mockStorage();
    const result = loadBohAIActionAuditsFromStorage({ storage });
    expect(result).toEqual([]);
  });

  it('loads audits from storage', () => {
    const storage = mockStorage();
    const audits = [{ id: 'a1', actionId: 'createPost' }];
    storage.getItem.mockReturnValue(JSON.stringify(audits));
    const result = loadBohAIActionAuditsFromStorage({ storage });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a1');
  });

  it('caps at max items', () => {
    const storage = mockStorage();
    const audits = Array.from({ length: 100 }, (_, i) => ({ id: `a${i}` }));
    storage.getItem.mockReturnValue(JSON.stringify(audits));
    const result = loadBohAIActionAuditsFromStorage({ storage });
    expect(result.length).toBeLessThanOrEqual(BOHAI_ACTION_AUDIT_MAX_ITEMS);
  });

  it('handles corrupted JSON', () => {
    const storage = mockStorage();
    storage.getItem.mockReturnValue('not valid json');
    const result = loadBohAIActionAuditsFromStorage({ storage });
    expect(result).toEqual([]);
  });
});

describe('bohai-action-audit: saveBohAIActionAuditsToStorage', () => {
  it('returns false when no storage', () => {
    const result = saveBohAIActionAuditsToStorage({ storage: null });
    expect(result).toBe(false);
  });

  it('saves audits to storage', () => {
    const storage = mockStorage();
    const audits = [{ id: 'a1', actionId: 'createPost' }];
    const result = saveBohAIActionAuditsToStorage({ storage, audits });
    expect(result).toBe(true);
    expect(storage.setItem).toHaveBeenCalled();
  });

  it('caps at max items', () => {
    const storage = mockStorage();
    const audits = Array.from({ length: 100 }, (_, i) => ({ id: `a${i}` }));
    saveBohAIActionAuditsToStorage({ storage, audits });
    const call = storage.setItem.mock.calls[0];
    const saved = JSON.parse(call[1]);
    expect(saved.length).toBeLessThanOrEqual(BOHAI_ACTION_AUDIT_MAX_ITEMS);
  });
});

describe('bohai-action-audit: appendBohAIActionAudit', () => {
  it('appends entry to front of audits', () => {
    const storage = mockStorage();
    const existing = [{ id: 'a1' }, { id: 'a2' }];
    const entry = { id: 'new' };
    const result = appendBohAIActionAudit({ storage, audits: existing, entry });
    expect(result[0].id).toBe('new');
    expect(result[1].id).toBe('a1');
  });

  it('returns audits unchanged when entry is null', () => {
    const existing = [{ id: 'a1' }];
    const result = appendBohAIActionAudit({ audits: existing, entry: null });
    expect(result).toEqual(existing);
  });
});

describe('bohai-action-audit: clearBohAIActionAuditsStorage', () => {
  it('returns false when no storage', () => {
    const result = clearBohAIActionAuditsStorage({ storage: null });
    expect(result).toBe(false);
  });

  it('clears storage', () => {
    const storage = mockStorage();
    const result = clearBohAIActionAuditsStorage({ storage });
    expect(result).toBe(true);
    expect(storage.removeItem).toHaveBeenCalled();
  });
});