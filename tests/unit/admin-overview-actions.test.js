import { describe, expect, it } from 'vitest';
import {
  ADMIN_ACTIONS,
  buildActionRoute,
  deriveLotteryWinnerCount,
  filterActions,
  initialDraft,
  missingParams,
  validateDraft,
  visibleParams,
} from '../../src/views/AdminOverview/actions/registry.js';
import { TAB_WRITABLE_FIELDS } from '../../src/views/DataManagement/config/fields.js';

/**
 * 概览页 `@抽奖` 的参数契约（2026-11-12）。
 *
 * 这些断言守的不是「字段名存在」，而是三条真实会出事的规则：
 *   1. 保存策略对 is_home_visible 的默认是 **true**（`!== false` 即真）、
 *      对 enforce_account_age_check 的默认是 **false**（`=== true` 才算开）。
 *      所以 draft 初值必须显式写死，漏一个就会「建个草稿结果推到首页」
 *      或「悄悄关掉账号年龄门槛」。
 *   2. winner_count 是**派生值**：选「兑现保底」必须 2 人，否则必须 1 人，
 *      手填错会被 SAVE_STRATEGIES 直接抛错 —— 所以它不该出现在输入项里。
 *   3. 报名截止晚于开奖、上限小于中奖人数、开奖时间已过，都是提交后才报错的
 *      组合；必须在预览前就拦住，否则用户白填一遍。
 */

const lottery = ADMIN_ACTIONS.find((action) => action.id === 'lottery.create');

describe('抽奖动作的字段契约', () => {
  it('动作存在且可写库', () => {
    expect(lottery).toBeTruthy();
    expect(typeof lottery.submit).toBe('function');
    expect(lottery.detailTab).toBe('lotteries');
  });

  it('draft 初值显式写死两个「反直觉默认」', () => {
    const draft = initialDraft(lottery);
    // 不显式 false 就会被保存策略的 `!== false` 判成 true，直接推到首页轮播
    expect(draft.is_home_visible).toBe(false);
    // 不显式 true 就会被 `=== true` 判成 false，账号年龄门槛静默失效
    expect(draft.enforce_account_age_check).toBe(true);
    expect(draft.is_community_visible).toBe(true);
  });

  it('中奖人数是派生值，不出现在输入项里', () => {
    const keys = lottery.params.map((param) => param.key);
    expect(keys).not.toContain('winner_count');
    expect(lottery.derived.map((item) => item.key)).toContain('winner_count');
  });

  it('派生逻辑与保存策略一致：兑现保底 2 人，其余 1 人', () => {
    expect(deriveLotteryWinnerCount('eligible')).toBe(2);
    expect(deriveLotteryWinnerCount('count_only')).toBe(1);
    expect(deriveLotteryWinnerCount('none')).toBe(1);
    expect(deriveLotteryWinnerCount(undefined)).toBe(1);
  });

  it('保底礼只在「兑现保底」时出现', () => {
    const withNone = visibleParams(lottery, { ...initialDraft(lottery), pity_mode: 'none' });
    expect(withNone.map((param) => param.key)).not.toContain('pity_reward_title');

    const withEligible = visibleParams(lottery, {
      ...initialDraft(lottery),
      pity_mode: 'eligible',
    });
    expect(withEligible.map((param) => param.key)).toContain('pity_reward_title');
  });

  it('覆盖真实的全部可写字段（漏字段等于偷偷用默认值）', () => {
    const keys = lottery.params.map((param) => param.key);
    // 这些是会在前台或开奖行为上产生差异的字段，必须能在概览页控制
    for (const key of [
      'prize_title',
      'draw_at',
      'entry_deadline_at',
      'max_entries',
      'pity_mode',
      'is_community_visible',
      'is_home_visible',
      'enforce_account_age_check',
    ]) {
      expect(keys).toContain(key);
    }
  });

  /* 上面那条断言的是**手写清单** —— 它证明不了「动作参数」与「写库白名单」对得上。
     2026-11-14 的 eligible 事故正是这样漏的：动作里没这个字段、白名单里也没有，
     而测试只检查手写的那 8 个键，全绿。这里做一次真正的跨文件契约断言。 */
  it('溢出的两个保底礼字段：动作参数与写库白名单必须同时存在', () => {
    const keys = lottery.params.map((param) => param.key);
    for (const key of ['pity_overflow_reward_title', 'pity_overflow_reward_description']) {
      // description 允许不出现在表单里，但必须在白名单里（否则保存策略写了也会被丢掉）
      expect(TAB_WRITABLE_FIELDS.lotteries).toContain(key);
    }
    // title 是 DB 约束的必填项 ⇒ 必须在表单里能填
    expect(keys).toContain('pity_overflow_reward_title');
  });
});

describe('抽奖的提交前体检', () => {
  const base = () => {
    const draft = initialDraft(lottery);
    draft.prize_title = '机械键盘';
    draft.draw_at = '2099-01-01T20:00';
    return draft;
  };

  it('必填缺失时直接说缺什么', () => {
    const draft = { ...initialDraft(lottery) };
    expect(validateDraft(lottery, draft)).toContain('奖品');
    expect(missingParams(lottery, draft)).toContain('奖品');
  });

  it('开奖时间已过 → 拦住（否则保存后立刻开奖）', () => {
    const draft = { ...base(), draw_at: '2020-01-01T20:00' };
    expect(validateDraft(lottery, draft)).toContain('已经过去');
  });

  it('报名截止晚于开奖 → 拦住', () => {
    const draft = { ...base(), entry_deadline_at: '2099-02-01T20:00' };
    expect(validateDraft(lottery, draft)).toContain('报名截止不能晚于开奖时间');
  });

  it('报名上限小于中奖人数 → 拦住', () => {
    const draft = { ...base(), max_entries: '1', pity_mode: 'eligible' };
    expect(validateDraft(lottery, draft)).toContain('中奖人数不能大于报名上限');
  });

  it('选了兑现保底却没填保底礼 → 拦住', () => {
    const draft = { ...base(), pity_mode: 'eligible', pity_reward_title: '' };
    expect(validateDraft(lottery, draft)).toContain('保底礼');
  });

  /* DB 的 `lotteries_pity_reward_config_check` 要求 eligible 时
     pity_reward_title 与 pity_overflow_reward_title **都**非空。
     只校验前者 ⇒ 用户填完点确认，拿到的是一条数据库约束错误（2026-11-14 修）。 */
  it('填了保底礼但没填溢出保底礼 → 也要拦住', () => {
    const draft = {
      ...base(),
      pity_mode: 'eligible',
      pity_reward_title: 'BOH 基础礼盒',
      pity_overflow_reward_title: '',
    };
    expect(validateDraft(lottery, draft)).toContain('溢出保底礼');
  });

  it('封面不是 http(s) 链接 → 拦住', () => {
    const draft = { ...base(), cover_image_url: 'ftp://x/y.png' };
    expect(validateDraft(lottery, draft)).toContain('http');
  });

  it('合法草稿能通过', () => {
    expect(validateDraft(lottery, base())).toBe('');
  });
});

describe('抽奖预览要说清「写什么 + 会出现在哪」', () => {
  const draft = () => {
    const next = initialDraft(lottery);
    next.prize_title = '机械键盘';
    next.draw_at = '2099-01-01T20:00';
    return next;
  };

  it('分三段：基本信息 / 中奖规则 / 前台影响', () => {
    const { sections } = lottery.summarize(draft());
    expect(sections.map((section) => section.title)).toEqual(['基本信息', '中奖规则', '前台影响']);
  });

  it('标题留空时自动生成，不用用户再填一遍', () => {
    const { sections } = lottery.summarize(draft());
    const title = sections[0].rows.find((row) => row.label === '标题');
    expect(title.value).toBe('机械键盘 抽奖');
  });

  it('明确告知会落草稿、不会立刻出现在前台', () => {
    const { sections } = lottery.summarize(draft());
    const status = sections[2].rows.find((row) => row.label === '状态');
    expect(status.value).toContain('草稿');
  });

  it('首页轮播关着时预览里也写「不展示」', () => {
    const { sections } = lottery.summarize(draft());
    const home = sections[2].rows.find((row) => row.label === '首页轮播');
    expect(home.value).toBe('不展示');
  });

  it('报名不限时给一条提示，而不是显示 0', () => {
    const { checks } = lottery.summarize(draft());
    expect(checks.some((check) => check.text.includes('不限'))).toBe(true);
  });
});

describe('动作清单本身的自洽性', () => {
  it('有 submit 的动作必须至少有一个参数（否则就是悄悄写库）', () => {
    for (const action of ADMIN_ACTIONS.filter((item) => typeof item.submit === 'function')) {
      expect(action.params.length).toBeGreaterThan(0);
    }
  });

  it('只跳转的动作要有 to，否则按钮点了没反应', () => {
    for (const action of ADMIN_ACTIONS.filter((item) => !item.submit)) {
      expect(buildActionRoute(action)?.query?.tab).toBeTruthy();
    }
  });

  it('可以按中文、别名、拼音首字母找到抽奖', () => {
    for (const query of ['抽奖', '摇奖', 'cj']) {
      expect(filterActions(query).some((action) => action.id === 'lottery.create')).toBe(true);
    }
  });
});
