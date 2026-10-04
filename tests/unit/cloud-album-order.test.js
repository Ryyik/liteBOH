import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { squeezeSource, scriptSection, stripComments } from '../helpers/source.js';

const root = resolve(import.meta.dirname, '../..');
const read = (rel) => readFileSync(resolve(root, rel), 'utf8');

const apiCode = () => squeezeSource(stripComments(read('src/utils/api/boh-cloud-api.js')));
// .vue 必须先取 <script> 区再剥注释：模板里的 `accept="image/*"` 会与远处的 `*/` 错配
const viewCode = () =>
  stripComments(scriptSection(read('src/views/user-center/Cloud+/CloudPlusMain.vue')));
const forumCode = () => stripComments(scriptSection(read('src/views/Forum/ForumMain.vue')));

describe('Cloud+ 相册排序与形态（2026-10-02 定稿，防回退）', () => {
  it('listMyCloudEntries 按内容日期降序排（而不是 updated_at）', () => {
    // 背景：这一页原来按 updated_at 降序排。症状是「编辑一条旧内容，它会跳到最前面」，
    // 用户看到的就是「日期 / 顺序不对」。必须在**服务端**排：查询带 limit(240)，
    // 客户端再 sort 只能对已截断的那一页排，会真的排错（漏项/乱序）。
    //
    // nullsFirst:false 是配套的：PostgreSQL 在 DESC 时默认 NULLS FIRST，
    // 不写会把「没填日期」的条目全顶到最上面，比按 updated_at 排更难看。
    expect(apiCode()).toMatch(
      /\.order\(['"]entry_date['"],\s*\{\s*ascending:\s*false,\s*nullsFirst:\s*false\s*\}\)/,
    );
  });

  it('两条按用户取列表的查询都必须带 .eq(user_id, safeUserId)', () => {
    // 这条是拿真事故换来的：2026-10-02 改排序时，`listLegacyNotesAsCloud` 那段的
    // `.eq('user_id', safeUserId)` 被整行替换掉了 —— 排序语句写对了，但**用户过滤没了**。
    // 后果不是"顺序不对"，而是 legacy 回退查询会拉出**所有用户**的笔记。
    // 当时是靠 lint 的 `'safeUserId' is defined but never used` 才发现的：
    // unused 警告在这个仓库里不只是死代码提示，它还会兜住这种「删多了一行」的错。
    const filtered = (apiCode().match(/\.eq\(['"]user_id['"],\s*safeUserId\)/g) || []).length;
    expect(
      filtered,
      '少于 2 处说明有一条按用户取列表的查询丢了 user_id 过滤（会跨用户拉数据）',
    ).toBeGreaterThanOrEqual(2);
  });

  it('legacy 回退查询同口径（老表的内容日期列叫 note_date）', () => {
    expect(apiCode()).toMatch(
      /\.order\(['"]note_date['"],\s*\{\s*ascending:\s*false,\s*nullsFirst:\s*false\s*\}\)/,
    );
  });

  it('视图层不再对相册条目重排（否则与服务端分页游标各排各的）', () => {
    const matched = viewCode().match(/const activeGalleryEntries\s*=\s*computed\(([\s\S]*?)\);/);
    expect(matched, '未找到 activeGalleryEntries 定义').toBeTruthy();
    expect(matched[1]).not.toContain('.sort(');
  });

  it('相册保持「一整片密铺」，不得找回月份分组', () => {
    // 2026-10-02 用户口径：参考 iOS 图库 —— 不要按日期分类，一整片图直接铺开。
    // 原来的 `<section v-for="group in groupedVisibleEntries">` + 月份标题行
    // 会把相册切成一段段，是「卡片流」语汇。
    const view = read('src/views/user-center/Cloud+/CloudPlusMain.vue');
    expect(view).not.toContain('groupedVisibleEntries');
    expect(view).not.toContain('album-month-heading');
    expect(view).toContain('album-tile-grid');
  });

  it('多图贴按「一张图一格」展开（key 必须带下标）', () => {
    // 一条含 N 张图的内容要铺成 N 个格子；key 只用 entry.id 会让同一条目的多个格子撞 key，
    // Vue 复用节点时会串图。这条同时锁住「不再回到 封面 + N 图角标」的老形态。
    const code = squeezeSource(viewCode());
    expect(code).toContain('flatMap');
    expect(code).toMatch(/key:\s*`\$\{entry\.id\}::\$\{index\}`/);
    expect(read('src/views/user-center/Cloud+/CloudPlusMain.vue')).not.toContain(
      'tile-count-badge',
    );
  });

  it('「设为公开」入口已取消（2026-10-02：Cloud+ = 私密备份库）', () => {
    // 产品口径：Cloud+ 是作品照片的私密备份；对外可见走 token 令牌分享 / 转为帖子。
    // 「设为公开」按钮与 makeEntryPublic 已删除；存量公开条目不迁移（仍计入作品格，
    // 由「去作品格管理」出口维护），相册显示全部备份、不再按可见性过滤。
    const view = viewCode();
    expect(view).not.toContain('makeEntryPublic');
    expect(view).not.toContain('设为公开');
    expect(view).toMatch(/const activeGalleryEntries\s*=\s*computed\(\(\)\s*=>\s*entries\.value\)/);
  });

  it('Phase 4：备份可「转为帖子」，预填抑制旧草稿恢复', () => {
    // 对外可见的第二条路（第一条是 token 令牌分享）。图片直接复用 Cloudinary url
    // （不二次上传），经 sessionStorage 一次性预填进论坛发帖器；
    // ForumMain 的 restorePostDraft 在预填会话内必须跳过，否则旧草稿覆盖刚选好的图。
    expect(viewCode()).toContain('convertEntryToPost');
    const forum = forumCode();
    expect(forum).toContain('boh-cloud-convert-draft');
    expect(forum).toMatch(/convertPrefillApplied\.value\) return/);
    expect(forum).toContain('backupPostImagesToCloud');
  });

  it('已是论坛帖的备份不再显示「转为帖子」（2026-10-03 报障）', () => {
    // source==='forum' 的条目是**发帖成功时自动落库的备份**（ForumMain 的
    // createMyCloudEntry({ source:'forum', sourcePostId })），它本身就已经是一篇论坛帖。
    // 旧判据只看「有没有图」，于是这些条目在详情页也会出现「转为帖子」，
    // 点一下等于拿同一批图再发一遍 —— 用户看到的就是「已经是公开帖子了还给转帖入口」。
    //
    // ⚠️ 判据**不能**改用 visibility：论坛同步条目是 private（API 层锁死禁止设为公开），
    // 用 isSelectedEntryPublic 过滤一条都挡不住。
    const script = viewCode();
    expect(script).toContain('canConvertSelectedEntryToPost');
    expect(script).toMatch(/source[\s\S]{0,60}forum/);
    // 处理函数自身也要有兜底（入口隐藏挡不住从别处调进来）
    expect(script).toMatch(/function convertEntryToPost\(entry\)[\s\S]{0,300}forum/);

    const view = read('src/views/user-center/Cloud+/CloudPlusMain.vue');
    expect(view).toContain('v-if="canConvertSelectedEntryToPost"');
    // 不得回到「有图就显示」的裸条件
    expect(view).not.toContain('v-if="collectEntryImageUrls(selectedEntry).length"');
  });

  it('Phase 2：发帖成功后自动备份（best-effort，无图帖不备份）', () => {
    const forum = forumCode();
    expect(forum).toContain('createMyCloudEntry(userId, {');
    expect(forum).toContain("source: 'forum'");
    expect(forum).toContain('sourcePostId: String(realPost?.id');
    // 备份绝不阻塞发帖：调用点必须是 void 前缀（fire-and-forget）
    expect(forum).toMatch(/void backupPostImagesToCloud\(realPost, finalImages, next\)/);
  });

  it('列数由 --album-columns 变量驱动（捏合切换的前提）', () => {
    // 列数一旦写死回 `repeat(5, ...)`，捏合就静默失效 —— 探针会红，但源码层先说清楚。
    expect(read('src/views/user-center/Cloud+/style.scoped.css')).toMatch(
      /grid-template-columns: repeat\(var\(--album-columns/,
    );
  });
});

/**
 * Cloud+ 动效（2026-10-03）：放大 / 缩小 / 切换。
 *
 * 为什么要有源码层守卫：三条动效里两条靠「瞬时类名 + keyframes」，浏览器探针
 * （scripts/probes 里的临时冒烟）能验，但探针**不进 CI**（`npm run verify` 不跑探针）。
 * 这里锁住「接线」这一层 —— 类名、Transition 名、关键帧名、origin 变量名，
 * 任何一处被改掉或删掉，这里先红，而不是等用户发现「点了没反应」。
 * 反向对照实测：把 openEntry 的 rect 分支改成恒 false（退回居中展开）→
 * 探针的「展开原点 = 点中格子的中心」与「transform-origin 用了该原点」两条当场 FAIL。
 */
describe('Cloud+ 动效接线（2026-10-03，防「静默失效」）', () => {
  const css = () => read('src/views/user-center/Cloud+/style.scoped.css');
  const view = () => read('src/views/user-center/Cloud+/CloudPlusMain.vue');

  it('图库格子：hover 放大 / 按压缩小', () => {
    const sheet = css();
    // hover 必须限定在真有指针的设备上：触屏没有 hover，点过会一直保持放大态
    expect(sheet).toMatch(/@media \(hover: hover\) and \(pointer: fine\)/);
    expect(sheet).toMatch(/\.gallery-tile:hover\s*\{[\s\S]{0,160}transform: scale\(1\.0/);
    expect(sheet).toMatch(/\.gallery-tile:active\s*\{[\s\S]{0,120}transform: scale\(0\.9/);
  });

  it('详情：从点中的格子放大展开、关闭缩回', () => {
    const script = viewCode();
    // origin 必须来自被点元素的 rect（写死 50% 就是「从屏幕正中凭空长出」）
    expect(script).toContain('detailOrigin');
    expect(script).toMatch(/getBoundingClientRect/);
    expect(view()).toMatch(/<Transition name="cloud-detail">/);
    expect(view()).toMatch(/'--detail-origin-x': detailOrigin\.x/);

    const sheet = css();
    expect(sheet).toMatch(
      /\.detail-overlay\.cloud-detail-enter-active \.detail-modal[\s\S]{0,200}transform-origin: var\(--detail-origin-x/,
    );
    expect(sheet).toContain('cloudDetailZoomIn');
    expect(sheet).toContain('cloudDetailZoomOut');
    // 基类上不许再写死进场动画：写死了就只有进场没有退场（v-if 卸载时类还没生效）
    expect(sheet).not.toMatch(/\.detail-modal\s*\{[\s\S]{0,300}animation: slideUp/);
  });

  it('切换：三档视图过渡 + 捏合切列落定', () => {
    expect(view()).toMatch(/:class="\{ 'is-view-entering': isViewEntering \}"/);
    expect(view()).toMatch(/:class="\{ 'is-settling': isAlbumSettling \}"/);
    expect(viewCode()).toMatch(/watch\(cloudTab,[\s\S]{0,200}isViewEntering\.value = true/);
    expect(viewCode()).toMatch(
      /watch\(resolvedAlbumColumns,[\s\S]{0,200}isAlbumSettling\.value = true/,
    );

    const sheet = css();
    expect(sheet).toContain('.cloud-main.is-view-entering');
    expect(sheet).toContain('cloudViewEnter');
    expect(sheet).toContain('.album-tile-grid.is-settling');
    expect(sheet).toContain('cloudAlbumSettle');
  });

  it('新动画全部接 prefers-reduced-motion 兜底', () => {
    const sheet = css();
    const reduceBlocks =
      sheet.match(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?\n\}/g) || [];
    const joined = reduceBlocks.join('\n');
    // 兜底块里写的是「承载动画的选择器」（不是 keyframes 名）—— 逐个点名
    for (const selector of [
      '.detail-overlay.cloud-detail-enter-active',
      '.cloud-main.is-view-entering',
      '.album-tile-grid.is-settling',
    ]) {
      expect(joined, `${selector} 缺少 reduced-motion 兜底`).toContain(selector);
    }
  });
});
