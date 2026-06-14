import {
  normalizePromptLine,
  truncateText,
  extractQueryKeywords,
  scoreChunk,
  getPostTitleAndBody,
  formatPromptDateTime,
  normalizeText,
  containsAnyKeyword
} from './bohai-engine-helpers.js';
import {
  FORUM_MAX_POSTS,
  FORUM_MAX_CHARS_PER_POST
} from './chat-engine-config.js';

export const rankForumPostsByQuery = (posts, queryText) => {
  const keywords = extractQueryKeywords(queryText);
  return [...posts]
    .map((post) => {
      const parsed = getPostTitleAndBody(post);
      const merged = [
        parsed.title,
        parsed.body,
        post?.author_username,
        post?.tagLabel,
        post?.tag
      ].join('\n');
      return {
        post,
        score: scoreChunk(merged, keywords) + Number(post?.search_rank || 0) * 10
      };
    })
    .sort((a, b) => b.score - a.score || new Date(b.post?.created_at || 0) - new Date(a.post?.created_at || 0))
    .map((item) => item.post);
};

export const getForumTagFilterFromQuery = (queryText = '') => {
  const normalized = normalizeText(queryText);
  if (/(服务器|server|服主|开服|联机)/.test(normalized)) return 'server';
  if (/(活动|报名|赛事|周年|庆典|event)/.test(normalized)) return 'activity';
  if (/(提问|问题|求助|怎么|如何|为什么|question)/.test(normalized)) return 'question';
  if (/(日常|生活|闲聊|daily)/.test(normalized)) return 'daily';
  return '';
};

export const getForumSortModeFromQuery = (queryText = '') => {
  const normalized = normalizeText(queryText);
  if (/(热帖|热门|最热|最多赞|点赞最多|评论最多|火)/.test(normalized)) return 'hottest';
  return 'latest';
};

export const isLatestForumSummaryQuery = (queryText = '') => {
  const normalized = normalizeText(queryText);
  const forumIntent = /(论坛|帖子|社区|社群|方块之家|boh)/.test(normalized);
  const summaryIntent = /(总结|复盘|回顾|梳理|概括|整理|看看|近况|动态|发生了什么|大家在聊)/.test(normalized);
  const latestIntent = /(最新|最近|近期|近况|今天|当前|刚刚|发布|往下|前\s*5|五条|5\s*条)/.test(normalized);
  return forumIntent && summaryIntent && (latestIntent || /(总结|整理|概括).{0,8}(论坛|帖子|社区|社群)/.test(normalized));
};

export const sortForumPostsByCreatedAtDesc = (posts = []) => {
  return [...(Array.isArray(posts) ? posts : [])].sort((a, b) => {
    const timeDiff = new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime();
    if (timeDiff !== 0) return timeDiff;
    return String(b?.id || '').localeCompare(String(a?.id || ''));
  });
};

export const normalizeForumSummaryText = (text = '', maxChars = 260) => {
  const normalized = String(text || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return '这条帖子没有可直接读取的文字正文，可能主要是图片或附件内容。';
  return truncateText(normalized, maxChars);
};

export const buildForumPostNaturalSummary = ({ title = '', body = '' } = {}) => {
  const safeTitle = normalizePromptLine(title, 80);
  const content = normalizeForumSummaryText(body, 220);
  if (!body || content.startsWith('这条帖子没有可直接读取')) {
    return safeTitle
      ? `这条帖子主要围绕《${safeTitle}》展开，但当前没有可读取的正文细节，所以只能确认它是一条以标题为主的社区动态。`
      : '这条帖子没有可读取的正文细节，只能确认它是一条较轻量的社区动态。';
  }

  const source = `${safeTitle} ${content}`;
  const hasQuestionTone = /[?？]|请问|求助|怎么|如何|为什么|有没有|能不能|可以吗/.test(source);
  const hasReminderTone = /(提醒|注意|千万|不要|别|小心|避开|记得)/.test(source);
  const hasShareTone = /(分享|记录|今天|刚刚|发现|看到|觉得|感觉|喜欢|萌|可爱|喵|哈哈|hhh|！|!)/i.test(source);
  const hasEventTone = /(活动|报名|更新|公告|上线|发布|安排|通知|时间|规则)/.test(source);

  const cleanedContent = content
    .replace(/["""']/g, '')
    .replace(/[!?！？。~～…]+/g, '，')
    .replace(/\s+/g, ' ')
    .trim();
  const detail = truncateText(cleanedContent, 96);
  const topic = safeTitle ? `《${safeTitle}》` : '这条动态';

  if (hasQuestionTone) {
    return `这条帖子更像是在围绕 ${topic} 提问或征求看法，作者想讨论的核心内容是：${detail}`;
  }
  if (hasReminderTone) {
    return `这条帖子主要是在做一个轻量提醒，作者围绕 ${topic} 表达了需要注意或避免的事情：${detail}`;
  }
  if (hasEventTone) {
    return `这条帖子偏向社区信息更新，重点和 ${topic} 有关，正文提到的关键信息是：${detail}`;
  }
  if (hasShareTone) {
    return `这是一条偏日常的社区分享，作者围绕 ${topic} 表达了即时感受或小发现，整体语气比较轻松：${detail}`;
  }
  return `这条帖子主要围绕 ${topic} 展开，正文核心内容可以概括为：${detail}`;
};

export const buildExtractiveForumSummaryAnswer = (posts = []) => {
  const source = Array.isArray(posts) ? posts.slice(0, FORUM_MAX_POSTS) : [];
  if (source.length === 0) {
    return '未检索到论坛帖子，无法生成最新 5 条总结。';
  }

  const lines = [`我按发布时间从新到旧看了最新 ${source.length} 条论坛帖子。下面是基于标题、正文和互动数据整理出的自然概括，不补充帖子里没有写到的背景。`];

  source.forEach((post, index) => {
    const parsed = getPostTitleAndBody(post);
    const title = parsed.title || '无标题';
    const author = normalizePromptLine(post?.author_username, 40) || '未知作者';
    const authorIdLabel = author === '未知作者' ? '未知作者' : `@${author.replace(/^@+/, '')}`;
    const time = formatPromptDateTime(post?.created_at, '未知');
    const postId = String(post?.id || '').trim();
    const url = postId ? `#/forum/post/${postId}` : '#/forum';
    const body = parsed.body || post?.content || '';
    const summary = buildForumPostNaturalSummary({ title, body });
    const likes = Number(post?.like_count || post?.likes_count || 0);
    const comments = Number(post?.comment_count || 0);
    const interaction = likes > 0 || comments > 0
      ? `目前有 ${likes} 个赞、${comments} 条评论`
      : '目前还没有明显互动';

    lines.push([
      '',
      `${index + 1}. ${authorIdLabel} 在 ${time} 发布了《${title}》。`,
      `${summary}`,
      `${interaction}。`,
      `链接：${url}`
    ].join('\n'));
  });

  return lines.join('\n');
};

export const buildForumNarrativeSummaryPrompt = (posts = []) => {
  const source = Array.isArray(posts) ? posts.slice(0, FORUM_MAX_POSTS) : [];
  const body = source.map((post, index) => {
    const parsed = getPostTitleAndBody(post);
    const title = normalizePromptLine(parsed.title || '无标题', 90);
    const author = normalizePromptLine(post?.author_username, 40) || '未知作者';
    const time = formatPromptDateTime(post?.created_at, '未知');
    const tag = normalizePromptLine(post?.tagLabel || post?.tag, 24) || '未标注';
    const likes = Number(post?.like_count || post?.likes_count || 0);
    const comments = Number(post?.comment_count || 0);
    const content = normalizeForumSummaryText(parsed.body || post?.content || '', 700);
    return [
      `P${index + 1}`,
      `标题：${title}`,
      `作者：${author}`,
      `发布时间：${time}`,
      `标签：${tag}`,
      `互动：${likes}赞，${comments}评论`,
      `正文：${content}`
    ].join('\n');
  }).join('\n\n');

  return `你是 BOH 社区动态整理助手。请基于下面按发布时间从新到旧排列的真实论坛帖子，写一段自然语言总结。

【真实帖子资料】
${body || '无'}

【输出要求】
1. 只输出一个自然语言段落，不要分条、不要列表、不要表格、不要字段名。
2. 必须覆盖每条资料中的帖子，且按 P1、P2、P3、P4、P5 的顺序叙述；P1 是最新发布，后面依次更早。
3. 每条帖子都要明确写出"用户「作者名」"发了什么，并紧跟对应帖子内容的准确概括；作者名必须逐字来自资料中的"作者"，不能替换、猜测或混淆。
4. 像给朋友讲社区刚刚发生了什么一样自然概括，语气克制、清楚、有一点叙事感。
5. 可以概括、改写、合并语气相近的表达，但不能合并错作者，不能添加资料中没有的事件、人物关系、动机、背景、结论或情绪。
6. 不要直接复制原文句子；尽量用自己的话概括每条帖子在表达什么。
7. 不输出查看链接、URL、证据编号、帖子 ID。
8. 如果某条帖子正文很短或只有标题，只能说它是一条简短动态，不要扩写细节。
9. 在输出前自检：每一个"用户「作者名」"后面的概括必须来自同一个 P 条目，不得串帖。
10. 必须保留原文的语义方向，尤其是"大/小、太多/太少、喜欢/不喜欢、要/不要、能/不能、已经/还没"等极性表达，绝不能改成相反意思。
11. 控制在 260-560 个中文字符。`;
};

export const removeForumSummaryLinks = (text = '') => String(text || '')
  .replace(/#\/forum\/post\/[a-z0-9-]+/gi, '')
  .replace(/\[[FP]\d+\]/g, '')
  .replace(/查看(?:帖子)?[：:]\s*/g, '')
  .replace(/\s+/g, ' ')
  .trim();

export const getForumSummarySourceText = (posts = []) => {
  return (Array.isArray(posts) ? posts : [])
    .slice(0, FORUM_MAX_POSTS)
    .map((post) => {
      const parsed = getPostTitleAndBody(post);
      return `${parsed.title || ''} ${parsed.body || post?.content || ''}`;
    })
    .join('\n')
    .replace(/\s+/g, ' ')
    .trim();
};

export const FORUM_SUMMARY_POLARITY_RULES = [
  { source: ['太小', '偏小', '小了', '很小', '太迷你'], forbidden: ['太大', '偏大', '大了', '很大', '过大'] },
  { source: ['太大', '偏大', '大了', '很大', '过大'], forbidden: ['太小', '偏小', '小了', '很小', '太迷你'] },
  { source: ['太少', '偏少', '少了', '不够多'], forbidden: ['太多', '偏多', '多了', '过多'] },
  { source: ['太多', '偏多', '多了', '过多'], forbidden: ['太少', '偏少', '少了', '不够多'] },
  { source: ['不喜欢', '不太喜欢', '没那么喜欢', '讨厌'], forbidden: ['喜欢', '很喜欢', '挺喜欢'] },
  { source: ['不要', '别 ', '别去', '别拿', '千万不要'], forbidden: ['要去', '要拿', '应该去', '应该拿'] },
  { source: ['不能', '不可以', '无法'], forbidden: ['能 ', '可以', '能够'] },
  { source: ['还没', '没有', '未完成'], forbidden: ['已经', '完成了', '已完成'] }
];

export const detectForumSummaryPolarityConflicts = (sourceText = '', summaryText = '') => {
  const source = String(sourceText || '');
  const summary = String(summaryText || '');
  if (!source || !summary) return [];

  return FORUM_SUMMARY_POLARITY_RULES.flatMap((rule) => {
    const sourceHits = rule.source.filter((term) => source.includes(term));
    if (sourceHits.length === 0) return [];
    const sourceHasForbidden = rule.forbidden.some((term) => source.includes(term));
    if (sourceHasForbidden) return [];
    const forbiddenHits = rule.forbidden.filter((term) => summary.includes(term));
    if (forbiddenHits.length === 0) return [];
    return [`原文出现「${sourceHits.join(' / ')}」，总结却出现相反表达「${forbiddenHits.join(' / ')}」`];
  });
};

export const buildForumSearchQueries = (queryText = '') => {
  const raw = normalizePromptLine(queryText, 120);
  const keywords = extractQueryKeywords(raw)
    .filter((keyword) => ![
      '论坛', '帖子', '发帖', '搜索', '检索', '查看', '社区', '动态', '最近', '最新',
      '今天', '近期', '本周', '本月', '有没有', '哪些', '什么', '大家', '有人'
    ].includes(keyword))
    .filter((keyword) => keyword.length >= 2)
    .sort((a, b) => b.length - a.length);

  const candidates = [
    raw,
    keywords.slice(0, 3).join(' '),
    ...keywords.slice(0, 4)
  ]
    .map((item) => normalizePromptLine(item, 80))
    .filter(Boolean);

  return [...new Set(candidates)].slice(0, 5);
};

export const mergeForumPosts = (target = [], nextPosts = []) => {
  const seen = new Set(target.map((post) => String(post?.id || '').trim()).filter(Boolean));
  for (const post of Array.isArray(nextPosts) ? nextPosts : []) {
    const id = String(post?.id || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    target.push(post);
  }
  return target;
};
