import { describe, expect, it } from 'vitest';
import {
  PROVINCES,
  composeAddress,
  looksLikeFullAddress,
  parseAddress,
} from '../../src/utils/address-parse.js';

/**
 * 结算地址拆分（2026-11-01）。
 *
 * 这份解析器只有一条不可退让的性质：**不丢字**。
 * 拆不出来时，原文必须原样落在 detail 里 —— 否则用户粘完发现少了半段、
 * 管理员收到的地址是残的，比「不识别」严重得多。
 */
describe('parseAddress', () => {
  it('全称省 + 市 + 详细地址：三段各归其位', () => {
    expect(parseAddress('广东省深圳市南山区科技园路 1 号 3 栋 501')).toEqual({
      province: '广东省',
      city: '深圳市',
      detail: '南山区科技园路 1 号 3 栋 501',
    });
  });

  it('简称省份（广东 / 内蒙 / 广西）也能认出来并归一成全称', () => {
    expect(parseAddress('广东广州天河区体育西路 1 号').province).toBe('广东省');
    expect(parseAddress('内蒙古呼和浩特市新城区 1 号').province).toBe('内蒙古自治区');
    expect(parseAddress('广西南宁市青秀区 1 号').province).toBe('广西壮族自治区');
  });

  it('直辖市：省=市=同名，市一段留空、区县进详细地址', () => {
    expect(parseAddress('北京市朝阳区建国路 88 号')).toEqual({
      province: '北京市',
      city: '',
      detail: '朝阳区建国路 88 号',
    });
  });

  it('自治州 / 地区 / 盟 都算「市」这一段', () => {
    expect(parseAddress('四川省阿坝藏族羌族自治州汶川县映秀镇').city).toBe('阿坝藏族羌族自治州');
    expect(parseAddress('西藏自治区那曲地区安多县 1 号').city).toBe('那曲地区');
  });

  it('没有省份的纯详细地址：原文整段落到 detail，一个字都不丢', () => {
    const raw = '科技园路 1 号 3 栋 501';
    const parsed = parseAddress(raw);
    expect(parsed.province).toBe('');
    expect(parsed.city).toBe('');
    expect(parsed.detail).toBe(raw);
  });

  it('省名不在开头（用户习惯先写路名）也不丢字', () => {
    const parsed = parseAddress('人民路 5 号 广东省 深圳市');
    expect(parsed.province).toBe('广东省');
    // 省被摘走，剩下的前后半段要拼回去
    expect(parsed.detail).toContain('人民路');
  });

  it('空值 / 纯空白返回全空，不抛错', () => {
    expect(parseAddress('')).toEqual({ province: '', city: '', detail: '' });
    expect(parseAddress('   ')).toEqual({ province: '', city: '', detail: '' });
    expect(parseAddress(null)).toEqual({ province: '', city: '', detail: '' });
  });
});

describe('composeAddress', () => {
  it('按 省 市 详细 拼成一段，中文地址不加分隔空格', () => {
    expect(composeAddress({ province: '广东省', city: '深圳市', detail: '南山区 1 号' })).toBe(
      '广东省深圳市南山区 1 号',
    );
    expect(composeAddress({ province: '北京市', city: '', detail: '朝阳区 1 号' })).toBe(
      '北京市朝阳区 1 号',
    );
  });

  it('拆 → 合 是可逆的（识别粘贴后落库不会变形）', () => {
    const raw = '浙江省杭州市西湖区文三路 100 号';
    expect(composeAddress(parseAddress(raw))).toBe(raw);
  });
});

describe('looksLikeFullAddress', () => {
  it('太短的文本不触发自动识别（避免把门牌号误判成整段地址）', () => {
    expect(looksLikeFullAddress('501')).toBe(false);
    expect(looksLikeFullAddress('3 栋 501')).toBe(false);
  });

  it('含行政/道路特征的长文本才算整段地址', () => {
    expect(looksLikeFullAddress('广东省深圳市南山区科技园路 1 号')).toBe(true);
    expect(looksLikeFullAddress('朝阳区建国路 88 号')).toBe(true);
  });
});

describe('PROVINCES', () => {
  it('34 个省级行政区齐全且无重复', () => {
    expect(PROVINCES).toHaveLength(34);
    expect(new Set(PROVINCES).size).toBe(34);
  });
});
