import { describe, expect, it } from 'vitest';
import {
  canViewModule,
  filterTabActionsByRole,
  getDeniedModuleIds,
  getRoleLabel,
  getUserRole
} from '@/views/DataManagement/config/rbac.js';

const MODULES = [
  { id: 'overview' },
  { id: 'users' },
  { id: 'community' },
  { id: 'moderation' },
  { id: 'ai-config' },
  { id: 'system' }
];

describe('data admin RBAC', () => {
  it('grants admin full module visibility', () => {
    expect(getDeniedModuleIds(MODULES, 'admin')).toEqual([]);
  });

  it('restricts moderator to overview/community/operations/moderation', () => {
    expect(canViewModule('moderator', 'overview')).toBe(true);
    expect(canViewModule('moderator', 'moderation')).toBe(true);
    expect(canViewModule('moderator', 'users')).toBe(false);
    expect(canViewModule('moderator', 'ai-config')).toBe(false);
    expect(getDeniedModuleIds(MODULES, 'moderator')).toEqual(['users', 'ai-config', 'system']);
  });

  it('denies unknown modules by default (least privilege)', () => {
    expect(canViewModule('moderator', 'some-future-module')).toBe(false);
    expect(canViewModule('admin', 'some-future-module')).toBe(true);
  });

  it('keeps admin tab actions intact, narrows moderator to view/moderate', () => {
    expect(filterTabActionsByRole('admin', ['view', 'create', 'edit', 'delete'])).toEqual(
      new Set(['view', 'create', 'edit', 'delete'])
    );
    expect(filterTabActionsByRole('moderator', ['view', 'create', 'edit', 'delete', 'moderate'])).toEqual(
      new Set(['view', 'moderate'])
    );
    expect(filterTabActionsByRole('user', ['view'])).toEqual(new Set());
  });

  it('normalizes roles and labels', () => {
    expect(getUserRole({ role: 'admin' })).toBe('admin');
    expect(getUserRole(null)).toBe('user');
    expect(getRoleLabel('moderator')).toBe('版主');
  });
});
