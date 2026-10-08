<template>
  <Teleport to="body" :disabled="embedded">
    <Transition name="settings-slide">
      <div
        v-if="modelValue"
        class="ai-settings-backdrop"
        :class="{ 'is-embedded': embedded, 'is-fullscreen': fullscreen }"
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
          <!-- ══ 左：设置导航 ══════════════════════════════════════════
               2026-10-08 用户口径「设置参考 macOS / ChatGPT 设置页」：
               设置不再是浮在对话上的居中抽屉，而是一个**全屏设置页** ——
               左边是设置自己的分组导航（含「返回应用」与搜索），右边是内容。
               因此打开设置时会话侧栏与全局左栏不再叠在它上面（见 BOHAIMain）。 -->
          <aside class="ai-settings-nav" aria-label="设置分区">
            <button type="button" class="ai-settings-back-app" @click="close">
              <ArrowLeft :size="16" aria-hidden="true" />
              <span>返回应用</span>
            </button>

            <label class="ai-settings-search">
              <Search :size="14" aria-hidden="true" />
              <input v-model="navQuery" type="text" placeholder="搜索设置" aria-label="搜索设置" />
            </label>

            <nav class="ai-settings-nav-list">
              <template v-for="group in filteredNavGroups" :key="group.id">
                <div class="ai-settings-nav-group">{{ group.label }}</div>
                <button
                  v-for="item in group.items"
                  :key="item.id"
                  type="button"
                  class="ai-settings-nav-item"
                  :class="{ 'is-active': activeSection === item.id }"
                  @click="jumpTo(item.id)"
                >
                  <component :is="item.icon" :size="16" aria-hidden="true" />
                  <span>{{ item.label }}</span>
                </button>
              </template>
              <p v-if="filteredNavGroups.length === 0" class="ai-settings-nav-empty">
                没有匹配的设置
              </p>
            </nav>

            <div class="ai-settings-nav-foot">BOH AI v2.5 Beta</div>
          </aside>

          <!-- ══ 右：内容 ══════════════════════════════════════════════ -->
          <div class="ai-settings-main">
            <header class="ai-settings-header">
              <h2 ref="titleRef" tabindex="-1">{{ activeSectionLabel }}</h2>
              <button
                ref="closeBtnRef"
                type="button"
                class="ai-settings-close-btn"
                title="关闭 (Esc)"
                aria-label="关闭设置"
                @click="close"
              >
                <X size="18" />
              </button>
            </header>

            <div
              ref="bodyRef"
              class="ai-settings-body custom-scrollbar"
              @scroll.passive="onBodyScroll"
            >
              <!-- ── 通用 · 对话偏好 ─────────────────────────────── -->
              <section class="ai-settings-section" data-section="chat">
                <div class="ai-settings-group-title">对话偏好</div>
                <div class="ai-settings-card">
                  <div class="ai-settings-list">
                    <div
                      class="ai-settings-row clickable"
                      :class="{ expanded: showModePicker }"
                      @click="showModePicker = !showModePicker"
                    >
                      <div class="ai-settings-label-stack">
                        <span class="ai-settings-label">默认响应模式</span>
                        <span class="ai-settings-desc">{{ currentMode.name || 'Fast' }}</span>
                      </div>
                      <div class="ai-settings-row-right">
                        <span class="ai-settings-chevron" :class="{ expanded: showModePicker }"
                          >›</span
                        >
                      </div>
                    </div>
                    <div v-if="showModePicker" class="ai-settings-inline-options">
                      <button
                        v-for="mode in chatModes"
                        :key="mode.id"
                        type="button"
                        :class="[
                          'ai-settings-inline-option',
                          { active: currentModeId === mode.id },
                        ]"
                        @click.stop="
                          $emit('selectMode', mode.id);
                          showModePicker = false;
                        "
                      >
                        <span class="ai-settings-option-main">
                          <strong>{{ mode.name }}</strong>
                        </span>
                        <span class="ai-settings-option-meta">
                          <!-- 倍率 / 免费 / 自有 Key 的文案走单一真源 utils/mode-rate-label.js。
                               ⚠️ 设置页曾经自己写一份、而且**漏了免费分支** ⇒ 同一个 Fast
                               在输入区显示「免费」、在这里显示「1x」（用户当场问出来的）。 -->
                          <span
                            class="ai-settings-option-multiplier"
                            :title="formatModeRateTitle(mode)"
                          >
                            {{ formatModeRateLabel(mode) }}
                          </span>
                          <Check v-if="currentModeId === mode.id" size="16" />
                        </span>
                      </button>
                    </div>

                    <div
                      class="ai-settings-row clickable"
                      :class="{ expanded: showStylePicker }"
                      @click="showStylePicker = !showStylePicker"
                    >
                      <div class="ai-settings-label-stack">
                        <span class="ai-settings-label">回答风格</span>
                        <span class="ai-settings-desc">{{ currentResponseStyleName }}</span>
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
                      role="switch"
                      tabindex="0"
                      :aria-checked="preferences.enterToSend"
                      @click="preferences.enterToSend = !preferences.enterToSend"
                      @keydown.enter.prevent="preferences.enterToSend = !preferences.enterToSend"
                      @keydown.space.prevent="preferences.enterToSend = !preferences.enterToSend"
                    >
                      <div class="ai-settings-label-stack">
                        <span class="ai-settings-label">发送方式</span>
                        <span class="ai-settings-desc">{{
                          preferences.enterToSend
                            ? 'Enter 发送，Shift+Enter 换行'
                            : 'Ctrl/⌘+Enter 发送'
                        }}</span>
                      </div>
                      <div class="ai-settings-row-right">
                        <span
                          :class="['ai-settings-switch', { enabled: preferences.enterToSend }]"
                        ></span>
                      </div>
                    </div>

                    <div
                      class="ai-settings-row clickable"
                      role="switch"
                      tabindex="0"
                      :aria-checked="preferences.defaultWebSearch"
                      @click="preferences.defaultWebSearch = !preferences.defaultWebSearch"
                      @keydown.enter.prevent="
                        preferences.defaultWebSearch = !preferences.defaultWebSearch
                      "
                      @keydown.space.prevent="
                        preferences.defaultWebSearch = !preferences.defaultWebSearch
                      "
                    >
                      <div class="ai-settings-label-stack">
                        <span class="ai-settings-label">新对话默认联网</span>
                        <span class="ai-settings-desc">开始新对话时自动启用联网搜索</span>
                      </div>
                      <div class="ai-settings-row-right">
                        <span
                          :class="['ai-settings-switch', { enabled: preferences.defaultWebSearch }]"
                        ></span>
                      </div>
                    </div>

                    <div
                      class="ai-settings-row clickable"
                      role="switch"
                      tabindex="0"
                      :aria-checked="preferences.showDetails"
                      @click="preferences.showDetails = !preferences.showDetails"
                      @keydown.enter.prevent="preferences.showDetails = !preferences.showDetails"
                      @keydown.space.prevent="preferences.showDetails = !preferences.showDetails"
                    >
                      <div class="ai-settings-label-stack">
                        <span class="ai-settings-label">回复详情入口</span>
                        <span class="ai-settings-desc">显示检索记录与动作审计</span>
                      </div>
                      <div class="ai-settings-row-right">
                        <span
                          :class="['ai-settings-switch', { enabled: preferences.showDetails }]"
                        ></span>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <!-- ── 通用 · 模型与厂商（自带 Key / BYOK，2026-10-08）────────
                   用户口径：「支持自定义模型厂商和模型，支持填入 Baseurl 与 apikey」。
                   这些模型保存后与官方模式**同列**在输入框的模式选择器里（mode = 'user:<id>'），
                   用自己的 Key 调用 ⇒ 不消耗 BOH 额度。 -->
              <section class="ai-settings-section" data-section="models">
                <div class="ai-settings-group-title">模型与厂商</div>
                <div class="ai-settings-card">
                  <div v-if="!isLoggedIn" class="ai-settings-list">
                    <div class="ai-settings-row">
                      <div class="ai-settings-label-stack">
                        <span class="ai-settings-label">接入你自己的模型</span>
                        <span class="ai-settings-desc">
                          登录后可添加自定义厂商（Base URL + API Key），只对你自己生效
                        </span>
                      </div>
                      <div class="ai-settings-row-right">
                        <button type="button" class="ai-custom-inline-btn" @click="handleLogin">
                          登录
                        </button>
                      </div>
                    </div>
                  </div>

                  <template v-else>
                    <div class="ai-settings-list">
                      <div class="ai-settings-row">
                        <div class="ai-settings-label-stack">
                          <span class="ai-settings-label">自定义厂商与模型</span>
                          <span class="ai-settings-desc">
                            支持任意 OpenAI 兼容端点；模型会出现在输入框的模式选择器里，且不消耗 BOH
                            额度
                          </span>
                        </div>
                        <div class="ai-settings-row-right">
                          <span class="ai-settings-usage-chip">
                            {{ customEndpoints.length }} / {{ customLimits.endpoints }}
                          </span>
                        </div>
                      </div>
                    </div>

                    <p v-if="customError" class="ai-custom-error">{{ customError }}</p>
                    <p v-if="actionError" class="ai-custom-error">{{ actionError }}</p>

                    <!-- 已保存的厂商 -->
                    <article
                      v-for="endpoint in customEndpoints"
                      :key="endpoint.id"
                      class="ai-custom-endpoint"
                      :data-endpoint-id="endpoint.id"
                    >
                      <header class="ai-custom-endpoint-head">
                        <strong>{{ endpoint.name }}</strong>
                        <span class="ai-custom-mask">{{ endpoint.keyMasked }}</span>
                      </header>
                      <p class="ai-custom-url">{{ endpoint.baseUrl }}</p>
                      <div class="ai-custom-chips">
                        <span
                          v-for="model in endpoint.models"
                          :key="model.id"
                          class="ai-custom-chip"
                          >{{ model.displayName || model.modelId }}</span
                        >
                      </div>
                      <p
                        v-if="endpoint.lastTestMessage"
                        class="ai-custom-test"
                        :class="{ 'is-ok': endpoint.lastTestStatus === 'success' }"
                      >
                        {{ endpoint.lastTestStatus === 'success' ? '✓' : '×' }}
                        {{ endpoint.lastTestMessage }}
                      </p>
                      <div class="ai-custom-actions">
                        <button type="button" @click="startEdit(endpoint)">编辑</button>
                        <button
                          type="button"
                          :disabled="testingId === endpoint.id"
                          @click="testEndpoint(endpoint)"
                        >
                          {{ testingId === endpoint.id ? '测试中…' : '测试连接' }}
                        </button>
                        <button
                          type="button"
                          class="is-danger"
                          :class="{ 'is-confirming': confirmingDeleteId === endpoint.id }"
                          :disabled="deletingId === endpoint.id"
                          @click="removeEndpoint(endpoint)"
                        >
                          {{
                            deletingId === endpoint.id
                              ? '删除中…'
                              : confirmingDeleteId === endpoint.id
                                ? '确认删除'
                                : '删除'
                          }}
                        </button>
                      </div>
                    </article>

                    <!-- 新增 / 编辑表单 -->
                    <div v-if="formOpen" class="ai-custom-form">
                      <label class="ai-custom-field">
                        <span>厂商名称</span>
                        <input
                          v-model="form.name"
                          type="text"
                          maxlength="40"
                          placeholder="例如 我的 OpenRouter"
                          data-field="name"
                        />
                      </label>
                      <label class="ai-custom-field">
                        <span>Base URL</span>
                        <input
                          v-model="form.baseUrl"
                          type="text"
                          placeholder="https://api.example.com/v1"
                          data-field="baseUrl"
                        />
                        <small>填域名、/v1 或完整 chat/completions 地址都可以</small>
                      </label>
                      <label class="ai-custom-field">
                        <span>API Key</span>
                        <input
                          v-model="form.apiKey"
                          type="password"
                          autocomplete="off"
                          :placeholder="form.id ? '留空表示不修改已保存的 Key' : 'sk-…'"
                          data-field="apiKey"
                        />
                        <small>加密后存在服务端，页面只回显掩码，不会明文下发</small>
                      </label>
                      <label class="ai-custom-field">
                        <span>模型 ID</span>
                        <span class="ai-custom-model-editor">
                          <input
                            v-model="form.modelInput"
                            type="text"
                            placeholder="输入模型 ID，回车加入"
                            data-field="modelInput"
                            @keydown.enter.prevent="addModelToForm"
                          />
                          <button type="button" title="加入" @click="addModelToForm">
                            <Plus :size="14" aria-hidden="true" />
                          </button>
                        </span>
                      </label>
                      <div v-if="form.models.length" class="ai-custom-chips">
                        <span
                          v-for="(model, index) in form.models"
                          :key="model.modelId"
                          class="ai-custom-chip is-editable"
                        >
                          {{ model.modelId }}
                          <button
                            type="button"
                            :aria-label="`移除 ${model.modelId}`"
                            @click="form.models.splice(index, 1)"
                          >
                            ×
                          </button>
                        </span>
                      </div>
                      <div v-if="discoveredModels.length" class="ai-custom-discovered">
                        <span>发现 {{ discoveredModels.length }} 个模型，点击加入：</span>
                        <button
                          v-for="model in discoveredModels"
                          :key="model.id"
                          type="button"
                          @click="addDiscoveredModel(model.id)"
                        >
                          {{ model.id }}
                        </button>
                      </div>
                      <p v-if="formError" class="ai-custom-error">{{ formError }}</p>
                      <div class="ai-custom-form-actions">
                        <button
                          type="button"
                          class="is-primary"
                          :disabled="saving"
                          @click="saveEndpoint"
                        >
                          {{ saving ? '保存中…' : form.id ? '保存修改' : '添加厂商' }}
                        </button>
                        <button type="button" :disabled="discovering" @click="discoverModels">
                          {{ discovering ? '发现中…' : '发现模型' }}
                        </button>
                        <button type="button" @click="closeForm">取消</button>
                      </div>
                    </div>
                    <div v-else class="ai-custom-add">
                      <button
                        type="button"
                        :disabled="customEndpoints.length >= customLimits.endpoints"
                        @click="startCreate"
                      >
                        <Plus :size="14" aria-hidden="true" />添加自定义厂商
                      </button>
                    </div>
                  </template>
                </div>
              </section>

              <!-- ── 通用 · 记忆与上下文 ─────────────────────────── -->
              <section class="ai-settings-section" data-section="memory">
                <div class="ai-settings-group-title">记忆与上下文</div>
                <div class="ai-settings-card">
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
                      <div class="ai-settings-label-stack">
                        <span class="ai-settings-label">个人记忆</span>
                        <span class="ai-settings-desc">{{
                          isTreeholeMemoryToggling
                            ? '正在更新设置…'
                            : '允许回答参考你的 Cloud+ 内容'
                        }}</span>
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
                      <div class="ai-settings-label-stack">
                        <span class="ai-settings-label">社区知识</span>
                        <span class="ai-settings-desc">允许回答参考社区共享内容</span>
                      </div>
                      <div class="ai-settings-row-right">
                        <span
                          :class="['ai-settings-switch', { enabled: isSharedMemoryEnabled }]"
                        ></span>
                      </div>
                    </div>

                    <div
                      class="ai-settings-row clickable"
                      role="switch"
                      tabindex="0"
                      :aria-checked="preferences.pageContextEnabled"
                      @click="preferences.pageContextEnabled = !preferences.pageContextEnabled"
                      @keydown.enter.prevent="
                        preferences.pageContextEnabled = !preferences.pageContextEnabled
                      "
                      @keydown.space.prevent="
                        preferences.pageContextEnabled = !preferences.pageContextEnabled
                      "
                    >
                      <div class="ai-settings-label-stack">
                        <span class="ai-settings-label">自动附加当前页面</span>
                        <span class="ai-settings-desc">呼出 AI 时附加页面标题和地址</span>
                      </div>
                      <div class="ai-settings-row-right">
                        <span
                          :class="[
                            'ai-settings-switch',
                            { enabled: preferences.pageContextEnabled },
                          ]"
                        ></span>
                      </div>
                    </div>

                    <div
                      class="ai-settings-row clickable"
                      role="switch"
                      tabindex="0"
                      :aria-checked="preferences.selectionContextEnabled"
                      @click="
                        preferences.selectionContextEnabled = !preferences.selectionContextEnabled
                      "
                      @keydown.enter.prevent="
                        preferences.selectionContextEnabled = !preferences.selectionContextEnabled
                      "
                      @keydown.space.prevent="
                        preferences.selectionContextEnabled = !preferences.selectionContextEnabled
                      "
                    >
                      <div class="ai-settings-label-stack">
                        <span class="ai-settings-label">识别选中文本</span>
                        <span class="ai-settings-desc">仅在你主动附加或允许自动附加时使用</span>
                      </div>
                      <div class="ai-settings-row-right">
                        <span
                          :class="[
                            'ai-settings-switch',
                            { enabled: preferences.selectionContextEnabled },
                          ]"
                        ></span>
                      </div>
                    </div>

                    <div class="ai-settings-row">
                      <div class="ai-settings-label-stack">
                        <span class="ai-settings-label">附加范围</span>
                        <span class="ai-settings-desc">控制页面上下文带多少内容进模型</span>
                      </div>
                      <div class="ai-settings-row-right">
                        <div class="ai-settings-inline-segmented no-indent">
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
                      </div>
                    </div>

                    <div v-if="memoryStatusText" class="ai-settings-memory-status" role="status">
                      {{ memoryStatusText }}
                    </div>
                  </div>
                </div>
              </section>

              <!-- ── 通用 · 外观 ─────────────────────────────────── -->
              <section class="ai-settings-section" data-section="appearance">
                <div class="ai-settings-group-title">外观</div>
                <div class="ai-settings-card">
                  <div class="ai-settings-list">
                    <div class="ai-settings-row">
                      <div class="ai-settings-label-stack">
                        <span class="ai-settings-label">主题</span>
                        <span class="ai-settings-desc">跟随网站，或只让 BOH AI 用某一种</span>
                      </div>
                      <div class="ai-settings-row-right">
                        <div class="ai-settings-inline-segmented no-indent">
                          <button
                            v-for="option in appearanceOptions"
                            :key="option.id"
                            :class="{ active: preferences.appearance === option.id }"
                            @click="preferences.appearance = option.id"
                          >
                            {{ option.name }}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div class="ai-settings-row">
                      <div class="ai-settings-label-stack">
                        <span class="ai-settings-label">密度</span>
                        <span class="ai-settings-desc">列表与卡片的行距</span>
                      </div>
                      <div class="ai-settings-row-right">
                        <div class="ai-settings-inline-segmented no-indent">
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
                      </div>
                    </div>

                    <div class="ai-settings-row">
                      <div class="ai-settings-label-stack">
                        <span class="ai-settings-label">字号</span>
                        <span class="ai-settings-desc">对话正文的字号档位</span>
                      </div>
                      <div class="ai-settings-row-right">
                        <div class="ai-settings-inline-segmented no-indent">
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
                      </div>
                    </div>

                    <div
                      class="ai-settings-row clickable"
                      role="switch"
                      tabindex="0"
                      :aria-checked="preferences.animationsEnabled"
                      @click="preferences.animationsEnabled = !preferences.animationsEnabled"
                      @keydown.enter.prevent="
                        preferences.animationsEnabled = !preferences.animationsEnabled
                      "
                      @keydown.space.prevent="
                        preferences.animationsEnabled = !preferences.animationsEnabled
                      "
                    >
                      <div class="ai-settings-label-stack">
                        <span class="ai-settings-label">界面动效</span>
                        <span class="ai-settings-desc">关闭后减少面板与页面切换动画</span>
                      </div>
                      <div class="ai-settings-row-right">
                        <span
                          :class="[
                            'ai-settings-switch',
                            { enabled: preferences.animationsEnabled },
                          ]"
                        ></span>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <!-- ── 账户 · 用量（承接 2026-10-03 退役的 AiQuotaSidePanel） ── -->
              <section ref="usageCardRef" class="ai-settings-section" data-section="usage">
                <div class="ai-settings-group-title">用量</div>
                <div class="ai-settings-card">
                  <div class="ai-settings-list">
                    <div v-if="quotaLoading" class="ai-settings-quota-loading">正在读取用量…</div>
                    <div v-else-if="!quota" class="ai-settings-quota-loading">
                      暂时读不到用量数据，稍后再试
                    </div>
                    <template v-else>
                      <!-- 2026-10-08 口径第二版：尺子**唯一**（Plus = 100%），而且用量卡抬头
                           已经直接印「今日剩余 625%」⇒ 这里不再重复档位百分比。
                           曾经那句「Max · Plus 的 625%」是为了向用户解释「为什么显示 100%」，
                           现在没有第二把尺子需要解释了。 -->
                      <div class="ai-settings-usage-plan">
                        <div>
                          <span>当前方案</span>
                          <strong>{{ tierLabel }}</strong>
                        </div>
                        <span class="ai-settings-usage-chip">{{
                          pointsMode ? '积分计费' : quotaIsUnlimited ? '不限量' : '每日额度'
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
                          <span>今日剩余</span>
                          <strong>{{ quotaRemainingLabel }}</strong>
                        </div>
                        <!-- 2026-10-08 口径第二版：主指标 = **剩余**，尺子 = 「Plus = 100%」
                             ⇒ Max 没消耗就是 剩余 625%。已用与附加包降级成副行。
                             ⚠️ 这里**不许**再出现任何 Token 绝对数（用户点名去掉）。 -->
                        <div class="ai-settings-quota-values">
                          <span>已用 {{ quotaUsedLabel }}</span>
                          <span v-if="quotaHasPack">含附加包 · 总额 {{ quotaTotalLabel }}</span>
                        </div>
                        <div
                          class="ai-settings-quota-track"
                          role="progressbar"
                          aria-label="今日额度已用比例"
                          :aria-valuemin="0"
                          :aria-valuemax="100"
                          :aria-valuenow="
                            quotaIsUnlimited
                              ? undefined
                              : Number(quotaDisplay.meterPercent.toFixed(2))
                          "
                        >
                          <span
                            :class="{
                              'has-usage': quotaDisplay.meterPercent > 0,
                              warn: quotaDisplay.meterPercent >= 80,
                              danger: quotaDisplay.meterPercent >= 95,
                              unlimited: quotaIsUnlimited,
                            }"
                            :style="{ width: quotaIsUnlimited ? '100%' : quotaMeterText }"
                          ></span>
                        </div>
                        <div class="ai-settings-quota-foot">
                          <span>{{
                            quotaIsUnlimited ? '当前订阅不限用量' : '每日 0:00 重置'
                          }}</span>
                          <span v-if="!quotaIsUnlimited">Plus = 100%</span>
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
              </section>

              <!-- ── 高级 · 呼出方式 ─────────────────────────────── -->
              <section class="ai-settings-section" data-section="trigger">
                <div class="ai-settings-group-title">呼出方式</div>
                <div class="ai-settings-card">
                  <div class="ai-settings-list">
                    <div
                      class="ai-settings-row clickable"
                      role="switch"
                      tabindex="0"
                      :aria-checked="preferences.shortcutEnabled"
                      @click="preferences.shortcutEnabled = !preferences.shortcutEnabled"
                      @keydown.enter.prevent="
                        preferences.shortcutEnabled = !preferences.shortcutEnabled
                      "
                      @keydown.space.prevent="
                        preferences.shortcutEnabled = !preferences.shortcutEnabled
                      "
                    >
                      <div class="ai-settings-label-stack">
                        <span class="ai-settings-label">全局快捷键</span>
                        <span class="ai-settings-desc">{{ shortcutLabel }} 呼出并聚焦输入框</span>
                      </div>
                      <div class="ai-settings-row-right">
                        <span
                          :class="['ai-settings-switch', { enabled: preferences.shortcutEnabled }]"
                        ></span>
                      </div>
                    </div>

                    <div
                      v-if="preferences.shortcutEnabled"
                      class="ai-settings-row clickable"
                      :class="{ expanded: showShortcutPicker }"
                      @click="showShortcutPicker = !showShortcutPicker"
                    >
                      <div class="ai-settings-label-stack">
                        <span class="ai-settings-label">快捷键组合</span>
                        <span class="ai-settings-desc">{{ shortcutLabel }}</span>
                      </div>
                      <div class="ai-settings-row-right">
                        <span class="ai-settings-chevron" :class="{ expanded: showShortcutPicker }"
                          >›</span
                        >
                      </div>
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
                      role="switch"
                      tabindex="0"
                      :aria-checked="preferences.gestureEnabled"
                      @click="preferences.gestureEnabled = !preferences.gestureEnabled"
                      @keydown.enter.prevent="
                        preferences.gestureEnabled = !preferences.gestureEnabled
                      "
                      @keydown.space.prevent="
                        preferences.gestureEnabled = !preferences.gestureEnabled
                      "
                    >
                      <div class="ai-settings-label-stack">
                        <span class="ai-settings-label">边缘手势</span>
                        <span class="ai-settings-desc">从屏幕边缘横向滑动呼出</span>
                      </div>
                      <div class="ai-settings-row-right">
                        <span
                          :class="['ai-settings-switch', { enabled: preferences.gestureEnabled }]"
                        ></span>
                      </div>
                    </div>

                    <div v-if="preferences.gestureEnabled" class="ai-settings-row">
                      <div class="ai-settings-label-stack">
                        <span class="ai-settings-label">手势方向与灵敏度</span>
                        <span class="ai-settings-desc">从哪一侧滑入、需要多长距离</span>
                      </div>
                      <div class="ai-settings-row-right">
                        <div class="ai-settings-inline-segmented no-indent">
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
                        </div>
                      </div>
                    </div>
                    <div v-if="preferences.gestureEnabled" class="ai-settings-inline-segmented">
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
                      role="switch"
                      tabindex="0"
                      :aria-checked="preferences.hapticsEnabled"
                      @click="preferences.hapticsEnabled = !preferences.hapticsEnabled"
                      @keydown.enter.prevent="
                        preferences.hapticsEnabled = !preferences.hapticsEnabled
                      "
                      @keydown.space.prevent="
                        preferences.hapticsEnabled = !preferences.hapticsEnabled
                      "
                    >
                      <div class="ai-settings-label-stack">
                        <span class="ai-settings-label">触感反馈</span>
                        <span class="ai-settings-desc">支持的设备在手势完成时轻触反馈</span>
                      </div>
                      <div class="ai-settings-row-right">
                        <span
                          :class="['ai-settings-switch', { enabled: preferences.hapticsEnabled }]"
                        ></span>
                      </div>
                    </div>

                    <div
                      class="ai-settings-row clickable"
                      :class="{ expanded: showOpenBehaviorPicker }"
                      @click="showOpenBehaviorPicker = !showOpenBehaviorPicker"
                    >
                      <div class="ai-settings-label-stack">
                        <span class="ai-settings-label">呼出后打开</span>
                        <span class="ai-settings-desc"
                          >{{ currentOpenBehaviorName }} ·
                          {{ preferences.initialHeight === 'full' ? '全屏' : '舒适高度' }}</span
                        >
                      </div>
                      <div class="ai-settings-row-right">
                        <span
                          class="ai-settings-chevron"
                          :class="{ expanded: showOpenBehaviorPicker }"
                          >›</span
                        >
                      </div>
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
                      role="switch"
                      tabindex="0"
                      :aria-checked="preferences.autoFocus"
                      @click="preferences.autoFocus = !preferences.autoFocus"
                      @keydown.enter.prevent="preferences.autoFocus = !preferences.autoFocus"
                      @keydown.space.prevent="preferences.autoFocus = !preferences.autoFocus"
                    >
                      <div class="ai-settings-label-stack">
                        <span class="ai-settings-label">自动聚焦输入框</span>
                        <span class="ai-settings-desc">呼出后可直接输入</span>
                      </div>
                      <div class="ai-settings-row-right">
                        <span
                          :class="['ai-settings-switch', { enabled: preferences.autoFocus }]"
                        ></span>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <!-- ── 高级 · 数据 ─────────────────────────────────── -->
              <section class="ai-settings-section" data-section="data">
                <div class="ai-settings-group-title">数据</div>
                <div class="ai-settings-card">
                  <div class="ai-settings-list">
                    <div class="ai-settings-row clickable" @click="$emit('clearCurrentChat')">
                      <div class="ai-settings-label-stack">
                        <span class="ai-settings-label">清除当前对话</span>
                        <span class="ai-settings-desc">只清掉正在进行的这一条会话</span>
                      </div>
                      <div class="ai-settings-row-right">
                        <span class="ai-settings-chevron">›</span>
                      </div>
                    </div>
                    <div class="ai-settings-row clickable" @click="$emit('exportChatData')">
                      <div class="ai-settings-label-stack">
                        <span class="ai-settings-label">导出对话数据</span>
                        <span class="ai-settings-desc">下载 JSON 格式的全部对话记录</span>
                      </div>
                      <div class="ai-settings-row-right">
                        <span class="ai-settings-chevron">›</span>
                      </div>
                    </div>
                    <div
                      class="ai-settings-row clickable danger"
                      @click="$emit('clearAllChatData')"
                    >
                      <div class="ai-settings-label-stack">
                        <span class="ai-settings-label text-danger">
                          <Trash2 :size="14" aria-hidden="true" />清除所有对话
                        </span>
                        <span class="ai-settings-desc">删除全部对话历史，不可撤销</span>
                      </div>
                      <div class="ai-settings-row-right">
                        <span class="ai-settings-chevron text-danger">›</span>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onUnmounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  ArrowLeft,
  BrainCircuit,
  Check,
  Command,
  Cpu,
  Database,
  Gauge,
  Palette,
  Plus,
  Search,
  Settings,
  Trash2,
  X,
} from 'lucide-vue-next';
import {
  useGlobalAiPreferences,
  getGlobalAiShortcutLabel,
} from '@/composables/useGlobalAiPreferences.js';
import { getAiQuotaStatus } from '@/utils/api/api-key-runtime-api.js';
import {
  deleteUserAiEndpoint,
  discoverUserAiEndpointModels,
  testUserAiEndpoint,
  upsertUserAiEndpoint,
} from '@/utils/api/user-endpoint-api.js';
import { useUserEndpoints } from '@/views/BOHAI/composables/useUserEndpoints.js';
import { formatQuotaPercent, resolveAiQuotaDisplay } from '@/utils/ai-quota-display.js';
import { getMySubscriptions } from '@/utils/api/subscription-api.js';
import {
  resolveHighestTierCode,
  TIER_DISPLAY_LABELS as TIER_LABELS,
} from '@/utils/subscription-benefits.js';
import { formatModeRateLabel, formatModeRateTitle } from '@/views/BOHAI/utils/mode-rate-label.js';
import { useAuthStore } from '@/stores/auth';

/**
 * BohaiSettingsPanel.vue — BOH AI 设置（总入口）
 *
 * **2026-10-08 重写**：用户口径「设置参考 macOS / ChatGPT 设置页」。
 * 原来是「全屏遮罩 + 560px 居中抽屉」，遮罩 z-index 300 而会话侧栏是 2147483450 ⇒
 * 实测侧栏压在设置之上（用户原话「覆盖所有内容并且侧边栏依然存在」）。
 * 现在改成**全屏设置页**：左侧分组导航（返回应用 + 搜索 + 三组条目），右侧内容；
 * 打开时由壳把会话侧栏与横屏左栏一起撤掉，不再有叠层问题。
 *
 * 三条口径（不许改）：
 *   1. **左侧导航点击 = 右侧滚动定位**（不是切换视图）。所有分区都在同一滚动容器里，
 *      所以壳的 `focusSection='usage'` 只是「滚到用量分区」，探针也能一次读全 DOM。
 *   2. **搜索只过滤左侧导航**：不做第二份「设置项索引」—— 索引与模板必然漂移，
 *      就成了同一规则两处定义。搜索词匹配分区名 + 该分区的 keywords。
 *   3. **颜色只走 `--boh-*`**（tokens.css 单一真源）。暗色在根元素上按
 *      `[data-theme='dark']` 换一组局部变量，块内零颜色字面量（暗色令牌棘轮）。
 */
const props = defineProps({
  modelValue: { type: Boolean, default: false },
  embedded: { type: Boolean, default: false },
  /** 独立页（/ai-chat）整页形态：铺满**视口**而不是宿主容器（越过顶部导航与左栏） */
  fullscreen: { type: Boolean, default: false },
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

/* ── 左侧导航：分区单一真源 ──────────────────────────────────────
   一个分区 = 一个 `data-section="<id>"` 的右侧分区。导航顺序即滚动顺序。
   `keywords` 只服务搜索（分区名之外的近义词），不是第二份 UI 定义。 */
const NAV_GROUPS = [
  {
    id: 'general',
    label: '通用',
    items: [
      {
        id: 'chat',
        label: '对话偏好',
        icon: Settings,
        keywords: '响应 模式 模型 回答 风格 发送 回车 联网 搜索 详情 审计',
      },
      {
        id: 'models',
        label: '模型与厂商',
        icon: Cpu,
        keywords: '模型 厂商 自定义 自带 key apikey baseurl 端点 openai 兼容 byok 额度',
      },
      {
        id: 'memory',
        label: '记忆与上下文',
        icon: BrainCircuit,
        keywords: '记忆 上下文 社区 知识 cloud 页面 选中 范围 附加',
      },
      {
        id: 'appearance',
        label: '外观',
        icon: Palette,
        keywords: '主题 深色 浅色 跟随 密度 字号 动效 动画',
      },
    ],
  },
  {
    id: 'account',
    label: '账户',
    items: [
      {
        id: 'usage',
        label: '用量与订阅',
        icon: Gauge,
        keywords: '用量 额度 token 积分 订阅 方案 联网次数 剩余 重置',
      },
    ],
  },
  {
    id: 'advanced',
    label: '高级',
    items: [
      {
        id: 'trigger',
        label: '呼出方式',
        icon: Command,
        keywords: '快捷键 手势 灵敏度 触感 呼出 聚焦 高度',
      },
      {
        id: 'data',
        label: '数据',
        icon: Database,
        keywords: '数据 清除 导出 删除 对话 记录 json',
      },
    ],
  },
];

const SECTION_LIST = NAV_GROUPS.flatMap((group) => group.items);

const navQuery = ref('');
const activeSection = ref('chat');
const bodyRef = ref(null);
const drawerRef = ref(null);
const titleRef = ref(null);
const closeBtnRef = ref(null);
const usageCardRef = ref(null);

const filteredNavGroups = computed(() => {
  const keyword = navQuery.value.trim().toLowerCase();
  if (!keyword) return NAV_GROUPS;
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) =>
      `${item.label} ${item.keywords}`.toLowerCase().includes(keyword),
    ),
  })).filter((group) => group.items.length > 0);
});

const activeSectionLabel = computed(
  () => SECTION_LIST.find((item) => item.id === activeSection.value)?.label || '设置',
);

const sectionEl = (id) => bodyRef.value?.querySelector(`[data-section="${id}"]`) || null;

const jumpTo = (id) => {
  activeSection.value = id;
  const body = bodyRef.value;
  const el = sectionEl(id);
  if (body && el) body.scrollTo({ top: el.offsetTop, behavior: 'smooth' });
};

/* 右侧滚动 → 左侧高亮跟随（用 offsetTop 比较，避免 IntersectionObserver 在
   容器滚动 + 动态高度下的多触发抖动）。rAF 去重，滚动期间每帧最多算一次。 */
let scrollRaf = 0;
const onBodyScroll = () => {
  if (scrollRaf) return;
  scrollRaf = requestAnimationFrame(() => {
    scrollRaf = 0;
    const body = bodyRef.value;
    if (!body) return;
    const line = body.scrollTop + 28;
    let current = SECTION_LIST[0]?.id || 'chat';
    SECTION_LIST.forEach((item) => {
      const el = sectionEl(item.id);
      if (el && el.offsetTop <= line) current = item.id;
    });
    activeSection.value = current;
  });
};

const showModePicker = ref(false);
const showStylePicker = ref(false);
const showShortcutPicker = ref(false);
const showOpenBehaviorPicker = ref(false);
const quota = ref(null);
const quotaLoading = ref(false);
let focusRestore = null;
const { preferences } = useGlobalAiPreferences();

// 档位文案已收敛到 utils/subscription-benefits.js 的 TIER_DISPLAY_LABELS
// （侧栏账号浮层要显示同一文案），顶部以 `TIER_DISPLAY_LABELS as TIER_LABELS` 引入，用法不变。
// 倍率 / 免费 / 自有 Key 的文案同理收敛到 utils/mode-rate-label.js（输入区共用同一份）。

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
const tierLabel = computed(() => TIER_LABELS[quota.value?.tier] || quota.value?.tier || '');

/* 今日额度：百分比口径走单一真源 utils/ai-quota-display.js。
   ⚠️ 2026-10-08 用户口径「不再展示你还有多少 token」—— 这里**不许**再出现
   `formatTokenCount(quotaUsed)` 这类 Token 绝对值的调用；只有积分余额继续显示绝对值
   （积分是余额，不是日额度，没有百分比的分母，见 pointsMode 那一段）。
   尺子是**唯一的**：Plus = 100% ⇒ Max 625% / Ultra 1250%，附加包在同一把尺子上相加；
   主指标是**剩余**（Max 刚过 0 点、没消耗 ⇒ 剩余 625%）。 */
const quotaDisplay = computed(() => resolveAiQuotaDisplay(quota.value || {}));
const quotaIsUnlimited = computed(() => quotaDisplay.value.isUnlimited);
const quotaRemainingLabel = computed(() => quotaDisplay.value.remainingLabel);
const quotaUsedLabel = computed(() => quotaDisplay.value.usedLabel);
const quotaTotalLabel = computed(() => quotaDisplay.value.totalLabel);
/* 附加包副行：**只有买了包才显示**，而且只说「含附加包 · 总额 688%」——
   刻意**不印包自己的百分比**：订阅页把包按 5% 取整宣传（'额度 +65%'），
   AI 页这里是精确值（+63%），同一屏出现两个数字会被当成 bug。总额已经含了它。 */
const quotaHasPack = computed(() => !quotaDisplay.value.isUnlimited && quotaDisplay.value.hasPack);
const quotaMeterText = computed(() => quotaDisplay.value.meterText);

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
    // 用量分区是「数据到了才变高」的：打开时滚一次只能滚到加载态，
    // 数据落定后必须再滚一次，否则 focus-section='usage' 会停在半路。
    await nextTick();
    scrollToUsageSection();
  }
};

const scrollToUsageSection = () => {
  if (!props.modelValue || props.focusSection !== 'usage') return;
  activeSection.value = 'usage';
  const body = bodyRef.value;
  const el = sectionEl('usage');
  if (body && el) body.scrollTo({ top: el.offsetTop });
};

const handleLogin = () => {
  authStore.showLoginModal = true;
  close();
};

const handleUpgrade = () => {
  close();
  router.push('/user-center/subscriptions');
};

/* ── 自定义厂商 / 模型（BYOK，2026-10-08）────────────────────────────────
   列表状态来自 useUserEndpoints 的**模块级单例** —— 与 AI 引擎共用同一份，
   所以这里保存成功后，输入框的模式选择器会立刻多出这些模型（引擎 watch 了它）。
   Key 只在上行时提交一次，页面永远只拿到掩码。 */
const {
  endpoints: customEndpoints,
  limits: customLimits,
  errorText: customError,
  loadUserEndpoints,
  applyUserEndpointsPayload,
} = useUserEndpoints();

const formOpen = ref(false);
const saving = ref(false);
const discovering = ref(false);
const testingId = ref('');
const deletingId = ref('');
const confirmingDeleteId = ref('');
const discoveredModels = ref([]);
const formError = ref('');
const actionError = ref('');
const form = reactive({
  id: '',
  name: '',
  baseUrl: '',
  apiKey: '',
  modelInput: '',
  models: [],
});

const resetForm = () => {
  form.id = '';
  form.name = '';
  form.baseUrl = '';
  form.apiKey = '';
  form.modelInput = '';
  form.models = [];
  discoveredModels.value = [];
  formError.value = '';
};

const startCreate = () => {
  resetForm();
  actionError.value = '';
  formOpen.value = true;
};

const startEdit = (endpoint) => {
  resetForm();
  form.id = endpoint.id;
  form.name = endpoint.name;
  form.baseUrl = endpoint.baseUrl;
  form.models = (endpoint.models || []).map((model) => ({
    modelId: model.modelId,
    displayName: model.displayName || '',
  }));
  actionError.value = '';
  formOpen.value = true;
};

const closeForm = () => {
  formOpen.value = false;
  resetForm();
};

const addModelToForm = () => {
  const modelId = String(form.modelInput || '').trim();
  if (!modelId) return;
  form.modelInput = '';
  if (form.models.some((model) => model.modelId === modelId)) return;
  if (form.models.length >= customLimits.value.modelsPerEndpoint) {
    formError.value = `一个厂商最多 ${customLimits.value.modelsPerEndpoint} 个模型。`;
    return;
  }
  form.models.push({ modelId, displayName: '' });
  formError.value = '';
};

const addDiscoveredModel = (modelId) => {
  form.modelInput = modelId;
  addModelToForm();
};

const saveEndpoint = async () => {
  if (saving.value) return;
  formError.value = '';
  if (!String(form.name).trim()) {
    formError.value = '请填写厂商名称。';
    return;
  }
  if (!String(form.baseUrl).trim()) {
    formError.value = '请填写 Base URL。';
    return;
  }
  if (!form.id && !String(form.apiKey).trim()) {
    formError.value = '请填写 API Key。';
    return;
  }
  if (!form.models.length) {
    formError.value = '至少填一个模型 ID，否则这个厂商没有可用模型。';
    return;
  }
  saving.value = true;
  const result = await upsertUserAiEndpoint({
    id: form.id || undefined,
    name: form.name,
    baseUrl: form.baseUrl,
    // 编辑时留空 = 不改已保存的 Key（服务端按这个语义处理）
    apiKey: form.apiKey,
    models: form.models.map((model) => ({
      modelId: model.modelId,
      displayName: model.displayName,
    })),
  });
  saving.value = false;
  if (!result.ok) {
    // 服务端的校验文案（「Base URL 必须是 https 地址」这类）要原样展示，
    // 替换成通用文案会让用户永远改不对。
    formError.value = result.error?.message || '保存失败，请稍后再试。';
    return;
  }
  applyUserEndpointsPayload(result.data);
  closeForm();
};

// 删除做成「点一次进入确认态、再点一次才真删」：比弹确认框轻，且不会踩
// useConfirmDialog 互斥时的 reject 语义（那个坑本仓踩过）。
const removeEndpoint = async (endpoint) => {
  if (deletingId.value) return;
  if (confirmingDeleteId.value !== endpoint.id) {
    confirmingDeleteId.value = endpoint.id;
    actionError.value = '';
    return;
  }
  deletingId.value = endpoint.id;
  const result = await deleteUserAiEndpoint(endpoint.id);
  deletingId.value = '';
  confirmingDeleteId.value = '';
  if (!result.ok) {
    actionError.value = result.error?.message || '删除失败，请稍后再试。';
    return;
  }
  if (formOpen.value && form.id === endpoint.id) closeForm();
  applyUserEndpointsPayload(result.data);
};

const testEndpoint = async (endpoint) => {
  if (testingId.value) return;
  actionError.value = '';
  testingId.value = endpoint.id;
  const result = await testUserAiEndpoint({
    id: endpoint.id,
    modelId: endpoint.models?.[0]?.modelId || '',
  });
  testingId.value = '';
  if (!result.ok) {
    actionError.value = result.error?.message || '测试失败，请稍后再试。';
    return;
  }
  const data = result.data || {};
  // 服务端已把结果落到 last_test_*，本地同步一份，省一次列表请求
  const target = customEndpoints.value.find((item) => item.id === endpoint.id);
  if (target) {
    target.lastTestStatus = data.ok ? 'success' : 'failed';
    target.lastTestMessage = data.message || '';
  }
};

const discoverModels = async () => {
  if (discovering.value) return;
  formError.value = '';
  if (!String(form.baseUrl).trim()) {
    formError.value = '请先填写 Base URL。';
    return;
  }
  if (!form.id && !String(form.apiKey).trim()) {
    formError.value = '请先填写 API Key。';
    return;
  }
  discovering.value = true;
  const result = await discoverUserAiEndpointModels({
    id: form.id || undefined,
    baseUrl: form.baseUrl,
    apiKey: form.apiKey,
  });
  discovering.value = false;
  if (!result.ok) {
    formError.value = result.error?.message || '发现模型失败。';
    return;
  }
  discoveredModels.value = Array.isArray(result.data?.models) ? result.data.models : [];
  if (!discoveredModels.value.length) {
    formError.value = '端点没有返回任何模型，可以手动填写模型 ID。';
  }
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
      navQuery.value = '';
      activeSection.value = props.focusSection === 'usage' ? 'usage' : 'chat';
      await nextTick();
      closeBtnRef.value?.focus();
      if (props.focusSection === 'usage') {
        await nextTick();
        scrollToUsageSection();
      }
      void fetchQuota();
      // 自定义厂商列表：打开设置时刷新一次（别的设备上刚改过 / 引擎侧首次加载失败都能补上）。
      // ⚠️ 只在登录时发：未登录 EF 会回 401，白跑一次请求还会在「模型」分区里多一句红字。
      if (isLoggedIn.value) void loadUserEndpoints({ force: true });
    } else {
      navQuery.value = '';
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
  if (scrollRaf) cancelAnimationFrame(scrollRaf);
});
</script>

<style scoped>
/* ══════════════════════════════════════════════════════════════
   全屏设置页：左导航 + 右内容
   ══════════════════════════════════════════════════════════════ */

.ai-settings-backdrop {
  /* 局部调色板：只引用 tokens.css 的灰阶/半透明档（块内零颜色字面量）。
     这样暗色块只需换一组变量，不用逐条写暗色规则。 */
  --ai-bg: var(--boh-gray-0);
  --ai-bg-side: var(--boh-gray-100);
  --ai-bg-hover: var(--boh-a-light-hover);
  --ai-bg-active: var(--boh-a-light-active);
  --ai-border: var(--boh-gray-200);
  --ai-text-1: var(--boh-gray-1000);
  --ai-text-2: var(--boh-gray-500);
  --ai-text-3: var(--boh-gray-400);
  --ai-accent: var(--boh-gray-1000);
  --ai-accent-contrast: var(--boh-gray-0);
  --ai-danger: var(--boh-danger-light);
  --ai-warn: var(--boh-warn-light);

  position: fixed;
  inset: 0;
  z-index: 2147483600;
  display: flex;
  background: var(--ai-bg);
  color: var(--ai-text-1);
  font-family: var(--boh-font-ui);
  font-size: 14px;
  -webkit-font-smoothing: antialiased;
}

.ai-settings-backdrop[data-theme='dark'] {
  --ai-bg: var(--boh-gray-900);
  --ai-bg-side: var(--boh-gray-950);
  --ai-bg-hover: var(--boh-a-dark-hover);
  --ai-bg-active: var(--boh-a-dark-active);
  --ai-border: var(--boh-gray-850);
  --ai-text-1: var(--boh-gray-100);
  --ai-text-2: var(--boh-gray-400);
  --ai-text-3: var(--boh-gray-500);
  --ai-accent: var(--boh-gray-100);
  --ai-accent-contrast: var(--boh-gray-1000);
  --ai-danger: var(--boh-danger-dark);
  --ai-warn: var(--boh-warn-dark);
}

/* 岛 / 内嵌形态：不 Teleport，铺满宿主容器（不透明，与独立页同一套视觉） */
.ai-settings-backdrop.is-embedded {
  position: absolute;
}

/* 独立页（/ai-chat）：`embedded` 为真（不 Teleport），但仍要铺满**视口** ——
   `.bohai-page` 在横屏被 landscape-rail.css 推了 88px 的 padding-left，
   absolute 会从 88px 起算、左侧露出一条底色；fixed 才真正整页。 */
.ai-settings-backdrop.is-fullscreen {
  position: fixed;
}

.ai-settings-drawer {
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

/* ── 左：设置导航 ────────────────────────────────────────────── */
.ai-settings-nav {
  display: flex;
  flex: none;
  flex-direction: column;
  gap: 2px;
  width: 268px;
  min-height: 0;
  padding: 14px 12px 10px;
  border-right: 1px solid var(--ai-border);
  background: var(--ai-bg-side);
}

.ai-settings-back-app {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 10px;
  border-radius: 8px;
  color: var(--ai-text-2);
  font-size: 13px;
  text-align: left;
  transition:
    background var(--boh-dur-fast) var(--boh-ease),
    color var(--boh-dur-fast) var(--boh-ease);
}

.ai-settings-back-app:hover {
  background: var(--ai-bg-hover);
  color: var(--ai-text-1);
}

.ai-settings-search {
  display: flex;
  align-items: center;
  gap: 7px;
  height: 32px;
  margin: 8px 0 2px;
  padding: 0 10px;
  border: 1px solid var(--ai-border);
  border-radius: 8px;
  background: var(--ai-bg);
  color: var(--ai-text-3);
}

.ai-settings-search input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: 0;
  background: none;
  color: var(--ai-text-1);
  font: inherit;
  font-size: 13px;
}

.ai-settings-search input::placeholder {
  color: var(--ai-text-3);
}

.ai-settings-nav-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: thin;
}

.ai-settings-nav-group {
  padding: 14px 10px 4px;
  color: var(--ai-text-3);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.ai-settings-nav-item {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 7px 10px;
  border-radius: 8px;
  color: var(--ai-text-2);
  font-size: 13px;
  text-align: left;
  transition:
    background var(--boh-dur-fast) var(--boh-ease),
    color var(--boh-dur-fast) var(--boh-ease);
}

.ai-settings-nav-item:hover {
  background: var(--ai-bg-hover);
  color: var(--ai-text-1);
}

.ai-settings-nav-item.is-active {
  background: var(--ai-bg-active);
  color: var(--ai-text-1);
  font-weight: 600;
}

.ai-settings-nav-item > svg {
  flex: none;
  opacity: 0.85;
}

.ai-settings-nav-empty {
  padding: 14px 10px;
  color: var(--ai-text-3);
  font-size: 12.5px;
}

.ai-settings-nav-foot {
  flex: none;
  padding: 10px;
  color: var(--ai-text-3);
  font-size: 11px;
}

/* ── 右：内容 ────────────────────────────────────────────────── */
.ai-settings-main {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  background: var(--ai-bg);
}

.ai-settings-header {
  display: flex;
  flex: none;
  align-items: center;
  gap: 12px;
  padding: 16px 22px 8px;
}

.ai-settings-header h2 {
  flex: 1;
  margin: 0;
  color: var(--ai-text-1);
  font-size: 19px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.ai-settings-close-btn {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  color: var(--ai-text-2);
  transition:
    background var(--boh-dur-fast) var(--boh-ease),
    color var(--boh-dur-fast) var(--boh-ease);
}

.ai-settings-close-btn:hover {
  background: var(--ai-bg-hover);
  color: var(--ai-text-1);
}

.ai-settings-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 2px 22px 40px;
}

/* ── 分区 / 卡片 / 行 ───────────────────────────────────────── */
.ai-settings-section {
  max-width: 720px;
  padding-top: 14px;
}

.ai-settings-group-title {
  margin-bottom: 8px;
  color: var(--ai-text-1);
  font-size: 13.5px;
  font-weight: 600;
}

.ai-settings-card {
  overflow: hidden;
  border: 1px solid var(--ai-border);
  border-radius: 12px;
  background: var(--ai-bg);
}

.ai-settings-list {
  display: flex;
  flex-direction: column;
}

.ai-settings-row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 54px;
  padding: 11px 14px;
}

.ai-settings-row + .ai-settings-row,
.ai-settings-inline-options + .ai-settings-row {
  border-top: 1px solid var(--ai-border);
}

.ai-settings-row.clickable {
  cursor: pointer;
}

.ai-settings-row.clickable:hover {
  background: var(--ai-bg-hover);
}

.ai-settings-row.disabled {
  opacity: 0.6;
  pointer-events: none;
}

.ai-settings-label-stack {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.ai-settings-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--ai-text-1);
  font-size: 13.5px;
  font-weight: 500;
}

.ai-settings-desc {
  color: var(--ai-text-2);
  font-size: 12px;
  line-height: 1.45;
}

.ai-settings-row-right {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
}

.text-danger {
  color: var(--ai-danger);
}

/* 展开指示（">" 旋转 90°） */
.ai-settings-chevron {
  display: inline-flex;
  color: var(--ai-text-3);
  font-size: 15px;
  line-height: 1;
  transition: transform var(--boh-dur-fast) var(--boh-ease);
}

.ai-settings-chevron.expanded {
  transform: rotate(90deg);
}

/* ── 展开的选项列表 ─────────────────────────────────────────── */
.ai-settings-inline-options {
  display: flex;
  flex-direction: column;
  padding: 4px 10px 10px;
  border-top: 1px solid var(--ai-border);
  background: var(--ai-bg-side);
}

.ai-settings-inline-option {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  border-radius: 8px;
  color: var(--ai-text-2);
  text-align: left;
  transition: background var(--boh-dur-fast) var(--boh-ease);
}

.ai-settings-inline-option:hover {
  background: var(--ai-bg-hover);
}

.ai-settings-inline-option.active {
  color: var(--ai-text-1);
}

.ai-settings-option-main {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
}

.ai-settings-option-main strong {
  color: inherit;
  font-size: 13px;
  font-weight: 500;
}

.ai-settings-option-main small {
  color: var(--ai-text-3);
  font-size: 11.5px;
}

.ai-settings-option-meta {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 8px;
  color: var(--ai-text-3);
}

.ai-settings-option-multiplier {
  font-size: 11.5px;
}

/* ── 分段控件 ───────────────────────────────────────────────── */
.ai-settings-inline-segmented {
  display: flex;
  gap: 4px;
  padding: 4px 10px 6px;
}

.ai-settings-inline-segmented.no-indent {
  padding: 0;
}

.ai-settings-inline-segmented button {
  flex: 1;
  padding: 6px 12px;
  border: 1px solid var(--ai-border);
  border-radius: 8px;
  color: var(--ai-text-2);
  font-size: 12.5px;
  white-space: nowrap;
  transition:
    background var(--boh-dur-fast) var(--boh-ease),
    color var(--boh-dur-fast) var(--boh-ease);
}

.ai-settings-inline-segmented button:hover {
  color: var(--ai-text-1);
}

.ai-settings-inline-segmented button.active {
  border-color: transparent;
  background: var(--ai-accent);
  color: var(--ai-accent-contrast);
  font-weight: 500;
}

/* ── 开关 ───────────────────────────────────────────────────── */
.ai-settings-switch {
  position: relative;
  display: inline-block;
  flex: none;
  width: 42px;
  height: 25px;
  border-radius: 999px;
  background: var(--ai-bg-active);
  transition: background var(--boh-dur-fast) var(--boh-ease);
}

.ai-settings-switch::after {
  content: '';
  position: absolute;
  top: 2.5px;
  left: 2.5px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--ai-bg);
  box-shadow: 0 1px 2px var(--boh-a-light-active);
  transition: transform var(--boh-dur-fast) var(--boh-ease);
}

.ai-settings-switch.enabled {
  background: var(--ai-accent);
}

.ai-settings-switch.enabled::after {
  transform: translateX(17px);
}

.ai-settings-memory-status {
  padding: 10px 14px;
  border-top: 1px solid var(--ai-border);
  color: var(--ai-text-2);
  font-size: 12px;
  line-height: 1.5;
}

/* ── 用量 ───────────────────────────────────────────────────── */
.ai-settings-quota-loading {
  padding: 16px 14px;
  color: var(--ai-text-2);
  font-size: 13px;
}

.ai-settings-usage-plan {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 13px 14px;
}

.ai-settings-usage-plan > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ai-settings-usage-plan span {
  color: var(--ai-text-2);
  font-size: 12px;
}

.ai-settings-usage-plan strong {
  color: var(--ai-text-1);
  font-size: 14px;
}

.ai-settings-usage-plan .ai-settings-usage-chip {
  padding: 3px 9px;
  border-radius: 999px;
  background: var(--ai-bg-active);
  color: var(--ai-text-2);
  font-size: 11.5px;
}

.ai-settings-usage-section {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 13px 14px;
  border-top: 1px solid var(--ai-border);
}

.ai-settings-usage-section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.ai-settings-usage-section-head > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ai-settings-usage-section-head strong {
  color: var(--ai-text-1);
  font-size: 13px;
  font-weight: 600;
}

.ai-settings-usage-section-head span {
  color: var(--ai-text-2);
  font-size: 12px;
}

.ai-settings-usage-section-head b {
  color: var(--ai-text-1);
  font-size: 13.5px;
}

.ai-settings-quota-overview {
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: 7px;
  padding: 13px 14px;
  border-top: 1px solid var(--ai-border);
  text-align: left;
  cursor: default;
}

.ai-settings-quota-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.ai-settings-quota-head span {
  color: var(--ai-text-2);
  font-size: 12.5px;
}

.ai-settings-quota-head strong {
  color: var(--ai-text-1);
  font-size: 17px;
  font-weight: 600;
}

.ai-settings-quota-values,
.ai-settings-usage-values {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  color: var(--ai-text-2);
  font-size: 12px;
}

.ai-settings-quota-track {
  overflow: hidden;
  height: 6px;
  border-radius: 999px;
  background: var(--ai-bg-active);
}

.ai-settings-quota-track > span {
  display: block;
  width: 0;
  height: 100%;
  border-radius: 999px;
  background: var(--ai-accent);
}

.ai-settings-quota-track > span.is-web {
  background: var(--ai-text-2);
}

.ai-settings-quota-track > span.warn {
  background: var(--ai-warn);
}

.ai-settings-quota-track > span.danger {
  background: var(--ai-danger);
}

.ai-settings-quota-track > span.unlimited {
  background: var(--ai-text-3);
}

.ai-settings-quota-foot {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  color: var(--ai-text-3);
  font-size: 11.5px;
}

.ai-settings-usage-remaining,
.ai-settings-usage-note {
  color: var(--ai-text-3);
  font-size: 11.5px;
  line-height: 1.5;
}

.ai-settings-usage-note {
  padding: 0 14px 12px;
}

.ai-settings-usage-action {
  margin: 12px 14px;
  padding: 9px 14px;
  border-radius: 9px;
  background: var(--ai-accent);
  color: var(--ai-accent-contrast);
  font-size: 13px;
  font-weight: 500;
  text-align: center;
}

.ai-settings-usage-tier-note {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-top: 1px solid var(--ai-border);
}

.ai-settings-usage-tier-note strong {
  color: var(--ai-text-1);
  font-size: 13px;
}

.ai-settings-usage-tier-note span {
  color: var(--ai-text-3);
  font-size: 11.5px;
}

/* ── 动效 ───────────────────────────────────────────────────── */
.settings-slide-enter-active,
.settings-slide-leave-active {
  transition: opacity var(--boh-dur-med) var(--boh-ease);
}

.settings-slide-enter-from,
.settings-slide-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .settings-slide-enter-active,
  .settings-slide-leave-active {
    transition-duration: 1ms;
  }
}

/* ── 窄屏：左导航收成横向滚动条，内容占满 ───────────────────── */
@media (max-width: 768px) {
  .ai-settings-drawer {
    flex-direction: column;
  }

  .ai-settings-nav {
    width: 100%;
    flex-direction: row;
    align-items: center;
    gap: 6px;
    overflow-x: auto;
    padding: 10px 12px;
    border-right: 0;
    border-bottom: 1px solid var(--ai-border);
  }

  .ai-settings-nav-group,
  .ai-settings-nav-foot,
  .ai-settings-search {
    display: none;
  }

  .ai-settings-nav-list {
    display: flex;
    flex-direction: row;
    flex: 1;
    gap: 6px;
    overflow-y: visible;
  }

  .ai-settings-nav-item {
    width: auto;
    flex: none;
    white-space: nowrap;
  }

  .ai-settings-header {
    padding: 12px 16px 6px;
  }

  .ai-settings-body {
    padding: 0 16px 28px;
  }
}
/* 用量卡的「基准说明」：解释「为什么 Max 也显示 0% / 100%」 */
.ai-settings-usage-note {
  margin: 8px 0 0;
  color: var(--ai-text-3);
  font-size: 12px;
  line-height: 1.55;
}

/* ══ 自定义厂商 / 模型（BYOK，2026-10-08）═══════════════════════════════
   ⚠️ 颜色只走本文件顶部那组 `--ai-*` 局部变量（它们映射到 tokens.css 的 `--boh-*`），
      暗色由根元素上的同名变量覆盖 —— 所以这里**零裸色值**，暗色自动跟随。
   ⚠️ 输入框刻意**不摘**原生 focus 轮廓：设置页里的表单控件要保留键盘焦点可见性
      （与输入区那条「去掉原生黑框」不是一回事，那是聊天输入框的视觉口径）。 */
.ai-custom-endpoint {
  margin-top: 10px;
  padding: 12px 14px;
  border: 1px solid var(--ai-border);
  border-radius: 12px;
}

.ai-custom-endpoint-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}

.ai-custom-mask {
  color: var(--ai-text-3);
  font-family: var(--boh-font-mono, ui-monospace, monospace);
  font-size: 12px;
}

.ai-custom-url {
  margin: 4px 0 0;
  color: var(--ai-text-2);
  font-size: 12px;
  word-break: break-all;
}

.ai-custom-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.ai-custom-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border: 1px solid var(--ai-border);
  border-radius: 999px;
  color: var(--ai-text-2);
  font-size: 12px;
}

.ai-custom-chip.is-editable {
  color: var(--ai-text-1);
}

.ai-custom-chip button {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ai-text-3);
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
}

.ai-custom-chip button:hover {
  color: var(--ai-danger);
}

.ai-custom-test {
  margin: 8px 0 0;
  color: var(--ai-danger);
  font-size: 12px;
}

.ai-custom-test.is-ok {
  color: var(--ai-text-2);
}

.ai-custom-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.ai-custom-actions button,
.ai-custom-form-actions button,
.ai-custom-add button,
.ai-custom-inline-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 10px;
  border: 1px solid var(--ai-border);
  border-radius: 8px;
  background: transparent;
  color: var(--ai-text-1);
  font-family: inherit;
  font-size: 12.5px;
  cursor: pointer;
  transition:
    background var(--boh-dur-fast, 160ms) ease,
    border-color var(--boh-dur-fast, 160ms) ease,
    color var(--boh-dur-fast, 160ms) ease;
}

.ai-custom-actions button:hover:not(:disabled),
.ai-custom-form-actions button:hover:not(:disabled),
.ai-custom-add button:hover:not(:disabled),
.ai-custom-inline-btn:hover {
  background: var(--ai-bg-hover);
}

.ai-custom-actions button:disabled,
.ai-custom-form-actions button:disabled,
.ai-custom-add button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ai-custom-actions button.is-danger {
  color: var(--ai-danger);
}

.ai-custom-actions button.is-confirming {
  border-color: var(--ai-danger);
  background: var(--ai-danger);
  color: var(--ai-accent-contrast);
}

.ai-custom-form-actions button.is-primary {
  border-color: var(--ai-accent);
  background: var(--ai-accent);
  color: var(--ai-accent-contrast);
}

.ai-custom-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 10px;
  padding: 14px;
  border: 1px solid var(--ai-border);
  border-radius: 12px;
}

.ai-custom-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: var(--ai-text-2);
  font-size: 12.5px;
}

.ai-custom-field input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--ai-border);
  border-radius: 8px;
  background: var(--ai-bg-side);
  color: var(--ai-text-1);
  font-family: inherit;
  font-size: 13px;
}

.ai-custom-field input:focus {
  border-color: var(--ai-accent);
}

.ai-custom-field small {
  color: var(--ai-text-3);
  font-size: 11.5px;
}

.ai-custom-model-editor {
  display: flex;
  gap: 6px;
}

.ai-custom-model-editor button {
  display: inline-flex;
  align-items: center;
  padding: 0 10px;
  border: 1px solid var(--ai-border);
  border-radius: 8px;
  background: transparent;
  color: var(--ai-text-1);
  cursor: pointer;
}

.ai-custom-discovered {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  color: var(--ai-text-2);
  font-size: 12px;
}

.ai-custom-discovered button {
  padding: 2px 8px;
  border: 1px dashed var(--ai-border);
  border-radius: 999px;
  background: transparent;
  color: var(--ai-text-1);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
}

.ai-custom-discovered button:hover {
  background: var(--ai-bg-hover);
}

.ai-custom-error {
  margin: 8px 0 0;
  color: var(--ai-danger);
  font-size: 12.5px;
}

.ai-custom-add {
  margin-top: 10px;
}
</style>
