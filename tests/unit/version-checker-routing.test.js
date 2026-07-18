import { describe, expect, it } from 'vitest';
import {
  buildVersionReloadPath,
  shouldAutoApplyVersion,
} from '../../src/utils/version-checker.js';

describe('version checker reload routing', () => {
  it('adds a build-specific cache buster while preserving the SPA hash', () => {
    expect(buildVersionReloadPath(
      'https://example.com/app/?tab=profile&forceUpdate=true#/user-space',
      'build-2'
    )).toBe('/app/?tab=profile&__boh_update=build-2#/user-space');
  });

  it('automatically applies each target build at most once per session', () => {
    expect(shouldAutoApplyVersion('build-2', '')).toBe(true);
    expect(shouldAutoApplyVersion('build-2', 'build-1')).toBe(true);
    expect(shouldAutoApplyVersion('build-2', 'build-2')).toBe(false);
    expect(shouldAutoApplyVersion('', 'build-1')).toBe(false);
  });
});
