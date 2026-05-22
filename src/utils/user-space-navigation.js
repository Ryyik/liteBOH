export const createUserSpaceProfileReturnLocation = () => ({
  path: '/user-space/profile'
});

export const createUserSpaceSettingsReturnLocation = () => ({
  path: '/user-space',
  query: {
    tab: 'profile',
    view: 'settings'
  }
});

export const createUserSpaceDataManagementReturnLocation = () => ({
  path: '/user-space',
  query: {
    tab: 'profile',
    view: 'data-management'
  }
});

export const createCloudSettingsReturnLocation = () => ({
  path: '/user-space/note',
  query: {
    view: 'settings',
    from: 'userspace'
  }
});

export const createCloudSettingsSubscriptionLocation = () => ({
  path: '/user-space/subscriptions',
  query: {
    from: 'cloud-settings'
  }
});

export const resolveSettingsBackLocation = (route, fallback = createUserSpaceProfileReturnLocation()) => {
  const from = String(route?.query?.from || '').trim();

  if (from === 'cloud-settings') {
    return createCloudSettingsReturnLocation();
  }

  if (from === 'userspace') {
    return createUserSpaceProfileReturnLocation();
  }

  if (from === 'userspace-settings') {
    return createUserSpaceSettingsReturnLocation();
  }

  if (from === 'userspace-data') {
    return createUserSpaceDataManagementReturnLocation();
  }

  return fallback;
};
