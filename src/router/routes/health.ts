import type { RouteRecordRaw } from 'vue-router'

// 健康 AI 已并入 BOH AI（/ai-chat）的「健康分析」能力，
// 不再保留 /health/chat 独立子页面。
export const healthRoutes: RouteRecordRaw[] = [
  {
    path: '/health',
    name: 'BOHHealth',
    component: () => import('../../views/Health/index.vue'),
    meta: { title: 'BOH Health' }
  }
]
