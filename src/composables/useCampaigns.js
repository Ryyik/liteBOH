/**
 * 活动报名（activity_campaigns）——从 ActivitiesList.vue 内联逻辑抽出的单一真相源
 *
 * 与历史活动（useActivities / activities 表）是两个独立数据源：
 * campaigns 是「进行中、可报名」，activities 是「已举办、只回顾」。
 * 两边不共享 loading、不共享空态、不合并列表。
 */
import { ref } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { showIsland } from '@/composables/useIsland.js';
import {
  getMyCampaignSignupIds,
  listActivityCampaigns,
  signupCampaignEntry,
} from '@/utils/api/activities-platform-api.js';

/**
 * ⚠️ 活动区的反馈依赖「导航岛槽位是空的」：
 * 2026-10-20「内容页合并」后活动段住进 `/newsroom`，该页原本为搜索/筛选注册了一个
 * persistent 的 news-tools 岛。导航岛仲裁规则是「status 卡已显示 ⇒ 新通知入队」
 * （UnifiedNavbar `handleGlobalNavStatus`），persistent 岛不自动收起 ⇒ 报名提示会被
 * 永久排队（实测：未登录点「立即报名」无任何反馈）。
 * 解法在**宿主侧**：Newsroom 在活动段主动 `showIsland.preempt()` 让出槽位
 * （见其 `notifyIsland`）。这里保持用岛通知即可，别再改成 toast ——
 * `utils/notify.js` 的 toast 在未登录态不可用（notificationStore 尚未 ensure）。
 */

/** 六段生命周期（DB check 约束同源） */
export const CAMPAIGN_STAGE_LABELS = {
  draft: '草稿',
  signup: '报名中',
  submission: '投稿中',
  judging: '评审中',
  result: '结果公示',
  fulfilled: '已完结',
};

/** 视为「进行中」、需要出现在报名区的阶段 */
export const ONGOING_CAMPAIGN_STAGES = ['signup', 'submission', 'judging'];

export const campaignStageLabel = (stage) => CAMPAIGN_STAGE_LABELS[stage] || stage || '';

export const useCampaigns = () => {
  const authStore = useAuthStore();
  const campaigns = ref([]);
  const loading = ref(false);

  const loadOngoingCampaigns = async () => {
    loading.value = true;
    try {
      const res = await listActivityCampaigns({ limit: 12 });
      if (!res.ok) {
        campaigns.value = [];
        return;
      }
      const ongoing = res.data.filter((camp) => ONGOING_CAMPAIGN_STAGES.includes(camp.stage));

      // 已报名态：一次批量查询（此前是每活动一次往返的 N+1）
      const uid = authStore.userInfo?.id;
      if (uid && ongoing.length) {
        const mine = await getMyCampaignSignupIds(
          ongoing.map((camp) => camp.id),
          uid,
        );
        const signedIds = mine.ok ? mine.data : new Set();
        ongoing.forEach((camp) => {
          camp.signedUp = signedIds.has(camp.id);
        });
      }

      campaigns.value = ongoing;
    } catch {
      campaigns.value = [];
    } finally {
      loading.value = false;
    }
  };

  /**
   * 报名反馈的**页面内联**副本（2026-10-20）。
   *
   * 为什么需要它：活动段现在常驻一个 persistent 的搜索/筛选岛，而导航岛的仲裁规则是
   * 「status 卡已可见 ⇒ 新通知入队」⇒ `showIsland.notify` 的报名提示会被永久排队。
   * 但报名提示又不能没有，搜索/筛选也不能砍 ⇒ 提示改走页面内联条（不占导航槽位），
   * 岛通知保留给「从活动段之外触发」的场景。
   */
  const signupFeedback = ref(null);
  let feedbackTimer = null;
  const pushSignupFeedback = (tone, text) => {
    if (feedbackTimer) clearTimeout(feedbackTimer);
    signupFeedback.value = { tone, text, id: Date.now() };
    feedbackTimer = setTimeout(() => {
      signupFeedback.value = null;
      feedbackTimer = null;
    }, 3200);
  };

  const signupCampaign = async (camp) => {
    const uid = authStore.userInfo?.id;
    if (!authStore.isLoggedIn || !uid) {
      pushSignupFeedback('info', '请先登录后再报名活动');
      showIsland.notify({ title: '请先登录', message: '登录后即可报名活动', icon: 'info' });
      return;
    }
    if (!camp || camp.signingUp || camp.signedUp) return;

    camp.signingUp = true;
    try {
      const res = await signupCampaignEntry(camp.id, uid);
      if (!res.ok) {
        const duplicated = String(res.error?.code || '') === '23505';
        pushSignupFeedback(
          duplicated ? 'info' : 'warning',
          duplicated
            ? '你已报名过啦，无需重复报名'
            : `报名失败：${res.error?.message || '请稍后重试'}`,
        );
        showIsland.notify({
          title: duplicated ? '你已报名过啦' : '报名失败',
          message: duplicated ? '无需重复报名' : res.error?.message || '请稍后重试',
          icon: duplicated ? 'info' : 'warning',
        });
        if (duplicated) camp.signedUp = true;
        return;
      }
      camp.signedUp = true;
      pushSignupFeedback('success', `报名成功：已在「${camp.title}」为你登记`);
      showIsland.notify({
        title: '报名成功',
        message: `已在「${camp.title}」为你登记`,
        icon: 'success',
      });
    } finally {
      camp.signingUp = false;
    }
  };

  return { campaigns, loading, loadOngoingCampaigns, signupCampaign, signupFeedback };
};
