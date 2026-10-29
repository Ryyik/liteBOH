<template>
  <div key="profile-settings" class="profile-subpage-shell">
    <UserCenterPageHeader
      title="设置"
      back-label="返回我的"
      max-width="1200px"
      :show-back="showBack"
      @back="$emit('back')"
    />

    <div class="profile-subpage-body">
      <HomeCatMascot
        v-if="isHomeCatActive"
        class="settings-page-cat"
        pool="background"
        seed="settings-page"
        size="lg"
        decorative
      />

      <!-- iOS 式分离卡片（2026-09-30 重构）：
           卡片本体是 .gs-rows，分组标题移到卡片外上方，组间靠留白分隔。
           骨架规则在 styles/settings-glass.css（5 个设置类页面共用）。 -->
      <div ref="panelRootRef" class="glass-settings" :class="{ 'is-two-pane': twoPane }">
        <!-- 左栏（仅横屏两栏时可见）：搜索 + 分类目录。竖屏下这个 div 只包着搜索框，
             视觉与改造前一致（.gs-aside 在非两栏时不产生任何布局差异）。 -->
        <div class="gs-aside">
          <!-- 设置搜索：索引覆盖本页所有行 + 各子页入口，命中后直接执行入口动作 -->
          <div class="gs-search" role="search">
            <span class="gs-search-icon"
              ><Search :size="16" :stroke-width="2" aria-hidden="true"
            /></span>
            <input
              v-model="searchQuery"
              class="gs-search-input"
              type="text"
              inputmode="search"
              enterkeyhint="search"
              autocomplete="off"
              placeholder="搜索设置"
              aria-label="搜索设置"
            />
            <button
              v-if="searchQuery"
              type="button"
              class="gs-search-clear"
              aria-label="清除搜索"
              @click="searchQuery = ''"
            >
              <X :size="15" :stroke-width="2.4" aria-hidden="true" />
            </button>
          </div>

          <!-- 分类目录（2026-10-26 横屏两栏）：条目 = 右侧的分组，退出登录跟着「账户」走。
               首项照 macOS 系统设置侧栏做「账户行」：头像 + 昵称 + 「账户」，比其它条目高一档 -->
          <nav v-if="twoPane" class="gs-nav" aria-label="设置分类">
            <button
              v-for="item in SETTINGS_SECTIONS"
              :key="item.id"
              type="button"
              class="gs-nav-item"
              :class="{ active: navActiveSection === item.id, 'is-account': item.id === 'account' }"
              :aria-current="navActiveSection === item.id ? 'page' : undefined"
              @click="selectSection(item.id)"
            >
              <template v-if="item.id === 'account'">
                <FramedAvatar
                  class="gs-nav-avatar"
                  :src="avatarUrl"
                  :initial="avatarInitial"
                  :size="26"
                  :frame-url="frameUrl"
                  :frame-scale="frameScale"
                />
                <span class="gs-nav-text">
                  <span class="gs-nav-name">{{ username || '未设置昵称' }}</span>
                  <span class="gs-nav-sub">账户</span>
                </span>
              </template>
              <template v-else>
                <component :is="item.icon" :size="15" :stroke-width="1.9" aria-hidden="true" />
                <span class="gs-nav-label">{{ item.label }}</span>
              </template>
            </button>
          </nav>
        </div>

        <div class="gs-main">
          <!-- 右栏内容三态（2026-10-26）：
               ① editOpen → 个人信息就地展开（宿主经由 #inline-edit 插槽塞进来）；
               ② 搜索中  → 命中结果；
               ③ 常态    → 身份卡 + 4 个分组（两栏下按 activeSection 只显示一组）。
               ⚠️ 个人信息**不另开一页** —— 左目录必须一直在，像 macOS 系统设置那样
               只在右栏换内容。离开分类 / 一开搜就收起编辑态，避免「看不见的编辑中」。 -->
          <template v-if="editOpen && !isSearching">
            <slot name="inline-edit"></slot>
          </template>

          <!-- 搜索结果（替代分组列表） -->
          <section v-else-if="isSearching" class="gs-group">
            <div class="gs-group-title">搜索结果</div>
            <div class="gs-rows">
              <button
                v-for="item in searchResults"
                :key="item.id"
                type="button"
                class="gs-row"
                @click="runEntry(item)"
              >
                <span class="gs-icon" :class="entryIconClass(item)">
                  <component
                    :is="entryIcon(item)"
                    :size="16"
                    :stroke-width="2"
                    aria-hidden="true"
                  />
                </span>
                <span class="gs-text">
                  <span class="gs-label" :class="{ 'gs-label-danger': item.danger }">{{
                    item.label
                  }}</span>
                  <span class="gs-desc">{{ item.group }} · {{ item.desc }}</span>
                </span>
                <span class="gs-side">
                  <SettingToggle
                    v-if="item.toggle"
                    :model-value="entryToggleValue(item)"
                    :label="item.label"
                    @update:model-value="runEntry(item)"
                  />
                  <template v-else>
                    <span v-if="item.value" class="gs-value">{{ item.value() }}</span>
                    <ChevronRight
                      class="gs-chevron"
                      :size="16"
                      :stroke-width="2"
                      aria-hidden="true"
                    />
                  </template>
                </span>
              </button>

              <div v-if="!searchResults.length" class="gs-row is-static">
                <span class="gs-icon is-gray"
                  ><SearchX :size="16" :stroke-width="2" aria-hidden="true"
                /></span>
                <span class="gs-text">
                  <span class="gs-label">没有找到设置项</span>
                  <span class="gs-desc">换个词试试，例如「主题」「密码」「推送」「导出」</span>
                </span>
              </div>
            </div>
          </section>

          <!-- 子页（导出我的数据 / 数据与隐私 / 账户安全的表单）
               2026-10-26：**所有子页都进右栏，不再单独开页** —— 左目录始终在，
               右栏换内容，顶部这条返回条就是这一层的「上一级」（竖屏没有左目录时，
               它也是唯一的返回入口，替代原来子页自己的宽页头）。 -->
          <template v-else-if="inlinePanel">
            <div class="gs-inline-bar">
              <button type="button" class="gs-inline-back" @click="$emit('close-panel')">
                <ChevronLeft :size="17" :stroke-width="2.2" aria-hidden="true" />
                <span>{{ inlineBackLabel }}</span>
              </button>
              <h2 class="gs-inline-title">{{ inlinePanelTitle }}</h2>
            </div>
            <slot name="inline-panel"></slot>
          </template>

          <!-- 单栏菜单视图（2026-10-29）：竖屏首页只列分类，点进去才看某一组的内容。
               与横屏左目录同一心智（账户行在最上、其余分类跟在后面），只是把「左右分栏」
               换成「上下钻取」。搜索不受影响 —— 搜索仍全局命中，命中即执行。 -->
          <template v-else-if="isMenuView">
            <section class="gs-group">
              <div class="gs-rows">
                <button type="button" class="gs-row" @click="enterSection('account')">
                  <FramedAvatar
                    class="gs-menu-avatar"
                    :src="avatarUrl"
                    :initial="avatarInitial"
                    :size="30"
                    :frame-url="frameUrl"
                    :frame-scale="frameScale"
                  />
                  <span class="gs-text">
                    <span class="gs-label">{{ username || '未设置昵称' }}</span>
                    <span class="gs-desc">{{ userEmail || '未绑定邮箱' }}</span>
                  </span>
                  <span class="gs-side">
                    <ChevronRight
                      class="gs-chevron"
                      :size="16"
                      :stroke-width="2"
                      aria-hidden="true"
                    />
                  </span>
                </button>
              </div>
            </section>

            <section class="gs-group">
              <div class="gs-rows">
                <button
                  v-for="item in menuSections"
                  :key="item.id"
                  type="button"
                  class="gs-row"
                  @click="enterSection(item.id)"
                >
                  <span class="gs-icon" :class="sectionIconClass(item.id)">
                    <component :is="item.icon" :size="16" :stroke-width="2" aria-hidden="true" />
                  </span>
                  <span class="gs-text">
                    <span class="gs-label">{{ item.label }}</span>
                    <span class="gs-desc">{{ sectionDesc(item.id) }}</span>
                  </span>
                  <span class="gs-side">
                    <ChevronRight
                      class="gs-chevron"
                      :size="16"
                      :stroke-width="2"
                      aria-hidden="true"
                    />
                  </span>
                </button>
              </div>
            </section>
          </template>

          <template v-else>
            <!-- 单栏钻取的返回条（双栏不需要：左目录一直看得见）。
                 复用 gs-inline-bar，与「导出数据 / 账户安全」子页同一条视觉。 -->
            <div v-if="!twoPane && singlePaneSection" class="gs-inline-bar">
              <button type="button" class="gs-inline-back" @click="exitSection">
                <ChevronLeft :size="17" :stroke-width="2.2" aria-hidden="true" />
                <span>设置</span>
              </button>
              <h2 class="gs-inline-title">{{ sectionLabel(singlePaneSection) }}</h2>
            </div>

            <!-- 身份卡（2026-10-26 Apple 账户页形态）
               ⚠️ 只在「账户」分类出现（showIdentityCard）：两栏下切到别的分类它就该消失，
               不是一条钉在所有分类上方的横幅。
               结构照参考图：居中大头像 → 昵称 → 简介 → 邮箱 → 三行入口
               （个人信息 / 头像 / 头像框），随后才是本页原有的「绑定邮箱」与退出登录。
               「个人信息」不走整页跳转 —— 见宿主 #inline-edit 插槽。 -->
            <section v-if="showIdentityCard" class="gs-identity" aria-label="个人账户">
              <div class="gs-id-hero">
                <button
                  type="button"
                  class="gs-id-avatar"
                  :aria-label="`更换头像（当前头像框：${frameDisplayName}）`"
                  @click="$emit('change-avatar')"
                >
                  <FramedAvatar
                    :src="avatarUrl"
                    :initial="avatarInitial"
                    :size="96"
                    :frame-url="frameUrl"
                    :frame-scale="frameScale"
                  />
                  <span class="gs-id-camera" aria-hidden="true">
                    <Camera :size="13" :stroke-width="2.6" />
                  </span>
                </button>
                <h2 class="gs-id-name">{{ username || '未设置昵称' }}</h2>
                <p v-if="bio" class="gs-id-bio">{{ bio }}</p>
                <!-- 邮箱在这张卡上已经有了，原「绑定邮箱（点击复制）」行就是它的第三份拷贝。
                     2026-10-26：复制能力搬到这行字上（点一下复制），列表里不再有重复行。 -->
                <button
                  v-if="userEmail"
                  type="button"
                  class="gs-id-sub gs-id-email"
                  :aria-label="`复制邮箱 ${userEmail}`"
                  :title="emailCopied ? '已复制' : '点击复制邮箱'"
                  @click="copyEmail"
                >
                  <span class="gs-id-email-text">{{ emailCopied ? '已复制' : userEmail }}</span>
                  <Check
                    v-if="emailCopied"
                    :size="12"
                    :stroke-width="2.6"
                    aria-hidden="true"
                  />
                  <Copy v-else :size="12" :stroke-width="2" aria-hidden="true" />
                </button>
                <p v-else class="gs-id-sub">未绑定邮箱</p>
              </div>

              <div class="gs-id-rows">
                <button type="button" class="gs-row" @click="$emit('open-edit-profile')">
                  <span class="gs-icon is-blue">
                    <UserRound :size="16" :stroke-width="2" aria-hidden="true" />
                  </span>
                  <span class="gs-id-row-label">个人信息</span>
                  <span class="gs-side">
                    <span class="gs-value">昵称 · 简介 · 生日</span>
                    <ChevronRight
                      class="gs-chevron"
                      :size="16"
                      :stroke-width="2"
                      aria-hidden="true"
                    />
                  </span>
                </button>
                <button type="button" class="gs-row" @click="$emit('change-avatar')">
                  <span class="gs-icon is-teal">
                    <Camera :size="16" :stroke-width="2" aria-hidden="true" />
                  </span>
                  <span class="gs-id-row-label">头像</span>
                  <span class="gs-side">
                    <span class="gs-value">更换照片</span>
                    <ChevronRight
                      class="gs-chevron"
                      :size="16"
                      :stroke-width="2"
                      aria-hidden="true"
                    />
                  </span>
                </button>
                <button type="button" class="gs-row" @click="$emit('open-avatar-frames')">
                  <span class="gs-icon is-purple">
                    <Sparkles :size="16" :stroke-width="2" aria-hidden="true" />
                  </span>
                  <span class="gs-id-row-label">头像框</span>
                  <span class="gs-side">
                    <span class="gs-value">{{ frameDisplayName }}</span>
                    <ChevronRight
                      class="gs-chevron"
                      :size="16"
                      :stroke-width="2"
                      aria-hidden="true"
                    />
                  </span>
                </button>
              </div>
            </section>

            <!-- 账户
               2026-10-26 三改：原「绑定邮箱（点击复制）」与「更换邮箱」是同一份数据的两种动作，
               分在两处（账户 / 账户与隐私）看着像两条不同的设置。现在只留这一行「登录邮箱」：
               点它 = 换绑（真要做的事），右侧值仍是邮箱本身；复制搬到身份卡的邮箱字上。 -->
            <section v-show="isGroupVisible('account')" class="gs-group">
              <div class="gs-group-title">账户</div>
              <div class="gs-rows">
                <button type="button" class="gs-row" @click="$emit('open-security', 'email')">
                  <span class="gs-icon is-blue">
                    <Mail :size="16" :stroke-width="2" aria-hidden="true" />
                  </span>
                  <span class="gs-text">
                    <span class="gs-label">登录邮箱</span>
                    <span class="gs-desc">{{
                      userEmail ? '登录与找回密码，点击更换' : '当前账号未绑定邮箱'
                    }}</span>
                  </span>
                  <span class="gs-side">
                    <!-- 不重复展示邮箱地址：身份卡顶上就是它，且长地址会把描述挤成两行 -->
                    <ChevronRight
                      class="gs-chevron"
                      :size="16"
                      :stroke-width="2"
                      aria-hidden="true"
                    />
                  </span>
                </button>
              </div>
            </section>

            <!-- 账户与隐私（2026-10-26 合并；三改去重）
               原先「账户安全」是一个二级页：本页只有一行入口，点进去还要再点一次才到表单。
               现在把子页里的设置项拆成行摆到本页，与原来的「数据与隐私」并成一组 ——
               凭据、可见性、数据处置本来就是「谁能动你的账号、别人能看你什么」一件事。
               排序按「改自己 → 藏给别人看 → 拿走/删除数据」：凭据 → 隐私 → 数据 → 注销。
               行点击仍复用 AccountSecurity 页的表单（带 panel 直落对应面板），
               表单逻辑只有一份，不在这里复制一套密码/通行密钥流程。
               ⚠️「更换邮箱」不在这里：它跟身份卡上的邮箱是同一份数据，挪去了「账户」的「登录邮箱」行。 -->
            <section v-show="isGroupVisible('privacy')" class="gs-group">
              <div class="gs-group-title">账户与隐私</div>
              <div class="gs-rows">
                <button type="button" class="gs-row" @click="$emit('open-security', 'password')">
                  <span class="gs-icon is-blue">
                    <KeyRound :size="16" :stroke-width="2" aria-hidden="true" />
                  </span>
                  <span class="gs-text">
                    <span class="gs-label">修改密码</span>
                    <span class="gs-desc">输入当前密码并设置新密码，更新登录凭证</span>
                  </span>
                  <span class="gs-side">
                    <ChevronRight
                      class="gs-chevron"
                      :size="16"
                      :stroke-width="2"
                      aria-hidden="true"
                    />
                  </span>
                </button>
                <!-- 通行密钥：与 AccountSecurity 菜单同一条件（能力检测通过才出现） -->
                <button
                  v-if="passkeySupported"
                  type="button"
                  class="gs-row"
                  @click="$emit('open-security', 'passkey')"
                >
                  <span class="gs-icon is-blue">
                    <Fingerprint :size="16" :stroke-width="2" aria-hidden="true" />
                  </span>
                  <span class="gs-text">
                    <span class="gs-label">通行密钥</span>
                    <span class="gs-desc">用指纹 / 面容在本设备上快速登录，免输密码</span>
                  </span>
                  <span class="gs-side">
                    <ChevronRight
                      class="gs-chevron"
                      :size="16"
                      :stroke-width="2"
                      aria-hidden="true"
                    />
                  </span>
                </button>
                <button type="button" class="gs-row" @click="$emit('toggle-hide-online')">
                  <span class="gs-icon is-indigo">
                    <EyeOff :size="16" :stroke-width="2" aria-hidden="true" />
                  </span>
                  <span class="gs-text">
                    <span class="gs-label">隐藏在线状态</span>
                    <span class="gs-desc"
                      >开启后，他人将看不到你的在线状态，你也无法查看他人的在线状态</span
                    >
                  </span>
                  <span class="gs-side">
                    <SettingToggle
                      :model-value="hideOnlineStatus"
                      label="隐藏在线状态"
                      @update:model-value="$emit('toggle-hide-online')"
                    />
                  </span>
                </button>
                <button type="button" class="gs-row" @click="$emit('toggle-hide-follow-data')">
                  <span class="gs-icon is-indigo">
                    <Users :size="16" :stroke-width="2" aria-hidden="true" />
                  </span>
                  <span class="gs-text">
                    <span class="gs-label">隐藏关注数据</span>
                    <span class="gs-desc"
                      >开启后，他人在你主页看不到你的详细关注列表和粉丝列表，但仍能看到数量</span
                    >
                  </span>
                  <span class="gs-side">
                    <SettingToggle
                      :model-value="hideFollowData"
                      label="隐藏关注数据"
                      @update:model-value="$emit('toggle-hide-follow-data')"
                    />
                  </span>
                </button>
                <button type="button" class="gs-row" @click="$emit('open-data-management')">
                  <span class="gs-icon is-indigo">
                    <Database :size="16" :stroke-width="2" aria-hidden="true" />
                  </span>
                  <span class="gs-text">
                    <span class="gs-label">数据与隐私</span>
                    <span class="gs-desc">公共记忆与管理工具</span>
                  </span>
                  <span class="gs-side">
                    <span class="gs-value">{{ dataPrivacyStatusText }}</span>
                    <ChevronRight
                      class="gs-chevron"
                      :size="16"
                      :stroke-width="2"
                      aria-hidden="true"
                    />
                  </span>
                </button>
                <button type="button" class="gs-row" @click="$emit('open-data-export')">
                  <span class="gs-icon is-indigo">
                    <Archive :size="16" :stroke-width="2" aria-hidden="true" />
                  </span>
                  <span class="gs-text">
                    <span class="gs-label">导出我的数据</span>
                    <span class="gs-desc">打包个人资料、帖子、云空间等为 ZIP 下载</span>
                  </span>
                  <span class="gs-side">
                    <span class="gs-value">ZIP 打包</span>
                    <ChevronRight
                      class="gs-chevron"
                      :size="16"
                      :stroke-width="2"
                      aria-hidden="true"
                    />
                  </span>
                </button>
                <!-- 注销账号：留在本组末尾（与 iOS 账户页一致），与下方「退出登录」分开 -->
                <button type="button" class="gs-row" @click="$emit('open-security', 'delete')">
                  <span class="gs-icon is-red">
                    <TriangleAlert :size="16" :stroke-width="2" aria-hidden="true" />
                  </span>
                  <span class="gs-text">
                    <span class="gs-label gs-label-danger">注销账号</span>
                    <span class="gs-desc">高风险操作，三步确认后永久注销账号</span>
                  </span>
                  <span class="gs-side">
                    <ChevronRight
                      class="gs-chevron gs-chevron-danger"
                      :size="16"
                      :stroke-width="2"
                      aria-hidden="true"
                    />
                  </span>
                </button>
              </div>
            </section>

            <!-- 通知（2026-10-29 新增）
                 原状：通知相关全藏在「Pushplus 推送」这个子页里，主页只有一行叫
                 「Pushplus 推送」的入口 —— 用户想开「关注的人邮件通知」，
                 看名字根本不会想到点它。这是「找不到」的真实原因，不是布局问题。
                 现在：最高频的邮件开关直接摆到主页（点整行或点开关都行），
                 其余渠道（应用内 / 微信）留在子页，入口改名「通知设置」。 -->
            <section v-show="isGroupVisible('notify')" class="gs-group">
              <div class="gs-group-title">通知</div>
              <div class="gs-rows">
                <button type="button" class="gs-row" @click="$emit('toggle-follow-mail')">
                  <span class="gs-icon" :class="followMailEnabled ? 'is-green' : 'is-blue'">
                    <Mail :size="16" :stroke-width="2" aria-hidden="true" />
                  </span>
                  <span class="gs-text">
                    <span class="gs-label">关注的人邮件通知</span>
                    <span class="gs-desc"
                      >关注的人发帖或回复你时，发邮件到你绑定的邮箱（同一人 30 分钟一封）</span
                    >
                  </span>
                  <span class="gs-side">
                    <SettingToggle
                      :model-value="followMailEnabled"
                      label="关注的人邮件通知"
                      @update:model-value="$emit('toggle-follow-mail')"
                    />
                  </span>
                </button>
                <button type="button" class="gs-row" @click="$emit('open-pushplus')">
                  <span class="gs-icon is-blue">
                    <Bell :size="16" :stroke-width="2" aria-hidden="true" />
                  </span>
                  <span class="gs-text">
                    <span class="gs-label">通知设置</span>
                    <span class="gs-desc">应用内通知、微信推送，以及各渠道详细配置</span>
                  </span>
                  <span class="gs-side">
                    <span class="gs-value">{{ pushplusStatusText }}</span>
                    <ChevronRight
                      class="gs-chevron"
                      :size="16"
                      :stroke-width="2"
                      aria-hidden="true"
                    />
                  </span>
                </button>
              </div>
            </section>

            <!-- 内容与存储（2026-10-26 三改）
               原「我的内容」+ 单行分组「Cloud+」合并：资产花钱、摄影集成册、Cloud+ 存东西，
               三行说的是同一件事 —— 你名下有什么。单行 Cloud+ 独占一个目录项不划算。
               资产页本身仍是独立 tab（内层面板不变），摄影集的常用入口就是这一行。 -->
            <section v-show="isGroupVisible('content')" class="gs-group">
              <div class="gs-group-title">内容与存储</div>
              <div class="gs-rows">
                <button type="button" class="gs-row" @click="$emit('open-assets')">
                  <span class="gs-icon is-teal">
                    <Wallet :size="16" :stroke-width="2" aria-hidden="true" />
                  </span>
                  <span class="gs-text">
                    <span class="gs-label">资产</span>
                    <span class="gs-desc">积分明细、订阅、订单、抽奖与赞助</span>
                  </span>
                  <span class="gs-side">
                    <ChevronRight
                      class="gs-chevron"
                      :size="16"
                      :stroke-width="2"
                      aria-hidden="true"
                    />
                  </span>
                </button>
                <button type="button" class="gs-row" @click="$emit('open-photo-albums')">
                  <span class="gs-icon is-blue">
                    <Images :size="16" :stroke-width="2" aria-hidden="true" />
                  </span>
                  <span class="gs-text">
                    <span class="gs-label">摄影集</span>
                    <span class="gs-desc">照片自动排版，装帧一本可带走的影集</span>
                  </span>
                  <span class="gs-side">
                    <ChevronRight
                      class="gs-chevron"
                      :size="16"
                      :stroke-width="2"
                      aria-hidden="true"
                    />
                  </span>
                </button>
                <button type="button" class="gs-row" @click="$emit('open-cloud', 'settings')">
                  <span class="gs-icon is-teal">
                    <MessagesSquare :size="16" :stroke-width="2" aria-hidden="true" />
                  </span>
                  <span class="gs-text">
                    <span class="gs-label">Cloud+ 页面</span>
                    <span class="gs-desc">进入完整 Cloud+ 设置与管理页面</span>
                  </span>
                  <span class="gs-side">
                    <span class="gs-value">{{ cloudPlusUsageText }}</span>
                    <ChevronRight
                      class="gs-chevron"
                      :size="16"
                      :stroke-width="2"
                      aria-hidden="true"
                    />
                  </span>
                </button>
              </div>
            </section>

            <!-- 通用（2026-10-26 三改；2026-10-29 推送迁出）
               原「外观与浏览」（2 行）+「通知」（1 行）各自占一个目录项，左栏 7 项里三项是短组。
               2026-10-29 起「Pushplus 推送」升级成独立的「通知」分类（入口改名「通知设置」），
               本组只剩「App 长什么样 + 多新」：主题 / 开场画 / 版本。 -->
            <section v-show="isGroupVisible('general')" class="gs-group">
              <div class="gs-group-title">通用</div>
              <div class="gs-rows">
                <button type="button" class="gs-row" @click="$emit('open-theme')">
                  <span
                    class="gs-icon"
                    :class="currentTheme === 'dark' ? 'is-purple' : 'is-yellow'"
                  >
                    <Moon
                      v-if="currentTheme === 'dark'"
                      :size="16"
                      :stroke-width="2"
                      aria-hidden="true"
                    />
                    <Sun v-else :size="16" :stroke-width="2" aria-hidden="true" />
                  </span>
                  <span class="gs-text">
                    <span class="gs-label">主题设置</span>
                    <span class="gs-desc">选择浅色、深色或跟随系统</span>
                  </span>
                  <span class="gs-side">
                    <span class="gs-value">{{ themeDisplayText }}</span>
                    <ChevronRight
                      class="gs-chevron"
                      :size="16"
                      :stroke-width="2"
                      aria-hidden="true"
                    />
                  </span>
                </button>
                <button type="button" class="gs-row" @click="replayHomeGate">
                  <span class="gs-icon is-blue">
                    <RotateCcw :size="16" :stroke-width="2" aria-hidden="true" />
                  </span>
                  <span class="gs-text">
                    <span class="gs-label">重播首屏开场画</span>
                    <span class="gs-desc">清除「已看过」标记，回到首屏再看一次</span>
                  </span>
                  <span class="gs-side">
                    <ChevronRight
                      class="gs-chevron"
                      :size="16"
                      :stroke-width="2"
                      aria-hidden="true"
                    />
                  </span>
                </button>
                <button type="button" class="gs-row" @click="$emit('open-version-settings')">
                  <span class="gs-icon is-blue">
                    <Info :size="16" :stroke-width="2" aria-hidden="true" />
                  </span>
                  <span class="gs-text">
                    <span class="gs-label">版本</span>
                    <span class="gs-desc">查看当前版本与 Beta 6 介绍</span>
                  </span>
                  <span class="gs-side">
                    <span class="gs-value">Beta 6</span>
                    <ChevronRight
                      class="gs-chevron"
                      :size="16"
                      :stroke-width="2"
                      aria-hidden="true"
                    />
                  </span>
                </button>
              </div>
            </section>

            <!-- 危险操作 -->
            <section v-show="isGroupVisible('account')" class="gs-group gs-danger">
              <div class="gs-rows">
                <button type="button" class="gs-row" @click="$emit('logout')">
                  <span class="gs-icon is-red">
                    <LogOut :size="16" :stroke-width="2" aria-hidden="true" />
                  </span>
                  <span class="gs-text">
                    <span class="gs-label gs-label-danger">退出登录</span>
                  </span>
                  <span class="gs-side">
                    <ChevronRight
                      class="gs-chevron gs-chevron-danger"
                      :size="16"
                      :stroke-width="2"
                      aria-hidden="true"
                    />
                  </span>
                </button>
              </div>
            </section>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import UserCenterPageHeader from '@/components/UserCenterPageHeader.vue';
import HomeCatMascot from '@/components/HomeCatMascot.vue';
import {
  Archive,
  Bell,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Database,
  EyeOff,
  Fingerprint,
  Images,
  Info,
  KeyRound,
  LogOut,
  Mail,
  MessagesSquare,
  Moon,
  RotateCcw,
  Search,
  SearchX,
  Shield,
  Sparkles,
  Sun,
  TriangleAlert,
  UserRound,
  Users,
  Wallet,
  X,
} from 'lucide-vue-next';
import { isPasskeySupported } from '@/utils/api/auth-api.js';

/* 重播首屏开场画（2026-09-24）：清除「已看过」标记并整页回首页。
   ⚠️ 标记 key 带构建指纹（boh-home-gate-passed:<build-id>，生产构建注入），必须前缀匹配清除；
   2026-09-24 晚：标记迁到 localStorage（24h 时间窗），同时兜底清一遍 sessionStorage 旧值；
   必须用 location.reload 而不是路由跳转 —— Home 组件要重新挂载才会重播开场画。 */
const replayHomeGate = () => {
  const collectPrefixKeys = (storage) => {
    const keys = [];
    try {
      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i);
        if (key && key.startsWith('boh-home-gate-passed')) keys.push(key);
      }
    } catch {
      /* ignore */
    }
    return keys;
  };
  try {
    collectPrefixKeys(localStorage).forEach((key) => localStorage.removeItem(key));
    collectPrefixKeys(sessionStorage).forEach((key) => sessionStorage.removeItem(key));
  } catch {
    /* storage 不可用时忽略 —— reload 后开场画由既有降级链决定 */
  }
  window.location.hash = '#/';
  window.location.reload();
};
import SettingToggle from './SettingToggle.vue';
import FramedAvatar from './FramedAvatar.vue';
import { useAvatarFrame } from '@/composables/useAvatarFrame.js';

const props = defineProps({
  showBack: {
    type: Boolean,
    default: true,
  },
  userEmail: {
    type: String,
    default: '',
  },
  pushplusStatusText: {
    type: String,
    default: '',
  },
  cloudPlusUsageText: {
    type: String,
    default: '',
  },
  subscriptionSummaryText: {
    type: String,
    default: '',
  },
  dataPrivacyStatusText: {
    type: String,
    default: '',
  },
  themeDisplayText: {
    type: String,
    default: '',
  },
  isHomeCatActive: {
    type: Boolean,
    default: false,
  },
  currentTheme: {
    type: String,
    default: '',
  },
  hideOnlineStatus: {
    type: Boolean,
    default: false,
  },
  hideFollowData: {
    type: Boolean,
    default: false,
  },
  /**
   * 「关注的人邮件通知」开关状态（2026-10-29）。
   * 真源是 profiles.follow_mail_enabled，读写都在宿主（UserSpaceMain）——
   * 本组件是纯展示 + 转发 emit，不自己发请求，与 hideOnlineStatus 同一模式。
   * 默认 false：数据库默认也是 false，未登录 / 读失败时显示「关」是安全的一侧。
   */
  followMailEnabled: {
    type: Boolean,
    default: false,
  },
  /**
   * 横屏两栏（2026-10-26）：宿主判定「横屏且够宽」才置 true。
   * 断点判断只放在 UserSpaceMain 一处（它同时负责把左栏切到缩小态），
   * 本组件只认结果 —— 组件内不再写第二份 matchMedia。
   */
  twoPane: {
    type: Boolean,
    default: false,
  },
  /* ── 身份卡（2026-10-26）── */
  avatarUrl: {
    type: String,
    default: '',
  },
  username: {
    type: String,
    default: '',
  },
  bio: {
    type: String,
    default: '',
  },
  /**
   * 个人信息是否在右栏就地展开（2026-10-26）。
   * 宿主把 EditProfilePanel 通过 #inline-edit 插槽塞进来 —— 表单状态（editProfileForm）
   * 留在宿主，面板只负责「右栏换内容、左目录不动」这件事，
   * 不为转发十几个字段再造一层 props 通道。
   */
  editOpen: {
    type: Boolean,
    default: false,
  },
  /**
   * 右栏子页（2026-10-26）：非空时右栏从「分组列表」换成 `#inline-panel` 插槽内容。
   * 值只用于判断「有没有子页」，具体画什么由宿主决定 —— 本组件不认识数据导出/账户安全。
   * 传进来的取值：'' | 'data-export' | 'data-management' | 'account-security'
   */
  inlinePanel: {
    type: String,
    default: '',
  },
  /** 子页标题（右栏返回条右侧） */
  inlinePanelTitle: {
    type: String,
    default: '',
  },
  /** 子页归属的左目录分类 id：子页打开期间高亮它，别让目录看起来「什么都没选」 */
  inlinePanelSection: {
    type: String,
    default: '',
  },
});

const emit = defineEmits([
  'back',
  'open-theme',
  'open-cloud',
  /** 2026-10-26：资产 / 摄影集从主页收进设置后，这里多了两个出口 */
  'open-assets',
  'open-photo-albums',
  /** 2026-10-26 身份卡：换头像（文件选择 + 裁剪）、头像框试戴、更多资料（入群时间/生日） */
  'change-avatar',
  'open-avatar-frames',
  'open-edit-profile',
  /** 右栏编辑态收起（切分类 / 开搜索 / 点返回时各触发一次） */
  'close-edit',
  /** 右栏子页收起（同一批触发点，回到分组列表） */
  'close-panel',
  'open-pushplus',
  /** 2026-10-26：带面板 id（email / password / passkey / delete），宿主拼成 ?panel= 直落表单 */
  'open-security',
  'open-version-settings',
  'open-data',
  'open-data-management',
  'open-data-export',
  'logout',
  'toggle-hide-online',
  'toggle-hide-follow-data',
  /** 2026-10-29：关注的人邮件通知开关（真源 profiles.follow_mail_enabled，读写留在宿主） */
  'toggle-follow-mail',
]);

/* ---------- 身份卡（2026-10-26 Apple 账户页形态） ----------
   头像走 FramedAvatar（与编辑资料页、论坛作者头像同一渲染件，框的缩放口径单一）；
   佩戴态读 useAvatarFrame 的模块级单例 —— 弹层里换完框这里即时变，不需要宿主再传。 */
const { effectiveFrame } = useAvatarFrame();
const frameUrl = computed(() => effectiveFrame.value?.url || '');
const frameScale = computed(() => effectiveFrame.value?.scale || 0);
const frameDisplayName = computed(() => effectiveFrame.value?.name || '无框');
const avatarInitial = computed(() =>
  String(props.username || 'U')
    .charAt(0)
    .toUpperCase(),
);

/* ---------- 通行密钥（Passkey）能力检测 ----------
   与 AccountSecurity 菜单同一判定：不支持 WebAuthn 的浏览器不出现「通行密钥」这一行，
   否则点进去只剩一个注定失败的「添加」按钮。异步检测，抛错一律按不支持处理。 */
const passkeySupported = ref(false);
onMounted(async () => {
  try {
    passkeySupported.value = (await isPasskeySupported()) === true;
  } catch {
    passkeySupported.value = false;
  }
});

/* ---------- 横屏左右栏：左目录 + 右详情（2026-10-26） ----------
   目录条目 = 右栏的分组，首项是「账户行」（头像 + 昵称），退出登录也挂在这组末尾。
   竖屏 / 窄窗（twoPane=false）不渲染目录，全部分组展开。

   2026-10-26 三次调整的统一原则：**目录项 = 一类问题，不是一张卡片**。
     ① 合并（本次）：外观与浏览 + 通知 + 版本 → 「通用」；我的内容 + Cloud+ → 「内容与存储」；
        7 项 → 4 项。原来左栏有三项点开只是一两行，目录比内容还长。
     ② 去重：「绑定邮箱（点击复制）」与「更换邮箱」是同一份数据 → 只留「账户」里的「登录邮箱」，
        复制搬到身份卡的邮箱字上（点一下复制）。
     ③ 不拆：账户与隐私仍然是一组 7 行 —— 上一轮刚并起来，内部按「凭据 → 隐私 → 数据 → 注销」
        排序代替再加一层目录。 */
const SETTINGS_SECTIONS = [
  { id: 'account', label: '账户', icon: Mail },
  /* 2026-10-29 新增：通知从「通用」里独立出来。
     原先通知相关只有一行叫「Pushplus 推送」，用户找「邮件通知」不会想到点它 ——
     分类目录里给出「通知」这一席，是让用户「按目的找」而不是「按名字猜」。 */
  { id: 'notify', label: '通知', icon: Bell },
  { id: 'privacy', label: '账户与隐私', icon: Shield },
  { id: 'content', label: '内容与存储', icon: Wallet },
  { id: 'general', label: '通用', icon: Info },
];
const activeSection = ref('account');
const panelRootRef = ref(null);

/* ---------- 单栏钻取（2026-10-29） ----------
   竖屏不再把所有分组平铺：改成「分类列表 → 点进去只看一组」，
   与横屏双栏同一个心智（左目录 + 右内容），只是把左右换成上下。
   为什么值得做：平铺时 15 个条目要滚 2~3 屏，用户找「邮件通知」得先滚到「通用」；
   钻取后首页只有 5 个分类，目标一眼可见。
   状态空串 = 分类列表；非空 = 正在看那个分类。双栏下不使用本状态。 */
const singlePaneSection = ref('');
const isMenuView = computed(() => !props.twoPane && !singlePaneSection.value);

/** 分类列表里不重复出现「账户」—— 顶部那条账户行就是它 */
const menuSections = computed(() => SETTINGS_SECTIONS.filter((item) => item.id !== 'account'));

/** 分类副标题：让用户在列表页就知道这组里有什么，不用点进去试 */
const SECTION_DESC = {
  account: '头像、昵称、登录邮箱',
  notify: '邮件通知、微信推送',
  privacy: '密码、通行密钥、隐私与数据',
  content: '资产、摄影集、Cloud 空间',
  general: '主题、开场画、版本',
};
const SECTION_ICON_CLASS = {
  account: 'is-blue',
  notify: 'is-green',
  privacy: 'is-indigo',
  content: 'is-teal',
  general: 'is-yellow',
};
const sectionDesc = (id) => SECTION_DESC[id] || '';
const sectionIconClass = (id) => SECTION_ICON_CLASS[id] || 'is-gray';
const sectionLabel = (id) => SETTINGS_SECTIONS.find((item) => item.id === id)?.label || '';

const enterSection = (id) => {
  singlePaneSection.value = id;
  // 同步 activeSection：双栏高亮、搜索结果归属都读它，两边口径不能分叉
  activeSection.value = id;
  requestAnimationFrame(() => {
    panelRootRef.value?.scrollIntoView?.({ block: 'start', behavior: 'auto' });
  });
};

const exitSection = () => {
  singlePaneSection.value = '';
};

/** 双栏 ↔ 单栏切换时清掉钻取态，否则窗口变宽后残留一个看不见的「当前分类」 */
watch(
  () => props.twoPane,
  (two) => {
    if (two) singlePaneSection.value = '';
  },
);

/** 单栏：菜单视图下不显示任何组；进入某组后只显示该组。双栏：只显示当前分类。 */
const isGroupVisible = (id) => {
  if (props.twoPane) return activeSection.value === id;
  return Boolean(singlePaneSection.value) && singlePaneSection.value === id;
};

/** 左目录高亮：子页打开时跟着子页归属走（否则目录看起来「什么都没选」） */
const navActiveSection = computed(() =>
  props.inlinePanel ? props.inlinePanelSection || activeSection.value : activeSection.value,
);

/** 返回条文案 = 子页归属分类的名字（「账户与隐私」），让用户知道退回哪里 */
const inlineBackLabel = computed(() => {
  const section = SETTINGS_SECTIONS.find((item) => item.id === navActiveSection.value);
  return section?.label || '设置';
});

/**
 * 身份卡可见性（2026-10-26 用户纠偏）：它属于「账户」这一页，不是全站横幅 ——
 * 两栏下切到「外观与浏览」等分类时必须一起消失（对齐 macOS 系统设置：账户页才有大头像区）。
 * 单栏（竖屏 / 窄窗）本来就没有分类概念、8 组全量展开，身份卡按 iOS 设置的做法待在列表最前，
 * 此时恒显示；搜索态另由模板的 isSearching 收掉。
 */
const showIdentityCard = computed(() => !props.twoPane || activeSection.value === 'account');

/** 切分类后回到顶部 —— 滚动容器是宿主的 .tab-page（不是 window），取最近的祖先 */
const selectSection = (id) => {
  // 编辑态 / 子页下点其它分类 = 离开当前右栏内容，先把右栏收回分组列表
  if (props.editOpen) emit('close-edit');
  if (props.inlinePanel) emit('close-panel');
  if (activeSection.value === id) return;
  activeSection.value = id;
  const scroller = panelRootRef.value?.closest('.tab-page');
  if (scroller?.scrollTo) scroller.scrollTo({ top: 0 });
  else window.scrollTo({ top: 0 });
};

/* ---------- 绑定邮箱（点击复制） ---------- */
const emailCopied = ref(false);
let emailCopyTimer = null;

const emailDisplayText = computed(() => {
  if (emailCopied.value) return '已复制';
  return props.userEmail || '未绑定';
});

const copyEmail = async () => {
  const email = String(props.userEmail || '').trim();
  if (!email) return;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(email);
    } else {
      const ta = document.createElement('textarea');
      ta.value = email;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    emailCopied.value = true;
    clearTimeout(emailCopyTimer);
    emailCopyTimer = setTimeout(() => {
      emailCopied.value = false;
    }, 1600);
  } catch (_error) {
    /* 复制失败静默：邮箱仍完整展示在值区 */
  }
};

/* ---------- 设置搜索（2026-09-30） ----------
   索引 = 本页所有行 + 各子页入口，命中后直接执行该行动作（等于跳转/切换），
   与 iOS 设置搜索同思路：搜到就能去，不必先找分组。
   ⚠️ 新增设置项时必须同步补一条，否则它搜不到 —— 这里是搜索的唯一真源。 */
const SETTINGS_ENTRIES = [
  {
    id: 'email',
    group: '账户',
    label: '复制邮箱',
    desc: '把当前登录邮箱复制到剪贴板（身份卡上的邮箱字同款动作）',
    keywords: 'email 邮箱 邮件 登录 找回密码 复制 绑定 账号',
    icon: Mail,
    iconClass: 'is-blue',
    value: () => emailDisplayText.value,
    run: () => copyEmail(),
  },
  {
    id: 'theme',
    group: '通用',
    label: '主题设置',
    desc: '选择浅色、深色或跟随系统',
    keywords: '主题 深色 浅色 暗色 暗黑 夜间 跟随系统 外观 dark light theme',
    icon: Moon,
    iconClass: 'is-purple',
    value: () => props.themeDisplayText,
    run: () => emit('open-theme'),
  },
  {
    id: 'home-gate',
    group: '通用',
    label: '重播首屏开场画',
    desc: '清除「已看过」标记，回到首屏再看一次',
    keywords: '重播 首屏 开场 动画 引导 重置 首页',
    icon: RotateCcw,
    iconClass: 'is-blue',
    run: () => replayHomeGate(),
  },
  {
    id: 'version',
    group: '通用',
    label: '版本',
    desc: '查看当前版本与 Beta 6 介绍',
    keywords: '版本 beta 更新 升级 关于 version',
    icon: Info,
    iconClass: 'is-blue',
    value: () => 'Beta 6',
    run: () => emit('open-version-settings'),
  },
  {
    id: 'assets',
    group: '内容与存储',
    label: '资产',
    desc: '积分明细、订阅、订单、抽奖与赞助',
    keywords: '资产 积分 余额 订阅 订单 抽奖 赞助 钱包 wallet',
    icon: Wallet,
    iconClass: 'is-teal',
    run: () => emit('open-assets'),
  },
  {
    id: 'photo-albums',
    group: '内容与存储',
    label: '摄影集',
    desc: '照片自动排版，装帧一本可带走的影集',
    keywords: '摄影集 相册 照片 影集 排版 打印 album photo',
    icon: Images,
    iconClass: 'is-blue',
    run: () => emit('open-photo-albums'),
  },
  {
    id: 'cloud-plus',
    group: '内容与存储',
    label: 'Cloud+ 页面',
    desc: '进入完整 Cloud+ 设置与管理页面',
    keywords: 'cloud 云 空间 存储 配额 网盘 容量',
    icon: MessagesSquare,
    iconClass: 'is-teal',
    value: () => props.cloudPlusUsageText,
    run: () => emit('open-cloud', 'settings'),
  },
  {
    id: 'login-email',
    group: '账户',
    label: '登录邮箱',
    desc: '登录与找回密码，点击更换',
    keywords: '更换 邮箱 邮件 email 换绑 改邮箱 登录 找回密码 账号 账户安全',
    icon: Mail,
    iconClass: 'is-blue',
    value: () => emailDisplayText.value,
    run: () => emit('open-security', 'email'),
  },
  {
    id: 'password',
    group: '账户与隐私',
    label: '修改密码',
    desc: '输入当前密码并设置新密码，更新登录凭证',
    keywords: '修改密码 改密 重设密码 密码 password 登录 安全 账户安全',
    icon: KeyRound,
    iconClass: 'is-blue',
    run: () => emit('open-security', 'password'),
  },
  {
    id: 'passkey',
    group: '账户与隐私',
    label: '通行密钥',
    desc: '用指纹 / 面容在本设备上快速登录，免输密码',
    keywords: '通行密钥 passkey 指纹 面容 webauthn 免密 登录 设备 账户安全',
    icon: Fingerprint,
    iconClass: 'is-blue',
    run: () => emit('open-security', 'passkey'),
  },
  {
    /* 2026-10-29：原 id='pushplus' / label='Pushplus 推送' → 改成分组「通知」下的「通知设置」。
       keywords 里刻意塞满同义词：用户搜「通知」「推送」「提醒」「微信」「邮件」都该命中，
       而不是只有记住「Pushplus」这个名字的人找得到。 */
    id: 'notify-settings',
    group: '通知',
    label: '通知设置',
    desc: '应用内通知、微信推送，以及各渠道详细配置',
    keywords: '通知 推送 提醒 消息 微信 pushplus 应用内 浏览器 离线 邮件 设置 notify push',
    icon: Bell,
    iconClass: 'is-blue',
    value: () => props.pushplusStatusText,
    run: () => emit('open-pushplus'),
  },
  {
    id: 'follow-mail',
    group: '通知',
    label: '关注的人邮件通知',
    desc: '关注的人发帖或回复你时，发邮件到你绑定的邮箱（同一人 30 分钟一封）',
    keywords: '邮件 邮箱 通知 提醒 关注 特别关注 发帖 回复 mail email notify follow',
    icon: Mail,
    iconClass: 'is-green',
    toggle: true,
    run: () => emit('toggle-follow-mail'),
  },
  {
    id: 'hide-online',
    group: '账户与隐私',
    label: '隐藏在线状态',
    desc: '开启后他人看不到你的在线状态，你也无法查看他人的在线状态',
    keywords: '隐藏 在线 状态 隐身 隐私',
    icon: EyeOff,
    iconClass: 'is-indigo',
    toggle: true,
    run: () => emit('toggle-hide-online'),
  },
  {
    id: 'hide-follow',
    group: '账户与隐私',
    label: '隐藏关注数据',
    desc: '开启后他人在你主页看不到详细关注与粉丝列表，但仍能看到数量',
    keywords: '隐藏 关注 粉丝 列表 隐私',
    icon: Users,
    iconClass: 'is-indigo',
    toggle: true,
    run: () => emit('toggle-hide-follow-data'),
  },
  {
    id: 'data-privacy',
    group: '账户与隐私',
    label: '数据与隐私',
    desc: '公共记忆与管理工具',
    keywords: '数据 隐私 记忆 管理 清除 工具',
    icon: Database,
    iconClass: 'is-indigo',
    value: () => props.dataPrivacyStatusText,
    run: () => emit('open-data-management'),
  },
  {
    id: 'data-export',
    group: '账户与隐私',
    label: '导出我的数据',
    desc: '打包个人资料、帖子、云空间等为 ZIP 下载',
    keywords: '导出 下载 备份 zip 打包 数据',
    icon: Archive,
    iconClass: 'is-indigo',
    value: () => 'ZIP 打包',
    run: () => emit('open-data-export'),
  },
  {
    id: 'delete-account',
    group: '账户与隐私',
    label: '注销账号',
    desc: '高风险操作，三步确认后永久注销账号',
    keywords: '注销 删除账号 关闭账号 永久 危险 delete',
    icon: TriangleAlert,
    iconClass: 'is-red',
    danger: true,
    run: () => emit('open-security', 'delete'),
  },
  {
    id: 'logout',
    group: '账户',
    label: '退出登录',
    desc: '退出当前账号',
    keywords: '退出 登出 注销 换号 账号 logout',
    icon: LogOut,
    iconClass: 'is-red',
    danger: true,
    run: () => emit('logout'),
  },
];

const searchQuery = ref('');
const isSearching = computed(() => searchQuery.value.trim().length > 0);

/* 编辑态 / 子页下一开搜就收起右栏：搜索结果是「另一份内容」，让它们和表单抢同一个位置
   只会出现「搜了但什么都没变」的死点（插槽先被 isSearching 藏掉了）。 */
watch(isSearching, (on) => {
  if (!on) return;
  if (props.editOpen) emit('close-edit');
  if (props.inlinePanel) emit('close-panel');
});

/* 归一化：小写 + 去掉所有空白。中文没有词边界，用子串匹配即可；
   多关键词按空格拆分、每条都必须命中（如「深色 主题」）。 */
const normalizeQueryText = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/\s+/g, '');

const searchResults = computed(() => {
  const terms = searchQuery.value.trim().split(/\s+/).map(normalizeQueryText).filter(Boolean);
  if (!terms.length) return [];
  return SETTINGS_ENTRIES.filter((entry) => {
    // 浏览器不支持 WebAuthn 时「通行密钥」行不渲染，搜索结果也不能把它翻出来
    if (entry.id === 'passkey' && !passkeySupported.value) return false;
    const haystack = normalizeQueryText(
      [entry.label, entry.desc, entry.group, entry.keywords].join(' '),
    );
    return terms.every((term) => haystack.includes(term));
  });
});

const entryIcon = (entry) => {
  if (entry.id === 'theme') return props.currentTheme === 'dark' ? Moon : Sun;
  return entry.icon;
};

const entryIconClass = (entry) => {
  if (entry.id === 'theme') return props.currentTheme === 'dark' ? 'is-purple' : 'is-yellow';
  return entry.iconClass;
};

/* 搜索结果的开关取哪个值 —— 新增 toggle 类条目时**必须**在这里补一行，
   否则会静默落到 hideFollowData 上（搜「邮件」看到的却是「隐藏关注数据」的开关状态）。 */
const entryToggleValue = (entry) => {
  if (entry.id === 'hide-online') return props.hideOnlineStatus;
  if (entry.id === 'follow-mail') return props.followMailEnabled;
  return props.hideFollowData;
};

/* 执行后清空搜索：复制邮箱这类动作留在本页，清空即可回到原列表；
   跳转类动作清空与否用户都看不到。 */
const runEntry = (entry) => {
  searchQuery.value = '';
  entry.run?.();
};
</script>

<style scoped>
@import '../styles/settings-glass.css';

/* iOS 式灰画布（2026-09-30）：卡片是白的，必须压一层灰底才看得出「分离」。
   ⚠️ 2026-10-26：画布改由宿主 `.settings-shell`（tab-page）自己的 background 承担，
   见 styles/profile-base.css。原实现在这里用 `.profile-subpage-shell::before` + `bottom:-100dvh`
   撑到视口底，代价是把 body 的 scrollHeight 顶高 100dvh —— 竖屏下 body 于是成了**第二个滚动容器**
   （style.css 的 `overflow-x:hidden` 会让 `overflow-y:visible` 计算成 auto），
   表现就是「设置页两根滚动条 + 内容结束后多出一屏空白」。 */
.profile-subpage-shell {
  position: relative;
  z-index: 0;
  /* 顶部留白：全局导航栏是 position:fixed（实测高 130px，含动态状态卡），
     而 .settings-shell 的 padding-top 是 0 ⇒ 页面内容从 y=0 起、整块压在导航栏下。
     原值 `padding-top: 0` 导致「设置」标题与首个分组都被盖住（实测 header y=0）。
     --userspace-nav-h 由 UserSpace 宿主提供（实测 78px，不含状态卡）；
     同时改写 --user-center-nav-offset，让 sticky 的页头也停在导航栏下方。 */
  --user-center-nav-offset: var(--userspace-nav-h, 78px);
  padding-top: var(--userspace-nav-h, 78px);
}

/* ---------- 设置搜索 ---------- */
.gs-search {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  padding: 0 12px;
  box-sizing: border-box;
  background: var(--liquid-bg-strong);
  backdrop-filter: var(--liquid-filter-sm);
  -webkit-backdrop-filter: var(--liquid-filter-sm);
  border: 1px solid var(--liquid-border);
  border-radius: var(--liquid-radius-md);
}

/* 竖屏全宽（2026-10-22）：搜索框贴边，圆角与左右边框会让它在通栏时被切出弧形 */
@media (max-width: 767px) {
  .gs-search {
    border-radius: 0;
    border-left-width: 0;
    border-right-width: 0;
    box-shadow: none;
    padding: 0 16px;
  }
}

.gs-search-icon {
  flex-shrink: 0;
  display: inline-flex;
  color: var(--liquid-text-tertiary, #8b9098);
}

.gs-search-input {
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
  border: 0;
  background: transparent;
  color: var(--liquid-text-primary, #1d1d1f);
  font-family: inherit;
  font-size: 15px;
  outline: none;
  -webkit-appearance: none;
  appearance: none;
}

.gs-search-input::placeholder {
  color: var(--liquid-text-tertiary, #8b9098);
}

/* 清除按钮：底色走 --liquid-bg-nested（亮/暗各自派生），不写暗色裸值 */
.gs-search-clear {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: var(--liquid-bg-nested);
  color: var(--liquid-text-secondary, #6e6e73);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.gs-search-clear:hover {
  color: var(--liquid-text-primary, #1d1d1f);
}

/* 猫咪彩蛋（保留） */
.settings-page-cat {
  position: absolute;
  right: 18px;
  top: -8px;
  width: 106px;
  height: 88px;
  opacity: 0.18;
  transform: rotate(7deg);
  pointer-events: none;
  z-index: 0;
}
/* ══ 横屏左右栏（2026-10-26）════════════════════════════════════
   左目录 208px + 右详情。断点判定只在宿主（UserSpaceMain）做一次，
   这里只认 .is-two-pane —— 单栏时下面整块不生效，竖屏零影响。
   右栏同一时间只挂一个分组（其余 v-show 隐藏），所以两栏不会出现
   「右边一长条、左边目录才用到一半」的失衡。 */
.glass-settings.is-two-pane {
  display: grid;
  grid-template-columns: 208px minmax(0, 1fr);
  gap: 32px;
  align-items: start;
}

.gs-aside {
  min-width: 0;
}

/* 单栏（竖屏 / 窄屏）搜索框吸顶（2026-10-29）
   原状 sticky 只写在 .is-two-pane .gs-aside 上 —— 竖屏时搜索框在页面最顶上，
   滚过就再也找不到，15 个条目只能硬滚。这是「找不到」在竖屏下的那一半原因。
   ⚠️ 吸顶必须自带不透明底 + 模糊：否则下面的卡片会从搜索框底下透出来，看着像重影。
   ⚠️ top 用 --userspace-nav-h 而不是 0：滚动容器是宿主的 .tab-page，
      顶部还有导航岛，写 0 会被压在岛下面（与双栏那条同一口径）。 */
.glass-settings:not(.is-two-pane) .gs-aside {
  position: sticky;
  top: calc(var(--userspace-nav-h, 78px) + 8px);
  z-index: 4;
  padding: 8px 0 10px;
  background: var(--liquid-bg, rgba(255, 255, 255, 0.72));
  backdrop-filter: var(--liquid-filter-sm);
  -webkit-backdrop-filter: var(--liquid-filter-sm);
}

/* 左栏吸顶：设置页整体在宿主的 .tab-page 里滚动（不是 window），
   目录跟着停在导航岛下方；矮窗下若目录比视口高，自身可滚。 */
.glass-settings.is-two-pane .gs-aside {
  position: sticky;
  top: calc(var(--userspace-nav-h, 78px) + 12px);
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-height: calc(100dvh - var(--userspace-nav-h, 78px) - 32px);
  overflow-y: auto;
  overscroll-behavior: contain;
}

.gs-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 26px;
}

/* ---------- 右栏子页返回条（2026-10-26）
   所有子页都进右栏后，这一条取代子页原来的宽页头：左边「‹ 账户与隐私」返回上一级，
   右边子页标题。两栏下左目录也在，两条路都能回；竖屏只剩这一条。 */
.gs-inline-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 32px;
}

.gs-inline-back {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 4px 10px 4px 4px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: #0071e3;
  font-family: inherit;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 160ms var(--ease-out, ease-out);
}

/* 异步 chunk 的 scoped 样式晚于 themes/*.css 落地 ⇒ 暗色必须带 html 前缀（写平会被压掉） */
html[data-theme='dark'] .gs-inline-back {
  color: #2997ff;
}

.gs-inline-back:hover {
  background: var(--liquid-bg-nested);
}

/* 双写伪类保证键盘焦点环盖过全局 .bohai-page :focus-visible（特异性打平会静默失效） */
.gs-inline-back:focus-visible:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 2px;
}

.gs-inline-title {
  margin: 0;
  color: var(--liquid-text-primary, #1d1d1f);
  font-size: 15px;
  font-weight: 600;
}

/* ---------- 分类目录 ---------- */
.gs-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px;
  border: 1px solid var(--liquid-border);
  border-radius: var(--liquid-radius-md, 12px);
  background: var(--liquid-bg-strong);
  backdrop-filter: var(--liquid-filter-sm);
  -webkit-backdrop-filter: var(--liquid-filter-sm);
}

.gs-nav-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  min-height: 34px;
  padding: 7px 10px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  /* 状态色全部走既有 token（--rail-pill-bg / --rail-item-bg-hover 由
     side-rail.css 挂在 .user-space-page，暗色已翻转过）——
     这里写裸 rgba 会变成第 N 处需要跟着调色板走的字面量 */
  color: var(--liquid-text-secondary, #6e6e73);
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
  transition:
    background-color 150ms ease,
    color 150ms ease;
}

.gs-nav-item :deep(svg) {
  flex: 0 0 auto;
}

.gs-nav-label {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

@media (hover: hover) and (pointer: fine) {
  .gs-nav-item:hover {
    background: var(--rail-item-bg-hover, rgba(15, 23, 42, 0.05));
  }
}

/* 选中：中性淡染 + 左缘蓝色短条 + 加粗字（三通道，单靠底色在玻璃底上不够读） */
.gs-nav-item.active {
  background: var(--rail-pill-bg, rgba(15, 23, 42, 0.075));
  color: var(--liquid-text-primary, #1d1d1f);
  font-weight: 600;
}

.gs-nav-item.active::before {
  content: '';
  position: absolute;
  left: 1px;
  top: 50%;
  width: 3px;
  height: 16px;
  margin-top: -8px;
  border-radius: 2px;
  background: var(--apple-blue, #0071e3);
}

/* ══ 身份卡（2026-10-26 Apple 账户页形态）══════════════════════════════
   照参考图拆成两层：**上面的人像区不装卡片**（头像/昵称/邮箱直接坐在灰画布上），
   下面三行入口才是一张卡。原先把两段裹进同一张卡里，读起来像「列表顶上多了一块，
   里面又分两段」；Apple 的账户页正是「无容器的居中人像 + 下面一张行卡」。
   ⚠️ 它只在「账户」分类出现，见 showIdentityCard。 */
.gs-identity {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* 居中段：Apple 账户页就是「头像→名字→邮箱」竖排居中，无底色无描边 */
.gs-id-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 10px 20px 0;
  text-align: center;
}

.gs-id-avatar {
  position: relative;
  display: grid;
  place-items: center;
  width: 96px;
  height: 96px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: transform 160ms ease;
}

.gs-id-avatar:active {
  transform: scale(0.97);
}

/* 相机角标：z-index 必须压过头像框层（全局 .boh-avatar-frame 是 z-index:3） */
.gs-id-camera {
  position: absolute;
  right: -2px;
  bottom: -2px;
  z-index: 4;
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 2px solid var(--liquid-bg-strong, #fff);
  background: #0071e3;
  color: #fff;
  pointer-events: none;
}

.gs-id-name {
  margin: 0;
  font-size: 21px;
  font-weight: 700;
  line-height: 1.25;
  letter-spacing: -0.012em;
  color: var(--liquid-text-primary, #1d1d1f);
  overflow-wrap: anywhere;
}

.gs-id-bio {
  margin: -4px 0 0;
  max-width: 34em;
  font-size: 13px;
  line-height: 1.5;
  color: var(--liquid-text-secondary, #6e6e73);
  /* 两行封顶：简介最长 160 字，全展示会把三行入口推出首屏 */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.gs-id-sub {
  margin: -4px 0 0;
  max-width: 100%;
  font-size: 13.5px;
  line-height: 1.45;
  color: var(--liquid-text-tertiary, #8b9098);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 身份卡里的邮箱行同时是「复制」按钮（2026-10-26）
   —— 原来列表里那行「绑定邮箱（点击复制）」是这份数据的第三份拷贝，删行留能力。 */
.gs-id-email {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 100%;
  padding: 3px 9px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  font-family: inherit;
  cursor: pointer;
  transition:
    background-color 150ms ease,
    color 150ms ease;
}

.gs-id-email-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gs-id-email svg {
  flex: 0 0 auto;
  opacity: 0.7;
}

@media (hover: hover) and (pointer: fine) {
  .gs-id-email:hover {
    background: var(--rail-item-bg-hover, rgba(15, 23, 42, 0.05));
    color: var(--liquid-text-secondary, #6e6e73);
  }
}

/* 双写伪类：全局 .bohai-page :focus-visible 与这里特异性打平且更靠后，单写会静默失效 */
.gs-id-email:focus-visible:focus-visible {
  outline: 2px solid var(--liquid-accent, #0071e3);
  outline-offset: 2px;
}

/* ---------- 下段三行入口（真正的卡片本体） ---------- */
.gs-id-rows {
  /* 与 .gs-rows 同一套行几何变量：.gs-row 的 padding / 发丝线内缩都读它们 */
  --gs-row-pad-x: 18px;
  --gs-row-gap: 13px;
  --gs-icon-size: 30px;
  --gs-row-inset: calc(var(--gs-row-pad-x) + var(--gs-icon-size) + var(--gs-row-gap));

  display: flex;
  flex-direction: column;
  background: var(--liquid-bg-strong);
  backdrop-filter: var(--liquid-filter);
  -webkit-backdrop-filter: var(--liquid-filter);
  border: 1px solid var(--liquid-border);
  border-radius: var(--liquid-radius-md);
  box-shadow: var(--liquid-shadow-sm);
  /* 这里的 overflow:hidden 是**必须**的：行 hover 底色要跟着卡片圆角走。
     人像区不在这层里，所以它不会裁到头像框。 */
  overflow: hidden;
}

.gs-id-row-label {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--liquid-text-primary, #1d1d1f);
}

/* ---------- 侧栏账户行（对齐 macOS 系统设置：头像 + 昵称 + 「账户」两行） ---------- */
.gs-nav-item.is-account {
  min-height: 46px;
  padding-top: 6px;
  padding-bottom: 6px;
}

.gs-nav-avatar {
  flex: 0 0 auto;
}

.gs-nav-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  line-height: 1.25;
}

.gs-nav-name,
.gs-nav-sub {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.gs-nav-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--liquid-text-primary, #1d1d1f);
}

.gs-nav-sub {
  font-size: 11px;
  color: var(--liquid-text-tertiary, #8b9098);
}

/* ---------- 暗色 ---------- */
[data-theme='dark'] .gs-nav-sub {
  color: var(--liquid-text-tertiary, #8b9098);
}

/* ---------- 竖屏：卡片退化为通栏（与 .gs-rows / .gs-search 同一处理） ---------- */
@media (max-width: 767px) {
  /* 身份卡把「账户」分组整体下推，竖屏节奏收紧到 16 —— 26 是两栏时的呼吸值 */
  .gs-main {
    gap: 16px;
  }

  .gs-identity {
    gap: 12px;
  }

  .gs-id-rows {
    border-radius: 0;
    border-left-width: 0;
    border-right-width: 0;
    box-shadow: none;
  }

  /* 竖屏一屏高度有限：头像与上下留白各收一档，名字与「我」页昵称同级 */
  .gs-id-hero {
    padding: 6px 20px 0;
    gap: 8px;
  }

  .gs-id-avatar {
    width: 84px;
    height: 84px;
  }

  .gs-id-name {
    font-size: 19px;
  }
}
</style>
