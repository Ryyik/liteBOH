/**
 * 发帖草稿「单草稿 + 跨宿主同步」的**接线守卫**（2026-10-26）。
 *
 * 背景：产品定稿只有**一份云端草稿**（多版本草稿已整体移除），且论坛有两个宿主实例
 * （首页 `/` 非 keepAlive、UserSpace keepAlive + 分区壳 v-show 常驻）。这轮修掉的缺陷
 * 全都不是"算错了"，而是「两处该连着却没连」—— 广播发了没人听、面板不查云端、
 * beforeunload 短路在会话状态上、换账号不清内存副本。
 *
 * 判定逻辑已抽成 `isDraftInSyncWithEditor`，由 `forum-post-draft-storage.test.js` 覆盖；
 * 本文件只锁「谁调谁」与「多版本不许回流」。
 *
 * ⚠️ 断言一律走 `scriptSection` + `stripComments` + `squeezeSource`（见
 * tests/helpers/source.js）：ForumMain 的注释里会复述被修掉的旧写法，直接在原文上做
 * 否定断言会假红；而 prettier 重排会让逐字断言假红。
 */
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { scriptSection, squeezeSource, stripComments } from '../helpers/source.js';

const FORUM_MAIN = new URL('../../src/views/Forum/ForumMain.vue', import.meta.url);
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

describe('forum post draft cross-host sync wiring', () => {
  it('subscribes and unsubscribes the same listener (no leak), and ignores its own echo', async () => {
    const code = await readCode(FORUM_MAIN);
    const subscribe = squeezeSource(
      'window.addEventListener(FORUM_POST_DRAFT_CHANGE_EVENT, applyExternalDraftChange)',
    );
    const unsubscribe = squeezeSource(
      'window.removeEventListener(FORUM_POST_DRAFT_CHANGE_EVENT, applyExternalDraftChange)',
    );
    expect(code).toContain(subscribe);
    expect(code).toContain(unsubscribe);
    // 自己的广播又被自己处理一遍 = 无限回声，必须按 hostId 挡掉
    expect(code).toContain(squeezeSource('if (!detail || detail.hostId === draftHostId) return;'));
  });

  it('broadcasts on every mutation another host has to see', async () => {
    const code = await readCode(FORUM_MAIN);
    expect(countOf(code, "notifyDraftChange('save')")).toBeGreaterThanOrEqual(1);
    // 三处清空：清空草稿按钮 / 空内容保存 / 发布成功
    expect(countOf(code, "notifyDraftChange('clear')")).toBeGreaterThanOrEqual(3);
    // 本地恢复 + 云端恢复
    expect(countOf(code, "notifyDraftChange('restore")).toBeGreaterThanOrEqual(2);
  });

  it('opens the draft panel against the cloud copy, not just the local cache', async () => {
    const code = await readCode(FORUM_MAIN);
    const body = sliceFromDeclaration(code, 'const openMobileDraftPanel =', 900);
    // 打开面板必须做一次草稿对账（savedAt 合并），否则换设备/清过缓存时面板是假空
    expect(body).toContain(squeezeSource('restorePostDraft({ preserveLocalEdits: true })'));
  });

  it('beforeunload warns for desktop editors too (no mobile-session short circuit)', async () => {
    const code = await readCode(FORUM_MAIN);
    expect(code).not.toContain('!isMobileComposerOpen.value || !hasUnsavedChanges()');
    const body = sliceFromDeclaration(code, 'const handleBeforeUnload =', 900);
    expect(body).toContain('if (!isEditorDirty()) return;');
  });

  it('persistPostDraft keeps an existing draft when the editor only has images', async () => {
    const code = await readCode(FORUM_MAIN);
    const body = sliceFromDeclaration(code, 'const persistPostDraft =', 1600);
    const imageBranch = body.indexOf('if (postImages.value.length)');
    const clearCall = body.indexOf('writeLocalPostDraft(null)');
    expect(imageBranch, '缺"只有图片"分支 ⇒ 点保存会把草稿删掉').toBeGreaterThan(-1);
    expect(clearCall).toBeGreaterThan(imageBranch);
  });

  it('KeepAlive wake-up re-checks the draft without clobbering unsaved input', async () => {
    const code = await readCode(FORUM_MAIN);
    // 文件里有两组 onActivated/onDeactivated（先一组是 FAB 失活守卫），
    // 取**最后一组**：带 restore 的是 embedded（UserSpace）宿主的那对生命周期钩子。
    const start = code.lastIndexOf('onActivated(');
    const end = code.indexOf('onDeactivated(', start);
    expect(start).toBeGreaterThan(-1);
    expect(start).toBeLessThan(end);
    expect(code.slice(start, end)).toContain(
      squeezeSource('restorePostDraft({ preserveLocalEdits: true })'),
    );
  });

  it('treats closing with an emptied editor as an explicit draft deletion', async () => {
    const code = await readCode(FORUM_MAIN);
    const body = sliceFromDeclaration(code, 'const closeMobileComposer =', 2400);
    // 内容为空 + 仍有旧草稿 ⇒ 用户是"删光了再走"，删除意图必须落盘，
    // 否则下次挂载 restorePostDraft 又把草稿填回来（"我明明删了"）。
    expect(body).toContain(squeezeSource('} else if (savedPostDraft.value) {'));
    expect(body).toContain(squeezeSource('void clearPostDraft();'));
  });

  it('resets the in-memory editor when the account changes', async () => {
    const code = await readCode(FORUM_MAIN);
    // 1 处定义 + 登出 / 换账号 2 处调用
    expect(countOf(code, 'resetComposerEditorForAccountSwitch')).toBeGreaterThanOrEqual(3);
  });
});

describe('single-draft contract (no multi-version regression)', () => {
  it('has no draft-version machinery left in ForumMain (script or template)', async () => {
    const raw = await readFile(FORUM_MAIN, 'utf8');
    for (const forbidden of [
      'postDraftVersions',
      'restorePostDraftVersion',
      'rememberPostDraftVersion',
      'writePostDraftVersions',
      'readPostDraftVersions',
      'mobile-draft-version-list',
    ]) {
      expect(raw, `多版本草稿残留：${forbidden}`).not.toContain(forbidden);
    }
  });

  it('storage module exposes only the single-draft API', async () => {
    const code = await readCode(DRAFT_STORAGE);
    expect(code).toContain(
      squeezeSource("export const FORUM_POST_DRAFT_CHANGE_EVENT = 'boh:forum-post-draft-changed'"),
    );
    expect(code).toContain('export function isDraftInSyncWithEditor');
    for (const forbidden of ['postDraftVersions', 'rememberPostDraftVersion', 'versionLimit']) {
      expect(code, `storage 层残留多版本 API：${forbidden}`).not.toContain(forbidden);
    }
    // 旧版本缓存必须被主动清理（否则"只有一份草稿"在地面上失真）
    expect(code).toContain("endsWith('_versions')");
  });
});
