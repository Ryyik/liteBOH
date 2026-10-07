import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  filterRecentForumPosts,
  sortForumPostsByCreatedAtDesc,
} from '../../src/views/BOHAI/composables/useForumSummary.js';
// 源码守卫断言必须格式宽容：prettier 会把长行拆行、给末项补尾逗号，
// 逐字断言会因此假红（本文件 2026-09-28 就被咬过一次）。详见 helpers/source.js。
import { squeezeSource, flattenSource, scriptSection, stripComments } from '../helpers/source.js';

const sidebarPath = resolve(
  import.meta.dirname,
  '../../src/views/BOHAI/BOHAI/components/BohaiSidebar.vue',
);
const mainPath = resolve(import.meta.dirname, '../../src/views/BOHAI/BOHAI/BOHAIMain.vue');
const enginePath = resolve(
  import.meta.dirname,
  '../../src/views/BOHAI/composables/useChatEngine.js',
);
const memoryCapturePath = resolve(
  import.meta.dirname,
  '../../src/views/BOHAI/composables/useMemoryCapture.js',
);
// plans/025 v2 · Step 5-1：四条前置捷径已从 useChatEngine 抽到 engine/stages/shortcuts.ts
const shortcutsPath = resolve(
  import.meta.dirname,
  '../../src/views/BOHAI/engine/stages/shortcuts.ts',
);
const cloudApiPath = resolve(import.meta.dirname, '../../src/utils/api/boh-cloud-api.js');
// 2026-10-03（plans/023 步骤 ④）：AiQuotaSidePanel.vue 已退役，用量信息整体搬进
// BohaiSettingsPanel 的「用量」卡 —— 断言随之改读设置面板（否则 readFileSync 直接抛错）。
const quotaPanelPath = resolve(
  import.meta.dirname,
  '../../src/views/BOHAI/BOHAI/components/BohaiSettingsPanel.vue',
);

describe('BOH AI quick sidebar visibility', () => {
  it('unmounts the overlay sidebar when its model is closed', () => {
    const source = squeezeSource(readFileSync(sidebarPath, 'utf8'));
    expect(source).toContain('v-if="isComponentVisible && isOpen"');
    expect(source).not.toContain('v-show="isComponentVisible && (!overlayMode || isOpen)"');
  });
});

describe('BOH AI standalone workspace', () => {
  it('uses one sidebar trigger and renders settings inside the workspace', () => {
    const sidebar = squeezeSource(readFileSync(sidebarPath, 'utf8'));
    const main = squeezeSource(
      readFileSync(
        resolve(import.meta.dirname, '../../src/views/BOHAI/BOHAI/BOHAIMain.vue'),
        'utf8',
      ),
    );
    expect(sidebar).toContain('v-if="!isOpen && showOpenButton"');
    // 2026-09-30（plans/023 步骤 ③）：独立页顶栏已删除，而它原本是独立页**唯一**的侧栏展开入口
    // （侧栏自己的 sidebar-open-btn 在独立页被 showOpenButton=false + 一条 display:none 双重藏掉）。
    // 所以 show-open-button 必须对独立页放开，只在 overlay 模式关闭，否则收起侧栏后再也打不开。
    expect(main).toContain(':show-open-button="!props.overlayMode"');
    expect(main).toContain(':embedded="props.overlayMode || isStandalone"');
    // 顶栏必须真的删干净：只要它回来，「唯一入口」就变成两处并存，上面那条契约就失去意义。
    expect(main).not.toContain('full-ai-toolbar');
  });
});

describe('BOH AI motion system', () => {
  it('covers core interactions and respects reduced motion', () => {
    const motion = squeezeSource(
      readFileSync(
        resolve(import.meta.dirname, '../../src/views/BOHAI/BOHAI/styles/motion-system.css'),
        'utf8',
      ),
    );
    expect(motion).toContain('bohai-message-enter');
    expect(motion).toContain('bohai-composer-enter');
    expect(motion).toContain('bohai-menu-enter');
    expect(motion).toContain('prefers-reduced-motion: reduce');
  });

  it('renders Community Searching with the Web Searching animation contract', () => {
    const main = squeezeSource(readFileSync(mainPath, 'utf8'));
    const engine = squeezeSource(readFileSync(enginePath, 'utf8'));
    const messages = squeezeSource(
      readFileSync(
        resolve(import.meta.dirname, '../../src/views/BOHAI/BOHAI/styles/messages.css'),
        'utf8',
      ),
    );
    expect(main).toContain('Community Searching');
    expect(main).toContain('class="web-searching-status community-searching-status"');
    expect(main).toContain('正在检索可信网页');
    expect(main).toContain('正在读取近日帖子');
    expect(main).toContain('searching-status-track');
    expect(main).not.toContain('web-searching-mark');
    expect(messages).toContain('@keyframes searchingTextFlow');
    expect(messages).toContain('@keyframes searchingTrackFlow');
    expect(messages).toContain('background-clip: text');
    // prettier 会把 `Boolean(` 后的实参断到下一行，压成单空格后是 `Boolean( communityNeeds…`
    // （`(` 后多一个空格），还原不掉 → 这处必须用「全空白移除」归一。详见 helpers/source.js。
    expect(flattenSource(readFileSync(enginePath, 'utf8'))).toContain(
      flattenSource(
        'communitySearchActive.value = Boolean(communityNeedsEvidence || isForumSearchEnabled.value)',
      ),
    );
    expect(engine).toContain('communitySearchActive.value = false');
  });

  it('renders a stateful task panel with progress and recovery controls', () => {
    const main = squeezeSource(readFileSync(mainPath, 'utf8'));
    expect(main).toContain('class="plan-todo-card task-panel"');
    expect(main).toContain('role="progressbar"');
    expect(main).toContain('taskPanelStatus');
    expect(main).toContain('已停止');
    expect(main).toContain('@click="stopTaskPanel"');
    expect(main).toContain('@click="retryTaskPanel"');
    expect(main).toContain('isPlanExperienceActive.value && planTodoItems.value.length > 0');
    expect(main).toContain('制定.{0,12}计划');
  });

  it('does not append retrieval success counts to visible action notes', () => {
    const main = squeezeSource(readFileSync(mainPath, 'utf8'));
    const engine = squeezeSource(readFileSync(enginePath, 'utf8'));
    expect(main).toContain('!/^(?:检索了|搜索了)/u.test(note)');
    expect(engine).not.toContain('[results.length > 0 ? `搜索了 ${results.length} 个内容。`');
    expect(engine).not.toContain('buildBohAIConnectorActionNote(successfulConnectorResults)');
  });

  it('includes a personal Cloud+ shortcut command', () => {
    const main = squeezeSource(readFileSync(mainPath, 'utf8'));
    expect(main).toContain("keyword: 'cloud'");
    expect(main).toContain("label: '个人 Cloud+'");
    expect(main).toContain("command.action === 'cloud'");
    expect(main).toContain('<strong>个人 Cloud+</strong>');
    // 2026-09-30（plans/023）：顶部 composer-chip 开关行已删除，四个开关的入口
    // 统一搬进输入框右侧展开面板的「工具」组。原断言锁的是那行 chips 的 v-if 条件，
    // 条件随行一起消失 → 改锁新落点：面板工具行 + Cloud+ 的切换接线。
    expect(main).toContain('composer-panel-tool');
    expect(main).toContain('@click.stop="handleTreeholeMemoryToggle"');
  });
});

describe('BOH AI Cloud+ retrieval safety', () => {
  it('uses the unified request layer with a finite timeout', () => {
    const cloudApi = squeezeSource(readFileSync(cloudApiPath, 'utf8'));
    expect(cloudApi).toContain("'bohCloud.entriesForAI'");
    expect(cloudApi).toContain('timeoutMs: 9000');
    expect(cloudApi).toContain('retry: 0');
  });
});

describe('BOH AI quota visualization', () => {
  it('shows percentage and concrete token values in the settings usage card', () => {
    const quotaPanel = squeezeSource(readFileSync(quotaPanelPath, 'utf8'));
    expect(quotaPanel).toContain('ai-settings-usage-section');
    expect(quotaPanel).toContain('`${quotaPercentLabel}%`');
    expect(quotaPanel).toContain("'has-usage': quotaPercent > 0");
    expect(quotaPanel).toContain('Web Searching');
    expect(quotaPanel).toContain('webSearchRemaining');
    expect(quotaPanel).not.toContain('Math.round((quotaUsed.value / quotaLimit.value) * 100)');
  });

  // 退役的额度侧板必须真的删干净：只要接线回来，就说明用量出现了第二个入口。
  // 否定断言必须先排掉模板区、再剥注释 —— 两处新注释都「合法复述」了被删的写法
  // （模板里一句说明、script 里一句），直接在原文上断言会假红。见 helpers/source.js 文件头。
  it('retired AiQuotaSidePanel is gone from the workspace', () => {
    const main = stripComments(scriptSection(readFileSync(mainPath, 'utf8')));
    expect(main).not.toContain('AiQuotaSidePanel');
    expect(main).not.toContain('isQuotaPanelOpen');
  });

  it('subscribes to thinking state only after the chat engine is initialized', () => {
    const main = squeezeSource(readFileSync(mainPath, 'utf8'));
    expect(main.indexOf('watch(isThinking')).toBeGreaterThan(main.indexOf('} = useChatEngine();'));
  });
});

// 2026-10-04：读 Cloud+ 的「首次授权」闸门整条移除（用户口径：不再需要主动授权，直接可读）。
// 断言随之反转 —— 锁住「闸门不许回来」，同时确认是否读取只由个人记忆开关决定。
describe('BOH AI Cloud+ 读取（授权闸门已移除）', () => {
  it('不再有首次授权环节，是否读取只由个人记忆开关决定', () => {
    const memoryCapture = stripComments(scriptSection(readFileSync(memoryCapturePath, 'utf8')));
    const engine = stripComments(scriptSection(readFileSync(enginePath, 'utf8')));
    expect(memoryCapture).not.toContain('CLOUD_REFERENCE_CONSENT_KEY');
    expect(memoryCapture).not.toContain('refreshCloudReferenceConsent');
    expect(engine).not.toContain('cloudReferenceConsent');
    expect(engine).not.toContain('你此前已关闭 Cloud+ 隐私授权');
    expect(engine).toContain('cloudReferenceEnabled: Boolean(isTreeholeMemoryEnabled.value)');
    // 树洞回复路径仍在 —— Step 5-1 后该调用搬进 shortcuts stage（引擎只留 ctx 接线）
    const shortcuts = stripComments(readFileSync(shortcutsPath, 'utf8'));
    expect(shortcuts).toContain('handlePendingTreeholeCreationReply(userText)');
    expect(engine).toContain('handlePendingTreeholeCreationReply');
  });
});

describe('BOH AI recent community retrieval', () => {
  it('keeps only recent posts when the recent window has results', () => {
    const now = Date.parse('2026-07-16T12:00:00Z');
    const posts = [
      { id: 'old', created_at: '2026-05-01T12:00:00Z' },
      { id: 'new', created_at: '2026-07-15T12:00:00Z' },
    ];
    expect(filterRecentForumPosts(posts, { now, windowDays: 30 }).map((post) => post.id)).toEqual([
      'new',
    ]);
  });

  it('orders recent posts by publish time descending', () => {
    const sorted = sortForumPostsByCreatedAtDesc([
      { id: 'older', created_at: '2026-07-14T12:00:00Z' },
      { id: 'newer', created_at: '2026-07-16T10:00:00Z' },
    ]);
    expect(sorted.map((post) => post.id)).toEqual(['newer', 'older']);
  });
});
