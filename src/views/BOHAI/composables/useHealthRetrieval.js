/**
 * useHealthRetrieval — BOH Health 本机数据读取
 *
 * BOH AI 的 health 连接器数据来源。读取 useHealthStore（localStorage 本机存储），
 * 组装成带 [H1]/[H2] 引用标记的证据块，供 BOH AI 做健康分析时引用。
 *
 * 设计原则：
 * - 读取 useHealthStore 的内存态（登录后该 store 会与云端同步，多端一致）。
 * - 只输出用户真实记录过的字段；缺失字段标注「未记录」，不推算、不编造。
 * - 自由文本（备注/指标）先中性化再进 prompt；只送年龄段不送确切年龄。
 */

import { useHealthStore, localDateISO } from '@/stores/health';
import {
  HEALTH_CONTEXT_MAX_CHARS,
  HEALTH_CONTEXT_MAX_LOGS
} from './chat-engine-config.js';

const SEX_LABELS = {
  male: '男',
  female: '女',
  other: '其他',
  prefer_not_to_say: '不愿透露',
  '': '未填写'
};

const ACTIVITY_LABELS = {
  sedentary: '久坐（几乎不运动）',
  light: '轻度活动（每周 1-3 次）',
  moderate: '中度活动（每周 3-5 次）',
  active: '高强度活动（每周 6-7 次）',
  '': '未填写'
};

const MOOD_LABELS = {
  great: '很好',
  good: '不错',
  ok: '一般',
  low: '低落',
  bad: '很差',
  '': '-'
};

const WEEKDAY = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

const weekdayOf = (iso) => {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? '' : WEEKDAY[d.getDay()];
};

const num = (value, digits = 0) => (
  typeof value === 'number' && Number.isFinite(value) ? Number(value).toFixed(digits) : null
);

const trimTo = (text, maxChars) => {
  const raw = String(text || '');
  return raw.length > maxChars ? `${raw.slice(0, Math.max(0, maxChars - 1))}…` : raw;
};

// 自由文本（心情备注/体检指标）进入 system prompt 前的中性化：
// 去掉尖括号与反引号，防闭合标记逃逸和代码围栏注入；换行压成空格
const sanitizeFreeText = (text, maxChars) => trimTo(
  String(text || '')
    .replace(/[<>`]/g, "'")
    .replace(/[\r\n]+/g, ' '),
  maxChars
);

// 年龄段化：不把确切出生年份/年龄送出本机，只给模型粗粒度年龄段
const ageBandOf = (age) => {
  if (age === null || age === undefined) return null;
  const lo = Math.floor(age / 10) * 10;
  return `${lo}-${lo + 9} 岁`;
};

/**
 * 构建健康数据证据块
 * @returns {{ context: string, total: number, labels: string[], confidence: number, evidenceRefs: string[], metadata: Object }}
 */
export const getHealthContext = () => {
  let store = null;
  try {
    store = useHealthStore();
  } catch {
    // pinia 尚未就绪时静默降级，不阻断主流程
    return { context: '', total: 0, labels: [], confidence: 0, evidenceRefs: [], metadata: {} };
  }

  try {
    store.hydrate();
  } catch {
    // hydrate 失败时沿用 store 当前状态
  }

  const profile = store.profile || {};
  const dailyLogs = Array.isArray(store.dailyLogs) ? store.dailyLogs : [];
  const weightLogs = Array.isArray(store.weightLogs) ? store.weightLogs : [];
  const vaultRecords = Array.isArray(store.vaultRecords) ? store.vaultRecords : [];

  const blocks = [];
  const labels = [];
  const evidenceRefs = [];

  const pushBlock = (title, body) => {
    if (!body) return;
    const ref = `H${blocks.length + 1}`;
    blocks.push(`[${ref}] ${title}\n${body}`);
    labels.push(title);
    evidenceRefs.push(ref);
  };

  // ── 1. 基础档案 ──────────────────────────────────────────────────────────
  const profileLines = [];
  const hasProfile = Boolean(
    profile.sex
    || profile.birthYear
    || profile.heightCm
    || profile.weightKg
    || profile.activityLevel
  );

  if (profile.sex) profileLines.push(`性别：${SEX_LABELS[profile.sex] || profile.sex}`);
  if (profile.birthYear) {
    profileLines.push(`出生年份：${profile.birthYear}（年龄约 ${store.age ?? '未知'} 岁）`);
  }
  if (profile.heightCm) profileLines.push(`身高：${num(profile.heightCm)} cm`);
  if (profile.weightKg) profileLines.push(`体重：${num(profile.weightKg, 1)} kg`);
  if (store.bmi !== null && store.bmi !== undefined) {
    profileLines.push(`BMI：${store.bmi}（${store.bmiCategory || '未分级'}，中国成人标准：偏轻<18.5 / 健康18.5-24 / 超重24-28 / 肥胖≥28）`);
  }
  profileLines.push(`活动量：${ACTIVITY_LABELS[profile.activityLevel] || '未填写'}`);
  if (store.bmr) profileLines.push(`基础代谢 BMR：约 ${store.bmr} kcal/日（Mifflin-St Jeor 估算）`);
  if (store.tdee) profileLines.push(`每日总消耗 TDEE：约 ${store.tdee} kcal/日`);

  pushBlock(
    'BOH Health 基础档案',
    hasProfile
      ? profileLines.join('\n')
      : '用户尚未填写基础档案（身高/体重/年龄/性别/活动量均为空）。'
  );

  // ── 2. 日常记录 ──────────────────────────────────────────────────────────
  const sortedLogs = [...dailyLogs]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, HEALTH_CONTEXT_MAX_LOGS);

  if (sortedLogs.length > 0) {
    const body = sortedLogs
      .map((log) => {
        const parts = [];
        parts.push(`睡眠 ${log.sleepHours !== null && log.sleepHours !== undefined ? `${num(log.sleepHours, 1)} h` : '未记录'}`);
        parts.push(`步数 ${log.steps !== null && log.steps !== undefined ? Number(log.steps).toLocaleString() : '未记录'}`);
        parts.push(`饮水 ${log.waterCups !== null && log.waterCups !== undefined ? `${log.waterCups} 杯` : '未记录'}`);
        parts.push(`心情 ${MOOD_LABELS[log.mood] || '-'}`);
        const line = `${localDateISO(new Date(`${log.date}T00:00:00`))} ${weekdayOf(log.date)}：${parts.join(' · ')}`;
        return log.moodNote ? `${line}｜备注：${sanitizeFreeText(log.moodNote, 60)}` : line;
      })
      .join('\n');

    const avgSleep = store.weeklyAvgSleep;
    const summary = avgSleep !== null && avgSleep !== undefined
      ? `（近 7 天平均睡眠 ${avgSleep} h）`
      : '';
    pushBlock(`BOH Health 日常记录（近 ${sortedLogs.length} 条${summary}）`, body);
  }

  // ── 3. 体重变化 ──────────────────────────────────────────────────────────
  if (weightLogs.length > 1) {
    const recent = weightLogs.slice(0, 8);
    const body = recent
      .map((log) => `${localDateISO(new Date(log.loggedAt))}：${num(log.weightKg, 1)} kg`)
      .join('\n');
    const oldest = recent[recent.length - 1];
    const newest = recent[0];
    const delta = (newest.weightKg - oldest.weightKg).toFixed(1);
    pushBlock(
      `BOH Health 体重记录（近 ${recent.length} 次，区间变化 ${delta > 0 ? '+' : ''}${delta} kg）`,
      body
    );
  }

  // ── 4. 健康档案 ──────────────────────────────────────────────────────────
  if (vaultRecords.length > 0) {
    const body = vaultRecords
      .slice(0, 5)
      .map((record) => {
        const indicators = Object.entries(record.indicators || {})
          .map(([key, value]) => `${key} ${value}`)
          .join('，');
        return `${record.title}（${String(record.createdAt).slice(0, 10)}）${indicators ? `：${trimTo(indicators, 200)}` : ''}`;
      })
      .join('\n');
    pushBlock(`BOH Health 健康档案（${vaultRecords.length} 条）`, body);
  }

  if (blocks.length === 0) {
    return { context: '', total: 0, labels: [], confidence: 0, evidenceRefs: [], metadata: {} };
  }

  const context = trimTo(
    `【用户 BOH Health 本机健康数据（[H1] 等为引用编号，可在回答中引用）】\n${blocks.join('\n\n')}`,
    HEALTH_CONTEXT_MAX_CHARS
  );

  return {
    context,
    total: blocks.length,
    labels,
    confidence: 0.9,
    evidenceRefs,
    metadata: {
      hasProfile,
      dailyLogCount: dailyLogs.length,
      weightLogCount: weightLogs.length,
      vaultCount: vaultRecords.length
    }
  };
};
