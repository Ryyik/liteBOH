import { describe, it, expect } from 'vitest';
import {
  isLikelyCodeOrCommandRequest,
  isLikelyBohInternalFactualRequest,
  isLikelyCommunityMemoryShare,
  isLikelyDailySummaryRequest,
  isLikelyPlanModeRequest,
  isLikelyMinecraftCommandRequest,
  isLikelyPersonalSupportRequest,
  isLikelyWebSearchRequest,
  resolveBOHAIAutoModeDecision
} from '../../src/utils/bohai-auto-router.js';

describe('bohai auto router: mode routing', () => {
  it('routes code and command requests to pro mode', () => {
    const decision = resolveBOHAIAutoModeDecision('帮我写一段 Vue 组件代码，并解释这个 bug', {
      isAutoMode: true
    });

    expect(isLikelyCodeOrCommandRequest('生成 /give @p diamond_sword 的 MC 指令')).toBe(true);
    expect(isLikelyMinecraftCommandRequest('生成 /give @p diamond_sword 的 MC 指令')).toBe(true);
    expect(decision.modeId).toBe('pro');
    expect(decision.codeOrCommand).toBe(true);
    expect(decision.actionNotes).toContain('切换到专业模式处理代码或指令。');
  });

  it('routes daily summary requests to think mode and asks for Cloud+ when needed', () => {
    const decision = resolveBOHAIAutoModeDecision('总结一下我的最近日常', {
      isAutoMode: true,
      isLoggedIn: true,
      cloudReferenceEnabled: false
    });

    expect(isLikelyDailySummaryRequest('帮我复盘我的近期生活状态')).toBe(true);
    expect(decision.modeId).toBe('think');
    expect(decision.forceCloudReference).toBe(true);
    expect(decision.actionNotes).toContain('需要先确认是否允许参考你的 BOH Cloud+。');
  });

  it('routes complex design questions to think mode', () => {
    const decision = resolveBOHAIAutoModeDecision('根据我的思路设计方案并给出优化建议，要考虑产品体验和技术落地', {
      isAutoMode: true
    });

    expect(decision.modeId).toBe('think');
    expect(decision.complexQuestion).toBe(true);
  });

  it('routes long-running execution plans to Plan mode', () => {
    const decision = resolveBOHAIAutoModeDecision('帮我制定一个三阶段推进计划，并持续跟进风险和下一步行动', {
      isAutoMode: true
    });

    expect(isLikelyPlanModeRequest('这个项目请一步步推进，先计划再执行')).toBe(true);
    expect(decision.modeId).toBe('plan');
    expect(decision.planMode).toBe(true);
    expect(decision.actionNotes).toContain('切换到 Plan 模式分步推进。');
  });

  it('routes BOH internal factual questions to think mode', () => {
    const decision = resolveBOHAIAutoModeDecision('BOH Cloud+ 是什么，入口在哪里？', {
      isAutoMode: true
    });

    expect(isLikelyBohInternalFactualRequest('方块之家最近有什么公告')).toBe(true);
    expect(decision.modeId).toBe('think');
    expect(decision.bohInternalFactual).toBe(true);
    expect(decision.actionNotes).toContain('切换到思考模式核对 BOH 内部资料。');
  });

  it('detects cloud save and shared save intents', () => {
    const cloudDecision = resolveBOHAIAutoModeDecision('帮我把这段话保存到 Cloud+ 里，记一下今天的想法', {
      isAutoMode: true
    });
    const sharedDecision = resolveBOHAIAutoModeDecision('把这条活动记录写入公共记忆库', {
      isAutoMode: true
    });

    expect(cloudDecision.shouldSaveCloud).toBe(true);
    expect(cloudDecision.saveDestination).toBe('cloud');
    expect(sharedDecision.shouldSaveSharedMemory).toBe(true);
    expect(sharedDecision.saveDestination).toBe('shared');
    expect(sharedDecision.shouldAskMemoryDestination).toBe(false);
  });

  it('lets Auto decide when web search is needed', () => {
    const latestDecision = resolveBOHAIAutoModeDecision('OpenAI 最新发布的模型是什么？请联网查一下官网', {
      isAutoMode: true
    });
    const internalDecision = resolveBOHAIAutoModeDecision('方块之家最近论坛公告是什么？', {
      isAutoMode: true
    });
    const healthDecision = resolveBOHAIAutoModeDecision('肌酸不训练的时候要喝吗', {
      isAutoMode: true
    });
    const personalHealthDecision = resolveBOHAIAutoModeDecision('我不训练的时候要不要喝肌酸', {
      isAutoMode: true
    });
    const generalDecision = resolveBOHAIAutoModeDecision('为什么天空是蓝的', {
      isAutoMode: true
    });

    expect(isLikelyWebSearchRequest('今天上海天气怎么样')).toBe(true);
    expect(isLikelyWebSearchRequest('肌酸不训练的时候要喝吗')).toBe(true);
    expect(isLikelyWebSearchRequest('我不训练的时候要不要喝肌酸')).toBe(true);
    expect(latestDecision.shouldSearchWeb).toBe(true);
    expect(healthDecision.shouldSearchWeb).toBe(true);
    expect(personalHealthDecision.shouldSearchWeb).toBe(true);
    expect(generalDecision.shouldSearchWeb).toBe(true);
    expect(latestDecision.actionNotes).toContain('准备联网搜索最新资料。');
    expect(internalDecision.shouldSearchWeb).toBe(false);
  });

  it('treats everyday personal distress as support instead of web health research', () => {
    const decision = resolveBOHAIAutoModeDecision('感觉睡不好咋办', {
      isAutoMode: true
    });

    expect(isLikelyPersonalSupportRequest('感觉睡不好咋办')).toBe(true);
    expect(isLikelyWebSearchRequest('感觉睡不好咋办')).toBe(false);
    expect(decision.shouldSearchWeb).toBe(false);
    expect(decision.modeId).toBe('fast');
  });
});

describe('bohai auto router: memory capture prompt', () => {
  it('asks before writing community memory for shared community facts', () => {
    const text = '今天 LF 和 Eleven 在方块之家群里一起玩哈比快车谋杀案，还提到要下周继续组织活动。';
    const decision = resolveBOHAIAutoModeDecision(text, {
      isAutoMode: true
    });

    expect(isLikelyCommunityMemoryShare(text)).toBe(true);
    expect(decision.shouldAskSharedMemory).toBe(true);
    expect(decision.actionNotes).toContain('识别到社群记忆，准备询问是否写入公共记忆库。');
  });

  it('does not treat community questions as memory sharing', () => {
    expect(isLikelyCommunityMemoryShare('方块之家成立背景是什么？')).toBe(false);
  });

  it('does not ask to save when the user asks for recent forum summaries', () => {
    const text = '总结一下论坛最近发生的事';
    const decision = resolveBOHAIAutoModeDecision(text, {
      isAutoMode: true
    });

    expect(isLikelyCommunityMemoryShare(text)).toBe(false);
    expect(decision.communityMemoryShare).toBe(false);
    expect(decision.shouldSaveCloud).toBe(false);
    expect(decision.shouldSaveSharedMemory).toBe(false);
    expect(decision.shouldAskMemoryDestination).toBe(false);
    expect(decision.saveDestination).toBe('none');
  });
});
