<template>
  <!-- ⚠️ 2026-10-26 重做：**七段页签全部删除**（概览/装扮/积分/订阅/订单/抽奖/赞助）。
       判断依据：七个对象不在同一量级 —— 其中四个（概览、积分管理、抽奖、赞助）
       只是首页内容的重复入口，于是每个页签都填不满一屏，只能靠留白和装饰性标题撑高度。
       现在是「一屏首页 + 三个二级页」，二级页在本页内切换、不跳路由。 -->
  <div class="profile-subpage-shell ah-page">
    <!-- 摘要条：全页唯一常驻信息（身份 + 会员状态 + 余额），点余额进明细。
         原来的顶卡把「头像 + UID + 积分 + 七段页签」叠成一块，现在只留前三样。 -->
    <header class="ah-summary">
      <FramedAvatar
        :src="avatarUrl"
        :initial="displayInitial"
        :size="40"
        alt="头像"
        :frame-url="avatarFrame.url"
        :ring="avatarFrame.url ? '' : avatarFrame.ring"
        :frame-scale="avatarFrame.scale || 0"
      />
      <div class="ah-summary-id">
        <div class="ah-summary-name-row">
          <span class="ah-summary-name">{{ displayName }}</span>
          <span v-if="tierCode" class="tier-badge" :class="`tier-${tierCode}`">{{
            tierDisplayName
          }}</span>
        </div>
        <span class="ah-summary-meta">{{ summaryMetaText }}</span>
      </div>
      <button
        type="button"
        class="ah-summary-points"
        aria-label="查看积分明细"
        @click="openView('points')"
      >
        <span>积分</span>
        <strong>{{ pointsDisplay }}</strong>
        <ChevronRight :size="15" :stroke-width="2" aria-hidden="true" />
      </button>
    </header>

    <!-- ═══ 首页 ═══ -->
    <div v-if="view === 'home'" class="ah-home">
      <section class="ah-panel ah-wallet" aria-label="积分余额">
        <div class="ah-panel-head">
          <span>积分余额</span>
          <button type="button" class="ah-link-btn" @click="openView('points')">全部明细</button>
        </div>
        <div class="ah-wallet-value">{{ pointsDisplay }}</div>
        <p class="ah-wallet-note">{{ walletNote }}</p>
        <div class="ah-wallet-actions">
          <button type="button" class="ah-btn is-primary" @click="isRechargeOpen = true">
            充值积分
          </button>
          <button type="button" class="ah-btn" @click="goToShop">去商城兑换</button>
        </div>
        <div v-if="recentLedger.length" class="ah-wallet-recent">
          <button
            v-for="item in recentLedger"
            :key="item.key"
            type="button"
            class="ah-wallet-row"
            @click="openView('points')"
          >
            <span class="ah-wallet-row-title"
              >{{ item.title }}<small v-if="item.remark">{{ item.remark }}</small></span
            >
            <span
              class="ah-wallet-amount"
              :class="{ negative: item.amount < 0, zero: item.amount === 0 }"
              >{{ item.amount > 0 ? '+' : '' }}{{ item.amount }}</span
            >
          </button>
        </div>
      </section>

      <section class="ah-panel ah-member" aria-label="会员">
        <div class="ah-panel-head">
          <span>会员</span>
          <button type="button" class="ah-link-btn" @click="togglePlans">
            {{ planButtonText }}
          </button>
        </div>
        <div class="ah-member-name">
          {{ subscriptionDisplayName }}
          <span class="ah-member-state" :class="{ 'is-free': !activeSubscription }">{{
            activeSubscription ? '生效中' : '免费版'
          }}</span>
        </div>
        <p class="ah-member-expiry">{{ subscriptionExpiryText }}</p>
        <div class="ah-member-chips">
          <span>Cloud+ {{ cloudImageLimit }} 张</span>
          <span v-if="activeSubscription">{{
            activeSubscription.billingCycle === 'yearly' ? '年度订阅' : '月度订阅'
          }}</span>
          <span v-if="annualGiftLabel">{{ annualGiftLabel }}</span>
        </div>

        <div v-if="pityStatus" class="ah-pity" :class="{ 'is-due': pityStatus.isDue }">
          <div class="ah-pity-head">
            <span>抽奖保底</span><strong>{{ pityProgressLabel }}</strong>
          </div>
          <div
            v-if="pityStatus.eligible"
            class="ah-pity-track"
            role="progressbar"
            aria-label="连续未中奖进度"
            :aria-valuenow="pityStatus.consecutiveLosses"
            :aria-valuemin="0"
            :aria-valuemax="pityStatus.threshold"
          >
            <div class="ah-pity-fill" :style="{ width: `${pityProgressPercent}%` }"></div>
          </div>
          <p>{{ pityProgressDescription }}</p>
        </div>
      </section>

      <!-- 方案对比不塞进会员卡：SubscriptionPlans 是整页组件（hero + 对比表），
           半栏里会挤成一条。展开时独占一行，位置就贴在会员卡下面。 -->
      <section v-if="showPlanComparison" class="ah-plans" aria-label="会员方案">
        <SubscriptionPlans />
      </section>

      <section class="ah-panel ah-decor-card" aria-label="装扮">
        <div class="ah-panel-head">
          <span>装扮</span>
          <button type="button" class="ah-link-btn" @click="openView('decor')">管理</button>
        </div>
        <div class="ah-decor-preview">
          <FramedAvatar
            :src="avatarUrl"
            :initial="displayInitial"
            :size="46"
            alt="当前装扮"
            :frame-url="avatarFrame.url"
            :ring="avatarFrame.url ? '' : avatarFrame.ring"
            :frame-scale="avatarFrame.scale || 0"
          />
          <div class="ah-decor-copy">
            <strong>{{ frameStatusText }}</strong>
            <span>积分卡面 · {{ skinLabel }}</span>
          </div>
          <button type="button" class="ah-btn" @click="openView('decor')">换装</button>
        </div>
      </section>

      <section class="ah-panel ah-todo" aria-label="待办">
        <div class="ah-panel-head">
          <span>待办</span>
          <span v-if="todoItems.length" class="ah-todo-count">{{ todoItems.length }}</span>
        </div>
        <div v-if="todoItems.length" class="ah-todo-list">
          <button
            v-for="item in todoItems"
            :key="item.id"
            type="button"
            class="ah-todo-item"
            @click="handleTodo(item)"
          >
            <span class="ah-todo-icon" :class="`tone-${item.tone}`">
              <component :is="item.icon" :size="16" :stroke-width="1.8" aria-hidden="true" />
            </span>
            <span class="ah-todo-copy">
              <strong>{{ item.title }}</strong>
              <small>{{ item.detail }}</small>
            </span>
            <ChevronRight :size="15" :stroke-width="2" aria-hidden="true" />
          </button>
        </div>
        <p v-else class="ah-todo-empty">
          <Check :size="15" :stroke-width="2.3" aria-hidden="true" /> 账户一切就绪，没有待处理事项
        </p>
      </section>

      <!-- 两个外链入口（2026-10-26）：抽奖与赞助原先各占一个页签，实际都是「跳出去」的动作，
           不值得和积分余额平级。收成一行文字。 -->
      <nav class="ah-links" aria-label="更多入口">
        <button type="button" @click="goToLotteries">
          <span class="ah-links-label">
            <Ticket :size="16" :stroke-width="1.8" aria-hidden="true" /> 社区抽奖
          </span>
          <span class="ah-links-side"
            >去看看<ChevronRight :size="14" :stroke-width="2" aria-hidden="true"
          /></span>
        </button>
        <button type="button" @click="$emit('sponsor')">
          <span class="ah-links-label">
            <Heart :size="16" :stroke-width="1.8" aria-hidden="true" /> 赞助方块之家
          </span>
          <span class="ah-links-side"
            >支持社区<ChevronRight :size="14" :stroke-width="2" aria-hidden="true"
          /></span>
        </button>
      </nav>
    </div>

    <!-- ═══ 二级页（本页内切换，不跳路由） ═══ -->
    <section v-else class="ah-subpage" :class="`is-${view}`">
      <div class="ah-subpage-bar">
        <button type="button" class="ah-back" @click="openView('home')">
          <ChevronLeft :size="17" :stroke-width="2" aria-hidden="true" /> 资产
        </button>
        <span class="ah-subpage-title">{{ subpageTitle }}</span>
        <button
          v-if="view === 'orders'"
          type="button"
          class="ah-icon-command"
          title="刷新礼物与订单"
          aria-label="刷新礼物与订单"
          @click="refreshFulfillment"
        >
          <RefreshCw :size="17" :stroke-width="2" aria-hidden="true" />
        </button>
      </div>

      <!-- 装扮：头像框 + 积分卡面（原「装扮」页签内容，去掉自己的标题） -->
      <div v-if="view === 'decor'" class="ah-decor">
        <AvatarFrameGrid :avatar-url="avatarUrl" :tier-code="tierCode" @unlock="openPlans" />

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
              <span class="ah-skin-preview is-blank"><Coins :size="18" :stroke-width="1.8" /></span
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
                ><img v-for="cat in catSkinPreviewAssets" :key="cat.id" :src="cat.src" alt=""
              /></span>
              <strong>全员小猫</strong
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
              ><strong>添加卡面</strong>
              <!-- 禁用必须给原因：满员时原样只写「上传并裁切」，用户不知道为什么点不动 -->
              <small v-if="isPointsCardPresetQuotaLoading">检查额度…</small>
              <small v-else-if="!canAddPointsCardPreset"
                >{{ pointsCardPresets.length }} / {{ pointsCardPresetCapacity }} · 删除后可加</small
              >
              <small v-else>上传并裁切</small>
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
      </div>

      <!-- 订单与地址：原来的「订单」页签，去掉自己的页头（返回条已说明这是哪一页） -->
      <div v-else-if="view === 'orders'" class="ah-fulfillment-section">
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
                ><span v-else class="ah-fulfillment-record-points">-{{ record.points }} 积分</span>
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
      </div>

      <!-- 积分明细：原来「积分」页签的下半段（两张操作卡已上移到首页钱包卡） -->
      <div v-else-if="view === 'points'" class="ah-points-subpage">
        <div class="ah-points-summary">
          <div>
            <span>当前积分</span>
            <strong>{{ pointsDisplay }}</strong>
          </div>
          <button type="button" class="ah-btn" @click="isRechargeOpen = true">充值积分</button>
        </div>
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
      </div>
    </section>

    <!-- 充值二维码（首页与积分明细的「充值」共用）
         ⚠️ **必须 Teleport 到 body**：遮罩是 `position: fixed`，而它的祖先
         （`.ah-page` 与宿主 `.tab-page`）都带着入场动画收尾留下的
         `transform: matrix(1,0,0,1,0,0)` —— 即使矩阵是单位矩阵，`transform != none`
         也会让 fixed 改成「相对该祖先定位」（规范行为，不是 bug）。
         实测 1440×900：遮罩只有 1131×600 @(275,0)，右侧与底部整条露出背景，
         用户读到的就是「弹窗没盖住页面」。
         Teleport 出去之后暗色覆盖**不能再用** `.user-space-page[data-theme='dark']`
         前缀（节点已不在页根里），必须换 `html[data-theme='dark']`。 -->
    <Teleport to="body">
      <Transition name="ah-qr-modal">
        <div v-if="isRechargeOpen" class="ah-qr-overlay" @click.self="isRechargeOpen = false">
          <section
            class="ah-qr-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="recharge-points-title"
          >
            <button
              ref="rechargeCloseRef"
              type="button"
              class="ah-qr-close"
              aria-label="关闭充值积分"
              @click="isRechargeOpen = false"
            >
              <X :size="17" :stroke-width="2" aria-hidden="true" />
            </button>
            <span class="ah-qr-kicker">充值积分</span>
            <h2 id="recharge-points-title">扫码联系管理员</h2>
            <p>请使用微信扫描收款码，备注你的 UID，管理员确认后将为你充值积分。</p>
            <div class="ah-qr-frame">
              <img :src="sponsorQrImage" alt="积分充值收款二维码" class="ah-recharge-qr" />
            </div>
            <span class="ah-qr-uid">UID · {{ uidShort }}</span>
          </section>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue';
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import {
  CalendarCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  Coins,
  Crown,
  Gift,
  Heart,
  ImagePlus,
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
  X,
} from 'lucide-vue-next';
import SubscriptionPlans from '@/components/SubscriptionPlans.vue';
import AddressManager from '@/components/AddressManager.vue';
import sponsorQrImage from '@/assets/images/qrcode.webp';
import { useAuthStore } from '@/stores/auth';
import { supabase } from '@/utils/supabase-client.js';
import { useUserTier } from '@/composables/useUserTier.js';
import { PLAN_DISPLAY_NAMES } from '@/utils/subscription-benefits.js';
import { getExpiredActiveGiftIds, markGiftsAsHistory } from '@/utils/gift-archive.js';
import { logger } from '@/utils/logger.js';
import { getMyLotteryPityStatus, getMySubscriptions } from '@/utils/api/subscription-api.js';
import PointsCard from './PointsCard.vue';
import AvatarFrameGrid from './AvatarFrameGrid.vue';
import FramedAvatar from './FramedAvatar.vue';
import { useAvatarFrame } from '@/composables/useAvatarFrame.js';
import { HOME_CAT_ASSETS } from '@/utils/home-cat-theme.js';
import { resolveDbCardImage } from '@/utils/db-image-url.js';

const emit = defineEmits([
  'upload-points-card',
  'set-points-card-skin',
  'select-points-card-preset',
  'delete-points-card-preset',
  'redeem-points-card-cats',
  'sponsor',
  'load-points-card-data',
  // 视图切换统一上报（含 onMounted 的初始档）：宿主据此把 ?panel= 写进 URL。
  // 值域保证 = VIEW_IDS（openView 有归一），宿主无需再校验。
  'view-change',
]);

const props = defineProps({
  initialView: { type: String, default: '' },
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

/* ---------- 视图（2026-10-26 重做：七段页签全部删除） ----------
   只剩「一屏首页 + 三个二级页」。删除的依据：七个页签里有四个（概览 / 积分管理 /
   抽奖 / 赞助）并不承载独立内容 —— 概览就是首页，积分管理只有两张入口卡，
   抽奖与赞助是「跳出去」的动作。留着它们的结果是每个页签都填不满一屏。

   值域与旧值映射放在这里（单一真源），宿主只透传 URL 的 ?panel=：
     · overview / lottery / sponsor / subscription → home（订阅方案改为首页内联展开）
     · cards → decor（我页积分卡的「设置卡面」按钮仍发这个旧值）
     · gifts / addresses / fulfillment → orders */
const VIEW_IDS = new Set(['home', 'decor', 'orders', 'points']);
const LEGACY_VIEW_MAP = {
  overview: 'home',
  subscription: 'home',
  lottery: 'home',
  sponsor: 'home',
  cards: 'decor',
  fulfillment: 'orders',
  gifts: 'orders',
  addresses: 'orders',
};
const normalizeView = (value) => {
  const raw = String(value || '').trim();
  const mapped = LEGACY_VIEW_MAP[raw] || raw;
  return VIEW_IDS.has(mapped) ? mapped : 'home';
};
const view = ref(normalizeView(props.initialView));
const SUBPAGE_TITLES = { decor: '装扮', orders: '订单与地址', points: '积分明细' };
const subpageTitle = computed(() => SUBPAGE_TITLES[view.value] || '');

const avatarUrl = computed(() => String(userInfo.value?.avatarUrl || '').trim());
const displayName = computed(() => String(userInfo.value?.username || '').trim() || '未命名用户');
const displayInitial = computed(() => displayName.value.charAt(0).toUpperCase());
const uidShort = computed(() => String(userInfo.value?.id || '').slice(0, 8));

// 顶卡头像戴框：状态单源 useAvatarFrame（装扮页换框时此处实时同步）
const { effectiveFrame: avatarFrame } = useAvatarFrame(tierCode);

const ordersLoading = ref(false);
const ordersLoaded = ref(false);
const ordersError = ref('');
const orders = ref([]);
const ledgerLoading = ref(false);
const ledgerLoaded = ref(false);
const ledgerError = ref('');
const ledger = ref([]);
const isRechargeOpen = ref(false);
/** 充值弹窗的关闭按钮：打开时把焦点移进来（role="dialog" + aria-modal 的语义要求） */
const rechargeCloseRef = ref(null);
/**
 * 模态必须能键盘退出（2026-10-27 实测缺口：Esc 原本无效，只能点关闭按钮或遮罩）。
 * 监听挂 document 而不是组件根 —— 遮罩已 Teleport 到 body，键盘事件不经过组件 DOM。
 */
let rechargePrevFocus = null;
const handleRechargeKeydown = (event) => {
  if (event.key !== 'Escape' || !isRechargeOpen.value) return;
  isRechargeOpen.value = false;
};
watch(isRechargeOpen, (open) => {
  if (open) {
    rechargePrevFocus = document.activeElement;
    document.addEventListener('keydown', handleRechargeKeydown);
    void nextTick(() => rechargeCloseRef.value?.focus?.());
    return;
  }
  document.removeEventListener('keydown', handleRechargeKeydown);
  // 关闭后焦点归还触发按钮；节点已卸载（切去赞助子页）时跳过
  if (rechargePrevFocus?.isConnected) rechargePrevFocus.focus?.();
  rechargePrevFocus = null;
});
onBeforeUnmount(() => document.removeEventListener('keydown', handleRechargeKeydown));
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

const recentPointsNet = computed(() =>
  ledger.value
    .filter((item) => isWithinDays(item.time, 30))
    .reduce((sum, item) => sum + (Number(item.amount) || 0), 0),
);

/* 首页钱包卡的一行说明。原先这里挂着一整套「可兑换 N 件 / 距下一件还差 X 积分」的
   商品推荐，为它单个功能要拉一次 products 表 —— 商品推荐属于商城，不属于资产页。
   现在只讲余额本身：近 30 天净变化，拿不到明细就不写。 */
const walletNote = computed(() => {
  if (!ledgerLoaded.value && ledgerLoading.value) return '正在读取积分变动';
  if (recentPointsNet.value !== 0)
    return `近 30 天 ${recentPointsNet.value > 0 ? '+' : ''}${recentPointsNet.value}`;
  return '积分可用于商城兑换与卡面解锁';
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

/* 首页钱包卡顺带列出最近三笔（明细页是完整列表）：
   用户的第一个问题永远是「怎么少了/多了」，一行变动比一句「查看明细」有用。 */
const recentLedger = computed(() => ledger.value.slice(0, 3));

const retryLedger = () => {
  ledgerLoaded.value = false;
  void loadLedger();
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

/* 视图切换：内部点击 / 外部驱动（?panel=）/ 挂载初始化都汇到这里。
   每个视图自己负责取数；取数函数都带 loaded 闩锁，重复进入不重复请求。 */
const openView = (next) => {
  const target = normalizeView(next);
  view.value = target;
  // 上报宿主（URL ?panel= 的唯一写入源）。宿主端有「与 URL 同值即忽略」守卫，不构成循环。
  emit('view-change', target);
  if (target === 'home') void loadHome();
  if (target === 'decor') emit('load-points-card-data');
  if (target === 'orders') {
    void loadOrders();
    void loadGifts();
  }
  if (target === 'points') void loadLedger();
};

// 外部驱动：宿主从 URL ?panel= 派生后经 initial-view 传入。组件保活期间 props 变化必须生效，
// 否则「深链直达 / 设置页资产行跳转」只在首访有效。归一化仍走 normalizeView（本组件是值域单一真源）。
watch(
  () => props.initialView,
  () => {
    const next = normalizeView(props.initialView);
    if (next !== view.value) openView(next);
  },
);

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

const getGiftStatusLabel = (s) => {
  const map = {
    preparing: '备货中',
    processing: '正在处理',
    shipped: '已发货',
    completed: '已完成',
  };
  return map[s] || s;
};

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

const refreshFulfillment = () => {
  ordersLoaded.value = false;
  giftsLoaded.value = false;
  void loadOrders();
  void loadGifts();
};

/* ═══ 首页派生数据（2026-10-26） ═══
   摘要条 + 四张卡各取所需，不再合成「智能洞察」。原来那套引擎（候选池 → 排序 →
   主洞察 → 最近动态 → 接下来）产出的是三段话术，用户要的只是余额、会员、待办。 */

/** 摘要条副标题：会员状态一句话（悬空时给免费版口径） */
const summaryMetaText = computed(() => {
  if (subscriptionLoading.value) return '正在读取会员状态';
  if (!activeSubscription.value) return '基础账户 · 随时可开通会员';
  const expiresAt = new Date(activeSubscription.value.expiresAt || '');
  if (Number.isNaN(expiresAt.getTime())) return '会员生效中';
  return `会员至 ${expiresAt.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })}`;
});

const frameStatusText = computed(() => (avatarFrame.value?.url ? '已佩戴头像框' : '未佩戴头像框'));
const SKIN_LABELS = { blank: '空白卡', cats: '全员小猫', custom: '自定义卡面' };
const skinLabel = computed(() => SKIN_LABELS[userInfo.value?.pointsCardSkin] || '空白卡');
const planButtonText = computed(() => {
  if (showPlanComparison.value) return '收起方案';
  return activeSubscription.value ? '更改方案' : '选择方案';
});
const togglePlans = () => {
  showPlanComparison.value = !showPlanComparison.value;
};
/** 装扮页「解锁」统一回到首页并展开方案（原先跳「订阅」页签） */
const openPlans = () => {
  openView('home');
  showPlanComparison.value = true;
};

/** 待办：只收「需要你动手」的四件事，按紧迫度排。上限 3 条，多了就不是待办而是报表。 */
const todoItems = computed(() => {
  const items = [];
  const gift = currentGift.value;
  const giftTime = gift?.updated_at || gift?.created_at || '';

  if (gift && addressCount.value === 0) {
    items.push({
      id: `gift-address-${gift.id}`,
      tone: 'warn',
      icon: MapPin,
      title: '补充礼物收货地址',
      detail:
        gift.gift_status === 'shipped'
          ? '礼物已寄出，补充地址便于后续联系'
          : '礼物寄送前需要一个有效地址',
      target: 'orders',
      time: giftTime,
      priority: 100,
    });
  } else if (gift && gift.gift_status === 'shipped') {
    items.push({
      id: `gift-shipped-${gift.id}`,
      tone: 'warn',
      icon: PackageCheck,
      title: '礼物已寄出',
      detail: gift.gift_no ? `快递单号 ${gift.gift_no}` : '请留意快递信息或取货通知',
      target: 'orders',
      time: giftTime,
      priority: 80,
    });
  }

  if (subscriptionExpiryDays.value !== null && subscriptionExpiryDays.value <= 30) {
    const days = subscriptionExpiryDays.value;
    items.push({
      id: 'subscription-expiry',
      tone: days <= 7 ? 'warn' : 'info',
      icon: Crown,
      title: days <= 0 ? '会员今天到期' : `会员还有 ${days} 天到期`,
      detail: '选择续订方案，避免额度回落',
      target: 'plans',
      time: activeSubscription.value?.expiresAt || '',
      priority: days <= 7 ? 90 : 60,
    });
  }

  if (pityStatus.value?.isDue) {
    items.push({
      id: 'pity-due',
      tone: 'info',
      icon: Ticket,
      title: '抽奖保底可兑现',
      detail: '下一次计入保底的活动即可领取保底礼',
      target: 'lotteries',
      time: pityStatus.value.updatedAt || '',
      priority: 70,
    });
  }

  return items.sort((a, b) => b.priority - a.priority).slice(0, 3);
});

const handleTodo = (item) => {
  if (item.target === 'plans') {
    openPlans();
    return;
  }
  if (item.target === 'lotteries') {
    goToLotteries();
    return;
  }
  openView(item.target);
};

const goToLotteries = () => {
  router.push('/lotteries').catch(() => {});
};

/* 首页取数：会员 + 订单 + 礼物 + 积分明细。
   2026-10-26 起不再拉 products（商品推荐属商城）与抽奖列表（属 /lotteries），
   资产首页不为它们各付一次请求。 */
const loadHome = async () => {
  await Promise.all([loadSubscription(), loadOrders(), loadGifts(), loadLedger()]);
};

onMounted(() => {
  void loadTier();
  openView(view.value);
});
</script>

<style scoped>
@import './AssetsHubPanel.css';
</style>
