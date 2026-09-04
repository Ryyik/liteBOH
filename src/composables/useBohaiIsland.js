import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useGlobalAiOverlay } from '@/composables/useGlobalAiOverlay'

const BOHAI_FORCE_CLOSE_EVENT = 'boh_ai_force_close'

/**
 * BOHAI 灵动岛状态机（薄包装）
 *
 * 设计原则：
 * - 完全复用 useGlobalAiOverlay 的 isOpen / open / close，零侵入
 * - 仅在此处加"路由保护"和"岛内关闭事件"两条胶水
 * - 岛组件（BOHAIIsland.vue）只监听 isExpanded，无需自己实现开关
 */
export function useBohaiIsland() {
  const route = useRoute()
  const router = useRouter()
  const { isOpen, open, close, canOpen } = useGlobalAiOverlay()

  // 岛"展开"的判定：overlay 打开 + 路由允许（避开 /ai-chat 避免双实例）
  const isExpanded = computed(() => isOpen.value && canOpen.value)

  // 路由进入 /ai-chat 时强制关闭岛（避免 BOHAIChat 同时挂在岛和全屏）
  watch(
    () => route.name,
    (name) => {
      if (name === 'AiChat' && isOpen.value) close()
    },
    { immediate: true }
  )

  // 岛内触发关闭（如用户按 ESC、点 X）
  const collapse = () => close()

  // 岛内触发全屏跳转（右上角 ↗ 按钮）
  const openFullscreen = async () => {
    close()
    await router.push('/ai-chat')
  }

  return {
    isExpanded,
    canOpen,
    open,
    collapse,
    openFullscreen,
    BOHAI_FORCE_CLOSE_EVENT
  }
}
