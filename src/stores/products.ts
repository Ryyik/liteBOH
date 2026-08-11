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
const CACHE_TTL_MS = 2 * 60 * 1000
const CACHE_MAX_SIZE_BYTES = 500 * 1024
const CACHE_VERSION_KEY = 'boh_products_cache_version_v4'

// 缓存版本号：管理后台修改商品后 +1，store 检测版本变化自动失效缓存
const getCacheVersion = (): number => {
  try {
    return parseInt(localStorage.getItem(CACHE_VERSION_KEY) || '0', 10) || 0
  } catch { return 0 }
}
const bumpCacheVersion = (): void => {
  try { localStorage.setItem(CACHE_VERSION_KEY, String(getCacheVersion() + 1)) } catch {}
}
const clearProductCache = (): void => {
  try { localStorage.removeItem(CACHE_KEY) } catch {}
}

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

const normalizeProduct = (item: Record<string, unknown>): Product => {
  const mode = String(item.payment_mode || 'points_only');
  const hasPoints = Number.isFinite(Number(item.points_cost)) && Number(item.points_cost) > 0;
  const hasRmb = Number.isFinite(Number(item.rmb_price)) && Number(item.rmb_price) > 0;
  const purchasable = item.is_purchasable !== false
    && (mode === 'points_only' ? hasPoints
      : mode === 'rmb_only' ? hasRmb
      : hasPoints && hasRmb);

  return {
    ...item,
    id: Number(item.id),
    payment_mode: mode,
    points_cost: hasPoints ? Math.round(Number(item.points_cost)) : 0,
    rmb_price: hasRmb ? Math.round(Number(item.rmb_price)) : null,
    specifications: normalizeSpecs(item.specifications),
    image: (item.image as string) || '',
    is_active: item.is_active !== false,
    is_purchasable: purchasable,
  } as Product;
};

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
    // 缓存版本号：管理后台修改商品后版本递增，强制失效缓存
    if (isExpired || getCacheVersion() !== (parsed as any)._cacheVersion) return null
    return parsed.data.map(normalizeProduct).filter((p) => p.is_active !== false)
  } catch {
    return null
  }
}

const writeProductsCache = (data: Record<string, unknown>[]): void => {
  try {
    const payload = JSON.stringify({ timestamp: Date.now(), data, _cacheVersion: getCacheVersion() })
    if (new Blob([payload]).size > CACHE_MAX_SIZE_BYTES) {
      return
    }
    localStorage.setItem(CACHE_KEY, payload)
  } catch {
    // 忽略本地缓存写入失败
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
    // 检查内存中的缓存版本是否过期
    const currentVersion = getCacheVersion()
    const memoryVersion = (productsData as any)._cacheVersion || 0
    if (force || memoryVersion !== currentVersion) {
      productsData.value = [];
      (productsData as any)._cacheVersion = currentVersion
    }

    if (!force && productsData.value.length > 0) {
      return productsData.value
    }

    if (!force) {
      const cached = readProductsCache()
      if (cached?.length) {
        (productsData as any)._cacheVersion = currentVersion
        productsData.value = cached
        return cached
      }
    }

    fetchError.value = ''
    isFetchingProducts.value = true

    try {
      // 注意：不再用 .eq('is_active', true) 在 DB 层过滤。
      // 原因：mergeWithFallback 会按 id 合并 fallback 商品，若 DB 过滤掉 is_active=false 的商品，
      // fallback 中同 id 的商品（默认 is_active=undefined → 归一化为 true）会被"复活"，
      // 导致管理员无法通过 DB 设置 is_active=false 下架 fallback 列表中的商品（如吉祥物公仔 id=501）。
      // 改为：DB 拉取全部商品，mergeWithFallback 时 DB 优先（is_active=false 的商品保留 DB 状态），
      // 合并后在 normalizeProduct 之后统一按 is_active 过滤展示。
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('id', { ascending: true })
        .limit(200)

      if (error) throw error

      // DB 有数据时信任 DB，不再合并静态 fallback，避免：
      //   1) DB 中已删除的商品从 fallback 复活
      //   2) 管理员更换图片后仍显示旧图（缓存覆盖问题由 _cacheVersion 解决）
      // DB 为空时仍使用 fallback 兜底
      const sourceData = (data && data.length > 0) ? data : await getFallbackProducts()
      const latestProducts = sourceData
        .map(normalizeProduct)
        .filter((p) => p.is_active !== false)

      productsData.value = latestProducts
      writeProductsCache(sourceData)
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
    bumpCacheVersion,
    clearProductCache,
  }
})
