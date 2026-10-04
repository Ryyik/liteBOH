<template>
  <Teleport to="body" :disabled="embedded">
    <Transition name="settings-slide">
      <div
        v-if="modelValue"
        class="ai-settings-backdrop"
        :class="{ 'is-embedded': embedded }"
        :data-theme="resolvedTheme"
        role="presentation"
        @click.self="close"
        @keydown.escape="close"
        @keydown.tab.prevent="handleTabTrap"
      >
        <section
          ref="drawerRef"
          class="ai-settings-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="BOH AI 设置"
        >
          <header class="ai-settings-header">
            <h2 tabindex="-1" ref="titleRef">设置</h2>
            <button
              ref="closeBtnRef"
              type="button"
              class="ai-settings-close-btn"
              :title="embedded ? '返回' : '关闭 (Esc)'"
              @click="close"
            >
              <ArrowLeft v-if="embedded" size="18" />
              <X v-else size="18" />
            </button>
          </header>

          <!-- 2026-10-03（plans/023 步骤 ④）：7 分区重排为「4 卡 + 折叠高级 + 底部数据」。
               原方案写「3 卡」，实测拆成 4 卡 —— 用量必须单列：它承接了已退役的
               AiQuotaSidePanel（原方案 §10⑤ 也要求上下文环落到「设置面板的用量卡」），
               塞进任何一张偏好卡都会让那张卡变成杂物箱。
               思考强度已移出（输入区面板的「推理强度」是同一个状态，重复入口已删）；
               呼出方式（快捷键 / 手势 / 触感 / 呼出后打开）整组折进「高级」。 -->
          <div class="ai-settings-body custom-scrollbar">
            <!-- 卡 1 · 对话偏好 -->
            <div class="ai-settings-card">
              <div class="ai-settings-group-title">对话偏好</div>
              <div class="ai-settings-list">
                <div
                  class="ai-settings-row"
                  :class="{ expanded: showModePicker }"
                  @click="showModePicker = !showModePicker"
                >
                  <div class="ai-settings-row-left">
                    <div class="ai-settings-icon bg-blue">
                      <Settings size="16" />
                    </div>
                    <div class="ai-settings-label-stack">
                      <span class="ai-settings-label">默认响应模式</span>
                      <span class="ai-settings-desc">{{ currentMode.name }}</span>
                    </div>
                  </div>
                  <div class="ai-settings-row-right">
                    <span class="ai-settings-chevron" :class="{ expanded: showModePicker }">›</span>
                  </div>
                </div>
                <div v-if="showModePicker" class="ai-settings-inline-options">
                  <button
                    v-for="mode in chatModes"
                    :key="mode.id"
                    type="button"
                    :class="['ai-settings-inline-option', { active: currentModeId === mode.id }]"
                    @click.stop="
                      $emit('selectMode', mode.id);
                      showModePicker = false;
                    "
                  >
                    <span class="ai-settings-option-main">
                      <strong>{{ mode.name }}</strong>
                    </span>
                    <span class="ai-settings-option-meta">
                      <span
                        class="ai-settings-option-multiplier"
                        :title="`该模式消耗倍率为 ${formatQuotaMultiplier(mode.quotaMultiplier)}x`"
                      >
                        {{ formatQuotaMultiplier(mode.quotaMultiplier) }}x
                      </span>
                      <Check v-if="currentModeId === mode.id" size="16" />
                    </span>
                  </button>
                </div>

                <div
                  class="ai-settings-row"
                  :class="{ expanded: showStylePicker }"
                  @click="showStylePicker = !showStylePicker"
                >
                  <div class="ai-settings-row-left">
                    <div class="ai-settings-icon bg-purple">
                      <span style="font-size: 12px; font-weight: 800">Aa</span>
                    </div>
                    <div class="ai-settings-label-stack">
                      <span class="ai-settings-label">回答风格</span>
                      <span class="ai-settings-desc">{{ currentResponseStyleName }}</span>
                    </div>
                  </div>
                  <div class="ai-settings-row-right">
                    <span class="ai-settings-chevron" :class="{ expanded: showStylePicker }"
                      >›</span
                    >
                  </div>
                </div>
                <div v-if="showStylePicker" class="ai-settings-inline-options">
                  <button
                    v-for="style in responseStyleOptions"
                    :key="style.id"
                    type="button"
                    :class="[
                      'ai-settings-inline-option',
                      { active: currentResponseStyleId === style.id },
                    ]"
                    @click.stop="
                      $emit('selectResponseStyle', style.id);
                      showStylePicker = false;
                    "
                  >
                    <span class="ai-settings-option-main">
                      <strong>{{ style.shortName || style.name }}</strong>
                      <small>{{ style.description || style.name }}</small>
                    </span>
                    <Check v-if="currentResponseStyleId === style.id" size="16" />
                  </button>
                </div>

                <div
                  class="ai-settings-row clickable"
                  @click="preferences.enterToSend = !preferences.enterToSend"
                >
                  <div class="ai-settings-row-left">
                    <div class="ai-settings-icon"><span class="settings-glyph">↵</span></div>
                    <div class="ai-settings-label-stack">
                      <span class="ai-settings-label">发送方式</span
                      ><span class="ai-settings-desc">{{
                        preferences.enterToSend
                          ? 'Enter 发送，Shift+Enter 换行'
                          : 'Ctrl/⌘+Enter 发送'
                      }}</span>
                    </div>
                  </div>
                  <span
                    :class="['ai-settings-switch', { enabled: preferences.enterToSend }]"
                  ></span>
                </div>
                <div
                  class="ai-settings-row clickable"
                  @click="preferences.defaultWebSearch = !preferences.defaultWebSearch"
                >
                  <div class="ai-settings-row-left">
                    <div class="ai-settings-icon"><span class="settings-glyph">◎</span></div>
                    <div class="ai-settings-label-stack">
                      <span class="ai-settings-label">新对话默认联网</span
                      ><span class="ai-settings-desc">开始新对话时自动启用联网搜索</span>
                    </div>
                  </div>
                  <span
                    :class="['ai-settings-switch', { enabled: preferences.defaultWebSearch }]"
                  ></span>
                </div>
                <div
                  class="ai-settings-row clickable"
                  @click="preferences.showDetails = !preferences.showDetails"
                >
                  <div class="ai-settings-row-left">
                    <div class="ai-settings-icon"><span class="settings-glyph">⋯</span></div>
                    <div class="ai-settings-label-stack">
                      <span class="ai-settings-label">回复详情入口</span
                      ><span class="ai-settings-desc">显示检索记录与动作审计</span>
                    </div>
                  </div>
                  <span
                    :class="['ai-settings-switch', { enabled: preferences.showDetails }]"
                  ></span>
                </div>
              </div>
            </div>

            <!-- 卡 2 · 记忆与上下文 -->
            <div class="ai-settings-card">
              <div class="ai-settings-group-title">记忆与上下文</div>
              <div class="ai-settings-list">
                <div
                  class="ai-settings-row clickable"
                  :class="{ disabled: isTreeholeMemoryToggling }"
                  role="switch"
                  tabindex="0"
                  :aria-checked="isTreeholeMemoryEnabled"
                  @click="!isTreeholeMemoryToggling && $emit('toggleTreeholeMemory')"
                  @keydown.enter.prevent="
                    !isTreeholeMemoryToggling && $emit('toggleTreeholeMemory')
                  "
                  @keydown.space.prevent="
                    !isTreeholeMemoryToggling && $emit('toggleTreeholeMemory')
                  "
                >
                  <div class="ai-settings-row-left">
                    <div class="ai-settings-icon bg-indigo">
                      <span style="font-size: 11px; font-weight: 800">C+</span>
                    </div>
                    <div class="ai-settings-label-stack">
                      <span class="ai-settings-label">个人记忆</span>
                      <span class="ai-settings-desc">{{
                        isTreeholeMemoryToggling ? '正在更新设置…' : '允许回答参考你的 Cloud+ 内容'
                      }}</span>
                    </div>
                  </div>
                  <div class="ai-settings-row-right">
                    <span
                      :class="['ai-settings-switch', { enabled: isTreeholeMemoryEnabled }]"
                    ></span>
                  </div>
                </div>
                <div
                  class="ai-settings-row clickable"
                  role="switch"
                  tabindex="0"
                  :aria-checked="isSharedMemoryEnabled"
                  @click="$emit('toggleSharedMemory')"
                  @keydown.enter.prevent="$emit('toggleSharedMemory')"
                  @keydown.space.prevent="$emit('toggleSharedMemory')"
                >
                  <div class="ai-settings-row-left">
                    <div class="ai-settings-icon bg-purple">
                      <span style="font-size: 11px; font-weight: 800">M</span>
                    </div>
                    <div class="ai-settings-label-stack">
                      <span class="ai-settings-label">社区知识</span>
                      <span class="ai-settings-desc">允许回答参考社区共享内容</span>
                    </div>
                  </div>
                  <div class="ai-settings-row-right">
                    <span
                      :class="['ai-settings-switch', { enabled: isSharedMemoryEnabled }]"
                    ></span>
                  </div>
                </div>
                <div
                  class="ai-settings-row clickable"
                  @click="preferences.pageContextEnabled = !preferences.pageContextEnabled"
                >
                  <div class="ai-settings-row-left">
                    <div class="ai-settings-icon"><span class="settings-glyph">▤</span></div>
                    <div class="ai-settings-label-stack">
                      <span class="ai-settings-label">自动附加当前页面</span
                      ><span class="ai-settings-desc">呼出 AI 时附加页面标题和地址</span>
                    </div>
                  </div>
                  <span
                    :class="['ai-settings-switch', { enabled: preferences.pageContextEnabled }]"
                  ></span>
                </div>
                <div
                  class="ai-settings-row clickable"
                  @click="
                    preferences.selectionContextEnabled = !preferences.selectionContextEnabled
                  "
                >
                  <div class="ai-settings-row-left">
                    <div class="ai-settings-icon"><span class="settings-glyph">T</span></div>
                    <div class="ai-settings-label-stack">
                      <span class="ai-settings-label">识别选中文本</span
                      ><span class="ai-settings-desc">仅在你主动附加或允许自动附加时使用</span>
                    </div>
                  </div>
                  <span
                    :class="[
                      'ai-settings-switch',
                      { enabled: preferences.selectionContextEnabled },
                    ]"
                  ></span>
                </div>
                <div class="ai-settings-inline-segmented" style="margin-top: 8px">
                  <button
                    :class="{ active: preferences.contextMode === 'title-url' }"
                    @click="preferences.contextMode = 'title-url'"
                  >
                    仅标题
                  </button>
                  <button
                    :class="{ active: preferences.contextMode === 'selection' }"
                    @click="preferences.contextMode = 'selection'"
                  >
                    含选中
                  </button>
                  <button
                    :class="{ active: preferences.contextMode === 'full' }"
                    @click="preferences.contextMode = 'full'"
                  >
                    完整页面
                  </button>
                </div>
                <div v-if="memoryStatusText" class="ai-settings-memory-status" role="status">
                  {{ memoryStatusText }}
                </div>
              </div>
            </div>

            <!-- 卡 3 · 外观 -->
            <div class="ai-settings-card">
              <div class="ai-settings-group-title">外观</div>
              <div class="ai-settings-list">
                <div class="ai-settings-inline-segmented settings-wide-segmented">
                  <button
                    v-for="option in appearanceOptions"
                    :key="option.id"
                    :class="{ active: preferences.appearance === option.id }"
                    @click="preferences.appearance = option.id"
                  >
                    {{ option.name }}
                  </button>
                </div>
                <div class="ai-settings-inline-segmented settings-wide-segmented">
                  <button
                    :class="{ active: preferences.density === 'comfortable' }"
                    @click="preferences.density = 'comfortable'"
                  >
                    舒适
                  </button>
                  <button
                    :class="{ active: preferences.density === 'compact' }"
                    @click="preferences.density = 'compact'"
                  >
                    紧凑
                  </button>
                </div>
                <div
                  class="ai-settings-inline-segmented settings-wide-segmented font-scale-segmented"
                >
                  <button
                    :class="{ active: preferences.fontScale === 'small' }"
                    @click="preferences.fontScale = 'small'"
                  >
                    小字
                  </button>
                  <button
                    :class="{ active: preferences.fontScale === 'medium' }"
                    @click="preferences.fontScale = 'medium'"
                  >
                    标准
                  </button>
                  <button
                    :class="{ active: preferences.fontScale === 'large' }"
                    @click="preferences.fontScale = 'large'"
                  >
                    大字
                  </button>
                </div>
                <div
                  class="ai-settings-row clickable"
                  @click="preferences.animationsEnabled = !preferences.animationsEnabled"
                >
                  <div class="ai-settings-row-left">
                    <div class="ai-settings-icon"><span class="settings-glyph">✦</span></div>
                    <div class="ai-settings-label-stack">
                      <span class="ai-settings-label">界面动效</span
                      ><span class="ai-settings-desc">关闭后减少抽屉和页面切换动画</span>
                    </div>
                  </div>
                  <span
                    :class="['ai-settings-switch', { enabled: preferences.animationsEnabled }]"
                  ></span>
                </div>
              </div>
            </div>

            <!-- 卡 4 · 用量（承接 2026-10-03 退役的 AiQuotaSidePanel） -->
            <div ref="usageCardRef" class="ai-settings-card">
              <div class="ai-settings-group-title">用量</div>
              <div class="ai-settings-list">
                <div v-if="quotaLoading" class="ai-settings-quota-loading">正在读取用量…</div>
                <div v-else-if="!quota" class="ai-settings-quota-loading">
                  暂时读不到用量数据，稍后再试
                </div>
                <template v-else>
                  <div class="ai-settings-usage-plan">
                    <div>
                      <span>当前方案</span><strong>{{ tierLabel }}</strong>
                    </div>
                    <span class="ai-settings-usage-chip">{{
                      pointsMode ? '积分计费' : quotaLimit === -1 ? '不限量' : '每日额度'
                    }}</span>
                  </div>

                  <section v-if="pointsMode" class="ai-settings-usage-section">
                    <div class="ai-settings-usage-section-head">
                      <div><strong>积分</strong><span>AI 对话按量消耗积分，不过期</span></div>
                      <b>{{ formatTokenCount(pointsBalance) }} 分</b>
                    </div>
                    <div class="ai-settings-usage-values">
                      <span>今日已耗 {{ formatTokenCount(pointsUsedToday) }} 积分</span
                      ><span>余额 {{ formatTokenCount(pointsBalance) }} 积分</span>
                    </div>
                    <div class="ai-settings-usage-remaining">
                      1 积分 = {{ formatTokenCount(rateTokensPerPoint) }} Tokens × 档位倍率
                      {{ pointsMultiplierLabel }}
                    </div>
                  </section>

                  <button v-else type="button" class="ai-settings-quota-overview" disabled>
                    <div class="ai-settings-quota-head">
                      <span>今日 Token</span>
                      <strong>{{ quotaLimit === -1 ? '∞' : `${quotaPercentLabel}%` }}</strong>
                    </div>
                    <div class="ai-settings-quota-values">
                      <span>已用 {{ formatTokenCount(quotaUsed) }}</span>
                      <span>{{
                        quotaLimit === -1 ? '无限额度' : `总额 ${formatTokenCount(quotaLimit)}`
                      }}</span>
                    </div>
                    <div
                      class="ai-settings-quota-track"
                      role="progressbar"
                      aria-label="今日 Token 使用比例"
                      :aria-valuemin="0"
                      :aria-valuemax="100"
                      :aria-valuenow="
                        quotaLimit === -1 ? undefined : Number(quotaPercent.toFixed(2))
                      "
                    >
                      <span
                        :class="{
                          'has-usage': quotaPercent > 0,
                          warn: quotaPercent >= 80,
                          danger: quotaPercent >= 95,
                          unlimited: quotaLimit === -1,
                        }"
                        :style="{ width: quotaLimit === -1 ? '100%' : `${quotaPercent}%` }"
                      ></span>
                    </div>
                    <div class="ai-settings-quota-foot">
                      <span>{{
                        quotaLimit === -1
                          ? '当前订阅不限用量'
                          : `剩余 ${formatTokenCount(quotaRemaining)} Tokens`
                      }}</span>
                      <span>每日 0:00 重置</span>
                    </div>
                  </button>

                  <section class="ai-settings-usage-section">
                    <div class="ai-settings-usage-section-head">
                      <div><strong>Web Searching</strong><span>联网搜索次数</span></div>
                      <b>{{ webSearchLimit === -1 ? '不限' : `${webPercentLabel}%` }}</b>
                    </div>
                    <div
                      class="ai-settings-quota-track"
                      role="progressbar"
                      aria-label="今日联网搜索使用比例"
                      :aria-valuemin="0"
                      :aria-valuemax="100"
                      :aria-valuenow="
                        webSearchLimit === -1 ? undefined : Number(webPercent.toFixed(2))
                      "
                    >
                      <span
                        class="is-web"
                        :class="{
                          'has-usage': webSearchUsed > 0,
                          warn: webPercent >= 80,
                          danger: webPercent >= 95,
                          unlimited: webSearchLimit === -1,
                        }"
                        :style="{ width: webSearchLimit === -1 ? '100%' : `${webPercent}%` }"
                      ></span>
                    </div>
                    <div class="ai-settings-usage-values">
                      <span>已用 {{ formatTokenCount(webSearchUsed) }} 次</span
                      ><span>{{
                        webSearchLimit === -1
                          ? '无限次数'
                          : `共 ${formatTokenCount(webSearchLimit)} 次`
                      }}</span>
                    </div>
                    <div class="ai-settings-usage-remaining">
                      {{
                        webSearchLimit === -1
                          ? '当前方案不限制联网搜索'
                          : `今天还可搜索 ${formatTokenCount(webSearchRemaining)} 次`
                      }}
                    </div>
                  </section>

                  <p class="ai-settings-usage-note">
                    高倍率模型会更快消耗额度；失败的 Web Searching 不计入次数。
                  </p>
                </template>

                <button
                  v-if="!isLoggedIn"
                  type="button"
                  class="ai-settings-usage-action"
                  @click="handleLogin"
                >
                  登录享受更高额度
                </button>
                <button
                  v-else-if="quota && quota.tier === 'free'"
                  type="button"
                  class="ai-settings-usage-action"
                  @click="handleUpgrade"
                >
                  升级订阅解锁更多
                </button>
                <div v-else-if="quota" class="ai-settings-usage-tier-note">
                  <strong>{{ tierLabel || '当前方案' }}</strong>
                  <span>明日 0:00 自动重置</span>
                </div>
              </div>
            </div>

            <!-- 折叠 · 高级（呼出方式） -->
            <div class="ai-settings-card">
              <button
                type="button"
                class="ai-settings-collapse-head"
                :aria-expanded="showAdvanced"
                @click="showAdvanced = !showAdvanced"
              >
                <span class="ai-settings-collapse-title">高级 · 呼出方式</span>
                <span class="ai-settings-chevron" :class="{ expanded: showAdvanced }">›</span>
              </button>
              <div v-show="showAdvanced" class="ai-settings-list">
                <div
                  class="ai-settings-row clickable"
                  @click="preferences.shortcutEnabled = !preferences.shortcutEnabled"
                >
                  <div class="ai-settings-row-left">
                    <div class="ai-settings-icon"><span class="settings-glyph">⌨</span></div>
                    <div class="ai-settings-label-stack">
                      <span class="ai-settings-label">全局快捷键</span
                      ><span class="ai-settings-desc">{{ shortcutLabel }} 呼出并聚焦输入框</span>
                    </div>
                  </div>
                  <span
                    :class="['ai-settings-switch', { enabled: preferences.shortcutEnabled }]"
                  ></span>
                </div>
                <div
                  v-if="preferences.shortcutEnabled"
                  class="ai-settings-row"
                  :class="{ expanded: showShortcutPicker }"
                  @click="showShortcutPicker = !showShortcutPicker"
                >
                  <div class="ai-settings-row-left">
                    <div class="ai-settings-icon"><span class="settings-glyph">K</span></div>
                    <div class="ai-settings-label-stack">
                      <span class="ai-settings-label">快捷键组合</span
                      ><span class="ai-settings-desc">{{ shortcutLabel }}</span>
                    </div>
                  </div>
                  <span class="ai-settings-chevron" :class="{ expanded: showShortcutPicker }"
                    >›</span
                  >
                </div>
                <div
                  v-if="showShortcutPicker && preferences.shortcutEnabled"
                  class="ai-settings-inline-options"
                >
                  <button
                    v-for="option in shortcutOptions"
                    :key="option.id"
                    type="button"
                    :class="[
                      'ai-settings-inline-option',
                      { active: preferences.shortcut === option.id },
                    ]"
                    @click.stop="
                      preferences.shortcut = option.id;
                      showShortcutPicker = false;
                    "
                  >
                    <span class="ai-settings-option-main"
                      ><strong>{{ option.name }}</strong
                      ><small>{{ option.description }}</small></span
                    ><Check v-if="preferences.shortcut === option.id" size="16" />
                  </button>
                </div>
                <div
                  class="ai-settings-row clickable"
                  @click="preferences.gestureEnabled = !preferences.gestureEnabled"
                >
                  <div class="ai-settings-row-left">
                    <div class="ai-settings-icon"><span class="settings-glyph">↔</span></div>
                    <div class="ai-settings-label-stack">
                      <span class="ai-settings-label">边缘手势</span
                      ><span class="ai-settings-desc">从屏幕边缘横向滑动呼出</span>
                    </div>
                  </div>
                  <span
                    :class="['ai-settings-switch', { enabled: preferences.gestureEnabled }]"
                  ></span>
                </div>
                <div v-if="preferences.gestureEnabled" class="ai-settings-inline-segmented">
                  <button
                    :class="{ active: preferences.gestureSide === 'left' }"
                    @click="preferences.gestureSide = 'left'"
                  >
                    左侧
                  </button>
                  <button
                    :class="{ active: preferences.gestureSide === 'right' }"
                    @click="preferences.gestureSide = 'right'"
                  >
                    右侧
                  </button>
                  <button
                    v-for="level in gestureSensitivityOptions"
                    :key="level.id"
                    :class="{ active: preferences.gestureSensitivity === level.id }"
                    @click="preferences.gestureSensitivity = level.id"
                  >
                    {{ level.name }}
                  </button>
                </div>
                <div
                  v-if="preferences.gestureEnabled"
                  class="ai-settings-row clickable"
                  @click="preferences.hapticsEnabled = !preferences.hapticsEnabled"
                >
                  <div class="ai-settings-row-left">
                    <div class="ai-settings-icon"><span class="settings-glyph">◉</span></div>
                    <div class="ai-settings-label-stack">
                      <span class="ai-settings-label">触感反馈</span
                      ><span class="ai-settings-desc">支持的设备在手势完成时轻触反馈</span>
                    </div>
                  </div>
                  <span
                    :class="['ai-settings-switch', { enabled: preferences.hapticsEnabled }]"
                  ></span>
                </div>
                <div
                  class="ai-settings-row"
                  :class="{ expanded: showOpenBehaviorPicker }"
                  @click="showOpenBehaviorPicker = !showOpenBehaviorPicker"
                >
                  <div class="ai-settings-row-left">
                    <div class="ai-settings-icon"><span class="settings-glyph">↗</span></div>
                    <div class="ai-settings-label-stack">
                      <span class="ai-settings-label">呼出后打开</span
                      ><span class="ai-settings-desc"
                        >{{ currentOpenBehaviorName }} ·
                        {{ preferences.initialHeight === 'full' ? '全屏' : '舒适高度' }}</span
                      >
                    </div>
                  </div>
                  <span class="ai-settings-chevron" :class="{ expanded: showOpenBehaviorPicker }"
                    >›</span
                  >
                </div>
                <div v-if="showOpenBehaviorPicker" class="ai-settings-inline-options">
                  <button
                    v-for="option in openBehaviorOptions"
                    :key="option.id"
                    type="button"
                    :class="[
                      'ai-settings-inline-option',
                      { active: preferences.openBehavior === option.id },
                    ]"
                    @click.stop="preferences.openBehavior = option.id"
                  >
                    <span class="ai-settings-option-main"
                      ><strong>{{ option.name }}</strong
                      ><small>{{ option.description }}</small></span
                    ><Check v-if="preferences.openBehavior === option.id" size="16" />
                  </button>
                  <div class="ai-settings-inline-segmented no-indent">
                    <button
                      :class="{ active: preferences.initialHeight === 'comfortable' }"
                      @click.stop="preferences.initialHeight = 'comfortable'"
                    >
                      舒适高度</button
                    ><button
                      :class="{ active: preferences.initialHeight === 'full' }"
                      @click.stop="preferences.initialHeight = 'full'"
                    >
                      全屏
                    </button>
                  </div>
                </div>
                <div
                  class="ai-settings-row clickable"
                  @click="preferences.autoFocus = !preferences.autoFocus"
                >
                  <div class="ai-settings-row-left">
                    <div class="ai-settings-icon"><span class="settings-glyph">I</span></div>
                    <div class="ai-settings-label-stack">
                      <span class="ai-settings-label">自动聚焦输入框</span
                      ><span class="ai-settings-desc">呼出后可直接输入</span>
                    </div>
                  </div>
                  <span :class="['ai-settings-switch', { enabled: preferences.autoFocus }]"></span>
                </div>
              </div>
            </div>

            <!-- 底部数据行 -->
            <div class="ai-settings-card">
              <div class="ai-settings-group-title">数据</div>
              <div class="ai-settings-list">
                <div class="ai-settings-row clickable" @click="$emit('clearCurrentChat')">
                  <div class="ai-settings-row-left">
                    <div class="ai-settings-icon bg-gray">
                      <Trash2 size="16" />
                    </div>
                    <div class="ai-settings-label-stack">
                      <span class="ai-settings-label">清除当前对话</span>
                    </div>
                  </div>
                  <div class="ai-settings-row-right">
                    <span class="ai-settings-chevron">›</span>
                  </div>
                </div>
                <div class="ai-settings-row clickable" @click="$emit('exportChatData')">
                  <div class="ai-settings-row-left">
                    <div class="ai-settings-icon bg-indigo">
                      <span style="font-size: 11px; font-weight: 800">JSON</span>
                    </div>
                    <div class="ai-settings-label-stack">
                      <span class="ai-settings-label">导出对话数据</span>
                      <span class="ai-settings-desc">下载 JSON 格式的全部对话记录</span>
                    </div>
                  </div>
                  <div class="ai-settings-row-right">
                    <span class="ai-settings-chevron">›</span>
                  </div>
                </div>
                <div class="ai-settings-row clickable danger" @click="$emit('clearAllChatData')">
                  <div class="ai-settings-row-left">
                    <div class="ai-settings-icon bg-red">
                      <Trash2 size="16" />
                    </div>
                    <div class="ai-settings-label-stack">
                      <span class="ai-settings-label text-danger">清除所有对话</span>
                      <span class="ai-settings-desc">删除全部对话历史，不可撤销</span>
                    </div>
                  </div>
                  <div class="ai-settings-row-right">
                    <span class="ai-settings-chevron text-danger">›</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="ai-settings-footer">
              <strong>BOH AI v2.5 Beta</strong>
              <span>你的对话数据仅用于提供当前产品功能</span>
            </div>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, nextTick, watch, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { X, ArrowLeft, Settings, Check, Trash2 } from 'lucide-vue-next';
import {
  useGlobalAiPreferences,
  getGlobalAiShortcutLabel,
} from '@/composables/useGlobalAiPreferences.js';
import { getAiQuotaStatus } from '@/utils/api/api-key-runtime-api.js';
import { getMySubscriptions } from '@/utils/api/subscription-api.js';
import { resolveHighestTierCode } from '@/utils/subscription-benefits.js';
import { useAuthStore } from '@/stores/auth';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  embedded: { type: Boolean, default: false },
  // 'usage' 时打开即滚到用量卡（输入区「完整用量 / 用量详情」入口用）
  focusSection: { type: String, default: '' },
  currentMode: { type: Object, default: () => ({}) },
  currentModeId: { type: String, default: '' },
  chatModes: { type: Array, default: () => [] },
  currentResponseStyleId: { type: String, default: '' },
  responseStyleOptions: { type: Array, default: () => [] },
  isTreeholeMemoryEnabled: { type: Boolean, default: false },
  isSharedMemoryEnabled: { type: Boolean, default: false },
  isTreeholeMemoryToggling: { type: Boolean, default: false },
  memoryStatusText: { type: String, default: '' },
  resolvedTheme: { type: String, default: 'light' },
});

// 2026-10-03（plans/023 步骤 ④）：
//  - 删 selectThinkingSpeed —— 思考强度只在输入区面板（同一个状态，不再有第二个入口）
//  - 删 openQuotaPanel —— 额度侧板已退役，用量卡就在本面板内，不需要再跳一层
const emit = defineEmits([
  'update:modelValue',
  'selectMode',
  'selectResponseStyle',
  'toggleTreeholeMemory',
  'toggleSharedMemory',
  'clearCurrentChat',
  'exportChatData',
  'clearAllChatData',
]);

const router = useRouter();
const authStore = useAuthStore();
const isLoggedIn = computed(() => authStore.isLoggedIn);

const showModePicker = ref(false);
const showStylePicker = ref(false);
const showShortcutPicker = ref(false);
const showOpenBehaviorPicker = ref(false);
const showAdvanced = ref(false);
const drawerRef = ref(null);
const titleRef = ref(null);
const closeBtnRef = ref(null);
const usageCardRef = ref(null);
const quota = ref(null);
const quotaLoading = ref(false);
let focusRestore = null;
const { preferences } = useGlobalAiPreferences();

const TIER_LABELS = {
  guest: '未登录用户',
  free: '免费用户',
  plus: 'Plus',
  pro: 'Pro',
  max: 'Max',
  ultra: 'Ultra',
};

// 消耗倍率显示：去掉多余的尾零（1.00 → 1，0.50 → 0.5，0.06 → 0.06）
const formatQuotaMultiplier = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return '1';
  return String(parseFloat(num.toFixed(2)));
};

const shortcutOptions = [
  { id: 'mod+k', name: '⌘/Ctrl + K', description: '通用且容易记忆；Lab 页面保留给命令面板' },
  { id: 'mod+j', name: '⌘/Ctrl + J', description: '适合需要避开命令面板的页面' },
  { id: 'mod+space', name: '⌘/Ctrl + Space', description: '接近系统级助手的呼出习惯' },
];
const gestureSensitivityOptions = [
  { id: 'high', name: '灵敏' },
  { id: 'medium', name: '标准' },
  { id: 'low', name: '稳健' },
];
const openBehaviorOptions = [
  { id: 'resume', name: '继续上次对话', description: '保留阅读位置和未发送内容' },
  { id: 'new', name: '每次新对话', description: '每次呼出都创建可保存的新会话' },
  { id: 'temporary', name: '临时对话', description: '关闭后不会写入历史记录' },
];
const appearanceOptions = [
  { id: 'system', name: '跟随网站' },
  { id: 'light', name: '浅色' },
  { id: 'dark', name: '深色' },
];
const shortcutLabel = computed(() => getGlobalAiShortcutLabel(preferences.shortcut));
const currentOpenBehaviorName = computed(
  () =>
    openBehaviorOptions.find((option) => option.id === preferences.openBehavior)?.name ||
    '继续上次对话',
);
const formatTokenCount = (value) =>
  new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(
    Math.max(0, Number(value || 0)),
  );
const formatQuotaPercent = (value) => {
  if (value <= 0) return '0';
  if (value < 1) return value.toFixed(2);
  if (value < 10) return value.toFixed(1);
  return String(Math.round(value));
};

const tierLabel = computed(() => TIER_LABELS[quota.value?.tier] || quota.value?.tier || '');
const quotaUsed = computed(() =>
  Math.max(0, Number(quota.value?.usedTokens ?? quota.value?.used ?? 0)),
);
const quotaLimit = computed(() => Number(quota.value?.tokenLimit ?? quota.value?.limit ?? 0));
const quotaPercent = computed(() =>
  quotaLimit.value > 0 ? Math.min(100, Math.max(0, (quotaUsed.value / quotaLimit.value) * 100)) : 0,
);
const quotaPercentLabel = computed(() => formatQuotaPercent(quotaPercent.value));
const quotaRemaining = computed(() =>
  quotaLimit.value === -1
    ? -1
    : Math.max(0, Number(quota.value?.remainingTokens ?? quotaLimit.value - quotaUsed.value)),
);

// 联网搜索用量（与原 AiQuotaSidePanel 同源字段）
const webSearchUsed = computed(() => Math.max(0, Number(quota.value?.webSearchUsed ?? 0)));
const webSearchLimit = computed(() => Number(quota.value?.webSearchLimit ?? 0));
const webSearchRemaining = computed(() =>
  webSearchLimit.value === -1
    ? -1
    : Math.max(
        0,
        Number(quota.value?.webSearchRemaining ?? webSearchLimit.value - webSearchUsed.value),
      ),
);
const webPercent = computed(() =>
  webSearchLimit.value > 0
    ? Math.min(100, Math.max(0, (webSearchUsed.value / webSearchLimit.value) * 100))
    : 0,
);
const webPercentLabel = computed(() => formatQuotaPercent(webPercent.value));

// 积分计费（quota-status 在 ai_pricing_config.enabled 且 free 档时下发 pointsMode）
const pointsMode = computed(() => quota.value?.pointsMode === true);
const pointsBalance = computed(() => Math.max(0, Number(quota.value?.pointsBalance ?? 0)));
const pointsUsedToday = computed(() => Math.max(0, Number(quota.value?.pointsUsedToday ?? 0)));
const pointsMultiplierLabel = computed(() =>
  String(Math.round(Number(quota.value?.pointsMultiplier ?? 1) * 100) / 100),
);
const rateTokensPerPoint = computed(() =>
  Math.max(0, Number(quota.value?.pricing?.rateTokensPerPoint ?? 0)),
);

const currentResponseStyleName = computed(() => {
  const style = props.responseStyleOptions?.find((s) => s.id === props.currentResponseStyleId);
  return style?.shortName || style?.name || '默认';
});

// ⚠️ 订阅档位查询是「锦上添花」，必须单独兜错：它的失败**不能**让整块用量变空。
// 原 AiQuotaSidePanel 把两个请求放在一个 Promise.all 里、外层只包一个 try —— 订阅接口
// 一旦 reject（网络/权限），quota-status 明明成功也会被一起丢掉，用户看到的是空白面板。
// 2026-10-03 搬进设置面板时实测踩到（探针 C1/C3 就是这个症状），这里改成内联 catch。
const fetchQuota = async () => {
  quotaLoading.value = true;
  try {
    const [quotaRes, subsRes] = await Promise.all([
      getAiQuotaStatus(),
      authStore.userInfo?.id
        ? getMySubscriptions(authStore.userInfo.id, { includeExpired: false }).catch(() => ({
            ok: false,
            data: [],
          }))
        : Promise.resolve({ ok: false, data: [] }),
    ]);
    if (quotaRes?.ok && quotaRes.data) {
      const data = { ...quotaRes.data };
      const realTier = resolveHighestTierCode(subsRes?.data || []);
      if (realTier) data.tier = realTier;
      quota.value = data;
    } else {
      quota.value = null;
    }
  } catch {
    quota.value = null;
  } finally {
    quotaLoading.value = false;
    // 用量卡是「数据到了才变高」的：打开时滚一次只能滚到 loading 态，
    // 数据落定后必须再滚一次，否则 focus-section='usage' 会停在半路。
    await nextTick();
    scrollToUsageCard();
  }
};

const scrollToUsageCard = () => {
  if (!props.modelValue || props.focusSection !== 'usage') return;
  usageCardRef.value?.scrollIntoView({ block: 'start' });
};

const handleLogin = () => {
  authStore.showLoginModal = true;
  close();
};

const handleUpgrade = () => {
  close();
  router.push('/user-center/subscriptions');
};

const close = () => {
  showModePicker.value = false;
  showStylePicker.value = false;
  showShortcutPicker.value = false;
  showOpenBehaviorPicker.value = false;
  emit('update:modelValue', false);
  const el = focusRestore;
  focusRestore = null;
  if (el && typeof el.focus === 'function') {
    nextTick(() => el.focus());
  }
};

const handleTabTrap = (e) => {
  const drawer = drawerRef.value;
  if (!drawer) return;
  const focusable = drawer.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
  );
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const current = document.activeElement;
  if (e.shiftKey) {
    if (current === first || !drawer.contains(current)) {
      e.preventDefault();
      last.focus();
    }
  } else {
    if (current === last || !drawer.contains(current)) {
      e.preventDefault();
      first.focus();
    }
  }
};

watch(
  () => props.modelValue,
  async (open) => {
    if (open) {
      focusRestore = document.activeElement;
      await nextTick();
      closeBtnRef.value?.focus();
      if (props.focusSection === 'usage') {
        await nextTick();
        scrollToUsageCard();
      }
      void fetchQuota();
    } else {
      showModePicker.value = false;
      showStylePicker.value = false;
      showShortcutPicker.value = false;
      showOpenBehaviorPicker.value = false;
      if (focusRestore && typeof focusRestore.focus === 'function') {
        nextTick(() => focusRestore.focus());
      }
      focusRestore = null;
    }
  },
);

onUnmounted(() => {
  focusRestore = null;
});
</script>

<style>
.ai-settings-backdrop {
  position: fixed !important;
  inset: 0 !important;
  z-index: 2147483600 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  padding: 24px !important;
  background: rgba(0, 0, 0, 0.42) !important;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.ai-settings-backdrop.is-embedded {
  position: absolute !important;
  padding: 0 !important;
  align-items: stretch !important;
  justify-content: stretch !important;
  background: #ffffff !important;
  z-index: 300 !important;
}

.ai-settings-backdrop.is-embedded .ai-settings-drawer {
  width: 100% !important;
  height: 100% !important;
  max-width: none !important;
  border: 0 !important;
  border-radius: 0 !important;
  box-shadow: none !important;
}

.ai-settings-drawer {
  position: relative !important;
  z-index: 1 !important;
  width: min(560px, calc(100vw - 48px)) !important;
  height: min(760px, calc(100dvh - 48px)) !important;
  display: grid !important;
  grid-template-rows: auto minmax(0, 1fr) !important;
  overflow: hidden !important;
  border: 1px solid #d9d9d9 !important;
  border-radius: 8px !important;
  background: #ffffff !important;
  color: #171717 !important;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.22) !important;
}

.ai-settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 56px;
  padding: 10px 16px;
  border-bottom: 1px solid #e5e5e5;
}

.ai-settings-header h2 {
  margin: 0;
  font-size: 18px;
  line-height: 1.2;
  font-weight: 600;
}

.ai-settings-close-btn {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #737373;
  cursor: pointer;
}

.ai-settings-close-btn:hover {
  background: #f2f2f2;
  color: #171717;
}

.ai-settings-body {
  min-height: 0;
  overflow-y: auto;
  padding: 8px 20px 20px;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.ai-settings-card {
  background: #ffffff;
  border: 0;
  border-radius: 0;
  overflow: hidden;
  flex-shrink: 0;
  box-shadow: none;
}

.ai-settings-group-title {
  font-size: 12px;
  font-weight: 600;
  color: #737373;
  letter-spacing: 0;
  padding: 22px 12px 8px;
  margin: 0;
}

.ai-settings-list {
  display: block;
}
.ai-settings-list:empty {
  display: none;
}

.ai-settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 56px;
  padding: 10px 12px;
  transition: background-color 0.15s ease;
}

.ai-settings-row.clickable {
  cursor: pointer;
}
.ai-settings-row.disabled {
  cursor: wait;
  opacity: 0.62;
}
.ai-settings-row:not(:last-child) {
  border-bottom: 1px solid #eeeeee;
}
.ai-settings-row:hover,
.ai-settings-row.expanded {
  background: #f7f7f7;
}

.ai-settings-row-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 1;
}

.ai-settings-icon {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: transparent !important;
  color: #525252 !important;
  flex-shrink: 0;
}

.ai-settings-label-stack {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.ai-settings-label {
  font-size: 14px;
  font-weight: 500;
  color: #171717;
  line-height: 1.3;
}

.ai-settings-desc,
.ai-settings-value {
  font-size: 12px;
  color: #737373;
  line-height: 1.3;
}

.ai-settings-row-right {
  display: flex;
  align-items: center;
  min-width: 0;
  max-width: 120px;
}

.ai-settings-chevron {
  color: #94a3b8;
  font-size: 18px;
  line-height: 1;
  transition: transform 0.2s ease;
}

.ai-settings-chevron.expanded {
  transform: rotate(90deg);
}

/* 「高级 · 呼出方式」折叠头：与行同高，但整块可点 */
.ai-settings-collapse-head {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 56px;
  padding: 10px 12px;
  border: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.ai-settings-collapse-title {
  font-size: 14px;
  font-weight: 500;
  color: #171717;
}

.ai-settings-collapse-head:hover {
  background: #f7f7f7;
}

.ai-settings-inline-options {
  display: flex;
  flex-direction: column;
  padding: 4px 12px 10px 50px;
  gap: 4px;
  background: #ffffff;
  border-top: 1px solid #eeeeee;
}

.ai-settings-inline-segmented {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 4px;
  margin: 7px 12px 10px 50px;
  padding: 4px;
  border-radius: 9px;
  background: #f1f1f1;
}

.ai-settings-inline-segmented.no-indent {
  margin: 8px 0 0;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.ai-settings-inline-segmented.settings-wide-segmented {
  margin-left: 12px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.ai-settings-inline-segmented.settings-wide-segmented + .settings-wide-segmented {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.ai-settings-inline-segmented.font-scale-segmented {
  grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
}

.ai-settings-inline-segmented button {
  min-width: 0;
  min-height: 30px;
  padding: 5px 6px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: #737373;
  font-size: 11px;
  cursor: pointer;
}

.ai-settings-inline-segmented button.active {
  background: #ffffff;
  color: #171717;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.09);
}
.settings-glyph {
  font-size: 12px;
  font-weight: 750;
}

.ai-settings-row,
.ai-settings-collapse-head,
.ai-settings-inline-option,
.ai-settings-inline-segmented button,
.ai-settings-close-btn {
  transition:
    transform 140ms ease,
    background-color 160ms ease,
    border-color 160ms ease,
    color 160ms ease,
    box-shadow 180ms ease;
}

.ai-settings-row.clickable:hover {
  transform: translateX(2px);
}
.ai-settings-row.clickable:active {
  transform: translateX(1px) scale(0.995);
}
.ai-settings-inline-option:hover {
  transform: translateX(2px);
}
.ai-settings-inline-option:active,
.ai-settings-inline-segmented button:active,
.ai-settings-close-btn:active {
  transform: scale(0.96);
}

.ai-settings-inline-options,
.ai-settings-inline-segmented {
  animation: settings-options-enter 210ms cubic-bezier(0.16, 1, 0.3, 1) both;
  transform-origin: top center;
}

.ai-settings-card {
  animation: settings-section-enter 320ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

.ai-settings-card:nth-child(2) {
  animation-delay: 35ms;
}
.ai-settings-card:nth-child(3) {
  animation-delay: 70ms;
}
.ai-settings-card:nth-child(4) {
  animation-delay: 105ms;
}
.ai-settings-card:nth-child(n + 5) {
  animation-delay: 130ms;
}

.ai-settings-backdrop.is-embedded.settings-slide-enter-active,
.ai-settings-backdrop.is-embedded.settings-slide-leave-active {
  transition: opacity 220ms ease !important;
}

.ai-settings-backdrop.is-embedded.settings-slide-enter-active .ai-settings-drawer,
.ai-settings-backdrop.is-embedded.settings-slide-leave-active .ai-settings-drawer {
  transition:
    transform 300ms cubic-bezier(0.16, 1, 0.3, 1),
    opacity 220ms ease !important;
}

.ai-settings-backdrop.is-embedded.settings-slide-enter-from .ai-settings-drawer {
  transform: translateX(28px) !important;
  opacity: 0;
}

.ai-settings-backdrop.is-embedded.settings-slide-leave-to .ai-settings-drawer {
  transform: translateX(18px) !important;
  opacity: 0;
}

@keyframes settings-options-enter {
  from {
    opacity: 0;
    transform: translateY(-6px) scaleY(0.97);
  }
  to {
    opacity: 1;
    transform: translateY(0) scaleY(1);
  }
}

@keyframes settings-section-enter {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.ai-settings-inline-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease;
}

.ai-settings-inline-option:hover {
  background: #f2f2f2;
}
.ai-settings-inline-option.active {
  border-color: #d1d1d1;
  background: #f2f2f2;
}

.ai-settings-memory-status {
  margin: 8px 12px 12px 50px;
  padding: 9px 11px;
  border-radius: 8px;
  background: #f5f5f5;
  color: #525252;
  font-size: 12px;
  line-height: 1.45;
}

/* ── 用量卡（2026-10-03 承接退役的 AiQuotaSidePanel）─────────────── */
.ai-settings-usage-plan {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 12px 16px;
  border-bottom: 1px solid #eeeeee;
}

.ai-settings-usage-plan > div {
  display: grid;
  gap: 3px;
}

.ai-settings-usage-plan span {
  color: #737373;
  font-size: 12px;
}
.ai-settings-usage-plan strong {
  color: #171717;
  font-size: 16px;
}

/* chip 是 span，会被上面 `.ai-settings-usage-plan span` 命中 —— 用更高特异性压过，
   不要用 !important（!important 棘轮是文件级、只降不升，见 plans/007）。 */
.ai-settings-usage-plan .ai-settings-usage-chip {
  padding: 5px 9px;
  border-radius: 999px;
  background: #f2f2f2;
  color: #525252;
  font-weight: 600;
}

.ai-settings-usage-section {
  padding: 16px 12px;
  border-bottom: 1px solid #eeeeee;
}

.ai-settings-usage-section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 11px;
}

.ai-settings-usage-section-head > div {
  display: grid;
  gap: 3px;
}
.ai-settings-usage-section-head strong {
  color: #171717;
  font-size: 14px;
}
.ai-settings-usage-section-head span {
  color: #737373;
  font-size: 11px;
}
.ai-settings-usage-section-head b {
  color: #171717;
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}

.ai-settings-usage-values {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-top: 8px;
  color: #737373;
  font-size: 11px;
}

.ai-settings-usage-remaining {
  margin-top: 11px;
  color: #404040;
  font-size: 12px;
  font-weight: 550;
}

.ai-settings-usage-note {
  margin: 14px 12px 0;
  color: #737373;
  font-size: 11px;
  line-height: 1.5;
}

.ai-settings-usage-action {
  display: block;
  width: calc(100% - 24px);
  margin: 14px 12px 4px;
  padding: 12px;
  border: none;
  border-radius: 10px;
  background: #171717;
  color: #ffffff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.ai-settings-usage-action:hover {
  background: #000000;
}

.ai-settings-usage-tier-note {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 12px 4px;
}

.ai-settings-usage-tier-note strong {
  font-size: 13px;
  font-weight: 700;
  color: #737373;
}
.ai-settings-usage-tier-note span {
  font-size: 12px;
  color: #94a3b8;
}

.ai-settings-quota-overview {
  display: block;
  width: calc(100% - 24px);
  margin: 14px 12px;
  padding: 11px 12px;
  border: 1px solid #e5e5e5;
  border-radius: 9px;
  background: #fafafa;
  color: #525252;
  text-align: left;
}
.ai-settings-quota-head,
.ai-settings-quota-values,
.ai-settings-quota-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.ai-settings-quota-head {
  color: #171717;
  font-size: 12px;
  font-weight: 600;
}
.ai-settings-quota-head strong {
  color: #171717;
  font-size: 15px;
}
.ai-settings-quota-values {
  margin-top: 7px;
  color: #525252;
  font-size: 12px;
}
.ai-settings-quota-track {
  height: 6px;
  margin-top: 9px;
  overflow: hidden;
  border-radius: 999px;
  background: #e5e5e5;
}
.ai-settings-quota-track span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: #171717;
  transition: width 360ms cubic-bezier(0.16, 1, 0.3, 1);
}
.ai-settings-quota-track span.is-web {
  background: #6b7280;
}
.ai-settings-quota-track span.has-usage {
  min-width: 3px;
}
.ai-settings-quota-track span.warn {
  background: #b7791f;
}
.ai-settings-quota-track span.danger {
  background: #c53030;
}
.ai-settings-quota-track span.unlimited {
  background: repeating-linear-gradient(90deg, #4b5563 0 10px, #9ca3af 10px 18px);
}
.ai-settings-quota-foot {
  margin-top: 7px;
  color: #737373;
  font-size: 11px;
}
.ai-settings-quota-loading {
  display: block;
  padding: 14px 12px;
  color: #737373;
  font-size: 12px;
}

.ai-settings-backdrop[data-theme='dark'] {
  background: rgba(8, 8, 8, 0.62) !important;
}

.ai-settings-backdrop.is-embedded[data-theme='dark'],
.ai-settings-backdrop[data-theme='dark'] .ai-settings-drawer,
.ai-settings-backdrop[data-theme='dark'] .ai-settings-card,
.ai-settings-backdrop[data-theme='dark'] .ai-settings-inline-options {
  background: #212121 !important;
  color: #f5f5f5 !important;
}

.ai-settings-backdrop[data-theme='dark'] .ai-settings-header,
.ai-settings-backdrop[data-theme='dark'] .ai-settings-row:not(:last-child),
.ai-settings-backdrop[data-theme='dark'] .ai-settings-inline-options,
.ai-settings-backdrop[data-theme='dark'] .ai-settings-usage-plan,
.ai-settings-backdrop[data-theme='dark'] .ai-settings-usage-section {
  border-color: #383838 !important;
}

.ai-settings-backdrop[data-theme='dark'] .ai-settings-label,
.ai-settings-backdrop[data-theme='dark'] .ai-settings-option-main strong,
.ai-settings-backdrop[data-theme='dark'] .ai-settings-header h2,
.ai-settings-backdrop[data-theme='dark'] .ai-settings-collapse-title {
  color: #f5f5f5;
}

.ai-settings-backdrop[data-theme='dark'] .ai-settings-desc,
.ai-settings-backdrop[data-theme='dark'] .ai-settings-group-title,
.ai-settings-backdrop[data-theme='dark'] .ai-settings-option-main small {
  color: #a3a3a3;
}

.ai-settings-backdrop[data-theme='dark'] .ai-settings-row:hover,
.ai-settings-backdrop[data-theme='dark'] .ai-settings-row.expanded,
.ai-settings-backdrop[data-theme='dark'] .ai-settings-collapse-head:hover,
.ai-settings-backdrop[data-theme='dark'] .ai-settings-inline-option:hover,
.ai-settings-backdrop[data-theme='dark'] .ai-settings-inline-option.active,
.ai-settings-backdrop[data-theme='dark'] .ai-settings-memory-status {
  background: #303030;
}

.ai-settings-backdrop[data-theme='dark'] .ai-settings-inline-segmented {
  background: #303030;
}

.ai-settings-backdrop[data-theme='dark'] .ai-settings-inline-segmented button.active {
  background: #454545;
  color: #ffffff;
}

.ai-settings-backdrop[data-theme='dark'] .ai-settings-usage-plan strong,
.ai-settings-backdrop[data-theme='dark'] .ai-settings-usage-section-head strong,
.ai-settings-backdrop[data-theme='dark'] .ai-settings-usage-section-head b {
  color: #f5f5f5;
}

.ai-settings-backdrop[data-theme='dark'] .ai-settings-usage-plan span,
.ai-settings-backdrop[data-theme='dark'] .ai-settings-usage-section-head span,
.ai-settings-backdrop[data-theme='dark'] .ai-settings-usage-values,
.ai-settings-backdrop[data-theme='dark'] .ai-settings-usage-note {
  color: #a3a3a3;
}

.ai-settings-backdrop[data-theme='dark'] .ai-settings-usage-remaining {
  color: #d4d4d4;
}
.ai-settings-backdrop[data-theme='dark'] .ai-settings-usage-plan .ai-settings-usage-chip {
  background: #303030;
  color: #d4d4d4;
}
.ai-settings-backdrop[data-theme='dark'] .ai-settings-usage-action {
  background: #f5f5f5;
  color: #171717;
}
.ai-settings-backdrop[data-theme='dark'] .ai-settings-usage-action:hover {
  background: #ffffff;
}
.ai-settings-backdrop[data-theme='dark'] .ai-settings-usage-tier-note strong {
  color: #a3a3a3;
}
.ai-settings-backdrop[data-theme='dark'] .ai-settings-usage-tier-note span {
  color: #737373;
}

.ai-settings-backdrop[data-theme='dark'] .ai-settings-quota-overview {
  border-color: #454545;
  background: #2b2b2b;
  color: #d4d4d4;
}
.ai-settings-backdrop[data-theme='dark'] .ai-settings-quota-head,
.ai-settings-backdrop[data-theme='dark'] .ai-settings-quota-head strong {
  color: #f5f5f5;
}
.ai-settings-backdrop[data-theme='dark'] .ai-settings-quota-values {
  color: #d4d4d4;
}
.ai-settings-backdrop[data-theme='dark'] .ai-settings-quota-foot {
  color: #a3a3a3;
}
.ai-settings-backdrop[data-theme='dark'] .ai-settings-quota-track {
  background: #454545;
}

.ai-settings-option-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.ai-settings-option-main strong {
  font-size: 14px;
  font-weight: 600;
  color: #171717;
}
.ai-settings-option-main small {
  font-size: 12px;
  color: #737373;
  line-height: 1.3;
}

.ai-settings-option-meta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex: none;
}

.ai-settings-option-multiplier {
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0.01em;
  color: #737373;
  font-variant-numeric: tabular-nums;
}

.ai-settings-backdrop[data-theme='dark'] .ai-settings-option-multiplier {
  color: #a3a3a3;
}

.ai-settings-switch {
  position: relative;
  width: 38px;
  height: 22px;
  border-radius: 999px;
  background: #cbd5e1;
  flex-shrink: 0;
  transition: background-color 0.2s ease;
}

.ai-settings-switch::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  border-radius: 999px;
  background: #ffffff;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.22);
  transition: transform 0.2s ease;
}

.ai-settings-switch.enabled {
  background: #171717;
}
.ai-settings-switch.enabled::after {
  transform: translateX(16px);
}

.ai-settings-footer {
  text-align: center;
  padding: 14px 0 4px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.ai-settings-footer strong {
  font-size: 13px;
  font-weight: 700;
  color: #64748b;
}
.ai-settings-footer span {
  font-size: 12px;
  color: #94a3b8;
}

.bg-blue {
  background-color: #ebf5ff;
  color: #007aff;
}
.bg-green {
  background-color: #e8f9ee;
  color: #34c759;
}
.bg-purple {
  background-color: #f7efff;
  color: #af52de;
}
.bg-orange {
  background-color: #fff3e0;
  color: #f59e0b;
}
.bg-gray {
  background-color: #f5f5f7;
  color: #8e8e93;
}
.bg-indigo {
  background-color: #eeedff;
  color: #5856d6;
}
.bg-red {
  background-color: #ffe5e5;
  color: #dc2626;
}

.ai-settings-row.danger .ai-settings-label,
.ai-settings-row.danger .ai-settings-desc {
  color: #dc2626;
}
.ai-settings-row.danger:hover {
  background: rgba(220, 38, 38, 0.04);
}
.ai-settings-chevron.text-danger {
  color: #dc2626;
}

/* Transition animations */
.settings-slide-enter-active {
  transition: opacity 0.2s ease;
}
.settings-slide-enter-active .ai-settings-drawer {
  transition:
    transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1),
    opacity 0.25s ease;
}
.settings-slide-leave-active {
  transition: opacity 0.18s ease;
}
.settings-slide-leave-active .ai-settings-drawer {
  transition:
    transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1),
    opacity 0.2s ease;
}
.settings-slide-enter-from,
.settings-slide-leave-to {
  opacity: 0;
}
.settings-slide-enter-from .ai-settings-drawer {
  opacity: 0;
  transform: translateY(10px) scale(0.98);
}
.settings-slide-leave-to .ai-settings-drawer {
  opacity: 0;
  transform: translateY(8px) scale(0.98);
}

[data-boh-theme='dark'] .ai-settings-drawer {
  background: #212121 !important;
  border-color: rgba(255, 255, 255, 0.1) !important;
  color: #f8fafc !important;
}
[data-boh-theme='dark'] .ai-settings-backdrop.is-embedded {
  background: #212121 !important;
}
[data-boh-theme='dark'] .ai-settings-inline-segmented {
  background: #303030;
}
[data-boh-theme='dark'] .ai-settings-inline-segmented button {
  color: #a3a3a3;
}
[data-boh-theme='dark'] .ai-settings-inline-segmented button.active {
  background: #424242;
  color: #fff;
}

[data-boh-theme='dark'] .ai-settings-card {
  background: #212121;
  border-color: rgba(255, 255, 255, 0.08);
}

[data-boh-theme='dark'] .ai-settings-group-title {
  color: #9ca3af;
}
[data-boh-theme='dark'] .ai-settings-label,
[data-boh-theme='dark'] .ai-settings-collapse-title {
  color: #f8fafc;
}
[data-boh-theme='dark'] .ai-settings-desc,
[data-boh-theme='dark'] .ai-settings-value {
  color: #9ca3af;
}
[data-boh-theme='dark'] .ai-settings-chevron {
  color: #6b7280;
}

[data-boh-theme='dark'] .ai-settings-row:hover,
[data-boh-theme='dark'] .ai-settings-row.expanded,
[data-boh-theme='dark'] .ai-settings-collapse-head:hover {
  background: rgba(255, 255, 255, 0.06);
}

[data-boh-theme='dark'] .ai-settings-inline-options {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.06);
}

[data-boh-theme='dark'] .ai-settings-inline-option {
  background: rgba(40, 40, 42, 0.6);
}
[data-boh-theme='dark'] .ai-settings-inline-option.active {
  border-color: rgba(16, 163, 127, 0.45);
  background: rgba(16, 163, 127, 0.12);
}

[data-boh-theme='dark'] .ai-settings-option-main strong {
  color: #f8fafc;
}
[data-boh-theme='dark'] .ai-settings-option-main small {
  color: #9ca3af;
}
[data-boh-theme='dark'] .ai-settings-icon {
  background: rgba(255, 255, 255, 0.08);
}
[data-boh-theme='dark'] .ai-settings-header {
  border-color: rgba(255, 255, 255, 0.1);
}
[data-boh-theme='dark'] .ai-settings-close-btn {
  color: #9ca3af;
}
[data-boh-theme='dark'] .ai-settings-close-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #f8fafc;
}
[data-boh-theme='dark'] .ai-settings-footer strong,
[data-boh-theme='dark'] .ai-settings-footer span {
  color: #9ca3af;
}

[data-boh-theme='dark'] .ai-settings-usage-plan strong,
[data-boh-theme='dark'] .ai-settings-usage-section-head strong,
[data-boh-theme='dark'] .ai-settings-usage-section-head b {
  color: #f8fafc;
}
[data-boh-theme='dark'] .ai-settings-usage-plan span,
[data-boh-theme='dark'] .ai-settings-usage-section-head span,
[data-boh-theme='dark'] .ai-settings-usage-values,
[data-boh-theme='dark'] .ai-settings-usage-note {
  color: #9ca3af;
}
[data-boh-theme='dark'] .ai-settings-usage-remaining {
  color: #d4d4d4;
}
[data-boh-theme='dark'] .ai-settings-usage-plan .ai-settings-usage-chip {
  background: #303030;
  color: #d4d4d4;
}
[data-boh-theme='dark'] .ai-settings-usage-action {
  background: #f5f5f5;
  color: #171717;
}
[data-boh-theme='dark'] .ai-settings-usage-action:hover {
  background: #ffffff;
}
[data-boh-theme='dark'] .ai-settings-usage-tier-note strong {
  color: #9ca3af;
}
[data-boh-theme='dark'] .ai-settings-usage-tier-note span {
  color: #6b7280;
}
[data-boh-theme='dark'] .ai-settings-quota-overview {
  border-color: #454545;
  background: #2b2b2b;
  color: #d4d4d4;
}
[data-boh-theme='dark'] .ai-settings-quota-head,
[data-boh-theme='dark'] .ai-settings-quota-head strong {
  color: #f8fafc;
}
[data-boh-theme='dark'] .ai-settings-quota-values {
  color: #d4d4d4;
}
[data-boh-theme='dark'] .ai-settings-quota-foot {
  color: #9ca3af;
}
[data-boh-theme='dark'] .ai-settings-quota-track {
  background: #454545;
}

@media (max-width: 768px) and (orientation: portrait) {
  .ai-settings-backdrop {
    align-items: flex-end !important;
    padding: 0 !important;
  }
  .ai-settings-drawer {
    width: 100% !important;
    height: min(88dvh, 720px) !important;
    border-radius: 8px 8px 0 0 !important;
  }
  .ai-settings-backdrop.is-embedded .ai-settings-drawer {
    height: 100% !important;
  }
  .ai-settings-inline-segmented {
    margin-left: 12px;
  }
  .settings-slide-enter-from .ai-settings-drawer {
    transform: translateY(30px);
  }
  .settings-slide-leave-to .ai-settings-drawer {
    transform: translateY(20px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .ai-settings-backdrop *,
  .ai-settings-backdrop *::before,
  .ai-settings-backdrop *::after {
    animation-duration: 1ms !important;
    animation-delay: 0ms !important;
    transition-duration: 1ms !important;
  }
}
</style>
