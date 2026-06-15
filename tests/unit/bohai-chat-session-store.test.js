import { describe, expect, it, vi } from 'vitest';

import {
  BOHAI_CHAT_SESSIONS_MAX_ITEMS,
  createBohAIChatSessionSanitizer,
  loadBohAIChatSessionsFromStorage,
  saveBohAIChatSessionsToStorage,
} from '../../src/utils/bohai-chat-session-store.js';

const mockStorage = () => {
  const store = {};
  return {
    getItem: vi.fn((key) => store[key] || null),
    setItem: vi.fn((key, value) => { store[key] = value; }),
    removeItem: vi.fn((key) => { delete store[key]; }),
  };
};

describe('bohai-chat-session: createBohAIChatSessionSanitizer', () => {
  const sanitize = createBohAIChatSessionSanitizer();

  it('sanitizes session with default values', () => {
    const session = sanitize({});
    expect(session.title).toBe('新对话');
    expect(session.messages).toEqual([]);
    expect(session.timestamp).toBeGreaterThan(0);
    expect(session.contextSummary).toBeNull();
    expect(session.isLoading).toBe(false);
    expect(session.isThinking).toBe(false);
  });

  it('sanitizes session with title', () => {
    const session = sanitize({ title: '测试对话' });
    expect(session.title).toBe('测试对话');
  });

  it('sanitizes session with messages', () => {
    const session = sanitize({
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' },
      ],
    });
    expect(session.messages).toHaveLength(2);
    expect(session.messages[0].content).toBe('Hello');
  });

  it('filters out empty assistant messages', () => {
    const sanitizeWithFilter = createBohAIChatSessionSanitizer({
      isEmptyAssistantPlaceholder: (msg) => msg.role === 'assistant' && !msg.content,
    });
    const session = sanitizeWithFilter({
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: '' },
        { role: 'assistant', content: 'Hi' },
      ],
    });
    expect(session.messages).toHaveLength(2);
  });

  it('converts non-string content to string', () => {
    const session = sanitize({
      messages: [{ role: 'user', content: 123 }],
    });
    expect(session.messages[0].content).toBe('123');
  });

  it('sanitizes contextSummary', () => {
    const session = sanitize({
      contextSummary: {
        version: 1,
        fingerprint: 'abc123',
        content: 'Context summary text',
        updatedAt: 1234567890,
      },
    });
    expect(session.contextSummary).toBeDefined();
    expect(session.contextSummary.version).toBe(1);
    expect(session.contextSummary.fingerprint).toBe('abc123');
    expect(session.contextSummary.content).toBe('Context summary text');
  });

  it('preserves valid timestamp', () => {
    const session = sanitize({ timestamp: 1234567890000 });
    expect(session.timestamp).toBe(1234567890000);
  });

  it('replaces invalid timestamp with Date.now()', () => {
    const session = sanitize({ timestamp: 'invalid' });
    expect(session.timestamp).toBeGreaterThan(0);
    expect(typeof session.timestamp).toBe('number');
  });
});

describe('bohai-chat-session: loadBohAIChatSessionsFromStorage', () => {
  it('returns empty array when no storage', () => {
    const result = loadBohAIChatSessionsFromStorage({ storage: null });
    expect(result).toEqual([]);
  });

  it('returns empty array when storage is empty', () => {
    const storage = mockStorage();
    const result = loadBohAIChatSessionsFromStorage({ storage });
    expect(result).toEqual([]);
  });

  it('loads sessions from storage', () => {
    const storage = mockStorage();
    const sessions = [{ title: 'Chat 1', messages: [], timestamp: 123 }];
    storage.getItem.mockReturnValue(JSON.stringify(sessions));
    const result = loadBohAIChatSessionsFromStorage({ storage });
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Chat 1');
  });

  it('caps at max items', () => {
    const storage = mockStorage();
    const sessions = Array.from({ length: 50 }, (_, i) => ({ title: `Chat ${i}` }));
    storage.getItem.mockReturnValue(JSON.stringify(sessions));
    const result = loadBohAIChatSessionsFromStorage({ storage });
    expect(result.length).toBeLessThanOrEqual(BOHAI_CHAT_SESSIONS_MAX_ITEMS);
  });

  it('handles corrupted JSON with backup', () => {
    const storage = mockStorage();
    storage.getItem.mockReturnValue('not valid json');
    const onError = vi.fn();
    const result = loadBohAIChatSessionsFromStorage({ storage, onError });
    expect(result).toEqual([]);
    expect(onError).toHaveBeenCalled();
  });
});

describe('bohai-chat-session: saveBohAIChatSessionsToStorage', () => {
  it('returns false when no storage', () => {
    const result = saveBohAIChatSessionsToStorage({ storage: null });
    expect(result).toBe(false);
  });

  it('saves sessions to storage', () => {
    const storage = mockStorage();
    const sessions = [{ title: 'Chat 1' }];
    const result = saveBohAIChatSessionsToStorage({ storage, sessions });
    expect(result).toBe(true);
    expect(storage.setItem).toHaveBeenCalled();
  });

  it('caps at max items', () => {
    const storage = mockStorage();
    const sessions = Array.from({ length: 50 }, (_, i) => ({ title: `Chat ${i}` }));
    saveBohAIChatSessionsToStorage({ storage, sessions });
    const call = storage.setItem.mock.calls[0];
    const saved = JSON.parse(call[1]);
    expect(saved.length).toBeLessThanOrEqual(BOHAI_CHAT_SESSIONS_MAX_ITEMS);
  });
});