// 离线总结「上次在线日 / 当日已检查」天粒度游标 — 纯函数单元验证
// 运行：node scripts/probes/probe-overview-day-marker.mjs
import {
  getLocalDayKey,
  getDayFrontierIso,
  readLastOnlineDay,
  writeLastOnlineDay,
  readLastCheckedDay,
  writeLastCheckedDay
} from '../../src/utils/overview-day-marker.js';

let passed = 0;
let failed = 0;

const assertEq = (actual, expected, label) => {
  const ok = actual === expected;
  if (ok) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${label}\n    期望: ${JSON.stringify(expected)}\n    实际: ${JSON.stringify(actual)}`);
  }
};

console.log('[1] getLocalDayKey 本地日键');
assertEq(getLocalDayKey(new Date(2026, 8, 6, 9, 30)), '2026-09-06', '普通日期');
assertEq(getLocalDayKey(new Date(2026, 0, 3, 23, 59)), '2026-01-03', '月份补零');
assertEq(getLocalDayKey(new Date(2026, 11, 31)), '2026-12-31', '年末日期');
assertEq(getLocalDayKey('2026-09-06T15:30:00'), '2026-09-06', '字符串时间（本地解析）');
assertEq(getLocalDayKey('not-a-date'), '', '非法输入返回空串');

console.log('[2] getDayFrontierIso 推送游标（= 次日零点）');
assertEq(
  getDayFrontierIso('2026-09-06'),
  new Date(2026, 8, 7, 0, 0, 0, 0).toISOString(),
  '26 号游标 = 27 号零点（26 号内容全部排除）'
);
assertEq(
  getDayFrontierIso('2026-12-31'),
  new Date(2027, 0, 1, 0, 0, 0, 0).toISOString(),
  '跨年滚动'
);
assertEq(
  getDayFrontierIso('2026-02-28'),
  new Date(2026, 2, 1, 0, 0, 0, 0).toISOString(),
  '非闰年月末滚动'
);
assertEq(getDayFrontierIso('2026-13-01'), null, '非法月份返回 null');
assertEq(getDayFrontierIso('garbage'), null, '脏数据返回 null');
assertEq(getDayFrontierIso(''), null, '空串返回 null');

console.log('[3] 游标读写（node 无 localStorage → 内存兜底路径）');
writeLastOnlineDay('user-a', '2026-09-06');
assertEq(readLastOnlineDay('user-a'), '2026-09-06', '写入后可读回');
writeLastOnlineDay('user-a', 'garbage');
assertEq(readLastOnlineDay('user-a'), '2026-09-06', '非法写入被忽略，保留原值');
assertEq(readLastOnlineDay('user-never-seen'), '', '未记录用户返回空串');
assertEq(readLastOnlineDay(''), '', '空 userId 返回空串');

console.log('[3b] 两个游标互不干扰（在线日 / 当日已检查 分工）');
writeLastCheckedDay('user-b', '2026-09-07');
assertEq(readLastCheckedDay('user-b'), '2026-09-07', '检查日可读回');
assertEq(readLastOnlineDay('user-b'), '', '写检查日不影响在线日');
writeLastOnlineDay('user-b', '2026-09-06');
assertEq(readLastOnlineDay('user-b'), '2026-09-06', '在线日可读回');
assertEq(readLastCheckedDay('user-b'), '2026-09-07', '写在线日不影响检查日');
assertEq(readLastOnlineDay('user-a'), '2026-09-06', '不同用户互不串号');
assertEq(readLastCheckedDay('user-a'), '', '用户 a 未写过检查日');

console.log('[4] 场景推演：26 号上线 → 27 号/29 号行为');
const lastOnlineDay = '2026-09-06'; // 26 号（示例沿用用户描述）
const frontierIso = getDayFrontierIso(lastOnlineDay);
const frontierMs = new Date(frontierIso).getTime();
const postAt26Evening = new Date(2026, 8, 6, 20, 0).getTime(); // 26 号 20:00 新帖
const postAt27Morning = new Date(2026, 8, 7, 8, 0).getTime(); // 27 号 08:00 新帖
assertEq(postAt26Evening > frontierMs, false, '26 号晚上的帖子不再推送（默认已浏览当日内容）');
assertEq(postAt27Morning > frontierMs, true, '27 号新帖会被推送（期间产生的新内容）');
const offlineDays27 = Math.floor((new Date(2026, 8, 7, 9, 0).getTime() - new Date('2026-09-06T00:00:00').getTime()) / 86400000);
assertEq(offlineDays27, 1, '27 号上线显示「离开 1 天」');

console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
