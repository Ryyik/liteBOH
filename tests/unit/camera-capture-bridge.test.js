/**
 * 相机成片交接协议（plans/041）。
 *
 * 锁两件事：
 *  1. **取一次就清空** —— 不清空的话，用户下次进图库会莫名多出一批旧照片；
 *  2. **既接受一批也接受单张** —— 相机页现在传数组，但一旦有人按旧签名传单个
 *     File，静默变成空数组是最难查的那种故障。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  __resetCameraCapture,
  hasCameraCapture,
  stashCameraCapture,
  takeCameraCaptures,
} from '@/utils/camera-capture-bridge.js';

const file = (name) => ({ name, type: 'image/jpeg', size: 1024 });

describe('camera-capture-bridge', () => {
  beforeEach(() => {
    __resetCameraCapture();
  });

  it('空态：取出来是空数组，不是 null', () => {
    expect(hasCameraCapture()).toBe(false);
    expect(takeCameraCaptures()).toEqual([]);
  });

  it('交一批就取回同一批，且取走后清空', () => {
    const files = [file('a.jpg'), file('b.jpg')];
    stashCameraCapture(files);
    expect(hasCameraCapture()).toBe(true);
    expect(takeCameraCaptures()).toHaveLength(2);
    expect(hasCameraCapture()).toBe(false);
    expect(takeCameraCaptures()).toEqual([]);
  });

  it('单个 File 也能交（不静默丢）', () => {
    stashCameraCapture(file('one.jpg'));
    expect(takeCameraCaptures()).toHaveLength(1);
  });

  it('非法值被过滤掉', () => {
    stashCameraCapture([null, file('ok.jpg'), undefined]);
    expect(takeCameraCaptures()).toHaveLength(1);
  });

  it('第二次取不会重复拿到（防「拍一次上传两遍」）', () => {
    stashCameraCapture([file('once.jpg')]);
    expect(takeCameraCaptures()).toHaveLength(1);
    expect(takeCameraCaptures()).toHaveLength(0);
  });
});
