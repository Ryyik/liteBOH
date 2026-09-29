<template>
  <div class="profile-subpage-shell">
    <UserCenterPageHeader
      title="方块积分"
      back-label="返回我的"
      max-width="1200px"
      :show-back="showBack"
      @back="$emit('back')"
    />

    <div class="profile-subpage-body">
      <nav class="ah-hub-card">
        <div class="ah-top-row">
          <div class="ah-user-left">
            <FramedAvatar
              :src="avatarUrl"
              :initial="displayInitial"
              :size="52"
              alt="头像"
              :frame-url="avatarFrame.url"
              :ring="avatarFrame.url ? '' : avatarFrame.ring"
              :frame-scale="avatarFrame.scale || 0"
            />
            <div class="ah-user-info">
              <div class="ah-name-row">
                <span class="ah-username">{{ displayName }}</span>
                <span v-if="tierCode" class="tier-badge" :class="`tier-${tierCode}`">{{
                  tierDisplayName
                }}</span>
              </div>
              <span class="ah-uid">UID · {{ uidShort }}</span>
            </div>
          </div>

          <div v-if="activeTab !== 'overview'" class="ah-points-block">
            <div class="ah-points-icon-wrap">
              <Coins :size="18" :stroke-width="1.7" />
            </div>
            <div class="ah-points-meta">
              <span class="ah-points-label">当前积分</span>
              <span class="ah-points-value">{{ pointsDisplay }}</span>
            </div>
          </div>
        </div>

        <SegmentTabs
          class="ah-segment-tabs"
          :sections="hubSections"
          v-model="activeTabModel"
          aria-label="资产中心分区"
        />
      </nav>

      <Transition name="ah-panel" mode="out-in">
        <section v-if="activeTab === 'overview'" key="overview" class="ah-section ah-overview">
          <header class="ah-overview-heading">
            <div>
              <span>智能概览</span>
              <h2>{{ overviewTitle }}</h2>
              <p>{{ overviewSubtitle }}</p>
            </div>
            <span v-if="overviewLoading" class="ah-overview-updating">正在更新</span>
            <button
              v-else-if="overviewHasErrors"
              type="button"
              class="ah-overview-retry"
              @click="retryOverviewIssues"
            >
              部分动态未更新
            </button>
          </header>

          <div v-if="overviewLoading" class="ah-overview-skeleton" aria-hidden="true">
            <div class="ah-skeleton ah-skeleton-focus">
              <div class="ah-skeleton-icon"></div>
              <div class="ah-skeleton-lines">
                <div class="ah-skeleton-line w-24"></div>
                <div class="ah-skeleton-line w-60"></div>
                <div class="ah-skeleton-line w-80"></div>
              </div>
            </div>
            <div class="ah-skeleton ah-skeleton-points-card is-centered"></div>
            <div class="ah-skeleton ah-skeleton-timeline"></div>
          </div>
          <template v-else>
            <button
              type="button"
              class="ah-smart-focus"
              :class="`tone-${primaryInsight.tone}`"
              @click="handleSmartAction(primaryInsight.action)"
            >
              <span class="ah-smart-focus-icon"
                ><component
                  :is="primaryInsight.icon"
                  :size="22"
                  :stroke-width="1.8"
                  aria-hidden="true"
              /></span>
              <span class="ah-smart-focus-copy">
                <span>{{ primaryInsight.kicker }}</span>
                <strong>{{ primaryInsight.title }}</strong>
                <small>{{ primaryInsight.detail }}</small>
              </span>
              <span class="ah-smart-focus-action">
                {{ primaryInsight.actionLabel }}
                <ChevronRight :size="17" :stroke-width="2" aria-hidden="true" />
              </span>
            </button>

            <div class="ah-overview-points-wrap">
              <PointsCard
                class="ah-overview-points-card"
                :points="userPoints"
                :username="displayName"
                :tier-label="tierDisplayName || 'BOH'"
                :skin="userInfo?.pointsCardSkin"
                :image-url="userInfo?.pointsCardImageUrl"
                interactive
                :show-sponsor-action="false"
                @click="activateTab('decor')"
              />
            </div>

            <div class="ah-smart-columns ah-single-timeline">
              <section class="ah-smart-section" aria-label="最近动态">
                <div class="ah-smart-section-head">
                  <div>
                    <span>最近动态</span>
                    <strong>刚刚发生</strong>
                  </div>
                  <button
                    type="button"
                    aria-label="查看积分明细"
                    title="查看积分明细"
                    @click="activateTab('points')"
                  >
                    <ChevronRight :size="17" :stroke-width="2" aria-hidden="true" />
                  </button>
                </div>
                <div v-if="recentActivities.length" class="ah-smart-timeline">
                  <button
                    v-for="item in recentActivities"
                    :key="item.id"
                    type="button"
                    class="ah-smart-activity"
                    @click="handleSmartAction(item.action)"
                  >
                    <span class="ah-smart-activity-time">{{ item.timeLabel }}</span>
                    <span class="ah-smart-activity-marker" :class="`tone-${item.tone}`"></span>
                    <span class="ah-smart-activity-copy">
                      <strong>{{ item.title }}</strong>
                      <small>{{ item.detail }}</small>
                    </span>
                    <ChevronRight :size="15" :stroke-width="2" aria-hidden="true" />
                  </button>
                </div>
                <div v-else class="ah-smart-quiet">暂时没有新的账户动态</div>
              </section>

              <section class="ah-smart-section" aria-label="接下来">
                <div class="ah-smart-section-head">
                  <div>
                    <span>接下来</span>
                    <strong>{{ upcomingItems.length ? '值得留意' : '无需处理' }}</strong>
                  </div>
                </div>
                <div v-if="upcomingItems.length" class="ah-smart-next-list">
                  <button
                    v-for="item in upcomingItems"
                    :key="item.id"
                    type="button"
                    class="ah-smart-next"
                    :class="`tone-${item.tone}`"
                    @click="handleSmartAction(item.action)"
                  >
                    <span class="ah-smart-next-icon"
                      ><component :is="item.icon" :size="18" :stroke-width="1.8" aria-hidden="true"
                    /></span>
                    <span class="ah-smart-next-copy">
                      <strong>{{ item.title }}</strong>
                      <span>{{ item.detail }}</span>
                    </span>
                    <ChevronRight :size="16" :stroke-width="2" aria-hidden="true" />
                  </button>
                </div>
                <div v-else class="ah-smart-ready">
                  <Check :size="18" :stroke-width="2.3" aria-hidden="true" />
                  <div><strong>账户一切就绪</strong><span>没有即将到期或需要补充的信息</span></div>
                </div>
              </section>
            </div>
          </template>
        </section>

        <section
          v-else-if="activeTab === 'points'"
          key="points"
          class="ah-section ah-points-section"
        >
          <template v-if="pointsView === 'actions'">
            <header class="ah-points-heading">
              <span>方块积分</span>
              <h2>管理你的积分</h2>
              <p>充值补充积分，或查看每一笔积分变动。</p>
            </header>
            <div class="ah-points-action-grid">
              <button
                type="button"
                class="ah-points-action-card is-recharge"
                @click="isRechargeOpen = true"
              >
                <span class="ah-points-action-icon"
                  ><Coins :size="23" :stroke-width="1.8" aria-hidden="true"
                /></span>
                <span class="ah-points-action-copy"
                  ><strong>充值积分</strong><small>扫码联系管理员充值</small></span
                >
                <ChevronRight :size="19" :stroke-width="2" aria-hidden="true" />
              </button>
              <button
                type="button"
                class="ah-points-action-card is-detail"
                @click="openPointsDetail"
              >
                <span class="ah-points-action-icon"
                  ><ScrollText :size="23" :stroke-width="1.8" aria-hidden="true"
                /></span>
                <span class="ah-points-action-copy"
                  ><strong>积分获取明细</strong><small>查看签到、发放与兑换记录</small></span
                >
                <ChevronRight :size="19" :stroke-width="2" aria-hidden="true" />
              </button>
            </div>
          </template>

          <template v-else>
            <header class="ah-points-detail-heading">
              <button
                type="button"
                class="ah-points-back"
                aria-label="返回积分管理"
                @click="pointsView = 'actions'"
              >
                <ChevronRight :size="18" :stroke-width="2" aria-hidden="true" />
              </button>
              <div>
                <span>积分记录</span>
                <h2>积分获取明细</h2>
              </div>
              <div class="ah-points-total">
                <span>当前积分</span><strong>{{ pointsDisplay }}</strong>
              </div>
            </header>
            <div class="ah-points-filter" role="tablist" aria-label="积分明细时间筛选">
              <button
                v-for="filter in pointsDetailFilters"
                :key="filter.id"
                type="button"
                role="tab"
                :aria-selected="pointsDetailFilter === filter.id"
                :class="{ active: pointsDetailFilter === filter.id }"
                @click="pointsDetailFilter = filter.id"
              >
                {{ filter.label }}
              </button>
            </div>
            <div v-if="ledgerLoading" class="ah-order-skeleton">
              <div v-for="n in 4" :key="n" class="ah-skeleton-block" />
            </div>
            <div v-else-if="ledgerError" class="ah-empty-state">
              <div class="ah-empty-icon"><ScrollText :size="26" :stroke-width="1.5" /></div>
              <h3>积分明细暂时无法加载</h3>
              <button type="button" class="ah-shop-btn ah-shop-btn-ghost" @click="retryLedger">
                重试
              </button>
            </div>
            <div v-else-if="ledger.length === 0" class="ah-empty-state">
              <div class="ah-empty-icon"><ScrollText :size="26" :stroke-width="1.5" /></div>
              <h3>暂无积分明细</h3>
              <p>周签到、管理员发放与商城订单都会记录在这里</p>
            </div>
            <div v-else-if="filteredLedger.length === 0" class="ah-empty-state">
              <div class="ah-empty-icon"><ScrollText :size="26" :stroke-width="1.5" /></div>
              <h3>这个时间段暂无记录</h3>
              <p>试试选择更长的时间范围</p>
            </div>
            <div v-else class="ah-ledger">
              <section v-for="group in ledgerGroups" :key="group.label" class="ah-ledger-group">
                <h2>{{ group.label }}</h2>
                <div class="ah-ledger-list">
                  <article v-for="item in group.items" :key="item.key" class="ah-ledger-item">
                    <div class="ah-ledger-icon" :class="`tone-${item.tone}`">
                      <component :is="item.icon" :size="17" :stroke-width="1.8" />
                    </div>
                    <div class="ah-ledger-main">
                      <span class="ah-ledger-title">{{ item.title }}</span
                      ><span v-if="item.remark" class="ah-ledger-remark">{{ item.remark }}</span>
                    </div>
                    <div class="ah-ledger-right">
                      <span
                        class="ah-ledger-amount"
                        :class="{ negative: item.amount < 0, zero: item.amount === 0 }"
                        >{{ item.amount >= 0 ? '+' : '' }}{{ item.amount }}</span
                      ><span class="ah-ledger-date">{{ formatDate(item.time) }}</span>
                    </div>
                  </article>
                </div>
              </section>
            </div>
          </template>

          <Transition name="ah-qr-modal"
            ><div v-if="isRechargeOpen" class="ah-qr-overlay" @click.self="isRechargeOpen = false">
              <section
                class="ah-qr-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="recharge-points-title"
              >
                <button
                  type="button"
                  class="ah-qr-close"
                  aria-label="关闭充值积分"
                  @click="isRechargeOpen = false"
                >
                  <X :size="17" :stroke-width="2" aria-hidden="true" /></button
                ><span class="ah-qr-kicker">充值积分</span>
                <h2 id="recharge-points-title">扫码联系管理员</h2>
                <p>请使用微信扫描收款码，备注你的 UID，管理员确认后将为你充值积分。</p>
                <div class="ah-qr-frame">
                  <img :src="sponsorQrImage" alt="积分充值收款二维码" class="ah-recharge-qr" />
                </div>
                <span class="ah-qr-uid">UID · {{ uidShort }}</span>
              </section>
            </div></Transition
          >
        </section>

        <section v-else-if="activeTab === 'subscription'" key="subscription" class="ah-section">
          <div v-if="subscriptionLoading" class="ah-order-skeleton">
            <div class="ah-skeleton-block" />
          </div>
          <template v-else>
            <article class="ah-membership-card" :class="{ 'is-free': !activeSubscription }">
              <div class="ah-membership-card-top">
                <span>当前会员</span>
                <span class="ah-membership-status">{{
                  activeSubscription ? '生效中' : '免费版'
                }}</span>
              </div>
              <h2>{{ subscriptionDisplayName }}</h2>
              <p>{{ subscriptionExpiryText }}</p>
              <div class="ah-membership-meta">
                <span>Cloud+ {{ cloudImageLimit }} 张</span>
                <span>{{
                  activeSubscription?.billingCycle === 'yearly'
                    ? '年度订阅'
                    : activeSubscription
                      ? '月度订阅'
                      : '基础额度'
                }}</span>
                <span v-if="annualGiftLabel">{{ annualGiftLabel }}</span>
              </div>
              <section
                class="ah-pity-progress"
                :class="{ 'is-due': pityStatus?.isDue, 'is-unavailable': !pityStatus?.eligible }"
                aria-label="抽奖保底进度"
              >
                <div class="ah-pity-progress-head">
                  <span>抽奖保底进度</span><strong>{{ pityProgressLabel }}</strong>
                </div>
                <div
                  v-if="pityStatus?.eligible"
                  class="ah-pity-progress-track"
                  role="progressbar"
                  aria-label="连续未中奖进度"
                  :aria-valuenow="pityStatus.consecutiveLosses"
                  :aria-valuemin="0"
                  :aria-valuemax="pityStatus.threshold"
                >
                  <div
                    class="ah-pity-progress-fill"
                    :style="{ width: `${pityProgressPercent}%` }"
                  ></div>
                </div>
                <p>{{ pityProgressDescription }}</p>
              </section>
              <button
                type="button"
                class="ah-shop-btn"
                @click="showPlanComparison = !showPlanComparison"
              >
                {{
                  showPlanComparison ? '收起方案' : activeSubscription ? '更改方案' : '选择会员方案'
                }}
                <ChevronRight :size="16" :stroke-width="2" aria-hidden="true" />
              </button>
            </article>
            <SubscriptionPlans v-if="showPlanComparison" />
          </template>
        </section>

        <section
          v-else-if="activeTab === 'fulfillment'"
          key="fulfillment"
          class="ah-section ah-fulfillment-section"
        >
          <header class="ah-fulfillment-heading">
            <div>
              <span>服务</span>
              <h2>订单</h2>
              <p>礼物履约、商城兑换记录与收货地址都在这里。</p>
            </div>
            <button
              type="button"
              class="ah-icon-command"
              title="刷新礼物与订单"
              aria-label="刷新礼物与订单"
              @click="refreshFulfillment"
            >
              <RefreshCw :size="17" :stroke-width="2" aria-hidden="true" />
            </button>
          </header>

          <article v-if="currentGift" class="ah-gift-card ah-current-gift-card">
            <header class="ah-gift-header">
              <span class="ah-gift-eyebrow"
                ><Gift :size="14" :stroke-width="2" aria-hidden="true" />进行中的礼物</span
              ><span class="ah-gift-header-date">更新于 {{ giftStatusDate }}</span>
            </header>
            <div class="ah-gift-overview">
              <div class="ah-gift-thumb" :class="{ 'has-image': currentGift.gift_image }">
                <img
                  v-if="currentGift.gift_image"
                  :src="currentGift.gift_image"
                  :alt="currentGift.gift_content"
                  loading="lazy"
                /><Gift v-else :size="30" :stroke-width="1.6" aria-hidden="true" />
              </div>
              <div class="ah-gift-headinfo">
                <div class="ah-gift-headtop">
                  <h3>{{ currentGift.gift_content || '待命中的礼物' }}</h3>
                  <span class="ah-gift-badge" :class="currentGift.gift_status">{{
                    getGiftStatusLabel(currentGift.gift_status)
                  }}</span>
                </div>
                <div class="ah-gift-headsub">
                  <span v-if="currentGift.gift_price" class="ah-gift-amount"
                    >RMB {{ currentGift.gift_price }}</span
                  ><span v-if="currentGift.gift_no" class="ah-gift-history-no">{{
                    currentGift.gift_no
                  }}</span>
                </div>
              </div>
            </div>
            <div class="ah-gift-status-panel" :class="currentGift.gift_status">
              <div class="ah-gift-status-icon">
                <PackageCheck :size="19" :stroke-width="1.8" aria-hidden="true" />
              </div>
              <div class="ah-gift-status-copy">
                <strong>{{ giftStatusHeadline }}</strong>
                <p>{{ giftStatusDesc }}</p>
              </div>
            </div>
          </article>

          <section class="ah-fulfillment-records" aria-label="礼物与订单记录">
            <header class="ah-fulfillment-records-head">
              <div>
                <span>记录</span>
                <h3>礼物与订单记录</h3>
              </div>
              <div class="ah-record-filter" role="tablist" aria-label="记录筛选">
                <button
                  v-for="filter in fulfillmentFilters"
                  :key="filter.id"
                  type="button"
                  role="tab"
                  :aria-selected="recordFilter === filter.id"
                  :class="{ active: recordFilter === filter.id }"
                  @click="recordFilter = filter.id"
                >
                  {{ filter.label }}
                </button>
              </div>
            </header>
            <div v-if="giftsLoading && ordersLoading" class="ah-order-skeleton">
              <div v-for="n in 3" :key="n" class="ah-skeleton-block" />
            </div>
            <div v-else-if="visibleFulfillmentRecords.length" class="ah-fulfillment-record-list">
              <article
                v-for="record in visibleFulfillmentRecords"
                :key="record.id"
                class="ah-fulfillment-record"
              >
                <span class="ah-fulfillment-record-icon" :class="record.type"
                  ><Gift
                    v-if="record.type === 'gift'"
                    :size="17"
                    :stroke-width="1.8"
                    aria-hidden="true" /><Package
                    v-else
                    :size="17"
                    :stroke-width="1.8"
                    aria-hidden="true"
                /></span>
                <div class="ah-fulfillment-record-copy">
                  <strong>{{ record.title }}</strong
                  ><span>{{ record.detail }}</span>
                </div>
                <div class="ah-fulfillment-record-side">
                  <span>{{ formatDateShort(record.time) }}</span
                  ><span
                    v-if="record.type === 'gift'"
                    class="ah-gift-badge is-flat"
                    :class="record.status"
                    >{{ getGiftStatusLabel(record.status) }}</span
                  ><span v-else class="ah-fulfillment-record-points"
                    >-{{ record.points }} 积分</span
                  >
                </div>
              </article>
            </div>
            <div v-else class="ah-empty-state">
              <div class="ah-empty-icon"><Package :size="26" :stroke-width="1.5" /></div>
              <h3>
                {{
                  recordFilter === 'gifts'
                    ? '还没有历史礼物'
                    : recordFilter === 'orders'
                      ? '还没有商城订单'
                      : '还没有礼物或订单记录'
                }}
              </h3>
              <p v-if="recordFilter !== 'gifts'">商城兑换与已归档礼物会出现在这里。</p>
            </div>
            <p v-if="giftsError || ordersError" class="ah-fulfillment-partial-error">
              部分记录暂时无法更新，刷新后重试。
            </p>
          </section>

          <section class="ah-fulfillment-address" aria-label="收货地址">
            <div class="ah-fulfillment-address-head">
              <span>收货地址</span>
              <h3>管理你的收货地址</h3>
              <p>礼物与实物兑换寄送时使用，建议至少保留一个有效地址。</p>
            </div>
            <AddressManager variant="glass" :show-header="false" />
          </section>
        </section>

        <!-- 旧「订单 / 礼物 / 地址」独立 tab 已并入 fulfillment（2026-09 tab 合并），深链经 normalizeInitialTab 映射 -->

        <section
          v-else-if="activeTab === 'lottery'"
          key="lottery"
          class="ah-section ah-lottery-section"
        >
          <div class="ah-lottery-hero">
            <div class="ah-lottery-hero-icon">
              <Ticket :size="22" :stroke-width="1.8" aria-hidden="true" />
            </div>
            <div>
              <span>社区抽奖</span>
              <h2>参与抽奖，赢取方块好礼</h2>
              <p>免费报名，中奖可获奖品与积分回馈。订阅会员可累计保底进度。</p>
            </div>
            <button
              type="button"
              class="ah-lottery-hero-action"
              @click="router.push('/lotteries').catch(() => {})"
            >
              查看全部
            </button>
          </div>
          <div
            v-if="pityStatus"
            class="ah-lottery-pity-inline"
            :class="{ 'is-due': pityStatus.isDue, 'is-unavailable': !pityStatus.eligible }"
          >
            <div class="ah-lottery-pity-head">
              <span>保底进度</span><strong>{{ pityProgressLabel }}</strong>
            </div>
            <div v-if="pityStatus.eligible" class="ah-lottery-pity-track">
              <div class="ah-lottery-pity-fill" :style="{ width: `${pityProgressPercent}%` }"></div>
            </div>
            <p>{{ pityProgressDescription }}</p>
          </div>
          <div v-if="lotteryLoading" class="ah-lottery-skeleton">
            <div v-for="n in 3" :key="n" class="ah-skeleton ah-skeleton-lottery"></div>
          </div>
          <div v-else-if="lotteryError" class="ah-empty-state">
            <div class="ah-empty-icon"><Ticket :size="26" :stroke-width="1.5" /></div>
            <h3>抽奖加载失败</h3>
            <p>{{ lotteryError }}</p>
            <button
              type="button"
              class="ah-shop-btn ah-shop-btn-ghost"
              @click="loadLotteries(true)"
            >
              重试
            </button>
          </div>
          <div v-else-if="!lotteries.length" class="ah-empty-state">
            <div class="ah-empty-icon"><Ticket :size="26" :stroke-width="1.5" /></div>
            <h3>暂无进行中的抽奖</h3>
            <p>社区抽奖会不定期开启，请稍后再来或查看历史</p>
            <button
              type="button"
              class="ah-shop-btn ah-shop-btn-ghost"
              @click="router.push('/lotteries').catch(() => {})"
            >
              去抽奖页看看
            </button>
          </div>
          <div v-else class="ah-lottery-grid">
            <article
              v-for="item in lotteries"
              :key="item.id"
              class="ah-lottery-card"
              :class="`status-${item.status}`"
            >
              <div v-if="item.cover_image_url" class="ah-lottery-cover">
                <img :src="item.cover_image_url" :alt="item.title" loading="lazy" />
              </div>
              <div v-else class="ah-lottery-cover is-empty">
                <Ticket :size="28" :stroke-width="1.6" />
              </div>
              <div class="ah-lottery-body">
                <div class="ah-lottery-top">
                  <span class="ah-lottery-status" :class="item.status">{{
                    getLotteryStatusLabel(item.status)
                  }}</span
                  ><span v-if="item.current_user_entry_id" class="ah-lottery-joined">已报名</span
                  ><span v-if="item.pity_mode === 'eligible'" class="ah-lottery-pity-badge"
                    >保底</span
                  >
                </div>
                <h3 :title="item.title">{{ item.title || '未命名抽奖' }}</h3>
                <p class="ah-lottery-prize" :title="item.prize_title">
                  奖品：{{ item.prize_title || '—' }}
                </p>
                <div class="ah-lottery-meta">
                  <span>{{ item.entry_count || 0 }}人已报名</span
                  ><span>开奖 {{ formatLotteryDrawAt(item.draw_at) }}</span>
                </div>
                <div class="ah-lottery-actions">
                  <button
                    v-if="item.status === 'open' && !item.current_user_entry_id"
                    type="button"
                    class="ah-shop-btn ah-lottery-join"
                    :disabled="joiningLotteryId === item.id"
                    @click="handleJoinLottery(item)"
                  >
                    {{ joiningLotteryId === item.id ? '报名中' : '立即报名' }}
                  </button>
                  <button
                    v-else-if="item.current_user_entry_id"
                    type="button"
                    class="ah-shop-btn ah-lottery-joined-btn"
                    disabled
                  >
                    已报名 #{{ item.current_user_entry_number || '-' }}
                  </button>
                  <button
                    v-else
                    type="button"
                    class="ah-shop-btn ah-shop-btn-ghost"
                    @click="router.push('/lotteries').catch(() => {})"
                  >
                    查看详情
                  </button>
                  <button
                    type="button"
                    class="ah-lottery-link"
                    @click="
                      router
                        .push(`/lotteries?lottery=${encodeURIComponent(item.id)}`)
                        .catch(() => {})
                    "
                  >
                    详情
                  </button>
                </div>
              </div>
            </article>
          </div>
          <div class="ah-lottery-foot">
            <p>抽奖免费参与，保底仅对会员计入。祝你好运。</p>
            <button
              type="button"
              class="ah-shop-btn ah-shop-btn-ghost"
              @click="router.push('/lotteries').catch(() => {})"
            >
              前往抽奖页
            </button>
          </div>
        </section>

        <section
          v-else-if="activeTab === 'sponsor'"
          key="sponsor"
          class="ah-section ah-sponsor-section"
        >
          <div class="ah-sponsor-hero">
            <div class="ah-sponsor-hero-icon">
              <Heart :size="22" :stroke-width="1.8" aria-hidden="true" />
            </div>
            <div>
              <span>支持社区</span>
              <h2>赞助方块之家</h2>
              <p>你的每一份支持，都让社区的方块更温暖。赞助款将用于服务器与活动奖品。</p>
            </div>
          </div>
          <div class="ah-sponsor-grid">
            <article class="ah-sponsor-card">
              <h3><span class="ah-sponsor-badge">推荐</span> 微信赞赏</h3>
              <p>扫码赞赏，金额随心。赞助后可在积分卡展示赞助标识。</p>
              <div class="ah-sponsor-qr-wrap">
                <img :src="sponsorQrImage" alt="微信赞赏码" loading="lazy" />
              </div>
              <small>长按保存 · 微信扫码</small>
            </article>
            <article class="ah-sponsor-card is-muted">
              <h3>支付宝</h3>
              <p>暂未开通，敬请期待。</p>
              <div class="ah-sponsor-qr-wrap is-placeholder">
                <span>—</span>
              </div>
              <small>后续开放</small>
            </article>
          </div>
          <div class="ah-sponsor-foot">
            <p>赞助属自愿行为，不与抽奖保底、积分权益挂钩。感谢每一位支持者。</p>
            <button
              type="button"
              class="ah-shop-btn ah-shop-btn-ghost"
              @click="activateTab('overview')"
            >
              返回概览
            </button>
          </div>
        </section>

        <section v-else-if="activeTab === 'decor'" key="decor" class="ah-section ah-decor">
          <header class="ah-overview-heading">
            <div>
              <span>个性化</span>
              <h2>装扮</h2>
              <p>选择你的头像框，佩戴后全站头像同步展示。更多装扮类型陆续上线。</p>
            </div>
          </header>
          <AvatarFrameGrid
            :avatar-url="avatarUrl"
            :tier-code="tierCode"
            @unlock="activateTab('subscription')"
          />

          <div class="ah-decor-subhead">
            <h3>积分卡面</h3>
            <p>选择空白卡、全员小猫主题，或上传自己的卡面。</p>
          </div>
          <div class="ah-cards-panel">
            <PointsCard
              :points="userPoints"
              :username="displayName"
              :tier-label="tierDisplayName || 'BOH'"
              :skin="userInfo?.pointsCardSkin"
              :image-url="userInfo?.pointsCardImageUrl"
              show-sponsor-action
              @sponsor="$emit('sponsor')"
            />
            <div class="ah-skin-grid" aria-label="积分卡皮肤">
              <button
                type="button"
                class="ah-skin-option"
                :class="{ active: userInfo?.pointsCardSkin === 'blank' }"
                @click="$emit('set-points-card-skin', 'blank')"
              >
                <span class="ah-skin-preview is-blank"
                  ><Coins :size="18" :stroke-width="1.8" /></span
                ><strong>空白卡</strong><small>默认样式</small>
              </button>
              <button
                type="button"
                class="ah-skin-option is-cats-skin"
                :class="{ active: pointsCardCatsUnlocked && userInfo?.pointsCardSkin === 'cats' }"
                :disabled="isRedeemingPointsCardCats"
                @click="handleCatsSkinClick"
              >
                <span class="ah-skin-preview is-cats"
                  ><img
                    v-for="cat in catSkinPreviewAssets"
                    :key="cat.id"
                    :src="cat.src"
                    alt="" /></span
                ><strong>全员小猫</strong
                ><small>{{
                  isRedeemingPointsCardCats
                    ? '兑换中'
                    : pointsCardCatsUnlocked
                      ? '已兑换'
                      : '3 积分兑换'
                }}</small>
              </button>
              <button
                type="button"
                class="ah-skin-option"
                :disabled="isPointsCardPresetQuotaLoading || !canAddPointsCardPreset"
                @click="$emit('upload-points-card')"
              >
                <span class="ah-skin-preview is-custom"
                  ><ImagePlus :size="18" :stroke-width="1.8" /></span
                ><strong>添加卡面</strong><small>上传并裁切</small>
              </button>
            </div>

            <section class="ah-card-presets" aria-label="自定义卡面预设">
              <div class="ah-card-presets-heading">
                <span>自定义预设</span>
                <small v-if="!isPointsCardPresetsLoading"
                  >{{ pointsCardPresets.length }} / {{ pointsCardPresetCapacity }} 张</small
                >
              </div>
              <div v-if="isPointsCardPresetsLoading" class="ah-card-preset-grid" aria-hidden="true">
                <div v-for="n in 3" :key="n" class="ah-skeleton ah-skeleton-preset"></div>
              </div>
              <div v-else-if="pointsCardPresets.length" class="ah-card-preset-grid">
                <article
                  v-for="preset in pointsCardPresets"
                  :key="preset.id"
                  class="ah-card-preset"
                  :class="{
                    active:
                      userInfo?.pointsCardSkin === 'custom' &&
                      userInfo?.pointsCardImageUrl === preset.imageUrl,
                  }"
                >
                  <button
                    type="button"
                    class="ah-card-preset-select"
                    :aria-label="'使用自定义卡面预设'"
                    @click="$emit('select-points-card-preset', preset.id)"
                  >
                    <img :src="pointsCardPresetThumb(preset)" alt="自定义卡面预设" loading="lazy" />
                    <span>自定义卡面</span>
                  </button>
                  <button
                    type="button"
                    class="ah-card-preset-delete"
                    aria-label="删除此自定义卡面预设"
                    title="删除此预设"
                    @click="$emit('delete-points-card-preset', preset.id)"
                  >
                    <Trash2 :size="15" :stroke-width="2" aria-hidden="true" />
                  </button>
                </article>
              </div>
              <div v-else class="ah-card-presets-empty">暂无自定义预设</div>
              <p v-if="!isPointsCardPresetsLoading" class="ah-card-presets-retention">
                未启用的卡面超过 90 天会自动清理
              </p>
            </section>
          </div>
        </section>
      </Transition>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import {
  CalendarCheck,
  Check,
  ChevronRight,
  Coins,
  Crown,
  Gift,
  Heart,
  ImagePlus,
  LayoutDashboard,
  MapPin,
  Package,
  PackageCheck,
  RefreshCw,
  ScrollText,
  Send,
  ShoppingBag,
  Sparkles,
  Ticket,
  Trash2,
  Trophy,
  X,
} from 'lucide-vue-next';
import UserCenterPageHeader from '@/components/UserCenterPageHeader.vue';
import SubscriptionPlans from '@/components/SubscriptionPlans.vue';
import AddressManager from '@/components/AddressManager.vue';
import sponsorQrImage from '@/assets/images/qrcode.webp';
import { useAuthStore } from '@/stores/auth';
import { useProductsStore } from '@/stores/products';
import { supabase } from '@/utils/supabase-client.js';
import { useUserTier } from '@/composables/useUserTier.js';
import { PLAN_DISPLAY_NAMES } from '@/utils/subscription-benefits.js';
import { getExpiredActiveGiftIds, markGiftsAsHistory } from '@/utils/gift-archive.js';
import { logger } from '@/utils/logger.js';
import { getMyLotteryPityStatus, getMySubscriptions } from '@/utils/api/subscription-api.js';
import { getCommunityLotteries, joinCommunityLottery } from '@/utils/api/lottery-api.js';
import { showIsland } from '@/composables/useIsland.js';
import PointsCard from './PointsCard.vue';
import SegmentTabs from './SegmentTabs.vue';
import AvatarFrameGrid from './AvatarFrameGrid.vue';
import FramedAvatar from './FramedAvatar.vue';
import { useAvatarFrame } from '@/composables/useAvatarFrame.js';
import { HOME_CAT_ASSETS } from '@/utils/home-cat-theme.js';
import { resolveDbCardImage } from '@/utils/db-image-url.js';

const emit = defineEmits([
  'back',
  'upload-points-card',
  'set-points-card-skin',
  'select-points-card-preset',
  'delete-points-card-preset',
  'redeem-points-card-cats',
  'sponsor',
  'load-points-card-data',
]);

const props = defineProps({
  showBack: { type: Boolean, default: true },
  initialTab: { type: String, default: '' },
  pointsCardPresets: { type: Array, default: () => [] },
  isPointsCardPresetsLoading: { type: Boolean, default: false },
  pointsCardPresetCapacity: { type: Number, default: 3 },
  isPointsCardPresetQuotaLoading: { type: Boolean, default: false },
  pointsCardCatsUnlocked: { type: Boolean, default: false },
  isRedeemingPointsCardCats: { type: Boolean, default: false },
});

const router = useRouter();
const authStore = useAuthStore();
const { userInfo } = storeToRefs(authStore);
const productsStore = useProductsStore();
const { productsData } = storeToRefs(productsStore);

const { fetchUserTier, getUserTierCode } = useUserTier();
const tierCode = ref('');
const tierDisplayName = computed(() => PLAN_DISPLAY_NAMES[tierCode.value] || '');
const canAddPointsCardPreset = computed(
  () =>
    Number(props.pointsCardPresets.length) <
    Math.max(3, Number(props.pointsCardPresetCapacity) || 3),
);
const catSkinPreviewAssets = Object.entries(HOME_CAT_ASSETS).map(([id, src]) => ({ id, src }));

// 预设缩略图同样来自数据库（points_card_presets.image_url，Cloudinary 直链，大陆不可达），
// 只在渲染 src 时改写。⚠️ `:class` 的 active 判断必须继续比**原始**值
// （userInfo.pointsCardImageUrl === preset.imageUrl），两边若一个改写一个不改写会导致选中态丢失。
const pointsCardPresetThumb = (preset) => resolveDbCardImage(preset?.imageUrl);
const handleCatsSkinClick = () => {
  if (props.isRedeemingPointsCardCats) return;
  if (props.pointsCardCatsUnlocked) {
    emit('set-points-card-skin', 'cats');
    return;
  }
  emit('redeem-points-card-cats');
};

const betaTabIds = new Set([
  'overview',
  'decor',
  'points',
  'subscription',
  'fulfillment',
  'lottery',
  'sponsor',
]);
const normalizeInitialTab = () => {
  let tab = String(props.initialTab || '');
  // 旧 tab 入口兼容映射：orders/gifts/addresses → fulfillment；cards → decor（2026-09 tab 合并）
  if (['orders', 'gifts', 'addresses'].includes(tab)) tab = 'fulfillment';
  if (tab === 'cards') tab = 'decor';
  return betaTabIds.has(tab) ? tab : 'overview';
};
const activeTab = ref(normalizeInitialTab());
// 2026-09-11 起换 SegmentTabs 纯文字单行平铺；icon 字段保留备用，当前不渲染
const tabGroups = computed(() => [
  { id: 'overview', label: '概览', icon: LayoutDashboard },
  { id: 'decor', label: '装扮', icon: ImagePlus },
  { id: 'points', label: '积分', icon: ScrollText },
  { id: 'subscription', label: '订阅', icon: Crown },
  { id: 'fulfillment', label: '订单', icon: Package },
  { id: 'lottery', label: '抽奖', icon: Ticket },
  { id: 'sponsor', label: '赞助', icon: Heart },
]);
const hubSections = computed(() => tabGroups.value.map(({ id, label }) => ({ id, label })));

const activeTabModel = computed({
  get: () => activeTab.value,
  set: (tabId) => activateTab(tabId),
});

const avatarUrl = computed(() => String(userInfo.value?.avatarUrl || '').trim());
const displayName = computed(() => String(userInfo.value?.username || '').trim() || '未命名用户');
const displayInitial = computed(() => displayName.value.charAt(0).toUpperCase());
const uidShort = computed(() => String(userInfo.value?.id || '').slice(0, 8));

// 顶卡头像戴框：状态单源 useAvatarFrame（装扮 tab 换框时此处实时同步）
const { effectiveFrame: avatarFrame } = useAvatarFrame(tierCode);

const ordersLoading = ref(false);
const ordersLoaded = ref(false);
const ordersError = ref('');
const orders = ref([]);
const ledgerLoading = ref(false);
const ledgerLoaded = ref(false);
const ledgerError = ref('');
const ledger = ref([]);
const pointsView = ref('actions');
const isRechargeOpen = ref(false);
const pointsDetailFilter = ref('week');
const pointsDetailFilters = [
  { id: 'week', label: '一周' },
  { id: 'month', label: '一个月' },
  { id: 'all', label: '更久' },
];
const subscriptionLoading = ref(true);
const activeSubscription = ref(null);
const annualGiftSubscription = ref(null);
const pityStatus = ref(null);
const showPlanComparison = ref(false);
// The initial overview load is started from onMounted. Starting in the loading
// state would make that first call return early and leave the panel stuck.
const overviewLoading = ref(false);
const addressCount = ref(0);

const userPoints = computed(() => Number(userInfo.value?.points) || 0);
const pointsDisplay = computed(() => userPoints.value.toLocaleString());
const cloudImageLimit = computed(
  () => ({ free: 150, plus: 300, pro: 450, max: 900, ultra: 1200 })[tierCode.value] || 150,
);
const subscriptionDisplayName = computed(() => {
  const subscription = activeSubscription.value;
  return (
    subscription?.planName ||
    PLAN_DISPLAY_NAMES[subscription?.planCode] ||
    tierDisplayName.value ||
    'Free'
  );
});
const subscriptionExpiryDays = computed(() => {
  const expiresAt = Date.parse(activeSubscription.value?.expiresAt || '');
  if (!Number.isFinite(expiresAt)) return null;
  return Math.max(0, Math.ceil((expiresAt - Date.now()) / 86400000));
});
const subscriptionExpiryText = computed(() => {
  if (!activeSubscription.value?.expiresAt) return '当前为基础账户，可随时选择会员方案';
  const expiresAt = new Date(activeSubscription.value.expiresAt);
  if (Number.isNaN(expiresAt.getTime())) return '会员状态已生效';
  if (subscriptionExpiryDays.value <= 30)
    return `还有 ${subscriptionExpiryDays.value} 天到期，请及时续订`;
  return `有效期至 ${expiresAt.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}`;
});
const annualGiftLabel = computed(() =>
  String(annualGiftSubscription.value?.metadata?.yearly_gift?.label || '').trim(),
);
const pityProgressPercent = computed(() => {
  if (!pityStatus.value?.eligible || pityStatus.value.threshold <= 0) return 0;
  return Math.min(
    100,
    Math.round((pityStatus.value.consecutiveLosses / pityStatus.value.threshold) * 100),
  );
});
const pityProgressLabel = computed(() => {
  if (!pityStatus.value?.eligible) return '订阅 Plus 后开启';
  if (pityStatus.value.isDue) return '下一次保底活动可兑现';
  return `${pityStatus.value.consecutiveLosses} / ${pityStatus.value.threshold} 场`;
});
const pityProgressDescription = computed(() => {
  if (!pityStatus.value?.eligible) return 'Free 账户可参与抽奖，但不累计会员保底进度。';
  if (pityStatus.value.isDue)
    return '已达到保底条件；下一次参与“计入失败，并兑现保底礼”的活动即可获得保底礼。';
  return `连续参与计入活动但未获奖 ${pityStatus.value.consecutiveLosses} 场，还差 ${pityStatus.value.remainingLosses} 场进入保底。`;
});

const availableProducts = computed(() =>
  Array.isArray(productsData.value) ? productsData.value : [],
);
const redeemableProducts = computed(() =>
  availableProducts.value
    .filter(
      (product) =>
        product.is_active !== false &&
        product.is_purchasable !== false &&
        product.payment_mode !== 'rmb_only' &&
        Number(product.points_cost) > 0 &&
        Number(product.stock) !== 0 &&
        Number(product.points_cost) <= userPoints.value,
    )
    .sort((a, b) => Number(a.points_cost) - Number(b.points_cost)),
);

const nextRewardProduct = computed(
  () =>
    availableProducts.value
      .filter(
        (product) =>
          product.is_active !== false &&
          product.is_purchasable !== false &&
          product.payment_mode !== 'rmb_only' &&
          Number(product.points_cost) > userPoints.value &&
          Number(product.stock) !== 0,
      )
      .sort((a, b) => Number(a.points_cost) - Number(b.points_cost))[0] || null,
);

const recentPointsNet = computed(() =>
  ledger.value
    .filter((item) => isWithinDays(item.time, 30))
    .reduce((sum, item) => sum + (Number(item.amount) || 0), 0),
);

const pointsContextText = computed(() => {
  if (recentPointsNet.value !== 0)
    return `近 30 天净变化 ${recentPointsNet.value > 0 ? '+' : ''}${recentPointsNet.value}`;
  if (redeemableProducts.value.length > 0)
    return `当前可兑换 ${redeemableProducts.value.length} 件商品`;
  if (nextRewardProduct.value) {
    const gap = Number(nextRewardProduct.value.points_cost) - userPoints.value;
    return `距离 ${nextRewardProduct.value.title} 还差 ${gap} 积分`;
  }
  return '积分可用于商城兑换';
});

const filteredLedger = computed(() => {
  const days =
    pointsDetailFilter.value === 'week' ? 7 : pointsDetailFilter.value === 'month' ? 30 : null;
  if (!days) return ledger.value;
  return ledger.value.filter((item) => isWithinDays(item.time, days));
});

const ledgerGroups = computed(() => {
  const buckets = new Map([
    ['今天', []],
    ['近 7 天', []],
    ['更早', []],
  ]);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const weekStart = todayStart - 6 * 86400000;
  filteredLedger.value.forEach((item) => {
    const timestamp = new Date(item.time).getTime();
    const label = timestamp >= todayStart ? '今天' : timestamp >= weekStart ? '近 7 天' : '更早';
    buckets.get(label).push(item);
  });
  return [...buckets.entries()]
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({ label, items }));
});

const openPointsDetail = () => {
  pointsView.value = 'detail';
  void loadLedger();
};
const retryLedger = () => {
  ledgerLoaded.value = false;
  void loadLedger();
};

const formatPoints = (pts) => {
  const n = Number(pts) || 0;
  if (n >= 10000) return (n / 10000).toFixed(1) + 'w';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return n.toLocaleString();
};

const formatDate = (d) => {
  if (!d) return '--';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
};

const isWithinDays = (dateValue, days) => {
  const timestamp = Date.parse(dateValue || '');
  return Number.isFinite(timestamp) && timestamp >= Date.now() - days * 86400000;
};

const isMissingColumnError = (error, columnName) => {
  const code = String(error?.code || '')
    .trim()
    .toUpperCase();
  const detail =
    `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  const column = String(columnName || '')
    .trim()
    .toLowerCase();
  return (
    code === '42703' ||
    code === 'PGRST204' ||
    (column && detail.includes(column) && detail.includes('column'))
  );
};

const loadOrders = async () => {
  if (ordersLoading.value || ordersLoaded.value) return;
  if (!userInfo.value?.id) {
    ordersLoaded.value = true;
    return;
  }
  ordersLoading.value = true;
  ordersError.value = '';
  try {
    const { data, error } = await supabase
      .from('shop_points_orders')
      .select('id, order_no, total_points, items, created_at')
      .eq('user_id', userInfo.value.id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    orders.value = Array.isArray(data)
      ? data.map((o) => ({
          ...o,
          item_count: Array.isArray(o.items)
            ? o.items.reduce((s, i) => s + (Number(i?.quantity) || 0), 0)
            : 0,
        }))
      : [];
    ordersLoaded.value = true;
  } catch (error) {
    ordersError.value = '加载失败';
    logger.warn('assets-hub', '加载订单失败:', error);
  } finally {
    ordersLoading.value = false;
  }
};

const WEEKLY_CHECKIN_POINTS = 5;
// 2026-06-30 订阅体系重构：周签到改为每周 +5；此前为「连续 4 周才 +5」
const CHECKIN_NEW_LOGIC_CUTOFF = new Date('2026-06-30T00:00:00.000Z').getTime();

const toWeekKey = (d) => {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// 计算某次签到的实际奖励：重构后每周 +5；重构前的记录按连续签到第 4/8/12… 周 +5，其余 +0
const resolveCheckinAmount = (signedAt, weekStartDate, weekSet) => {
  if (!signedAt || new Date(signedAt).getTime() >= CHECKIN_NEW_LOGIC_CUTOFF) {
    return WEEKLY_CHECKIN_POINTS;
  }
  let streak = 1;
  let cursor = new Date(`${weekStartDate}T00:00:00.000Z`);
  cursor = new Date(cursor.getTime() - 7 * 86400000);
  while (weekSet.has(toWeekKey(cursor))) {
    streak += 1;
    cursor = new Date(cursor.getTime() - 7 * 86400000);
  }
  return streak % 4 === 0 ? WEEKLY_CHECKIN_POINTS : 0;
};

const loadLedger = async () => {
  if (ledgerLoading.value || ledgerLoaded.value) return;
  const userId = userInfo.value?.id;
  if (!userId) {
    ledgerLoaded.value = true;
    return;
  }
  ledgerLoading.value = true;
  ledgerError.value = '';

  try {
    const results = [];

    const ledgerRequests = [
      supabase
        .from('forum_weekly_checkins')
        .select('id, week_start_date, signed_at')
        .eq('user_id', userId)
        .order('signed_at', { ascending: false })
        .limit(50),
      supabase
        .from('points_transactions')
        .select('id, amount, balance_after, reason, remark, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50),
    ];
    // 概览已读取订单时直接复用，避免首次进入资产中心重复请求同一张表。
    if (!ordersLoaded.value) {
      ledgerRequests.push(
        supabase
          .from('shop_points_orders')
          .select('id, order_no, total_points, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(50),
      );
    }
    const settled = await Promise.allSettled(ledgerRequests);
    const [checkinRes, adminRes] = settled;
    const orderRes = ordersLoaded.value
      ? { status: 'fulfilled', value: { data: orders.value, error: null } }
      : settled[2];

    if (
      checkinRes.status === 'fulfilled' &&
      !checkinRes.value.error &&
      Array.isArray(checkinRes.value.data)
    ) {
      const weekSet = new Set(checkinRes.value.data.map((r) => String(r.week_start_date)));
      checkinRes.value.data.forEach((row) => {
        const amount = resolveCheckinAmount(row.signed_at, row.week_start_date, weekSet);
        results.push({
          key: `checkin-${row.id}`,
          icon: CalendarCheck,
          tone: amount > 0 ? 'green' : 'gray',
          title: '周签到',
          remark: `第 ${formatWeekLabel(row.week_start_date)} 周`,
          amount,
          time: row.signed_at,
        });
      });
    }

    if (
      adminRes.status === 'fulfilled' &&
      !adminRes.value.error &&
      Array.isArray(adminRes.value.data)
    ) {
      adminRes.value.data
        .filter((row) => ['admin_grant', 'points_card_cats', 'ai_usage'].includes(row.reason))
        .forEach((row) => {
          const isCatsRedemption = row.reason === 'points_card_cats';
          const isAiUsage = row.reason === 'ai_usage';
          results.push({
            key: `${isAiUsage ? 'ai-usage' : isCatsRedemption ? 'cats-card' : 'grant'}-${row.id}`,
            icon: isAiUsage ? Sparkles : isCatsRedemption ? Coins : Send,
            tone: isAiUsage ? 'gray' : isCatsRedemption ? 'orange' : 'blue',
            title: isAiUsage
              ? 'BOHAI 服务计费'
              : isCatsRedemption
                ? '兑换全员小猫卡面'
                : '管理员发放',
            remark:
              String(row.remark || '').trim() ||
              (isAiUsage ? 'AI 对话消耗' : isCatsRedemption ? '小猫卡面' : '积分发放'),
            amount: Number(row.amount) || 0,
            time: row.created_at,
          });
        });
    }

    if (
      orderRes.status === 'fulfilled' &&
      !orderRes.value.error &&
      Array.isArray(orderRes.value.data)
    ) {
      orderRes.value.data.forEach((row) => {
        results.push({
          key: `order-${row.id}`,
          icon: ShoppingBag,
          tone: 'orange',
          title: '商城订单',
          remark: String(row.order_no || '').slice(0, 18),
          amount: -(Number(row.total_points) || 0),
          time: row.created_at,
        });
      });
    }

    results.sort((a, b) => new Date(b.time) - new Date(a.time));
    ledger.value = results;
    ledgerLoaded.value = true;
  } catch (error) {
    ledgerError.value = '加载失败';
    logger.warn('assets-hub', '加载积分明细失败:', error);
  } finally {
    ledgerLoading.value = false;
  }
};

const formatWeekLabel = (weekStart) => {
  if (!weekStart) return '';
  const date = new Date(`${weekStart}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  const end = new Date(date);
  end.setDate(end.getDate() + 6);
  const pad = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
  return `${pad(date)}–${pad(end)}`;
};

const goToShop = () => {
  router.push('/shop');
};

const loadTier = async () => {
  const id = userInfo.value?.id;
  if (!id) return;
  await fetchUserTier(id);
  tierCode.value = getUserTierCode(id) || 'free';
};

const loadSubscription = async () => {
  const userId = userInfo.value?.id;
  if (!userId) {
    activeSubscription.value = null;
    annualGiftSubscription.value = null;
    pityStatus.value = null;
    subscriptionLoading.value = false;
    return;
  }
  subscriptionLoading.value = true;
  try {
    const [result, pityResult] = await Promise.all([
      getMySubscriptions(userId, { includeExpired: false }),
      getMyLotteryPityStatus(),
    ]);
    const activeItems = result.ok && Array.isArray(result.data) ? result.data : [];
    activeSubscription.value = activeItems[0] || null;
    annualGiftSubscription.value =
      activeItems.find((item) => String(item?.metadata?.yearly_gift?.label || '').trim()) || null;
    pityStatus.value = pityResult.ok ? pityResult.data : null;
  } catch (error) {
    logger.warn('assets-hub', '加载会员状态失败:', error);
    activeSubscription.value = null;
    annualGiftSubscription.value = null;
    pityStatus.value = null;
  } finally {
    subscriptionLoading.value = false;
  }
};

const activateTab = (tabId) => {
  if (!betaTabIds.has(tabId)) return;
  activeTab.value = tabId;
  if (tabId === 'overview') void loadOverview();
  if (tabId === 'decor') emit('load-points-card-data');
  if (tabId === 'points') void loadLedger();
  if (tabId === 'subscription') void loadSubscription();
  if (tabId === 'lottery') void loadLotteries();
  if (tabId === 'fulfillment') {
    void loadOrders();
    void loadGifts();
  }
};

// ─── 抽奖数据（独立小分页） ───
const lotteryLoading = ref(false);
const lotteryLoaded = ref(false);
const lotteryError = ref('');
const lotteries = ref([]);
const joiningLotteryId = ref('');
const _originShowToast = (msg, type = 'info') => {
  try {
    window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: msg, type } }));
  } catch {
    /* dispatchEvent 在事件对象构造失败等极端情况下会抛。提示只是锦上添花，失败静默。 */
  }
  logger.info('lottery-tab', `${type}: ${msg}`);
};
const showToast = (msg, type = 'info') => {
  const text = String(msg || '');
  const iconMap = { success: 'success', error: 'warning', info: 'notification' };
  const icon = iconMap[type] || 'notification';
  let title = text;
  let message = '';
  if (text === '已报名，无需重复') {
    title = '已报名';
    message = '该抽奖已报名无需重复';
  } else if (text === '报名成功') {
    title = '报名成功';
    message = '已获得本期抽奖资格';
  } else if (text === '报名失败' || text.includes('报名失败')) {
    title = '报名失败';
    message = text.replace(/^报名失败[:：]?\s*/, '') || '请稍后重试';
  } else if (text.length > 24) {
    title = text.slice(0, 24);
    message = text.slice(24);
  }
  let ok = false;
  try {
    ok = showIsland.notify({ title, message, icon, durationMs: icon === 'warning' ? 3600 : 3200 });
  } catch {
    ok = false;
  }
  if (ok) return;
  return (
    _originShowToast(msg ? `${title} ${message}`.trim() : title, type) ||
    _originShowToast(text, type)
  );
};
const loadLotteries = async (force = false) => {
  if (lotteryLoading.value) return;
  if (lotteryLoaded.value && !force) return;
  lotteryLoading.value = true;
  lotteryError.value = '';
  try {
    const { data, error } = await getCommunityLotteries();
    if (error) throw error;
    lotteries.value = Array.isArray(data) ? data : [];
    lotteryLoaded.value = true;
  } catch (e) {
    lotteryError.value = e?.message || '加载失败';
    logger.warn('lottery-tab', '加载抽奖失败:', e);
  } finally {
    lotteryLoading.value = false;
  }
};
const handleJoinLottery = async (lottery) => {
  if (!lottery?.id || joiningLotteryId.value) return;
  if (lottery.current_user_entry_id) {
    showToast('已报名，无需重复', 'info');
    return;
  }
  joiningLotteryId.value = lottery.id;
  try {
    const { data, error } = await joinCommunityLottery(lottery.id);
    if (error) throw error;
    if (data && data.ok === false) throw new Error(data.message || '报名失败');
    showToast('报名成功', 'success');
    await loadLotteries(true);
    await loadLotteryPityStatus();
  } catch (e) {
    showToast(e?.message || '报名失败', 'error');
  } finally {
    joiningLotteryId.value = '';
  }
};
const loadLotteryPityStatus = async () => {
  try {
    const { data } = await getMyLotteryPityStatus();
    if (data) pityStatus.value = data;
  } catch (error) {
    /* 请求失败时不阻断面板：保底进度是辅助信息，拿不到就不显示。
       2026-09-28 补 logger.warn：这条原本是**静默失败**（排查「保底数字不见了」时的盲点）。
       同文件 1416 行处同一类失败早就在记日志了，这里不记属于自相矛盾。 */
    logger.warn('assets-hub', '加载抽奖保底进度失败（面板不显示保底数字）:', error);
  }
};
const getLotteryStatusLabel = (s) =>
  ({ open: '报名中', drawn: '已开奖', closed: '已结束' })[String(s || '')] || String(s || '');
const formatLotteryDrawAt = (v) => {
  if (!v) return '待定';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '待定';
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// ─── 礼物数据 ───
const giftsLoading = ref(false);
const giftsLoaded = ref(false);
const giftsError = ref('');
const currentGift = ref(null);
const historyGifts = ref([]);
const recordFilter = ref('all');
const fulfillmentFilters = [
  { id: 'all', label: '全部' },
  { id: 'gifts', label: '礼物' },
  { id: 'orders', label: '订单' },
];

const fulfillmentRecords = computed(() =>
  [
    ...historyGifts.value.map((gift) => ({
      id: `gift-${gift.id}`,
      type: 'gift',
      title: gift.gift_content || '未命名礼物',
      detail: gift.gift_no || '礼物记录',
      status: gift.gift_status,
      time: gift.completed_at || gift.updated_at || gift.created_at,
    })),
    ...orders.value.map((order) => ({
      id: `order-${order.id}`,
      type: 'order',
      title: `商城订单 · ${order.item_count} 件商品`,
      detail: order.order_no || '订单记录',
      points: Number(order.total_points) || 0,
      time: order.created_at,
    })),
  ]
    .filter((record) => Number.isFinite(Date.parse(record.time || '')))
    .sort((a, b) => Date.parse(b.time) - Date.parse(a.time)),
);

const visibleFulfillmentRecords = computed(() =>
  recordFilter.value === 'all'
    ? fulfillmentRecords.value
    : fulfillmentRecords.value.filter((record) => record.type === recordFilter.value.slice(0, -1)),
);

const recentOrder = computed(
  () => orders.value.find((order) => isWithinDays(order.created_at, 30)) || null,
);
const overviewHasErrors = computed(() =>
  Boolean(giftsError.value || ordersError.value || ledgerError.value),
);

const formatRelativeDay = (dateValue) => {
  const timestamp = Date.parse(dateValue || '');
  if (!Number.isFinite(timestamp)) return '最近';
  const date = new Date(timestamp);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((today - target) / 86400000);
  if (days <= 0) return '今天';
  if (days === 1) return '昨天';
  if (days < 7) return `${days} 天前`;
  return `${date.getMonth() + 1}/${date.getDate()}`;
};

const getOverviewTimestamp = (value) => {
  const timestamp = Date.parse(value || '');
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const overviewCandidates = computed(() => {
  const candidates = [];
  const gift = currentGift.value;
  const giftTime = gift?.updated_at || gift?.created_at || '';

  if (gift && addressCount.value === 0) {
    const giftAlreadyShipped = gift.gift_status === 'shipped';
    candidates.push({
      id: `gift-address-${gift.id}`,
      priority: 100,
      tone: 'red',
      icon: MapPin,
      kicker: '需要处理',
      title: '补充礼物收货地址',
      detail: giftAlreadyShipped
        ? '礼物已寄出，请尽快补充地址以便后续服务联系。'
        : '礼物寄送前需要一个有效地址，补充后才能准确安排。',
      action: 'fulfillment',
      actionLabel: '添加地址',
      activityIds: [`gift-${gift.id}`],
      time: giftTime,
      showAsUpcoming: false,
    });
  } else if (gift?.gift_status === 'shipped') {
    candidates.push({
      id: `gift-shipped-${gift.id}`,
      priority: 90,
      tone: 'orange',
      icon: PackageCheck,
      kicker: '当前最重要',
      title: '你的礼物已经寄出',
      detail: gift.gift_no ? `快递单号 ${gift.gift_no}` : '请留意快递信息或取货通知。',
      action: 'gifts',
      actionLabel: '查看礼物',
      activityIds: [`gift-${gift.id}`],
      time: giftTime,
      showAsUpcoming: false,
    });
  } else if (gift) {
    candidates.push({
      id: `gift-${gift.id}`,
      priority: 58,
      tone: 'blue',
      icon: Gift,
      kicker: '礼物动态',
      title: giftStatusHeadline.value,
      detail: giftStatusDesc.value,
      action: 'gifts',
      actionLabel: '查看详情',
      activityIds: [`gift-${gift.id}`],
      time: giftTime,
      showAsUpcoming: false,
    });
  }

  if (subscriptionExpiryDays.value !== null && subscriptionExpiryDays.value <= 30) {
    const isUrgent = subscriptionExpiryDays.value <= 7;
    candidates.push({
      id: 'subscription-expiry',
      priority: isUrgent ? 85 : 68,
      tone: isUrgent ? 'red' : 'orange',
      icon: Crown,
      kicker: isUrgent ? '即将到期' : '值得留意',
      title: `会员还有 ${subscriptionExpiryDays.value} 天到期`,
      detail: '查看当前方案和可选会员权益，提前决定是否续订。',
      action: 'subscription',
      actionLabel: '管理会员',
      activityIds: [],
      time: activeSubscription.value?.expiresAt || '',
      showAsUpcoming: true,
    });
  }

  if (recentOrder.value) {
    candidates.push({
      id: `order-${recentOrder.value.id}`,
      priority: 46,
      tone: 'blue',
      icon: Package,
      kicker: '最近订单',
      title: `已兑换 ${recentOrder.value.item_count} 件商品`,
      detail: `${formatRelativeDay(recentOrder.value.created_at)}使用 ${recentOrder.value.total_points} 积分完成兑换。`,
      action: 'orders',
      actionLabel: '查看订单',
      activityIds: [`order-${recentOrder.value.id}`],
      time: recentOrder.value.created_at,
      showAsUpcoming: false,
    });
  }

  if (redeemableProducts.value.length > 0) {
    candidates.push({
      id: 'redeemable-products',
      priority: 30,
      tone: 'green',
      icon: ShoppingBag,
      kicker: '可立即使用',
      title: `你现在可以兑换 ${redeemableProducts.value.length} 件商品`,
      detail: `从 ${redeemableProducts.value[0].title} 开始，最低需要 ${redeemableProducts.value[0].points_cost} 积分。`,
      action: 'shop',
      actionLabel: '去兑换',
      activityIds: [],
      time: '',
      showAsUpcoming: false,
    });
  }

  if (pityStatus.value?.eligible) {
    const remaining = Number(pityStatus.value.remainingLosses || 0);
    const isDue = Boolean(pityStatus.value.isDue);
    if (isDue) {
      candidates.push({
        id: 'pity-due',
        priority: 88,
        tone: 'gold',
        icon: Trophy,
        kicker: '保底就绪',
        title: '下一次保底活动可兑现',
        detail: `已连续 ${pityStatus.value.consecutiveLosses}/${pityStatus.value.threshold} 场未中奖，参与计入并兑现的活动即可获得保底礼。`,
        action: 'lottery',
        actionLabel: '去抽奖',
        activityIds: [],
        time: pityStatus.value.updatedAt || '',
        showAsUpcoming: true,
      });
    } else if (remaining > 0 && remaining <= 3) {
      candidates.push({
        id: 'pity-near',
        priority: 75,
        tone: 'blue',
        icon: Ticket,
        kicker: '保底临近',
        title: `还差 ${remaining} 场进入保底`,
        detail: `连续 ${pityStatus.value.consecutiveLosses}/${pityStatus.value.threshold} 场未中奖，当前 ${pityStatus.value.consecutiveLosses} 场。`,
        action: 'lottery',
        actionLabel: '查看抽奖',
        activityIds: [],
        time: pityStatus.value.updatedAt || '',
        showAsUpcoming: true,
      });
    }
  }

  if (!candidates.some((c) => c.action === 'lottery')) {
    candidates.push({
      id: 'lottery-general',
      priority: 35,
      tone: 'blue',
      icon: Ticket,
      kicker: '社区抽奖',
      title: '查看进行中的社区抽奖',
      detail: '参与可计入保底，免费报名，中奖可获奖品与积分回馈。',
      action: 'lottery',
      actionLabel: '去抽奖',
      activityIds: [],
      time: '',
      showAsUpcoming: true,
    });
  }

  if (recentPointsNet.value < -15) {
    candidates.push({
      id: 'points-trend-down',
      priority: 52,
      tone: 'orange',
      icon: ScrollText,
      kicker: '积分动态',
      title: `近30天净消耗 ${Math.abs(recentPointsNet.value)} 积分`,
      detail: '查看明细了解去向，抽奖参与未来可获返奖。',
      action: 'points',
      actionLabel: '查看明细',
      activityIds: [],
      time: '',
      showAsUpcoming: true,
    });
  }

  return candidates.sort(
    (a, b) =>
      b.priority - a.priority || getOverviewTimestamp(b.time) - getOverviewTimestamp(a.time),
  );
});

const primaryInsight = computed(() => {
  if (overviewLoading.value) {
    return {
      id: 'loading',
      tone: 'neutral',
      icon: LayoutDashboard,
      kicker: '正在更新',
      title: '整理你的账户动态',
      detail: '正在同步礼物、订单、积分和会员状态。',
      action: 'overview',
      actionLabel: '请稍候',
      activityIds: [],
      priority: 0,
    };
  }
  return (
    overviewCandidates.value[0] || {
      id: 'all-clear',
      tone: 'neutral',
      icon: Check,
      kicker: '账户状态',
      title: '账户一切就绪',
      detail: pointsContextText.value,
      action: 'points',
      actionLabel: '查看明细',
      activityIds: [],
      priority: 0,
    }
  );
});

const overviewTitle = computed(() => {
  if (overviewLoading.value) return '正在整理账户动态';
  if (primaryInsight.value.priority >= 80) return '优先处理这件事';
  if (primaryInsight.value.id.startsWith('gift-') || primaryInsight.value.id.startsWith('order-'))
    return '最近有新的账户动态';
  if (primaryInsight.value.id === 'redeemable-products') return '你的积分现在可以使用';
  return '账户状态良好';
});
const overviewSubtitle = computed(() => {
  if (overviewLoading.value) return '正在整理你的账户动态';
  if (overviewHasErrors.value) return '部分信息暂未更新，其余内容仍可正常查看';
  return '已按紧急程度、时效和可操作性完成排序';
});

const recentActivities = computed(() => {
  const focusActivityIds = new Set(primaryInsight.value.activityIds || []);
  const activities = [];
  if (currentGift.value) {
    activities.push({
      id: `gift-${currentGift.value.id}`,
      time: currentGift.value.updated_at || currentGift.value.created_at,
      tone: currentGift.value.gift_status === 'shipped' ? 'orange' : 'blue',
      title: getGiftStatusLabel(currentGift.value.gift_status),
      detail: currentGift.value.gift_content || '当前礼物状态已更新',
      action: 'gifts',
    });
  }
  fulfillmentRecords.value.slice(0, 3).forEach((record) =>
    activities.push({
      id: record.id,
      time: record.time,
      tone: record.type === 'gift' ? (record.status === 'shipped' ? 'orange' : 'blue') : 'blue',
      title: record.type === 'gift' ? getGiftStatusLabel(record.status) : '商城订单',
      detail:
        record.type === 'gift'
          ? record.title || '礼物状态已更新'
          : `${record.title.replace('商城订单 · ', '')} · -${record.points} 积分`,
      action: record.type === 'gift' ? 'gifts' : 'orders',
    }),
  );
  ledger.value
    .filter((item) => !String(item.key).startsWith('order-'))
    .slice(0, 3)
    .forEach((item) =>
      activities.push({
        id: item.key,
        time: item.time,
        tone: item.tone,
        title: item.title,
        detail: `${item.remark || '积分变动'}${item.amount ? ` · ${item.amount > 0 ? '+' : ''}${item.amount}` : ''}`,
        action: 'points',
      }),
    );
  const seenIds = new Set();
  return activities
    .filter((item) => !focusActivityIds.has(item.id))
    .filter((item) => Number.isFinite(Date.parse(item.time || '')))
    .sort((a, b) => Date.parse(b.time) - Date.parse(a.time))
    .filter((item) => {
      if (seenIds.has(item.id)) return false;
      seenIds.add(item.id);
      return true;
    })
    .slice(0, 3)
    .map((item) => ({ ...item, timeLabel: formatRelativeDay(item.time) }));
});

const upcomingItems = computed(() => {
  const seenActions = new Set([primaryInsight.value.action]);
  const secondaryItems = overviewCandidates.value
    .filter((item) => item.showAsUpcoming && item.id !== primaryInsight.value.id)
    .filter((item) => {
      if (seenActions.has(item.action)) return false;
      seenActions.add(item.action);
      return true;
    })
    .map((item) => ({
      id: item.id,
      tone: item.tone,
      icon: item.icon,
      title: item.title,
      detail: item.detail,
      action: item.action,
    }));
  if (!secondaryItems.length && !redeemableProducts.value.length && nextRewardProduct.value) {
    const gap = Number(nextRewardProduct.value.points_cost) - userPoints.value;
    secondaryItems.push({
      id: 'next-reward',
      tone: 'blue',
      icon: Coins,
      title: `再获得 ${gap} 积分`,
      detail: `即可兑换 ${nextRewardProduct.value.title}`,
      action: 'points',
    });
  }
  return secondaryItems.slice(0, 2);
});

const handleSmartAction = (action) => {
  if (action === 'shop') {
    goToShop();
    return;
  }
  if (action === 'lottery') {
    router.push('/lotteries').catch(() => {});
    return;
  }
  activateTab(['orders', 'gifts'].includes(action) ? 'fulfillment' : action || 'overview');
};

const retryOverviewIssues = () => {
  if (giftsError.value) giftsLoaded.value = false;
  if (ordersError.value) ordersLoaded.value = false;
  if (ledgerError.value) ledgerLoaded.value = false;
  if (ledgerError.value) void loadLedger();
  if (giftsError.value || ordersError.value) void loadOverview();
};

const getGiftStatusLabel = (s) => {
  const map = {
    preparing: '备货中',
    processing: '正在处理',
    shipped: '已发货',
    completed: '已完成',
  };
  return map[s] || s;
};

const giftStatusTitle = computed(() => {
  if (!currentGift.value) return '待命中的礼物';
  const status = currentGift.value.gift_status;
  const dateSource =
    status === 'completed'
      ? currentGift.value.completed_at ||
        currentGift.value.updated_at ||
        currentGift.value.created_at
      : currentGift.value.updated_at || currentGift.value.created_at;
  const date = formatDateShort(dateSource);
  if (status === 'preparing') return `备货中 ${date}`;
  if (status === 'processing') return `正在处理 ${date}`;
  if (status === 'shipped') return `已发货 ${date}`;
  if (status === 'completed') return `已送达 ${date}`;
  return '礼物状态';
});

const giftStatusDate = computed(() => {
  if (!currentGift.value) return '';
  const status = currentGift.value.gift_status;
  const dateSource =
    status === 'completed'
      ? currentGift.value.completed_at ||
        currentGift.value.updated_at ||
        currentGift.value.created_at
      : currentGift.value.updated_at || currentGift.value.created_at;
  return formatDateShort(dateSource);
});

const giftStatusHeadline = computed(() => {
  const map = {
    preparing: '礼物已进入备货',
    processing: '礼物正在处理中',
    shipped: '礼物已经寄出',
    completed: '礼物已送达',
  };
  return map[currentGift.value?.gift_status] || '礼物状态已更新';
});

const giftStatusDesc = computed(() => {
  if (!currentGift.value) return '方块之家正在为你构思一份特别的礼物。';
  const status = currentGift.value.gift_status;
  if (status === 'preparing') return '我们已收到你的礼物请求，正在准备精美礼品。';
  if (status === 'processing') return '礼物正在快马加鞭包装中，即将离开方块之家。';
  if (status === 'shipped') return '你的礼物已在路上，请留意快递信息或取货通知。';
  if (status === 'completed') return '礼物已成功送达，希望它能为你带来快乐。';
  return '';
});

const formatDateShort = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getMonth() + 1}月 ${date.getDate()}日`;
};

const loadGifts = async () => {
  if (giftsLoading.value || giftsLoaded.value) return;
  const uid = userInfo.value?.id;
  if (!uid) {
    giftsLoaded.value = true;
    return;
  }
  giftsLoading.value = true;
  giftsError.value = '';
  try {
    const [initialGiftsRes, addressesRes] = await Promise.all([
      supabase
        .from('user_gifts')
        .select(
          'id, user_id, gift_no, gift_content, gift_price, gift_image, gift_status, is_active, address_id, completed_at, created_at, updated_at',
        )
        .eq('user_id', uid)
        .order('created_at', { ascending: false }),
      supabase
        .from('user_addresses')
        .select('id, user_id, recipient, phone, region, detail, is_default, created_at')
        .eq('user_id', uid)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false }),
    ]);
    let giftsRes = initialGiftsRes;
    if (isMissingColumnError(giftsRes.error, 'address_id')) {
      giftsRes = await supabase
        .from('user_gifts')
        .select(
          'id, user_id, gift_no, gift_content, gift_price, gift_image, gift_status, is_active, completed_at, created_at, updated_at',
        )
        .eq('user_id', uid)
        .order('created_at', { ascending: false });
    }
    if (giftsRes.error) throw giftsRes.error;

    // 构建地址 map：优先 address_id 匹配，否则取默认地址（列表已排序，首条为默认）
    const addressList = Array.isArray(addressesRes.data) ? addressesRes.data : [];
    addressCount.value = addressList.length;
    const addressByUser = new Map();
    addressList.forEach((addr) => {
      if (!addressByUser.has(addr.user_id)) addressByUser.set(addr.user_id, []);
      addressByUser.get(addr.user_id).push(addr);
    });

    const resolveAddress = (gift) => {
      const userAddrs = addressByUser.get(gift.user_id) || [];
      if (userAddrs.length === 0) return null;
      // 若礼物绑定了 address_id（字段已部署），优先用绑定的地址；否则取默认地址
      const matched = gift.address_id
        ? userAddrs.find((a) => a.id === gift.address_id) || userAddrs[0]
        : userAddrs[0];
      return matched || null;
    };

    let normalizedGifts = (Array.isArray(giftsRes.data) ? giftsRes.data : []).map((g) => {
      const addr = resolveAddress(g);
      const region = addr?.region ? addr.region + ' ' : '';
      return {
        ...g,
        shipping_recipient: addr?.recipient || '',
        shipping_phone: addr?.phone || '',
        shipping_address: (region + (addr?.detail || '')).trim(),
        address_count: (addressByUser.get(g.user_id) || []).length,
      };
    });

    const expiredGiftIds = getExpiredActiveGiftIds(normalizedGifts);
    if (expiredGiftIds.length > 0) {
      normalizedGifts = markGiftsAsHistory(normalizedGifts, expiredGiftIds);
    }
    // 当前礼物：激活中且未完成
    const active = normalizedGifts.find((g) => g.is_active && g.gift_status !== 'completed');
    currentGift.value = active || null;
    // 历史礼物：已完成或非激活
    const currentId = currentGift.value?.id;
    historyGifts.value = normalizedGifts.filter(
      (g) => g.id !== currentId && (!g.is_active || g.gift_status === 'completed'),
    );
    giftsLoaded.value = true;
  } catch (err) {
    logger.warn('assets-hub', '加载礼物数据失败:', err);
    currentGift.value = null;
    historyGifts.value = [];
    addressCount.value = 0;
    giftsError.value = '加载失败';
  } finally {
    giftsLoading.value = false;
  }
};

const refreshGifts = () => {
  giftsLoaded.value = false;
  void loadGifts();
};

const refreshFulfillment = () => {
  ordersLoaded.value = false;
  giftsLoaded.value = false;
  void loadOrders();
  void loadGifts();
};

const loadOverview = async () => {
  if (overviewLoading.value) return;
  overviewLoading.value = true;
  try {
    await Promise.all([
      loadSubscription(),
      loadOrders(),
      loadGifts(),
      productsStore.fetchProducts(),
    ]);
  } finally {
    overviewLoading.value = false;
  }
};

onMounted(() => {
  void loadTier();
  activateTab(activeTab.value);
});
</script>

<style scoped>
@import './AssetsHubPanel.css';
</style>
