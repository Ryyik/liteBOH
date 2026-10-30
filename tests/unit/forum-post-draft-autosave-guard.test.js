/**
 * 发帖草稿「删得掉 + 刷新不丢」的**接线守卫**（2026-10-29）。
 *
 * 两个用户报障，根因都不在算法里，而在"该连着的那根线没连"：
 *
 * ① 僵尸草稿「啊」：删掉后每次都被写回来。
 *    `savePostDraftToDatabase(null)` 删除成功后**清掉了**「已清空」墓碑，于是另一个
 *    宿主实例还在 await 的 `restorePostDraft`（读到的是删除前的 localDraft）被判为
 *    "较新的一份"，直接 upsert 回云端；`restorePostDraft` 的 `!remoteDraft` 分支
 *    还额外主动清墓碑，等于给陈旧副本开第二次门。
 *    修法是**单点收口**：墓碑只在新草稿写成功后清，任何云端写入先在唯一出口过守卫。
 *
 * ② 刷新/崩溃丢内容与图片：草稿只在「关闭时点保存」才落盘，编辑期间零副本。
 *    修法是加一条**本机实时暂存**（`<prefix>_<uid>_autosave`），编辑器开着时 debounce
 *    写，`pagehide` / `beforeunload` 同步 flush，恢复时与正式草稿取较新的那份。
 *
 * ⚠️ 断言一律走 `scriptSection` + `stripComments` + `squeezeSource`（tests/helpers/source.js）：
 *    ForumMain 的注释会复述被修掉的旧写法，直接在原文上做否定断言会假红；
 *    prettier 重排会让逐字断言假红，所以只数「关键调用出现几次 / 谁在谁之前」。
 */
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { scriptSection, squeezeSource, stripComments } from '../helpers/source.js';

const FORUM_MAIN = new URL('../../src/views/Forum/ForumMain.vue', import.meta.url);
const PUBLISH_QUEUE = new URL(
  '../../src/views/Forum/composables/useForumPublishQueue.js',
  import.meta.url,
);
const DRAFT_STORAGE = new URL(
  '../../src/views/Forum/composables/useForumPostDraftStorage.js',
  import.meta.url,
);

const readCode = async (url) =>
  squeezeSource(stripComments(scriptSection(await readFile(url, 'utf8'))));

const countOf = (haystack, needle) => haystack.split(needle).length - 1;

/** 从某个声明起截一段，够覆盖目标函数体、又不跨进下一个函数 */
const sliceFromDeclaration = (code, declaration, length) => {
  const start = code.indexOf(declaration);
  expect(start, `没找到声明：${declaration}`).toBeGreaterThan(-1);
  return code.slice(start, start + length);
};

describe('forum draft zombie-clear guard (2026-10-29)', () => {
  it('clears the "cleared" tombstone only after a successful upsert, never after delete', async () => {
    const code = await readCode(FORUM_MAIN);
    const body = sliceFromDeclaration(code, 'const savePostDraftToDatabase =', 1600);

    // 删成功就清墓碑 = 忘掉"用户明确删过" ⇒ 陈旧副本能被写回来。整函数只允许剩一处。
    expect(countOf(body, 'clearDraftClearedMarker(')).toBe(1);

    // 那一处必须在 upsert **之后**（成功才清），不能在 delete 分支里。
    const upsertAt = body.indexOf('upsertForumPostDraft(');
    const clearAt = body.indexOf('clearDraftClearedMarker(');
    expect(upsertAt).toBeGreaterThan(-1);
    expect(clearAt).toBeGreaterThan(upsertAt);

    // 写入前必须有墓碑守卫（陈旧副本不许复活），且守卫在 upsert 之前。
    const guardAt = body.indexOf('readDraftClearedAt(');
    expect(guardAt).toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(upsertAt);
  });

  it('keep the tombstone in restore path (never clears it while pulling the remote draft)', async () => {
    const code = await readCode(FORUM_MAIN);
    const body = sliceFromDeclaration(code, 'const restorePostDraft = async', 5000);
    // 云端没有草稿就清墓碑 = 自己把证据删掉，然后回写陈旧副本（僵尸草稿根因之一）
    expect(countOf(body, 'clearDraftClearedMarker(')).toBe(0);
    expect(body).toContain('savePostDraftToDatabase(localBest)');
  });

  it('invalidates the in-flight restore when the other host clears the draft', async () => {
    const code = await readCode(FORUM_MAIN);
    const body = sliceFromDeclaration(code, 'const applyExternalDraftChange =', 1400);
    // 序号自增作废在飞的恢复请求（否则它把"删除前读到的 localDraft"回写云端）
    expect(body).toMatch(/if \(!incoming\) \{[\s\S]{0,80}postDraftRestoreSeq \+= 1;/);
    // 还必须掐掉本实例待写的实时暂存：否则 400ms 防抖在删除之后才落盘，
    // 下次打开编辑器又把同一段内容恢复回来（"删了又冒出来"）
    expect(body).toMatch(/if \(!incoming\) \{[\s\S]{0,400}clearTimeout\(autoSaveDraftTimer\)/);
    expect(body).toContain('autoSaveDraftSignature =');
  });

  it('keeps one authoritative cloud-write exit (all upserts go through the tombstone guard)', async () => {
    const code = await readCode(FORUM_MAIN);
    // 直接调 upsertForumPostDraft 的地方只允许在 savePostDraftToDatabase 里 ——
    // 多一条旁路就绕过了墓碑守卫，僵尸草稿会以另一种形式回来。
    expect(countOf(code, 'upsertForumPostDraft(')).toBe(1);
    expect(countOf(code, 'deleteForumPostDraft(')).toBe(1);
  });
});

describe('forum draft autosave wiring (refresh / crash recovery)', () => {
  it('subscribes and unsubscribes pagehide with the same handler', async () => {
    const code = await readCode(FORUM_MAIN);
    expect(code).toContain("window.addEventListener('pagehide', handleComposerPageHide)");
    expect(code).toContain("window.removeEventListener('pagehide', handleComposerPageHide)");
    // iOS / 微信 WebView 可能不触发 beforeunload，flush 必须两条钩子都挂
    expect(sliceFromDeclaration(code, 'const handleBeforeUnload =', 400)).toContain(
      'flushAutoSaveDraft()',
    );
    expect(sliceFromDeclaration(code, 'const handleComposerPageHide =', 200)).toContain(
      'flushAutoSaveDraft()',
    );
  });

  it('only writes the autosave while the composer session is open', async () => {
    const code = await readCode(FORUM_MAIN);
    const start = code.indexOf('scheduleAutoSaveDraft();');
    expect(start).toBeGreaterThan(-1);
    const watcher = code.slice(Math.max(0, start - 900), start);
    // 两个宿主实例同开时同一个 key 会互相覆盖；关掉编辑器后也不该留副本
    expect(watcher).toContain('if (!isMobileComposerOpen.value) return;');
  });

  it('restores the newer of autosave / draft and rehydrates uploaded image urls', async () => {
    const code = await readCode(FORUM_MAIN);
    const body = sliceFromDeclaration(code, 'const restorePostDraft = async', 5000);
    expect(body).toContain('readAutoSaveDraft()');
    expect(body).toContain('localBest');
    // squeezeSource 会压掉 `{ x }` 里的空格 ⇒ 断言写成空白宽容的正则
    expect(body).toMatch(/applyDraftToEditor\(localBest, \{\s*withImages: true\s*\}\)/);
    // 云端草稿没有图片列：回填远端时不能带 withImages，否则刚恢复的图被清掉
    expect(body).toContain('applyDraftToEditor(remoteDraft)');

    const restoreImages = sliceFromDeclaration(code, 'const restoreDraftImages =', 900);
    // 只在编辑器一张图都没有时补：已有图 = 活会话（刚选的/上传中的），不能被暂存洗掉
    expect(restoreImages).toContain('if (!urls.length || postImages.value.length) return;');
    expect(restoreImages).toContain('uploadedUrl: url');
  });

  it('drops the autosave on every "this content is done with" path', async () => {
    const code = await readCode(FORUM_MAIN);
    // 清草稿（不保存 / 内容已空）必须连暂存一起清，否则下次打开又原样恢复
    expect(sliceFromDeclaration(code, 'const clearPostDraft =', 1200)).toContain(
      'clearAutoSaveDraft()',
    );
    // 发布成功（已进队列）同理：留着会把刚发出去的内容当成"未保存的稿"再恢复一遍
    expect(sliceFromDeclaration(code, 'const handlePost = async', 5200)).toContain(
      'clearAutoSaveDraft()',
    );
  });

  it('never stores blob: previews as recoverable images', async () => {
    /* ⚠️ 这里**不**拿 `/^https?:\/\//` 这种字面量做断言：stripComments 会把正则里的
       `//` 当成行注释起点，源码切到那里就断了（假红）。改为断言归一函数存在，且
       过滤逻辑只有一处 —— 真正的行为验证在 forum-post-draft-storage.test.js
       的「drops non-http(s) urls」那条（真跑函数，不读源码）。 */
    const storage = await readCode(DRAFT_STORAGE);
    expect(storage).toContain('export function normalizeDraftImageList');
    expect(storage).toContain('https?');
    expect(countOf(storage, 'normalizeDraftImageList(')).toBeGreaterThanOrEqual(2);
  });
});

/**
 * 跨设备 / 跨实例的僵尸草稿闸门（2026-10-29 第二轮）。
 *
 * 上一轮修的是"同一台设备内被另一个实例写回"。仍然剩下的形态是：设备 A 删掉草稿，
 * 设备 B 还留着旧副本 —— B 打开论坛时 `getForumPostDraft` 返回 null（行已被硬删），
 * 旧实现把它当作"云端还没同步过"，直接把旧文字 upsert 回去，于是又活了。
 *
 * 闸门是「本机有没有**没同步成功**的改动」这个事实标记（`_pending_push`）：
 *   · 只在用户主动保存时置位；云端写成功 / 用户删草稿时清掉；
 *   · 恢复时云端没有草稿，**且**本机没有该标记 ⇒ 云端是被别处删过的，本机副本
 *     只留在本地给用户看，绝不回写。
 */
describe('cross-device zombie draft gate (_pending_push)', () => {
  it('gates every "push local draft to cloud" branch on the pending-push marker', async () => {
    const code = await readCode(FORUM_MAIN);
    const body = sliceFromDeclaration(code, 'const restorePostDraft = async', 5000);

    expect(
      body.indexOf('const canPushLocal = readDraftPendingPush() > 0'),
      'restore 必须先读 pending 标记',
    ).toBeGreaterThan(-1);
    /* 只断言"标记读得比回写早"是不够的 —— 撤回条件里的 canPushLocal、只留一个孤零零的
       读取，那种改法照样能过（实测过，假绿）。所以两件事一起断言：
         ① 出现次数必须是 3 = 声明 1 + 两条分支各用 1，少一处就说明有个分支裸奔了；
         ② 每个回写点**就近**必须能看到它。 */
    const pushSites = [...body.matchAll(/savePostDraftToDatabase\(localBest\)/g)].map(
      (m) => m.index,
    );
    expect(pushSites.length).toBe(2); // 云端无草稿 + 本机更新，两条分支各一处
    expect(countOf(body, 'canPushLocal')).toBe(3);
    pushSites.forEach((index) => {
      const window = body.slice(Math.max(0, index - 300), index);
      expect(window, `第 ${index} 处回写没有 canPushLocal 守卫`).toContain('canPushLocal');
    });
  });

  it('marks pending push on a local save and clears it on delete', async () => {
    const code = await readCode(FORUM_MAIN);
    const persist = sliceFromDeclaration(code, 'const persistPostDraft =', 1400);
    // 本地先落盘、云端 900ms 后同步：中间关掉页面也算"欠云端一次写入"
    expect(persist).toContain('markDraftPendingPush()');
    const save = sliceFromDeclaration(code, 'const savePostDraftToDatabase =', 1800);
    // 删除成功与 upsert 成功两条都要清（清完才允许下一次"本机覆盖云端"）
    expect(countOf(save, 'clearDraftPendingPush(')).toBe(2);
  });

  it('clears the marker inside the storage layer when the local draft is removed', async () => {
    const storage = await readCode(DRAFT_STORAGE);
    const writer = storage.slice(storage.indexOf('const writeLocalPostDraft ='));
    // 单点收口：清本地草稿 ⇒ 一定没有待同步改动。放在这一处，调用点漏一个也不会留后门。
    expect(writer).toContain('clearDraftPendingPush()');
    expect(writer.indexOf('clearDraftPendingPush()')).toBeLessThan(
      writer.indexOf('localStorage.setItem(getDraftStorageKey()'),
    );
  });

  it('verifies the delete actually removed a row instead of trusting a silent RLS no-op', async () => {
    const api = squeezeSource(
      stripComments(
        await readFile(new URL('../../src/utils/api/forum/post-api.js', import.meta.url), 'utf8'),
      ),
    );
    const body = sliceFromDeclaration(api, 'export async function deleteForumPostDraft', 1600);
    // delete 必须带上 select 才能拿到影响行数（否则 RLS 挡掉也返回 ok）
    expect(body).toMatch(/\.delete\(\)[\s\S]{0,120}\.select\(/);
    expect(body).toContain('data.length === 0');
  });
});

/**
 * 发帖「永久卡住」的看门狗（2026-10-29）。
 *
 * `entry.promise` 失败时自己会吞掉错误，所以它唯一的坏形态是**永不 settle**：
 * 压缩卡住 / 检测模型加载挂住 / 上传请求被系统挂起。那时 `runPublishQueue` 永久停在
 * await 上 —— 岛显示"发送中"、进度不动、没有按钮可点，后面排队的帖也一起冻死。
 */
describe('publish pipeline stall watchdog', () => {
  it('waits on the watchdog wrapper, not the raw pipeline promise', async () => {
    // 看门狗与 processPublishImagesForQueue 随发布链路搬到
    // composables/useForumPublishQueue.js（2026-10-30）。断言对象跟着搬，
    // 免得「切片取不到 → 找不到声明」直接红，或者更糟：改成跳过而假绿。
    const code = await readCode(PUBLISH_QUEUE);
    const body = sliceFromDeclaration(code, 'const processPublishImagesForQueue =', 9000);
    expect(body).toContain('awaitPipelineSettled(entry');
    // 裸 await entry.promise 会绕过看门狗（同类泄漏点只允许 0 处）
    expect(countOf(body, 'await entry.promise')).toBe(0);
    // 看门狗声明在函数之前（同文件顶层），所以对整段源码断言存在性
    expect(code).toContain('const awaitPipelineSettled =');
    // 卡死的管线必须从 map 里摘掉，否则重试直接复用同一条死 promise
    expect(sliceFromDeclaration(code, 'const awaitPipelineSettled =', 1400)).toContain(
      'cancelDraftImagePipeline(uploadId)',
    );
  });
});

describe('slow-network upload timeout', () => {
  it('resets the upload timeout on progress instead of using a fixed total budget', async () => {
    const source = squeezeSource(
      stripComments(
        await readFile(new URL('../../src/utils/cloudinary-client.js', import.meta.url), 'utf8'),
      ),
    );
    const body = sliceFromDeclaration(source, 'function uploadFormDataWithProgress', 2200);
    // 固定 30s 总时长在 3G 上必失败（2MB @ 100KB/s 就要 20s+），改成空闲超时
    expect(body).toContain('armIdleTimer');
    expect(body).toContain('IDLE_TIMEOUT_MS');
    expect(body).toContain('HARD_TIMEOUT_MS');
    // 两处调用：请求发出前起表（TCP/TLS 阶段没有 progress 事件）+ 每次进度前进重置
    expect(countOf(body, 'armIdleTimer()')).toBeGreaterThanOrEqual(2);
  });
});
