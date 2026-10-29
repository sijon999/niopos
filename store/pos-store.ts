import { create } from 'zustand';
import type { CartItem, Product, Customer } from '@/types';

export function calcLineDiscount(item: Pick<CartItem, 'price' | 'quantity' | 'discount_type' | 'discount_value'>): number {
  const lineSubtotal = item.price * item.quantity;
  const dtype = item.discount_type || 'percentage';
  const dval = item.discount_value || 0;
  if (dval <= 0) return 0;
  if (dtype === 'percentage') {
    const pct = Math.min(Math.max(dval, 0), 100);
    return Math.round(lineSubtotal * pct / 100 * 100) / 100;
  }
  const fixed = dval * item.quantity;
  return Math.min(Math.max(fixed, 0), lineSubtotal);
}

export function calcLineTotal(item: Pick<CartItem, 'price' | 'quantity' | 'discount_type' | 'discount_value'>): number {
  const lineSubtotal = item.price * item.quantity;
  return Math.round((lineSubtotal - calcLineDiscount(item)) * 100) / 100;
}

type POSState = {
  cart: CartItem[];
  selectedCustomer: Customer | null;
  discount: number;
  paymentMethod: string;
  searchQuery: string;
  selectedCategory: string;
  paidAmount: number;
  addToCart: (product: Product) => void;
  removeFromCart: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  updateItemDiscount: (productId: string, discountType: 'percentage' | 'fixed', discountValue: number) => void;
  clearCart: () => void;
  setCustomer: (customer: Customer | null) => void;
  setDiscount: (discount: number) => void;
  setPaymentMethod: (method: string) => void;
  setSearchQuery: (query: string) => void;
  setSelectedCategory: (category: string) => void;
  setPaidAmount: (amount: number) => void;
  getSubtotal: () => number;
  getItemDiscounts: () => number;
  getTax: () => number;
  getTotal: () => number;
};

export const usePOSStore = create<POSState>((set, get) => ({
  cart: [],
  selectedCustomer: null,
  discount: 0,
  paymentMethod: 'cash',
  searchQuery: '',
  selectedCategory: 'all',
  paidAmount: 0,

  addToCart: (product) => {
    const cart = get().cart;
    const existing = cart.find((item) => item.product_id === product.id);
    if (existing) {
      if (existing.quantity >= product.stock) return;
      set({
        cart: cart.map((item) =>
          item.product_id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        ),
      });
    } else {
      set({
        cart: [
          ...cart,
          {
            product_id: product.id,
            name: product.name,
            price: product.discount_price || product.selling_price,
            quantity: 1,
            stock: product.stock,
            image_url: product.image_url,
            discount_type: 'percentage',
            discount_value: 0,
          },
        ],
      });
    }
  },

  removeFromCart: (productId) =>
    set((state) => ({
      cart: state.cart.filter((item) => item.product_id !== productId),
    })),

  updateQuantity: (productId, quantity) =>
    set((state) => ({
      cart: state.cart.map((item) =>
        item.product_id === productId
          ? { ...item, quantity: Math.max(1, Math.min(quantity, item.stock)) }
          : item
      ),
    })),

  updateItemDiscount: (productId, discountType, discountValue) =>
    set((state) => ({
      cart: state.cart.map((item) =>
        item.product_id === productId
          ? { ...item, discount_type: discountType, discount_value: Math.max(0, discountValue) }
          : item
      ),
    })),

  clearCart: () =>
    set({ cart: [], selectedCustomer: null, discount: 0, paymentMethod: 'cash', paidAmount: 0 }),

  setCustomer: (customer) => set({ selectedCustomer: customer }),
  setDiscount: (discount) => set({ discount }),
  setPaymentMethod: (method) => set({ paymentMethod: method }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setSelectedCategory: (category) => set({ selectedCategory: category }),
  setPaidAmount: (amount) => set({ paidAmount: amount }),

  getSubtotal: () =>
    get().cart.reduce((sum, item) => sum + item.price * item.quantity, 0),

  getItemDiscounts: () =>
    get().cart.reduce((sum, item) => sum + calcLineDiscount(item), 0),

  getTax: () => {
    const subtotal = get().getSubtotal();
    const itemDiscounts = get().getItemDiscounts();
    const afterDiscount = subtotal - itemDiscounts - get().discount;
    return Math.round(Math.max(0, afterDiscount) * 0.05 * 100) / 100;
  },

  getTotal: () => {
    const subtotal = get().getSubtotal();
    const itemDiscounts = get().getItemDiscounts();
    const tax = get().getTax();
    return Math.round((subtotal - itemDiscounts - get().discount + tax) * 100) / 100;
  },
}));
