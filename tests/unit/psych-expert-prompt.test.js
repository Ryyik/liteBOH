import { describe, it, expect } from 'vitest';
import { RESPONSE_STYLE_OPTIONS } from '../../src/views/BOHAI/composables/chat-engine-config.js';

const byId = (id) => RESPONSE_STYLE_OPTIONS.find((s) => s.id === id);
const psych = byId('psychologist');

describe('心理专家风格：访谈规则接入', () => {
  it('四个风格结构完整，promptAppendix 与 id 对齐', () => {
    expect(RESPONSE_STYLE_OPTIONS.length).toBeGreaterThanOrEqual(4);
    RESPONSE_STYLE_OPTIONS.forEach((s) => {
      expect(s.id).toBeTruthy();
      expect(s.name).toBeTruthy();
      expect(s.promptAppendix).toContain(`<style id="${s.id}">`);
    });
  });

  it('心理专家携带五个规则段：模式切换 / 访谈协议 / 不给选项 / 认识论分层 / 安全', () => {
    ['<mode_switch>', '<interview_protocol>', '<no_options>', '<epistemic_layering>', '<safety>']
      .forEach((tag) => expect(psych.promptAppendix).toContain(tag));
  });

  it('三条硬护栏写死：一次一题 / 不给选项 / 连问两层上限', () => {
    expect(psych.promptAppendix).toContain('一次只问一个问题');
    expect(psych.promptAppendix).toContain('绝不给用户列选项');
    expect(psych.promptAppendix).toContain('最多连问两层');
  });

  it('认识论分层要求：区分引用 / 推论 / 推测，不许把推论说成真相', () => {
    expect(psych.promptAppendix).toContain('只引用，不推论');
    expect(psych.promptAppendix).toContain('不许把自己的推论说成对方的真相');
  });

  it('安全边界在册：危机资源 12356 / 禁诊断标签 / 禁命理推演', () => {
    expect(psych.promptAppendix).toContain('12356');
    expect(psych.promptAppendix).toContain('不使用诊断标签');
    expect(psych.promptAppendix).toContain('星座');
  });

  it('默认仍是陪伴式，不劫持原有体验', () => {
    expect(psych.promptAppendix).toContain('默认按上面 <instructions> 走');
    expect(psych.promptAppendix).toContain('陪伴者');
  });

  it('不向用户暴露技术名词', () => {
    expect(psych.promptAppendix).toContain('向下箭头');
    expect(psych.promptAppendix).toContain('不要暴露你的提问方法');
  });

  // 以下四条来自 2026-09-16 的真实对话失败案例（六级考试那次）：
  // 模型把规则当耳旁风，退化成问卷 + 复述 + 重复提问。示例比规则有效，所以断言示例在册。
  it('四类禁止问的句式在册（问卷感 / 要方案 / 复述）', () => {
    expect(psych.promptAppendix).toContain('四类禁止问的问题');
    expect(psych.promptAppendix).toContain('你通常会');
    expect(psych.promptAppendix).toContain('你会采取什么行动');
    expect(psych.promptAppendix).toContain('具体是什么方面');
    expect(psych.promptAppendix).toContain('了解到你');
  });

  it('接住 ≠ 复述，且给了判断标准', () => {
    expect(psych.promptAppendix).toContain('接住 ≠ 复述');
    expect(psych.promptAppendix).toContain('只是把他刚说的词换个顺序再说一遍');
  });

  it('对照示例在册（考不过 / 背单词 / 没法应对）', () => {
    expect(psych.promptAppendix).toContain('考不过呗');
    expect(psych.promptAppendix).toContain('背单词好难坚持');
    expect(psych.promptAppendix).toContain('没法应对');
    expect(psych.promptAppendix).toContain('换个说法再问一遍');
  });

  it('硬指标：问题长度上限 + 访谈期不给建议', () => {
    expect(psych.promptAppendix).toContain('一个问题不超过 30 字');
    expect(psych.promptAppendix).toContain('一轮里只允许出现一个问号');
    expect(psych.promptAppendix).toContain('访谈期绝不给建议');
  });

  it('其他风格不被访谈规则污染', () => {
    ['default', 'socratic', 'crisp'].forEach((id) => {
      expect(byId(id).promptAppendix).not.toContain('<interview_protocol>');
      expect(byId(id).promptAppendix).not.toContain('<mode_switch>');
    });
  });
});
