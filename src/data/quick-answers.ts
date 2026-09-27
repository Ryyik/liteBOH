/**
 * 搜索即答（Spotlight 计算器/换算同款思路）—— 数据单源，见 plans/020 §13/§14。
 *
 * 每个匹配器输入原始搜索词，命中返回一条即答；注册表 `answers` 源汇总、恒 ≤2 条。
 * 命中项的 route 是「继续了解」的落点（速答本身已在标题里说清）。
 */

export interface QuickAnswer {
  /** 稳定 key（去重/测试用） */
  id: string;
  title: string;
  excerpt: string;
  route: string;
}

/* ---------------- MC 版本 → Java 环境（结构化真源；教程 q2 是散文） ---------------- */

type VersionTuple = [number, number, number];

/** 区间上限（含）。null = 无上限；升序排列，首个命中的区间即答案 */
const MC_JAVA_RANGES: Array<{ max: VersionTuple | null; java: string; from: string; to: string }> =
  [
    { max: [1, 16, 5], java: 'Java 8+', from: '1.12（17w13a）', to: '1.16.5' },
    { max: [1, 17, 1], java: 'Java 16+', from: '1.17（21w19a）', to: '1.17.1' },
    { max: [1, 20, 4], java: 'Java 17+', from: '1.18（1.18-pre2）', to: '1.20.4' },
    { max: null, java: 'Java 21+', from: '1.20.5（24w14a）', to: '最新' },
  ];

const parseMcVersion = (text: string): VersionTuple | null => {
  const m = /(?:^|[^\d.])1\.(\d{1,2})(?:\.(\d{1,2}))?(?![\d.])/.exec(String(text || ''));
  if (!m) return null;
  return [1, Number(m[1]), Number(m[2] || 0)];
};

const lte = (a: VersionTuple, b: VersionTuple): boolean =>
  a[0] < b[0] || (a[0] === b[0] && (a[1] < b[1] || (a[1] === b[1] && a[2] <= b[2])));

const matchMcJavaForward = (query: string): QuickAnswer | null => {
  const version = parseMcVersion(query);
  if (!version) return null;
  const hit = MC_JAVA_RANGES.find((range) => range.max === null || lte(version, range.max));
  if (!hit) return null;
  const [major, minor, patch] = version;
  return {
    id: `mc-java-${major}.${minor}.${patch}`,
    title: `Minecraft ${major}.${minor}${patch ? `.${patch}` : ''} 需要 ${hit.java}`,
    excerpt: `适用 ${hit.from} ~ ${hit.to} · Java 环境与启动器详见教程`,
    route: '/download#q2',
  };
};

/** 反查：Java 8 / 16 / 17 / 21 能运行哪些 MC 版本 */
const matchMcJavaReverse = (query: string): QuickAnswer | null => {
  const m = /java\s*(8|16|17|21)(?!\d)/i.exec(String(query || ''));
  if (!m) return null;
  const table: Record<string, string> = {
    '8': 'Minecraft 1.12 ~ 1.16.5',
    '16': 'Minecraft 1.17 ~ 1.17.1',
    '17': 'Minecraft 1.18 ~ 1.20.4',
    '21': 'Minecraft 1.20.5 及以上',
  };
  const v = m[1];
  return {
    id: `mc-java-reverse-${v}`,
    title: `Java ${v} 可以运行 ${table[v]}`,
    excerpt: '版本与 Java 环境对应关系详见教程「客户端问题」',
    route: '/download#q2',
  };
};

/* ---------------- 联机端口速查 ---------------- */

const matchPortAnswer = (query: string): QuickAnswer | null => {
  const q = String(query || '').toLowerCase();
  const hasPortWord = /端口|port|联机/.test(q);
  const hasKnownPort = /25565|19132/.test(q);
  if (!hasPortWord && !hasKnownPort) return null;
  if (!hasKnownPort && !/(java|基岩|bedrock|mc|minecraft|服务器|开服)/.test(q)) return null;
  return {
    id: 'mc-ports',
    title: '联机端口：Java 版 25565 · 基岩版 19132',
    excerpt: '开服 / 局域网联机默认端口，Frp 隧道本地端口也填这两个',
    route: '/download#q12',
  };
};

/* ---------------- 计算器（安全求值，不用 eval） ---------------- */

/** 递归下降解析：+ - * / % ^ 与括号。拒绝任何非法字符，除零返回 null */
const evaluateArithmetic = (raw: string): number | null => {
  const src = raw.replace(/\s+/g, '').replace(/×/g, '*').replace(/÷/g, '/');
  if (!src || !/^[0-9+\-*/%^().]+$/.test(src)) return null;
  if (!/[+\-*/%^]/.test(src)) return null; // 纯数字不是计算
  let pos = 0;

  const peek = () => src[pos];
  const eat = (ch: string) => {
    if (src[pos] === ch) {
      pos += 1;
      return true;
    }
    return false;
  };

  const parseExpr = (): number | null => {
    let left = parseTerm();
    if (left === null) return null;
    for (;;) {
      if (eat('+')) {
        const right = parseTerm();
        if (right === null) return null;
        left += right;
      } else if (eat('-')) {
        const right = parseTerm();
        if (right === null) return null;
        left -= right;
      } else {
        return left;
      }
    }
  };

  const parseTerm = (): number | null => {
    let left = parseFactor();
    if (left === null) return null;
    for (;;) {
      if (eat('*')) {
        const right = parseFactor();
        if (right === null) return null;
        left *= right;
      } else if (eat('/')) {
        const right = parseFactor();
        if (right === null) return null;
        if (right === 0) return null; // 除零：不当计算处理
        left /= right;
      } else if (eat('%')) {
        const right = parseFactor();
        if (right === null) return null;
        if (right === 0) return null;
        left %= right;
      } else {
        return left;
      }
    }
  };

  const parseFactor = (): number | null => {
    const base = parseUnary();
    if (base === null) return null;
    if (eat('^')) {
      const exp = parseFactor(); // 右结合
      if (exp === null) return null;
      return Math.pow(base, exp);
    }
    return base;
  };

  const parseUnary = (): number | null => {
    if (eat('-')) {
      const v = parseUnary();
      return v === null ? null : -v;
    }
    if (eat('+')) return parseUnary();
    return parsePrimary();
  };

  const parsePrimary = (): number | null => {
    if (eat('(')) {
      const v = parseExpr();
      if (v === null || !eat(')')) return null;
      return v;
    }
    const start = pos;
    while (pos < src.length && /[0-9.]/.test(peek())) pos += 1;
    if (start === pos) return null;
    const num = Number(src.slice(start, pos));
    return Number.isFinite(num) ? num : null;
  };

  const result = parseExpr();
  if (result === null || pos !== src.length) return null; // 有剩余字符 = 表达式没吃干净
  return Number.isFinite(result) ? result : null;
};

const matchCalculator = (query: string): QuickAnswer | null => {
  const q = String(query || '')
    .replace(/^=+/, '')
    .trim();
  if (!q || q.length > 64) return null;
  const value = evaluateArithmetic(q);
  if (value === null) return null;
  const pretty = Number.parseFloat(value.toPrecision(12));
  return {
    id: `calc-${q}`,
    title: `${q.replace(/\s+/g, ' ')} = ${pretty}`,
    excerpt: '即答 · 支持加减乘除、括号与幂（^）',
    route: '',
  };
};

/* ---------------- 汇总 ---------------- */

/** 汇总全部即答匹配器，按声明顺序、去重、最多 take 条 */
export const matchQuickAnswers = (query: string, take = 2): QuickAnswer[] => {
  const q = String(query || '').trim();
  if (!q) return [];
  const matchers = [matchCalculator, matchMcJavaForward, matchMcJavaReverse, matchPortAnswer];
  const out: QuickAnswer[] = [];
  const seen = new Set<string>();
  for (const match of matchers) {
    const answer = match(q);
    if (answer && !seen.has(answer.id)) {
      seen.add(answer.id);
      out.push(answer);
    }
    if (out.length >= take) break;
  }
  return out;
};
