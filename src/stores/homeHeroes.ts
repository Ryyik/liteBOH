import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/utils/supabase-client'
import { logger } from '@/utils/logger.js'
import type {
  HomeHero,
  HomeHeroRevision,
  HomeHeroTemplate,
  ContentLayout,
  ContentLayoutValues,
  HeroImageConfig,
  HeroLink,
  SplitCardConfig
} from '@/types'

// ============================================
// 首页英雄区 Store
// ============================================
// 职责：
// 1. 首页：fetchPublished() 读取已发布未归档英雄区
// 2. Footer 历史区：fetchArchived() 读取已归档英雄区
// 3. 管理面板：fetchAllForAdmin() / saveHero() / publishHero() / rollbackHero() / deleteHero()
// 草稿/发布分离：首页仅渲染 status='published' 的记录。

// 版本化缓存：字段结构变更时升级版本，避免旧记录按新模板渲染。
const CACHE_KEY = 'boh_home_heroes_v2'
const LEGACY_CACHE_KEYS = ['boh_home_heroes_v1']
const CACHE_TTL_MS = 5 * 60 * 1000

interface HeroesCache {
  timestamp: number
  data: HomeHero[]
}

const readCache = (): HomeHero[] | null => {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed: HeroesCache = JSON.parse(raw)
    if (!parsed?.timestamp || !Array.isArray(parsed?.data)) return null
    if (Date.now() - parsed.timestamp > CACHE_TTL_MS) return null
    return parsed.data
  } catch {
    return null
  }
}

const writeCache = (data: HomeHero[]): void => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data }))
  } catch {
    // 忽略写入失败
  }
}

const clearCache = (): void => {
  try {
    localStorage.removeItem(CACHE_KEY)
    LEGACY_CACHE_KEYS.forEach((key) => localStorage.removeItem(key))
  } catch {
    // 忽略
  }
}

// 规范化：确保 JSONB 字段有正确类型
const normalizeLinks = (raw: unknown): HeroLink[] => {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item): HeroLink => ({
      text: String(item.text || ''),
      type: item.type === 'primary' || item.type === 'secondary' ? (item.type as 'primary' | 'secondary') : undefined,
      to: typeof item.to === 'string' ? item.to : undefined,
      href: typeof item.href === 'string' ? item.href : undefined,
      onClick: typeof item.onClick === 'string' ? item.onClick : undefined
    }))
    .filter((link) => link.text)
}

const normalizeImageConfig = (raw: unknown): HeroImageConfig => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const cfg = raw as Record<string, unknown>
  const result: HeroImageConfig = {}
  if (typeof cfg.src === 'string') result.src = cfg.src
  if (typeof cfg.alt === 'string') result.alt = cfg.alt
  if (typeof cfg.position === 'string') result.position = cfg.position
  // 竖屏端独立配置
  if (typeof cfg.mobile_src === 'string') result.mobile_src = cfg.mobile_src
  if (typeof cfg.mobile_position === 'string') result.mobile_position = cfg.mobile_position
  if (cfg.mobile_object_fit === 'cover' || cfg.mobile_object_fit === 'contain') {
    result.mobile_object_fit = cfg.mobile_object_fit
  }
  if (typeof cfg.mobile_scale === 'number' && Number.isFinite(cfg.mobile_scale)) {
    result.mobile_scale = Math.max(1, Math.min(2.2, cfg.mobile_scale))
  }
  // responsive 模板专用
  if (typeof cfg.landscapeSrc === 'string') result.landscapeSrc = cfg.landscapeSrc
  if (typeof cfg.portraitSrc === 'string') result.portraitSrc = cfg.portraitSrc
  if (typeof cfg.portrait_position === 'string') result.portrait_position = cfg.portrait_position
  return result
}

const normalizeLayoutValues = (raw: unknown): ContentLayoutValues | null => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const cfg = raw as Record<string, unknown>
  const result: ContentLayoutValues = {}
  if (cfg.align === 'left' || cfg.align === 'center' || cfg.align === 'right') result.align = cfg.align
  if (cfg.valign === 'top' || cfg.valign === 'center' || cfg.valign === 'bottom') result.valign = cfg.valign
  if (cfg.text_align === 'left' || cfg.text_align === 'center' || cfg.text_align === 'right') result.text_align = cfg.text_align
  if (typeof cfg.max_width === 'number' && cfg.max_width > 0) result.max_width = cfg.max_width
  if (typeof cfg.offset_x === 'number' && Number.isFinite(cfg.offset_x)) result.offset_x = cfg.offset_x
  if (typeof cfg.offset_y === 'number' && Number.isFinite(cfg.offset_y)) result.offset_y = cfg.offset_y
  return Object.keys(result).length ? result : null
}

const normalizeContentLayout = (raw: unknown): ContentLayout | null => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const cfg = raw as Record<string, unknown>
  const legacy = normalizeLayoutValues(cfg)
  const desktop = normalizeLayoutValues(cfg.desktop)
  const mobile = normalizeLayoutValues(cfg.mobile)
  if (!desktop && !mobile) return legacy
  return {
    desktop: desktop || legacy || undefined,
    mobile: mobile || null
  }
}

const cloneContentLayout = (layout: ContentLayout | null | undefined): ContentLayout | null => {
  if (!layout) return null
  return {
    ...layout,
    desktop: layout.desktop ? { ...layout.desktop } : undefined,
    mobile: layout.mobile ? { ...layout.mobile } : null
  }
}

const normalizeSplitCards = (raw: unknown): SplitCardConfig[] | null => {
  if (!Array.isArray(raw)) return null
  return raw
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => ({
      title: String(item.title || ''),
      subtitle: typeof item.subtitle === 'string' ? item.subtitle : undefined,
      variant: item.variant === 'dark' ? 'dark' : 'light',
      image_config: normalizeImageConfig(item.image_config),
      links: normalizeLinks(item.links),
      content_layout: normalizeContentLayout(item.content_layout)
    }))
}

const normalizeHero = (item: Record<string, unknown>): HomeHero => ({
  id: String(item.id || ''),
  sort_order: Number(item.sort_order) || 0,
  is_archived: Boolean(item.is_archived),
  template: (['standard', 'overlay', 'split', 'responsive', 'builtin'].includes(String(item.template))
    ? String(item.template)
    : 'standard') as HomeHeroTemplate,
  variant: item.variant === 'dark' ? 'dark' : 'light',
  builtin_key: typeof item.builtin_key === 'string' && item.builtin_key ? item.builtin_key : null,
  eyebrow: typeof item.eyebrow === 'string' && item.eyebrow ? item.eyebrow : null,
  title: String(item.title || ''),
  subtitle: typeof item.subtitle === 'string' && item.subtitle ? item.subtitle : null,
  image_config: normalizeImageConfig(item.image_config),
  content_layout: normalizeContentLayout(item.content_layout),
  links: normalizeLinks(item.links),
  split_cards: normalizeSplitCards(item.split_cards),
  label: typeof item.label === 'string' && item.label ? item.label : null,
  aria_label: typeof item.aria_label === 'string' && item.aria_label ? item.aria_label : null,
  status: item.status === 'published' ? 'published' : 'draft',
  published_at: typeof item.published_at === 'string' ? item.published_at : null,
  published_by: typeof item.published_by === 'string' ? item.published_by : null,
  created_at: typeof item.created_at === 'string' ? item.created_at : new Date().toISOString(),
  updated_at: typeof item.updated_at === 'string' ? item.updated_at : new Date().toISOString(),
  created_by: typeof item.created_by === 'string' ? item.created_by : null,
  updated_by: typeof item.updated_by === 'string' ? item.updated_by : null
})

const buildSnapshot = (hero: HomeHero): HomeHero => ({
  ...hero,
  image_config: { ...hero.image_config },
  content_layout: cloneContentLayout(hero.content_layout),
  links: hero.links.map((l) => ({ ...l })),
  split_cards: hero.split_cards?.map((c) => ({
    ...c,
    image_config: { ...c.image_config },
    content_layout: cloneContentLayout(c.content_layout),
    links: c.links.map((l) => ({ ...l }))
  })) ?? null
})

export const useHomeHeroesStore = defineStore('homeHeroes', () => {
  // 首页已发布英雄区（未归档）
  const publishedHeroes = ref<HomeHero[]>([])
  // 首页已归档英雄区（历史区）
  const archivedHeroes = ref<HomeHero[]>([])
  // 管理面板：全部英雄区（含草稿）
  const allHeroes = ref<HomeHero[]>([])
  const isFetching = ref(false)
  const isSaving = ref(false)
  const fetchError = ref('')
  let publishedFetchPromise: Promise<HomeHero[]> | null = null
  // 请求代次令牌：force 刷新后旧在途请求不得回写数据，也不得清掉新请求的去重引用
  let publishedFetchToken = 0

  const fetchPublishedFromRemote = (): Promise<HomeHero[]> => {
    if (publishedFetchPromise) return publishedFetchPromise

    const token = ++publishedFetchToken
    isFetching.value = true
    fetchError.value = ''
    publishedFetchPromise = (async () => {
      try {
        const { data, error } = await supabase
          .from('home_heroes')
          .select('*')
          .eq('status', 'published')
          .eq('is_archived', false)
          .order('sort_order', { ascending: true })
          .limit(50)
        if (error) throw error
        // 已被更新的 force 请求取代：丢弃本次结果，避免旧数据晚到覆盖新数据
        if (token !== publishedFetchToken) return publishedHeroes.value
        const heroes = (data || []).map((item) => normalizeHero(item as Record<string, unknown>))
        publishedHeroes.value = heroes
        writeCache(heroes)
        return heroes
      } catch (error) {
        if (token === publishedFetchToken) {
          logger.error('home-heroes-store', '获取已发布英雄区失败', error)
          fetchError.value = (error as Error)?.message || 'HOME_HEROES_FETCH_FAILED'
        }
        return publishedHeroes.value
      } finally {
        if (token === publishedFetchToken) {
          isFetching.value = false
          publishedFetchPromise = null
        }
      }
    })()

    return publishedFetchPromise
  }

  // 首页：读取已发布未归档英雄区
  const fetchPublished = async ({ force = false } = {}): Promise<HomeHero[]> => {
    if (!force && publishedHeroes.value.length > 0) {
      return publishedHeroes.value
    }
    if (!force) {
      const cached = readCache()
      if (cached?.length) {
        publishedHeroes.value = cached
        // 缓存只用于首屏加速，随后始终同步远端，避免持续展示旧结构。
        void fetchPublishedFromRemote()
        return cached
      }
    }
    // force=true 时作废在途请求（旧请求结果与 finally 清理均会被令牌拦截），确保发起新请求
    if (force) {
      publishedFetchToken++
      publishedFetchPromise = null
    }
    return fetchPublishedFromRemote()
  }

  // Footer 历史区：读取已归档英雄区
  const fetchArchived = async ({ force = false } = {}): Promise<HomeHero[]> => {
    if (!force && archivedHeroes.value.length > 0) {
      return archivedHeroes.value
    }
    try {
      const { data, error } = await supabase
        .from('home_heroes')
        .select('*')
        .eq('status', 'published')
        .eq('is_archived', true)
        .order('sort_order', { ascending: true })
        .limit(50)
      if (error) throw error
      const heroes = (data || []).map((item) => normalizeHero(item as Record<string, unknown>))
      archivedHeroes.value = heroes
      return heroes
    } catch (error) {
      logger.error('home-heroes-store', '获取归档英雄区失败', error)
      return []
    }
  }

  // 管理面板：读取全部英雄区
  const fetchAllForAdmin = async ({ force = false } = {}): Promise<HomeHero[]> => {
    if (!force && allHeroes.value.length > 0) {
      return allHeroes.value
    }
    fetchError.value = ''
    isFetching.value = true
    try {
      const { data, error } = await supabase
        .from('home_heroes')
        .select('*')
        .order('sort_order', { ascending: true })
        .limit(50)
      if (error) throw error
      const heroes = (data || []).map((item) => normalizeHero(item as Record<string, unknown>))
      allHeroes.value = heroes
      return heroes
    } catch (error) {
      logger.error('home-heroes-store', '获取英雄区列表失败', error)
      fetchError.value = (error as Error)?.message || 'HOME_HEROES_FETCH_FAILED'
      return []
    } finally {
      isFetching.value = false
    }
  }

  // 读取单个英雄区的发布历史
  const fetchRevisions = async (heroId: string): Promise<HomeHeroRevision[]> => {
    try {
      const { data, error } = await supabase
        .from('home_heroes_revisions')
        .select('*')
        .eq('hero_id', heroId)
        .order('published_at', { ascending: false })
        .limit(20)
      if (error) throw error
      return (data || []).map((item) => ({
        id: String(item.id || ''),
        hero_id: String(item.hero_id || ''),
        snapshot: normalizeHero(item.snapshot as Record<string, unknown>),
        published_at: String(item.published_at || ''),
        published_by: typeof item.published_by === 'string' ? item.published_by : null
      }))
    } catch (error) {
      logger.error('home-heroes-store', '获取英雄区历史版本失败', error)
      return []
    }
  }

  // 新建英雄区（草稿）
  const createHero = async (payload: Partial<HomeHero>): Promise<HomeHero | null> => {
    isSaving.value = true
    try {
      const insertPayload = {
        sort_order: Number(payload.sort_order) || 0,
        is_archived: Boolean(payload.is_archived),
        template: payload.template || 'standard',
        variant: payload.variant || 'light',
        builtin_key: payload.builtin_key || null,
        eyebrow: payload.eyebrow || null,
        title: payload.title || '未命名英雄区',
        subtitle: payload.subtitle || null,
        image_config: payload.image_config || {},
        content_layout: payload.content_layout || null,
        links: payload.links || [],
        split_cards: payload.split_cards || null,
        label: payload.label || null,
        aria_label: payload.aria_label || null,
        status: 'draft'
      }
      const { data, error } = await supabase
        .from('home_heroes')
        .insert(insertPayload)
        .select()
        .single()
      if (error) throw error
      const hero = normalizeHero(data as Record<string, unknown>)
      allHeroes.value = [...allHeroes.value, hero]
      return hero
    } catch (error) {
      logger.error('home-heroes-store', '创建英雄区失败', error)
      fetchError.value = (error as Error)?.message || 'HOME_HEROES_CREATE_FAILED'
      return null
    } finally {
      isSaving.value = false
    }
  }

  // 保存英雄区（更新草稿）
  const saveHero = async (id: string, payload: Partial<HomeHero>): Promise<boolean> => {
    isSaving.value = true
    try {
      const updatePayload: Record<string, unknown> = {
        sort_order: Number(payload.sort_order) || 0,
        is_archived: Boolean(payload.is_archived),
        template: payload.template,
        variant: payload.variant,
        builtin_key: payload.builtin_key ?? null,
        eyebrow: payload.eyebrow || null,
        title: payload.title,
        subtitle: payload.subtitle || null,
        image_config: payload.image_config || {},
        content_layout: payload.content_layout || null,
        links: payload.links || [],
        split_cards: payload.split_cards || null,
        label: payload.label || null,
        aria_label: payload.aria_label || null,
        updated_at: new Date().toISOString()
      }
      const { error } = await supabase
        .from('home_heroes')
        .update(updatePayload)
        .eq('id', id)
      if (error) throw error
      // 同步本地
      const idx = allHeroes.value.findIndex((h) => h.id === id)
      if (idx >= 0) {
        allHeroes.value[idx] = { ...allHeroes.value[idx], ...payload } as HomeHero
      }
      return true
    } catch (error) {
      logger.error('home-heroes-store', '保存英雄区失败', error)
      fetchError.value = (error as Error)?.message || 'HOME_HEROES_SAVE_FAILED'
      return false
    } finally {
      isSaving.value = false
    }
  }

  // 发布英雄区：将草稿状态改为 published，并写入历史快照
  const publishHero = async (id: string, userId?: string): Promise<boolean> => {
    isSaving.value = true
    try {
      const hero = allHeroes.value.find((h) => h.id === id)
      if (!hero) throw new Error('英雄区不存在')
      // 1. 写入历史快照
      const { data: revisionData, error: revError } = await supabase
        .from('home_heroes_revisions')
        .insert({
          hero_id: id,
          snapshot: buildSnapshot(hero),
          published_by: userId || null
        })
        .select('id')
        .single()
      if (revError) throw revError
      const revisionId = revisionData?.id
      try {
        // 2. 更新状态为 published
        const { error: updateError } = await supabase
          .from('home_heroes')
          .update({
            status: 'published',
            published_at: new Date().toISOString(),
            published_by: userId || null,
            updated_at: new Date().toISOString()
          })
          .eq('id', id)
        if (updateError) throw updateError
      } catch (updateErr) {
        // L15 修复：补偿性删除已写入的 revision，避免产生孤立 revision 记录
        if (revisionId) {
          await supabase.from('home_heroes_revisions').delete().eq('id', revisionId)
        }
        throw updateErr
      }
      // 3. 同步本地
      const idx = allHeroes.value.findIndex((h) => h.id === id)
      if (idx >= 0) {
        allHeroes.value[idx] = {
          ...allHeroes.value[idx],
          status: 'published',
          published_at: new Date().toISOString()
        }
      }
      clearCache()
      return true
    } catch (error) {
      logger.error('home-heroes-store', '发布英雄区失败', error)
      fetchError.value = (error as Error)?.message || 'HOME_HEROES_PUBLISH_FAILED'
      return false
    } finally {
      isSaving.value = false
    }
  }

  // 批量发布
  const publishBatch = async (ids: string[], userId?: string): Promise<number> => {
    let successCount = 0
    for (const id of ids) {
      const ok = await publishHero(id, userId)
      if (ok) successCount++
    }
    return successCount
  }

  // 回滚到历史版本
  const rollbackHero = async (heroId: string, revisionId: string): Promise<boolean> => {
    isSaving.value = true
    try {
      const revisions = await fetchRevisions(heroId)
      const target = revisions.find((r) => r.id === revisionId)
      if (!target) throw new Error('历史版本不存在')
      const snapshot = target.snapshot
      const { error } = await supabase
        .from('home_heroes')
        .update({
          template: snapshot.template,
          variant: snapshot.variant,
          builtin_key: snapshot.builtin_key ?? null,
          eyebrow: snapshot.eyebrow,
          title: snapshot.title,
          subtitle: snapshot.subtitle,
          image_config: snapshot.image_config,
          content_layout: snapshot.content_layout,
          links: snapshot.links,
          split_cards: snapshot.split_cards,
          label: snapshot.label,
          aria_label: snapshot.aria_label,
          is_archived: snapshot.is_archived,
          sort_order: snapshot.sort_order,
          updated_at: new Date().toISOString()
        })
        .eq('id', heroId)
      if (error) throw error
      const idx = allHeroes.value.findIndex((h) => h.id === heroId)
      if (idx >= 0) {
        allHeroes.value[idx] = { ...allHeroes.value[idx], ...snapshot }
      }
      clearCache()
      return true
    } catch (error) {
      logger.error('home-heroes-store', '回滚英雄区失败', error)
      fetchError.value = (error as Error)?.message || 'HOME_HEROES_ROLLBACK_FAILED'
      return false
    } finally {
      isSaving.value = false
    }
  }

  // 删除英雄区
  const deleteHero = async (id: string): Promise<boolean> => {
    isSaving.value = true
    try {
      const { error } = await supabase.from('home_heroes').delete().eq('id', id)
      if (error) throw error
      allHeroes.value = allHeroes.value.filter((h) => h.id !== id)
      clearCache()
      return true
    } catch (error) {
      logger.error('home-heroes-store', '删除英雄区失败', error)
      fetchError.value = (error as Error)?.message || 'HOME_HEROES_DELETE_FAILED'
      return false
    } finally {
      isSaving.value = false
    }
  }

  // 调整排序
  const reorderHeroes = async (orderedIds: string[]): Promise<boolean> => {
    try {
      const updates = orderedIds.map((id, idx) =>
        supabase.from('home_heroes').update({ sort_order: idx, updated_at: new Date().toISOString() }).eq('id', id)
      )
      const results = await Promise.all(updates)
      const hasError = results.some((r) => r.error)
      if (hasError) throw new Error('部分排序更新失败')
      // 同步本地
      allHeroes.value = orderedIds.map((id, idx) => {
        const hero = allHeroes.value.find((h) => h.id === id)
        return hero ? { ...hero, sort_order: idx } : null
      }).filter((h): h is HomeHero => h !== null)
      clearCache()
      return true
    } catch (error) {
      logger.error('home-heroes-store', '调整排序失败', error)
      return false
    }
  }

  const resetState = (): void => {
    publishedHeroes.value = []
    archivedHeroes.value = []
    allHeroes.value = []
    isFetching.value = false
    isSaving.value = false
    fetchError.value = ''
    clearCache()
  }

  return {
    publishedHeroes,
    archivedHeroes,
    allHeroes,
    isFetching,
    isSaving,
    fetchError,
    fetchPublished,
    fetchArchived,
    fetchAllForAdmin,
    fetchRevisions,
    createHero,
    saveHero,
    publishHero,
    publishBatch,
    rollbackHero,
    deleteHero,
    reorderHeroes,
    resetState
  }
})
