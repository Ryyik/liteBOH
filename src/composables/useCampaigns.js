/**
 * 活动报名（activity_campaigns）——从 ActivitiesList.vue 内联逻辑抽出的单一真相源
 *
 * 与历史活动（useActivities / activities 表）是两个独立数据源：
 * campaigns 是「进行中、可报名」，activities 是「已举办、只回顾」。
 * 两边不共享 loading、不共享空态、不合并列表。
 */
import { ref } from "vue";
import { useAuthStore } from "@/stores/auth";
import { showIsland } from "@/composables/useIsland.js";
import {
  getMyCampaignSignupIds,
  listActivityCampaigns,
  signupCampaignEntry
} from "@/utils/api/activities-platform-api.js";

/** 六段生命周期（DB check 约束同源） */
export const CAMPAIGN_STAGE_LABELS = {
  draft: "草稿",
  signup: "报名中",
  submission: "投稿中",
  judging: "评审中",
  result: "结果公示",
  fulfilled: "已完结"
};

/** 视为「进行中」、需要出现在报名区的阶段 */
export const ONGOING_CAMPAIGN_STAGES = ["signup", "submission", "judging"];

export const campaignStageLabel = (stage) => CAMPAIGN_STAGE_LABELS[stage] || stage || "";

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
        const mine = await getMyCampaignSignupIds(ongoing.map((camp) => camp.id), uid);
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

  const signupCampaign = async (camp) => {
    const uid = authStore.userInfo?.id;
    if (!authStore.isLoggedIn || !uid) {
      showIsland.notify({ title: "请先登录", message: "登录后即可报名活动", icon: "info" });
      return;
    }
    if (!camp || camp.signingUp || camp.signedUp) return;

    camp.signingUp = true;
    try {
      const res = await signupCampaignEntry(camp.id, uid);
      if (!res.ok) {
        const duplicated = String(res.error?.code || "") === "23505";
        showIsland.notify({
          title: duplicated ? "你已报名过啦" : "报名失败",
          message: duplicated ? "无需重复报名" : res.error?.message || "请稍后重试",
          icon: duplicated ? "info" : "warning"
        });
        if (duplicated) camp.signedUp = true;
        return;
      }
      camp.signedUp = true;
      showIsland.notify({
        title: "报名成功",
        message: `已在「${camp.title}」为你登记`,
        icon: "success"
      });
    } finally {
      camp.signingUp = false;
    }
  };

  return { campaigns, loading, loadOngoingCampaigns, signupCampaign };
};
