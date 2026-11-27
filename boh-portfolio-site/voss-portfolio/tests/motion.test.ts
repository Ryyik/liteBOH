import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveMotionEnabled } from '../src/lib/motion.ts';

test('系统减少动效设置优先于手动开启', () => {
  assert.equal(resolveMotionEnabled({ prefersReducedMotion: true, saved: true }), false);
});

test('手动关闭动效会被保留', () => {
  assert.equal(resolveMotionEnabled({ prefersReducedMotion: false, saved: false }), false);
});

test('低性能设备默认关闭动效', () => {
  assert.equal(resolveMotionEnabled({ prefersReducedMotion: false, deviceMemory: 4 }), false);
  assert.equal(
    resolveMotionEnabled({ prefersReducedMotion: false, hardwareConcurrency: 2 }),
    false,
  );
});

test('性能充足的设备默认开启动效', () => {
  assert.equal(
    resolveMotionEnabled({ prefersReducedMotion: false, deviceMemory: 8, hardwareConcurrency: 8 }),
    true,
  );
});

test('手动设置可以覆盖低性能设备的默认值', () => {
  assert.equal(
    resolveMotionEnabled({ prefersReducedMotion: false, deviceMemory: 2, saved: true }),
    true,
  );
});
