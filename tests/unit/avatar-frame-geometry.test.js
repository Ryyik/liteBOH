import { describe, expect, it } from 'vitest';
import {
  CANVAS_SIZE,
  AVATAR_MAX_SCALE,
  AVATAR_MIN_SCALE,
  SIZE_PRESETS,
  computeMetrics,
  anchorPoint,
  layerTransform,
  sizeState,
  sizeStates,
  suggestScale,
  reviewFrame,
  hasRealAlpha,
  resolveWhiteBackground
} from '../../src/views/AvatarConsole/frame-geometry.js';

/**
 * 几何口径测试。
 * 这些数字不是随手写的 —— 它们要和手工流程（scripts/probes 里 python 侧）算出来的对得上，
 * 否则控制台会把框做坏：scale 偏大 → 框撑爆卡片；偏小 → 头像被框压住。
 */

/** 造一个 RGBA ImageData 形状的普通对象（不需要真 canvas） */
function makeImageData(w, h, painter) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = painter(x, y);
      const p = (y * w + x) * 4;
      data[p] = r; data[p + 1] = g; data[p + 2] = b; data[p + 3] = a;
    }
  }
  return { data, width: w, height: h };
}

describe('computeMetrics · scale = 画布边长 / 内孔直径', () => {
  // 菊花梨原图：2048 方图，内孔内接半径 353px（2026-09-18 实测）
  const hole = { hx: 1024, hy: 1024, r: 353 };
  const base = { hole, imgW: 2048, imgH: 2048 };

  it('未缩放时 scale = 2048 / (2×353) = 2.90（与 python 侧实测一致）', () => {
    const m = computeMetrics({ ...base, zoom: 1 });
    expect(m.scale).toBeCloseTo(2048 / (2 * 353), 2);
    expect(m.scale).toBeCloseTo(2.9, 2);
  });

  it('放大后在区间内：zoom 1.394 → scale ≈ 2.08（等效于手工裁到占比 48%）', () => {
    const m = computeMetrics({ ...base, zoom: 1.394 });
    expect(m.scale).toBeCloseTo(2.08, 2);
    expect(m.holeShare).toBeCloseTo(0.48, 2);
  });

  it('缩放与 scale 成反比', () => {
    const a = computeMetrics({ ...base, zoom: 1 });
    const b = computeMetrics({ ...base, zoom: 2 });
    expect(b.scale).toBeCloseTo(a.scale / 2, 3);
  });

  it('孔心偏移按欧氏距离计', () => {
    const m = computeMetrics({ ...base, zoom: 1, offsetX: 30, offsetY: 40 });
    expect(m.offset).toBeCloseTo(50, 5);
  });
});

/**
 * 回归：真实事故 2026-09-25。
 * 中秋特别.PNG：1400²、带 alpha 通道但 196 万像素全是 255，中心是纯白不是孔洞
 * → hasRealAlpha=false、detectInnerHole r=0。此时组件若拿不到有效 k，
 * 素材层就会塌成 0×0 —— 上传完「什么都看不见」，运营连图长什么样都不知道。
 */
describe('layerTransform · 素材层变换（测不出内孔也必须看得见素材）', () => {
  const STAGE = 380;
  const toStage = STAGE / CANVAS_SIZE;
  const noHole = { hx: 0, hy: 0, r: 0, ratio: 0 };

  it('未测出内孔时仍给出有效尺寸（不是 0×0）', () => {
    const t = layerTransform({ hole: noHole, imgW: 1400, imgH: 1400, zoom: 1, stage: STAGE });
    expect(Number.isFinite(t.width)).toBe(true);
    expect(Number.isFinite(t.height)).toBe(true);
    expect(t.width).toBeGreaterThan(50);
    expect(t.height).toBeGreaterThan(50);
  });

  it('未测出内孔时按图片中心对齐 = 原图铺满画布（1400² @zoom=1）', () => {
    const t = layerTransform({ hole: noHole, imgW: 1400, imgH: 1400, zoom: 1, stage: STAGE });
    expect(t.width).toBeCloseTo(STAGE, 6);
    expect(t.height).toBeCloseTo(STAGE, 6);
    expect(t.left).toBeCloseTo(0, 6);
    expect(t.top).toBeCloseTo(0, 6);
  });

  it('未测出内孔的非方图按长边铺满画布并居中（上下对称留白）', () => {
    const t = layerTransform({ hole: noHole, imgW: 1600, imgH: 800, zoom: 1, stage: STAGE });
    expect(t.width).toBeCloseTo(STAGE, 6);
    expect(t.height).toBeCloseTo(STAGE / 2, 6);
    expect(t.left).toBeCloseTo(0, 6);
    expect(t.top).toBeCloseTo(STAGE / 4, 6);
  });

  it('测出内孔时孔心落在画布正中心（这条不变式决定 scale 口径）', () => {
    const hole = { hx: 1024, hy: 1024, r: 353 };
    const t = layerTransform({ hole, imgW: 2048, imgH: 2048, zoom: 1.394, stage: STAGE });
    expect(t.k).toBeCloseTo((CANVAS_SIZE / 2048) * 1.394, 6);
    expect(t.width).toBeCloseTo(2048 * t.k * toStage, 6);
    expect(hole.hx * t.k + t.left / toStage).toBeCloseTo(CANVAS_SIZE / 2, 6);
    expect(hole.hy * t.k + t.top / toStage).toBeCloseTo(CANVAS_SIZE / 2, 6);
  });

  it('孔心偏移落到 left/top 上（拖动摆位真的会动，offset 是画布像素不带 k）', () => {
    const hole = { hx: 1024, hy: 1024, r: 353 };
    const base = layerTransform({ hole, imgW: 2048, imgH: 2048, zoom: 1, stage: STAGE });
    const moved = layerTransform({ hole, imgW: 2048, imgH: 2048, zoom: 1, offsetX: 100, offsetY: -60, stage: STAGE });
    expect(moved.left).toBeCloseTo(base.left - 100 * toStage, 6);
    expect(moved.top).toBeCloseTo(base.top + 60 * toStage, 6);
  });
});

describe('anchorPoint · 预览与烘焙共用的对齐锚点', () => {
  it('有内孔时锚点 = 孔心', () => {
    expect(anchorPoint({ hx: 1024, hy: 980, r: 353 }, 2048, 2048)).toEqual({ x: 1024, y: 980, hasHole: true });
  });

  it('测不出内孔（r=0 / 缺失）时回退图片自身中心', () => {
    expect(anchorPoint({ hx: 0, hy: 0, r: 0 }, 1400, 1400)).toEqual({ x: 700, y: 700, hasHole: false });
    expect(anchorPoint(undefined, 1600, 800)).toEqual({ x: 800, y: 400, hasHole: false });
  });

  it('非方图也按自身中心（不是画布中心）', () => {
    expect(anchorPoint({ hx: 0, hy: 0, r: 0 }, 1600, 800).x).toBe(800);
    expect(anchorPoint({ hx: 0, hy: 0, r: 0 }, 1600, 800).y).toBe(400);
  });
});

describe('sizeState / sizeStates · 每档各有自己的容器', () => {  const byPx = (states, px) => states.find((s) => s.px === px);

  it('scale 2.90 时最紧档是 52px 卡片并判溢出', () => {
    const { worst } = sizeStates(2.9);
    expect(worst.px).toBe(52);
    expect(worst.cls).toBe('bad');
    expect(worst.over).toBeCloseTo(52 * 2.9 - 116, 4);
  });

  it('96px 档用 hero 容器 260，不会因为 116 卡片被误判', () => {
    const { all } = sizeStates(2.9);
    const s96 = byPx(all, 96);
    expect(s96.container).toBe(260);
    expect(s96.frameLayerPx).toBeCloseTo(278.4, 1);
    expect(s96.cls).toBe('bad');   // 278.4 > 260 确实超 hero 容器
  });

  it('scale 2.038（一键适配目标）四档全部装得下', () => {
    const { all, worst } = sizeStates(2.038);
    expect(all.every((s) => s.cls === '')).toBe(true);
    expect(worst.px).toBe(52);
  });

  it('余量落在 WARN_MARGIN 内转黄条', () => {
    const scale = (116 - 3) / 52;   // 52px 档只剩 3px 余量
    const s = sizeState(SIZE_PRESETS.find((p) => p.px === 52), scale);
    expect(s.cls).toBe('warn');
  });

  it('内置档位表与既有 UI 场景一致（36/42/52 卡片、96 hero）', () => {
    expect(SIZE_PRESETS.map((p) => [p.px, p.container])).toEqual([[36, 116], [42, 116], [52, 116], [96, 260]]);
  });
});

describe('suggestScale', () => {
  it('按 52px × 116px 卡片预留 10px 余量 → 2.04', () => {
    expect(suggestScale()).toBeCloseTo((116 - 10) / 52, 4);
  });

  it('结果被夹在合理区间内', () => {
    expect(suggestScale({ margin: -1000 })).toBeLessThanOrEqual(AVATAR_MAX_SCALE);
    expect(suggestScale({ margin: 1000 })).toBeGreaterThanOrEqual(AVATAR_MIN_SCALE);
  });
});

describe('reviewFrame · 发布前体检', () => {
  const good = { scale: 2.08, offset: 0, holeShare: 0.48, hasAlpha: true };

  it('合规参数可发布', () => {
    const r = reviewFrame(good);
    expect(r.ok).toBe(true);
    expect(r.blockers).toEqual([]);
  });

  it('无透明层直接拦下（深色主题会露白方块）', () => {
    const r = reviewFrame({ ...good, hasAlpha: false });
    expect(r.ok).toBe(false);
    expect(r.blockers.some((b) => b.includes('透明通道'))).toBe(true);
  });

  it('scale 超上限拦下，并给出溢出档位', () => {
    const r = reviewFrame({ ...good, scale: 2.9 });
    expect(r.ok).toBe(false);
    expect(r.blockers.some((b) => b.includes('超过上限'))).toBe(true);
  });

  it('孔心偏移超 24px 拦下（渲染按图片中心对齐会错位）', () => {
    const r = reviewFrame({ ...good, offset: 40 });
    expect(r.ok).toBe(false);
    expect(r.blockers.some((b) => b.includes('偏离画布中心'))).toBe(true);
  });

  it('轻微偏移只给提醒不拦', () => {
    const r = reviewFrame({ ...good, offset: 12 });
    expect(r.ok).toBe(true);
    expect(r.warnings.some((w) => w.includes('偏离'))).toBe(true);
  });

  it('scale 偏小只提醒（框会紧贴头像）', () => {
    const r = reviewFrame({ ...good, scale: 1.1, holeShare: 0.9 });
    expect(r.ok).toBe(true);
    expect(r.warnings.some((w) => w.includes('紧贴头像'))).toBe(true);
  });

  it('测不出内孔（scale 非法）拦下', () => {
    const r = reviewFrame({ ...good, scale: Infinity });
    expect(r.ok).toBe(false);
  });
});

describe('hasRealAlpha · 按像素事实判定，不看扩展名', () => {
  it('全不透明的 RGBA（白底存成 RGBA）判为无透明层', () => {
    const img = makeImageData(20, 20, () => [255, 255, 255, 255]);
    expect(hasRealAlpha(img)).toBe(false);
  });

  it('存在成片透明区判为有透明层', () => {
    const img = makeImageData(20, 20, (x, y) => (x < 10 ? [255, 0, 0, 255] : [0, 0, 0, 0]));
    expect(hasRealAlpha(img)).toBe(true);
  });

  it('只有零星几个半透明像素不足以判为有透明层（<2% 阈值）', () => {
    const img = makeImageData(100, 100, (x, y) => (x === 0 && y === 0 ? [0, 0, 0, 200] : [255, 255, 255, 255]));
    expect(hasRealAlpha(img)).toBe(false);
  });
});

describe('resolveWhiteBackground · 只清「连通到外部或孔心」的白', () => {
  // 12×12：实心不透明块 (1..10)，中心挖孔 (4..7)，块内再留一个孤立白点 (2,2)
  const W = 12;
  const img = makeImageData(W, W, (x, y) => {
    const inBlock = x >= 1 && x <= 10 && y >= 1 && y <= 10;
    if (!inBlock) return [255, 255, 255, 255];              // 外部白底
    const inHole = x >= 4 && x <= 7 && y >= 4 && y <= 7;
    if (inHole) return [255, 255, 255, 255];                 // 孔洞白（连通画布中心）
    if (x === 2 && y === 2) return [255, 255, 255, 255];     // 主体内部孤立白点（高光）
    return [180, 90, 40, 255];                               // 主体
  });

  const { data, width } = resolveWhiteBackground(img, 244);
  const alphaAt = (x, y) => data[(y * width + x) * 4 + 3];

  it('外部白底被清成透明', () => {
    expect(alphaAt(0, 0)).toBe(0);
    expect(alphaAt(11, 11)).toBe(0);
  });

  it('孔洞白被清成透明（中心必须是空的，否则会挡住头像）', () => {
    expect(alphaAt(5, 5)).toBe(0);
    expect(alphaAt(4, 4)).toBe(0);
  });

  it('主体内部被包围的白点保留（水彩高光不能被抠掉）', () => {
    expect(alphaAt(2, 2)).toBe(255);
  });

  it('主体本身不受影响', () => {
    expect(alphaAt(1, 5)).toBe(255);
    expect(alphaAt(10, 10)).toBe(255);
  });
});

describe('常量口径', () => {
  it('成品边长与存量素材一致', () => {
    expect(CANVAS_SIZE).toBe(1223);
  });
  it('scale 合理区间 1.20 ~ 2.20', () => {
    expect(AVATAR_MIN_SCALE).toBe(1.2);
    expect(AVATAR_MAX_SCALE).toBe(2.2);
  });
});
