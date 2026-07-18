import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { filterRecentForumPosts, sortForumPostsByCreatedAtDesc } from '../../src/views/BOHAI/composables/useForumSummary.js';

const sidebarPath = resolve(import.meta.dirname, '../../src/views/BOHAI/BOHAI/components/BohaiSidebar.vue');
const overlayPath = resolve(import.meta.dirname, '../../src/components/GlobalAiGlassOverlay.vue');
const mainPath = resolve(import.meta.dirname, '../../src/views/BOHAI/BOHAI/BOHAIMain.vue');
const enginePath = resolve(import.meta.dirname, '../../src/views/BOHAI/composables/useChatEngine.js');
const memoryCapturePath = resolve(import.meta.dirname, '../../src/views/BOHAI/composables/useMemoryCapture.js');
const cloudApiPath = resolve(import.meta.dirname, '../../src/utils/api/boh-cloud-api.js');
const quotaPanelPath = resolve(import.meta.dirname, '../../src/components/ai/AiQuotaSidePanel.vue');

describe('BOH AI quick sidebar visibility', () => {
  it('unmounts the overlay sidebar when its model is closed', () => {
    const source = readFileSync(sidebarPath, 'utf8');
    expect(source).toContain('v-if="isComponentVisible && isOpen"');
    expect(source).not.toContain('v-show="isComponentVisible && (!overlayMode || isOpen)"');
  });
});

describe('BOH AI portrait controls', () => {
  it('keeps settings visible and exposes pointer drag plus fullscreen fallback', () => {
    const source = readFileSync(overlayPath, 'utf8');
    expect(source).toContain('@pointerdown="onHandlePointerDown"');
    expect(source).toContain('global-ai-fullscreen-button');
    expect(source).toContain('.global-ai-header-actions .global-ai-full-page-button { display: none; }');
    expect(source).not.toContain('.global-ai-header-actions .global-ai-header-btn:nth-child(1) { display: none; }');
  });
});

describe('BOH AI standalone workspace', () => {
  it('uses one sidebar trigger and renders settings inside the workspace', () => {
    const sidebar = readFileSync(sidebarPath, 'utf8');
    const main = readFileSync(resolve(import.meta.dirname, '../../src/views/BOHAI/BOHAI/BOHAIMain.vue'), 'utf8');
    expect(sidebar).toContain('v-if="!isOpen && showOpenButton"');
    expect(main).toContain(':show-open-button="!isStandalone && !props.overlayMode"');
    expect(main).toContain(':embedded="props.overlayMode || isStandalone"');
  });
});

describe('BOH AI motion system', () => {
  it('covers core interactions and respects reduced motion', () => {
    const motion = readFileSync(resolve(import.meta.dirname, '../../src/views/BOHAI/BOHAI/styles/motion-system.css'), 'utf8');
    expect(motion).toContain('bohai-message-enter');
    expect(motion).toContain('bohai-composer-enter');
    expect(motion).toContain('bohai-menu-enter');
    expect(motion).toContain('prefers-reduced-motion: reduce');
  });

  it('renders Community Searching with the Web Searching animation contract', () => {
    const main = readFileSync(mainPath, 'utf8');
    const engine = readFileSync(enginePath, 'utf8');
    const messages = readFileSync(resolve(import.meta.dirname, '../../src/views/BOHAI/BOHAI/styles/messages.css'), 'utf8');
    expect(main).toContain('Community Searching');
    expect(main).toContain('class="web-searching-status community-searching-status"');
    expect(main).toContain('正在检索可信网页');
    expect(main).toContain('正在读取近日帖子');
    expect(main).toContain('searching-status-track');
    expect(main).not.toContain('web-searching-mark');
    expect(messages).toContain('@keyframes searchingTextFlow');
    expect(messages).toContain('@keyframes searchingTrackFlow');
    expect(messages).toContain('background-clip: text');
    expect(engine).toContain('communitySearchActive.value = Boolean(communityNeedsEvidence || isForumSearchEnabled.value)');
    expect(engine).toContain('communitySearchActive.value = false');
  });

  it('renders a stateful task panel with progress and recovery controls', () => {
    const main = readFileSync(mainPath, 'utf8');
    expect(main).toContain('class="plan-todo-card task-panel"');
    expect(main).toContain('role="progressbar"');
    expect(main).toContain('taskPanelStatus');
    expect(main).toContain('等待确认');
    expect(main).toContain('已停止');
    expect(main).toContain('@click="stopTaskPanel"');
    expect(main).toContain('@click="retryTaskPanel"');
    expect(main).toContain('isPlanExperienceActive.value && planTodoItems.value.length > 0');
    expect(main).toContain('制定.{0,12}计划');
  });

  it('does not append retrieval success counts to visible action notes', () => {
    const main = readFileSync(mainPath, 'utf8');
    const engine = readFileSync(enginePath, 'utf8');
    expect(main).toContain("!/^(?:检索了|搜索了)/u.test(note)");
    expect(engine).not.toContain('[results.length > 0 ? `搜索了 ${results.length} 个内容。`');
    expect(engine).not.toContain('buildBohAIConnectorActionNote(successfulConnectorResults)');
  });

  it('includes a personal Cloud+ shortcut command', () => {
    const main = readFileSync(mainPath, 'utf8');
    expect(main).toContain("keyword: 'cloud'");
    expect(main).toContain("label: '个人 Cloud+'");
    expect(main).toContain("command.action === 'cloud'");
    expect(main).toContain('<strong>个人 Cloud+</strong>');
    expect(main).toContain('isSearching || isForumSearchEnabled || isTreeholeMemoryEnabled');
  });
});

describe('BOH AI Cloud+ retrieval safety', () => {
  it('uses the unified request layer with a finite timeout', () => {
    const cloudApi = readFileSync(cloudApiPath, 'utf8');
    expect(cloudApi).toContain("'bohCloud.entriesForAI'");
    expect(cloudApi).toContain('timeoutMs: 9000');
    expect(cloudApi).toContain('retry: 0');
  });
});

describe('BOH AI quota visualization', () => {
  it('shows percentage and concrete token values in the quota panel', () => {
    const quotaPanel = readFileSync(quotaPanelPath, 'utf8');
    expect(quotaPanel).toContain('usage-section');
    expect(quotaPanel).toContain('`${barPercentLabel}%`');
    expect(quotaPanel).toContain("'has-usage': usedTokens > 0");
    expect(quotaPanel).toContain('Web Searching');
    expect(quotaPanel).toContain('webSearchRemaining');
    expect(quotaPanel).not.toContain('Math.round((usedTokens.value / tokenLimit.value) * 100)');
  });
});

describe('BOH AI Cloud+ consent', () => {
  it('persists consent per account and refreshes it before routing', () => {
    const memoryCapture = readFileSync(memoryCapturePath, 'utf8');
    const engine = readFileSync(enginePath, 'utf8');
    expect(memoryCapture).toContain('`${CLOUD_REFERENCE_CONSENT_KEY}:${safeUserId}`');
    expect(memoryCapture).toContain('refreshCloudReferenceConsent()');
    expect(engine).toContain('refreshCloudReferenceConsent();');
    expect(engine).toContain("cloudReferenceConsent.value === 'denied'");
    expect(engine).toContain('你此前已关闭 Cloud+ 隐私授权');
    expect(engine).toContain('handlePendingCloudReferenceConsentReply(userText)');
    expect(engine).toContain('handlePendingTreeholeCreationReply(userText)');
  });
});

describe('BOH AI recent community retrieval', () => {
  it('keeps only recent posts when the recent window has results', () => {
    const now = Date.parse('2026-07-16T12:00:00Z');
    const posts = [
      { id: 'old', created_at: '2026-05-01T12:00:00Z' },
      { id: 'new', created_at: '2026-07-15T12:00:00Z' }
    ];
    expect(filterRecentForumPosts(posts, { now, windowDays: 30 }).map((post) => post.id)).toEqual(['new']);
  });

  it('orders recent posts by publish time descending', () => {
    const sorted = sortForumPostsByCreatedAtDesc([
      { id: 'older', created_at: '2026-07-14T12:00:00Z' },
      { id: 'newer', created_at: '2026-07-16T10:00:00Z' }
    ]);
    expect(sorted.map((post) => post.id)).toEqual(['newer', 'older']);
  });
});
