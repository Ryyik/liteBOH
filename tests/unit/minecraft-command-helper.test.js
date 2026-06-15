import { describe, expect, it } from 'vitest';
import { detectCommandIntent, getRelevantCommandInstructions, getCommandSystemPrompt, validateCommandOutput, buildCommandRepairPrompt } from '../../src/utils/minecraft-command-helper.js';

describe('minecraft-command-helper: detectCommandIntent', () => {
  it('detects give command intent', () => {
    const result = detectCommandIntent('给我一个钻石物品');
    expect(result.matchedGroups).toContain('give');
  });

  it('detects effect command intent', () => {
    const result = detectCommandIntent('如何给药水效果');
    expect(result.matchedGroups).toContain('effect');
  });

  it('detects multiple intents', () => {
    const result = detectCommandIntent('给我一把附魔武器');
    expect(result.matchedGroups).toContain('give');
    expect(result.matchedGroups).toContain('enchant');
  });

  it('detects bedrock version', () => {
    const result = detectCommandIntent('基岩版give命令');
    expect(result.versionTarget).toBe('bedrock');
    expect(result.requireDualVersion).toBe(false);
  });

  it('detects Java modern version', () => {
    const result = detectCommandIntent('1.21最新版give');
    expect(result.versionTarget).toBe('java_modern');
  });

  it('detects Java classic version', () => {
    const result = detectCommandIntent('1.16旧版NBT give命令');
    expect(result.versionTarget).toBe('java_classic');
  });

  it('detects unspecified version (Java modern wins over classic when both)', () => {
    const result = detectCommandIntent('1.21最新版 1.16旧版');
    expect(result.versionTarget).toBe('unspecified');
    expect(result.requireDualVersion).toBe(true);
  });

  it('returns general when no command keywords match', () => {
    const result = detectCommandIntent('hello world test');
    expect(result.matchedGroups).toEqual(['general']);
    expect(result.versionTarget).toBe('unspecified');
  });

  it('handles empty input', () => {
    const result = detectCommandIntent('');
    expect(result.matchedGroups).toEqual(['general']);
  });

  it('detects summon command intent', () => {
    const result = detectCommandIntent('召唤一个僵尸');
    expect(result.matchedGroups).toContain('summon');
  });

  it('detects gamerule command intent', () => {
    const result = detectCommandIntent('死亡不掉落怎么设置');
    expect(result.matchedGroups).toContain('gamerule');
  });

  it('is case insensitive', () => {
    const result = detectCommandIntent('GIVE ME A SWORD');
    expect(result.matchedGroups).toContain('give');
  });
});

describe('minecraft-command-helper: getRelevantCommandInstructions', () => {
  it('returns JSON string with instructions', () => {
    const result = getRelevantCommandInstructions('给我一个钻石物品');
    expect(typeof result).toBe('string');
    const parsed = JSON.parse(result);
    expect(parsed.meta).toBeDefined();
    expect(parsed.intent).toBeDefined();
    expect(parsed.intent.matched_topics).toContain('give');
    expect(parsed.instructions).toBeDefined();
    expect(parsed.templates).toBeDefined();
  });

  it('includes give template for give intent', () => {
    const result = getRelevantCommandInstructions('给予物品');
    const parsed = JSON.parse(result);
    expect(parsed.templates.give_item).toBeDefined();
  });

  it('includes default templates for general intent', () => {
    const result = getRelevantCommandInstructions('hello world');
    const parsed = JSON.parse(result);
    expect(Object.keys(parsed.templates).length).toBeGreaterThanOrEqual(3);
  });

  it('includes enchantment dictionary for enchant intent', () => {
    const result = getRelevantCommandInstructions('附魔武器装备');
    const parsed = JSON.parse(result);
    expect(parsed.dictionaries.enchantments).toBeDefined();
  });
});

describe('minecraft-command-helper: getCommandSystemPrompt', () => {
  it('includes version directive for bedrock', () => {
    const prompt = getCommandSystemPrompt('{}', { versionTarget: 'bedrock' });
    expect(prompt).toContain('基岩版');
    expect(prompt).toContain('严禁在 /give 里使用 NBT');
  });

  it('includes version directive for java_modern', () => {
    const prompt = getCommandSystemPrompt('{}', { versionTarget: 'java_modern' });
    expect(prompt).toContain('1.20.5+');
    expect(prompt).toContain('组件语法');
  });

  it('includes dual version directive for unspecified', () => {
    const prompt = getCommandSystemPrompt('{}', { versionTarget: 'unspecified', requireDualVersion: true });
    expect(prompt).toContain('两套命令');
  });

  it('includes the formatted instructions', () => {
    const prompt = getCommandSystemPrompt('CUSTOM_INSTRUCTIONS', {});
    expect(prompt).toContain('CUSTOM_INSTRUCTIONS');
  });

  it('includes mcfunction code block requirement', () => {
    const prompt = getCommandSystemPrompt('{}', {});
    expect(prompt).toContain('mcfunction');
  });
});

describe('minecraft-command-helper: validateCommandOutput', () => {
  it('passes valid output', () => {
    const result = validateCommandOutput('```mcfunction\n/give @p diamond_sword\n```', { versionTarget: 'unspecified' });
    expect(result.ok).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('detects NBT syntax in bedrock output', () => {
    const result = validateCommandOutput('/give @p diamond_sword{Enchantments:[{id:sharpness,lvl:5}]}', { versionTarget: 'bedrock' });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.includes('基岩版'))).toBe(true);
  });

  it('detects classic NBT in java_modern output', () => {
    const result = validateCommandOutput('/give @p diamond_sword{Enchantments:[{}]}', { versionTarget: 'java_modern' });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.includes('1.20.5+'))).toBe(true);
  });

  it('detects modern components in java_classic output', () => {
    const result = validateCommandOutput('/give @p diamond_sword[enchantments={}]', { versionTarget: 'java_classic' });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.includes('1.13-1.20.4'))).toBe(true);
  });

  it('requires dual version when unspecified', () => {
    const result = validateCommandOutput('Just some basic text', { versionTarget: 'unspecified', requireDualVersion: true });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.includes('两套方案'))).toBe(true);
  });

  it('passes dual version when both present', () => {
    const result = validateCommandOutput(
      'Java 1.20.5+\n/give @p diamond_sword[enchantments={}]\n\nJava 1.13-1.20.4\n/give @p diamond_sword{Enchantments:[{}]}',
      { versionTarget: 'unspecified', requireDualVersion: true }
    );
    expect(result.ok).toBe(true);
  });
});

describe('minecraft-command-helper: buildCommandRepairPrompt', () => {
  it('builds repair prompt with issues', () => {
    const prompt = buildCommandRepairPrompt(
      'give me a sword',
      'Old output',
      { issues: ['Issue 1', 'Issue 2'] }
    );
    expect(prompt).toContain('give me a sword');
    expect(prompt).toContain('Old output');
    expect(prompt).toContain('Issue 1');
    expect(prompt).toContain('Issue 2');
    expect(prompt).toContain('不要解释修复过程');
  });
});