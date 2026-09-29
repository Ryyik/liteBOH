import { describe, expect, it } from 'vitest';

import { applyPoints, readPoints } from '../../src/views/Forum/forum-points.js';

// 这两个函数存在的唯一理由，是它们各对应一次线上事故里的一个陷阱：
//   1) Number(null) === 0、Number('') === 0 —— 「缺失」和「真的是 0」在 JS 里会被混淆，
//      余额 0 与「后端没给余额」必须能区分，否则会把用户界面余额写成 0。
//   2) 写回必须是「上游真给了才写」，不能靠调用方自觉。
describe('readPoints：区分「缺失」与「真的是 0」', () => {
  it('null / undefined / 空串 都视为缺失', () => {
    expect(readPoints(null)).toBeNull();
    expect(readPoints(undefined)).toBeNull();
    expect(readPoints('')).toBeNull();
  });

  it('0 是合法余额，不能被当成缺失', () => {
    expect(readPoints(0)).toBe(0);
    expect(readPoints('0')).toBe(0);
  });

  it('数字与数字字符串正常解析', () => {
    expect(readPoints(125)).toBe(125);
    expect(readPoints('125')).toBe(125);
  });

  it('NaN / 非数字 / 对象 视为缺失', () => {
    expect(readPoints(Number.NaN)).toBeNull();
    expect(readPoints('abc')).toBeNull();
    expect(readPoints({})).toBeNull();
  });
});

describe('applyPoints：只有上游真给了余额才写回', () => {
  it('缺失时不写回，保留调用方原值', () => {
    const userInfo = { points: 42 };

    expect(applyPoints(userInfo, null)).toBe(false);
    expect(applyPoints(userInfo, undefined)).toBe(false);
    expect(applyPoints(userInfo, '')).toBe(false);
    expect(userInfo.points).toBe(42);
  });

  it('真给了就写回，0 也要写回', () => {
    const userInfo = { points: 42 };

    expect(applyPoints(userInfo, 125)).toBe(true);
    expect(userInfo.points).toBe(125);

    expect(applyPoints(userInfo, 0)).toBe(true);
    expect(userInfo.points).toBe(0);
  });

  it('userInfo 缺失时不抛错', () => {
    expect(applyPoints(null, 10)).toBe(false);
    expect(applyPoints(undefined, 10)).toBe(false);
  });
});
