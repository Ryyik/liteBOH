export const moodChoices = [
  { value: '开心', icon: '☀️', hint: '轻盈明亮，想把好心情记下来' },
  { value: '平静', icon: '🍃', hint: '状态稳定，适合慢慢整理今天' },
  { value: '焦虑', icon: '🌧️', hint: '思绪有点乱，先写下来再梳理' },
  { value: '兴奋', icon: '✨', hint: '有能量、有冲劲，灵感很多' },
  { value: '难过', icon: '🌙', hint: '有些低落，允许自己温柔记录' },
  { value: '愤怒', icon: '🔥', hint: '情绪有张力，先安全地表达出来' },
  { value: '疲惫', icon: '🫧', hint: '有点累了，简单记一点也很好' },
  { value: '期待', icon: '🌱', hint: '心里有盼头，想留住这份等待' }
];

export const moodOptions = moodChoices.map((item) => item.value);
const moodChoiceMap = Object.fromEntries(moodChoices.map((item) => [item.value, item]));

export function getMoodMeta(value) {
  const key = String(value || '').trim();
  return moodChoiceMap[key] || null;
}

export const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
export const monthLabels = Array.from({ length: 12 }, (_, i) => `${i + 1}月`);

export const quickPrompts = [
  '总结我最近 7 天的主要想法和情绪变化',
  '我最近反复提到的核心问题是什么',
  '请把我的思路整理成 3 条可执行行动'
];

export const TREEHOLE_AI_MODEL_ID = 'deepseek-ai/DeepSeek-R1-0528-Qwen3-8B';
export const TREEHOLE_AI_MODEL_NAME = 'DeepSeek R1 0528 8B';
export const WEEKLY_REPORT_CACHE_PREFIX = 'boh_treehole_weekly_report';
