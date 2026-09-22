import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

// 反证：把每处修复改回缺陷版本，确认对应断言真的变红。
// 看不到红 → 那条断言是摆设。截图全部写到 /tmp，不碰正式截图。
const SRC = path.resolve('join-wizard-demo.html');
const src = readFileSync(SRC, 'utf8');

const CASES = [
  {
    id: 'A-birth-fixed-31',
    target: 'birth_feb_days',
    note: '生日日期不再随年月动态（改回固定 31 天，2 月会出现 31 日）',
    from: 'var max = m ? new Date(y, m, 0).getDate() : 31;',
    to: 'var max = 31;',
  },
  {
    id: 'B-no-suggest',
    target: 'id_taken_suggest',
    note: 'ID 被占用时不再给可用候选',
    from: 'renderSuggest(val, suggestFor(val));',
    to: 'renderSuggest(val, []);',
  },
  {
    id: 'C-progress-class-clash',
    target: '进度点',
    note: '进度状态类改回 done/now，与成功页容器 .done{display:flex} 撞名',
    from: "d.className = 'p-dot' + (i < n ? ' is-done' : '') + (i === n ? ' is-now' : '');",
    to: "d.className = 'p-dot' + (i < n ? ' done' : '') + (i === n ? ' now' : '');",
  },
  {
    id: 'D-low-contrast',
    target: '暗色',
    note: '暗色次要文字色改回旧值（对玻璃卡底色只有 3.7:1）',
    from: '--ink:#f5f5f7; --ink-2:#a1a1a6; --ink-3:#a8a8ad;',
    to: '--ink:#f5f5f7; --ink-2:#a1a1a6; --ink-3:#75757a;',
  },
  {
    id: 'E-glass-off',
    target: '外卡是液态玻璃',
    note: '撤掉外卡的 backdrop-filter（材质只剩半透明底色，没有模糊）',
    from: '  backdrop-filter:var(--liquid-filter-lg);',
    to: '  backdrop-filter:none;',
  },
  {
    id: 'G-hidden-specificity',
    target: '带 hidden 的元素真的被隐藏',
    note: '把 .done-actions .btn 的 display:block 加回去（(0,2,0) 压过 [hidden] 的 (0,1,0)）',
    from: '.done-actions .btn{width:100%;border-radius:14px;text-align:center;text-decoration:none;\n  padding:13px 20px;font-size:14px}',
    to: '.done-actions .btn{width:100%;border-radius:14px;text-align:center;text-decoration:none;\n  display:block;padding:13px 20px;font-size:14px}',
  },
  {
    id: 'H-passkey-default-on',
    target: '通行密钥开关默认关闭',
    note: '把通行密钥开关默认改成勾选（会对每个新用户弹系统验证窗）',
    from: "pkMode:'ok', pkOptIn:false",
    to: "pkMode:'ok', pkOptIn:true",
  },
  {
    id: 'I-passkey-no-session-gate',
    target: '邮箱确认模式',
    note: '去掉「无会话就不给开关」的门禁 —— 用户勾了之后注册完必然添加失败',
    from: "var usable = state.pkMode !== 'unsupported' && state.mail === 'direct';",
    to: "var usable = state.pkMode !== 'unsupported';",
  },
  {
    id: 'F-glass-opaque',
    target: '材质真的改变了渲染像素',
    note: '把外卡底色改成不透明 —— 液态玻璃与降级实色渲染结果变成一样，材质等于没生效',
    from: '  --liquid-bg-strong:rgba(255,255,255,.84);',
    to: '  --liquid-bg-strong:#ffffff;',
  },
];

// CASE=F 只跑某一条（省得为了调一条断言等六轮）
const only = String(process.env.CASE || '').trim();
const selected = only ? CASES.filter((c) => c.id.startsWith(only) || c.id.split('-')[0] === only) : CASES;
if (!selected.length) { console.log('没有匹配的反证用例：' + only); process.exit(1); }

let allProven = true;
for (const c of selected) {
  const n = src.split(c.from).length - 1;
  if (n === 0) {
    console.log(`\n[${c.id}] 源码里找不到锚点，跳过：${c.from.slice(0, 50)}`);
    allProven = false;
    continue;
  }
  // 副本必须留在仓库根目录：demo 用相对路径引用 src/assets/images 的主图，
  // 放到 /tmp 会让图片 404（玻璃没东西可模糊），反证环境就与真实环境不一致了。
  const file = path.resolve(`.rev-${c.id}.html`);
  writeFileSync(file, src.split(c.from).join(c.to), 'utf8');
  console.log(`\n===== 反证 ${c.id}（改动 ${n} 处）: ${c.note} =====`);
  let out = '';
  let code = 0;
  try {
    out = execFileSync(process.execPath, ['scripts/probes/probe-join-wizard-demo.mjs'], {
      env: {
        ...process.env,
        DEMO_FILE: 'file://' + file,
        SHOT_DIR: '/tmp/revshots',
        EXPECT_RED: c.target,
      },
      encoding: 'utf8',
    });
  } catch (e) {
    code = e.status;
    out = String(e.stdout || '') + String(e.stderr || '');
  } finally {
    try { unlinkSync(file); } catch { /* 已删 */ }
  }
  const relevant = out.split('\n').filter((l) => l.startsWith('FAIL'));
  relevant.forEach((l) => console.log('   ' + l));
  if (out.includes('ERR_FILE_NOT_FOUND')) console.log('   [warn] 有资源 404，反证环境与真实环境不一致');
  const tail = out.split('\n').filter((l) => l.includes('反证目标') || l.includes('PASS')).slice(-2);
  tail.forEach((l) => console.log('   ' + l));
  const ok = code === 0;
  console.log(`   → ${ok ? '反证成立（断言确实变红）' : '反证失败：断言没变红，是摆设'}`);
  if (!ok) allProven = false;
}

console.log(`\n${allProven ? `全部反证成立：${selected.length} 项修复各自都有会变红的断言守着` : '有反证未成立，需要重写对应断言'}`);
process.exit(allProven ? 0 : 1);
