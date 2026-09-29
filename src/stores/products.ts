import { defineStore } from 'pinia';
import { ref } from 'vue';
import { supabase } from '@/utils/supabase-client';
import { logger } from '@/utils/logger.js';
import type { Product, ProductSpec } from '@/types';

// 延迟加载 fallback 产品数据，避免打包到初始 chunk
let _fallbackProducts: Record<string, unknown>[] | null = null;
const getFallbackProducts = async (): Promise<Record<string, unknown>[]> => {
  if (_fallbackProducts) return _fallbackProducts;
  const mod = await import('@/data/products');
  _fallbackProducts = mod.products as Record<string, unknown>[];
  return _fallbackProducts;
};

const CACHE_KEY = 'boh_products_cache_v4';
const CACHE_TTL_MS = 2 * 60 * 1000;
const CACHE_MAX_SIZE_BYTES = 500 * 1024;
const CACHE_VERSION_KEY = 'boh_products_cache_version_v4';

// 缓存版本号：管理后台修改商品后 +1，store 检测版本变化自动失效缓存
const getCacheVersion = (): number => {
  try {
    return parseInt(localStorage.getItem(CACHE_VERSION_KEY) || '0', 10) || 0;
  } catch {
    return 0;
  }
};
const bumpCacheVersion = (): void => {
  try {
    localStorage.setItem(CACHE_VERSION_KEY, String(getCacheVersion() + 1));
  } catch {
    /* 隐私模式 / 配额满时 localStorage 写入会抛。缓存版本号只是「失效标记」，
       写不进去最多让下次多读一次旧数据，不影响正确性，故静默。 */
  }
};
const clearProductCache = (): void => {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    /* 同上：清缓存失败不改变行为，只是内存里那份仍然可用。 */
  }
};

const normalizeSpecs = (specifications: unknown): ProductSpec[] => {
  if (Array.isArray(specifications)) {
    return specifications as ProductSpec[];
  }

  if (typeof specifications === 'string') {
    try {
      const parsed = JSON.parse(specifications);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
};

const normalizeProduct = (item: Record<string, unknown>): Product => {
  const mode = String(item.payment_mode || 'points_only');
  const hasPoints = Number.isFinite(Number(item.points_cost)) && Number(item.points_cost) > 0;
  const hasRmb = Number.isFinite(Number(item.rmb_price)) && Number(item.rmb_price) > 0;
  const purchasable =
    item.is_purchasable !== false &&
    (mode === 'points_only' ? hasPoints : mode === 'rmb_only' ? hasRmb : hasPoints && hasRmb);

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
  timestamp: number;
  data: Record<string, unknown>[];
}

const readProductsCache = (): Product[] | null => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed: ProductsCache = JSON.parse(raw);
    if (!parsed?.timestamp || !Array.isArray(parsed?.data)) return null;
    const isExpired = Date.now() - parsed.timestamp > CACHE_TTL_MS;
    // 缓存版本号：管理后台修改商品后版本递增，强制失效缓存
    if (isExpired || getCacheVersion() !== (parsed as any)._cacheVersion) return null;
    return parsed.data.map(normalizeProduct).filter((p) => p.is_active !== false);
  } catch {
    return null;
  }
};

const writeProductsCache = (data: Record<string, unknown>[]): void => {
  try {
    const payload = JSON.stringify({
      timestamp: Date.now(),
      data,
      _cacheVersion: getCacheVersion(),
    });
    if (new Blob([payload]).size > CACHE_MAX_SIZE_BYTES) {
      return;
    }
    localStorage.setItem(CACHE_KEY, payload);
  } catch {
    // 忽略本地缓存写入失败
  }
};

export const useProductsStore = defineStore('products', () => {
  const productsData = ref<Product[]>([]);
  const isFetchingProducts = ref(false);
  const fetchError = ref('');

  const fetchProducts = async ({ force = false }: { force?: boolean } = {}): Promise<Product[]> => {
    // 检查内存中的缓存版本是否过期
    const currentVersion = getCacheVersion();
    const memoryVersion = (productsData as any)._cacheVersion || 0;
    if (force || memoryVersion !== currentVersion) {
      productsData.value = [];
      (productsData as any)._cacheVersion = currentVersion;
    }

    if (!force && productsData.value.length > 0) {
      return productsData.value;
    }

    if (!force) {
      const cached = readProductsCache();
      if (cached?.length) {
        (productsData as any)._cacheVersion = currentVersion;
        productsData.value = cached;
        return cached;
      }
    }

    fetchError.value = '';
    isFetchingProducts.value = true;

    try {
      // 注意：不在 DB 层用 .eq('is_active', true) 过滤，改为拉全量、在 normalizeProduct 之后
      // 统一按 is_active 过滤（见下方 latestProducts 那行）。
      // ⚠️ 2026-09-29 更正：原注释把这条决定的**理由**挂在 `mergeWithFallback` 上（声称「按 id 合并
      // fallback 商品会让 DB 里已下架的商品被复活」）。但那个函数自 4.9.0 起就不再被调用，已同日删除；
      // 现在的取数规则是「DB 有数据就完全信任 DB，只有 DB 为空才走静态兜底」——见下方 sourceData 那行。
      // 过滤位置保持不变（这是**当前**行为），只是不再引用一个已不存在的合并步骤当理由。
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('id', { ascending: true })
        .limit(200);

      if (error) throw error;

      // DB 有数据时信任 DB，不再合并静态 fallback，避免：
      //   1) DB 中已删除的商品从 fallback 复活
      //   2) 管理员更换图片后仍显示旧图（缓存覆盖问题由 _cacheVersion 解决）
      // DB 为空时仍使用 fallback 兜底
      const sourceData = data && data.length > 0 ? data : await getFallbackProducts();
      const latestProducts = sourceData.map(normalizeProduct).filter((p) => p.is_active !== false);

      productsData.value = latestProducts;
      writeProductsCache(sourceData);
      return latestProducts;
    } catch (error) {
      logger.error('products-store', '获取产品列表失败', error);
      fetchError.value = (error as Error)?.message || 'PRODUCTS_FETCH_FAILED';

      // 网络异常/权限异常时回退静态数据，保障商店可用
      const fallback = await getFallbackProducts();
      productsData.value = fallback.map((p: Record<string, unknown>) => normalizeProduct(p));
      writeProductsCache(fallback);
      return productsData.value;
    } finally {
      isFetchingProducts.value = false;
    }
  };

  const resetState = (): void => {
    productsData.value = [];
    isFetchingProducts.value = false;
    fetchError.value = '';
    localStorage.removeItem(CACHE_KEY); // 修复：清理 localStorage 缓存
  };

  return {
    productsData,
    isFetchingProducts,
    fetchError,
    fetchProducts,
    resetState,
    bumpCacheVersion,
    clearProductCache,
  };
});
