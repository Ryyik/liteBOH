<template>
  <div class="profile-subpage-shell">
    <UserCenterPageHeader :title="beta5 ? '方块积分' : '积分与礼物'" back-label="返回我的" max-width="1200px" @back="$emit('back')" />

    <div class="profile-subpage-body">
      <nav class="ah-hub-card">
        <div class="ah-top-row">
          <div class="ah-user-left">
            <div v-if="avatarUrl" class="ah-avatar has-avatar">
              <img :src="avatarUrl" alt="头像" class="ah-avatar-img" loading="lazy">
            </div>
            <div v-else class="ah-avatar">{{ displayInitial }}</div>
            <div class="ah-user-info">
              <div class="ah-name-row">
                <span class="ah-username">{{ displayName }}</span>
                <span v-if="tierCode" class="tier-badge" :class="`tier-${tierCode}`">{{ tierDisplayName }}</span>
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

        <div class="ah-tab-groups" ref="hubGroupsRef">
          <div v-for="group in tabGroups" :key="group.label" class="ah-tab-group" role="tablist" :aria-label="group.label">
            <span class="ah-tab-group-label">{{ group.label }}</span>
            <div class="ah-hub-tabs">
              <button
                v-for="tab in group.tabs"
                :key="tab.id"
                type="button"
                role="tab"
                :aria-selected="activeTab === tab.id"
                class="ah-tab"
                :class="{ active: activeTab === tab.id }"
                @click="activateTab(tab.id)"
              >
                <component :is="tab.icon" class="ah-tab-icon" :size="17" :stroke-width="1.9" aria-hidden="true" />
                <span class="ah-tab-label">{{ tab.label }}</span>
              </button>
            </div>
          </div>
        </div>
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
          <button v-else-if="overviewHasErrors" type="button" class="ah-overview-retry" @click="retryOverviewIssues">
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
          <div v-if="beta5" class="ah-skeleton ah-skeleton-points-card is-centered"></div>
          <div v-else class="ah-overview-insights">
            <div class="ah-skeleton ah-skeleton-card-sm"></div>
            <div class="ah-skeleton ah-skeleton-card-sm"></div>
          </div>
          <div class="ah-skeleton ah-skeleton-timeline"></div>
        </div>
        <template v-else>
        <button
          type="button"
          class="ah-smart-focus"
          :class="`tone-${primaryInsight.tone}`"
          @click="handleSmartAction(primaryInsight.action)"
        >
          <span class="ah-smart-focus-icon"><component :is="primaryInsight.icon" :size="22" :stroke-width="1.8" aria-hidden="true" /></span>
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

        <div v-if="beta5" class="ah-overview-points-wrap">
          <PointsCard
            class="ah-overview-points-card"
            :points="userPoints"
            :username="displayName"
            :tier-label="tierDisplayName || 'BOH'"
            :skin="userInfo?.pointsCardSkin"
            :image-url="userInfo?.pointsCardImageUrl"
            interactive
            :show-sponsor-action="false"
            @click="activateTab('cards')"
          />
        </div>

        <div v-if="!beta5" class="ah-overview-insights">
            <article class="ah-overview-primary">
              <div class="ah-overview-card-icon is-blue"><Coins :size="19" :stroke-width="1.8" aria-hidden="true" /></div>
              <div class="ah-overview-copy">
                <span class="ah-overview-kicker">可用积分</span>
                <strong>{{ pointsDisplay }}</strong>
                <span>{{ pointsContextText }}</span>
              </div>
              <button type="button" class="ah-overview-link" @click="activateTab('points')">
                明细
                <ChevronRight :size="16" :stroke-width="2" aria-hidden="true" />
              </button>
            </article>

            <article class="ah-overview-membership" :class="{ 'is-expiring': subscriptionExpiryDays !== null && subscriptionExpiryDays <= 30 }">
              <div class="ah-overview-card-icon is-gold"><Crown :size="19" :stroke-width="1.8" aria-hidden="true" /></div>
              <div>
                <span>{{ subscriptionLoading ? '正在读取会员状态' : '当前会员' }}</span>
                <strong>{{ subscriptionDisplayName }}</strong>
                <p>{{ membershipContextText }}</p>
              </div>
              <button type="button" class="ah-icon-command" title="管理会员" aria-label="管理会员" @click="activateTab('subscription')">
                <ChevronRight :size="18" :stroke-width="2" aria-hidden="true" />
              </button>
            </article>
          </div>

        <div class="ah-smart-columns ah-single-timeline">
          <section class="ah-smart-section" aria-label="最近动态">
            <div class="ah-smart-section-head">
              <div>
                <span>最近动态</span>
                <strong>刚刚发生</strong>
              </div>
              <button type="button" aria-label="查看积分明细" title="查看积分明细" @click="activateTab('points')">
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
                <span class="ah-smart-next-icon"><component :is="item.icon" :size="18" :stroke-width="1.8" aria-hidden="true" /></span>
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

      <section v-else-if="activeTab === 'cards' && beta5" key="cards" class="ah-section ah-cards-section">
        <div class="ah-cards-heading">
          <div><span>积分卡</span><h2>展示你的方块积分</h2><p>选择空白卡、全员小猫主题，或上传自己的卡面。</p></div>
        </div>
        <PointsCard :points="userPoints" :username="displayName" :tier-label="tierDisplayName || 'BOH'"
          :skin="userInfo?.pointsCardSkin" :image-url="userInfo?.pointsCardImageUrl" show-sponsor-action
          @sponsor="$emit('sponsor')" />
        <div class="ah-skin-grid" aria-label="积分卡皮肤">
          <button type="button" class="ah-skin-option" :class="{ active: userInfo?.pointsCardSkin === 'blank' }" @click="$emit('set-points-card-skin', 'blank')">
            <span class="ah-skin-preview is-blank"><Coins :size="18" :stroke-width="1.8" /></span><strong>空白卡</strong><small>默认样式</small>
          </button>
          <button type="button" class="ah-skin-option is-cats-skin" :class="{ active: pointsCardCatsUnlocked && userInfo?.pointsCardSkin === 'cats' }" :disabled="isRedeemingPointsCardCats" @click="handleCatsSkinClick">
            <span class="ah-skin-preview is-cats"><img v-for="cat in catSkinPreviewAssets" :key="cat.id" :src="cat.src" alt=""></span><strong>全员小猫</strong><small>{{ isRedeemingPointsCardCats ? '兑换中' : (pointsCardCatsUnlocked ? '已兑换' : '3 积分兑换') }}</small>
          </button>
          <button type="button" class="ah-skin-option" :disabled="isPointsCardPresetQuotaLoading || !canAddPointsCardPreset" @click="$emit('upload-points-card')">
            <span class="ah-skin-preview is-custom"><ImagePlus :size="18" :stroke-width="1.8" /></span><strong>添加卡面</strong><small>上传并裁切</small>
          </button>
        </div>

        <section class="ah-card-presets" aria-label="自定义卡面预设">
          <div class="ah-card-presets-heading">
            <span>自定义预设</span>
            <small v-if="!isPointsCardPresetsLoading">{{ pointsCardPresets.length }} / {{ pointsCardPresetCapacity }} 张</small>
          </div>
          <div v-if="isPointsCardPresetsLoading" class="ah-card-preset-grid" aria-hidden="true">
            <div v-for="n in 3" :key="n" class="ah-skeleton ah-skeleton-preset"></div>
          </div>
          <div v-else-if="pointsCardPresets.length" class="ah-card-preset-grid">
            <article
              v-for="preset in pointsCardPresets"
              :key="preset.id"
              class="ah-card-preset"
              :class="{ active: userInfo?.pointsCardSkin === 'custom' && userInfo?.pointsCardImageUrl === preset.imageUrl }"
            >
              <button
                type="button"
                class="ah-card-preset-select"
                :aria-label="'使用自定义卡面预设'"
                @click="$emit('select-points-card-preset', preset.id)"
              >
                <img :src="preset.imageUrl" alt="自定义卡面预设" loading="lazy">
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
          <p v-if="!isPointsCardPresetsLoading" class="ah-card-presets-retention">未启用的卡面超过 90 天会自动清理</p>
        </section>
      </section>

      <section v-else-if="activeTab === 'points'" key="points" class="ah-section">
        <div v-if="ledgerLoading" class="ah-order-skeleton">
          <div v-for="n in 4" :key="n" class="ah-skeleton-block" />
        </div>
        <div v-else-if="ledgerError" class="ah-empty-state">
          <div class="ah-empty-icon"><ScrollText :size="26" :stroke-width="1.5" /></div>
          <h3>积分明细暂时无法加载</h3>
          <button type="button" class="ah-shop-btn ah-shop-btn-ghost" @click="loadLedger">重试</button>
        </div>
        <div v-else-if="ledger.length === 0" class="ah-empty-state">
          <div class="ah-empty-icon">
            <ScrollText :size="26" :stroke-width="1.5" />
          </div>
          <h3>暂无积分明细</h3>
          <p>周签到、管理员发放与商城订单都会记录在这里</p>
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
                  <span class="ah-ledger-title">{{ item.title }}</span>
                  <span v-if="item.remark" class="ah-ledger-remark">{{ item.remark }}</span>
                </div>
                <div class="ah-ledger-right">
                  <span class="ah-ledger-amount" :class="{ negative: item.amount < 0, zero: item.amount === 0 }">
                    {{ item.amount >= 0 ? '+' : '' }}{{ item.amount }}
                  </span>
                  <span class="ah-ledger-date">{{ formatDate(item.time) }}</span>
                </div>
              </article>
            </div>
          </section>
        </div>
      </section>

      <section v-else-if="activeTab === 'subscription'" key="subscription" class="ah-section">
        <div v-if="subscriptionLoading" class="ah-order-skeleton"><div class="ah-skeleton-block" /></div>
        <template v-else>
          <article class="ah-membership-card" :class="{ 'is-free': !activeSubscription }">
            <div class="ah-membership-card-top">
              <span>当前会员</span>
              <span class="ah-membership-status">{{ activeSubscription ? '生效中' : '免费版' }}</span>
            </div>
            <h2>{{ subscriptionDisplayName }}</h2>
            <p>{{ subscriptionExpiryText }}</p>
            <div class="ah-membership-meta">
              <span>Cloud+ {{ cloudImageLimit }} 张</span>
              <span>{{ activeSubscription?.billingCycle === 'yearly' ? '年度订阅' : activeSubscription ? '月度订阅' : '基础额度' }}</span>
              <span v-if="annualGiftLabel">{{ annualGiftLabel }}</span>
            </div>
            <section class="ah-pity-progress" :class="{ 'is-due': pityStatus?.isDue, 'is-unavailable': !pityStatus?.eligible }" aria-label="抽奖保底进度">
              <div class="ah-pity-progress-head"><span>抽奖保底进度</span><strong>{{ pityProgressLabel }}</strong></div>
              <div v-if="pityStatus?.eligible" class="ah-pity-progress-track" role="progressbar" aria-label="连续未中奖进度" :aria-valuenow="pityStatus.consecutiveLosses" :aria-valuemin="0" :aria-valuemax="pityStatus.threshold">
                <div class="ah-pity-progress-fill" :style="{ width: `${pityProgressPercent}%` }"></div>
              </div>
              <p>{{ pityProgressDescription }}</p>
            </section>
            <button type="button" class="ah-shop-btn" @click="showPlanComparison = !showPlanComparison">
              {{ showPlanComparison ? '收起方案' : activeSubscription ? '更改方案' : '选择会员方案' }}
              <ChevronRight :size="16" :stroke-width="2" aria-hidden="true" />
            </button>
          </article>
          <SubscriptionPlans v-if="showPlanComparison" />
        </template>
      </section>

      <section v-else-if="activeTab === 'fulfillment' && beta5" key="fulfillment" class="ah-section ah-fulfillment-section">
        <header class="ah-fulfillment-heading">
          <div><span>服务</span><h2>礼物与订单</h2><p>正在处理的礼物和全部兑换记录都在这里。</p></div>
          <button type="button" class="ah-icon-command" title="刷新礼物与订单" aria-label="刷新礼物与订单" @click="refreshFulfillment">
            <RefreshCw :size="17" :stroke-width="2" aria-hidden="true" />
          </button>
        </header>

        <article v-if="currentGift" class="ah-gift-card ah-current-gift-card">
          <header class="ah-gift-header"><span class="ah-gift-eyebrow"><Gift :size="14" :stroke-width="2" aria-hidden="true" />进行中的礼物</span><span class="ah-gift-header-date">更新于 {{ giftStatusDate }}</span></header>
          <div class="ah-gift-overview">
            <div class="ah-gift-thumb" :class="{ 'has-image': currentGift.gift_image }"><img v-if="currentGift.gift_image" :src="currentGift.gift_image" :alt="currentGift.gift_content" loading="lazy" /><Gift v-else :size="30" :stroke-width="1.6" aria-hidden="true" /></div>
            <div class="ah-gift-headinfo"><div class="ah-gift-headtop"><h3>{{ currentGift.gift_content || '待命中的礼物' }}</h3><span class="ah-gift-badge" :class="currentGift.gift_status">{{ getGiftStatusLabel(currentGift.gift_status) }}</span></div><div class="ah-gift-headsub"><span v-if="currentGift.gift_price" class="ah-gift-amount">RMB {{ currentGift.gift_price }}</span><span v-if="currentGift.gift_no" class="ah-gift-history-no">{{ currentGift.gift_no }}</span></div></div>
          </div>
          <div class="ah-gift-status-panel" :class="currentGift.gift_status"><div class="ah-gift-status-icon"><PackageCheck :size="19" :stroke-width="1.8" aria-hidden="true" /></div><div class="ah-gift-status-copy"><strong>{{ giftStatusHeadline }}</strong><p>{{ giftStatusDesc }}</p></div></div>
        </article>

        <section class="ah-fulfillment-records" aria-label="礼物与订单记录">
          <header class="ah-fulfillment-records-head">
            <div><span>记录</span><h3>礼物与订单记录</h3></div>
            <div class="ah-record-filter" role="tablist" aria-label="记录筛选">
              <button v-for="filter in fulfillmentFilters" :key="filter.id" type="button" role="tab" :aria-selected="recordFilter === filter.id" :class="{ active: recordFilter === filter.id }" @click="recordFilter = filter.id">{{ filter.label }}</button>
            </div>
          </header>
          <div v-if="giftsLoading && ordersLoading" class="ah-order-skeleton"><div v-for="n in 3" :key="n" class="ah-skeleton-block" /></div>
          <div v-else-if="visibleFulfillmentRecords.length" class="ah-fulfillment-record-list">
            <article v-for="record in visibleFulfillmentRecords" :key="record.id" class="ah-fulfillment-record">
              <span class="ah-fulfillment-record-icon" :class="record.type"><Gift v-if="record.type === 'gift'" :size="17" :stroke-width="1.8" aria-hidden="true" /><Package v-else :size="17" :stroke-width="1.8" aria-hidden="true" /></span>
              <div class="ah-fulfillment-record-copy"><strong>{{ record.title }}</strong><span>{{ record.detail }}</span></div>
              <div class="ah-fulfillment-record-side"><span>{{ formatDateShort(record.time) }}</span><span v-if="record.type === 'gift'" class="ah-gift-badge is-flat" :class="record.status">{{ getGiftStatusLabel(record.status) }}</span><span v-else class="ah-fulfillment-record-points">-{{ record.points }} 积分</span></div>
            </article>
          </div>
          <div v-else class="ah-empty-state"><div class="ah-empty-icon"><Package :size="26" :stroke-width="1.5" /></div><h3>{{ recordFilter === 'gifts' ? '还没有历史礼物' : recordFilter === 'orders' ? '还没有商城订单' : '还没有礼物或订单记录' }}</h3><p v-if="recordFilter !== 'gifts'">商城兑换与已归档礼物会出现在这里。</p></div>
          <p v-if="giftsError || ordersError" class="ah-fulfillment-partial-error">部分记录暂时无法更新，刷新后重试。</p>
        </section>
      </section>

      <!-- 订单 Tab -->
      <section v-else-if="activeTab === 'orders'" key="orders" class="ah-section">
        <div v-if="ordersLoading" class="ah-order-skeleton">
          <div v-for="n in 3" :key="n" class="ah-skeleton-block" />
        </div>
        <div v-else-if="ordersError" class="ah-empty-state">
          <div class="ah-empty-icon"><Package :size="26" :stroke-width="1.5" /></div>
          <h3>订单暂时无法加载</h3>
          <button type="button" class="ah-shop-btn ah-shop-btn-ghost" @click="loadOrders">重试</button>
        </div>
        <div v-else-if="orders.length === 0" class="ah-empty-state">
          <div class="ah-empty-icon">
            <Package :size="26" :stroke-width="1.5" />
          </div>
          <h3>暂无订单</h3>
          <p>商城下单后，订单会出现在这里</p>
          <button class="ah-shop-btn ah-shop-btn-ghost" @click="goToShop">去商城逛逛</button>
        </div>
        <div v-else class="ah-order-list">
          <article v-for="order in orders" :key="order.id" class="ah-order-item">
            <div class="ah-order-top">
              <span class="ah-order-no">{{ order.order_no }}</span>
              <span class="ah-order-date">{{ formatDate(order.created_at) }}</span>
            </div>
            <div class="ah-order-bottom">
              <span class="ah-order-items">{{ order.item_count }} 件商品</span>
              <span class="ah-order-points">-{{ order.total_points }} 积分</span>
            </div>
          </article>
        </div>
      </section>

      <!-- 礼物 Tab：当前礼物 + 历史礼物列表 -->
      <section v-else-if="activeTab === 'gifts'" key="gifts" class="ah-section">
        <div v-if="giftsLoading" class="ah-order-skeleton">
          <div v-for="n in 3" :key="n" class="ah-skeleton-block" />
        </div>
        <div v-else-if="giftsError" class="ah-empty-state">
          <div class="ah-empty-icon"><Gift :size="26" :stroke-width="1.5" /></div>
          <h3>礼物信息暂时无法加载</h3>
          <button type="button" class="ah-shop-btn ah-shop-btn-ghost" @click="loadGifts">重试</button>
        </div>
        <template v-else>
          <!-- 当前礼物卡片 -->
          <div v-if="!currentGift" class="ah-empty-state">
            <div class="ah-empty-icon">
              <Gift :size="26" :stroke-width="1.5" />
            </div>
            <h3>还没有待收到的礼物</h3>
            <p>积极参与社区活动来赢取吧，收到礼物后这里会及时更新状态。</p>
          </div>
          <article v-else class="ah-gift-card">
            <header class="ah-gift-header">
              <span class="ah-gift-eyebrow">
                <PackageCheck :size="14" :stroke-width="2" aria-hidden="true" />
                当前礼物
              </span>
              <span class="ah-gift-header-date">更新于 {{ giftStatusDate }}</span>
            </header>

            <div class="ah-gift-overview">
              <div class="ah-gift-thumb" :class="{ 'has-image': currentGift.gift_image }">
                <img v-if="currentGift.gift_image" :src="currentGift.gift_image" :alt="currentGift.gift_content" loading="lazy" />
                <Gift v-else :size="30" :stroke-width="1.6" aria-hidden="true" />
              </div>
              <div class="ah-gift-headinfo">
                <h3>{{ currentGift.gift_content || '待命中的礼物' }}</h3>
                <div class="ah-gift-headsub">
                  <span v-if="currentGift.gift_price" class="ah-gift-amount">RMB {{ currentGift.gift_price }}</span>
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

            <div v-if="currentGift.gift_no || currentGift.shipping_recipient || currentGift.shipping_address" class="ah-gift-details">
              <div v-if="currentGift.gift_no" class="ah-gift-detail-row">
                <div class="ah-gift-detail-icon"><PackageCheck :size="18" :stroke-width="1.8" aria-hidden="true" /></div>
                <div class="ah-gift-detail-copy">
                  <span>快递单号</span>
                  <strong>{{ currentGift.gift_no }}</strong>
                </div>
                <button
                  type="button"
                  class="ah-gift-copy"
                  :class="{ copied: expressCopied }"
                  :aria-label="expressCopied ? '已复制快递单号' : '复制快递单号'"
                  :title="expressCopied ? '已复制' : '复制快递单号'"
                  @click="copyExpressNo(currentGift.gift_no)"
                >
                  <Transition name="ah-icon-swap" mode="out-in">
                    <Check v-if="expressCopied" key="copied" :size="17" :stroke-width="2.4" aria-hidden="true" />
                    <Copy v-else key="copy" :size="17" :stroke-width="2" aria-hidden="true" />
                  </Transition>
                </button>
              </div>
              <div v-if="currentGift.shipping_recipient || currentGift.shipping_address" class="ah-gift-detail-row">
                <div class="ah-gift-detail-icon"><MapPin :size="18" :stroke-width="1.8" aria-hidden="true" /></div>
                <div class="ah-gift-detail-copy">
                  <span>收货信息</span>
                  <strong>{{ currentGift.shipping_recipient || '收件人' }}<em v-if="currentGift.shipping_phone">{{ currentGift.shipping_phone }}</em></strong>
                  <p>{{ currentGift.shipping_address || '暂无收货地址' }}</p>
                </div>
              </div>
            </div>
          </article>

          <!-- 历史礼物列表 -->
          <div v-if="historyGifts.length" class="ah-gift-history">
            <div class="ah-gift-history-head">
              <span>历史礼物</span>
              <span class="ah-gift-history-count">{{ historyGifts.length }} 份</span>
            </div>
            <div class="ah-gift-history-list">
              <article v-for="gift in historyGifts" :key="gift.id" class="ah-gift-history-item">
                <div class="ah-gift-history-thumb" :class="{ 'has-image': gift.gift_image }">
                  <img v-if="gift.gift_image" :src="gift.gift_image" :alt="gift.gift_content" loading="lazy" />
                  <Gift v-else :size="18" :stroke-width="1.8" aria-hidden="true" />
                </div>
                <div class="ah-gift-history-main">
                  <strong>{{ gift.gift_content || '未命名礼物' }}</strong>
                  <span class="ah-gift-history-meta-line">
                    <span v-if="gift.gift_no" class="ah-gift-history-no">{{ gift.gift_no }}</span>
                    <span class="ah-gift-history-date">{{ formatDateShort(gift.created_at) }}</span>
                  </span>
                </div>
                <div class="ah-gift-history-side">
                  <span v-if="gift.gift_price" class="ah-gift-history-price">RMB {{ gift.gift_price }}</span>
                  <span class="ah-gift-badge is-flat" :class="gift.gift_status">{{ getGiftStatusLabel(gift.gift_status) }}</span>
                </div>
              </article>
            </div>
          </div>
        </template>
      </section>

      <!-- 收货地址 Tab -->
      <section v-else-if="activeTab === 'addresses'" key="addresses" class="ah-section">
        <AddressManager variant="glass" :show-header="false" />
      </section>

      <section v-else-if="activeTab === 'lottery'" key="lottery" class="ah-section ah-lottery-section">
        <div class="ah-lottery-hero">
          <div class="ah-lottery-hero-icon"><Ticket :size="22" :stroke-width="1.8" aria-hidden="true" /></div>
          <div>
            <span>社区抽奖</span>
            <h2>参与抽奖，赢取方块好礼</h2>
            <p>免费报名，中奖可获奖品与积分回馈。订阅会员可累计保底进度。</p>
          </div>
          <button type="button" class="ah-lottery-hero-action" @click="router.push('/lotteries').catch(()=>{})">查看全部</button>
        </div>
        <div v-if="pityStatus" class="ah-lottery-pity-inline" :class="{ 'is-due': pityStatus.isDue, 'is-unavailable': !pityStatus.eligible }">
          <div class="ah-lottery-pity-head"><span>保底进度</span><strong>{{ pityProgressLabel }}</strong></div>
          <div v-if="pityStatus.eligible" class="ah-lottery-pity-track"><div class="ah-lottery-pity-fill" :style="{ width: `${pityProgressPercent}%` }"></div></div>
          <p>{{ pityProgressDescription }}</p>
        </div>
        <div v-if="lotteryLoading" class="ah-lottery-skeleton">
          <div v-for="n in 3" :key="n" class="ah-skeleton ah-skeleton-lottery"></div>
        </div>
        <div v-else-if="lotteryError" class="ah-empty-state">
          <div class="ah-empty-icon"><Ticket :size="26" :stroke-width="1.5" /></div>
          <h3>抽奖加载失败</h3>
          <p>{{ lotteryError }}</p>
          <button type="button" class="ah-shop-btn ah-shop-btn-ghost" @click="loadLotteries(true)">重试</button>
        </div>
        <div v-else-if="!lotteries.length" class="ah-empty-state">
          <div class="ah-empty-icon"><Ticket :size="26" :stroke-width="1.5" /></div>
          <h3>暂无进行中的抽奖</h3>
          <p>社区抽奖会不定期开启，请稍后再来或查看历史</p>
          <button type="button" class="ah-shop-btn ah-shop-btn-ghost" @click="router.push('/lotteries').catch(()=>{})">去抽奖页看看</button>
        </div>
        <div v-else class="ah-lottery-grid">
          <article v-for="item in lotteries" :key="item.id" class="ah-lottery-card" :class="`status-${item.status}`">
            <div v-if="item.cover_image_url" class="ah-lottery-cover"><img :src="item.cover_image_url" :alt="item.title" loading="lazy" /></div>
            <div v-else class="ah-lottery-cover is-empty"><Ticket :size="28" :stroke-width="1.6" /></div>
            <div class="ah-lottery-body">
              <div class="ah-lottery-top"><span class="ah-lottery-status" :class="item.status">{{ getLotteryStatusLabel(item.status) }}</span><span v-if="item.current_user_entry_id" class="ah-lottery-joined">已报名</span><span v-if="item.pity_mode==='eligible'" class="ah-lottery-pity-badge">保底</span></div>
              <h3 :title="item.title">{{ item.title || '未命名抽奖' }}</h3>
              <p class="ah-lottery-prize" :title="item.prize_title">奖品：{{ item.prize_title || '—' }}</p>
              <div class="ah-lottery-meta"><span>{{ item.entry_count || 0 }}人已报名</span><span>开奖 {{ formatLotteryDrawAt(item.draw_at) }}</span></div>
              <div class="ah-lottery-actions">
                <button v-if="item.status==='open' && !item.current_user_entry_id" type="button" class="ah-shop-btn ah-lottery-join" :disabled="joiningLotteryId===item.id" @click="handleJoinLottery(item)">{{ joiningLotteryId===item.id ? '报名中' : '立即报名' }}</button>
                <button v-else-if="item.current_user_entry_id" type="button" class="ah-shop-btn ah-lottery-joined-btn" disabled>已报名 #{{ item.current_user_entry_number || '-' }}</button>
                <button v-else type="button" class="ah-shop-btn ah-shop-btn-ghost" @click="router.push('/lotteries').catch(()=>{})">查看详情</button>
                <button type="button" class="ah-lottery-link" @click="router.push(`/lotteries?lottery=${encodeURIComponent(item.id)}`).catch(()=>{})">详情</button>
              </div>
            </div>
          </article>
        </div>
        <div class="ah-lottery-foot">
          <p>抽奖免费参与，保底仅对会员计入。祝你好运。</p>
          <button type="button" class="ah-shop-btn ah-shop-btn-ghost" @click="router.push('/lotteries').catch(()=>{})">前往抽奖页</button>
        </div>
      </section>

      <section v-else-if="activeTab === 'sponsor'" key="sponsor" class="ah-section ah-sponsor-section">
        <div class="ah-sponsor-hero">
          <div class="ah-sponsor-hero-icon"><Heart :size="22" :stroke-width="1.8" aria-hidden="true" /></div>
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
          <button type="button" class="ah-shop-btn ah-shop-btn-ghost" @click="activateTab('overview')">返回概览</button>
        </div>
      </section>
      </Transition>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import {
  CalendarCheck, Check, ChevronRight, Coins, Copy, Crown, Gift, Heart, ImagePlus, LayoutDashboard, MapPin, Package, PackageCheck, RefreshCw, ScrollText, Send, ShoppingBag, Ticket, Trash2, Trophy
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
import PointsCard from './PointsCard.vue';
import { HOME_CAT_ASSETS } from '@/utils/home-cat-theme.js';

const emit = defineEmits(['back', 'upload-points-card', 'set-points-card-skin', 'select-points-card-preset', 'delete-points-card-preset', 'redeem-points-card-cats', 'sponsor', 'load-points-card-data']);

const props = defineProps({
  initialTab: { type: String, default: '' },
  beta5: { type: Boolean, default: false },
  pointsCardPresets: { type: Array, default: () => [] },
  isPointsCardPresetsLoading: { type: Boolean, default: false },
  pointsCardPresetCapacity: { type: Number, default: 3 },
  isPointsCardPresetQuotaLoading: { type: Boolean, default: false },
  pointsCardCatsUnlocked: { type: Boolean, default: false },
  isRedeemingPointsCardCats: { type: Boolean, default: false }
});

const router = useRouter();
const authStore = useAuthStore();
const { userInfo } = storeToRefs(authStore);
const productsStore = useProductsStore();
const { productsData } = storeToRefs(productsStore);

const { fetchUserTier, getUserTierCode } = useUserTier();
const tierCode = ref('');
const tierDisplayName = computed(() => PLAN_DISPLAY_NAMES[tierCode.value] || '');
const canAddPointsCardPreset = computed(() => Number(props.pointsCardPresets.length) < Math.max(3, Number(props.pointsCardPresetCapacity) || 3));
const catSkinPreviewAssets = Object.entries(HOME_CAT_ASSETS).map(([id, src]) => ({ id, src }));
const handleCatsSkinClick = () => {
  if (props.isRedeemingPointsCardCats) return;
  if (props.pointsCardCatsUnlocked) {
    emit('set-points-card-skin', 'cats');
    return;
  }
  emit('redeem-points-card-cats');
};

const betaTabIds = new Set(['overview', 'cards', 'points', 'subscription', 'fulfillment', 'addresses', 'lottery', 'sponsor']);
const stableTabIds = new Set(['overview', 'points', 'subscription', 'orders', 'gifts', 'addresses', 'lottery', 'sponsor']);
const normalizeInitialTab = () => {
  let tab = String(props.initialTab || '');
  if (props.beta5 && ['orders', 'gifts'].includes(tab)) tab = 'fulfillment';
  return (props.beta5 ? betaTabIds : stableTabIds).has(tab) ? tab : 'overview';
};
const activeTab = ref(normalizeInitialTab());
const tabGroups = computed(() => props.beta5 ? [
  { label: '账户', tabs: [
    { id: 'overview', label: '概览', icon: LayoutDashboard },
    { id: 'cards', label: '卡面', icon: ImagePlus },
    { id: 'points', label: '积分', icon: ScrollText },
    { id: 'subscription', label: '订阅', icon: Crown }
  ] },
  { label: '服务', tabs: [
    { id: 'fulfillment', label: '礼物与订单', icon: Package },
    { id: 'addresses', label: '地址', icon: MapPin },
    { id: 'lottery', label: '抽奖', icon: Ticket },
    { id: 'sponsor', label: '赞助', icon: Heart }
  ] }
] : [
  { label: '账户', tabs: [
    { id: 'overview', label: '概览', icon: LayoutDashboard },
    { id: 'points', label: '积分', icon: ScrollText },
    { id: 'subscription', label: '会员', icon: Crown }
  ] },
  { label: '服务', tabs: [
    { id: 'orders', label: '订单', icon: Package },
    { id: 'gifts', label: '礼物', icon: Gift },
    { id: 'addresses', label: '地址', icon: MapPin },
    { id: 'lottery', label: '抽奖', icon: Ticket },
    { id: 'sponsor', label: '赞助', icon: Heart }
  ] }
]);

const avatarUrl = computed(() => String(userInfo.value?.avatarUrl || '').trim());
const displayName = computed(() => String(userInfo.value?.username || '').trim() || '未命名用户');
const displayInitial = computed(() => displayName.value.charAt(0).toUpperCase());
const uidShort = computed(() => String(userInfo.value?.id || '').slice(0, 8));

const ordersLoading = ref(false);
const ordersLoaded = ref(false);
const ordersError = ref('');
const orders = ref([]);
const ledgerLoading = ref(false);
const ledgerLoaded = ref(false);
const ledgerError = ref('');
const ledger = ref([]);
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
const cloudImageLimit = computed(() => ({ free: 150, plus: 300, pro: 450, max: 900, ultra: 1200 }[tierCode.value] || 150));
const subscriptionDisplayName = computed(() => {
  const subscription = activeSubscription.value;
  return subscription?.planName || PLAN_DISPLAY_NAMES[subscription?.planCode] || tierDisplayName.value || 'Free';
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
  if (subscriptionExpiryDays.value <= 30) return `还有 ${subscriptionExpiryDays.value} 天到期，请及时续订`;
  return `有效期至 ${expiresAt.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}`;
});
const annualGiftLabel = computed(() => String(annualGiftSubscription.value?.metadata?.yearly_gift?.label || '').trim());
const pityProgressPercent = computed(() => {
  if (!pityStatus.value?.eligible || pityStatus.value.threshold <= 0) return 0;
  return Math.min(100, Math.round((pityStatus.value.consecutiveLosses / pityStatus.value.threshold) * 100));
});
const pityProgressLabel = computed(() => {
  if (!pityStatus.value?.eligible) return '订阅 Plus 后开启';
  if (pityStatus.value.isDue) return '下一次保底活动可兑现';
  return `${pityStatus.value.consecutiveLosses} / ${pityStatus.value.threshold} 场`;
});
const pityProgressDescription = computed(() => {
  if (!pityStatus.value?.eligible) return 'Free 账户可参与抽奖，但不累计会员保底进度。';
  if (pityStatus.value.isDue) return '已达到保底条件；下一次参与“计入失败，并兑现保底礼”的活动即可获得保底礼。';
  return `连续参与计入活动但未获奖 ${pityStatus.value.consecutiveLosses} 场，还差 ${pityStatus.value.remainingLosses} 场进入保底。`;
});

const availableProducts = computed(() => Array.isArray(productsData.value) ? productsData.value : []);
const redeemableProducts = computed(() => availableProducts.value
  .filter((product) => product.is_active !== false
    && product.is_purchasable !== false
    && product.payment_mode !== 'rmb_only'
    && Number(product.points_cost) > 0
    && Number(product.stock) !== 0
    && Number(product.points_cost) <= userPoints.value)
  .sort((a, b) => Number(a.points_cost) - Number(b.points_cost)));

const nextRewardProduct = computed(() => availableProducts.value
  .filter((product) => product.is_active !== false
    && product.is_purchasable !== false
    && product.payment_mode !== 'rmb_only'
    && Number(product.points_cost) > userPoints.value
    && Number(product.stock) !== 0)
  .sort((a, b) => Number(a.points_cost) - Number(b.points_cost))[0] || null);

const recentPointsNet = computed(() => ledger.value
  .filter((item) => isWithinDays(item.time, 30))
  .reduce((sum, item) => sum + (Number(item.amount) || 0), 0));

const pointsContextText = computed(() => {
  if (recentPointsNet.value !== 0) return `近 30 天净变化 ${recentPointsNet.value > 0 ? '+' : ''}${recentPointsNet.value}`;
  if (redeemableProducts.value.length > 0) return `当前可兑换 ${redeemableProducts.value.length} 件商品`;
  if (nextRewardProduct.value) {
    const gap = Number(nextRewardProduct.value.points_cost) - userPoints.value;
    return `距离 ${nextRewardProduct.value.title} 还差 ${gap} 积分`;
  }
  return '积分可用于商城兑换';
});

const membershipContextText = computed(() => {
  if (!activeSubscription.value) return '基础账户，可随时查看会员方案';
  if (subscriptionExpiryDays.value !== null && subscriptionExpiryDays.value <= 30) return `还有 ${subscriptionExpiryDays.value} 天到期`;
  if (subscriptionExpiryDays.value !== null) return `剩余 ${subscriptionExpiryDays.value} 天`;
  return subscriptionExpiryText.value;
});

const ledgerGroups = computed(() => {
  const buckets = new Map([['今天', []], ['近 7 天', []], ['更早', []]]);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const weekStart = todayStart - 6 * 86400000;
  ledger.value.forEach((item) => {
    const timestamp = new Date(item.time).getTime();
    const label = timestamp >= todayStart ? '今天' : timestamp >= weekStart ? '近 7 天' : '更早';
    buckets.get(label).push(item);
  });
  return [...buckets.entries()]
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({ label, items }));
});

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
  const code = String(error?.code || '').trim().toUpperCase();
  const detail = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  const column = String(columnName || '').trim().toLowerCase();
  return code === '42703' || code === 'PGRST204' || (column && detail.includes(column) && detail.includes('column'));
};

const loadOrders = async () => {
  if (ordersLoading.value || ordersLoaded.value) return;
  if (!userInfo.value?.id) { ordersLoaded.value = true; return; }
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
    orders.value = Array.isArray(data) ? data.map(o => ({
      ...o,
      item_count: Array.isArray(o.items) ? o.items.reduce((s, i) => s + (Number(i?.quantity) || 0), 0) : 0,
    })) : [];
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
  if (!userId) { ledgerLoaded.value = true; return; }
  ledgerLoading.value = true;
  ledgerError.value = '';

  try {
    const results = [];

    const ledgerRequests = [
      supabase.from('forum_weekly_checkins')
        .select('id, week_start_date, signed_at')
        .eq('user_id', userId)
        .order('signed_at', { ascending: false })
        .limit(50),
      supabase.from('points_transactions')
        .select('id, amount, balance_after, reason, remark, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50)
    ];
    // 概览已读取订单时直接复用，避免首次进入资产中心重复请求同一张表。
    if (!ordersLoaded.value) {
      ledgerRequests.push(
        supabase.from('shop_points_orders')
          .select('id, order_no, total_points, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(50)
      );
    }
    const settled = await Promise.allSettled(ledgerRequests);
    const [checkinRes, adminRes] = settled;
    const orderRes = ordersLoaded.value
      ? { status: 'fulfilled', value: { data: orders.value, error: null } }
      : settled[2];

    if (checkinRes.status === 'fulfilled' && !checkinRes.value.error && Array.isArray(checkinRes.value.data)) {
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
        time: row.signed_at
      });
    });
  }

    if (adminRes.status === 'fulfilled' && !adminRes.value.error && Array.isArray(adminRes.value.data)) {
    adminRes.value.data
      .filter((row) => ['admin_grant', 'points_card_cats'].includes(row.reason))
      .forEach((row) => {
        const isCatsRedemption = row.reason === 'points_card_cats';
        results.push({
          key: `${isCatsRedemption ? 'cats-card' : 'grant'}-${row.id}`,
          icon: isCatsRedemption ? Coins : Send,
          tone: isCatsRedemption ? 'orange' : 'blue',
          title: isCatsRedemption ? '兑换全员小猫卡面' : '管理员发放',
          remark: String(row.remark || '').trim() || (isCatsRedemption ? '小猫卡面' : '积分发放'),
          amount: Number(row.amount) || 0,
          time: row.created_at
        });
      });
  }

    if (orderRes.status === 'fulfilled' && !orderRes.value.error && Array.isArray(orderRes.value.data)) {
    orderRes.value.data.forEach((row) => {
      results.push({
        key: `order-${row.id}`,
        icon: ShoppingBag,
        tone: 'orange',
        title: '商城订单',
        remark: String(row.order_no || '').slice(0, 18),
        amount: -(Number(row.total_points) || 0),
        time: row.created_at
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

const goToShop = () => { router.push('/shop'); };

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
      getMyLotteryPityStatus()
    ]);
    const activeItems = result.ok && Array.isArray(result.data) ? result.data : [];
    activeSubscription.value = activeItems[0] || null;
    annualGiftSubscription.value = activeItems.find((item) => String(item?.metadata?.yearly_gift?.label || '').trim()) || null;
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
  if (!(props.beta5 ? betaTabIds : stableTabIds).has(tabId)) return;
  activeTab.value = tabId;
  if (tabId === 'overview') void loadOverview();
  if (tabId === 'cards') emit('load-points-card-data');
  if (tabId === 'points') void loadLedger();
  if (tabId === 'subscription') void loadSubscription();
  if (tabId === 'orders') void loadOrders();
  if (tabId === 'gifts') void loadGifts();
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
const showToast = (msg, type='info') => {
  // 复用全局 toast 若存在，否则降级为 console
  try { window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: msg, type } })); } catch {}
  logger.info('lottery-tab', `${type}: ${msg}`);
};
const loadLotteries = async (force=false) => {
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
  } catch {}
};
const getLotteryStatusLabel = (s) => ({ open:'报名中', drawn:'已开奖', closed:'已结束' }[String(s||'')] || String(s||''));
const formatLotteryDrawAt = (v) => {
  if (!v) return '待定';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '待定';
  return `${d.getMonth()+1}月${d.getDate()}日 ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
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
  { id: 'orders', label: '订单' }
];

const fulfillmentRecords = computed(() => [
  ...historyGifts.value.map((gift) => ({
    id: `gift-${gift.id}`,
    type: 'gift',
    title: gift.gift_content || '未命名礼物',
    detail: gift.gift_no || '礼物记录',
    status: gift.gift_status,
    time: gift.completed_at || gift.updated_at || gift.created_at
  })),
  ...orders.value.map((order) => ({
    id: `order-${order.id}`,
    type: 'order',
    title: `商城订单 · ${order.item_count} 件商品`,
    detail: order.order_no || '订单记录',
    points: Number(order.total_points) || 0,
    time: order.created_at
  }))
].filter((record) => Number.isFinite(Date.parse(record.time || '')))
  .sort((a, b) => Date.parse(b.time) - Date.parse(a.time)));

const visibleFulfillmentRecords = computed(() => (
  recordFilter.value === 'all'
    ? fulfillmentRecords.value
    : fulfillmentRecords.value.filter((record) => record.type === recordFilter.value.slice(0, -1))
));

const recentOrder = computed(() => orders.value.find((order) => isWithinDays(order.created_at, 30)) || null);
const overviewHasErrors = computed(() => Boolean(giftsError.value || ordersError.value || ledgerError.value));

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
      action: 'addresses',
      actionLabel: '添加地址',
      activityIds: [`gift-${gift.id}`],
      time: giftTime,
      showAsUpcoming: false
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
      showAsUpcoming: false
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
      showAsUpcoming: false
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
      showAsUpcoming: true
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
      showAsUpcoming: false
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
      showAsUpcoming: false
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
        showAsUpcoming: true
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
        showAsUpcoming: true
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
      showAsUpcoming: true
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
      showAsUpcoming: true
    });
  }

  return candidates.sort((a, b) => (
    b.priority - a.priority || getOverviewTimestamp(b.time) - getOverviewTimestamp(a.time)
  ));
});

const primaryInsight = computed(() => {
  if (overviewLoading.value) {
    return { id: 'loading', tone: 'neutral', icon: LayoutDashboard, kicker: '正在更新', title: '整理你的账户动态', detail: '正在同步礼物、订单、积分和会员状态。', action: 'overview', actionLabel: '请稍候', activityIds: [], priority: 0 };
  }
  return overviewCandidates.value[0] || {
    id: 'all-clear',
    tone: 'neutral',
    icon: Check,
    kicker: '账户状态',
    title: '账户一切就绪',
    detail: pointsContextText.value,
    action: 'points',
    actionLabel: '查看明细',
    activityIds: [],
    priority: 0
  };
});

const overviewTitle = computed(() => {
  if (overviewLoading.value) return '正在整理账户动态';
  if (primaryInsight.value.priority >= 80) return '优先处理这件事';
  if (primaryInsight.value.id.startsWith('gift-') || primaryInsight.value.id.startsWith('order-')) return '最近有新的账户动态';
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
    activities.push({ id: `gift-${currentGift.value.id}`, time: currentGift.value.updated_at || currentGift.value.created_at, tone: currentGift.value.gift_status === 'shipped' ? 'orange' : 'blue', title: getGiftStatusLabel(currentGift.value.gift_status), detail: currentGift.value.gift_content || '当前礼物状态已更新', action: 'gifts' });
  }
  fulfillmentRecords.value.slice(0, 3).forEach((record) => activities.push({
    id: record.id,
    time: record.time,
    tone: record.type === 'gift' ? (record.status === 'shipped' ? 'orange' : 'blue') : 'blue',
    title: record.type === 'gift' ? getGiftStatusLabel(record.status) : '商城订单',
    detail: record.type === 'gift'
      ? (record.title || '礼物状态已更新')
      : `${record.title.replace('商城订单 · ', '')} · -${record.points} 积分`,
    action: record.type === 'gift' ? 'gifts' : 'orders'
  }));
  ledger.value.filter((item) => !String(item.key).startsWith('order-')).slice(0, 3).forEach((item) => activities.push({ id: item.key, time: item.time, tone: item.tone, title: item.title, detail: `${item.remark || '积分变动'}${item.amount ? ` · ${item.amount > 0 ? '+' : ''}${item.amount}` : ''}`, action: 'points' }));
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
      action: item.action
    }));
  if (!secondaryItems.length && !redeemableProducts.value.length && nextRewardProduct.value) {
    const gap = Number(nextRewardProduct.value.points_cost) - userPoints.value;
    secondaryItems.push({ id: 'next-reward', tone: 'blue', icon: Coins, title: `再获得 ${gap} 积分`, detail: `即可兑换 ${nextRewardProduct.value.title}`, action: 'points' });
  }
  return secondaryItems.slice(0, 2);
});

const handleSmartAction = (action) => {
  if (action === 'shop') { goToShop(); return; }
  if (action === 'lottery') { router.push('/lotteries').catch(()=>{}); return; }
  activateTab(props.beta5 && ['orders', 'gifts'].includes(action) ? 'fulfillment' : (action || 'overview'));
};

const retryOverviewIssues = () => {
  if (giftsError.value) giftsLoaded.value = false;
  if (ordersError.value) ordersLoaded.value = false;
  if (ledgerError.value) ledgerLoaded.value = false;
  if (ledgerError.value) void loadLedger();
  if (giftsError.value || ordersError.value) void loadOverview();
};

const getGiftStatusLabel = (s) => {
  const map = { preparing: '备货中', processing: '正在处理', shipped: '已发货', completed: '已完成' };
  return map[s] || s;
};

const giftStatusTitle = computed(() => {
  if (!currentGift.value) return '待命中的礼物';
  const status = currentGift.value.gift_status;
  const dateSource = status === 'completed'
    ? (currentGift.value.completed_at || currentGift.value.updated_at || currentGift.value.created_at)
    : (currentGift.value.updated_at || currentGift.value.created_at);
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
  const dateSource = status === 'completed'
    ? (currentGift.value.completed_at || currentGift.value.updated_at || currentGift.value.created_at)
    : (currentGift.value.updated_at || currentGift.value.created_at);
  return formatDateShort(dateSource);
});

const giftStatusHeadline = computed(() => {
  const map = {
    preparing: '礼物已进入备货',
    processing: '礼物正在处理中',
    shipped: '礼物已经寄出',
    completed: '礼物已送达'
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

const expressCopied = ref(false);
let expressCopyTimer = null;
const hubGroupsRef = ref(null);
let hubOverflowObserver = null;
const syncHubOverflow = () => {
  const el = hubGroupsRef.value;
  if (!el) return;
  el.querySelectorAll('.ah-hub-tabs').forEach((list) => {
    list.classList.toggle('has-overflow', list.scrollWidth > list.clientWidth + 1);
  });
};
onMounted(() => {
  const el = hubGroupsRef.value;
  if (!el || typeof ResizeObserver === 'undefined') return;
  hubOverflowObserver = new ResizeObserver(syncHubOverflow);
  hubOverflowObserver.observe(el);
  el.querySelectorAll('.ah-hub-tabs').forEach((list) => {
    hubOverflowObserver.observe(list);
    list.querySelectorAll('.ah-tab').forEach((tab) => hubOverflowObserver.observe(tab));
  });
  syncHubOverflow();
});
onUnmounted(() => {
  if (expressCopyTimer) {
    clearTimeout(expressCopyTimer);
    expressCopyTimer = null;
  }
  hubOverflowObserver?.disconnect();
  hubOverflowObserver = null;
});
const copyExpressNo = async (no) => {
  if (!no) return;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(String(no));
    } else {
      const ta = document.createElement('textarea');
      ta.value = String(no);
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    expressCopied.value = true;
    if (expressCopyTimer) clearTimeout(expressCopyTimer);
    expressCopyTimer = setTimeout(() => { expressCopied.value = false; }, 1800);
  } catch (err) {
    logger.warn('assets-hub', '复制快递单号失败:', err);
  }
};

const loadGifts = async () => {
  if (giftsLoading.value || giftsLoaded.value) return;
  const uid = userInfo.value?.id;
  if (!uid) { giftsLoaded.value = true; return; }
  giftsLoading.value = true;
  giftsError.value = '';
  try {
    const [initialGiftsRes, addressesRes] = await Promise.all([
      supabase
        .from('user_gifts')
        .select('id, user_id, gift_no, gift_content, gift_price, gift_image, gift_status, is_active, address_id, completed_at, created_at, updated_at')
        .eq('user_id', uid)
        .order('created_at', { ascending: false }),
      supabase
        .from('user_addresses')
        .select('id, user_id, recipient, phone, region, detail, is_default, created_at')
        .eq('user_id', uid)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false })
    ]);
    let giftsRes = initialGiftsRes;
    if (isMissingColumnError(giftsRes.error, 'address_id')) {
      giftsRes = await supabase
        .from('user_gifts')
        .select('id, user_id, gift_no, gift_content, gift_price, gift_image, gift_status, is_active, completed_at, created_at, updated_at')
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
        address_count: (addressByUser.get(g.user_id) || []).length
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
    historyGifts.value = normalizedGifts.filter((g) => g.id !== currentId && (!g.is_active || g.gift_status === 'completed'));
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
      productsStore.fetchProducts()
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
/* ─── 用户 + 积分 + Tab 合并大卡片 ─── */
.ah-hub-card {
  --ah-tab-count: 4;
  --ah-active-center: 12.5%;
  --ah-ease: cubic-bezier(0.32, 0.72, 0, 1);
  display: flex;
  flex-direction: column;
  padding: 16px 20px 8px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.68);
  backdrop-filter: blur(16px) saturate(150%);
  -webkit-backdrop-filter: blur(16px) saturate(150%);
  border: 0.5px solid rgba(255, 255, 255, 0.62);
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
  width: 100%;
  max-width: 980px;
  margin: 0 auto;
  transform: translateZ(0);
}

/* 顶部行：用户信息（左）+ 当前积分（右，同一行） */
.ah-top-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 16px;
}
.ah-user-left {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}
.ah-avatar {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  font-weight: 800;
  color: #fff;
  background: linear-gradient(135deg, #007aff, #5856d6);
  box-shadow: 0 6px 16px rgba(0, 122, 255, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.4);
  flex-shrink: 0;
  overflow: hidden;
}
.ah-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 220ms var(--ah-ease);
}
.ah-user-info {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.ah-name-row {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}
.ah-username {
  font-size: 19px;
  font-weight: 800;
  color: #1d1d1f;
  letter-spacing: -0.02em;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ah-uid {
  font-size: 11px;
  font-weight: 600;
  color: #8e8e93;
  letter-spacing: 0.06em;
}
.ah-name-row :global(.tier-badge.tier-free) {
  background: rgba(142, 142, 147, 0.1);
  color: #8e8e93;
}
:global(.user-space-page[data-theme="dark"]) .ah-name-row :global(.tier-badge.tier-free) {
  background: rgba(255, 255, 255, 0.1);
  color: #a1a1aa;
}

/* 当前积分（右侧胶囊） */
.ah-points-block {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  border-radius: 999px;
  background: rgba(0, 122, 255, 0.06);
  border: 1px solid rgba(0, 122, 255, 0.1);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.5);
  flex-shrink: 0;
  animation: ah-materialize 200ms var(--ah-ease) both;
}
.ah-points-icon-wrap {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #007aff;
  background: rgba(0, 122, 255, 0.12);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.5);
  flex-shrink: 0;
  transition: transform 180ms var(--ah-ease);
}
.ah-points-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}
.ah-points-label {
  font-size: 11px;
  font-weight: 600;
  color: #8e8e93;
  line-height: 1;
}
.ah-points-value {
  font-size: 24px;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: #1d1d1f;
  line-height: 1;
}

/* Tab 区 · 底部导航栏同款 */
.ah-hub-tabs {
  position: relative;
  display: grid;
  grid-template-columns: repeat(var(--ah-tab-count), minmax(0, 1fr));
  align-items: center;
  gap: 0;
  padding-top: 8px;
}
.ah-hub-tabs::before {
  content: "";
  position: absolute;
  z-index: 0;
  top: 12px;
  bottom: 0;
  left: var(--ah-active-center);
  width: calc(100% / var(--ah-tab-count) - 8px);
  border-radius: 999px;
  background: rgba(0, 122, 255, 0.14);
  box-shadow:
    inset 0 0 0 1px rgba(0, 122, 255, 0.18),
    0 6px 18px rgba(0, 122, 255, 0.12);
  transform: translateX(-50%);
  transition:
    left 210ms var(--ah-ease),
    transform 210ms var(--ah-ease);
}
.ah-tab {
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  width: 100%;
  min-width: 0;
  min-height: 44px;
  padding: 6px 12px;
  border: none;
  background: transparent;
  border-radius: 999px;
  cursor: pointer;
  transition:
    background-color 150ms ease,
    color 150ms ease,
    transform 130ms var(--ah-ease),
    box-shadow 180ms ease;
  color: var(--text-secondary);
  position: relative;
  overflow: hidden;
}
.ah-tab:hover {
  background: rgba(15, 23, 42, 0.045);
  color: var(--text-primary);
}
.ah-tab.active:hover { background: transparent; }
.ah-tab:active { transform: translateY(0) scale(0.975); }
.ah-tab.active { color: #1d1d1f; background: rgba(255,255,255,0.92); box-shadow: 0 1px 6px rgba(15,23,42,0.08); }
:global(.user-space-page[data-theme="dark"]) .ah-tab.active { background: rgba(255,255,255,0.14); color: #f4f7f8; box-shadow: none; }
.ah-tab-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  transition: transform 170ms var(--ah-ease), color 140ms ease;
}
.ah-tab.active .ah-tab-icon { transform: translateY(-2px) scale(1.08); }
.ah-tab-label {
  font-size: 12px;
  letter-spacing: 0;
  font-weight: 700;
  white-space: nowrap;
  transition: transform 170ms var(--ah-ease), font-weight 140ms ease;
}
.ah-tab.active .ah-tab-label { font-weight: 600; transform: translateY(-1px); }

/* ─── Section 通用 + 骨架 ─── */
.ah-section { transform-origin: 50% 0; min-height: 240px; }
.ah-panel-enter-active { transition: opacity 260ms cubic-bezier(0.32,0.72,0,1), transform 320ms cubic-bezier(0.32,0.72,0,1), filter 220ms ease; }
.ah-panel-leave-active { transition: opacity 140ms ease, transform 180ms ease, filter 140ms ease; }
.ah-panel-enter-from { opacity: 0; transform: translateY(10px) scale(0.985); filter: blur(4px); }
.ah-panel-leave-to { opacity: 0; transform: translateY(-6px) scale(0.990); filter: blur(2px); }

.ah-overview-skeleton { display: grid; gap: 16px; }
.ah-skeleton { background: linear-gradient(90deg, rgba(15,23,42,0.06) 25%, rgba(15,23,42,0.03) 50%, rgba(15,23,42,0.06) 75%); background-size: 200% 100%; animation: ah-shimmer 1.2s infinite linear; border-radius: 14px; }
.ah-skeleton-focus { display: flex; gap: 12px; align-items: center; padding: 16px; min-height: 112px; border: 0.5px solid rgba(255,255,255,0.6); background: rgba(255,255,255,0.52); backdrop-filter: blur(16px); }
.ah-skeleton-focus .ah-skeleton-icon { width: 44px; height: 44px; border-radius: 12px; flex-shrink: 0; }
.ah-skeleton-lines { flex: 1; display: grid; gap: 8px; }
.ah-skeleton-line { height: 12px; border-radius: 6px; }
.ah-skeleton-line.w-24 { width: 24%; } .ah-skeleton-line.w-60 { width: 60%; } .ah-skeleton-line.w-80 { width: 80%; }
.ah-skeleton-points-card { height: 168px; border-radius: 18px; }
.ah-skeleton-card-sm { height: 128px; border-radius: 16px; }
.ah-skeleton-column { height: 220px; border-radius: 16px; }
.ah-skeleton-preset { height: 132px; border-radius: 14px; }
@keyframes ah-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
:global(.user-space-page[data-theme="dark"]) .ah-skeleton { background: linear-gradient(90deg, rgba(255,255,255,0.08) 25%, rgba(255,255,255,0.04) 50%, rgba(255,255,255,0.08) 75%); background-size: 200% 100%; }

@keyframes ah-materialize {
  from { opacity: 0; transform: translateY(6px) scale(0.985); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

/* ─── 账户导航与概览 ─── */
.ah-hub-card {
  padding: 18px 20px 14px;
  border-radius: 26px;
  background: rgba(255, 255, 255, 0.62);
  backdrop-filter: blur(28px) saturate(165%);
  -webkit-backdrop-filter: blur(28px) saturate(165%);
  border-color: rgba(255, 255, 255, 0.78);
  box-shadow: 0 22px 52px rgba(15, 23, 42, 0.11), inset 0 1px 0 rgba(255, 255, 255, 0.92);
}
.ah-tab-groups { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.ah-tab-group { min-width: 0; }
.ah-tab-group-label { display: block; margin: 0 0 5px 2px; color: #78808d; font-size: 11px; font-weight: 700; letter-spacing: 0.02em; }
.ah-hub-tabs { display: flex; gap: 4px; padding: 4px; border: 0.5px solid rgba(255, 255, 255, 0.68); border-radius: 14px; background: rgba(255, 255, 255, 0.38); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7); }
.ah-hub-tabs::before { content: none; }
.ah-tab { flex: 1 1 0; min-width: 0; min-height: 36px; flex-direction: row; gap: 5px; padding: 6px 8px; border-radius: 10px; color: #78808d; white-space: nowrap; }
.ah-tab:hover { background: rgba(255, 255, 255, 0.52); color: #1d1d1f; }
.ah-tab.active { color: #1d1d1f; background: rgba(255, 255, 255, 0.82); box-shadow: 0 6px 16px rgba(15, 23, 42, 0.09), inset 0 1px 0 #fff; }
.ah-tab-icon { width: 16px; height: 16px; transition: color 150ms ease; }
.ah-tab.active .ah-tab-icon { transform: scale(1.08); color: #2563eb; }
.ah-tab-label { font-size: 12px; font-weight: 600; transition: color 150ms ease; }
.ah-tab.active .ah-tab-label { font-weight: 700; transform: none; }

.ah-overview { display: flex; flex-direction: column; gap: 14px; }
.ah-overview-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; padding: 4px 2px 0; }
.ah-overview-heading > div { min-width: 0; }
.ah-overview-heading span:first-child { color: #6e6e73; font-size: 12px; font-weight: 650; }
.ah-overview-heading h2 { margin: 3px 0 0; color: #1d1d1f; font-size: 22px; font-weight: 750; line-height: 1.15; }
.ah-overview-heading p { max-width: 620px; margin: 5px 0 0; color: #747b86; font-size: 12px; line-height: 1.5; }
.ah-overview-updating { flex: 0 0 auto; color: #6e6e73; font-size: 11px; font-weight: 600; }
.ah-overview-retry { flex: 0 0 auto; padding: 7px 11px; border: 1px solid rgba(255, 255, 255, 0.7); border-radius: 13px; background: rgba(255, 255, 255, 0.48); color: #64748b; cursor: pointer; font-size: 11px; font-weight: 650; box-shadow: 0 6px 16px rgba(15, 23, 42, 0.06); transition: background-color 150ms ease, color 150ms ease, transform 150ms ease; }
.ah-overview-retry:hover { background: rgba(37, 99, 235, 0.1); color: #2563eb; }
.ah-overview-retry:active { transform: scale(0.97); }

.ah-smart-focus {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px;
  width: 100%;
  min-height: 112px;
  padding: 18px;
  border: 1px solid rgba(255, 255, 255, 0.82);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.56);
  backdrop-filter: blur(30px) saturate(165%);
  -webkit-backdrop-filter: blur(30px) saturate(165%);
  box-shadow: 0 22px 46px rgba(15, 23, 42, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.92);
  color: #1d1d1f;
  cursor: pointer;
  text-align: left;
  transition: transform 190ms var(--ah-ease), box-shadow 190ms ease, background-color 190ms ease;
}
.ah-smart-focus-icon { display: grid; width: 48px; height: 48px; place-items: center; border-radius: 17px; background: rgba(37, 99, 235, 0.11); color: #2563eb; }
.ah-smart-focus-copy { display: flex; min-width: 0; flex-direction: column; gap: 3px; }
.ah-smart-focus-copy > span { color: #64748b; font-size: 11px; font-weight: 700; }
.ah-smart-focus-copy strong { color: #1d1d1f; font-size: 18px; font-weight: 780; line-height: 1.25; }
.ah-smart-focus-copy small { color: #6e6e73; font-size: 12px; line-height: 1.5; }
.ah-smart-focus-action { display: inline-flex; align-items: center; gap: 3px; color: #2563eb; font-size: 12px; font-weight: 720; white-space: nowrap; }
.ah-smart-focus-icon,
.ah-smart-focus-action svg { transition: transform 180ms var(--ah-ease); }
.ah-smart-focus.tone-orange { border-color: rgba(253, 186, 116, 0.52); background: rgba(255, 247, 237, 0.62); }
.ah-smart-focus.tone-orange .ah-smart-focus-icon { background: rgba(217, 119, 6, 0.12); color: #b45309; }
.ah-smart-focus.tone-red { border-color: rgba(253, 164, 175, 0.55); background: rgba(255, 241, 242, 0.62); }
.ah-smart-focus.tone-red .ah-smart-focus-icon { background: rgba(225, 29, 72, 0.1); color: #e11d48; }
.ah-smart-focus.tone-green { border-color: rgba(134, 239, 172, 0.52); background: rgba(240, 253, 244, 0.62); }
.ah-smart-focus.tone-green .ah-smart-focus-icon { background: rgba(34, 197, 94, 0.11); color: #16a34a; }
.ah-smart-focus.tone-blue { border-color: rgba(191, 219, 254, 0.62); background: rgba(239, 246, 255, 0.64); }
.ah-smart-focus.tone-blue .ah-smart-focus-icon { background: rgba(37, 99, 235, 0.11); color: #2563eb; }
.ah-smart-focus.tone-gold { border-color: rgba(251, 191, 36, 0.5); background: rgba(255, 251, 235, 0.66); }
.ah-smart-focus.tone-gold .ah-smart-focus-icon { background: rgba(180, 83, 9, 0.12); color: #b7791f; }
.ah-smart-focus.tone-neutral { border-color: rgba(226, 232, 240, 0.9); background: rgba(248, 250, 252, 0.62); }
.ah-smart-focus.tone-neutral .ah-smart-focus-icon { background: rgba(100, 116, 139, 0.12); color: #475569; }
.ah-smart-focus:active { transform: scale(0.99); }
.ah-smart-focus:disabled { cursor: default; opacity: 0.78; }
.ah-overview { display: flex; flex-direction: column; gap: 24px; }
.ah-overview-points-wrap { display: flex; justify-content: center; margin: 0 auto; width: 100%; max-width: 360px; }
.ah-overview-points-wrap .ah-overview-points-card { width: 100%; }
.ah-overview-insights { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 16px; }
.ah-overview-points-card { min-width: 0; align-self: start; }
.ah-smart-columns.ah-single-timeline { grid-template-columns: 1fr; gap: 16px; }
.ah-skeleton-points-card.is-centered { max-width: 360px; margin: 0 auto; }
.ah-skeleton-timeline { height: 180px; border-radius: 16px; }
@media (orientation: landscape) and (min-width: 768px) {
  .ah-overview-points-wrap { justify-content: flex-start; margin: 0; max-width: 400px; }
  .ah-skeleton-points-card.is-centered { margin: 0; }
}
.ah-overview-primary,
.ah-overview-membership,
.ah-membership-card {
  border: 0.5px solid rgba(255, 255, 255, 0.62);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.58);
  backdrop-filter: blur(16px) saturate(150%);
  -webkit-backdrop-filter: blur(16px) saturate(150%);
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.07);
}
.ah-overview-primary { position: relative; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; min-height: 164px; align-items: start; gap: 14px; padding: 20px; overflow: hidden; background: rgba(236, 246, 255, 0.72); border-color: rgba(191, 219, 254, 0.8); transition: transform 190ms var(--ah-ease), box-shadow 190ms ease, background-color 190ms ease; }
.ah-overview-card-icon { display: grid; width: 38px; height: 38px; place-items: center; border-radius: 14px; flex: 0 0 auto; }
.ah-overview-card-icon.is-blue { background: rgba(37, 99, 235, 0.12); color: #2563eb; }
.ah-overview-card-icon.is-gold { background: rgba(217, 119, 6, 0.12); color: #b45309; }
.ah-overview-copy { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.ah-overview-kicker { color: #3567a9; font-size: 12px; font-weight: 700; }
.ah-overview-copy strong { color: #123b70; font-size: 34px; font-weight: 800; line-height: 1; font-variant-numeric: tabular-nums; }
.ah-overview-copy > span:last-child { color: #4b6b91; font-size: 12px; line-height: 1.45; }
.ah-overview-link { align-self: end; display: inline-flex; width: fit-content; align-items: center; gap: 2px; padding: 7px 0; border: 0; background: transparent; color: #2563eb; cursor: pointer; font-size: 12px; font-weight: 700; transition: color 150ms ease, transform 150ms ease; }
.ah-overview-link svg { transition: transform 170ms var(--ah-ease); }
.ah-overview-link:active { transform: scale(0.97); }
.ah-overview-membership { display: flex; min-height: 164px; align-items: center; gap: 12px; padding: 20px; transition: transform 190ms var(--ah-ease), box-shadow 190ms ease, background-color 190ms ease; }
.ah-overview-membership > div:nth-child(2) { min-width: 0; flex: 1; }
.ah-overview-membership span { color: #78808d; font-size: 11px; font-weight: 650; }
.ah-overview-membership strong { display: block; margin-top: 3px; color: #1d1d1f; font-size: 18px; font-weight: 750; }
.ah-overview-membership p { margin: 4px 0 0; overflow: hidden; color: #6e6e73; font-size: 12px; line-height: 1.45; text-overflow: ellipsis; white-space: nowrap; }
.ah-overview-membership.is-expiring { background: rgba(255, 247, 237, 0.74); border-color: rgba(253, 186, 116, 0.55); }
.ah-icon-command { display: grid; width: 36px; height: 36px; place-items: center; padding: 0; border: 1px solid rgba(255, 255, 255, 0.76); border-radius: 14px; background: rgba(255, 255, 255, 0.58); color: #1d1d1f; cursor: pointer; box-shadow: 0 7px 18px rgba(15, 23, 42, 0.08); transition: transform 150ms var(--ah-ease), background-color 150ms ease, border-color 150ms ease; }
.ah-icon-command svg { transition: transform 170ms var(--ah-ease); }
.ah-icon-command:active { transform: scale(0.95); }
.ah-smart-columns { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(300px, 0.9fr); gap: 12px; }
.ah-smart-section { min-width: 0; padding: 18px; border: 1px solid rgba(255, 255, 255, 0.72); border-radius: 22px; background: rgba(255, 255, 255, 0.46); backdrop-filter: blur(26px) saturate(155%); -webkit-backdrop-filter: blur(26px) saturate(155%); box-shadow: 0 16px 34px rgba(15, 23, 42, 0.075), inset 0 1px 0 rgba(255, 255, 255, 0.84); }
.ah-smart-section-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.ah-smart-section-head > div { display: flex; flex-direction: column; gap: 2px; }
.ah-smart-section-head span { color: #7b8491; font-size: 10px; font-weight: 700; }
.ah-smart-section-head strong { color: #1d1d1f; font-size: 14px; font-weight: 760; }
.ah-smart-section-head button { display: grid; width: 30px; height: 30px; place-items: center; padding: 0; border: 0; border-radius: 11px; background: rgba(255, 255, 255, 0.54); color: #64748b; cursor: pointer; transition: transform 150ms var(--ah-ease), background-color 150ms ease; }
.ah-smart-timeline,
.ah-smart-next-list { display: flex; flex-direction: column; }
.ah-smart-activity { display: grid; grid-template-columns: 52px 10px minmax(0, 1fr) auto; align-items: center; gap: 9px; min-width: 0; padding: 9px 0; border: 0; border-top: 1px solid rgba(15, 23, 42, 0.07); background: transparent; color: #1d1d1f; cursor: pointer; text-align: left; }
.ah-smart-activity:first-child { border-top: 0; }
.ah-smart-activity-time { color: #8a919c; font-size: 10px; font-weight: 650; }
.ah-smart-activity-marker { width: 7px; height: 7px; border-radius: 50%; background: #2563eb; box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.09); }
.ah-smart-activity-marker.tone-orange { background: #d97706; box-shadow: 0 0 0 4px rgba(217, 119, 6, 0.09); }
.ah-smart-activity-marker.tone-green { background: #16a34a; box-shadow: 0 0 0 4px rgba(22, 163, 74, 0.09); }
.ah-smart-activity-marker.tone-gray { background: #8e8e93; box-shadow: 0 0 0 4px rgba(142, 142, 147, 0.09); }
.ah-smart-activity-copy { display: flex; min-width: 0; flex-direction: column; gap: 2px; }
.ah-smart-activity-copy strong { overflow: hidden; color: #1d1d1f; font-size: 12px; font-weight: 720; text-overflow: ellipsis; white-space: nowrap; }
.ah-smart-activity-copy small { overflow: hidden; color: #737b87; font-size: 10.5px; text-overflow: ellipsis; white-space: nowrap; }
.ah-smart-activity > svg { color: #a0a6af; transition: transform 170ms var(--ah-ease); }
.ah-smart-next { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 11px 0; border: 0; border-top: 1px solid rgba(15, 23, 42, 0.07); background: transparent; color: #1d1d1f; cursor: pointer; text-align: left; }
.ah-smart-next:first-child { border-top: 0; }
.ah-smart-next-icon { display: grid; width: 34px; height: 34px; place-items: center; border-radius: 12px; background: rgba(37, 99, 235, 0.1); color: #2563eb; transition: transform 170ms var(--ah-ease); }
.ah-smart-next.tone-orange .ah-smart-next-icon { background: rgba(217, 119, 6, 0.11); color: #b45309; }
.ah-smart-next.tone-red .ah-smart-next-icon { background: rgba(225, 29, 72, 0.09); color: #e11d48; }
.ah-smart-next.tone-green .ah-smart-next-icon { background: rgba(22, 163, 74, 0.1); color: #16a34a; }
.ah-smart-next-copy { display: flex; min-width: 0; flex-direction: column; gap: 2px; }
.ah-smart-next-copy strong { color: #1d1d1f; font-size: 12px; font-weight: 720; }
.ah-smart-next-copy span { overflow: hidden; color: #737b87; font-size: 10.5px; text-overflow: ellipsis; white-space: nowrap; }
.ah-smart-next > svg { color: #a0a6af; transition: transform 170ms var(--ah-ease); }
.ah-smart-ready { display: flex; align-items: center; gap: 11px; min-height: 72px; color: #16a34a; }
.ah-smart-ready > svg { flex: 0 0 auto; }
.ah-smart-ready > div { display: flex; min-width: 0; flex-direction: column; gap: 2px; }
.ah-smart-ready strong { color: #1d1d1f; font-size: 12px; font-weight: 730; }
.ah-smart-ready span,
.ah-smart-quiet { color: #7b8491; font-size: 10.5px; line-height: 1.45; }
.ah-smart-quiet { min-height: 72px; display: grid; place-items: center; text-align: center; }

.ah-membership-card { display: flex; flex-direction: column; gap: 12px; padding: 22px; }
.ah-membership-card-top { display: flex; align-items: center; justify-content: space-between; color: #78808d; font-size: 12px; font-weight: 700; }
.ah-membership-status { padding: 3px 8px; border-radius: 999px; background: #ecfdf3; color: #15803d; font-size: 11px; }
.ah-membership-card.is-free .ah-membership-status { background: #f3f4f6; color: #6b7280; }
.ah-membership-card h2 { margin: 0; color: #1d1d1f; font-size: 26px; font-weight: 800; }
.ah-membership-card p { margin: -5px 0 0; color: #6e6e73; font-size: 13px; }
.ah-membership-meta { display: flex; gap: 8px; flex-wrap: wrap; }
.ah-membership-meta span { padding: 6px 10px; border-radius: 11px; background: rgba(243, 244, 246, 0.72); color: #4b5563; font-size: 11px; font-weight: 650; }
.ah-pity-progress { display: grid; gap: 8px; padding-top: 2px; }
.ah-pity-progress-head { display: flex; justify-content: space-between; gap: 12px; color: #4b5563; font-size: 12px; font-weight: 700; }
.ah-pity-progress-head strong { color: #1d1d1f; font-weight: 800; }
.ah-pity-progress-track { height: 6px; overflow: hidden; background: #e5e7eb; border-radius: 3px; }
.ah-pity-progress-fill { height: 100%; min-width: 0; background: #17803d; transition: width 240ms ease; }
.ah-pity-progress p { margin: 0; color: #6e6e73; font-size: 12px; line-height: 1.55; }
.ah-pity-progress.is-due .ah-pity-progress-fill { background: #b7791f; }
.ah-pity-progress.is-due .ah-pity-progress-head strong { color: #9a6700; }
.ah-pity-progress.is-unavailable .ah-pity-progress-head strong { color: #6b7280; }

/* ─── 记录列表 ─── */
.ah-ledger { gap: 20px; }
.ah-ledger-group h2 { margin: 0 0 5px; color: #6b7280; font-size: 12px; font-weight: 750; }
.ah-ledger-list,
.ah-order-list { gap: 0; border-top: 1px solid rgba(15, 23, 42, 0.1); }
.ah-ledger-item,
.ah-order-item { padding: 13px 4px; border: 0; border-radius: 0; border-bottom: 1px solid rgba(15, 23, 42, 0.1); background: transparent; box-shadow: none; }
.ah-ledger-item:hover,
.ah-order-item:hover { transform: none; background: rgba(15, 23, 42, 0.025); box-shadow: none; }

/* ─── 积分明细流水 · 列表化 去卡片化 ─── */
.ah-ledger {
  display: flex;
  flex-direction: column;
  gap: 0;
}
.ah-ledger-group { gap: 0; }
.ah-ledger-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 2px;
  border-radius: 0;
  background: transparent;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  border: 0;
  border-bottom: 0.5px solid rgba(15, 23, 42, 0.07);
  box-shadow: none;
  transition: background-color 140ms ease;
  animation: none;
}
.ah-ledger-icon {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: transform 180ms var(--ah-ease);
}
.ah-ledger-icon.tone-green { color: #34c759; background: rgba(52, 199, 89, 0.12); }
.ah-ledger-icon.tone-blue { color: #007aff; background: rgba(0, 122, 255, 0.12); }
.ah-ledger-icon.tone-orange { color: #ff9500; background: rgba(255, 149, 0, 0.14); }
.ah-ledger-icon.tone-gray { color: #8e8e93; background: rgba(142, 142, 147, 0.12); }
.ah-ledger-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}
.ah-ledger-title { font-size: 14px; font-weight: 700; color: #1d1d1f; }
.ah-ledger-remark {
  font-size: 12px;
  color: #8e8e93;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ah-ledger-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  flex-shrink: 0;
}
.ah-ledger-amount { font-size: 16px; font-weight: 800; color: #34c759; letter-spacing: -0.01em; }
.ah-ledger-amount.negative { color: #ff3b30; }
.ah-ledger-amount.zero { color: #8e8e93; font-weight: 600; }
.ah-ledger-date { font-size: 11px; color: #8e8e93; }

/* ─── 空状态 · 毛玻璃 ─── */
.ah-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 44px 24px;
  text-align: center;
  border-radius: 26px;
  background: rgba(255, 255, 255, 0.5);
  backdrop-filter: blur(28px) saturate(160%);
  -webkit-backdrop-filter: blur(28px) saturate(160%);
  border: 1px solid rgba(255, 255, 255, 0.74);
  box-shadow: 0 20px 44px rgba(15, 23, 42, 0.09), inset 0 1px 0 rgba(255, 255, 255, 0.88);
}
.ah-empty-icon {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #8e8e93;
  background: rgba(15, 23, 42, 0.04);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8);
  margin-bottom: 4px;
}
.ah-empty-state h3 { margin: 2px 0 0; font-size: 16px; font-weight: 800; color: #1d1d1f; }
.ah-empty-state p { margin: 0; font-size: 13px; color: #8e8e93; }

/* ─── 商城 ─── */
.ah-shop-preview { display: flex; flex-direction: column; gap: 14px; }
.ah-shop-stats { display: flex; gap: 12px; }
.ah-shop-stat {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 22px 16px;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.5);
  backdrop-filter: blur(24px) saturate(155%);
  -webkit-backdrop-filter: blur(24px) saturate(155%);
  border: 1px solid rgba(255, 255, 255, 0.72);
  box-shadow: 0 16px 34px rgba(15, 23, 42, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.86);
}
.ah-shop-stat-value { font-size: 24px; font-weight: 800; letter-spacing: -0.02em; color: #1d1d1f; }
.ah-shop-stat-label { font-size: 11px; font-weight: 600; color: #8e8e93; }
.ah-shop-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 46px;
  border: none;
  border-radius: 999px;
  font-size: 13.5px;
  font-weight: 700;
  color: #fff;
  background: #1d1d1f;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12);
  cursor: pointer;
  transition:
    background-color 0.2s cubic-bezier(0.2, 0.8, 0.2, 1),
    box-shadow 0.2s cubic-bezier(0.2, 0.8, 0.2, 1),
    transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.ah-shop-btn svg { transition: transform 180ms var(--ah-ease); }
.ah-shop-btn:active { transform: scale(0.97); transition-duration: 100ms; }
.ah-shop-btn-ghost {
  margin-top: 8px;
  padding: 0 28px;
  width: fit-content;
  background: rgba(0, 122, 255, 0.14);
  color: #007aff;
  box-shadow: none;
  height: 40px;
}

/* ─── 订单 ─── */
.ah-order-skeleton { display: flex; flex-direction: column; gap: 10px; }
.ah-skeleton-block {
  height: 68px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.55);
  border: 1px solid rgba(255, 255, 255, 0.5);
  animation: ah-skel 900ms ease-in-out infinite alternate;
}
@keyframes ah-skel { to { opacity: 0.52; } }
.ah-order-list { display: flex; flex-direction: column; gap: 10px; }
.ah-order-item {
  padding: 16px 20px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.48);
  backdrop-filter: blur(24px) saturate(155%);
  -webkit-backdrop-filter: blur(24px) saturate(155%);
  border: 1px solid rgba(255, 255, 255, 0.72);
  box-shadow: 0 14px 30px rgba(15, 23, 42, 0.075), inset 0 1px 0 rgba(255, 255, 255, 0.86);
  transition: transform 0.2s var(--ah-ease), box-shadow 0.2s ease;
  animation: ah-materialize 220ms var(--ah-ease) both;
}
.ah-order-top { display: flex; justify-content: space-between; margin-bottom: 6px; }
.ah-order-no { font-size: 12px; font-weight: 700; color: #1d1d1f; font-family: ui-monospace, "SF Mono", monospace; }
.ah-order-date { font-size: 11px; color: #8e8e93; }
.ah-order-bottom { display: flex; justify-content: space-between; }
.ah-order-items { font-size: 12px; color: #6e6e73; }
.ah-order-points { font-size: 12px; font-weight: 700; color: #ff3b30; }

/* ─── 礼物 ─── */
.ah-gift-card {
  padding: 0;
  border-radius: 26px;
  background: rgba(255, 255, 255, 0.54);
  backdrop-filter: blur(30px) saturate(165%);
  -webkit-backdrop-filter: blur(30px) saturate(165%);
  border: 1px solid rgba(255, 255, 255, 0.78);
  box-shadow: 0 24px 52px rgba(15, 23, 42, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.9);
  overflow: hidden;
  transition: transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 180ms ease;
}
@media (hover: hover) and (pointer: fine) {
  .ah-gift-card:hover { transform: translateY(-3px); box-shadow: 0 30px 60px rgba(15, 23, 42, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.94); }
}
.ah-gift-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(15, 23, 42, 0.08);
}
.ah-gift-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #5f6878;
  font-size: 12px;
  font-weight: 700;
}
.ah-gift-header-date { color: #8e8e93; font-size: 11px; font-weight: 550; white-space: nowrap; }
.ah-gift-overview {
  display: flex;
  gap: 14px;
  align-items: center;
  padding: 18px 16px;
}
.ah-gift-thumb {
  width: 68px;
  height: 68px;
  border-radius: 18px;
  background: #fff4d8;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ff9500;
  flex-shrink: 0;
  overflow: hidden;
  box-shadow: inset 0 0 0 1px rgba(184, 126, 0, 0.12);
  transition: transform 180ms cubic-bezier(0.23, 1, 0.32, 1);
}
.ah-gift-thumb.has-image { background: rgba(15, 23, 42, 0.04); }
.ah-gift-thumb img { width: 100%; height: 100%; object-fit: cover; }
@media (hover: hover) and (pointer: fine) {
  .ah-gift-card:hover .ah-gift-thumb.has-image { transform: scale(1.02); }
}
.ah-gift-headinfo { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 7px; }
.ah-gift-headtop { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.ah-gift-headinfo h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 750;
  color: #1d1d1f;
  letter-spacing: 0;
  line-height: 1.25;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.ah-gift-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  background: rgba(0, 122, 255, 0.1);
  color: #007aff;
  flex-shrink: 0;
  white-space: nowrap;
}
.ah-gift-badge-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}
.ah-gift-badge.preparing { background: rgba(142, 142, 147, 0.12); color: #8e8e93; }
.ah-gift-badge.processing { background: rgba(0, 122, 255, 0.1); color: #007aff; }
.ah-gift-badge.shipped { background: #fff4df; color: #b45309; }
.ah-gift-badge.completed { background: rgba(52, 199, 89, 0.12); color: #34c759; }
.ah-gift-badge.is-flat { font-size: 10.5px; padding: 3px 8px; }
.ah-gift-badge.is-flat .ah-gift-badge-dot { display: none; }
.ah-gift-headsub { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.ah-gift-amount { font-size: 13px; font-weight: 750; color: #b45309; }

.ah-gift-status-panel {
  display: flex;
  align-items: flex-start;
  gap: 11px;
  margin: 0 16px 14px;
  padding: 13px;
  border: 1px solid rgba(0, 122, 255, 0.12);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.42);
  backdrop-filter: blur(18px) saturate(145%);
  -webkit-backdrop-filter: blur(18px) saturate(145%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.72), 0 8px 20px rgba(15, 23, 42, 0.045);
}
.ah-gift-status-icon {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  flex: 0 0 auto;
  border-radius: 13px;
  background: rgba(0, 122, 255, 0.12);
  color: #007aff;
  animation: ah-materialize 240ms var(--ah-ease) 70ms both;
}
.ah-gift-status-copy { min-width: 0; padding-top: 1px; }
.ah-gift-status-copy strong { display: block; color: #1d1d1f; font-size: 13px; font-weight: 750; line-height: 1.35; }
.ah-gift-status-copy p { margin: 3px 0 0; color: #6e6e73; font-size: 12px; font-weight: 500; line-height: 1.5; }
.ah-gift-status-panel.preparing { border-color: rgba(142, 142, 147, 0.14); background: rgba(255, 255, 255, 0.38); }
.ah-gift-status-panel.preparing .ah-gift-status-icon { background: rgba(142, 142, 147, 0.12); color: #6e6e73; }
.ah-gift-status-panel.shipped { border-color: rgba(217, 119, 6, 0.16); background: rgba(255, 247, 237, 0.5); }
.ah-gift-status-panel.shipped .ah-gift-status-icon { background: rgba(255, 149, 0, 0.13); color: #b45309; }
.ah-gift-status-panel.completed { border-color: rgba(52, 199, 89, 0.16); background: rgba(240, 253, 244, 0.5); }
.ah-gift-status-panel.completed .ah-gift-status-icon { background: rgba(52, 199, 89, 0.13); color: #248a3d; }

/* 订单与收货信息 */
.ah-gift-details {
  display: flex;
  flex-direction: column;
  padding: 2px 16px;
}
.ah-gift-detail-row {
  display: flex;
  align-items: center;
  gap: 11px;
  min-height: 62px;
  padding: 12px 0;
}
.ah-gift-detail-row + .ah-gift-detail-row {
  border-top: 1px solid rgba(15, 23, 42, 0.08);
}
.ah-gift-detail-icon {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  flex: 0 0 auto;
  border-radius: 12px;
  background: #eef5ff;
  color: #2563eb;
}
.ah-gift-detail-copy { min-width: 0; flex: 1; }
.ah-gift-detail-copy > span {
  display: block;
  color: #78808d;
  font-size: 11px;
  font-weight: 600;
}
.ah-gift-detail-copy strong {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-top: 2px;
  color: #1d1d1f;
  font-size: 13px;
  font-weight: 700;
  font-family: ui-monospace, "SF Mono", "JetBrains Mono", monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ah-gift-detail-copy em { color: #78808d; font-size: 12px; font-style: normal; font-weight: 500; }
.ah-gift-detail-copy p { margin: 3px 0 0; color: #6e6e73; font-size: 12px; line-height: 1.45; }
.ah-gift-copy {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  padding: 0;
  border: 1px solid rgba(37, 99, 235, 0.22);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.62);
  color: #2563eb;
  cursor: pointer;
  transition: transform 150ms cubic-bezier(0.23, 1, 0.32, 1), background-color 150ms ease, border-color 150ms ease, color 150ms ease;
  flex-shrink: 0;
}
.ah-gift-copy:active { transform: scale(0.95); }
.ah-gift-copy.copied {
  background: #ecfdf3;
  border-color: #a7f3c6;
  color: #15803d;
}
.ah-icon-swap-enter-active { transition: opacity 150ms var(--ah-ease), transform 150ms var(--ah-ease), filter 150ms ease; }
.ah-icon-swap-leave-active { transition: opacity 90ms ease, transform 90ms ease, filter 90ms ease; }
.ah-icon-swap-enter-from { opacity: 0; transform: scale(0.82) rotate(-10deg); filter: blur(1px); }
.ah-icon-swap-leave-to { opacity: 0; transform: scale(0.9) rotate(8deg); filter: blur(1px); }

/* ─── 历史礼物 ─── */
.ah-gift-history { margin-top: 24px; display: flex; flex-direction: column; gap: 8px; }
.ah-gift-history-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 4px;
}
.ah-gift-history-head span:first-child { font-size: 13px; font-weight: 750; color: #1d1d1f; letter-spacing: 0; }
.ah-gift-history-count { font-size: 11px; color: #8e8e93; font-weight: 600; }
.ah-gift-history-list { display: flex; flex-direction: column; border-top: 1px solid rgba(15, 23, 42, 0.1); }
.ah-gift-history-item {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
  padding: 12px;
  border: 1px solid rgba(255, 255, 255, 0.66);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.4);
  backdrop-filter: blur(20px) saturate(150%);
  -webkit-backdrop-filter: blur(20px) saturate(150%);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.78);
  transition: transform 150ms ease, background-color 150ms ease, box-shadow 150ms ease;
  animation: ah-materialize 220ms var(--ah-ease) both;
}
@media (hover: hover) and (pointer: fine) {
  .ah-gift-history-item:hover { transform: translateY(-2px); background: rgba(255, 255, 255, 0.62); box-shadow: 0 16px 30px rgba(15, 23, 42, 0.09), inset 0 1px 0 rgba(255, 255, 255, 0.86); }
}
.ah-gift-history-thumb {
  width: 42px;
  height: 42px;
  border-radius: 13px;
  background: #fff4d8;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ff9500;
  flex-shrink: 0;
  overflow: hidden;
}
.ah-gift-history-thumb.has-image { background: rgba(15, 23, 42, 0.04); }
.ah-gift-history-thumb img { width: 100%; height: 100%; object-fit: cover; }
.ah-gift-history-thumb { transition: transform 180ms var(--ah-ease); }
.ah-gift-history-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.ah-gift-history-main strong {
  font-size: 13.5px;
  font-weight: 700;
  color: #1d1d1f;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ah-gift-history-meta-line { display: flex; align-items: center; gap: 8px; }
.ah-gift-history-no {
  font-size: 10.5px;
  color: #8e8e93;
  font-family: ui-monospace, "SF Mono", monospace;
  letter-spacing: 0.02em;
}
.ah-gift-history-date { font-size: 11px; color: #8e8e93; }
.ah-gift-history-side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  flex-shrink: 0;
}
.ah-gift-history-price { font-size: 12px; font-weight: 700; color: #b45309; }

.ah-ledger-item:nth-child(2),
.ah-order-item:nth-child(2),
.ah-gift-history-item:nth-child(2) { animation-delay: 25ms; }
.ah-ledger-item:nth-child(3),
.ah-order-item:nth-child(3),
.ah-gift-history-item:nth-child(3) { animation-delay: 50ms; }
.ah-ledger-item:nth-child(4),
.ah-order-item:nth-child(4),
.ah-gift-history-item:nth-child(4) { animation-delay: 75ms; }
.ah-ledger-item:nth-child(5),
.ah-order-item:nth-child(5),
.ah-gift-history-item:nth-child(5) { animation-delay: 100ms; }

@media (hover: hover) and (pointer: fine) {
  .ah-avatar:hover .ah-avatar-img { transform: scale(1.045); }
  .ah-points-block:hover .ah-points-icon-wrap { transform: rotate(-5deg) scale(1.06); }
  .ah-overview-primary:hover,
  .ah-overview-membership:hover { transform: translateY(-3px); box-shadow: 0 26px 48px rgba(15, 23, 42, 0.13), inset 0 1px 0 rgba(255, 255, 255, 0.92); }
  .ah-overview-link:hover { color: #1d4ed8; }
  .ah-icon-command:hover { background: rgba(255, 255, 255, 0.95); border-color: rgba(15, 23, 42, 0.18); }
  .ah-overview-link:hover svg,
  .ah-icon-command:hover svg,
  .ah-shop-btn:hover svg { transform: translateX(3px); }
  .ah-smart-focus:hover { transform: translateY(-3px); box-shadow: 0 28px 54px rgba(15, 23, 42, 0.14), inset 0 1px 0 rgba(255, 255, 255, 0.94); }
  .ah-smart-focus:hover .ah-smart-focus-icon,
  .ah-smart-next:hover .ah-smart-next-icon { transform: scale(1.06); }
  .ah-smart-focus:hover .ah-smart-focus-action svg,
  .ah-smart-activity:hover > svg,
  .ah-smart-next:hover > svg,
  .ah-smart-section-head button:hover svg { transform: translateX(3px); }
  .ah-smart-activity:hover,
  .ah-smart-next:hover { background: rgba(255, 255, 255, 0.34); }
  .ah-smart-section-head button:hover { background: rgba(255, 255, 255, 0.82); }
  .ah-ledger-item:hover .ah-ledger-icon { transform: scale(1.06); }
  .ah-ledger-item:hover,
  .ah-order-item:hover { transform: translateY(-3px); box-shadow: 0 22px 40px rgba(15, 23, 42, 0.11), inset 0 1px 0 rgba(255, 255, 255, 0.9); }
  .ah-shop-btn:hover { background: #000; transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18); }
  .ah-shop-btn-ghost:hover { background: rgba(0, 122, 255, 0.2); color: #007aff; }
  .ah-gift-copy:hover { background: #eff6ff; border-color: rgba(37, 99, 235, 0.38); }
  .ah-gift-history-item:hover .ah-gift-history-thumb { transform: scale(1.05); }
}

/* ─── 深色模式 ─── */
:global(.user-space-page[data-theme="dark"]) .ah-hub-card {
  background: rgba(24, 26, 32, 0.62);
  border-color: rgba(255, 255, 255, 0.13);
  box-shadow: 0 24px 54px rgba(0, 0, 0, 0.38), inset 0 1px 0 rgba(255, 255, 255, 0.1);
}
:global(.user-space-page[data-theme="dark"]) .ah-points-block {
  background: rgba(99, 179, 237, 0.1);
  border-color: rgba(99, 179, 237, 0.16);
}
:global(.user-space-page[data-theme="dark"]) .ah-username,
:global(.user-space-page[data-theme="dark"]) .ah-points-value,
:global(.user-space-page[data-theme="dark"]) .ah-tab.active,
:global(.user-space-page[data-theme="dark"]) .ah-ledger-title {
  color: #f5f7fa;
}
:global(.user-space-page[data-theme="dark"]) .ah-uid,
:global(.user-space-page[data-theme="dark"]) .ah-points-label,
:global(.user-space-page[data-theme="dark"]) .ah-tab-label {
  color: #8b8e96;
}
:global(.user-space-page[data-theme="dark"]) .ah-hub-tabs::before {
  background: rgba(99, 179, 237, 0.22);
  box-shadow: inset 0 0 0 1px rgba(99, 179, 237, 0.28), 0 8px 22px rgba(0, 0, 0, 0.28);
}
:global(.user-space-page[data-theme="dark"]) .ah-tab:hover {
  background: rgba(255, 255, 255, 0.08);
}
:global(.user-space-page[data-theme="dark"]) .ah-hub-tabs { background: rgba(255, 255, 255, 0.045); border-color: rgba(255, 255, 255, 0.1); }
:global(.user-space-page[data-theme="dark"]) .ah-tab.active { background: rgba(255, 255, 255, 0.12); box-shadow: 0 8px 18px rgba(0, 0, 0, 0.24), inset 0 1px 0 rgba(255, 255, 255, 0.1); }
:global(.user-space-page[data-theme="dark"]) .ah-empty-state,
:global(.user-space-page[data-theme="dark"]) .ah-shop-stat,
:global(.user-space-page[data-theme="dark"]) .ah-order-item,
:global(.user-space-page[data-theme="dark"]) .ah-ledger-item,
:global(.user-space-page[data-theme="dark"]) .ah-gift-card,
:global(.user-space-page[data-theme="dark"]) .ah-skeleton-block {
  background: rgba(24, 26, 32, 0.55);
  border-color: rgba(255, 255, 255, 0.1);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.06);
}
:global(.user-space-page[data-theme="dark"]) .ah-empty-state h3,
:global(.user-space-page[data-theme="dark"]) .ah-shop-stat-value,
:global(.user-space-page[data-theme="dark"]) .ah-order-no,
:global(.user-space-page[data-theme="dark"]) .ah-gift-headinfo h3,
:global(.user-space-page[data-theme="dark"]) .ah-gift-history-main strong,
:global(.user-space-page[data-theme="dark"]) .ah-gift-history-head span:first-child,
:global(.user-space-page[data-theme="dark"]) .ah-gift-detail-copy strong,
:global(.user-space-page[data-theme="dark"]) .ah-gift-status-copy strong {
  color: #f5f7fa;
}
:global(.user-space-page[data-theme="dark"]) .ah-empty-state p,
:global(.user-space-page[data-theme="dark"]) .ah-shop-stat-label,
:global(.user-space-page[data-theme="dark"]) .ah-order-date,
:global(.user-space-page[data-theme="dark"]) .ah-order-items,
:global(.user-space-page[data-theme="dark"]) .ah-ledger-remark,
:global(.user-space-page[data-theme="dark"]) .ah-ledger-date,
:global(.user-space-page[data-theme="dark"]) .ah-gift-header-date,
:global(.user-space-page[data-theme="dark"]) .ah-gift-history-no,
:global(.user-space-page[data-theme="dark"]) .ah-gift-history-count,
:global(.user-space-page[data-theme="dark"]) .ah-gift-history-date,
:global(.user-space-page[data-theme="dark"]) .ah-gift-status-copy p,
:global(.user-space-page[data-theme="dark"]) .ah-gift-detail-copy > span,
:global(.user-space-page[data-theme="dark"]) .ah-gift-detail-copy em,
:global(.user-space-page[data-theme="dark"]) .ah-gift-detail-copy p,
:global(.user-space-page[data-theme="dark"]) .ah-gift-eyebrow {
  color: #8b8e96;
}
:global(.user-space-page[data-theme="dark"]) .ah-gift-thumb:not(.has-image) {
  background: rgba(217, 119, 6, 0.16);
  color: #ffb340;
}
:global(.user-space-page[data-theme="dark"]) .ah-gift-history-thumb:not(.has-image) {
  background: rgba(217, 119, 6, 0.16);
  color: #ffb340;
}
:global(.user-space-page[data-theme="dark"]) .ah-gift-header {
  border-bottom-color: rgba(255, 255, 255, 0.08);
}
:global(.user-space-page[data-theme="dark"]) .ah-gift-detail-row + .ah-gift-detail-row {
  border-top-color: rgba(255, 255, 255, 0.08);
}
:global(.user-space-page[data-theme="dark"]) .ah-gift-status-panel { background: rgba(255, 255, 255, 0.045); border-color: rgba(255, 255, 255, 0.08); }
:global(.user-space-page[data-theme="dark"]) .ah-gift-copy {
  background: rgba(99, 179, 237, 0.12);
  border-color: rgba(99, 179, 237, 0.3);
  color: #7cb8f5;
}
:global(.user-space-page[data-theme="dark"]) .ah-gift-copy:hover {
  background: rgba(99, 179, 237, 0.24);
}
:global(.user-space-page[data-theme="dark"]) .ah-gift-copy.copied {
  background: rgba(52, 199, 89, 0.14);
  border-color: rgba(52, 199, 89, 0.28);
  color: #30d158;
}
:global(.user-space-page[data-theme="dark"]) .ah-gift-detail-icon {
  background: rgba(99, 179, 237, 0.14);
  color: #7cb8f5;
}
:global(.user-space-page[data-theme="dark"]) .ah-gift-history-list,
:global(.user-space-page[data-theme="dark"]) .ah-gift-history-item {
  border-color: rgba(255, 255, 255, 0.1);
}
:global(.user-space-page[data-theme="dark"]) .ah-empty-icon {
  background: rgba(255, 255, 255, 0.06);
}
:global(.user-space-page[data-theme="dark"]) .ah-shop-btn-ghost {
  background: rgba(99, 179, 237, 0.18);
  color: #7cb8f5;
}
:global(.user-space-page[data-theme="dark"]) .ah-shop-btn-ghost:hover {
  background: rgba(99, 179, 237, 0.26);
}
:global(.user-space-page[data-theme="dark"]) .ah-tab-group-label,
:global(.user-space-page[data-theme="dark"]) .ah-overview-membership span,
:global(.user-space-page[data-theme="dark"]) .ah-overview-membership p,
:global(.user-space-page[data-theme="dark"]) .ah-membership-card-top,
:global(.user-space-page[data-theme="dark"]) .ah-membership-card p,
:global(.user-space-page[data-theme="dark"]) .ah-ledger-group h2 {
  color: #a7acb5;
}
:global(.user-space-page[data-theme="dark"]) .ah-hub-tabs,
:global(.user-space-page[data-theme="dark"]) .ah-ledger-list,
:global(.user-space-page[data-theme="dark"]) .ah-order-list,
:global(.user-space-page[data-theme="dark"]) .ah-ledger-item,
:global(.user-space-page[data-theme="dark"]) .ah-order-item {
  border-color: rgba(255, 255, 255, 0.12);
}
:global(.user-space-page[data-theme="dark"]) .ah-overview-primary {
  background: rgba(37, 99, 235, 0.17);
  border-color: rgba(96, 165, 250, 0.26);
}
:global(.user-space-page[data-theme="dark"]) .ah-overview-copy strong { color: #e7f1ff; }
:global(.user-space-page[data-theme="dark"]) .ah-overview-copy > span:last-child,
:global(.user-space-page[data-theme="dark"]) .ah-overview-kicker { color: #a9cbff; }
:global(.user-space-page[data-theme="dark"]) .ah-overview-membership,
:global(.user-space-page[data-theme="dark"]) .ah-membership-card {
  background: rgba(24, 26, 32, 0.72);
  border-color: rgba(255, 255, 255, 0.12);
}
:global(.user-space-page[data-theme="dark"]) .ah-overview-heading h2 { color: #f5f7fa; }
:global(.user-space-page[data-theme="dark"]) .ah-overview-heading span:first-child,
:global(.user-space-page[data-theme="dark"]) .ah-overview-updating { color: #a7acb5; }
:global(.user-space-page[data-theme="dark"]) .ah-overview-retry { background: rgba(255, 255, 255, 0.07); color: #a7acb5; }
:global(.user-space-page[data-theme="dark"]) .ah-overview-membership.is-expiring { background: rgba(180, 83, 9, 0.17); border-color: rgba(251, 146, 60, 0.3); }
:global(.user-space-page[data-theme="dark"]) .ah-overview-membership strong,
:global(.user-space-page[data-theme="dark"]) .ah-membership-card h2 { color: #f5f7fa; }
:global(.user-space-page[data-theme="dark"]) .ah-smart-focus,
:global(.user-space-page[data-theme="dark"]) .ah-smart-section { background: rgba(24, 26, 32, 0.58); border-color: rgba(255, 255, 255, 0.12); box-shadow: 0 20px 44px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.07); }
:global(.user-space-page[data-theme="dark"]) .ah-smart-focus.tone-orange { background: rgba(180, 83, 9, 0.17); border-color: rgba(251, 146, 60, 0.28); }
:global(.user-space-page[data-theme="dark"]) .ah-smart-focus.tone-red { background: rgba(190, 24, 93, 0.15); border-color: rgba(251, 113, 133, 0.28); }
:global(.user-space-page[data-theme="dark"]) .ah-smart-focus.tone-green { background: rgba(22, 101, 52, 0.17); border-color: rgba(74, 222, 128, 0.25); }
:global(.user-space-page[data-theme="dark"]) .ah-smart-focus-copy strong,
:global(.user-space-page[data-theme="dark"]) .ah-smart-section-head strong,
:global(.user-space-page[data-theme="dark"]) .ah-smart-activity-copy strong,
:global(.user-space-page[data-theme="dark"]) .ah-smart-next-copy strong,
:global(.user-space-page[data-theme="dark"]) .ah-smart-ready strong { color: #f5f7fa; }
:global(.user-space-page[data-theme="dark"]) .ah-smart-focus-copy > span,
:global(.user-space-page[data-theme="dark"]) .ah-smart-focus-copy small,
:global(.user-space-page[data-theme="dark"]) .ah-smart-section-head span,
:global(.user-space-page[data-theme="dark"]) .ah-smart-activity-time,
:global(.user-space-page[data-theme="dark"]) .ah-smart-activity-copy small,
:global(.user-space-page[data-theme="dark"]) .ah-smart-next-copy span,
:global(.user-space-page[data-theme="dark"]) .ah-smart-ready span,
:global(.user-space-page[data-theme="dark"]) .ah-smart-quiet { color: #a7acb5; }
:global(.user-space-page[data-theme="dark"]) .ah-smart-activity,
:global(.user-space-page[data-theme="dark"]) .ah-smart-next { border-top-color: rgba(255, 255, 255, 0.09); }
:global(.user-space-page[data-theme="dark"]) .ah-smart-section-head button { background: rgba(255, 255, 255, 0.07); color: #a7acb5; }
:global(.user-space-page[data-theme="dark"]) .ah-smart-activity:hover,
:global(.user-space-page[data-theme="dark"]) .ah-smart-next:hover,
:global(.user-space-page[data-theme="dark"]) .ah-smart-section-head button:hover { background: rgba(255, 255, 255, 0.08); }
:global(.user-space-page[data-theme="dark"]) .ah-icon-command { background: rgba(255, 255, 255, 0.06); border-color: rgba(255, 255, 255, 0.14); color: #f5f7fa; }
:global(.user-space-page[data-theme="dark"]) .ah-ledger-item:hover,
:global(.user-space-page[data-theme="dark"]) .ah-order-item:hover { background: rgba(255, 255, 255, 0.06); }
:global(.user-space-page[data-theme="dark"]) .ah-ledger-item,
:global(.user-space-page[data-theme="dark"]) .ah-order-item { background: rgba(24, 26, 32, 0.5); border-color: rgba(255, 255, 255, 0.11); box-shadow: 0 16px 34px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.07); }
:global(.user-space-page[data-theme="dark"]) .ah-gift-history-item { background: rgba(24, 26, 32, 0.46); border-color: rgba(255, 255, 255, 0.1); box-shadow: 0 14px 28px rgba(0, 0, 0, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.06); }
:global(.user-space-page[data-theme="dark"]) .ah-membership-meta span { background: rgba(255, 255, 255, 0.08); color: #c5cad2; }
:global(.user-space-page[data-theme="dark"]) .ah-pity-progress-head { color: #c5cad2; }
:global(.user-space-page[data-theme="dark"]) .ah-pity-progress-head strong { color: #f5f7fa; }
:global(.user-space-page[data-theme="dark"]) .ah-pity-progress-track { background: rgba(255, 255, 255, 0.12); }
:global(.user-space-page[data-theme="dark"]) .ah-pity-progress p { color: #aeb6c2; }
:global(.user-space-page[data-theme="dark"]) .ah-sponsor-hero { background: linear-gradient(135deg, rgba(45,28,32,0.72), rgba(28,30,36,0.68)); border-color: rgba(255,255,255,0.10); box-shadow: 0 16px 36px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.07); }
:global(.user-space-page[data-theme="dark"]) .ah-sponsor-hero h2 { color: #f5f7fa; }
:global(.user-space-page[data-theme="dark"]) .ah-sponsor-hero p { color: #a1a1aa; }
:global(.user-space-page[data-theme="dark"]) .ah-sponsor-hero span { color: #fb7185; }
:global(.user-space-page[data-theme="dark"]) .ah-sponsor-hero-icon { background: linear-gradient(135deg, rgba(225,29,72,0.18), rgba(225,29,72,0.28)); color: #fb7185; border-color: rgba(251,113,133,0.18); box-shadow: 0 8px 20px rgba(0,0,0,0.28); }
:global(.user-space-page[data-theme="dark"]) .ah-sponsor-card { background: rgba(28,30,36,0.62); border-color: rgba(255,255,255,0.09); box-shadow: 0 12px 32px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.06); }
:global(.user-space-page[data-theme="dark"]) .ah-sponsor-card h3 { color: #f5f7fa; }
:global(.user-space-page[data-theme="dark"]) .ah-sponsor-card p { color: #a1a1aa; }
:global(.user-space-page[data-theme="dark"]) .ah-sponsor-card small { color: #8b8e96; }
:global(.user-space-page[data-theme="dark"]) .ah-sponsor-qr-wrap { background: #ffffff; border-color: rgba(255,255,255,0.08); }
:global(.user-space-page[data-theme="dark"]) .ah-sponsor-qr-wrap.is-placeholder { background: rgba(255,255,255,0.04); color: #6b7280; border-color: rgba(255,255,255,0.10); }
:global(.user-space-page[data-theme="dark"]) .ah-sponsor-foot p { color: #8b8e96; }
:global(.user-space-page[data-theme="dark"]) .ah-lottery-hero { background: linear-gradient(135deg, rgba(30,38,64,0.72), rgba(28,30,36,0.68)); border-color: rgba(255,255,255,0.10); box-shadow: 0 16px 36px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.07); }
:global(.user-space-page[data-theme="dark"]) .ah-lottery-hero h2 { color: #f5f7fa; }
:global(.user-space-page[data-theme="dark"]) .ah-lottery-hero p { color: #a1a1aa; }
:global(.user-space-page[data-theme="dark"]) .ah-lottery-hero span { color: #93c5fd; }
:global(.user-space-page[data-theme="dark"]) .ah-lottery-hero-icon { background: linear-gradient(135deg, rgba(37,99,235,0.18), rgba(37,99,235,0.28)); color: #93c5fd; border-color: rgba(147,197,253,0.18); }
:global(.user-space-page[data-theme="dark"]) .ah-lottery-pity-inline { background: rgba(28,30,36,0.58); border-color: rgba(255,255,255,0.10); }
:global(.user-space-page[data-theme="dark"]) .ah-lottery-pity-inline p { color: #a1a1aa; }
:global(.user-space-page[data-theme="dark"]) .ah-lottery-pity-head { color: #a1a1aa; }
:global(.user-space-page[data-theme="dark"]) .ah-lottery-pity-head strong { color: #f5f7fa; }
:global(.user-space-page[data-theme="dark"]) .ah-lottery-card { background: rgba(28,30,36,0.62); border-color: rgba(255,255,255,0.09); }
:global(.user-space-page[data-theme="dark"]) .ah-lottery-body h3 { color: #f5f7fa; }
:global(.user-space-page[data-theme="dark"]) .ah-lottery-prize { color: #93c5fd; }
:global(.user-space-page[data-theme="dark"]) .ah-lottery-meta { color: #8b8e96; }
:global(.user-space-page[data-theme="dark"]) .ah-lottery-foot p { color: #8b8e96; }

/* ─── 响应式 ─── */
@media (max-width: 767px) {
  .ah-hub-card { max-width: none; border-radius: 20px; padding: 14px 14px 10px; box-shadow: 0 6px 18px rgba(15,23,42,0.07); }
  .ah-top-row { gap: 8px; padding-bottom: 12px; }
  .ah-user-left { gap: 10px; }
  .ah-avatar { width: 44px; height: 44px; font-size: 18px; }
  .ah-username { font-size: 17px; letter-spacing: -0.02em; }
  .ah-name-row { gap: 5px; }
  .ah-points-block { gap: 8px; padding: 6px 10px; border-radius: 999px; }
  .ah-points-icon-wrap { width: 26px; height: 26px; }
  .ah-points-label { display: none; }
  .ah-points-value { font-size: 18px; font-variant-numeric: tabular-nums; }
  .ah-tab-groups { gap: 12px; }
  .ah-tab-group-label { margin-bottom: 2px; font-size: 10px; letter-spacing: 0.06em; }
  .ah-hub-tabs { gap: 2px; padding: 3px; border-radius: 14px; background: rgba(29,29,31,0.06); }
  .ah-tab { min-height: 36px; padding: 6px 2px; border-radius: 10px; }
  .ah-tab-icon { display: none; }
  .ah-tab-label { font-size: 11px; font-weight: 650; white-space: nowrap; }
  .ah-overview { display: grid; gap: 16px; }
  .ah-overview-heading { align-items: flex-start; gap: 8px; }
  .ah-overview-heading h2 { font-size: 20px; line-height: 1.2; }
  .ah-overview-heading p { font-size: 13px; line-height: 1.5; }
  .ah-overview-summary.has-points-card { grid-template-columns: 1fr; gap: 16px; }
  .ah-overview-points-card { order: -1; }
  .ah-overview-insights,
  .ah-overview-summary.has-points-card .ah-overview-insights { grid-template-columns: 1fr; gap: 12px; }
  .ah-smart-focus { display: grid; grid-template-columns: 44px minmax(0, 1fr) auto; min-height: 0; gap: 12px; padding: 14px 14px; border-radius: 16px; align-items: center; }
  .ah-smart-focus-icon { width: 44px; height: 44px; border-radius: 12px; }
  .ah-smart-focus-copy { gap: 2px; }
  .ah-smart-focus-copy strong { font-size: 15.5px; line-height: 1.3; }
  .ah-smart-focus-copy small { font-size: 12px; line-height: 1.4; }
  .ah-smart-focus-action { grid-column: 3; justify-self: end; align-self: center; font-size: 12.5px; }
  .ah-smart-columns { grid-template-columns: 1fr; gap: 16px; }
  .ah-smart-section { padding: 14px; border-radius: 16px; border: 0.5px solid rgba(255,255,255,0.62); background: rgba(255,255,255,0.56); backdrop-filter: blur(16px) saturate(140%); box-shadow: 0 6px 16px rgba(15,23,42,0.06); }
  .ah-smart-section-head { margin-bottom: 10px; }
  .ah-overview-primary { min-height: 128px; padding: 16px; border-radius: 16px; }
  .ah-overview-copy strong { font-size: 28px; letter-spacing: -0.02em; }
  .ah-overview-copy > span:last-child { font-size: 12px; }
  .ah-overview-membership { padding: 14px 14px; min-height: 128px; border-radius: 16px; }
  .ah-membership-card { padding: 16px; border-radius: 16px; }
  .ah-ledger-item { padding: 10px 2px; gap: 10px; border-radius: 0; border: 0; border-bottom: 0.5px solid rgba(15,23,42,0.07); background: transparent; backdrop-filter: none; box-shadow: none; }
  .ah-ledger-item:hover { background: rgba(15,23,42,0.02); transform: none; }
  .ah-ledger-icon { width: 32px; height: 32px; }
  .ah-ledger-title { font-size: 13.5px; }
  .ah-ledger-remark { font-size: 11.5px; }
  .ah-ledger-amount { font-size: 14.5px; }
  .ah-empty-state { padding: 36px 18px; }
  .ah-shop-stat { padding: 18px 12px; }
  .ah-gift-header { padding: 11px 14px; }
  .ah-gift-overview { padding: 16px 14px; gap: 12px; }
  .ah-gift-card { border-radius: 22px; }
  .ah-gift-thumb { width: 56px; height: 56px; border-radius: 15px; }
  .ah-gift-headinfo h3 { font-size: 15px; }
  .ah-gift-badge { font-size: 10px; padding: 3px 8px; }
  .ah-gift-status-panel { margin: 0 14px 12px; padding: 12px; }
  .ah-gift-details { padding: 2px 14px; }
  .ah-gift-detail-row { min-height: 58px; }
  .ah-gift-history-item { padding: 10px; border-radius: 16px; }
  .ah-gift-history-thumb { width: 38px; height: 38px; }
  .ah-gift-history-main strong { font-size: 13px; }
  .ah-gift-history-side { gap: 3px; }
  .ah-gift-history-price { font-size: 11px; }
}

/* ─── 竖屏端（≤767 portrait）：Tab 组改单列堆叠，加大可点性 ─── */
@media (max-width: 767px) and (orientation: portrait) {
  /* 两组上下单列，每组 4 tab 满宽均分，无需缩写 */
  .ah-tab-groups { grid-template-columns: 1fr; gap: 10px; }
  /* 组内 tab：图上文下、更大触控区；active pill 保留白底 + 阴影 */
  .ah-hub-tabs { gap: 6px; padding: 4px; }
  .ah-tab { flex: 1 1 0; min-width: 72px; min-height: 44px; padding: 8px 6px; border-radius: 12px; flex-direction: column; gap: 3px; }
  .ah-tab:hover { background: rgba(255, 255, 255, 0.52); color: #1d1d1f; }
  .ah-tab.active { color: #1d1d1f; background: rgba(255, 255, 255, 0.92); box-shadow: 0 1px 6px rgba(15, 23, 42, 0.08); }
  .ah-tab-icon { display: block; width: 16px; height: 16px; margin: 0 auto; }
  .ah-tab-label { font-size: 12px; font-weight: 700; line-height: 1.15; white-space: nowrap; }

  /* 兜底：组内 tab 超过一屏时才启用横向滚动（避免常态下裁掉 active 阴影）+ 首尾 fade 12px，不二次截断 */
  .ah-hub-tabs.has-overflow { overflow-x: auto; scroll-snap-type: x mandatory; -ms-overflow-style: none; scrollbar-width: none; }
  .ah-hub-tabs.has-overflow::-webkit-scrollbar { display: none; }
  .ah-hub-tabs.has-overflow .ah-tab { scroll-snap-align: start; }
  .ah-hub-tabs.has-overflow {
    mask-image: linear-gradient(to right, transparent 0, #000 12px, #000 calc(100% - 12px), transparent 100%);
    -webkit-mask-image: linear-gradient(to right, transparent 0, #000 12px, #000 calc(100% - 12px), transparent 100%);
  }
}

.ah-sponsor-section { display: grid; gap: 18px; max-width: 700px; width: 100%; margin: 0 auto; align-self: center; justify-items: stretch; animation: ah-materialize 260ms var(--ah-ease) both; }
  .ah-sponsor-hero { position: relative; display: flex; gap: 16px; align-items: center; padding: 22px 20px; border: 0.5px solid rgba(255,255,255,0.78); border-radius: 20px; background: linear-gradient(135deg, rgba(255,241,242,0.92) 0%, rgba(255,255,255,0.74) 100%); backdrop-filter: blur(20px) saturate(160%); -webkit-backdrop-filter: blur(20px) saturate(160%); box-shadow: 0 16px 36px rgba(225,29,72,0.07), 0 6px 16px rgba(15,23,42,0.06), inset 0 1px 0 rgba(255,255,255,0.96); overflow: hidden; }
  .ah-sponsor-hero::before { content:""; position: absolute; inset: 0; background: radial-gradient(520px 200px at 18% 0%, rgba(225,29,72,0.07), transparent 68%), radial-gradient(360px 180px at 92% 100%, rgba(244,114,182,0.07), transparent 70%); pointer-events: none; }
  .ah-sponsor-hero-icon { width: 48px; height: 48px; border-radius: 14px; display: grid; place-items: center; background: linear-gradient(135deg, #ffffff 0%, #ffe4e6 100%); color: #e11d48; flex-shrink: 0; box-shadow: 0 8px 20px rgba(225,29,72,0.16), inset 0 1px 0 rgba(255,255,255,1); border: 0.5px solid rgba(225,29,72,0.14); position: relative; z-index: 1; }
  .ah-sponsor-hero > div { position: relative; z-index: 1; min-width: 0; }
  .ah-sponsor-hero h2 { margin: 3px 0 4px; font-size: 19px; font-weight: 850; color: #1d1d1f; letter-spacing: -0.025em; line-height: 1.2; }
  .ah-sponsor-hero p { margin: 0; font-size: 13px; color: #6e6e73; line-height: 1.65; font-weight: 500; }
  .ah-sponsor-hero span { font-size: 11px; font-weight: 750; color: #e11d48; letter-spacing: 0.06em; text-transform: uppercase; }
  .ah-sponsor-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 14px; }
  .ah-sponsor-card { position: relative; padding: 18px 16px 16px; border: 0.5px solid rgba(255,255,255,0.74); border-radius: 18px; background: rgba(255,255,255,0.68); backdrop-filter: blur(18px) saturate(150%); -webkit-backdrop-filter: blur(18px) saturate(150%); box-shadow: 0 10px 28px rgba(15,23,42,0.07), inset 0 1px 0 rgba(255,255,255,0.92); transition: transform 180ms var(--ah-ease), box-shadow 180ms ease, border-color 180ms ease, background-color 180ms ease; overflow: hidden; }
  .ah-sponsor-card::before { content:""; position: absolute; inset: 0; border-radius: 18px; background: radial-gradient(340px 140px at 50% 0%, rgba(255,255,255,0.58), transparent 72%); pointer-events: none; }
  .ah-sponsor-card:hover { transform: translateY(-2px); box-shadow: 0 16px 36px rgba(15,23,42,0.10), inset 0 1px 0 rgba(255,255,255,0.98); border-color: rgba(255,255,255,0.86); }
  .ah-sponsor-card.is-muted { opacity: 0.72; }
  .ah-sponsor-card.is-muted:hover { transform: none; box-shadow: 0 10px 28px rgba(15,23,42,0.07); }
  .ah-sponsor-card h3 { position: relative; z-index: 1; margin: 0; font-size: 14.5px; font-weight: 800; color: #1d1d1f; display: flex; align-items: center; gap: 8px; letter-spacing: -0.01em; }
  .ah-sponsor-badge { position: relative; z-index: 1; display: inline-flex; align-items: center; height: 20px; padding: 0 8px; border-radius: 999px; background: linear-gradient(135deg, #e11d48 0%, #be123c 100%); color: #fff; font-size: 11px; font-weight: 750; letter-spacing: 0.02em; box-shadow: 0 4px 12px rgba(225,29,72,0.28); }
  .ah-sponsor-card p { position: relative; z-index: 1; margin: 9px 0 0; font-size: 12.5px; color: #6e6e73; line-height: 1.65; }
  .ah-sponsor-qr-wrap { position: relative; z-index: 1; margin: 16px 0 12px; display: grid; place-items: center; padding: 0; background: transparent; border: none; border-radius: 14px; overflow: hidden; box-shadow: none; transition: transform 180ms var(--ah-ease); }
  .ah-sponsor-card:hover .ah-sponsor-qr-wrap { transform: scale(1.02); }
  .ah-sponsor-qr-wrap img { width: 100%; max-width: 280px; height: auto; object-fit: contain; display: block; border-radius: 14px; box-shadow: 0 8px 24px rgba(15,23,42,0.08); }
  .ah-sponsor-qr-wrap.is-placeholder { height: auto; min-height: 240px; aspect-ratio: 1 / 1; padding: 0; background: linear-gradient(180deg, rgba(15,23,42,0.03), rgba(15,23,42,0.02)); color: #a1a1aa; font-size: 28px; font-weight: 500; border: 1px dashed rgba(15,23,42,0.10); border-radius: 14px; box-shadow: none; }
  .ah-sponsor-card small { position: relative; z-index: 1; display: block; text-align: center; font-size: 11px; color: #8e8e93; font-weight: 600; letter-spacing: 0.01em; }
  .ah-sponsor-foot { display: grid; gap: 14px; padding: 10px 4px 4px; justify-items: center; text-align: center; }
  .ah-sponsor-foot p { margin: 0; font-size: 12px; color: #8e8e93; line-height: 1.65; max-width: 520px; }
  .ah-sponsor-foot .ah-shop-btn { justify-self: center; min-width: 136px; height: 38px; border-radius: 999px; font-size: 13px; font-weight: 750; box-shadow: 0 6px 16px rgba(15,23,42,0.08); }
   @media (max-width: 560px) { .ah-sponsor-section { gap: 14px; } .ah-sponsor-hero { padding: 18px 16px; gap: 12px; border-radius: 18px; } .ah-sponsor-hero-icon { width: 42px; height: 42px; border-radius: 12px; } .ah-sponsor-grid { grid-template-columns: 1fr; gap: 12px; } .ah-sponsor-card { padding: 16px; border-radius: 16px; } .ah-sponsor-qr-wrap { padding: 0; } .ah-sponsor-qr-wrap img { width: 100%; max-width: 260px; height: auto; } .ah-sponsor-qr-wrap.is-placeholder { min-height: 220px; height: auto; } }

/* ─── 抽奖 独立分页（居中） ─── */
.ah-lottery-section { display: grid; gap: 18px; max-width: 700px; width: 100%; margin: 0 auto; align-self: center; animation: ah-materialize 260ms var(--ah-ease) both; }
.ah-lottery-hero { position: relative; display: flex; gap: 16px; align-items: center; padding: 22px 20px; border: 0.5px solid rgba(255,255,255,0.78); border-radius: 20px; background: linear-gradient(135deg, rgba(239,246,255,0.92), rgba(255,255,255,0.74)); backdrop-filter: blur(20px) saturate(160%); -webkit-backdrop-filter: blur(20px) saturate(160%); box-shadow: 0 16px 36px rgba(37,99,235,0.07), 0 6px 16px rgba(15,23,42,0.06), inset 0 1px 0 rgba(255,255,255,0.96); overflow: hidden; }
.ah-lottery-hero::before { content:""; position: absolute; inset: 0; background: radial-gradient(520px 200px at 18% 0%, rgba(37,99,235,0.07), transparent 68%), radial-gradient(360px 180px at 92% 100%, rgba(14,165,233,0.06), transparent 70%); pointer-events: none; }
.ah-lottery-hero-icon { width: 48px; height: 48px; border-radius: 14px; display: grid; place-items: center; background: linear-gradient(135deg, #ffffff 0%, #dbeafe 100%); color: #2563eb; flex-shrink: 0; box-shadow: 0 8px 20px rgba(37,99,235,0.16), inset 0 1px 0 rgba(255,255,255,1); border: 0.5px solid rgba(37,99,235,0.14); position: relative; z-index: 1; }
.ah-lottery-hero > div { position: relative; z-index: 1; min-width: 0; flex: 1; }
.ah-lottery-hero h2 { margin: 3px 0 4px; font-size: 19px; font-weight: 850; color: #1d1d1f; letter-spacing: -0.025em; line-height: 1.2; }
.ah-lottery-hero p { margin: 0; font-size: 13px; color: #6e6e73; line-height: 1.65; font-weight: 500; }
.ah-lottery-hero span { font-size: 11px; font-weight: 750; color: #2563eb; letter-spacing: 0.06em; text-transform: uppercase; }
.ah-lottery-hero-action { position: relative; z-index: 1; flex-shrink: 0; min-height: 36px; padding: 0 14px; border-radius: 999px; border: 0.5px solid rgba(37,99,235,0.18); background: rgba(255,255,255,0.82); color: #2563eb; font-size: 12px; font-weight: 750; cursor: pointer; box-shadow: 0 4px 12px rgba(37,99,235,0.10); transition: transform 150ms var(--ah-ease), background 150ms ease; }
.ah-lottery-hero-action:hover { background: #fff; transform: translateY(-1px); } .ah-lottery-hero-action:active { transform: scale(0.98); }
.ah-lottery-pity-inline { display: grid; gap: 8px; padding: 14px 16px; border-radius: 16px; border: 0.5px solid rgba(255,255,255,0.72); background: rgba(255,255,255,0.58); backdrop-filter: blur(16px) saturate(150%); box-shadow: 0 8px 20px rgba(15,23,42,0.06); }
.ah-lottery-pity-head { display: flex; justify-content: space-between; gap: 12px; font-size: 12px; font-weight: 700; color: #4b5563; } .ah-lottery-pity-head strong { color: #1d1d1f; font-weight: 800; } .ah-lottery-pity-track { height: 6px; overflow: hidden; background: #e5e7eb; border-radius: 999px; } .ah-lottery-pity-fill { height: 100%; background: #2563eb; transition: width 240ms ease; } .ah-lottery-pity-inline.is-due .ah-lottery-pity-fill { background: #b7791f; } .ah-lottery-pity-inline.is-due .ah-lottery-pity-head strong { color: #9a6700; } .ah-lottery-pity-inline.is-unavailable .ah-lottery-pity-head strong { color: #6b7280; } .ah-lottery-pity-inline p { margin: 0; font-size: 12px; color: #6e6e73; line-height: 1.5; }
.ah-lottery-skeleton { display: grid; gap: 12px; } .ah-skeleton-lottery { height: 132px; border-radius: 16px; }
.ah-lottery-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 14px; }
.ah-lottery-card { position: relative; display: flex; flex-direction: column; overflow: hidden; border-radius: 18px; border: 0.5px solid rgba(255,255,255,0.74); background: rgba(255,255,255,0.68); backdrop-filter: blur(18px) saturate(150%); -webkit-backdrop-filter: blur(18px) saturate(150%); box-shadow: 0 10px 28px rgba(15,23,42,0.07), inset 0 1px 0 rgba(255,255,255,0.92); transition: transform 180ms var(--ah-ease), box-shadow 180ms ease; }
.ah-lottery-card:hover { transform: translateY(-2px); box-shadow: 0 16px 36px rgba(15,23,42,0.10); }
.ah-lottery-cover { height: 132px; background: linear-gradient(135deg, #dbeafe, #f3e8ff); display: grid; place-items: center; color: #2563eb; overflow: hidden; } .ah-lottery-cover img { width: 100%; height: 100%; object-fit: cover; display: block; } .ah-lottery-cover.is-empty { background: linear-gradient(135deg, #e0f2fe, #f5f3ff); }
.ah-lottery-body { display: grid; gap: 8px; padding: 14px 14px 12px; flex: 1; }
.ah-lottery-top { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; } .ah-lottery-status { display: inline-flex; align-items: center; height: 20px; padding: 0 8px; border-radius: 999px; font-size: 11px; font-weight: 750; background: rgba(37,99,235,0.12); color: #2563eb; } .ah-lottery-status.drawn { background: rgba(52,199,89,0.12); color: #15803d; } .ah-lottery-status.closed { background: rgba(142,142,147,0.12); color: #6b7280; } .ah-lottery-joined { display: inline-flex; height: 20px; padding: 0 8px; border-radius: 999px; background: #dcfce7; color: #15803d; font-size: 11px; font-weight: 700; } .ah-lottery-pity-badge { display: inline-flex; height: 20px; padding: 0 7px; border-radius: 999px; background: linear-gradient(135deg, #f59e0b, #d97706); color: #fff; font-size: 11px; font-weight: 750; box-shadow: 0 3px 8px rgba(217,119,6,0.24); }
.ah-lottery-body h3 { margin: 0; font-size: 15px; font-weight: 800; color: #1d1d1f; letter-spacing: -0.01em; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .ah-lottery-prize { margin: 0; font-size: 12.5px; color: #2563eb; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .ah-lottery-meta { display: flex; gap: 10px; font-size: 11px; color: #8e8e93; font-weight: 600; }
.ah-lottery-actions { display: flex; gap: 8px; align-items: center; margin-top: 2px; } .ah-lottery-join { flex: 1; min-height: 36px; font-size: 13px; } .ah-lottery-joined-btn { flex: 1; min-height: 36px; background: rgba(22,163,74,0.10) !important; color: #15803d !important; box-shadow: none !important; cursor: default; } .ah-lottery-link { min-height: 36px; padding: 0 12px; border: none; background: transparent; color: #6b7280; font-size: 12px; font-weight: 700; cursor: pointer; } .ah-lottery-link:hover { color: #1d1d1f; }
.ah-lottery-foot { display: grid; gap: 12px; justify-items: center; text-align: center; padding: 8px 4px 0; } .ah-lottery-foot p { margin: 0; font-size: 12px; color: #8e8e93; }
@media (max-width: 560px) { .ah-lottery-section { gap: 14px; } .ah-lottery-hero { padding: 18px 16px; gap: 12px; border-radius: 18px; flex-wrap: wrap; } .ah-lottery-hero-icon { width: 42px; height: 42px; border-radius: 12px; } .ah-lottery-hero-action { width: 100%; justify-content: center; } .ah-lottery-grid { grid-template-columns: 1fr; } .ah-lottery-cover { height: 148px; } }

/* ─── 赞助 竖屏精细化 ─── */
@media (orientation: portrait) and (max-width: 560px) {
  .ah-sponsor-section { gap: 16px; padding-bottom: env(safe-area-inset-bottom, 0); }
  .ah-sponsor-hero { flex-direction: column; align-items: center; text-align: center; padding: 20px 16px; gap: 10px; }
  .ah-sponsor-hero > div { text-align: center; }
  .ah-sponsor-hero p { text-align: center; }
  .ah-sponsor-card { text-align: center; }
  .ah-sponsor-card h3 { justify-content: center; }
  .ah-sponsor-card p { text-align: center; }
  .ah-sponsor-qr-wrap img { max-width: 280px; }
  .ah-lottery-section { gap: 16px; padding-bottom: env(safe-area-inset-bottom, 0); }
  .ah-lottery-hero { flex-direction: column; align-items: center; text-align: center; padding: 20px 16px; gap: 10px; }
  .ah-lottery-hero > div { text-align: center; }
  .ah-lottery-hero p { text-align: center; }
  .ah-lottery-hero-action { width: 100%; }
  .ah-lottery-grid { grid-template-columns: 1fr; }
}
@media (orientation: portrait) and (min-width: 561px) and (max-width: 768px) {
  .ah-sponsor-section { max-width: 640px; }
  .ah-sponsor-grid { grid-template-columns: 1fr; }
  .ah-lottery-section { max-width: 640px; }
  .ah-lottery-grid { grid-template-columns: 1fr; }
}

/* ─── 赞助 横屏精细化 ─── */
@media (orientation: landscape) and (max-height: 600px) {
  .ah-sponsor-section { max-width: 860px; gap: 12px; }
  .ah-sponsor-hero { padding: 14px 16px; gap: 12px; border-radius: 16px; }
  .ah-sponsor-hero-icon { width: 36px; height: 36px; border-radius: 10px; }
  .ah-sponsor-hero h2 { font-size: 16px; }
  .ah-sponsor-hero p { font-size: 12px; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .ah-sponsor-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .ah-sponsor-card { padding: 14px; }
  .ah-sponsor-qr-wrap { margin: 8px 0 8px; }
  .ah-sponsor-qr-wrap img { max-width: min(220px, 38vh); }
  .ah-sponsor-qr-wrap.is-placeholder { min-height: min(220px, 38vh); }
  .ah-sponsor-foot { gap: 8px; padding: 6px 0 0; }
  .ah-sponsor-foot p { font-size: 11px; }
  .ah-lottery-section { max-width: 860px; gap: 12px; }
  .ah-lottery-hero { padding: 14px 16px; gap: 12px; border-radius: 16px; }
  .ah-lottery-hero-icon { width: 36px; height: 36px; border-radius: 10px; }
  .ah-lottery-hero h2 { font-size: 16px; }
  .ah-lottery-hero p { font-size: 12px; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .ah-lottery-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .ah-lottery-card { border-radius: 16px; }
  .ah-lottery-cover { height: 110px; }
  .ah-lottery-foot { gap: 8px; padding: 6px 0 0; }
}
@media (orientation: landscape) and (max-height: 500px) {
  .ah-sponsor-hero p { display: none; }
  .ah-sponsor-card p { display: none; }
  .ah-sponsor-card small { display: none; }
  .ah-sponsor-qr-wrap { margin: 6px 0 4px; }
  .ah-lottery-hero p { display: none; }
  .ah-lottery-prize { display: none; }
  .ah-lottery-meta { display: none; }
}

@media (max-height: 560px) and (orientation: landscape) {
  .ah-hub-card { padding: 13px 16px 10px; }
  .ah-top-row { padding-bottom: 10px; }
  .ah-avatar { width: 40px; height: 40px; font-size: 16px; }
  .ah-tab-groups { gap: 14px; }
  .ah-tab { min-height: 34px; }
  .ah-overview { gap: 10px; }
  .ah-overview-heading { padding-top: 0; }
  .ah-overview-heading h2 { font-size: 19px; }
  .ah-overview-summary.has-points-card { grid-template-columns: minmax(0, .9fr) minmax(0, 1.1fr); }
  .ah-overview-insights { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ah-overview-summary.has-points-card .ah-overview-insights { grid-template-columns: 1fr; }
  .ah-overview-primary,
  .ah-overview-membership { min-height: 118px; padding: 14px; }
  .ah-smart-focus { min-height: 92px; padding: 14px; }
  .ah-smart-columns { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ah-smart-section { padding: 14px; }
}

@media (prefers-reduced-transparency: reduce) {
  .ah-hub-card,
  .ah-smart-focus,
  .ah-smart-section,
  .ah-overview-primary,
  .ah-overview-membership,
  .ah-membership-card,
  .ah-empty-state,
  .ah-ledger-item,
  .ah-order-item,
  .ah-gift-card,
  .ah-gift-status-panel,
  .ah-gift-history-item {
    background: rgba(255, 255, 255, 0.94);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }
  :global(.user-space-page[data-theme="dark"]) .ah-hub-card,
  :global(.user-space-page[data-theme="dark"]) .ah-smart-focus,
  :global(.user-space-page[data-theme="dark"]) .ah-smart-section,
  :global(.user-space-page[data-theme="dark"]) .ah-overview-membership,
  :global(.user-space-page[data-theme="dark"]) .ah-membership-card,
  :global(.user-space-page[data-theme="dark"]) .ah-empty-state,
  :global(.user-space-page[data-theme="dark"]) .ah-ledger-item,
  :global(.user-space-page[data-theme="dark"]) .ah-order-item,
  :global(.user-space-page[data-theme="dark"]) .ah-gift-card,
  :global(.user-space-page[data-theme="dark"]) .ah-gift-status-panel,
  :global(.user-space-page[data-theme="dark"]) .ah-gift-history-item { background: #1c1e24; }
}

.ah-cards-section { display: grid; gap: 18px; max-width: 620px; width: 100%; margin: 0 auto; }
.ah-cards-heading span, .ah-fulfillment-heading span { color: #377f76; font-size: 12px; font-weight: 760; }.ah-cards-heading span { color: #b7667e; }
.ah-cards-heading h2, .ah-fulfillment-heading h2 { margin: 5px 0 6px; color: #1d1d1f; font-size: 22px; letter-spacing: 0; }
.ah-cards-heading p, .ah-fulfillment-heading p { margin: 0; color: #68727b; font-size: 13px; line-height: 1.6; }
.ah-skin-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.ah-skin-option { min-height: 126px; padding: 12px; border: 1px solid rgba(23, 45, 59, .12); border-radius: 14px; background: rgba(255,255,255,.58); color: #1d1d1f; text-align: left; cursor: pointer; }.ah-skin-option:disabled { cursor: default; opacity: .72; }
.ah-skin-option.active { border-color: #2f887a; box-shadow: 0 0 0 2px rgba(47,136,122,.16); }.ah-skin-option.is-cats-skin.active { border-color: #d77f96; box-shadow: 0 0 0 2px rgba(215,127,150,.18); }.ah-skin-option strong, .ah-skin-option small { display: block; }.ah-skin-option strong { margin-top: 11px; font-size: 13px; }.ah-skin-option small { margin-top: 3px; color: #75808a; font-size: 11px; }
.ah-skin-preview { display: flex; align-items: center; justify-content: center; width: 100%; height: 45px; border-radius: 9px; overflow: hidden; }.ah-skin-preview.is-blank { background: #eaf0f1; color: #315b68; }.ah-skin-preview.is-cats { position: relative; background: #fff; }.ah-skin-preview.is-cats img { width: 28px; height: 28px; flex: 0 0 28px; object-fit: contain; margin-left: -13px; filter: drop-shadow(0 2px 2px rgba(113,65,77,.12)); }.ah-skin-preview.is-cats img:first-child { margin-left: 0; }.ah-skin-preview.is-custom { background: #e8ebf2; color: #526179; }
.ah-card-presets { display: grid; gap: 10px; }.ah-card-presets-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; color: #3d4852; font-size: 13px; font-weight: 760; }.ah-card-presets-heading small { color: #7a858e; font-size: 11px; font-weight: 650; }.ah-card-presets-loading, .ah-card-presets-empty { min-height: 76px; display: grid; place-items: center; border: 1px dashed rgba(23, 45, 59, .18); border-radius: 14px; color: #7a858e; font-size: 12px; }.ah-card-preset-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }.ah-card-preset { position: relative; min-width: 0; padding: 4px; border: 1px solid rgba(23, 45, 59, .13); border-radius: 14px; background: rgba(255,255,255,.58); }.ah-card-preset.active { border-color: #2f887a; box-shadow: 0 0 0 2px rgba(47,136,122,.16); }.ah-card-preset-select { display: grid; width: 100%; gap: 7px; padding: 0; border: 0; background: transparent; color: #26323b; cursor: pointer; text-align: left; font: inherit; font-size: 11px; font-weight: 700; }.ah-card-preset-select img { display: block; width: 100%; aspect-ratio: 8 / 5; border-radius: 10px; object-fit: cover; background: #e8ebf2; }.ah-card-preset-select > span { padding: 0 4px 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.ah-card-preset-delete { position: absolute; top: 10px; right: 10px; display: grid; width: 28px; height: 28px; place-items: center; padding: 0; border: 1px solid rgba(255,255,255,.78); border-radius: 10px; background: rgba(255,255,255,.84); color: #a24444; cursor: pointer; box-shadow: 0 5px 12px rgba(25,37,49,.14); }.ah-card-preset-delete:hover { background: #fff; }.ah-card-presets-retention { margin: 0; color: #7a858e; font-size: 11px; line-height: 1.5; }
.ah-fulfillment-section { display: grid; gap: 15px; }.ah-current-gift-card { margin: 0; }.ah-fulfillment-records { padding: 16px; border: 1px solid rgba(18, 38, 50, .1); border-radius: 18px; background: rgba(255,255,255,.58); }.ah-fulfillment-records-head { display: flex; align-items: end; justify-content: space-between; gap: 14px; margin-bottom: 12px; }.ah-fulfillment-records-head > div:first-child > span { color: #377f76; font-size: 12px; font-weight: 760; }.ah-fulfillment-records-head h3 { margin: 4px 0 0; color: #1d1d1f; font-size: 16px; font-weight: 760; }.ah-record-filter { display: inline-flex; gap: 2px; padding: 3px; border-radius: 10px; background: rgba(18, 38, 50, .07); }.ah-record-filter button { min-width: 42px; min-height: 30px; padding: 0 9px; border: 0; border-radius: 8px; background: transparent; color: #68727b; font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; }.ah-record-filter button.active { background: rgba(255,255,255,.9); box-shadow: 0 1px 5px rgba(15, 23, 42, .12); color: #1d1d1f; }.ah-fulfillment-record-list { display: grid; }.ah-fulfillment-record { display: flex; align-items: center; gap: 11px; min-width: 0; padding: 12px 0; }.ah-fulfillment-record + .ah-fulfillment-record { border-top: 1px solid rgba(18, 38, 50, .08); }.ah-fulfillment-record-icon { display: grid; width: 34px; height: 34px; place-items: center; flex: 0 0 auto; border-radius: 12px; }.ah-fulfillment-record-icon.gift { background: rgba(183, 102, 126, .12); color: #ad526f; }.ah-fulfillment-record-icon.order { background: rgba(35, 121, 108, .12); color: #23796c; }.ah-fulfillment-record-copy { display: grid; min-width: 0; gap: 3px; flex: 1; }.ah-fulfillment-record-copy strong { overflow: hidden; color: #1d1d1f; font-size: 13px; font-weight: 750; text-overflow: ellipsis; white-space: nowrap; }.ah-fulfillment-record-copy span, .ah-fulfillment-record-side > span:first-child { overflow: hidden; color: #78808d; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }.ah-fulfillment-record-side { display: grid; justify-items: end; gap: 4px; min-width: 68px; }.ah-fulfillment-record-points { color: #b45309; font-size: 11px; font-weight: 750; white-space: nowrap; }.ah-fulfillment-partial-error { margin: 12px 0 0; color: #b45309; font-size: 12px; }.ah-fusion-block { padding: 15px; border: 1px solid rgba(18, 38, 50, .1); border-radius: 18px; background: rgba(255,255,255,.58); }.ah-fusion-block-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; color: #1d1d1f; font-weight: 760; }.ah-fusion-block-head > span { display: inline-flex; align-items: center; gap: 7px; }.ah-fusion-block-head button, .ah-inline-empty button { border: 0; background: transparent; color: #23796c; font: inherit; font-size: 12px; cursor: pointer; }.ah-inline-empty { padding: 16px 4px; color: #74808a; font-size: 13px; }
:global(.user-space-page[data-theme="dark"]) .ah-cards-heading h2, :global(.user-space-page[data-theme="dark"]) .ah-fulfillment-heading h2, :global(.user-space-page[data-theme="dark"]) .ah-fulfillment-records-head h3, :global(.user-space-page[data-theme="dark"]) .ah-fulfillment-record-copy strong, :global(.user-space-page[data-theme="dark"]) .ah-skin-option, :global(.user-space-page[data-theme="dark"]) .ah-card-presets-heading, :global(.user-space-page[data-theme="dark"]) .ah-card-preset-select, :global(.user-space-page[data-theme="dark"]) .ah-fusion-block-head { color: #f4f7f8; }.ah-skin-option, .ah-card-preset, .ah-fusion-block { background: rgba(255,255,255,.58); }:global(.user-space-page[data-theme="dark"]) .ah-skin-option, :global(.user-space-page[data-theme="dark"]) .ah-card-preset, :global(.user-space-page[data-theme="dark"]) .ah-fusion-block, :global(.user-space-page[data-theme="dark"]) .ah-fulfillment-records { background: rgba(28,30,36,.72); border-color: rgba(255,255,255,.1); }:global(.user-space-page[data-theme="dark"]) .ah-record-filter { background: rgba(255,255,255,.1); }:global(.user-space-page[data-theme="dark"]) .ah-record-filter button { color: #a7acb5; }:global(.user-space-page[data-theme="dark"]) .ah-record-filter button.active { background: rgba(255,255,255,.14); color: #f4f7f8; box-shadow: none; }:global(.user-space-page[data-theme="dark"]) .ah-fulfillment-record + .ah-fulfillment-record { border-top-color: rgba(255,255,255,.09); }:global(.user-space-page[data-theme="dark"]) .ah-card-presets-loading, :global(.user-space-page[data-theme="dark"]) .ah-card-presets-empty { border-color: rgba(255,255,255,.18); color: #a7acb5; }:global(.user-space-page[data-theme="dark"]) .ah-card-preset-delete { border-color: rgba(255,255,255,.18); background: rgba(28,30,36,.9); color: #ff9ca9; }
@media (max-width: 560px) { .ah-skin-grid { grid-template-columns: 1fr; }.ah-skin-option { min-height: 82px; display: grid; grid-template-columns: 70px 1fr; align-content: center; column-gap: 12px; }.ah-skin-option strong, .ah-skin-option small { grid-column: 2; }.ah-skin-option strong { margin-top: 0; }.ah-skin-preview { grid-row: 1 / span 2; height: 50px; }.ah-card-preset-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }

@media (prefers-reduced-motion: reduce) {
  .ah-panel-enter-active,
  .ah-panel-leave-active,
  .ah-icon-swap-enter-active,
  .ah-icon-swap-leave-active {
    transition: opacity 120ms ease !important;
  }
  .ah-panel-enter-from,
  .ah-panel-leave-to,
  .ah-icon-swap-enter-from,
  .ah-icon-swap-leave-to {
    filter: none !important;
    transform: none !important;
  }
  .ah-section,
  .ah-points-block,
  .ah-tab,
  .ah-tab-icon,
  .ah-tab-label,
  .ah-gift-thumb,
  .ah-gift-status-icon,
  .ah-gift-copy,
  .ah-gift-card,
  .ah-gift-history-item,
  .ah-smart-focus,
  .ah-smart-focus-icon,
  .ah-smart-focus-action svg,
  .ah-smart-section-head button,
  .ah-smart-activity,
  .ah-smart-activity > svg,
  .ah-smart-next,
  .ah-smart-next-icon,
  .ah-smart-next > svg,
  .ah-icon-command,
  .ah-ledger-item,
  .ah-order-item {
    animation: none !important;
    transition: opacity 150ms ease, color 150ms ease, background-color 150ms ease !important;
    transform: none !important;
  }
}
</style>
