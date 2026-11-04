import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useBagStore } from '../../src/stores/bag.ts';

describe('bag store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    // Reset the store's internal state
    const store = useBagStore();
    store.resetState();
  });

  describe('addToBag', () => {
    it('adds a product with valid points_cost', () => {
      const store = useBagStore();
      const result = store.addToBag(
        { id: 1, points_cost: 100, name: '测试商品' },
        'spec-a',
        '规格A',
      );
      expect(result.ok).toBe(true);
      expect(store.shoppingBag).toHaveLength(1);
      expect(store.shoppingBag[0].id).toBe(1);
      expect(store.shoppingBag[0].points_cost).toBe(100);
      expect(store.shoppingBag[0].quantity).toBe(1);
      expect(store.shoppingBag[0].selectedSpec).toBe('spec-a');
    });

    it('rejects product with zero points_cost', () => {
      const store = useBagStore();
      const result = store.addToBag({ id: 1, points_cost: 0 }, 'spec-a', '规格A');
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('PRODUCT_NOT_EXCHANGEABLE');
      expect(store.shoppingBag).toHaveLength(0);
    });

    it('rejects a product marked unavailable for purchase without changing its price', () => {
      const store = useBagStore();
      const result = store.addToBag(
        { id: 1, points_cost: 100, is_purchasable: false },
        'spec-a',
        '规格A',
      );
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('PRODUCT_NOT_EXCHANGEABLE');
      expect(store.shoppingBag).toHaveLength(0);
    });

    it('rejects product with negative points_cost', () => {
      const store = useBagStore();
      const result = store.addToBag({ id: 1, points_cost: -10 }, 'spec-a', '规格A');
      expect(result.ok).toBe(false);
    });

    it('rejects product with non-numeric points_cost', () => {
      const store = useBagStore();
      const result = store.addToBag({ id: 1, points_cost: 'abc' }, 'spec-a', '规格A');
      expect(result.ok).toBe(false);
    });

    it('increments quantity for same product and spec', () => {
      const store = useBagStore();
      store.addToBag({ id: 1, points_cost: 100 }, 'spec-a', '规格A');
      store.addToBag({ id: 1, points_cost: 100 }, 'spec-a', '规格A');
      expect(store.shoppingBag).toHaveLength(1);
      expect(store.shoppingBag[0].quantity).toBe(2);
    });

    it('adds separate entry for different spec of same product', () => {
      const store = useBagStore();
      store.addToBag({ id: 1, points_cost: 100 }, 'spec-a', '规格A');
      store.addToBag({ id: 1, points_cost: 100 }, 'spec-b', '规格B');
      expect(store.shoppingBag).toHaveLength(2);
    });
  });

  describe('updateBagItemQuantity', () => {
    it('increases quantity by delta', () => {
      const store = useBagStore();
      store.addToBag({ id: 1, points_cost: 100 }, 'spec-a', '规格A');
      store.updateBagItemQuantity(1, 'spec-a', 1);
      expect(store.shoppingBag[0].quantity).toBe(2);
    });

    it('decreases quantity by delta', () => {
      const store = useBagStore();
      store.addToBag({ id: 1, points_cost: 100 }, 'spec-a', '规格A');
      store.addToBag({ id: 1, points_cost: 100 }, 'spec-a', '规格A');
      store.updateBagItemQuantity(1, 'spec-a', -1);
      expect(store.shoppingBag[0].quantity).toBe(1);
    });

    it('removes item when quantity drops to zero', () => {
      const store = useBagStore();
      store.addToBag({ id: 1, points_cost: 100 }, 'spec-a', '规格A');
      store.updateBagItemQuantity(1, 'spec-a', -1);
      expect(store.shoppingBag).toHaveLength(0);
    });

    it('does nothing for non-existent product', () => {
      const store = useBagStore();
      store.updateBagItemQuantity(999, 'spec-a', 1);
      expect(store.shoppingBag).toHaveLength(0);
    });
  });

  describe('removeFromBag', () => {
    it('removes specific product by id and spec', () => {
      const store = useBagStore();
      store.addToBag({ id: 1, points_cost: 100 }, 'spec-a', '规格A');
      store.addToBag({ id: 2, points_cost: 200 }, 'spec-b', '规格B');
      store.removeFromBag(1, 'spec-a');
      expect(store.shoppingBag).toHaveLength(1);
      expect(store.shoppingBag[0].id).toBe(2);
    });
  });

  describe('clearBag', () => {
    it('clears all items', () => {
      const store = useBagStore();
      store.addToBag({ id: 1, points_cost: 100 }, 'spec-a', '规格A');
      store.addToBag({ id: 2, points_cost: 200 }, 'spec-b', '规格B');
      store.clearBag();
      expect(store.shoppingBag).toHaveLength(0);
    });
  });

  describe('loadShoppingBag', () => {
    it('loads from localStorage with valid data', () => {
      const validBag = JSON.stringify([
        {
          id: 1,
          points_cost: 100,
          quantity: 1,
          selectedSpec: 'spec-a',
          selectedSpecLabel: '规格A',
        },
      ]);
      localStorage.setItem('boh_shopping_bag', validBag);

      const store = useBagStore();
      store.loadShoppingBag();
      expect(store.shoppingBag).toHaveLength(1);
      expect(store.shoppingBag[0].quantity).toBe(1);
    });

    it('filters out items with zero points_cost', () => {
      const mixedBag = JSON.stringify([
        { id: 1, points_cost: 100, quantity: 1 },
        { id: 2, points_cost: 0, quantity: 1 },
      ]);
      localStorage.setItem('boh_shopping_bag', mixedBag);

      const store = useBagStore();
      store.loadShoppingBag();
      expect(store.shoppingBag).toHaveLength(1);
      expect(store.shoppingBag[0].id).toBe(1);
    });

    it('filters out products explicitly marked unavailable for purchase', () => {
      const mixedBag = JSON.stringify([
        { id: 1, points_cost: 100, quantity: 1, is_purchasable: true },
        { id: 2, points_cost: 100, quantity: 1, is_purchasable: false },
      ]);
      localStorage.setItem('boh_shopping_bag', mixedBag);

      const store = useBagStore();
      store.loadShoppingBag();
      expect(store.shoppingBag).toHaveLength(1);
      expect(store.shoppingBag[0].id).toBe(1);
    });

    it('handles invalid JSON gracefully', () => {
      localStorage.setItem('boh_shopping_bag', 'not-json');
      const store = useBagStore();
      store.loadShoppingBag();
      expect(store.shoppingBag).toHaveLength(0);
    });

    it('handles empty localStorage', () => {
      const store = useBagStore();
      store.loadShoppingBag();
      expect(store.shoppingBag).toHaveLength(0);
    });
  });

  describe('resetState', () => {
    it('clears bag and localStorage', () => {
      const store = useBagStore();
      store.addToBag({ id: 1, points_cost: 100 }, 'spec-a', '规格A');
      store.resetState();
      expect(store.shoppingBag).toHaveLength(0);
      expect(localStorage.getItem('boh_shopping_bag')).toBeNull();
    });
  });

  /* 对账（2026-11-04）：袋子存的是加购快照，服务端按 products 重算 ⇒
     不在这里对齐，就会出现「显示价 ≠ 实扣价」和「下架商品一直躺在袋里」。 */
  describe('reconcileBag', () => {
    const seed = (store, overrides = {}) => {
      store.addToBag({ id: 1, points_cost: 40, quantity: 1, stock: 20 }, 'spec-a', '规格A');
      Object.assign(store.shoppingBag[0], overrides);
    };

    it('移出已从在售列表消失的商品（下架/删除）', () => {
      const store = useBagStore();
      store.addToBag({ id: 1, points_cost: 100, stock: 9 }, 'spec-a', '规格A');
      store.addToBag({ id: 2, points_cost: 100, stock: 9 }, 'spec-b', '规格B');
      const result = store.reconcileBag([{ id: 2, points_cost: 100, stock: 9 }]);
      expect(result.removed).toBe(1);
      expect(store.shoppingBag).toHaveLength(1);
      expect(store.shoppingBag[0].id).toBe(2);
    });

    it('移出标记为不可兑换的商品', () => {
      const store = useBagStore();
      store.addToBag({ id: 1, points_cost: 100, stock: 9 }, 'spec-a', '规格A');
      const result = store.reconcileBag([
        { id: 1, points_cost: 100, stock: 9, is_purchasable: false },
      ]);
      expect(result.removed).toBe(1);
      expect(store.shoppingBag).toHaveLength(0);
    });

    it('价格同步成实时值（快照 40 → 实时 60），并计入 updated', () => {
      const store = useBagStore();
      seed(store);
      const result = store.reconcileBag([{ id: 1, points_cost: 60, stock: 20 }]);
      expect(store.shoppingBag[0].points_cost).toBe(60);
      expect(result.updated).toBe(1);
    });

    it('数量夹到库存上限（买 5 件、只剩 2 件 → 2 件）', () => {
      const store = useBagStore();
      seed(store, { quantity: 5 });
      store.reconcileBag([{ id: 1, points_cost: 40, stock: 2 }]);
      expect(store.shoppingBag[0].quantity).toBe(2);
    });

    it('售罄不删，只把 stock 写成 0（删了用户会以为自己点错了）', () => {
      const store = useBagStore();
      seed(store);
      const result = store.reconcileBag([{ id: 1, points_cost: 40, stock: 0 }]);
      expect(result.removed).toBe(0);
      expect(store.shoppingBag).toHaveLength(1);
      expect(store.shoppingBag[0].stock).toBe(0);
      expect(store.shoppingBag[0].quantity).toBe(1);
    });

    it('商品表请求失败（空数组）时不动袋子 —— 否则会把用户袋子清空', () => {
      const store = useBagStore();
      seed(store);
      const result = store.reconcileBag([]);
      expect(result).toEqual({ removed: 0, updated: 0 });
      expect(store.shoppingBag).toHaveLength(1);
    });

    it('价格没变时不产生 updated（避免每次进站都弹"价格已更新"）', () => {
      const store = useBagStore();
      seed(store, { stock: 20 });
      const result = store.reconcileBag([{ id: 1, points_cost: 40, stock: 20 }]);
      expect(result).toEqual({ removed: 0, updated: 0 });
    });
  });
});
