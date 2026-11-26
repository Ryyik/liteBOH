import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

/**
 * 反证：把每处关键行为改回缺陷版本，确认对应断言真的变红。
 *
 * 为什么必须做：一个 105/105 全绿的探针有两种可能 ——
 *   ① 页面真的对；② 断言根本没在测东西（假绿）。
 * 光看绿分不出这两种，只有「改成错的、看它变红」能分。
 *
 * 用法：node scripts/probes/repro-join-real.mjs
 *   · 逐条备份 → 改源码 → 跑探针 → 必须看到指定断言 FAIL → 还原
 *   · 全程用 finally 还原，中途崩了也不会把仓库留在破损状态
 */
const SRC = 'src/views/Join/index.vue';

const CASES = [
  {
    id: 'A-otp-length-6',
    note: '验证码改回 6 位（线上是 8 位，抄 6 会「位数看着对、服务端永远说不匹配」）',
    from: 'const OTP_LENGTH = 8;',
    file: 'src/utils/api/auth-api.js',
    to: 'const OTP_LENGTH = 6;',
    expect: '验证码是 8 格',
  },
  {
    id: 'B-no-inert',
    note: '非当前步去掉 inert（键盘可以 Tab 进未来步骤，表单会被填成半截）',
    from: ':inert="currentStep !== 4 || undefined"',
    to: '',
    expect: '非当前步全部 inert',
  },
  {
    id: 'C-total-steps-7',
    note: '把完成页也算成一步（点⑦停在⑥）',
    from: 'const TOTAL_STEPS = 6;',
    to: 'const TOTAL_STEPS = 7;',
    expect: '6 步 6 点',
  },
  {
    id: 'D-ink-3-too-light',
    note: '提示色淡回 55%（对比度 4.40，够不着 AA 4.5）',
    from: '--j-ink-3: color-mix(in srgb, var(--j-ink) 58%, var(--j-bg));',
    to: '--j-ink-3: color-mix(in srgb, var(--j-ink) 50%, var(--j-bg));',
    expect: '浅色：所有正文 ≥ 4.5:1',
  },
  {
    id: 'E-terms-optional',
    note: '协议改成不必勾（账号在验证通过时就建立，那时必须已同意）',
    from: 'if (!formData.agreedToTerms) {',
    to: 'if (false) {',
    expect: '不勾协议不放行',
  },
  {
    id: 'F-allow-back-on-step3',
    note: '第③屏也给「上一步」（改邮箱 = 造孤儿账号）',
    from: 'const canGoBack = computed(() => currentStep.value >= 4 || currentStep.value === 2);',
    to: 'const canGoBack = computed(() => currentStep.value >= 2);',
    expect: '第 3 步不给「上一步」',
  },
  {
    id: 'G-skip-old-account-check',
    note: '不区分老用户（静默改写老账号的 ID 和密码）',
    from: 'if (state.ok && state.incomplete === false) {',
    to: 'if (false) {',
    expect: '已注册邮箱 → 停在第 2 步',
  },
  {
    id: 'H-birth-fixed-31',
    note: '生日日期不随月变化（2 月出现 31 日）',
    from: 'birthDayCount.value = month ? new Date(2024, month, 0).getDate() : 31;',
    to: 'birthDayCount.value = 31;',
    expect: 'birth 2 月 = 29 天',
  },
  {
    id: 'I-consent-hitarea-too-small',
    // ⚠️ 必须把整组撑高（min-height + padding + 负 margin）一起去掉。
    // 只删 min-height 是不够的：padding 12×2 + 内容 20px 恰好还是 44px，
    // 断言不会红 —— 2026-11-26 实测踩到，那不是断言失灵，是反证用例没
    // 还原到真正的缺陷状态（原始缺陷是这一整组都不存在，行高 20px）。
    note: '协议勾选行回到原始 20px（无 min-height / 无 padding 撑高）',
    from: '  min-height: 44px;\n  padding: 12px 0;\n  margin: -12px 0;\n  box-sizing: border-box;\n',
    to: '',
    expect: '协议勾选行可点区 ≥44px',
  },
  {
    id: 'K-email-badge-fake',
    // 用户口径（2026-11-26）：「我输入什么都可以判定可用」
    // 退回成「有值就算可用」的假判定
    note: '邮箱查询不写结论（徽标永远不出现，或退回凭格式点亮的假判定）',
    // 改 emailState 的赋值点：这才是驱动徽标文案的那一行。
    // 第一次写的是 fieldClass 里的 is-valid（只管描边颜色），
    // 改它当然不会变红 —— 反证要打在被断言的那条链路上。
    from: "        emailState.value = 'err';",
    to: "        emailState.value = 'ok';",
    expect: '邮箱已被注册 → 徽标「已注册」',
  },
  {
    id: 'J-consent-note-overlaps',
    note: '说明文字 margin 不同步让位（压住命中区底 5px，名义 44 实际 39）',
    from: '  margin: 12px 0 0;\n  /* 与勾选框文字左对齐',
    to: '  margin: 7px 0 0;\n  /* 与勾选框文字左对齐',
    expect: '协议勾选行的命中区未被说明文字遮挡',
  },
];

const runProbe = () => {
  try {
    return execFileSync(process.execPath, ['scripts/probes/probe-join-real.mjs'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 900000,
    });
  } catch (e) {
    return `${e.stdout || ''}\n${e.stderr || ''}`;
  }
};

let allProven = true;
for (const c of CASES) {
  const file = c.file || SRC;
  const from = c.fromAlt || c.from;
  const to = c.toAlt || c.to;
  const original = fs.readFileSync(file, 'utf8');
  if (!original.includes(from)) {
    console.log(`SKIP  ${c.id} —— 锚点不存在（源码已变），需更新反证脚本：${from.slice(0, 50)}`);
    allProven = false;
    continue;
  }
  fs.writeFileSync(file, original.replace(from, to));
  let out = '';
  try {
    out = runProbe();
  } finally {
    fs.writeFileSync(file, original); // 一定还原
  }
  const hit = out.includes('FAIL') && out.includes(c.expect);
  console.log(`${hit ? 'RED   ' : 'GREEN!'} ${c.id} —— ${c.note}`);
  if (!hit) {
    allProven = false;
    const fails = out
      .split('\n')
      .filter((l) => l.startsWith('FAIL'))
      .slice(0, 3)
      .join(' / ');
    console.log(`        期望「${c.expect}」变红，实际红的是：${fails || '（一条都没红）'}`);
  }
}

console.log(
  allProven
    ? '\n反证全部成立：每处修复被改回去，对应断言都真的变红。'
    : '\n有反证未成立 —— 对应断言可能是摆设，见上面 SKIP/GREEN! 项。',
);
process.exit(allProven ? 0 : 1);
