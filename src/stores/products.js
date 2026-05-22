import { defineStore } from 'pinia';
import { ref } from 'vue';
import { supabase } from '@/utils/supabase-client';
import { products as fallbackProducts } from '@/data/products';
import { logger } from '@/utils/logger.js';

const CACHE_KEY = 'boh_products_cache_v1';
const CACHE_TTL_MS = 5 * 60 * 1000;

const normalizeSpecs = (specifications) => {
  if (Array.isArray(specifications)) {
    return specifications;
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

const normalizeProduct = (item) => ({
  ...item,
  id: Number(item.id),
  points_cost: Number.isFinite(Number(item.points_cost))
    ? Math.max(0, Math.round(Number(item.points_cost)))
    : 0,
  specifications: normalizeSpecs(item.specifications),
  image: item.image || ''
});

const readProductsCache = () => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.timestamp || !Array.isArray(parsed?.data)) return null;
    const isExpired = Date.now() - parsed.timestamp > CACHE_TTL_MS;
    if (isExpired) return null;
    return parsed.data.map(normalizeProduct);
  } catch {
    return null;
  }
};

const writeProductsCache = (data) => {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ timestamp: Date.now(), data })
    );
  } catch {
    // 忽略本地缓存写入失败（例如隐私模式/配额限制）
  }
};

export const useProductsStore = defineStore('products', () => {
  const productsData = ref([]);
  const isFetchingProducts = ref(false);
  const fetchError = ref('');

  const fetchProducts = async ({ force = false } = {}) => {
    if (!force && productsData.value.length > 0) {
      return productsData.value;
    }

    if (!force) {
      const cached = readProductsCache();
      if (cached?.length) {
        productsData.value = cached;
        return cached;
      }
    }

    fetchError.value = '';
    isFetchingProducts.value = true;

    try {
      const { data, error } = await supabase
        .from('products')
        .select('id, category, title, description, points_cost, stock, image, specifications, is_active')
        .eq('is_active', true)
        .order('id', { ascending: true });

      if (error) throw error;

      const latestProducts = (data || []).map(normalizeProduct);
      if (latestProducts.length > 0) {
        productsData.value = latestProducts;
        writeProductsCache(latestProducts);
        return latestProducts;
      }

      // 数据库可连通但表为空时，避免白屏，回退到静态数据
      productsData.value = fallbackProducts.map(normalizeProduct);
      return productsData.value;
    } catch (error) {
      logger.error('products-store', '获取产品列表失败', error);
      fetchError.value = error?.message || 'PRODUCTS_FETCH_FAILED';

      // 网络异常/权限异常时回退静态数据，保障商店可用
      productsData.value = fallbackProducts.map(normalizeProduct);
      return productsData.value;
    } finally {
      isFetchingProducts.value = false;
    }
  };

  const resetState = () => {
    productsData.value = [];
    isFetchingProducts.value = false;
    fetchError.value = '';
  };

  return {
    productsData,
    isFetchingProducts,
    fetchError,
    fetchProducts,
    resetState
  };
});
