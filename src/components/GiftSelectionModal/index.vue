<template>
  <transition name="fade">
    <div v-if="show" class="gift-selection-overlay" @click.self="$emit('close')">
      <div class="gift-selection-modal glass-card">
        <div class="gift-selection-header">
          <h3>礼物选择</h3>
          <button class="close-gift-selection" @click="$emit('close')">&times;</button>
        </div>
        <div class="gift-selection-content">
          <!-- 选项展示 -->
          <div v-if="!giftSelectionType" class="gift-options">
            <div class="gift-option-item" @click="selectGiftOption('wish')">
              <div class="gift-option-icon">🎁</div>
              <div class="gift-option-info">
                <h4>许愿礼物</h4>
                <p>上传礼物页面链接，我们为您准备</p>
              </div>
            </div>
            <div class="gift-option-item" @click="selectGiftOption('shop')">
              <div class="gift-option-icon">🛍️</div>
              <div class="gift-option-info">
                <h4>从商城中选择</h4>
                <p>浏览我们的商城，选择心仪的礼物</p>
              </div>
            </div>
          </div>

          <!-- 许愿礼物表单 -->
          <div v-if="showWishGiftForm" class="wish-gift-form">
            <h4>上传礼物商品链接</h4>
            <div class="form-group">
              <label for="gift-url">礼物页面URL</label>
              <input type="url" id="gift-url" v-model="giftUrl" placeholder="请输入礼物页面链接" class="gift-url-input" />
            </div>
            <div class="payment-info">
              <h5>支付方式</h5>
              <p>使用"方块礼品卡"进行支付</p>
              <p class="payment-note">方块礼品卡可通过抽奖获取</p>
              <p class="payment-note">对于价值较高的礼物，系统将自动应用折扣机制，即"方块之家"为用户支付部分金额</p>
            </div>
            <div class="form-actions">
              <button class="form-btn secondary" @click="resetSelection">返回</button>
              <button class="form-btn primary" @click="submitGiftUrl">提交</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </transition>

  <!-- 统一提示弹窗 -->
  <CommonAlertModal v-model:visible="alertState.visible" :type="alertState.type" :title="alertState.title"
    :message="alertState.message" @confirm="handleAlertConfirm" />
</template>

<script setup>
import { ref, reactive } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { storeToRefs } from 'pinia';
import CommonAlertModal from '../CommonAlertModal.vue';
import { sendGiftEmail } from '../../utils/email-service.js';

const _props = defineProps({
  show: Boolean
});

const emit = defineEmits(['close']);

const router = useRouter();

const authStore = useAuthStore();
const { isLoggedIn, userInfo } = storeToRefs(authStore);

// 礼物选择界面状态
const giftSelectionType = ref(''); // 'wish' 或 'shop'
const showWishGiftForm = ref(false);
const giftUrl = ref('');

// 弹窗状态
const alertState = reactive({
  visible: false,
  type: 'success',
  title: '',
  message: ''
});

const showAlert = (type, title, message) => {
  alertState.type = type;
  alertState.title = title;
  alertState.message = message;
  alertState.visible = true;
};

const handleAlertConfirm = () => {
  if (alertState.type === 'success') {
    emit('close');
  }
};

const selectGiftOption = (type) => {
  giftSelectionType.value = type;
  if (type === 'wish') {
    // 许愿礼物选项
    showWishGiftForm.value = true;
  } else if (type === 'shop') {
    // 从商城中选择选项
    router.push('/gift');
    emit('close');
  }
};

const resetSelection = () => {
  showWishGiftForm.value = false;
  giftSelectionType.value = '';
};

const submitGiftUrl = () => {
  if (!giftUrl.value) {
    showAlert('warning', '提示', '请输入礼物页面链接');
    return;
  }

  // 收集礼物请求数据
  const giftRequestData = {
    product: '许愿礼物 (URL 提交)',
    specifications: 'N/A',
    giftOptions: '许愿礼物',
    paymentMethod: '方块礼品卡',
    paymentAmount: '待定 (系统自动应用折扣)',
    deliveryMethod: '快递配送',
    totalPrice: '待定',
    giftMessage: `礼物链接: ${giftUrl.value}`,

    // 提交人信息
    buyerName: userInfo.value?.username || '未登录用户',
    buyerRole: userInfo.value?.role || '普通用户',
    isLoggedIn: isLoggedIn.value,
  };

  // 发送邮件
  sendGiftEmail(giftRequestData)
    .then((response) => {
      console.log('邮件发送成功', response);
      showAlert('success', '提交成功', '礼物请求已经发送！');
    })
    .catch((error) => {
      console.error('邮件发送失败', error);
      showAlert('error', '提交失败', '请检查网络或重试。');
    });
};
</script>

<style scoped src="./style.scoped.css"></style>
