import { describe, expect, it, vi } from 'vitest';

import {
  BOLEK_ACTION_AUDIT_MAX_ITEMS,
  createBolekActionAuditEntry,
  loadBolekActionAuditsFromStorage,
  saveBolekActionAuditsToStorage,
  appendBolekActionAudit,
  clearBolekActionAuditsStorage,
} from '../../src/utils/bolek-action-audit.js';

const mockStorage = () => {
  const store = {};
  return {
    getItem: vi.fn((key) => store[key] || null),
    setItem: vi.fn((key, value) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key) => {
      delete store[key];
    }),
  };
};

describe('bolek-action-audit: createBolekActionAuditEntry', () => {
  it('creates entry with all fields', () => {
    const entry = createBolekActionAuditEntry({
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

  // 2026-10-04：saveCloud 动作已删除，改用仍存活的 saveSharedMemory 覆盖同一条
  // 「带标题/正文的写入动作 → 审计摘要」分支。
  it('creates entry for saveSharedMemory action', () => {
    const entry = createBolekActionAuditEntry({
      result: { actionId: 'saveSharedMemory', label: '写入公共记忆', source: 'boh', ok: true },
      payload: { content: '记忆内容', title: '记忆标题' },
      auth: { userId: 'u1', username: 'testuser' },
    });

    expect(entry.actionId).toBe('saveSharedMemory');
    expect(entry.payload.contentPreview).toBe('记忆内容');
    expect(entry.payload.title).toBe('记忆标题');
  });

  it('creates entry for unknown actionId with JSON preview', () => {
    const entry = createBolekActionAuditEntry({
      result: { actionId: 'unknownAction', label: '未知', source: 'unknown', ok: false },
      payload: { custom: 'data' },
      auth: { userId: 'u1', username: 'testuser' },
    });

    expect(entry.actionId).toBe('unknownAction');
    expect(entry.payload.preview).toBeDefined();
  });

  it('handles empty input', () => {
    const entry = createBolekActionAuditEntry();
    expect(entry.id).toBeDefined();
    expect(entry.actionId).toBe('');
    expect(entry.ok).toBe(false);
    expect(entry.userId).toBe('');
  });

  it('handles null payload', () => {
    const entry = createBolekActionAuditEntry({
      result: { actionId: 'createPost' },
      payload: null,
      auth: null,
    });
    expect(entry.payload.title).toBe('');
  });

  it('caps content length', () => {
    const longContent = 'x'.repeat(500);
    const entry = createBolekActionAuditEntry({
      result: { actionId: 'createPost' },
      payload: { content: longContent, title: 'x'.repeat(200) },
      auth: {},
    });
    expect(entry.payload.contentPreview.length).toBeLessThanOrEqual(160);
    expect(entry.payload.title.length).toBeLessThanOrEqual(80);
  });

  it('includes metadata when present', () => {
    const entry = createBolekActionAuditEntry({
      result: { actionId: 'createPost', metadata: { key: 'value' } },
    });
    expect(entry.metadata).toEqual({ key: 'value' });
  });
});

describe('bolek-action-audit: loadBolekActionAuditsFromStorage', () => {
  it('returns empty array when no storage', () => {
    const result = loadBolekActionAuditsFromStorage({ storage: null });
    expect(result).toEqual([]);
  });

  it('returns empty array when storage is empty', () => {
    const storage = mockStorage();
    const result = loadBolekActionAuditsFromStorage({ storage });
    expect(result).toEqual([]);
  });

  it('loads audits from storage', () => {
    const storage = mockStorage();
    const audits = [{ id: 'a1', actionId: 'createPost' }];
    storage.getItem.mockReturnValue(JSON.stringify(audits));
    const result = loadBolekActionAuditsFromStorage({ storage });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a1');
  });

  it('caps at max items', () => {
    const storage = mockStorage();
    const audits = Array.from({ length: 100 }, (_, i) => ({ id: `a${i}` }));
    storage.getItem.mockReturnValue(JSON.stringify(audits));
    const result = loadBolekActionAuditsFromStorage({ storage });
    expect(result.length).toBeLessThanOrEqual(BOLEK_ACTION_AUDIT_MAX_ITEMS);
  });

  it('handles corrupted JSON', () => {
    const storage = mockStorage();
    storage.getItem.mockReturnValue('not valid json');
    const result = loadBolekActionAuditsFromStorage({ storage });
    expect(result).toEqual([]);
  });
});

describe('bolek-action-audit: saveBolekActionAuditsToStorage', () => {
  it('returns false when no storage', () => {
    const result = saveBolekActionAuditsToStorage({ storage: null });
    expect(result).toBe(false);
  });

  it('saves audits to storage', () => {
    const storage = mockStorage();
    const audits = [{ id: 'a1', actionId: 'createPost' }];
    const result = saveBolekActionAuditsToStorage({ storage, audits });
    expect(result).toBe(true);
    expect(storage.setItem).toHaveBeenCalled();
  });

  it('caps at max items', () => {
    const storage = mockStorage();
    const audits = Array.from({ length: 100 }, (_, i) => ({ id: `a${i}` }));
    saveBolekActionAuditsToStorage({ storage, audits });
    const call = storage.setItem.mock.calls[0];
    const saved = JSON.parse(call[1]);
    expect(saved.length).toBeLessThanOrEqual(BOLEK_ACTION_AUDIT_MAX_ITEMS);
  });
});

describe('bolek-action-audit: appendBolekActionAudit', () => {
  it('appends entry to front of audits', () => {
    const storage = mockStorage();
    const existing = [{ id: 'a1' }, { id: 'a2' }];
    const entry = { id: 'new' };
    const result = appendBolekActionAudit({ storage, audits: existing, entry });
    expect(result[0].id).toBe('new');
    expect(result[1].id).toBe('a1');
  });

  it('returns audits unchanged when entry is null', () => {
    const existing = [{ id: 'a1' }];
    const result = appendBolekActionAudit({ audits: existing, entry: null });
    expect(result).toEqual(existing);
  });
});

describe('bolek-action-audit: clearBolekActionAuditsStorage', () => {
  it('returns false when no storage', () => {
    const result = clearBolekActionAuditsStorage({ storage: null });
    expect(result).toBe(false);
  });

  it('clears storage', () => {
    const storage = mockStorage();
    const result = clearBolekActionAuditsStorage({ storage });
    expect(result).toBe(true);
    expect(storage.removeItem).toHaveBeenCalled();
  });
});
