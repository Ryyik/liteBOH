import { describe, expect, it } from 'vitest';
import { publicRoutes } from '../../src/router/routes/public.js';

describe('dev route index launcher', () => {
  it('registers /__dev/routes as a lazily loaded DEV page', () => {
    const route = publicRoutes.find((entry) => entry.path === '/__dev/routes');

    expect(route).toBeDefined();
    expect(route?.name).toBe('RouteIndex');
    expect(typeof route?.component).toBe('function');
    expect(route?.meta?.hideFooter).toBe(true);
  });

  it('keeps the launcher inside the DEV-gated block with its siblings', () => {
    const devPaths = publicRoutes
      .filter((entry) => entry.path.startsWith('/__dev/'))
      .map((entry) => entry.path);

    expect(devPaths).toEqual([
      '/__dev/motion',
      '/__dev/liquid-glass-nav',
      '/__dev/glass-repro',
      '/__dev/routes',
    ]);
  });
});
