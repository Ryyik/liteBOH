import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/utils/supabase-client'
import { logger } from '@/utils/logger.js'
import type { Product, ProductSpec } from '@/types'

// 延迟加载 fallback 产品数据，避免打包到初始 chunk
let _fallbackProducts: Record<string, unknown>[] | null = null
const getFallbackProducts = async (): Promise<Record<string, unknown>[]> => {
  if (_fallbackProducts) return _fallbackProducts
  const mod = await import('@/data/products')
  _fallbackProducts = mod.products as Record<string, unknown>[]
  return _fallbackProducts
}

const CACHE_KEY = 'boh_products_cache_v4'
const CACHE_TTL_MS = 5 * 60 * 1000
const CACHE_MAX_SIZE_BYTES = 500 * 1024 // 500KB 上限，避免 localStorage 配额溢出

const normalizeSpecs = (specifications: unknown): ProductSpec[] => {
  if (Array.isArray(specifications)) {
    return specifications as ProductSpec[]
  }

  if (typeof specifications === 'string') {
    try {
      const parsed = JSON.parse(specifications)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  return []
}

const normalizeProduct = (item: Record<string, unknown>): Product => ({
  ...item,
  id: Number(item.id),
  points_cost: Number.isFinite(Number(item.points_cost))
    ? Math.max(0, Math.round(Number(item.points_cost)))
    : 0,
  specifications: normalizeSpecs(item.specifications),
  image: (item.image as string) || '',
  is_active: item.is_active !== false,
  is_purchasable: item.is_purchasable !== false && Number(item.points_cost) > 0,
} as Product)

interface ProductsCache {
  timestamp: number
  data: Record<string, unknown>[]
}

const readProductsCache = (): Product[] | null => {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed: ProductsCache = JSON.parse(raw)
    if (!parsed?.timestamp || !Array.isArray(parsed?.data)) return null
    const isExpired = Date.now() - parsed.timestamp > CACHE_TTL_MS
    if (isExpired) return null
    return parsed.data.map(normalizeProduct)
  } catch {
    return null
  }
}

const writeProductsCache = (data: Record<string, unknown>[]): void => {
  try {
    const payload = JSON.stringify({ timestamp: Date.now(), data })
    // 数据量过大时跳过缓存，避免 localStorage 配额溢出
    if (new Blob([payload]).size > CACHE_MAX_SIZE_BYTES) {
      return
    }
    localStorage.setItem(CACHE_KEY, payload)
  } catch {
    // 忽略本地缓存写入失败（例如隐私模式/配额限制）
  }
}

/**
 * 合并远端数据与本地兜底商品（按 id 去重，id 相同时远端优先）
 * 确保：1) 新上架的本地商品（如吉祥物公仔）即使未入库也可见
 *      2) 本地兜底商品在 DB 分类不匹配时也能显示，避免产品页空白
 */
const mergeWithFallback = (
  remoteItems: Record<string, unknown>[],
  fallbackItems: Record<string, unknown>[]
): Record<string, unknown>[] => {
  const seen = new Set<number>()
  const result: Record<string, unknown>[] = []
  for (const item of remoteItems) {
    const id = Number(item.id)
    if (!Number.isNaN(id)) seen.add(id)
    result.push(item)
  }
  for (const item of fallbackItems) {
    const id = Number(item.id)
    if (!Number.isNaN(id) && !seen.has(id)) {
      result.push(item)
      seen.add(id)
    }
  }
  return result
}

export const useProductsStore = defineStore('products', () => {
  const productsData = ref<Product[]>([])
  const isFetchingProducts = ref(false)
  const fetchError = ref('')

  const fetchProducts = async ({ force = false }: { force?: boolean } = {}): Promise<Product[]> => {
    if (!force && productsData.value.length > 0) {
      return productsData.value
    }

    if (!force) {
      const cached = readProductsCache()
      if (cached?.length) {
        productsData.value = cached
        return cached
      }
    }

    fetchError.value = ''
    isFetchingProducts.value = true

    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('is_active', true)
        .order('id', { ascending: true })

      if (error) throw error

      const fallback = await getFallbackProducts()
      // 核心修复：不论 DB 返回是否为空，都与本地 fallback 按 id 合并
      // 保证本地新增商品（如吉祥物）、本地兜底分类（如 BOH Bag）永远可见
      const mergedRaw = mergeWithFallback(data || [], fallback)
      const latestProducts = mergedRaw.map(normalizeProduct)

      productsData.value = latestProducts
      // 缓存合并后的数据，下次进入时即使 DB 分类不匹配也不会空白
      writeProductsCache(mergedRaw)
      return latestProducts
    } catch (error) {
      logger.error('products-store', '获取产品列表失败', error)
      fetchError.value = (error as Error)?.message || 'PRODUCTS_FETCH_FAILED'

      // 网络异常/权限异常时回退静态数据，保障商店可用
      const fallback = await getFallbackProducts()
      productsData.value = fallback.map((p: Record<string, unknown>) => normalizeProduct(p))
      writeProductsCache(fallback)
      return productsData.value
    } finally {
      isFetchingProducts.value = false
    }
  }

  const resetState = (): void => {
    productsData.value = []
    isFetchingProducts.value = false
    fetchError.value = ''
    localStorage.removeItem(CACHE_KEY) // 修复：清理 localStorage 缓存
  }

  return {
    productsData,
    isFetchingProducts,
    fetchError,
    fetchProducts,
    resetState,
  }
})
