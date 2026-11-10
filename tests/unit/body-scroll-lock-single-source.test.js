import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { stripComments } from '../helpers/source.js';

/* 为什么要这组用例（2026-10-30 P3-1）：
   `document.body.style.overflow` 是全站共享的**单一全局属性**，但全仓曾有 40+ 处直写，
   且多数是「无条件清零」（`= ''`）。两个持有者叠加时，先离场的那个会清掉还在场者的锁
   ⇒ 蒙层背后能滚（滚动穿透）。这类 bug 只在「两层浮层叠着、其中一个先卸载」时出现，
   截图和常规单测都抓不到 —— 所以只能靠「不许再直写」这道源码守卫兜住。

   本文件守**论坛目录**（2026-10-30 迁移范围）与**商城目录**（2026-11-10 迁移范围：
   用户报障「商城详情的滚动还是在滚动商品列表页」的真因就是这 7 处直写 —— 而且它们
   连直写都不管用，见下面第二条用例）。全站其余 30+ 处仍是直写，属于
   「等对应模块改动时顺手迁」的技术债，不在这一轮硬切（硬切会让本守卫大面积红，
   等于把门禁废掉）。 */

const LOCK_FILE = 'src/composables/useBodyScrollLock.js';

/** 已经迁到单源的目录：新增直写立刻红。 */
const MIGRATED_DIRS = ['src/views/Forum', 'src/views/Shop'];

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
  it('已迁移目录内不允许直写 document.body.style.overflow', () => {
    for (const dir of MIGRATED_DIRS) {
      const offenders = walk(dir).filter((file) => {
        // 先剥注释：说明性注释里会提到这串，那是解释不是实现
        const code = stripComments(readFileSync(file, 'utf8'));
        return RAW_ASSIGN.test(code);
      });
      // 空数组 = 全部走 acquireBodyScrollLock；加新文件时若直写，这里立刻红
      expect(offenders, `${dir} 里还有直写`).toEqual([]);
    }
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

  /* 2026-11-10：商城页那 7 处直写不只是「不单源」，是**压根不生效** ——
     本站真正的滚动容器是 html（`html{overflow-y:auto!important}` 把 body 钉成
     visible!important），只写 body 的 inline overflow 连样式表都盖不过。
     所以这里额外要求：商城页必须从单源取锁（而不是把直写换个写法）。 */
  it('商城页从单源取锁（写 body 的 inline 样式在本站等于没锁）', () => {
    const code = stripComments(readFileSync('src/views/Shop/index.vue', 'utf8'));
    expect(code).toContain('acquireBodyScrollLock');
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
