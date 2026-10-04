/**
 * useSiteActivitiesRetrieval — 站内活动 / 抽奖 / 演出的读连接器实现（2026-10-04 新增）
 *
 * 为什么三者放一个 connector：它们都是「站内公开的近期动态」，用户问法高度重叠
 * （「最近有什么活动」「抽奖结果出了吗」「有什么演出」），且**都不要求登录**。
 * 数据源全部是已有 API，这里只做「取数 → 归一 → 拼成 context 文本」的适配，
 * 不新增任何检索逻辑。
 *
 * ⚠️ 活动草稿的隔离已经由 **RLS** 兜住，不再只靠 API 层过滤：
 *   `activity_campaigns_select` 在 2026092704 迁移里收紧为
 *   `using (stage <> 'draft' or public.current_user_is_admin())`；
 *   2026-10-04 用 anon key 实测 `/rest/v1/activity_campaigns?stage=eq.draft` 返回 `[]`。
 *   两层都在（`listActivityCampaigns` 默认 `includeDrafts=false`），保持现状即可。
 *
 * ⚠️ 取数用 `Promise.allSettled`：三类里任何一类失败都不该拖垮另外两类 ——
 * 这个坑在 2026-10-03 的额度侧板退役时踩过（一个 Promise.all 的 reject 会让整块变空）。
 */
import { listActivityCampaigns } from '@/utils/api/activities-platform-api.js';
import { getCommunityLotteries } from '@/utils/api/lottery-api.js';
import { getCreatorShows } from '@/utils/api/shows-api.js';

const MAX_ACTIVITIES = 6;
const MAX_LOTTERIES = 4;
const MAX_SHOWS = 4;
const LINE_MAX_CHARS = 220;

const STAGE_LABELS = {
  signup: '报名中',
  submission: '投稿中',
  judging: '评审中',
  result: '结果已出',
  fulfilled: '已结束',
};

const LOTTERY_STATUS_LABELS = {
  open: '进行中',
  drawn: '已开奖',
  closed: '已结束',
};

const clampLine = (value, max = LINE_MAX_CHARS) =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getMonth() + 1}月${date.getDate()}日`;
};

const formatRange = (start, end) => {
  const from = formatDate(start);
  const to = formatDate(end);
  if (from && to) return `${from} - ${to}`;
  return from || to || '';
};

const buildActivitiesBlock = (rows) =>
  rows.slice(0, MAX_ACTIVITIES).map((row) => {
    const stage = STAGE_LABELS[row.stage] || row.stage || '';
    const range = formatRange(row.signupStartAt || row.startAt, row.signupEndAt || row.endAt);
    const meta = [stage, range].filter(Boolean).join('，');
    const desc = clampLine(row.description);
    return `- 「${clampLine(row.title, 60)}」${meta ? `（${meta}）` : ''}${desc ? `：${desc}` : ''}`;
  });

const buildLotteriesBlock = (rows) =>
  rows.slice(0, MAX_LOTTERIES).map((row) => {
    const status = LOTTERY_STATUS_LABELS[row.status] || row.status || '';
    const prize = clampLine(row.prize_title || row.prizeTitle, 60);
    const when = row.drawn_at
      ? `已开奖（${formatDate(row.drawn_at)}）`
      : row.draw_at
        ? `${formatDate(row.draw_at)} 开奖`
        : '';
    // 获奖者优先取 `winner_username`；线上 `get_community_lotteries` RPC 只回 `winners` 数组
    // （2026-10-04 实测：中秋抽奖那条没有 winner_username 字段），所以要有这一层兜底。
    const winnerNames = Array.isArray(row.winners)
      ? row.winners
          .map((winner) => clampLine(winner?.username, 30))
          .filter(Boolean)
          .slice(0, 3)
      : [];
    const winner = row.winner_username
      ? `获奖者 ${clampLine(row.winner_username, 30)}`
      : winnerNames.length
        ? `获奖者 ${winnerNames.join('、')}`
        : '';
    // status 与 when 会重复表达「已开奖」（status='drawn' → 「已开奖」，when 也可能是「已开奖（X月X日）」）
    // —— 2026-10-04 端到端实测出现的重复文案，when 已经说了就不再输出 status。
    const statusText = when.startsWith('已开奖') ? '' : status;
    const meta = [statusText, when, winner].filter(Boolean).join('，');
    return `- 「${clampLine(row.title, 60)}」${prize ? `奖品：${prize}` : ''}${meta ? `（${meta}）` : ''}`;
  });

const buildShowsBlock = (rows) =>
  rows.slice(0, MAX_SHOWS).map((row) => {
    const author = clampLine(row.author_username || row.authorUsername, 30);
    const platform = clampLine(row.creator_platform || row.creatorPlatform, 20);
    const meta = [author ? `作者 ${author}` : '', platform].filter(Boolean).join('，');
    return `- 「${clampLine(row.title, 60)}」${meta ? `（${meta}）` : ''}`;
  });

export const getActivitiesContext = async () => {
  const [activities, lotteries, shows] = await Promise.allSettled([
    listActivityCampaigns({ limit: MAX_ACTIVITIES }),
    getCommunityLotteries(),
    getCreatorShows({ limit: MAX_SHOWS }),
  ]);

  const activityRows =
    activities.status === 'fulfilled' && activities.value?.ok ? activities.value.data || [] : [];
  const lotteryRows =
    lotteries.status === 'fulfilled' && Array.isArray(lotteries.value?.data)
      ? lotteries.value.data
      : [];
  const showRows =
    shows.status === 'fulfilled' && Array.isArray(shows.value?.data) ? shows.value.data : [];

  const blocks = [];
  const labels = [];
  if (activityRows.length) {
    blocks.push(`【站内活动】\n${buildActivitiesBlock(activityRows).join('\n')}`);
    labels.push('站内活动');
  }
  if (lotteryRows.length) {
    blocks.push(`【抽奖】\n${buildLotteriesBlock(lotteryRows).join('\n')}`);
    labels.push('抽奖');
  }
  if (showRows.length) {
    blocks.push(`【创作者演出】\n${buildShowsBlock(showRows).join('\n')}`);
    labels.push('创作者演出');
  }

  const total = activityRows.length + lotteryRows.length + showRows.length;
  if (total === 0) {
    // 三处都空/失败时给一条明确的空态 —— 避免模型拿不到证据却「编」一个活动出来。
    return {
      context: '【站内活动】当前没有可展示的活动、抽奖或演出记录。',
      total: 0,
      labels: [],
    };
  }

  return { context: blocks.join('\n\n'), total, labels };
};
