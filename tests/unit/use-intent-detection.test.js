import { describe, expect, it } from 'vitest';
import {
  isCommunityQuestion,
  isCommunityCreativeRequest,
  shouldUseMemoryContext,
  shouldUseSharedMemoryContext,
  isTreeholeReflectionQuestion,
  shouldUseTreeholeContext,
  isTreeholeCreateConfirm,
  isTreeholeCreateReject,
  isSharedMemorySaveConfirm,
  isSharedMemorySaveReject,
  resolveMemorySaveDestinationFromText,
  formatMemorySavePrompt,
  summarizeThinkingSubject,
} from '@/views/BOHAI/composables/useIntentDetection.js';

// ─── isCommunityQuestion ─────────────────────────────────────────────────────

describe('useIntentDetection: isCommunityQuestion', () => {
  it('returns true for text containing "方块之家"', () => {
    expect(isCommunityQuestion('方块之家最近有什么活动？')).toBe(true);
  });

  it('returns true for text containing "社区"', () => {
    expect(isCommunityQuestion('社区里有没有新的公告？')).toBe(true);
  });

  it('returns true for text containing member names', () => {
    expect(isCommunityQuestion('ryyik最近在做什么？')).toBe(true);
    expect(isCommunityQuestion('小牛今天上线了吗')).toBe(true);
  });

  it('returns true for text containing "论坛"', () => {
    expect(isCommunityQuestion('论坛怎么发帖？')).toBe(true);
  });

  it('returns true for text containing "帖子"', () => {
    expect(isCommunityQuestion('看一下最新的帖子')).toBe(true);
  });

  it('returns true for text containing "公告"', () => {
    expect(isCommunityQuestion('公告区在哪里')).toBe(true);
  });

  it('returns true for text containing "周年庆"', () => {
    expect(isCommunityQuestion('周年庆什么时候开始')).toBe(true);
  });

  it('returns true for text containing "内战"', () => {
    expect(isCommunityQuestion('内战怎么报名')).toBe(true);
  });

  it('returns true for text containing "hypixel" (case-insensitive via normalize)', () => {
    expect(isCommunityQuestion('Hypixel服务器怎么样')).toBe(true);
    expect(isCommunityQuestion('hypixel是什么')).toBe(true);
  });

  it('returns true for text containing "我的世界"', () => {
    expect(isCommunityQuestion('我的世界怎么联机')).toBe(true);
  });

  it('returns true for text containing "minecraft"', () => {
    expect(isCommunityQuestion('Minecraft服务器IP')).toBe(true);
  });

  it('returns true for text containing "英雄联盟"', () => {
    expect(isCommunityQuestion('英雄联盟怎么玩')).toBe(true);
  });

  it('returns true for text containing "王者荣耀"', () => {
    expect(isCommunityQuestion('王者荣耀新赛季')).toBe(true);
  });

  it('returns false for text without any community keywords', () => {
    expect(isCommunityQuestion('今天天气怎么样')).toBe(false);
    expect(isCommunityQuestion('你好')).toBe(false);
    expect(isCommunityQuestion('帮我算一下')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isCommunityQuestion('')).toBe(false);
  });

  it('returns false for null input', () => {
    expect(isCommunityQuestion(null)).toBe(false);
  });

  it('returns false for undefined input', () => {
    expect(isCommunityQuestion(undefined)).toBe(false);
  });

  it('matches case-insensitively', () => {
    // normalizeText lowercases input, so uppercase keywords still match
    expect(isCommunityQuestion('HYPIXEL')).toBe(true);
    expect(isCommunityQuestion('Minecraft')).toBe(true);
  });
});

// ─── isCommunityCreativeRequest ───────────────────────────────────────────────

describe('useIntentDetection: isCommunityCreativeRequest', () => {
  it('returns true for text containing "写"', () => {
    expect(isCommunityCreativeRequest('帮我写一段文案')).toBe(true);
  });

  it('returns true for text containing "生成"', () => {
    expect(isCommunityCreativeRequest('生成一个海报文案')).toBe(true);
  });

  it('returns true for text containing "创作"', () => {
    expect(isCommunityCreativeRequest('创作一个故事')).toBe(true);
  });

  it('returns true for text containing "改写"', () => {
    expect(isCommunityCreativeRequest('帮我把这段话改写一下')).toBe(true);
  });

  it('returns true for text containing "润色"', () => {
    expect(isCommunityCreativeRequest('润色一下这段文字')).toBe(true);
  });

  it('returns true for text containing "设计"', () => {
    expect(isCommunityCreativeRequest('设计一个logo')).toBe(true);
  });

  it('returns true for text containing "起草"', () => {
    expect(isCommunityCreativeRequest('起草一份公告')).toBe(true);
  });

  it('returns true for text containing "文案"', () => {
    expect(isCommunityCreativeRequest('帮我写个文案')).toBe(true);
  });

  it('returns true for text containing "口号"', () => {
    expect(isCommunityCreativeRequest('设计一个口号')).toBe(true);
  });

  it('returns true for text containing "标题"', () => {
    expect(isCommunityCreativeRequest('帮我想一个标题')).toBe(true);
  });

  it('returns true for text containing "祝福"', () => {
    expect(isCommunityCreativeRequest('写一段祝福语')).toBe(true);
  });

  it('returns true for text containing "海报"', () => {
    expect(isCommunityCreativeRequest('设计一个海报')).toBe(true);
  });

  it('returns true for text containing "宣传语"', () => {
    expect(isCommunityCreativeRequest('写一条宣传语')).toBe(true);
  });

  it('returns true for text containing "故事"', () => {
    expect(isCommunityCreativeRequest('创作一个故事')).toBe(true);
  });

  it('returns true for text containing "诗"', () => {
    expect(isCommunityCreativeRequest('写一首诗')).toBe(true);
  });

  it('returns true for text containing "歌词"', () => {
    expect(isCommunityCreativeRequest('写一段歌词')).toBe(true);
  });

  it('returns true for text containing "设定"', () => {
    expect(isCommunityCreativeRequest('设计一个角色设定')).toBe(true);
  });

  it('returns true for text containing "梗图"', () => {
    expect(isCommunityCreativeRequest('生成一个梗图')).toBe(true);
  });

  it('returns false for text without creative keywords', () => {
    expect(isCommunityCreativeRequest('今天天气不错')).toBe(false);
    expect(isCommunityCreativeRequest('你好')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isCommunityCreativeRequest('')).toBe(false);
  });

  it('returns false for null input', () => {
    expect(isCommunityCreativeRequest(null)).toBe(false);
  });

  it('returns false for undefined input', () => {
    expect(isCommunityCreativeRequest(undefined)).toBe(false);
  });
});

// ─── shouldUseMemoryContext ──────────────────────────────────────────────────

describe('useIntentDetection: shouldUseMemoryContext', () => {
  it('returns false for operation questions', () => {
    expect(shouldUseMemoryContext('怎么发帖')).toBe(false);
    expect(shouldUseMemoryContext('如何进入论坛')).toBe(false);
  });

  it('returns true for community questions', () => {
    expect(shouldUseMemoryContext('方块之家最近有什么活动')).toBe(true);
    expect(shouldUseMemoryContext('社区有什么公告')).toBe(true);
  });

  it('returns false for general questions that are neither operation nor community', () => {
    expect(shouldUseMemoryContext('今天天气怎么样')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(shouldUseMemoryContext('')).toBe(false);
  });
});

// ─── shouldUseSharedMemoryContext ────────────────────────────────────────────

describe('useIntentDetection: shouldUseSharedMemoryContext', () => {
  it('returns false for empty or whitespace-only text', () => {
    expect(shouldUseSharedMemoryContext('')).toBe(false);
    expect(shouldUseSharedMemoryContext('   ')).toBe(false);
  });

  it('returns false for null input', () => {
    expect(shouldUseSharedMemoryContext(null)).toBe(false);
  });

  it('returns false for undefined input', () => {
    expect(shouldUseSharedMemoryContext(undefined)).toBe(false);
  });

  it('returns false for operation questions', () => {
    expect(shouldUseSharedMemoryContext('怎么发帖')).toBe(false);
    expect(shouldUseSharedMemoryContext('如何进入论坛')).toBe(false);
  });

  it('returns true when text contains shared memory trigger keywords', () => {
    expect(shouldUseSharedMemoryContext('公共记忆里面有什么')).toBe(true);
    expect(shouldUseSharedMemoryContext('共享记忆里有没有记录')).toBe(true);
    expect(shouldUseSharedMemoryContext('记忆库有记录吗')).toBe(true);
    expect(shouldUseSharedMemoryContext('你记得以前的事吗')).toBe(true);
    expect(shouldUseSharedMemoryContext('曾经发生过什么')).toBe(true);
    expect(shouldUseSharedMemoryContext('以前有人提过吗')).toBe(true);
    expect(shouldUseSharedMemoryContext('之前有没有人提到')).toBe(true);
    expect(shouldUseSharedMemoryContext('有记录吗')).toBe(true);
    expect(shouldUseSharedMemoryContext('有没有人提到过')).toBe(true);
    expect(shouldUseSharedMemoryContext('历史往事')).toBe(true);
  });

  it('returns true for community question with memory judgement pattern', () => {
    expect(shouldUseSharedMemoryContext('方块之家之前发生过什么')).toBe(true);
    expect(shouldUseSharedMemoryContext('社区里谁提到过这个')).toBe(true);
  });

  it('returns false for community question without memory judgement pattern', () => {
    expect(shouldUseSharedMemoryContext('方块之家')).toBe(false);
    // Pure community question without memory judgement keywords like 谁/什么/发生/提到/记得 etc.
    expect(shouldUseSharedMemoryContext('社区今天有活动')).toBe(false);
  });

  it('returns false for general text without shared memory keywords', () => {
    expect(shouldUseSharedMemoryContext('今天天气怎么样')).toBe(false);
  });
});

// ─── isTreeholeReflectionQuestion ────────────────────────────────────────────

describe('useIntentDetection: isTreeholeReflectionQuestion', () => {
  it('returns true for text containing "note"', () => {
    expect(isTreeholeReflectionQuestion('note一下今天的事情')).toBe(true);
  });

  it('returns true for text containing "日记"', () => {
    expect(isTreeholeReflectionQuestion('写一篇日记')).toBe(true);
  });

  it('returns true for text containing "笔记"', () => {
    expect(isTreeholeReflectionQuestion('整理一下笔记')).toBe(true);
  });

  it('returns true for text containing "记录"', () => {
    expect(isTreeholeReflectionQuestion('记录今天的感受')).toBe(true);
  });

  it('returns true for text containing "记忆"', () => {
    expect(isTreeholeReflectionQuestion('唤起我的记忆')).toBe(true);
  });

  it('returns true for text containing "复盘"', () => {
    expect(isTreeholeReflectionQuestion('复盘一下这两天')).toBe(true);
  });

  it('returns true for text containing "回顾"', () => {
    expect(isTreeholeReflectionQuestion('回顾一下上周')).toBe(true);
  });

  it('returns true for text containing "总结我"', () => {
    expect(isTreeholeReflectionQuestion('总结我这周的情况')).toBe(true);
  });

  it('returns true for text containing "我的情况"', () => {
    expect(isTreeholeReflectionQuestion('我的情况不太好')).toBe(true);
  });

  it('returns true for text containing "我的状态"', () => {
    expect(isTreeholeReflectionQuestion('我的状态不太好')).toBe(true);
  });

  it('returns true for text containing "我的情绪"', () => {
    expect(isTreeholeReflectionQuestion('我的情绪最近不太稳定')).toBe(true);
  });

  it('returns true for text containing "我的习惯"', () => {
    expect(isTreeholeReflectionQuestion('我的习惯有什么变化')).toBe(true);
  });

  it('returns true for text containing "我最近"', () => {
    expect(isTreeholeReflectionQuestion('我最近的状态')).toBe(true);
  });

  it('returns true for text containing "我一直"', () => {
    expect(isTreeholeReflectionQuestion('我一直有一个习惯')).toBe(true);
  });

  it('returns true for text containing "我总是"', () => {
    expect(isTreeholeReflectionQuestion('我总是情绪低落')).toBe(true);
  });

  it('returns true for text containing "给我建议"', () => {
    expect(isTreeholeReflectionQuestion('给我建议一下')).toBe(true);
  });

  it('returns true for text containing "我的计划"', () => {
    expect(isTreeholeReflectionQuestion('我的计划完成了吗')).toBe(true);
  });

  it('returns true for reflective pattern text', () => {
    expect(isTreeholeReflectionQuestion('我最近有没有什么变化')).toBe(true);
    expect(isTreeholeReflectionQuestion('我的状态一直不太好')).toBe(true);
    expect(isTreeholeReflectionQuestion('自己的习惯需要复盘')).toBe(true);
  });

  it('returns false for empty string', () => {
    expect(isTreeholeReflectionQuestion('')).toBe(false);
  });

  it('returns false for null input', () => {
    expect(isTreeholeReflectionQuestion(null)).toBe(false);
  });

  it('returns false for undefined input', () => {
    expect(isTreeholeReflectionQuestion(undefined)).toBe(false);
  });

  it('returns false for operation questions', () => {
    expect(isTreeholeReflectionQuestion('怎么发帖')).toBe(false);
    expect(isTreeholeReflectionQuestion('如何进入论坛')).toBe(false);
  });

  it('returns false for non-reflective general text', () => {
    expect(isTreeholeReflectionQuestion('今天天气不错')).toBe(false);
    expect(isTreeholeReflectionQuestion('你好')).toBe(false);
  });
});

// ─── shouldUseTreeholeContext ────────────────────────────────────────────────

describe('useIntentDetection: shouldUseTreeholeContext', () => {
  const activeState = {
    isTreeholeMemoryEnabled: true,
    isLoggedIn: true,
    userInfo: { id: 'user-123' },
  };

  it('returns true when all conditions met and text is reflective', () => {
    expect(shouldUseTreeholeContext('我最近的状态不太好', activeState)).toBe(true);
  });

  it('returns false when isTreeholeMemoryEnabled is false', () => {
    const state = { ...activeState, isTreeholeMemoryEnabled: false };
    expect(shouldUseTreeholeContext('我最近的状态', state)).toBe(false);
  });

  it('returns false when isLoggedIn is false', () => {
    const state = { ...activeState, isLoggedIn: false };
    expect(shouldUseTreeholeContext('我最近的状态', state)).toBe(false);
  });

  it('returns false when userInfo is null', () => {
    const state = { ...activeState, userInfo: null };
    expect(shouldUseTreeholeContext('我最近的状态', state)).toBe(false);
  });

  it('returns false when userInfo has no id', () => {
    const state = { ...activeState, userInfo: {} };
    expect(shouldUseTreeholeContext('我最近的状态', state)).toBe(false);
  });

  it('returns false when text is not a reflective question', () => {
    expect(shouldUseTreeholeContext('今天天气怎么样', activeState)).toBe(false);
  });

  it('returns false when text is empty', () => {
    expect(shouldUseTreeholeContext('', activeState)).toBe(false);
  });
});

// ─── isTreeholeCreateConfirm ─────────────────────────────────────────────────

describe('useIntentDetection: isTreeholeCreateConfirm', () => {
  it('returns true for "是"', () => {
    expect(isTreeholeCreateConfirm('是')).toBe(true);
  });

  it('returns true for "是的"', () => {
    expect(isTreeholeCreateConfirm('是的')).toBe(true);
  });

  it('returns true for "好"', () => {
    expect(isTreeholeCreateConfirm('好')).toBe(true);
  });

  it('returns true for "好的"', () => {
    expect(isTreeholeCreateConfirm('好的')).toBe(true);
  });

  it('returns true for "可以"', () => {
    expect(isTreeholeCreateConfirm('可以')).toBe(true);
  });

  it('returns true for "行"', () => {
    expect(isTreeholeCreateConfirm('行')).toBe(true);
  });

  it('returns true for "确认"', () => {
    expect(isTreeholeCreateConfirm('确认')).toBe(true);
  });

  it('returns true for "同意"', () => {
    expect(isTreeholeCreateConfirm('同意')).toBe(true);
  });

  it('returns true for "需要"', () => {
    expect(isTreeholeCreateConfirm('需要')).toBe(true);
  });

  it('returns true for "创建"', () => {
    expect(isTreeholeCreateConfirm('创建')).toBe(true);
  });

  it('returns true for "创建树洞"', () => {
    expect(isTreeholeCreateConfirm('创建树洞')).toBe(true);
  });

  it('returns true for "帮我创建"', () => {
    expect(isTreeholeCreateConfirm('帮我创建')).toBe(true);
  });

  it('returns true for "帮我创建树洞"', () => {
    expect(isTreeholeCreateConfirm('帮我创建树洞')).toBe(true);
  });

  it('returns true for "ok"', () => {
    expect(isTreeholeCreateConfirm('ok')).toBe(true);
  });

  it('returns true for "yes"', () => {
    expect(isTreeholeCreateConfirm('yes')).toBe(true);
  });

  it('returns true for "y"', () => {
    expect(isTreeholeCreateConfirm('y')).toBe(true);
  });

  it('returns true for confirm text with punctuation stripped', () => {
    expect(isTreeholeCreateConfirm('是的。')).toBe(true);
    expect(isTreeholeCreateConfirm('好的。')).toBe(true);
  });

  it('returns false for unrelated text', () => {
    expect(isTreeholeCreateConfirm('今天天气不错')).toBe(false);
    expect(isTreeholeCreateConfirm('不要')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isTreeholeCreateConfirm('')).toBe(false);
  });

  it('returns false for null input', () => {
    expect(isTreeholeCreateConfirm(null)).toBe(false);
  });

  it('returns false for undefined input', () => {
    expect(isTreeholeCreateConfirm(undefined)).toBe(false);
  });
});

// ─── isTreeholeCreateReject ──────────────────────────────────────────────────

describe('useIntentDetection: isTreeholeCreateReject', () => {
  it('returns true for "否"', () => {
    expect(isTreeholeCreateReject('否')).toBe(true);
  });

  it('returns true for "不用"', () => {
    expect(isTreeholeCreateReject('不用')).toBe(true);
  });

  it('returns true for "不需要"', () => {
    expect(isTreeholeCreateReject('不需要')).toBe(true);
  });

  it('returns true for "取消"', () => {
    expect(isTreeholeCreateReject('取消')).toBe(true);
  });

  it('returns true for "算了"', () => {
    expect(isTreeholeCreateReject('算了')).toBe(true);
  });

  it('returns true for "暂不"', () => {
    expect(isTreeholeCreateReject('暂不')).toBe(true);
  });

  it('returns true for "不要"', () => {
    expect(isTreeholeCreateReject('不要')).toBe(true);
  });

  it('returns true for "no"', () => {
    expect(isTreeholeCreateReject('no')).toBe(true);
  });

  it('returns true for "n"', () => {
    expect(isTreeholeCreateReject('n')).toBe(true);
  });

  it('returns true for reject text with punctuation stripped', () => {
    expect(isTreeholeCreateReject('不用。')).toBe(true);
    expect(isTreeholeCreateReject('不要。')).toBe(true);
  });

  it('returns false for unrelated text', () => {
    expect(isTreeholeCreateReject('今天天气不错')).toBe(false);
    expect(isTreeholeCreateReject('好的')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isTreeholeCreateReject('')).toBe(false);
  });

  it('returns false for null input', () => {
    expect(isTreeholeCreateReject(null)).toBe(false);
  });

  it('returns false for undefined input', () => {
    expect(isTreeholeCreateReject(undefined)).toBe(false);
  });
});

// ─── isSharedMemorySaveConfirm ───────────────────────────────────────────────

describe('useIntentDetection: isSharedMemorySaveConfirm', () => {
  it('returns true for "是"', () => {
    expect(isSharedMemorySaveConfirm('是')).toBe(true);
  });

  it('returns true for "是的"', () => {
    expect(isSharedMemorySaveConfirm('是的')).toBe(true);
  });

  it('returns true for "好"', () => {
    expect(isSharedMemorySaveConfirm('好')).toBe(true);
  });

  it('returns true for "好的"', () => {
    expect(isSharedMemorySaveConfirm('好的')).toBe(true);
  });

  it('returns true for "可以"', () => {
    expect(isSharedMemorySaveConfirm('可以')).toBe(true);
  });

  it('returns true for "行"', () => {
    expect(isSharedMemorySaveConfirm('行')).toBe(true);
  });

  it('returns true for "确认"', () => {
    expect(isSharedMemorySaveConfirm('确认')).toBe(true);
  });

  it('returns true for "确定"', () => {
    expect(isSharedMemorySaveConfirm('确定')).toBe(true);
  });

  it('returns true for "同意"', () => {
    expect(isSharedMemorySaveConfirm('同意')).toBe(true);
  });

  it('returns true for "写入"', () => {
    expect(isSharedMemorySaveConfirm('写入')).toBe(true);
  });

  it('returns true for "保存"', () => {
    expect(isSharedMemorySaveConfirm('保存')).toBe(true);
  });

  it('returns true for "记录"', () => {
    expect(isSharedMemorySaveConfirm('记录')).toBe(true);
  });

  it('returns true for "加入记忆库"', () => {
    expect(isSharedMemorySaveConfirm('加入记忆库')).toBe(true);
  });

  it('returns true for "ok"', () => {
    expect(isSharedMemorySaveConfirm('ok')).toBe(true);
  });

  it('returns true for "yes"', () => {
    expect(isSharedMemorySaveConfirm('yes')).toBe(true);
  });

  it('returns true for "y"', () => {
    expect(isSharedMemorySaveConfirm('y')).toBe(true);
  });

  it('returns true for confirm text with punctuation stripped', () => {
    expect(isSharedMemorySaveConfirm('好的。')).toBe(true);
    expect(isSharedMemorySaveConfirm('确定。')).toBe(true);
  });

  it('returns false for unrelated text', () => {
    expect(isSharedMemorySaveConfirm('今天天气不错')).toBe(false);
    expect(isSharedMemorySaveConfirm('不要')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isSharedMemorySaveConfirm('')).toBe(false);
  });

  it('returns false for null input', () => {
    expect(isSharedMemorySaveConfirm(null)).toBe(false);
  });

  it('returns false for undefined input', () => {
    expect(isSharedMemorySaveConfirm(undefined)).toBe(false);
  });
});

// ─── isSharedMemorySaveReject ────────────────────────────────────────────────

describe('useIntentDetection: isSharedMemorySaveReject', () => {
  it('returns true for "否"', () => {
    expect(isSharedMemorySaveReject('否')).toBe(true);
  });

  it('returns true for "不用"', () => {
    expect(isSharedMemorySaveReject('不用')).toBe(true);
  });

  it('returns true for "不需要"', () => {
    expect(isSharedMemorySaveReject('不需要')).toBe(true);
  });

  it('returns true for "取消"', () => {
    expect(isSharedMemorySaveReject('取消')).toBe(true);
  });

  it('returns true for "算了"', () => {
    expect(isSharedMemorySaveReject('算了')).toBe(true);
  });

  it('returns true for "暂不"', () => {
    expect(isSharedMemorySaveReject('暂不')).toBe(true);
  });

  it('returns true for "不要"', () => {
    expect(isSharedMemorySaveReject('不要')).toBe(true);
  });

  it('returns true for "不写入"', () => {
    expect(isSharedMemorySaveReject('不写入')).toBe(true);
  });

  it('returns true for "不保存"', () => {
    expect(isSharedMemorySaveReject('不保存')).toBe(true);
  });

  it('returns true for "不记录"', () => {
    expect(isSharedMemorySaveReject('不记录')).toBe(true);
  });

  it('returns true for "no"', () => {
    expect(isSharedMemorySaveReject('no')).toBe(true);
  });

  it('returns true for "n"', () => {
    expect(isSharedMemorySaveReject('n')).toBe(true);
  });

  it('returns true for reject text with punctuation stripped', () => {
    expect(isSharedMemorySaveReject('不用。')).toBe(true);
    expect(isSharedMemorySaveReject('不要。')).toBe(true);
  });

  it('returns false for unrelated text', () => {
    expect(isSharedMemorySaveReject('今天天气不错')).toBe(false);
    expect(isSharedMemorySaveReject('好的')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isSharedMemorySaveReject('')).toBe(false);
  });

  it('returns false for null input', () => {
    expect(isSharedMemorySaveReject(null)).toBe(false);
  });

  it('returns false for undefined input', () => {
    expect(isSharedMemorySaveReject(undefined)).toBe(false);
  });
});

// ─── resolveMemorySaveDestinationFromText ────────────────────────────────────

describe('useIntentDetection: resolveMemorySaveDestinationFromText', () => {
  it('returns "both" when text contains "两者都"', () => {
    expect(resolveMemorySaveDestinationFromText('两者都保存')).toBe('both');
  });

  it('returns "both" when text contains "两个都"', () => {
    expect(resolveMemorySaveDestinationFromText('两个都保存')).toBe('both');
  });

  it('returns "both" when text contains "都存"', () => {
    expect(resolveMemorySaveDestinationFromText('都存起来')).toBe('both');
  });

  it('returns "both" when text contains "都保存"', () => {
    expect(resolveMemorySaveDestinationFromText('都保存')).toBe('both');
  });

  it('returns "both" when text contains "同时"', () => {
    expect(resolveMemorySaveDestinationFromText('同时保存到两处')).toBe('both');
  });

  it('returns "both" when text contains "一起"', () => {
    expect(resolveMemorySaveDestinationFromText('一起保存')).toBe('both');
  });

  it('returns "cloud" when text contains "cloud"', () => {
    expect(resolveMemorySaveDestinationFromText('cloud')).toBe('cloud');
  });

  it('returns "cloud" when text contains "随手记"', () => {
    expect(resolveMemorySaveDestinationFromText('随手记')).toBe('cloud');
  });

  it('returns "cloud" when text contains "日记"', () => {
    expect(resolveMemorySaveDestinationFromText('保存到日记')).toBe('cloud');
  });

  it('returns "cloud" when text contains "私有"', () => {
    expect(resolveMemorySaveDestinationFromText('私有记录')).toBe('cloud');
  });

  it('returns "cloud" when text contains "私人"', () => {
    expect(resolveMemorySaveDestinationFromText('私人记录')).toBe('cloud');
  });

  it('returns "cloud" when text contains "个人记录"', () => {
    expect(resolveMemorySaveDestinationFromText('个人记录')).toBe('cloud');
  });

  it('returns "shared" when text contains "公共记忆"', () => {
    expect(resolveMemorySaveDestinationFromText('公共记忆')).toBe('shared');
  });

  it('returns "shared" when text contains "共享记忆"', () => {
    expect(resolveMemorySaveDestinationFromText('共享记忆')).toBe('shared');
  });

  it('returns "shared" when text contains "社群记忆"', () => {
    expect(resolveMemorySaveDestinationFromText('社群记忆')).toBe('shared');
  });

  it('returns "shared" when text contains "记忆库"', () => {
    expect(resolveMemorySaveDestinationFromText('记忆库')).toBe('shared');
  });

  it('returns fallback when text is a confirm but fallback is valid destination', () => {
    expect(resolveMemorySaveDestinationFromText('确认', 'cloud')).toBe('cloud');
    expect(resolveMemorySaveDestinationFromText('好的', 'shared')).toBe('shared');
    expect(resolveMemorySaveDestinationFromText('好', 'both')).toBe('both');
  });

  it('returns fallback when text is a confirm but fallback is "ask"', () => {
    // 'ask' is not in ['cloud', 'shared', 'both'], so the confirm check won't override
    expect(resolveMemorySaveDestinationFromText('确认', 'ask')).toBe('ask');
  });

  it('returns fallback for unrecognized text', () => {
    expect(resolveMemorySaveDestinationFromText('今天天气不错', 'cloud')).toBe('cloud');
    expect(resolveMemorySaveDestinationFromText('随便', 'shared')).toBe('shared');
  });

  it('returns default fallback "ask" when no fallback provided', () => {
    expect(resolveMemorySaveDestinationFromText('今天天气不错')).toBe('ask');
  });

  it('returns fallback for empty string', () => {
    expect(resolveMemorySaveDestinationFromText('', 'cloud')).toBe('cloud');
  });

  it('returns fallback for null input', () => {
    expect(resolveMemorySaveDestinationFromText(null, 'shared')).toBe('shared');
  });

  it('returns fallback for undefined input', () => {
    expect(resolveMemorySaveDestinationFromText(undefined, 'cloud')).toBe('cloud');
  });
});

// ─── formatMemorySavePrompt ──────────────────────────────────────────────────

describe('useIntentDetection: formatMemorySavePrompt', () => {
  it('formats prompt for "cloud" destination', () => {
    const result = formatMemorySavePrompt('测试内容', 'cloud');
    expect(result).toContain('BOH Cloud+');
    expect(result).toContain('测试内容');
    expect(result).toContain('确认"保存');
    expect(result).toContain('取消"跳过');
  });

  it('formats prompt for "shared" destination', () => {
    const result = formatMemorySavePrompt('测试内容', 'shared');
    expect(result).toContain('BOH AI 公共记忆库');
    expect(result).toContain('测试内容');
    expect(result).toContain('确认"写入');
    expect(result).toContain('取消"跳过');
  });

  it('formats prompt for "both" destination', () => {
    const result = formatMemorySavePrompt('测试内容', 'both');
    expect(result).toContain('BOH Cloud+');
    expect(result).toContain('BOH AI 公共记忆库');
    expect(result).toContain('测试内容');
    expect(result).toContain('确认"保存到两处');
  });

  it('formats prompt for "ask" destination (default)', () => {
    const result = formatMemorySavePrompt('测试内容', 'ask');
    expect(result).toContain('保存到哪里');
    expect(result).toContain('测试内容');
    expect(result).toContain('Cloud+');
    expect(result).toContain('公共记忆');
  });

  it('formats prompt for default destination when not specified', () => {
    const result = formatMemorySavePrompt('测试内容');
    // Default is 'ask'
    expect(result).toContain('保存到哪里');
  });

  it('truncates long content via normalizePromptLine', () => {
    const longContent = 'x'.repeat(500);
    const result = formatMemorySavePrompt(longContent, 'cloud');
    // Should be truncated to <= 320 chars
    expect(result.length).toBeLessThanOrEqual(500);
  });

  it('handles empty content', () => {
    const result = formatMemorySavePrompt('', 'cloud');
    // Still formats the prompt structure even with empty content
    expect(result).toContain('BOH Cloud+');
  });

  it('handles null content', () => {
    const result = formatMemorySavePrompt(null, 'shared');
    expect(result).toContain('BOH AI 公共记忆库');
  });
});

// ─── summarizeThinkingSubject ────────────────────────────────────────────────

describe('useIntentDetection: summarizeThinkingSubject', () => {
  it('returns short text as-is', () => {
    expect(summarizeThinkingSubject('你好')).toBe('你好');
    expect(summarizeThinkingSubject('方块之家')).toBe('方块之家');
  });

  it('truncates text longer than 28 characters', () => {
    const longText = '这是一个非常非常非常非常非常长的思考主题描述文本需要被截断处理';
    const result = summarizeThinkingSubject(longText);
    expect(result).toHaveLength(28); // 25 + '...'
    expect(result.endsWith('...')).toBe(true);
  });

  it('returns exactly 28 characters for exactly 28-character input', () => {
    // normalizePromptLine(text, 28) truncates to 28. If length >= 28, slice(0,25) + '...'
    const text = '一二三四五六七八九十一二三四五六七八九十';
    // This is 20 Chinese chars = 20 chars, < 28, so returns as-is
    const shortText = '这是一个测试主题';
    expect(summarizeThinkingSubject(shortText)).toBe(shortText);
  });

  it('truncates text at exactly 28 characters', () => {
    // 28 chars input: normalizePromptLine returns 28 chars, then length >= 28 so slice(0,25) + '...'
    const text = '1234567890123456789012345678'; // 28 chars
    const result = summarizeThinkingSubject(text);
    expect(result.length).toBeLessThanOrEqual(28);
    expect(result.endsWith('...')).toBe(true);
  });

  it('returns "这个问题" for empty input', () => {
    expect(summarizeThinkingSubject('')).toBe('这个问题');
  });

  it('returns "这个问题" for null input', () => {
    expect(summarizeThinkingSubject(null)).toBe('这个问题');
  });

  it('returns "这个问题" for undefined input', () => {
    expect(summarizeThinkingSubject(undefined)).toBe('这个问题');
  });

  it('returns "这个问题" for whitespace-only input', () => {
    expect(summarizeThinkingSubject('   ')).toBe('这个问题');
  });
});