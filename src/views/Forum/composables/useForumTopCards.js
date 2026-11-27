import { computed, onMounted, ref } from 'vue';
import { useHomeHeroesStore } from '@/stores/homeHeroes';
import { listForumCardItems } from '@/utils/api/forum-cards-api.js';
import {
  FORUM_CHECKIN_DISMISS_KEY,
  FORUM_PROMO_DISMISS_PREFIX,
  buildForumCheckinCard,
  buildForumPromoCard,
  getForumPromoDismissKey,
  getLocalWeekStartKey,
} from '../forum-top-card-model.js';

const readPromoDismissals = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(FORUM_PROMO_DISMISS_PREFIX) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const writePromoDismissals = (value) => {
  try {
    localStorage.setItem(FORUM_PROMO_DISMISS_PREFIX, JSON.stringify(value));
  } catch {
    /* 隐私模式等不可写场景只影响刷新后的持久化 */
  }
};

export function useForumTopCards({
  section,
  isLoggedIn,
  weeklyCheckinStatus,
  isWeeklyCheckinLoading,
}) {
  const homeHeroesStore = useHomeHeroesStore();
  const items = ref([]);
  const promoDismissals = ref(readPromoDismissals());
  const dismissedCheckinWeek = ref(
    (() => {
      try {
        return localStorage.getItem(FORUM_CHECKIN_DISMISS_KEY) || '';
      } catch {
        return '';
      }
    })(),
  );

  const currentWeekStart = computed(
    () =>
      String(weeklyCheckinStatus.value?.currentWeekStart || '').trim() || getLocalWeekStartKey(),
  );

  const checkinCard = computed(() => {
    if (section.value !== 'latest' || !isLoggedIn.value) return null;
    if (isWeeklyCheckinLoading.value || weeklyCheckinStatus.value?.hasSignedThisWeek) return null;
    if (dismissedCheckinWeek.value === currentWeekStart.value) return null;
    return buildForumCheckinCard({ weekStart: currentWeekStart.value });
  });

  const promoCard = computed(() => {
    if (section.value !== 'latest') return null;
    for (const item of items.value) {
      const card = buildForumPromoCard(item, homeHeroesStore.publishedHeroes);
      if (!card || promoDismissals.value[getForumPromoDismissKey(card)]) continue;
      return card;
    }
    return null;
  });

  const cards = computed(() => [checkinCard.value, promoCard.value].filter(Boolean).slice(0, 2));

  const load = async () => {
    items.value = await listForumCardItems();
    if (items.value.some((item) => item.kind === 'hero')) {
      await homeHeroesStore.fetchPublished().catch(() => homeHeroesStore.publishedHeroes);
    }
  };

  const dismiss = (card) => {
    if (!card) return;
    if (card.type === 'checkin') {
      dismissedCheckinWeek.value = currentWeekStart.value;
      try {
        localStorage.setItem(FORUM_CHECKIN_DISMISS_KEY, currentWeekStart.value);
      } catch {
        /* 同上 */
      }
      return;
    }
    if (card.type === 'promo') {
      const next = { ...promoDismissals.value, [getForumPromoDismissKey(card)]: true };
      promoDismissals.value = next;
      writePromoDismissals(next);
    }
  };

  onMounted(() => {
    void load();
  });

  return { cards, dismiss, load };
}
