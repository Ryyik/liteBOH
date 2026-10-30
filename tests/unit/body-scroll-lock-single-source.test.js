import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { stripComments } from '../helpers/source.js';

/* 为什么要这组用例（2026-10-30 P3-1）：
   `document.body.style.overflow` 是全站共享的**单一全局属性**，但全仓曾有 40+ 处直写，
   且多数是「无条件清零」（`= ''`）。两个持有者叠加时，先离场的那个会清掉还在场者的锁
   ⇒ 蒙层背后能滚（滚动穿透）。这类 bug 只在「两层浮层叠着、其中一个先卸载」时出现，
   截图和常规单测都抓不到 —— 所以只能靠「不许再直写」这道源码守卫兜住。

   本文件只守**论坛目录**（本次迁移范围）。全站其余 30+ 处仍是直写，属于
   「等对应模块改动时顺手迁」的技术债，不在这一轮硬切（硬切会让本守卫大面积红，
   等于把门禁废掉）。 */

const LOCK_FILE = 'src/composables/useBodyScrollLock.js';

const walk = (dir) => {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(js|ts|vue|mjs)$/.test(entry.name)) out.push(full);
  }
  return out;
};

/** 直写 body.style.overflow 的赋值（不含读取）。 */
const RAW_ASSIGN = /document\.body\.style\.overflow\s*=[^=]/;

describe('body 滚动锁单源（P3-1）', () => {
  it('论坛目录内不允许直写 document.body.style.overflow', () => {
    const offenders = walk('src/views/Forum').filter((file) => {
      // 先剥注释：说明性注释里会提到这串，那是解释不是实现
      const code = stripComments(readFileSync(file, 'utf8'));
      return RAW_ASSIGN.test(code);
    });
    // 空数组 = 全部走 acquireBodyScrollLock；加新文件时若直写，这里立刻红
    expect(offenders).toEqual([]);
  });

  it('论坛的两个持有者都从单源取锁', () => {
    for (const file of [
      'src/views/Forum/ForumMain.vue',
      'src/views/Forum/components/ForumImageViewer.vue',
    ]) {
      const code = stripComments(readFileSync(file, 'utf8'));
      expect(code).toContain('acquireBodyScrollLock');
    }
  });

  it('单源文件之外不允许出现「硬写空串解锁」的实现', () => {
    // 允许直写的地方只有单源自己（它内部要真正改样式）
    const offenders = walk('src').filter((file) => {
      if (file === LOCK_FILE) return false;
      const code = stripComments(readFileSync(file, 'utf8'));
      return RAW_ASSIGN.test(code) && code.includes('acquireBodyScrollLock');
    });
    // 迁移到一半的文件最容易出现「acquire 了但还留着旧清零」—— 那会让引用计数失衡
    expect(offenders).toEqual([]);
  });
});
