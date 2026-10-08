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
  '../../src/views/BOHAI/BOHAI/components/BohSidebar.vue',
);
const mainPath = resolve(import.meta.dirname, '../../src/views/BOHAI/BOHAI/BOHAIMain.vue');
// plans/025 v2 · Step 6：UI 树重写为 `Boh*` 组件 ⇒ 消息流 / 输入区 / Work 面板的
// 源码守卫必须**改指新文件**（旧 messages.css / adaptive-layout.css 等 5 个样式文件已删）。
const streamPath = resolve(
  import.meta.dirname,
  '../../src/views/BOHAI/BOHAI/components/BohChatStream.vue',
);
const streamCssPath = resolve(
  import.meta.dirname,
  '../../src/views/BOHAI/BOHAI/components/styles/boh-stream.css',
);
const composerPath = resolve(
  import.meta.dirname,
  '../../src/views/BOHAI/BOHAI/components/BohComposer.vue',
);
const layoutCssPath = resolve(import.meta.dirname, '../../src/views/BOHAI/BOHAI/styles/layout.css');
const tokensCssPath = resolve(import.meta.dirname, '../../src/views/BOHAI/BOHAI/styles/tokens.css');
const enginePath = resolve(
  import.meta.dirname,
  '../../src/views/BOHAI/composables/useChatEngine.js',
);
// Step 5-2：`communitySearchActive` 的赋值随「检索主体」搬进该 stage
const retrievalStagePath = resolve(
  import.meta.dirname,
  '../../src/views/BOHAI/engine/stages/retrieval.ts',
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
  it('侧栏里的定宽块不吃水平外距（否则被 overflow 裁断）', () => {
    // 2026-10-08：`.boh-sidebar > * { min-width: var(--boh-sidebar-w) }` 算的是元素**自身**
    // 宽度、不含水平外距 ⇒ 带 `margin: 0 12px` 的新对话 / 搜索条各宽出 24px，被侧栏的
    // `overflow: hidden` 从右边裁断（用户报「新对话和搜索的条有超出」）。
    // 运行时几何由 probe-bohai-shell 的「侧栏子元素不水平溢出」兜底，这里锁源码侧修正。
    const css = readFileSync(
      resolve(import.meta.dirname, '../../src/views/BOHAI/BOHAI/components/styles/boh-sidebar.css'),
      'utf8',
    );
    expect(css).toContain('calc(var(--boh-sidebar-w) - 24px)');
    const shrinkRule = css.match(/\.boh-new-chat,[\s\S]{0,120}?\.boh-sb-search[\s\S]{0,200}?\}/);
    expect(shrinkRule, '未找到收紧「新对话 / 搜索条」宽度的规则').not.toBeNull();
    expect(shrinkRule[0]).toContain('calc(var(--boh-sidebar-w) - 24px)');
  });

  it('左下角账号入口：头像 + 名称，hover / 点击都出额度与订阅浮层', () => {
    // 2026-10-08 用户口径：「左下角改为显示用户头像和名称，hover 和点击都会出现额度和订阅计划」。
    const sidebar = readFileSync(sidebarPath, 'utf8');
    expect(sidebar).toContain('boh-account-btn');
    expect(sidebar).toContain('boh-account-pop');
    expect(sidebar).toContain("emit('upgrade')");
    // 壳要传账号与套餐（侧栏自己不取数、不打接口）
    const main = readFileSync(mainPath, 'utf8');
    expect(main).toContain(':account="sidebarAccount"');
    expect(main).toContain(':plan="sidebarPlan"');
    expect(main).toContain('@upgrade="goUpgradePlan"');
    // ⚠️ 点击必须是「打开并保持」，不能翻转 —— 鼠标要点到按钮必然先 hover 一次，
    // 那次 hover 已经把浮层打开了，再翻转就变成「点一下反而关掉」（实测踩过）。
    expect(sidebar).toContain('handleAccountClick');
    expect(sidebar).not.toContain('accountPopOpen.value = !accountPopOpen.value');
  });

  it('unmounts the overlay sidebar when its host is hidden', () => {
    const source = squeezeSource(readFileSync(sidebarPath, 'utf8'));
    // 侧栏 Teleport 到 body ⇒ 父容器 display:none 管不到它，必须由壳把「宿主是否可见」
    // 传进来做 v-if（原 `isComponentVisible && isOpen` 的同一件事，改成新 prop 口径）。
    expect(source).toContain('v-if="visible"');
    expect(source).not.toContain('v-show="visible');
    // 岛形态下侧栏根本不渲染（旧做法是 BOHAIIsland 里用 :global() 藏，已随旧 DOM 删除）。
    // 2026-10-08：**打开设置时也不渲染** —— 设置已重写为「全屏设置页」，会话侧栏必须让位。
    // 旧实现遮罩是 z-index 300、会话侧栏是 2147483450，实测侧栏稳稳盖在设置上面
    // （用户原话「设置面板打开会覆盖所有内容并且侧边栏依然存在」）。
    const main = squeezeSource(readFileSync(mainPath, 'utf8'));
    expect(main).toContain(squeezeSource('<BohSidebar v-if="!props.overlayMode && !settingsOpen"'));
    expect(main).toContain(':visible="isComponentVisible"');
  });
});

describe('BOH AI standalone workspace', () => {
  it('uses one sidebar trigger and renders settings inside the workspace', () => {
    const main = squeezeSource(readFileSync(mainPath, 'utf8'));
    // 独立页的侧栏展开入口**只有一个**：主区右上角的浮动「打开侧栏」按钮
    // （2026-10-08 删掉整条顶栏后它就落在这里；岛形态不渲染）。
    // 旧实现是「侧栏自带 sidebar-open-btn + 顶栏」，删顶栏时踩过「收起后永久打不开」，
    // 现在反向锁：侧栏里**不许**再有第二个入口。
    const sidebar = squeezeSource(readFileSync(sidebarPath, 'utf8'));
    expect(sidebar).not.toContain('sidebar-open-btn');
    expect(sidebar).not.toContain('showOpenButton');
    expect(main).toContain('boh-float-actions');
    expect(main).toContain('title="打开侧栏"');
    expect(main).toContain('@click="toggleSidebar"');
    expect(main).toContain('<BohaiSettingsPanel');
    expect(main).toContain(':embedded="props.overlayMode || isStandalone"');
    // 设置面板：独立页要铺满**视口**（`fullscreen`）—— 否则 `.bohai-page` 那条 88px 的
    // 左栏避让 padding 会让全屏面板左边露出一条底色。
    expect(main).toContain(':fullscreen="isStandalone"');
    // 旧顶栏必须真的删干净：只要它回来，「唯一入口」就变成两处并存，上面那条契约就失去意义。
    expect(main).not.toContain('full-ai-toolbar');
    expect(main).not.toContain('bohai-container');
    expect(main).not.toContain('boh-topbar');
  });
});

describe('BOH AI motion system', () => {
  it('covers core interactions and respects reduced motion', () => {
    // 时长唯一真源 = 令牌（旧 motion-system.css 已删）
    const tokens = squeezeSource(readFileSync(tokensCssPath, 'utf8'));
    expect(tokens).toContain('--boh-dur-fast');
    expect(tokens).toContain('--boh-dur-med');
    expect(tokens).toContain('--boh-dur-bob');
    expect(tokens).toContain('--boh-dur-spin');
    expect(tokens).toContain('--boh-dur-breath');
    // 降级：只把令牌归零，不写 !important（棘轮 + DESIGN §0.1）
    const layout = squeezeSource(readFileSync(layoutCssPath, 'utf8'));
    expect(layout).toContain('prefers-reduced-motion: reduce');
    expect(layout).not.toMatch(/prefers-reduced-motion[\s\S]{0,400}!/);
    // 全仓三处循环动画：搜索文字流光（2026-10-08 由滑动进度条改版）/ 集群进度转圈 / **思考圆点呼吸**
    const streamCss = squeezeSource(readFileSync(streamCssPath, 'utf8'));
    expect(streamCss).toContain('@keyframes boh-search-shimmer');
    // 2026-10-08 用户拍板：「思考状态依旧保持旧版圆点」⇒ 形状与动画必须逐字沿用旧口径，
    // 不许换成 Demo 的三点打字动画。
    expect(streamCss).toContain('@keyframes boh-thinking-breath');
    expect(streamCss).not.toContain('@keyframes boh-bob');
    const streamSrc = squeezeSource(readFileSync(streamPath, 'utf8'));
    expect(streamSrc).toContain('class="boh-thinking-dot"');
  });

  it('快捷对话跳转条：常态只剩竖条，hover 才展开摘要', () => {
    // 2026-10-08 用户口径：「侧边改成 hover 才显示消息，普通就是一个条」。
    // 运行时判据实测过（常态 navW≈25 / hover≈148），但因要造会话，未固化成探针；
    // 这里锁源码契约，用宽松正则容忍 prettier 的空白重排。
    const css = readFileSync(streamCssPath, 'utf8');
    // 常态把摘要折叠到 0 宽 —— 用 max-width 才可过渡（display:none / width:auto 都不行）
    expect(css).toMatch(/\.boh-jump-label\s*\{[^}]*max-width:\s*0/);
    // hover 与键盘聚焦都要展开（键盘用户同样得看到摘要）
    expect(css).toMatch(/\.boh-jump:hover\s+\.boh-jump-label/);
    expect(css).toMatch(/\.boh-jump:focus-within\s+\.boh-jump-label/);
    // 触屏没有 hover ⇒ 卡片与摘要都必须常驻，否则退化成几根对不上内容的横条
    expect(css).toMatch(/@media\s*\(hover:\s*none\)/);
    // 2026-10-08 二次调整（用户给了目标图）：条改成**扁横条**，当前项走品牌蓝单一源
    expect(css).toMatch(/\.boh-jump-mark\s*\{[^}]*width:\s*16px[^}]*height:\s*3px/);
    expect(css).toMatch(
      /\.boh-jump-item\.is-active\s+\.boh-jump-mark\s*\{[^}]*var\(--boh-brand-blue/,
    );
    // hover 时整列聚成**一枚卡片**：底色与投影挂在 .boh-jump 本体上，不在单项上画药丸
    expect(css).toMatch(/\.boh-jump:hover[\s\S]{0,60}background:\s*var\(--boh-bg-page\)/);
  });

  it('renders Community Searching with the Web Searching animation contract', () => {
    const main = squeezeSource(readFileSync(mainPath, 'utf8'));
    const engine = squeezeSource(readFileSync(enginePath, 'utf8'));
    const stream = squeezeSource(readFileSync(streamPath, 'utf8'));
    const streamCss = squeezeSource(readFileSync(streamCssPath, 'utf8'));
    expect(stream).toContain('Community Searching');
    expect(stream).toContain('aria-label="Web Searching"');
    expect(stream).toContain('aria-label="Community Searching"');
    // 2026-10-08 二次改版（参考 Grok）：纯文本活动行 —— 「网页搜索」四字 + 流动光效，
    // 卡片框与滑动进度条（.boh-search-pill / .boh-search-track）整体退役
    expect(stream).toContain('正在读取近日帖子');
    expect(streamCss).toContain('@keyframes boh-search-shimmer');
    expect(streamCss).not.toContain('boh-search-pill');
    expect(streamCss).not.toContain('boh-search-track');
    // 状态源仍在引擎侧（`webSearchActive` / `communitySearchActive` 由壳透传给消息流）
    expect(main).toContain(':web-search-active="webSearchActive"');
    expect(main).toContain(':community-search-active="communitySearchActive"');
    // prettier 会把 `Boolean(` 后的实参断到下一行，压成单空格后是 `Boolean( communityNeeds…`
    // （`(` 后多一个空格），还原不掉 → 这处必须用「全空白移除」归一。详见 helpers/source.js。
    //
    // Step 5-2：这段随「检索主体」搬进 engine/stages/retrieval.ts ⇒ 守卫改指新文件；
    // 同时保留一条「壳仍接线」断言（引擎里必须调用该 stage）。
    const retrievalStage = flattenSource(readFileSync(retrievalStagePath, 'utf8'));
    expect(retrievalStage).toContain(
      flattenSource(
        'deps.communitySearchActive.value = Boolean(deps.communityNeedsEvidence || deps.isForumSearchEnabled.value)',
      ),
    );
    expect(retrievalStage).toContain(flattenSource('deps.communitySearchActive.value = false'));
    expect(engine).toContain('runRetrievalStage(');
  });

  it('联网搜索：默认折叠 + 标题轮换；黑点搜索期不显示、思考/回复才显示', () => {
    const main = squeezeSource(readFileSync(mainPath, 'utf8'));
    const engine = squeezeSource(readFileSync(enginePath, 'utf8'));
    const stream = squeezeSource(readFileSync(streamPath, 'utf8'));
    const streamCss = squeezeSource(readFileSync(streamCssPath, 'utf8'));

    // 数据链路：结果清单真源在 useWebSearchLifecycle → 引擎返回 → 壳透传给消息流
    expect(engine).toContain('webSearchResults');
    expect(main).toContain(':web-search-results="webSearchResults"');
    // 面板：折叠头 + 展开清单 + 轮换行（淡入动画挂在 :key 重放上）；
    // 2026-10-08 三次改版：纯文本行 + 检索期流光（.is-shimmer），不再有卡片框
    expect(stream).toContain('class="boh-search-head"');
    expect(stream).toContain('boh-search-pages');
    expect(stream).toContain('boh-search-line');
    expect(stream).toContain("'is-shimmer': webSearchActive");
    expect(streamCss).toContain('@keyframes boh-search-fade');
    expect(streamCss).toMatch(/\.boh-search-line\s*\{[^}]*text-overflow:\s*ellipsis/);

    // 黑点分相（2026-10-08 用户口径）：联网搜索在途必须无黑点；思考（isThinking）与
    // 回复（isLoading，流式期 isThinking 已翻 false）都要有黑点。
    // ⚠️ communitySearchActive 不进门控 —— 它挂到整轮结束，进门控会让社区类问题黑点全灭。
    const dotGuard = stream.match(/const showThinkingDot = \(index\) =>[\s\S]*?;/) || [];
    expect(dotGuard[0]).toContain('props.isThinking || props.isLoading');
    expect(dotGuard[0]).toContain('!props.webSearchActive');
    // 操作行跟着「整轮忙」走：忙（含搜索期）不渲染，避免流式期黑点与操作行同屏
    const busyGuard = stream.match(/const isGenerationBusy = \(index\) =>[\s\S]*?;/) || [];
    expect(busyGuard[0]).toContain('props.isThinking || props.isLoading');

    // 面板可见窗口挂**整轮生成**（isLoading）：只挂 webSearchActive 的话，标题出现的
    // 那一刻（请求返回）面板就消失，轮换根本看不见。
    const webGuard = stream.match(/const webActive = \(index, message\) =>[\s\S]*?;/) || [];
    expect(webGuard[0]).toContain('props.isLoading');
    expect(webGuard[0]).toContain('props.webSearchResults.length > 0');
  });

  it('renders a stateful task panel with progress and recovery controls', () => {
    const main = squeezeSource(readFileSync(mainPath, 'utf8'));
    const stream = squeezeSource(readFileSync(streamPath, 'utf8'));
    // 结构在消息流组件里
    expect(stream).toContain('class="boh-plan"');
    expect(stream).toContain('role="progressbar"');
    expect(stream).toContain("emit('stop-plan')");
    expect(stream).toContain("emit('retry-plan')");
    // 状态机（文案 / 进度 / 可见性）仍在壳里
    expect(main).toContain('taskPanelStatus');
    expect(main).toContain('已停止');
    expect(main).toContain('@stop-plan="stopTaskPanel"');
    expect(main).toContain('@retry-plan="retryTaskPanel"');
    expect(main).toContain('isPlanExperienceActive.value && planTodoItems.value.length > 0');
    expect(main).toContain('制定.{0,12}计划');
    expect(main).toContain(':plan-card="planCard"');
  });

  it('does not append retrieval success counts to visible action notes', () => {
    const stream = squeezeSource(readFileSync(streamPath, 'utf8'));
    const engine = squeezeSource(readFileSync(enginePath, 'utf8'));
    expect(stream).toContain('!/^(?:检索了|搜索了)/u.test(note)');
    expect(engine).not.toContain('[results.length > 0 ? `搜索了 ${results.length} 个内容。`');
    expect(engine).not.toContain('buildBohAIConnectorActionNote(successfulConnectorResults)');
  });

  it('includes a personal Cloud+ shortcut command', () => {
    const main = squeezeSource(readFileSync(mainPath, 'utf8'));
    const composer = squeezeSource(readFileSync(composerPath, 'utf8'));
    expect(main).toContain("keyword: 'cloud'");
    expect(main).toContain("label: '个人 Cloud+'");
    expect(main).toContain("command.action === 'cloud'");
    // 面板「高级」工具组的行文案搬进输入区组件
    expect(composer).toContain('<strong>个人 Cloud+</strong>');
    expect(composer).toContain('class="boh-mm-tool"');
    // 2026-09-30（plans/023）四个开关搬进输入框右侧展开面板；
    // 2026-10-08（plans/025 Step 6-4）面板整体重绘为 BohComposer ⇒ 断言改锁新落点：
    // 组件只发 kind，壳按 kind 分发到原有 handler。
    expect(composer).toContain("emit('toggle-tool', 'cloud')");
    expect(main).toContain("if (kind === 'cloud') handleTreeholeMemoryToggle();");
    expect(main).toContain('@toggle-tool="toggleTool"');
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
  it('用量卡只显示百分比：不再有 Token 绝对值，百分比与量程都来自口径单一真源', () => {
    const quotaPanel = squeezeSource(readFileSync(quotaPanelPath, 'utf8'));
    expect(quotaPanel).toContain('ai-settings-usage-section');
    // 2026-10-08 用户口径：「不再展示你还有多少 token，只用百分比」。
    // 第二版补充：主指标是**剩余**（Plus 尺子 ⇒ Max 没消耗显示 625%）。
    expect(quotaPanel).toContain('resolveAiQuotaDisplay');
    expect(quotaPanel).toContain('quotaRemainingLabel');
    expect(quotaPanel).toContain('今日剩余');
    // 剩余是 625% 这种三位数 ⇒ 条宽必须走归一值 meterPercent
    expect(quotaPanel).toContain('quotaMeterText');
    expect(quotaPanel).toContain("'has-usage': quotaDisplay.meterPercent > 0");
    expect(quotaPanel).toContain('warn: quotaDisplay.meterPercent >= 80');
    expect(quotaPanel).toContain('Web Searching');
    expect(quotaPanel).toContain('webSearchRemaining');
    // 否定断言分两路（同本文件上文 AiQuotaSidePanel 那条的理由：源码注释会「合法复述」
    // 被删的写法）：模板侧锁插值形态，脚本侧先剥注释。
    expect(quotaPanel).not.toContain('formatTokenCount(quotaUsed) }}');
    expect(quotaPanel).not.toContain('formatTokenCount(quotaRemaining) }}');
    const quotaCode = stripComments(scriptSection(readFileSync(quotaPanelPath, 'utf8')));
    expect(quotaCode).not.toContain('formatTokenCount(quotaUsed)');
    expect(quotaCode).not.toContain('Math.round((quotaUsed.value / quotaLimit.value) * 100)');
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
