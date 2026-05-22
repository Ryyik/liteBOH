import { describe, expect, it } from 'vitest';
import {
  createCloudSettingsReturnLocation,
  createUserSpaceDataManagementReturnLocation,
  createUserSpaceProfileReturnLocation,
  createUserSpaceSettingsReturnLocation,
  resolveSettingsBackLocation
} from '../../src/utils/user-space-navigation.js';

describe('user-space-navigation', () => {
  it('returns user-space settings for settings-origin pages', () => {
    expect(resolveSettingsBackLocation({ query: { from: 'userspace-settings' } })).toEqual(
      createUserSpaceSettingsReturnLocation()
    );
  });

  it('returns data management for data-origin pages', () => {
    expect(resolveSettingsBackLocation({ query: { from: 'userspace-data' } })).toEqual(
      createUserSpaceDataManagementReturnLocation()
    );
  });

  it('keeps legacy userspace pages returning to the profile home', () => {
    expect(resolveSettingsBackLocation({ query: { from: 'userspace' } })).toEqual(
      createUserSpaceProfileReturnLocation()
    );
  });

  it('returns Cloud+ settings with profile-origin back location', () => {
    expect(resolveSettingsBackLocation({ query: { from: 'cloud-settings' } })).toEqual(
      createCloudSettingsReturnLocation()
    );
  });
});
