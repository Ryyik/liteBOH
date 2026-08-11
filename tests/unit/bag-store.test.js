import { describe, it, expect, beforeEach, vi } from 'vitest';
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
        '规格A'
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
        '规格A'
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
        { id: 1, points_cost: 100, quantity: 1, selectedSpec: 'spec-a', selectedSpecLabel: '规格A' }
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
        { id: 2, points_cost: 0, quantity: 1 }
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
        { id: 2, points_cost: 100, quantity: 1, is_purchasable: false }
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
});
