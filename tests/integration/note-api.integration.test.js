import { beforeEach, describe, expect, it, vi } from 'vitest';

const nm = vi.hoisted(() => ({
  supabaseFrom: vi.fn(),
  supabaseAuth: { getUser: vi.fn() },
}));

vi.mock('../../src/utils/supabase-client.js', () => ({
  supabase: {
    from: nm.supabaseFrom,
    auth: nm.supabaseAuth,
  },
}));

vi.mock('../../src/utils/api/boh-cloud-api.js', () => ({
  getMyCloudEntriesForAI: vi.fn(() => Promise.resolve({ ok: false, data: [], error: { message: 'Not available' } })),
}));

import { clearRequestCache } from '../../src/utils/request-core.js';
import {
  getMyNotesByRange,
  upsertMyNoteEntry,
  deleteMyNoteEntry,
  getMyNotesForAI,
} from '../../src/utils/api/note-api.js';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

function makeQuery(result, calls = []) {
  const q = {
    select: vi.fn(() => q),
    eq: vi.fn((col, val) => { calls.push({ method: 'eq', col, val }); return q; }),
    gte: vi.fn((col, val) => { calls.push({ method: 'gte', col, val }); return q; }),
    lte: vi.fn((col, val) => { calls.push({ method: 'lte', col, val }); return q; }),
    order: vi.fn(() => q),
    limit: vi.fn((n) => { calls.push({ method: 'limit', n }); return q; }),
    maybeSingle: vi.fn(() => q),
    then: (resolve) => Promise.resolve(result).then(resolve),
  };
  return q;
}

describe('note-api: getMyNotesByRange', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRequestCache();
  });

  it('rejects invalid userId', async () => {
    const result = await getMyNotesByRange({ userId: '', startDate: '2024-01-01', endDate: '2024-12-31' });
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('NOT_AUTHENTICATED');
  });

  it('rejects invalid date range', async () => {
    const result = await getMyNotesByRange({ userId: VALID_UUID, startDate: '', endDate: '' });
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('INVALID_DATE_RANGE');
  });

  it('rejects when startDate > endDate', async () => {
    const result = await getMyNotesByRange({ userId: VALID_UUID, startDate: '2024-12-31', endDate: '2024-01-01' });
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('INVALID_DATE_RANGE');
  });

  it('fetches notes within date range', async () => {
    nm.supabaseFrom.mockReturnValue(makeQuery({
      data: [
        { user_id: VALID_UUID, note_date: '2024-06-15', content: 'Today was good', mood: 'happy', source: 'manual', created_at: '2024-06-15T10:00:00Z', updated_at: '2024-06-15T10:00:00Z' },
        { user_id: VALID_UUID, note_date: '2024-06-14', content: 'Yesterday was ok', mood: '', source: 'ai', created_at: '2024-06-14T10:00:00Z', updated_at: '2024-06-14T10:00:00Z' },
      ],
      error: null,
    }));

    const result = await getMyNotesByRange({ userId: VALID_UUID, startDate: '2024-06-01', endDate: '2024-06-30' });
    expect(result.data.length).toBe(2);
    expect(result.data[0].content).toBe('Today was good');
    expect(result.data[0].mood).toBe('happy');
  });

  it('falls back to legacy table when note table missing', async () => {
    nm.supabaseFrom.mockReturnValueOnce(makeQuery({
      data: null,
      error: { code: '42P01', message: 'relation "boh_note_entries" does not exist' },
    }));

    // Legacy fallback query
    nm.supabaseFrom.mockReturnValueOnce(makeQuery({
      data: [
        { user_id: VALID_UUID, content: 'Legacy entry', mood: 'nostalgic', created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z' },
      ],
      error: null,
    }));

    const result = await getMyNotesByRange({ userId: VALID_UUID, startDate: '2024-01-01', endDate: '2024-12-31' });
    expect(result.data.length).toBe(1);
    expect(result.data[0].content).toBe('Legacy entry');
    expect(result.data[0].source).toBe('migrated');
  });

  it('normalizes date formats', async () => {
    nm.supabaseFrom.mockReturnValue(makeQuery({
      data: [
        { user_id: VALID_UUID, note_date: '2024-01-01T10:00:00Z', content: 'Test', mood: '', source: 'manual', created_at: '2024-01-01T10:00:00Z', updated_at: '2024-01-01T10:00:00Z' },
      ],
      error: null,
    }));

    const result = await getMyNotesByRange({ userId: VALID_UUID, startDate: '2024-01-01', endDate: '2024-01-31' });
    expect(result.data[0].noteDate).toBe('2024-01-01');
  });
});

describe('note-api: upsertMyNoteEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRequestCache();
  });

  it('rejects empty userId', async () => {
    const result = await upsertMyNoteEntry('', { noteDate: '2024-06-15', content: 'Hello' });
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('NOT_AUTHENTICATED');
  });

  it('rejects auth mismatch', async () => {
    nm.supabaseAuth.getUser.mockResolvedValue({ data: { user: { id: 'different-user' } }, error: null });

    const result = await upsertMyNoteEntry(VALID_UUID, { noteDate: '2024-06-15', content: 'Hello' });
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('AUTH_MISMATCH');
  });

  it('rejects invalid date', async () => {
    nm.supabaseAuth.getUser.mockResolvedValue({ data: { user: { id: VALID_UUID } }, error: null });

    const result = await upsertMyNoteEntry(VALID_UUID, { noteDate: 'invalid', content: 'Hello' });
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('INVALID_NOTE_DATE');
  });

  it('rejects empty content', async () => {
    nm.supabaseAuth.getUser.mockResolvedValue({ data: { user: { id: VALID_UUID } }, error: null });

    const result = await upsertMyNoteEntry(VALID_UUID, { noteDate: '2024-06-15', content: '  ' });
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('EMPTY_NOTE');
  });

  it('upserts note successfully', async () => {
    nm.supabaseAuth.getUser.mockResolvedValue({ data: { user: { id: VALID_UUID } }, error: null });

    const upsertQuery = {
      select: vi.fn(() => ({
        maybeSingle: vi.fn(() => Promise.resolve({
          data: { user_id: VALID_UUID, note_date: '2024-06-15', content: 'Hello World', mood: 'happy', source: 'manual', created_at: '2024-06-15T10:00:00Z', updated_at: '2024-06-15T10:00:00Z' },
          error: null,
        })),
      })),
    };
    nm.supabaseFrom.mockReturnValue({ upsert: vi.fn(() => upsertQuery) });

    const result = await upsertMyNoteEntry(VALID_UUID, { noteDate: '2024-06-15', content: 'Hello World', mood: 'happy' });
    expect(result.ok).toBe(true);
    expect(result.data.content).toBe('Hello World');
    expect(result.data.mood).toBe('happy');
  });

  it('handles upsert database error', async () => {
    nm.supabaseAuth.getUser.mockResolvedValue({ data: { user: { id: VALID_UUID } }, error: null });

    const upsertQuery = {
      select: vi.fn(() => ({
        maybeSingle: vi.fn(() => Promise.resolve({
          data: null,
          error: { message: 'DB error' },
        })),
      })),
    };
    nm.supabaseFrom.mockReturnValue({ upsert: vi.fn(() => upsertQuery) });

    const result = await upsertMyNoteEntry(VALID_UUID, { noteDate: '2024-06-15', content: 'Hello' });
    expect(result.ok).toBe(false);
  });

  it('defaults source to manual for invalid values', async () => {
    nm.supabaseAuth.getUser.mockResolvedValue({ data: { user: { id: VALID_UUID } }, error: null });

    let capturedUpsert;
    const upsertQuery = {
      select: vi.fn(() => ({
        maybeSingle: vi.fn(() => Promise.resolve({
          data: { user_id: VALID_UUID, note_date: '2024-06-15', content: 'Hello', mood: '', source: 'manual', created_at: '2024-06-15T10:00:00Z', updated_at: '2024-06-15T10:00:00Z' },
          error: null,
        })),
      })),
    };
    nm.supabaseFrom.mockReturnValue({ upsert: vi.fn((data) => { capturedUpsert = data; return upsertQuery; }) });

    await upsertMyNoteEntry(VALID_UUID, { noteDate: '2024-06-15', content: 'Hello', source: 'invalid-source' });
    expect(capturedUpsert[0].source).toBe('manual');
  });
});

describe('note-api: deleteMyNoteEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRequestCache();
  });

  it('rejects empty userId', async () => {
    const result = await deleteMyNoteEntry('', '2024-06-15');
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('NOT_AUTHENTICATED');
  });

  it('rejects invalid date', async () => {
    const result = await deleteMyNoteEntry(VALID_UUID, '');
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('INVALID_NOTE_DATE');
  });

  it('deletes note successfully', async () => {
    const deleteQuery = {
      eq: vi.fn(() => deleteQuery),
      then: (resolve) => Promise.resolve({ error: null }).then(resolve),
    };
    nm.supabaseFrom.mockReturnValue({ delete: vi.fn(() => deleteQuery) });

    const result = await deleteMyNoteEntry(VALID_UUID, '2024-06-15');
    expect(result.ok).toBe(true);
  });

  it('handles delete error', async () => {
    const deleteQuery = {
      eq: vi.fn(() => deleteQuery),
      then: (resolve) => Promise.resolve({ error: { message: 'Not found' } }).then(resolve),
    };
    nm.supabaseFrom.mockReturnValue({ delete: vi.fn(() => deleteQuery) });

    const result = await deleteMyNoteEntry(VALID_UUID, '2024-06-15');
    expect(result.ok).toBe(false);
  });
});

describe('note-api: getMyNotesForAI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRequestCache();
  });

  it('rejects empty userId', async () => {
    const result = await getMyNotesForAI('');
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('NOT_AUTHENTICATED');
  });

  it('fetches notes for AI context', async () => {
    nm.supabaseFrom.mockReturnValue(makeQuery({
      data: [
        { user_id: VALID_UUID, note_date: '2024-06-15', content: 'AI note', mood: '', source: 'manual', created_at: '2024-06-15T10:00:00Z', updated_at: '2024-06-15T10:00:00Z' },
      ],
      error: null,
    }));

    const result = await getMyNotesForAI(VALID_UUID, { limit: 10 });
    expect(result.ok).toBe(true);
    expect(result.data.length).toBe(1);
    expect(result.data[0].tags).toContain('BOH Cloud+');
    expect(result.data[0].isStarred).toBe(false);
  });

  it('maps ai source correctly', async () => {
    nm.supabaseFrom.mockReturnValue(makeQuery({
      data: [
        { user_id: VALID_UUID, note_date: '2024-06-15', content: 'AI generated', mood: '', source: 'ai', created_at: '2024-06-15T10:00:00Z', updated_at: '2024-06-15T10:00:00Z' },
        { user_id: VALID_UUID, note_date: '2024-06-14', content: 'Manual note', mood: '', source: 'manual', created_at: '2024-06-14T10:00:00Z', updated_at: '2024-06-14T10:00:00Z' },
      ],
      error: null,
    }));

    const result = await getMyNotesForAI(VALID_UUID);
    expect(result.data[0].source).toBe('ai');
    expect(result.data[1].source).toBe('manual');
  });

  it('handles missing note table with legacy fallback', async () => {
    nm.supabaseFrom.mockReturnValueOnce(makeQuery({
      data: null,
      error: { code: '42P01', message: 'boh_note_entries does not exist' },
    }));

    nm.supabaseFrom.mockReturnValueOnce(makeQuery({
      data: [
        { user_id: VALID_UUID, content: 'Legacy AI note', mood: '', created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z' },
      ],
      error: null,
    }));

    const result = await getMyNotesForAI(VALID_UUID);
    expect(result.ok).toBe(true);
    expect(result.data.length).toBe(1);
    expect(result.data[0].tags).toContain('BOH Cloud+');
  });
});