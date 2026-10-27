<template>
  <div ref="wrapEl" class="boh-composer-wrap" :class="{ 'is-island': overlayMode }">
    <!-- 折射级液态玻璃（覆盖层，§21.7）：玻璃 inset:0 垫在输入框之下、pointer-events:none；
         布局（max-width/margin）上移到锚，玻璃才与输入框等宽。回滚=删锚+玻璃两层。 -->
    <div class="boh-composer-anchor">
      <BohGlassRefract :radius="20" />
      <div ref="composerEl" class="boh-composer">
        <!-- 生成在途的边界光束（2026-10-25）：唯一的彩色元素，语义 = 「系统还在跑、可以打断」。
             必须是**第一个子元素**且不包 wrapper —— 理由见 BohBeam.vue / boh-beam.css 文件头。 -->
        <BohBeam :active="isLoading" />
        <!-- 附加的页面上下文（原 `.context-chip-row`） -->
        <div v-if="attachedContext" class="boh-ctx">
          <button
            type="button"
            class="boh-ctx-chip"
            title="点击移除附加的页面上下文"
            @click="emit('clear-context')"
          >
            <FileText :size="14" aria-hidden="true" />
            <span class="boh-ctx-label">{{ attachedTitle }}</span>
            <span class="boh-ctx-badge">AI 可见</span>
            <span class="boh-ctx-tokens">~{{ attachedContext.tokenEstimate || '?' }}</span>
            <X :size="13" aria-hidden="true" />
          </button>
        </div>

        <!-- 已开启开关的 chip 反馈（2026-10-16 用户口径：斜杠命令应用后，输入框里带着一个
             tag（如「官方记忆」），用户可以继续打字；且要**可以删除**——点 ×、或空输入框
             按 Backspace 删最右一个）。状态在壳里算（activeComposerFlags 单一真源），
             这里只渲染 + 发删除意图；与 `.boh-ctx` 同款位置（文字上方），不影响输入。 -->
        <div v-if="activeFlags.length" class="boh-flags" aria-label="已开启的检索开关">
          <button
            v-for="flag in activeFlags"
            :key="flag.id"
            type="button"
            class="boh-flag"
            :title="`${flag.label}已开启，对下一条消息生效；点击移除`"
            @click="emit('toggle-flag', flag.id)"
          >
            <i aria-hidden="true"></i>{{ flag.label }}<X :size="11" aria-hidden="true" />
          </button>
        </div>

        <!-- 斜杠命令：锚承载定位（无 z-index），玻璃与面板做兄弟（§21.7 采样根）；
             回滚 = 删锚 + 玻璃两层。 -->
        <div v-if="slashOpen" class="boh-slash-anchor">
          <!-- 2026-10-20：材质改为**面板自带**的方块之家标准液态玻璃
               （`--glass-bg` / `--glass-filter-sm`，见 CSS 同名注释）——
               不再挂 `BohGlassRefract` 覆盖层。两层玻璃叠在一起会让底下的
               backdrop-filter 采样重复，观感发灰。 -->
          <div class="boh-slash" role="listbox" aria-label="快捷命令">
            <!-- 2026-10-20 布局改版（用户口径：参考「分组标题 + 双列行」那种感觉）：
                 分组标题（灰色的组名）+ 每行「图标 名称 关键词 …… 右侧描述」。
                 ⚠️ 分组不是视觉分组，是**数据分组**：`group` 字段来自
                    `bohai-slash-commands.js`（单一真源），这里只做归并，
                    不许在模板里写死组名 —— 那样新增命令会悄悄落进错组。
                 ⚠️ `commandIndex` 仍是**全局序号**（跨组连续），因为它要和
                    `slashActiveIndex` 对齐；分组只影响渲染，不影响键盘上下选。 -->
            <template v-for="(group, groupIndex) in slashGroups" :key="`g-${group.name}`">
              <div v-if="groupIndex > 0" class="boh-slash-divider" aria-hidden="true"></div>
              <p class="boh-slash-group">{{ group.name }}</p>
              <button
                v-for="item in group.items"
                :key="item.command.id"
                type="button"
                class="boh-slash-item"
                :class="{ 'is-current': slashActiveIndex === item.index }"
                role="option"
                :aria-selected="slashActiveIndex === item.index"
                @mouseenter="emit('update:slashActiveIndex', item.index)"
                @mousedown.prevent="emit('run-slash-command', item.command)"
              >
                <span class="boh-slash-cmd">/{{ item.command.keyword }}</span>
                <span class="boh-slash-label">{{ item.command.label }}</span>
                <span class="boh-slash-desc">{{ item.command.description }}</span>
              </button>
            </template>
            <div v-if="slashCommands.length === 0" class="boh-slash-empty">没有匹配的命令</div>
          </div>
        </div>

        <textarea
          ref="textareaEl"
          class="boh-composer-input"
          :value="modelValue"
          rows="1"
          :disabled="isCompressing"
          :placeholder="placeholder"
          @input="onInput"
          @keydown="emit('keydown', $event)"
        ></textarea>

        <div class="boh-cp-toolbar">
          <button
            type="button"
            class="boh-cp-icon"
            :class="{ 'is-on': isSearching }"
            :aria-pressed="isSearching"
            :title="isSearching ? '联网搜索已开启，点击关闭' : '开启联网搜索'"
            @click="emit('toggle-search')"
          >
            <Globe :size="17" aria-hidden="true" />
          </button>

          <!-- 模型选择（2026-10-11 用户样稿：底行「模型名 ⌄」独立成一颗胶囊 + 一个玻璃浮层；
             胶囊样式沿用原 `.boh-mode-pill`，未改视觉。
             ⚠️ 三条契约：① 行按钮保留 `.boh-mm-item` + `data-mode-id`
             （probe-bohai-user-models B6/B11、probe-bohai-mode-loading 直接查 DOM）；
             ② `.boh-mm-body` 是**内层滚动容器**（矮横屏封顶的安全网），详情卡挂在它**外面**，
             否则会被 `overflow-y: auto` 裁掉；③ 面板改**左对齐**（触发键搬到了底行左侧），
             hover 详情卡随之镜像到面板**右侧**，越界时由 `is-flipped` 翻回左侧。 -->
          <div class="boh-mode-wrap" @click.stop>
            <button
              type="button"
              class="boh-mode-pill"
              :class="{ 'is-open': activeMenu === 'model' }"
              :title="`模型：${currentMode.name}`"
              :aria-expanded="activeMenu === 'model'"
              aria-haspopup="dialog"
              @click="toggleMenu('model')"
            >
              <Sparkles :size="13" class="boh-mode-pill-icon" aria-hidden="true" />
              <span class="boh-mode-pill-name">{{ currentMode.name }}</span>
              <ChevronDown :size="13" aria-hidden="true" />
            </button>

            <div class="boh-menu-anchor">
              <!-- 折射玻璃（v-if 与菜单同开同关；材质由它提供，CSS 六消费者段已让位） -->
              <BohGlassRefract v-if="activeMenu === 'model'" :radius="12" frosted />
              <Transition name="boh-pop">
                <div
                  v-show="activeMenu === 'model'"
                  class="boh-mode-menu"
                  role="dialog"
                  aria-label="选择模型"
                >
                  <div class="boh-mm-body">
                    <div v-if="modesLoading" class="boh-mm-loading" aria-live="polite">
                      <span
                        v-for="i in 3"
                        :key="`sk-${i}`"
                        class="boh-mm-skeleton"
                        :class="{ 'is-short': i === 3 }"
                      ></span>
                      <p>模式加载中…</p>
                    </div>
                    <div v-else-if="modes.length === 0" class="boh-mm-empty">暂无可用模式</div>
                    <div v-else class="boh-mm-rows">
                      <template v-for="(mode, index) in modes" :key="mode.id">
                        <!-- 2026-10-20（plans/030 §3.6）：单一列表，不分组。
                             策略行（sort_order=10）排在模型行（sort_order=100）之前，
                             两者交界处插一条 1px 分隔线 —— 不分组 ≠ 不加分隔，
                             没有它用户会困惑「Cost 和 GLM4Flash 有什么区别」。 -->
                        <div
                          v-if="
                            index > 0 && isStrategyRow(mode) !== isStrategyRow(modes[index - 1])
                          "
                          class="boh-mm-divider"
                          role="separator"
                          aria-hidden="true"
                        ></div>
                        <div
                          class="boh-mm-row"
                          @mouseenter="onModeRowEnter($event, mode)"
                          @mouseleave="scheduleCloseModeDetail()"
                        >
                          <button
                            type="button"
                            class="boh-mm-item"
                            :class="{
                              'is-on': currentModeId === mode.id,
                              'is-locked': isModeLocked(mode),
                            }"
                            :data-mode-id="mode.id"
                            :aria-current="currentModeId === mode.id"
                            :aria-disabled="isModeLocked(mode) ? 'true' : undefined"
                            :title="
                              isModeLocked(mode)
                                ? '登录后可使用'
                                : mode.tagline || mode.description || ''
                            "
                            @click="handleModeClick(mode, $event)"
                          >
                            <!-- 策略行带副标题（plans/030 §3.6）：用户看「Cost」不知道
                                 它和下面「GLM4Flash 0.5x」有什么区别，一句话说清定位。
                                 模型行不显示副标题 —— 名字本身就是模型名，再加描述是噪声。 -->
                            <span class="boh-mm-text">
                              <!-- 锁是**名字的后缀**，不是独立一列（2026-10-20 二改）。
                                   初版把它当第 4 个 flex 子项，被 space-between 挤到
                                   名字与倍率之间的空档里 —— 看起来像浮在行中间，
                                   既不像"这个名字被锁了"，也抢了倍率的视线。
                                   现在收进名字行内、紧跟名字之后，读作「Balance 🔒」。 -->
                              <span class="boh-mm-name-line">
                                <span class="boh-mm-name">{{ mode.name }}</span>
                                <Lock
                                  v-if="isModeLocked(mode)"
                                  :size="12"
                                  class="boh-mm-lock"
                                  aria-hidden="true"
                                />
                              </span>
                              <span v-if="isStrategyRow(mode) && mode.tagline" class="boh-mm-sub">{{
                                mode.tagline
                              }}</span>
                            </span>
                            <!-- ⚠️ 倍率位**始终存在**，锁定行也一样（2026-10-20 修正）：
                                 原先锁定行用 `.boh-mm-lock` 顶替倍率位，会让
                                 probe-bohai-composer 的 A2a「每行都有倍率」当场红 ——
                                 而那是既有契约（倍率是可比信息，不该因置灰而消失）。 -->
                            <span
                              class="boh-mm-rate"
                              :class="{ 'is-free': isFreeMode(mode) || mode.byok }"
                              >{{ formatModeRateLabel(mode) }}</span
                            >
                            <Check :size="15" class="boh-mm-chevron" aria-hidden="true" />
                          </button>
                        </div>
                      </template>
                    </div>
                    <button type="button" class="boh-mm-custom" @click="emit('open-settings')">
                      <Pencil :size="15" aria-hidden="true" />
                      <span>配置自定义模型</span>
                    </button>
                  </div>
                </div>
              </Transition>

              <!-- hover 详情卡：挪出面板的堆叠上下文（§21.11：面板 z20 会把采样裁到面板子树，
                   而卡整体悬在面板右外侧 ⇒ 留在面板里玻璃必死）。锚无 z-index、与面板同顶
                   （锚顶 = 面板顶，hoverTop 语义不变），玻璃与卡做兄弟；回滚 = 删锚 + 玻璃两层。 -->
              <div
                v-if="activeMenu === 'model' && hoverMode"
                class="boh-mm-detail-anchor"
                :class="{ 'is-flipped': hoverFlipped }"
                :style="{ top: `${hoverTop}px` }"
              >
                <BohGlassRefract :radius="12" frosted />
                <div
                  ref="hoverDetailEl"
                  class="boh-mm-detail"
                  role="group"
                  :aria-label="`模式详情：${hoverMode.name}`"
                  @mouseenter="cancelCloseModeDetail()"
                  @mouseleave="scheduleCloseModeDetail()"
                >
                  <div class="boh-mm-detail-name">{{ hoverMode.name }}</div>
                  <p v-if="hoverMode.description || hoverMode.tagline" class="boh-mm-detail-desc">
                    {{ hoverMode.description || hoverMode.tagline }}
                  </p>
                  <div class="boh-mm-detail-sep" aria-hidden="true"></div>
                  <div class="boh-mm-detail-row">
                    <span>消耗速度</span>
                    <b>{{ formatModeRateLabel(hoverMode) || '—' }}</b>
                  </div>
                  <button
                    type="button"
                    class="boh-mm-detail-use"
                    :disabled="currentModeId === hoverMode.id"
                    @click="pickMode(hoverMode.id)"
                  >
                    {{ currentModeId === hoverMode.id ? '当前模式' : '使用此模式' }}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- 工具（原「高级」四工具的落点，2026-10-11 从模式面板里独立出来） -->
          <div class="boh-tools-wrap" @click.stop>
            <button
              type="button"
              class="boh-tools-pill"
              :class="{ 'is-open': activeMenu === 'tools' }"
              title="工具"
              aria-label="工具"
              :aria-expanded="activeMenu === 'tools'"
              aria-haspopup="dialog"
              @click="toggleMenu('tools')"
            >
              <SlidersHorizontal :size="14" aria-hidden="true" />
              <ChevronDown :size="12" class="boh-tools-caret" aria-hidden="true" />
            </button>
            <div class="boh-menu-anchor">
              <!-- 折射玻璃（同模型菜单） -->
              <BohGlassRefract v-if="activeMenu === 'tools'" :radius="12" frosted />
              <Transition name="boh-pop">
                <div
                  v-show="activeMenu === 'tools'"
                  class="boh-tools-menu"
                  role="dialog"
                  aria-label="工具"
                >
                  <div class="boh-mm-adv">
                    <button
                      type="button"
                      class="boh-mm-tool"
                      :class="{ 'is-on': tools.cloud }"
                      :aria-pressed="tools.cloud"
                      @click="emit('toggle-tool', 'cloud')"
                    >
                      <Cloud :size="16" aria-hidden="true" />
                      <span
                        ><strong>个人 Cloud+</strong><small>参考你的 Cloud+ 私有内容</small></span
                      >
                    </button>
                    <button type="button" class="boh-mm-tool" @click="emit('start-psych')">
                      <Brain :size="16" aria-hidden="true" />
                      <span
                        ><strong>心理分析</strong
                        ><small>切换心理专家，由 AI 逐个提问陪你梳理</small></span
                      >
                    </button>
                    <!-- 引用当前页面（2026-10-12 接上原先零调用点的 setAttachedContext）：
                     只有**灵动岛形态**有「另一页」可引 —— 独立页时当前页面就是 AI 自己。
                     这是一次性动作而非开关，所以走新 emit + 顺手收起菜单。 -->
                    <button
                      v-if="overlayMode"
                      type="button"
                      class="boh-mm-tool"
                      @click="requestAttachPage"
                    >
                      <FileText :size="16" aria-hidden="true" />
                      <span
                        ><strong>引用当前页面</strong
                        ><small>把这一页的标题、地址和你选中的内容带给 AI</small></span
                      >
                    </button>
                  </div>
                </div>
              </Transition>
            </div>
          </div>

          <span class="boh-cp-spacer"></span>

          <div
            v-if="usage.visible"
            class="boh-usage-wrap"
            @mouseenter="openUsagePop"
            @mouseleave="scheduleCloseUsagePop"
          >
            <button
              type="button"
              class="boh-usage"
              :class="usage.levelClass"
              :aria-expanded="usagePopOpen"
              aria-haspopup="dialog"
              aria-label="使用情况"
              @click.stop="toggleUsagePop"
            >
              <i :style="{ '--boh-ring-p': usage.percent }"></i>
              <b>{{ usage.percentText }}</b>
            </button>

            <!-- 折射玻璃锚（2026-10-14，§21.8 线1）：定位（right/bottom/宽）从浮层上移到锚 ——
                 与 `.boh-menu-anchor` 同款。玻璃与浮层做**兄弟**：浮层自带 z-index 22，
                 锚必须**无 z-index**，否则堆叠上下文会裁掉玻璃的背板采样（§21.7「采样根」硬约束）。
                 回滚 = 删锚 + 玻璃两层。 -->
            <div class="boh-usage-anchor">
              <BohGlassRefract v-if="usagePopOpen" :radius="12" frosted />
              <Transition name="boh-pop">
                <div
                  v-show="usagePopOpen"
                  class="boh-usage-pop"
                  role="dialog"
                  aria-label="使用情况"
                >
                  <div class="boh-usage-pop-head">
                    <span>使用情况</span>
                    <button type="button" @click.stop="emit('open-usage')">完整用量 ›</button>
                  </div>

                  <div class="boh-usage-row">
                    <span class="boh-usage-dot" aria-hidden="true"></span>
                    <span>对话上下文</span>
                    <b>{{ usage.percentText }}</b>
                  </div>
                  <div class="boh-usage-meter"><i :style="{ width: usage.percentText }"></i></div>
                  <p class="boh-usage-foot">
                    本轮约 {{ usage.windowUsed || 0 }} / {{ usage.windowMax || 0 }} 字符 · 已含
                    {{ usage.includedMessageCount || 0 }} 轮历史{{
                      usage.hasSummary ? ' · 更早内容已存入摘要' : ''
                    }}
                  </p>

                  <template v-if="usage.quotaVisible">
                    <div class="boh-usage-row">
                      <span class="boh-usage-dot is-quota" aria-hidden="true"></span>
                      <span>今日剩余</span>
                      <b>{{ usage.quotaRemainingText }}</b>
                    </div>
                    <!-- 宽度用归一后的 meterText（已用 ÷ 总额，天然 0–100）。
                     主指标是剩余（Plus 尺子，Max 可到 625%）—— 那个数当 width 会撑破容器。 -->
                    <div class="boh-usage-meter is-quota">
                      <i :style="{ width: usage.quotaMeterText }"></i>
                    </div>
                    <p class="boh-usage-foot">{{ usage.quotaDetailText }}</p>
                  </template>

                  <div class="boh-usage-pop-actions">
                    <button
                      v-if="usage.canCompress"
                      type="button"
                      class="is-primary"
                      :disabled="isCompressing"
                      title="立即压缩历史对话，整理早期内容为摘要"
                      @click.stop="emit('compress')"
                    >
                      <Archive :size="12" aria-hidden="true" /><span>整理上下文</span>
                    </button>
                    <button type="button" @click.stop="emit('open-usage')">用量详情</button>
                  </div>

                  <div v-if="usage.compressSuccess" class="boh-usage-done">
                    <CheckCircle2 :size="12" aria-hidden="true" /><span>上下文已压缩</span>
                  </div>
                </div>
              </Transition>
            </div>
          </div>

          <button
            v-if="isLoading"
            type="button"
            class="boh-send is-stop"
            title="停止生成"
            aria-label="停止生成"
            @click="emit('stop')"
          >
            <Square :size="15" aria-hidden="true" />
          </button>
          <button
            v-else
            type="button"
            class="boh-send"
            :disabled="!modelValue.trim() || isCompressing"
            title="发送"
            aria-label="发送"
            @click="emit('send')"
          >
            <ArrowUp :size="15" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>

    <p v-if="rateLimitMessage" class="boh-cp-alert">{{ rateLimitMessage }}</p>
    <p v-if="notice" class="boh-cp-notice" role="status">{{ notice }}</p>
    <div v-if="contextWarningText" class="boh-cp-warn" role="status">
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <span>{{ contextWarningText }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import {
  Archive,
  ArrowUp,
  Brain,
  Check,
  CheckCircle2,
  ChevronDown,
  Cloud,
  FileText,
  Globe,
  Lock,
  Pencil,
  SlidersHorizontal,
  Sparkles,
  Square,
  X,
} from 'lucide-vue-next';
import { formatModeRateLabel, isFreeMode } from '@/views/BOHAI/utils/mode-rate-label.js';
import { useAutoGrowTextarea } from '@/composables/useAutoGrowTextarea.js';

import BohGlassRefract from '@/components/ui/BohGlassRefract.vue';
import BohBeam from './BohBeam.vue';

/**
 * BohComposer.vue — 输入区（plans/025 v2 · Step 6-4）
 *
 * 口径真源：`output/boh-ui-demo/index.html` 的 `§5 输入区`（`.boh-composer-wrap` / `.boh-composer` /
 * `.cp-toolbar` / `.usage-badge` / `.mode-pill` / `.mode-menu` / `.slash-menu` / `.send-btn` /
 * `.cp-note`）。
 *
 * 状态划分：
 *   · **业务状态在壳**（输入值 / 模式 / 工具开关 / 联网 / 用量数据 / 斜杠命令清单）；
 *   · **纯 UI 状态在本组件**（面板开合 / 高级折叠 / 用量浮层开合）。
 *     壳的 Esc 与「关闭浮层」通过 `defineExpose().closePanel()` 调用（口径不变）。
 *
 * ⚠️ 旧类名（`.input-area` / `.input-box` / `.composer-*` 一族）**不迁移**（DESIGN §5）。
 * ⚠️ 断点与基座同文件（`components/styles/boh-composer.css`）—— 见 `styles/layout.css` 头。
 */
const props = defineProps({
  modelValue: { type: String, default: '' },
  isLoading: { type: Boolean, default: false },
  isCompressing: { type: Boolean, default: false },
  isSearching: { type: Boolean, default: false },
  placeholder: { type: String, default: '有问题，尽管问' },
  overlayMode: { type: Boolean, default: false },
  modes: { type: Array, default: () => [] },
  modesLoading: { type: Boolean, default: false },
  currentMode: { type: Object, default: () => ({ name: '' }) },
  currentModeId: { type: String, default: '' },
  tools: { type: Object, default: () => ({ cloud: false }) },
  /** 已开启的「下一条消息」开关（斜杠命令应用后的 tag 反馈；状态真源在壳，这里只渲染） */
  activeFlags: { type: Array, default: () => [] },
  attachedContext: { type: Object, default: null },
  usage: { type: Object, default: () => ({ visible: false }) },
  slashOpen: { type: Boolean, default: false },
  slashCommands: { type: Array, default: () => [] },
  slashActiveIndex: { type: Number, default: 0 },
  /** 限流提示（原 `.rate-limit`） */
  rateLimitMessage: { type: String, default: '' },
  /** 一次性 UI 通知（原 `.ui-notice`） */
  notice: { type: String, default: '' },
  /** 上下文接近上限的横幅文案（空则不显示；原 `.context-full-banner`） */
  contextWarningText: { type: String, default: '' },
});

const emit = defineEmits([
  'update:modelValue',
  'keydown',
  'input',
  'send',
  'stop',
  'toggle-search',
  'toggle-tool',
  /* 2026-10-16：开关 chip 的删除意图（id 由壳映射到既有切换函数） */
  'toggle-flag',
  'start-psych',
  'select-mode',
  'run-slash-command',
  'update:slashActiveIndex',
  'clear-context',
  /* 2026-10-12：「引用当前页面」是一次性动作（不是开关）⇒ 独立于 clear-context。 */
  'attach-page',
  'compress',
  'open-usage',
  /* 2026-10-10：模型列表底部的「配置自定义模型」→ 打开设置页（BYOK 在那边）。 */
  'open-settings',
]);

/* 输入框自动增高：单源 `composables/useAutoGrowTextarea.js`（plans/021 阶段 3 收敛，
   原先这里有一份自研 `autoResize` + `modelValue` watch，已删）。
   内容源是受控 prop ⇒ 必须传 **getter**（包一层 `() => unref(value)` 会让 watcher 永不触发）；
   别名 `textareaEl` 保留原名 —— 模板 ref / `focus` / `defineExpose` 都仍用这个名字。 */
const { textareaRef: textareaEl } = useAutoGrowTextarea({ value: () => props.modelValue });
/** 根节点：壳的 FLIP（空态居中 → 贴底）要量它，见 `BOHAIMain.animateComposerHome` */
const wrapEl = ref(null);
/** 输入框外壳：斜杠菜单要按它算「上方可用高度」，见 `syncSlashAvail` */
const composerEl = ref(null);
/** 2026-10-11：两个浮层（模型 / 工具）**互斥**，用一颗状态表达 ——
    原先是 `panelOpen` + `menuView` 两颗（单浮层两视图），拆成独立胶囊后必然要互斥，
    再拆成两个布尔只会让「同时开两个」成为可能。用 `activeMenu` 一颗锁死。 */
const activeMenu = ref(null);
const usagePopOpen = ref(false);
let usagePopCloseTimer = null;

/** 供壳的 Esc 分层用（`BOHAIMain` 读 `composerRef.panelOpen`）—— 现在是派生值 */
const panelOpen = computed(() => activeMenu.value !== null);

const attachedTitle = computed(() => {
  const title = String(props.attachedContext?.title || '当前页面');
  return title.length > 24 ? `${title.slice(0, 24)}…` : title;
});

/* 倍率 / 免费 / 自有 Key 的文案已收敛到 utils/mode-rate-label.js ——
   设置页的模式选择器要用同一份，留在这里必然分叉（Fast 显示成 1x 就是这么来的）。 */

/* ── 纯 UI 状态 ── */
/* 模型视图的 hover 详情卡（2026-10-10 用户样稿）。
   卡片挂在 `.boh-mm-body`（内层滚动容器）**外面** ⇒ top 要从行与 `.boh-mode-menu` 的
   getBoundingClientRect 差值换算成**同一坐标系**；不要直接用 viewport 的 top。
   再按实际卡片高度 clamp 到视口内（模型描述长度各不相同，不能假设卡片固定高度）。 */
const hoverMode = ref(null);
const hoverTop = ref(0);
/** 详情卡默认挂在面板**右侧**（面板左对齐）；右侧放不下时翻回左侧 */
const hoverFlipped = ref(false);
const hoverDetailEl = ref(null);
let modeDetailCloseTimer = null;

const cancelCloseModeDetail = () => {
  if (modeDetailCloseTimer) {
    clearTimeout(modeDetailCloseTimer);
    modeDetailCloseTimer = null;
  }
};

const scheduleCloseModeDetail = () => {
  cancelCloseModeDetail();
  modeDetailCloseTimer = setTimeout(() => {
    modeDetailCloseTimer = null;
    hoverMode.value = null;
  }, 240);
};

const closePanel = () => {
  cancelCloseModeDetail();
  activeMenu.value = null;
  hoverMode.value = null;
};

/** 两个浮层共用一个开关：再点自己那颗胶囊 = 收起（`aria-expanded` 也要跟着翻） */
const toggleMenu = (name) => {
  usagePopOpen.value = false;
  activeMenu.value = activeMenu.value === name ? null : name;
};

/** 「引用当前页面」（2026-10-12）：采集 + 收起工具菜单。
    ⚠️ 采集真源在壳（`captureCurrentPageContext`）：它要读 `document.title` /
    `location.href` / 当前选区，那是「页面级」信息，输入框不该知道自己飘在哪个页面上。
    ⚠️ 顺手收菜单：这一口是一次性动作，不是开关，没有「再点一次关掉」的语义。 */
const requestAttachPage = () => {
  usagePopOpen.value = false;
  activeMenu.value = null;
  emit('attach-page');
};

/* 选完模式 → **收起浮层**（2026-10-01 用户拍板）。工具开关与「心理分析」不收 ——
   用户常接着改第二项。 */
const pickMode = (modeId) => {
  emit('select-mode', modeId);
  closePanel();
};

/* ── 策略行识别（plans/030 §3.6）───────────────────────────────────────────
   判据是 `mode.strategy === true`（由壳按 mode_id ∈ {cost,balance,intelligence}
   标记，**不在本组件里硬编码三个 id** —— 那样策略改名就得来这里再改一遍）。
   ⚠️ 别改成按 sort_order 判断：sort_order 是排序实现，不是语义标记。 */
const isStrategyRow = (mode) => Boolean(mode?.strategy);

/* ── 游客锁定（plans/030 §3.4）───────────────────────────────────────────
   游客只能选 GLM4（id 'fast'，倍率 0.0x ⇒ 零成本）。
   判据用 minTier：'guest' = 游客可用，其余 = 登录后可用。
   ⚠️ 这里刻意不判断"付费档够不够" —— plans/030 已把选型门槛收敛成
      guest / free 两种，plus 以上不再用作 min_tier。 */
// 判据来自壳层的 `mode.locked`（由 useBohShell 的 decorateChatModes 计算）。
// 本组件不自己判断登录态 / min_tier —— 那会变成第二份真源，且要为它多接一个 prop
// （BOHAIMain.vue 有 400 行上限，见 tests/unit/bohai-shell-structure.test.js）。
/**
 * 斜杠菜单的分组视图：把扁平的 `slashCommands` 按 `command.group` 归并。
 *
 * ⚠️ `index` 必须是**扁平序号**（跨组连续）—— 它要和壳里的 `slashActiveIndex`
 *    对齐（上下键跨组移动时序号连续）。这里重排成嵌套结构只是**渲染形态**，
 *    `index` 一律取自扁平数组的位置，不能改用「组内序号」。
 * ⚠️ 组顺序 = 首次出现顺序（不排序）：命令表的书写顺序就是产品的推荐顺序，
 *    在这里再 sort 一次等于多一份真源。
 * ⚠️ 没有 `group` 的项归入「其他」兜底 —— 新增命令忘了写 group 时，
 *    它会出现在末尾而不是静默消失。
 */
const slashGroups = computed(() => {
  const list = Array.isArray(props.slashCommands) ? props.slashCommands : [];
  const order = [];
  const buckets = new Map();
  list.forEach((command, index) => {
    const name = String(command?.group || '其他');
    if (!buckets.has(name)) {
      buckets.set(name, []);
      order.push(name);
    }
    buckets.get(name).push({ command, index });
  });
  return order.map((name) => ({ name, items: buckets.get(name) }));
});

const isModeLocked = (mode) => Boolean(mode?.locked);

const handleModeClick = (mode) => {
  // 锁定行也走 select-mode：拦截与提示统一由壳的 selectMode 负责（它知道登录态、
  // 能发灵动岛）。在这里 return 掉而不 emit，会让壳无法区分"点了禁用项"与"没点"，
  // 也就没法给出"登录后可用"的反馈 —— 而 BOHAIMain 又不能再加一条 @locked-mode 接线
  // （400 行上限）。所以：**一律 emit，由壳决定放行还是提示**。
  pickMode(mode.id);
};

const onModeRowEnter = (event, mode) => {
  cancelCloseModeDetail();
  const row = event?.currentTarget;
  const panel = row?.closest?.('.boh-mode-menu');
  const rowRect = row?.getBoundingClientRect?.();
  const panelRect = panel?.getBoundingClientRect?.();
  if (!rowRect || !panelRect) return;

  hoverMode.value = mode;
  hoverTop.value = Math.max(0, rowRect.top - panelRect.top);
  hoverFlipped.value = false;
  void nextTick(() => {
    // 若鼠标已经快速移到另一行，旧行的量尺回调不得覆盖新详情卡的位置。
    if (hoverMode.value?.id !== mode?.id) return;
    const detail = hoverDetailEl.value;
    if (!detail || !panel.isConnected || typeof window === 'undefined') return;
    const currentPanelRect = panel.getBoundingClientRect();
    const detailHeight = detail.getBoundingClientRect().height;
    const maxTop = Math.max(0, window.innerHeight - 8 - detailHeight - currentPanelRect.top);
    hoverTop.value = Math.min(hoverTop.value, maxTop);
    // 面板左侧触发 ⇒ 详情卡默认在右侧；右侧不够 8px 边距就翻回左侧（2026-10-11 镜像）
    const detailWidth = detail.getBoundingClientRect().width;
    hoverFlipped.value =
      currentPanelRect.left + currentPanelRect.width + 8 + detailWidth > window.innerWidth - 8;
  });
};

const clearUsageTimer = () => {
  if (usagePopCloseTimer) {
    clearTimeout(usagePopCloseTimer);
    usagePopCloseTimer = null;
  }
};

const openUsagePop = () => {
  clearUsageTimer();
  if (panelOpen.value) closePanel();
  usagePopOpen.value = true;
};

const toggleUsagePop = () => {
  clearUsageTimer();
  if (!usagePopOpen.value && panelOpen.value) closePanel();
  usagePopOpen.value = !usagePopOpen.value;
};

/* 离开后延迟关闭：给「抖出边界又抖回来」留余量，也让鼠标有时间挪进浮层 */
const scheduleCloseUsagePop = () => {
  clearUsageTimer();
  usagePopCloseTimer = setTimeout(() => {
    usagePopCloseTimer = null;
    usagePopOpen.value = false;
  }, 180);
};

const onInput = (event) => {
  emit('update:modelValue', event.target.value);
  emit('input', event);
};

const onDocumentClick = (event) => {
  // 两个浮层各自贴着自己的胶囊，点在**任何一个**里面都不算「点外面」
  if (
    panelOpen.value &&
    !event.target.closest?.('.boh-mode-wrap, .boh-mode-menu, .boh-tools-wrap, .boh-tools-menu')
  ) {
    closePanel();
  }
  if (usagePopOpen.value && !event.target.closest?.('.boh-usage-wrap')) {
    usagePopOpen.value = false;
  }
};

/* 斜杠菜单的「上方可用高度」上限（2026-10-11）。
   空态下「虚影字 + 输入框」整组垂直居中 ⇒ 输入框顶只剩 ~460px，而菜单内容要 ~780px，
   顶端会被推出视口（实测 1440×900：菜单 `top = −318`，前 7 条命令既看不见也够不到，
   而键盘初始焦点恰好就在看不见的 `/web` 上）。
   ⚠️ 这里**只把量到的输入框顶**写进 CSS 变量，两条上限怎么取舍留在 CSS
      （`.boh-slash` 的 `min(calc(100vh - 120px), calc(var(--boh-slash-top) - 16px))`）——
      与输入框增高（`useAutoGrowTextarea`）同一条纪律：**JS 不写第二份设计像素值**。 */
const syncSlashAvail = () => {
  const el = composerEl.value;
  if (!el) return;
  el.style.setProperty('--boh-slash-top', `${Math.round(el.getBoundingClientRect().top)}px`);
};

/** 窗口尺寸变化时输入框会挪位（空态是居中定位）⇒ 菜单开着就重量一次 */
const onViewportResize = () => {
  if (props.slashOpen) syncSlashAvail();
};

onMounted(() => {
  document.addEventListener('click', onDocumentClick);
  window.addEventListener('resize', onViewportResize);
});
onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick);
  window.removeEventListener('resize', onViewportResize);
  clearUsageTimer();
  cancelCloseModeDetail();
});

/* （输入框增高已收敛到 `useAutoGrowTextarea` 单源，见文件头下方的接线处。
   原自研 `autoResize` + `modelValue` watch 整段删除 —— composable 内部同样遵守原三条纪律：
   `height='auto'` 后无条件写回、上限只住 CSS 的 `max-height`、空内容先摘 placeholder。） */

/* 面板打开时不再需要斜杠菜单（两者都贴在输入框上方，同时开必重叠） */
/* 面板打开时不再需要斜杠菜单（两者都贴在输入框上方，同时开必重叠）；
   斜杠菜单打开时同步一次「上方可用高度」—— 必须 `nextTick`：`v-if` 刚挂上，
   此时量输入框位置才是最终布局（空态居中的 FLIP 也已落定）。 */
watch(
  () => props.slashOpen,
  (open) => {
    if (!open) return;
    closePanel();
    nextTick(syncSlashAvail);
  },
);

defineExpose({
  closePanel,
  wrapEl,
  /** 供壳的 Esc 分层用：面板是否开着 */
  panelOpen,
  focus: () => textareaEl.value?.focus(),
  textareaEl,
});
</script>

<style scoped src="./styles/boh-composer.css"></style>
