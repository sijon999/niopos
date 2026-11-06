'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import NextImage from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  ScanLine,
  Plus,
  Minus,
  Trash2,
  ShoppingCart,
  X,
  CreditCard,
  Banknote,
  Smartphone,
  Building2,
  Percent,
  Receipt,
  CheckCircle2,
  Printer,
  Pause,
  Play,
  UserPlus,
  UserRound,
  Delete,
  Keyboard,
  Gift,
  ChevronDown,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { usePOSStore, calcLineDiscount, calcLineTotal } from '@/store/pos-store';
import { supabase } from '@/lib/supabase';
import type { Product, Category, Customer, Settings } from '@/types';
import { ThermalReceipt } from '@/components/thermal-receipt';
import { fetchEligibleOffers, calculateOfferDiscount, formatOfferLabel, checkMinimumPurchase, type EligibleOffer } from '@/lib/discount';
import { toast } from 'sonner';
import { useTranslation } from '@/hooks/use-translation';
import { useConfirmation } from '@/hooks/use-confirmation';

const paymentMethods = [
  { id: 'cash', icon: Banknote },
  { id: 'card', icon: CreditCard },
  { id: 'mobile', icon: Smartphone },
  { id: 'bank', icon: Building2 },
  { id: 'due', icon: Percent },
];

export default function POSPage() {
  const { t, locale } = useTranslation();
  const { confirmAction, dialog: confirmationDialog } = useConfirmation();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [storeSettings, setStoreSettings] = useState<Pick<Settings, 'store_name' | 'store_address' | 'store_phone' | 'store_email' | 'currency_symbol' | 'tax_rate' | 'receipt_footer' | 'domain' | 'trade_license_no' | 'tax_no'> | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [lastInvoice, setLastInvoice] = useState<any>(null);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [heldOrders, setHeldOrders] = useState<any[]>([]);
  const [heldOrdersOpen, setHeldOrdersOpen] = useState(false);
  const [addCustomerOpen, setAddCustomerOpen] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '' });
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [brands, setBrands] = useState<any[]>([]);
  const [eligibleOffers, setEligibleOffers] = useState<EligibleOffer[]>([]);
  const [selectedOffer, setSelectedOffer] = useState<EligibleOffer | null>(null);
  const [showKeypad, setShowKeypad] = useState(false);
  const [keypadValue, setKeypadValue] = useState('');
  const [shortcutHint, setShortcutHint] = useState(false);
  const [printPortalReady, setPrintPortalReady] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const keyboardActionsRef = useRef({
    handleCheckout: () => {},
    handleHoldOrder: () => {},
  });

  useEffect(() => {
    setPrintPortalReady(true);
  }, []);

  const {
    cart,
    selectedCustomer,
    discount,
    paymentMethod,
    selectedOfferId,
    searchQuery,
    selectedCategory,
    selectedBrand: brandFilter,
    paidAmount,
    addToCart,
    removeFromCart,
    updateQuantity,
    updateItemDiscount,
    clearCart,
    setCustomer,
    setDiscount,
    setPaymentMethod,
    setSelectedOfferId,
    setSearchQuery,
    setSelectedCategory,
    setSelectedBrand: setBrandFilter,
    setPaidAmount,
    getSubtotal,
    getItemDiscounts,
    getTax,
    getTotal,
  } = usePOSStore();

  const clearTransaction = useCallback(() => {
    clearCart();
    setSelectedOffer(null);
    setSelectedOfferId(null);
  }, [clearCart, setSelectedOffer, setSelectedOfferId]);

  useEffect(() => {
    async function loadData() {
      const [prodRes, catRes, custRes, brandRes, heldRes, settingsRes] = await Promise.all([
        supabase.from('products').select('*, brands(name), categories(name)').eq('status', 'active').order('name'),
        supabase.from('categories').select('*').eq('status', 'active').order('name'),
        supabase.from('customers').select('*').eq('status', 'active').order('name'),
        supabase.from('brands').select('*').eq('status', 'active').order('name'),
        supabase.from('held_orders').select('*').eq('status', 'held').order('hold_time', { ascending: false }),
        supabase.from('settings').select('store_name, store_address, store_phone, store_email, currency_symbol, tax_rate, receipt_footer, domain, trade_license_no, tax_no').maybeSingle(),
      ]);
      setProducts(prodRes.data || []);
      setCategories(catRes.data || []);
      setCustomers(custRes.data || []);
      setBrands(brandRes.data || []);
      setHeldOrders(heldRes.data || []);
      if (settingsRes.error) {
        toast.error(`${t('settings.loadFailed')}: ${settingsRes.error.message}`);
      } else if (settingsRes.data) {
        setStoreSettings(settingsRes.data);
      } else {
        toast.error(t('settings.notConfigured'));
      }
      const selectedCustomerId = usePOSStore.getState().selectedCustomerId;
      if (selectedCustomerId && custRes.data) {
        setCustomer(custRes.data.find((customer) => customer.id === selectedCustomerId) || null);
      }
      setLoading(false);
    }
    loadData();
  }, [setCustomer, t]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      // Don't trigger when typing in inputs
      const tag = (e.target as HTMLElement)?.tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      if (e.key === 'F2' && !isInput) {
        e.preventDefault();
        const sel = document.querySelector('select') as HTMLSelectElement;
        if (sel) sel.focus();
      } else if (e.key === 'F3') {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === 'F4') {
        e.preventDefault();
        keyboardActionsRef.current.handleHoldOrder();
      } else if (e.key === 'F6') {
        e.preventDefault();
        const discountInput = document.getElementById('discount-input') as HTMLInputElement;
        discountInput?.focus();
      } else if (e.key === 'F8') {
        e.preventDefault();
        setCheckoutOpen(true);
      } else if (e.key === 'F9') {
        e.preventDefault();
        if (checkoutOpen) keyboardActionsRef.current.handleCheckout();
      } else if (e.key === 'Escape') {
        if (checkoutOpen) setCheckoutOpen(false);
        else if (heldOrdersOpen) setHeldOrdersOpen(false);
        else if (addCustomerOpen) setAddCustomerOpen(false);
        else clearTransaction();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [cart, checkoutOpen, heldOrdersOpen, addCustomerOpen, clearTransaction]);

  // Fetch eligible offers when customer or cart changes
  useEffect(() => {
    const subtotal = getSubtotal();
    const customerId = selectedCustomer?.id || null;
    fetchEligibleOffers(customerId, subtotal).then((offers) => {
      setEligibleOffers(offers);
      if (selectedOfferId) {
        const restoredOffer = offers.find((offer) => offer.id === selectedOfferId) || null;
        if (selectedOffer?.id !== restoredOffer?.id) setSelectedOffer(restoredOffer);
        if (!restoredOffer) setSelectedOfferId(null);
      } else if (selectedOffer && !offers.find((o) => o.id === selectedOffer.id)) {
        setSelectedOffer(null);
      }
    });
  }, [selectedCustomer, cart, getSubtotal, selectedOffer, selectedOfferId, setSelectedOfferId]);

  const itemDiscounts = getItemDiscounts();
  const currencySymbol = storeSettings?.currency_symbol ?? '';
  const taxRate = storeSettings?.tax_rate ?? 0;
  const maxExtraDiscount = Math.max(0, getSubtotal() - itemDiscounts);
  const appliedExtraDiscount = Math.min(discount, maxExtraDiscount);
  const offerDiscount = selectedOffer ? calculateOfferDiscount(selectedOffer, Math.max(0, maxExtraDiscount - appliedExtraDiscount)) : 0;
  const afterDiscount = maxExtraDiscount - appliedExtraDiscount - offerDiscount;
  const offerTax = Math.round(Math.max(0, afterDiscount) * (taxRate / 100) * 100) / 100;
  const grandTotal = Math.round((afterDiscount + offerTax) * 100) / 100;

  const customerSearchDigits = customerSearch.replace(/\D/g, '');
  const filteredCustomers = customers.filter((customer) => {
    if (customer.name === 'Walk-in Customer') return false;
    const matchesName = customer.name.toLowerCase().includes(customerSearch.toLowerCase());
    const matchesPhone =
      customerSearchDigits.length > 0 &&
      (customer.phone || '').replace(/\D/g, '').includes(customerSearchDigits);
    return matchesName || matchesPhone;
  });

  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      !searchQuery ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.barcode?.includes(searchQuery) ||
      p.sku?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || p.category_id === selectedCategory;
    const matchesBrand = brandFilter === 'all' || p.brand_id === brandFilter;
    return matchesSearch && matchesCategory && matchesBrand;
  });

  const handleBarcodeScan = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && barcodeInput) {
        const product = products.find((p) => p.barcode === barcodeInput);
        if (product) {
          addToCart(product);
          toast.success(t('pos.productAdded', { name: product.name }));
          setBarcodeInput('');
        } else {
          toast.error(t('pos.barcodeNotFound'));
        }
      }
    },
    [barcodeInput, products, addToCart, t]
  );

  const handleHoldOrder = async () => {
    if (cart.length === 0) {
      toast.error(t('pos.cartEmpty'));
      return;
    }
    const { error } = await supabase.from('held_orders').insert({
      order_data: { cart, customer: selectedCustomer, discount, paymentMethod, paidAmount, offerId: selectedOfferId },
      customer_name: selectedCustomer?.name || 'Walk-in',
      status: 'held',
    });
    if (!error) {
      toast.success(t('pos.orderHeld'));
      clearTransaction();
      const { data } = await supabase.from('held_orders').select('*').eq('status', 'held').order('hold_time', { ascending: false });
      setHeldOrders(data || []);
    }
  };

  const retrieveHeldOrder = async (order: any) => {
    await confirmAction({
      title: 'Retrieve held order',
      description: `Load the held order for ${order.customer_name || 'Walk-in'} into the current sale?`,
      confirmLabel: 'Yes, Retrieve',
      successMessage: t('pos.orderRetrieved'),
      action: async () => {
        const { error } = await supabase.from('held_orders').update({ status: 'retrieved' }).eq('id', order.id);
        if (error) throw error;
        const od = order.order_data;
        if (od.cart) {
          for (const item of od.cart) {
            addToCart({ ...item, id: item.product_id, selling_price: item.price, cost_price: 0, stock: item.stock } as Product);
          }
        }
        if (od.customer) setCustomer(od.customer);
        if (typeof od.discount === 'number') setDiscount(od.discount);
        if (od.paymentMethod) setPaymentMethod(od.paymentMethod);
        if (typeof od.paidAmount === 'number') setPaidAmount(od.paidAmount);
        if (typeof od.offerId === 'string') setSelectedOfferId(od.offerId);
        setHeldOrders((current) => current.filter((held) => held.id !== order.id));
        setHeldOrdersOpen(false);
      },
    });
  };

  const handleAddCustomer = async () => {
    if (!newCustomer.name || !newCustomer.phone) {
      toast.error(t('pos.namePhoneRequired'));
      return;
    }
    const { data, error } = await supabase
      .from('customers')
      .insert({ name: newCustomer.name, phone: newCustomer.phone, status: 'active' })
      .select()
      .single();
    if (!error && data) {
      setCustomers([...customers, data]);
      setCustomer(data);
      setAddCustomerOpen(false);
      setNewCustomer({ name: '', phone: '' });
      toast.success(t('pos.customerAdded'));
    }
  };

  const handleCheckout = async () => {
    if (cart.length === 0) {
      toast.error(t('pos.cartEmpty'));
      return;
    }
    if (!storeSettings) {
      toast.error(t('settings.notConfigured'));
      return;
    }

    const { data: saleData, error } = await supabase.rpc('complete_pos_sale', {
      p_cart: cart.map((item) => ({
        product_id: item.product_id,
        quantity: item.quantity,
        discount_type: item.discount_type || 'percentage',
        discount_value: item.discount_value || 0,
      })),
      p_customer_id: selectedCustomer?.id || null,
      p_discount: appliedExtraDiscount,
      p_payment_method: paymentMethod,
      p_paid_amount: paidAmount,
      p_offer_id: selectedOffer?.id || null,
    });

    if (error || !saleData) {
      toast.error(error?.message || t('pos.saleFailed'));
      return;
    }

    // Refresh products
    const { data: refreshed } = await supabase
      .from('products')
      .select('*, brands(name), categories(name)')
      .eq('status', 'active')
      .order('name');
    setProducts(refreshed || []);

    setLastInvoice({
      ...saleData,
      items: saleData.items.map((item: {
        id: string;
        name: string;
        sku: string | null;
        quantity: number;
        price: number;
        discount_amount: number;
        total: number;
      }) => ({
        id: item.id,
        name: item.name,
        sku: item.sku,
        quantity: Number(item.quantity),
        price: Number(item.price),
        discount_amount: Number(item.discount_amount),
        total: Number(item.total),
      })),
      customer: saleData.customer_name_snapshot
        ? {
            name: saleData.customer_name_snapshot,
            phone: saleData.customer_phone_snapshot,
            address: saleData.customer_address_snapshot,
          }
        : null,
    });
    setCheckoutOpen(false);
    setReceiptOpen(true);
    setEligibleOffers([]);
    clearTransaction();
    setPaidAmount(0);
    toast.success(t('pos.saleCompleted'));
  };

  keyboardActionsRef.current = { handleCheckout, handleHoldOrder };

  const keypadButtons = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '0', '00', '⌫'];

  const handleKeypad = (key: string) => {
    if (key === '⌫') {
      setKeypadValue(keypadValue.slice(0, -1));
    } else {
      setKeypadValue(keypadValue + key);
    }
  };

  const quickAmounts = [100, 500, 1000, 2000];

  return (
    <div className="-mt-4 grid h-[calc(100dvh-6rem)] min-h-[420px] grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2 sm:-mt-6 sm:h-[calc(100dvh-7rem)] sm:gap-3 lg:-mt-8 lg:h-[calc(100dvh-8rem)]">
      {/* Product selection area */}
      <div className="flex min-h-0 min-w-0 flex-col gap-2 sm:gap-4">
        {/* Search and filters */}
        <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-border/70 bg-card/90 p-3 shadow-sm sm:gap-3">
          <div className="relative min-w-[min(100%,220px)] flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              ref={searchRef}
              placeholder={t('pos.searchProductsShortcut')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-10 pl-10"
            />
          </div>
          <div className="relative min-w-[min(100%,180px)] flex-1 sm:flex-none">
            <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={t('pos.scanBarcode')}
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              onKeyDown={handleBarcodeScan}
              className="h-10 w-full pl-10 sm:w-44 xl:w-52"
            />
          </div>
          <Button variant="outline" onClick={() => setHeldOrdersOpen(true)} className="relative h-10 shrink-0 px-3">
            <Pause className="w-4 h-4 mr-1" /> {t('pos.held')}
            {heldOrders.length > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-amber-500 text-white text-xs flex items-center justify-center font-bold">
                {heldOrders.length}
              </span>
            )}
          </Button>
          <Button variant="outline" size="icon" onClick={() => setShortcutHint(!shortcutHint)} className="h-10 w-10 shrink-0" aria-label={t('pos.showShortcuts')}>
            <Keyboard className="w-4 h-4" />
          </Button>
        </div>

        {/* Shortcut hint */}
        {shortcutHint && (
          <Card className="rounded-xl p-3 text-xs text-muted-foreground">
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              <span><kbd className="px-1.5 py-0.5 bg-muted rounded font-mono">F2</kbd> {t('pos.customer')}</span>
              <span><kbd className="px-1.5 py-0.5 bg-muted rounded font-mono">F3</kbd> {t('common.search')}</span>
              <span><kbd className="px-1.5 py-0.5 bg-muted rounded font-mono">F4</kbd> {t('pos.holdSale')}</span>
              <span><kbd className="px-1.5 py-0.5 bg-muted rounded font-mono">F6</kbd> {t('pos.discount')}</span>
              <span><kbd className="px-1.5 py-0.5 bg-muted rounded font-mono">F8</kbd> {t('pos.payment')}</span>
              <span><kbd className="px-1.5 py-0.5 bg-muted rounded font-mono">F9</kbd> {t('pos.complete')}</span>
              <span><kbd className="px-1.5 py-0.5 bg-muted rounded font-mono">Esc</kbd> {t('pos.clearClose')}</span>
            </div>
          </Card>
        )}

        {/* Category + Brand filters */}
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} className="h-9 min-w-[130px] max-w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <option value="all">{t('pos.allCategories')}</option>
            {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
          </select>
          <select value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)} className="h-9 min-w-[130px] max-w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <option value="all">{t('pos.allBrands')}</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>

        {/* Product grid */}
        <ScrollArea className="min-h-0 flex-1">
          {loading ? (
            <div className="grid grid-cols-2 gap-2 pr-1 2xl:grid-cols-3 2xl:gap-3 2xl:pr-2">
              {Array.from({ length: 10 }).map((_, i) => <Card key={i} className="h-44 animate-pulse rounded-xl bg-muted/50" />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 pr-1 2xl:grid-cols-3 2xl:gap-3 2xl:pr-2">
              {filteredProducts.map((product, i) => (
                <motion.div key={product.id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.2, delay: i * 0.02 }}>
                  <Card className="group h-full cursor-pointer overflow-hidden rounded-xl border-border/70 transition-colors hover:border-primary/50 hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => { if (product.stock <= 0) { toast.error(t('pos.productOutOfStock', { name: product.name })); return; } addToCart(product); }}>
                    <div className="relative flex aspect-[3/2] items-center justify-center overflow-hidden bg-gradient-to-br from-amber-50 to-orange-100 dark:from-amber-950/30 dark:to-orange-900/20">
                      {product.image_url ? <NextImage src={product.image_url} alt={product.name} fill sizes="(max-width: 1280px) 50vw, 33vw" className="object-cover transition-transform duration-300 group-hover:scale-105" /> : <span className="text-4xl">{getProductEmoji(product.name)}</span>}
                      {product.stock <= 0 && <Badge className="absolute right-2 top-2 bg-rose-500">{t('inventory.outOfStock')}</Badge>}
                      {product.stock > 0 && product.stock < 10 && <Badge className="absolute right-2 top-2 bg-amber-500">{t('inventory.lowStock')}</Badge>}
                      {product.discount_price && <Badge className="absolute left-2 top-2 bg-rose-500">{t('pos.sale')}</Badge>}
                    </div>
                    <div className="flex min-h-[76px] flex-col p-2">
                      <p className="truncate text-[10px] leading-3 text-muted-foreground sm:text-xs sm:leading-4">{product.brands?.name || ' '}</p>
                      <h3 className="mt-0.5 min-h-8 line-clamp-2 text-xs font-semibold leading-4 sm:text-sm">{product.name}</h3>
                      <div className="mt-auto flex min-w-0 items-center justify-between gap-1 pt-1.5">
                        <span className="truncate text-xs font-bold text-amber-600 dark:text-amber-400 sm:text-sm">{currencySymbol}{product.discount_price || product.selling_price}</span>
                        <span className="shrink-0 text-[10px] text-muted-foreground sm:text-xs">{product.stock} {product.unit}</span>
                      </div>
                    </div>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
          {filteredProducts.length === 0 && !loading && (
            <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-card/40 px-4 text-center text-muted-foreground">
              <Search className="mb-3 h-10 w-10 opacity-50" />
              <p className="font-medium text-foreground">{t('pos.noProducts')}</p>
              <p className="mt-1 text-sm">{t('pos.tryDifferentFilter')}</p>
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Cart sidebar */}
      <Card className="flex min-h-0 min-w-0 w-full flex-col overflow-x-hidden overflow-y-auto rounded-xl border-border/70 bg-card shadow-sm">
        {/* Cart header */}
        <div className="shrink-0 space-y-1.5 border-b border-border/70 bg-muted/10 p-2 sm:space-y-1 sm:p-2">
          <div className="mb-0 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-primary" />
              <h2 className="truncate text-sm font-semibold leading-6 font-heading sm:text-base">{t('pos.currentSale')}</h2>
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={handleHoldOrder} className="h-8 px-1.5 text-xs text-amber-600 hover:bg-amber-500/10 sm:h-8 sm:px-2 sm:text-sm"><Pause className="mr-1 h-4 w-4" /> {t('pos.hold')}</Button>
              {cart.length > 0 && <Button variant="ghost" size="icon" onClick={clearCart} className="h-8 w-8 text-rose-600 hover:bg-rose-500/10" aria-label={t('pos.clearSale')}><Trash2 className="h-4 w-4" /></Button>}
            </div>
          </div>

          {/* Customer selector + add new */}
          <div className="space-y-0.5">
            <Label className="flex items-center gap-1 text-[10px] font-medium leading-3 text-muted-foreground sm:text-xs"><UserRound className="h-3 w-3" /> Customer</Label>
            <div className="flex min-w-0 gap-1.5">
              <Popover open={customerPickerOpen} onOpenChange={(open) => {
                setCustomerPickerOpen(open);
                if (!open) setCustomerSearch('');
              }}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" aria-expanded={customerPickerOpen} className="h-7 min-w-0 flex-1 justify-between px-2 text-xs font-normal">
                    <span className="truncate">{selectedCustomer ? `${selectedCustomer.name} · ${selectedCustomer.phone || ''}` : t('pos.walkInCustomer')}</span>
                    <ChevronDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder={t('pos.searchCustomer')}
                      value={customerSearch}
                      onValueChange={setCustomerSearch}
                      className="h-9 text-xs"
                    />
                    <CommandList>
                      <CommandItem
                        value="walk-in-customer"
                        onSelect={() => {
                          setCustomer(null);
                          setCustomerPickerOpen(false);
                        }}
                      >
                        {t('pos.walkInCustomer')}
                      </CommandItem>
                      {filteredCustomers.map((customer) => (
                        <CommandItem
                          key={customer.id}
                          value={customer.id}
                          onSelect={() => {
                            setCustomer(customer);
                            setCustomerPickerOpen(false);
                          }}
                        >
                          <span className="truncate">{customer.name} · {customer.phone || ''}</span>
                        </CommandItem>
                      ))}
                      {customerSearch && filteredCustomers.length === 0 && (
                        <CommandEmpty>{t('customers.noCustomers')}</CommandEmpty>
                      )}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <Button variant="outline" size="icon" onClick={() => setAddCustomerOpen(true)} title={`${t('pos.addNewCustomer')} (F2)`} className="h-7 w-7 shrink-0">
                <UserPlus className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Discount Offer selector */}
          <div className="space-y-1 rounded-lg border border-border/70 bg-background/60 p-1.5 sm:space-y-1 sm:p-1.5">
            <Label className="flex items-center gap-1 text-[10px] font-medium leading-3 text-muted-foreground sm:text-xs"><Gift className="h-3 w-3" /> {t('pos.discountOffer')}</Label>
            <select
              value={selectedOffer?.id || ''}
              onChange={(e) => {
                const offer = eligibleOffers.find((o) => o.id === e.target.value) || null;
                if (offer) {
                  const check = checkMinimumPurchase(offer, getSubtotal());
                  if (!check.valid) {
                    toast.error(t('pos.minimumPurchaseNotMet'));
                    setSelectedOffer(null);
                    setSelectedOfferId(null);
                    return;
                  }
                }
                setSelectedOffer(offer);
                setSelectedOfferId(offer?.id ?? null);
              }}
              className="h-7 w-full min-w-0 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-3"
            >
              <option value="">{t('pos.noDiscount')}</option>
              {eligibleOffers.map((offer) => (
                <option key={offer.id} value={offer.id}>
                  {formatOfferLabel(offer)}
                  {Number(offer.minimum_purchase) > 0 ? ` (Min: ${currencySymbol}${Number(offer.minimum_purchase).toFixed(0)})` : ''}
                </option>
              ))}
            </select>
            {eligibleOffers.length === 0 && cart.length > 0 && (
              <p className="text-xs leading-4 text-muted-foreground">{t('pos.noActiveOffers')}</p>
            )}
            {selectedOffer && (
              <button
                onClick={() => {
                  setSelectedOffer(null);
                  setSelectedOfferId(null);
                }}
                className="flex items-center gap-1 text-xs text-rose-600 hover:text-rose-700"
              >
                <X className="w-3 h-3" /> {t('pos.removeDiscount')}
              </button>
            )}
          </div>
        </div>

        {/* Cart items */}
        <div className="w-full min-w-0 flex-none">
          <div className={`space-y-2 ${cart.length === 0 ? 'p-1.5 sm:p-2' : 'p-2'}`}>
            {cart.length === 0 ? (
              <div className="flex h-full min-h-[280px] w-full flex-col items-center justify-center rounded-xl border border-dashed border-border/70 bg-muted/10 px-4 text-center text-muted-foreground">
                <ShoppingCart className="mb-3 h-10 w-10 opacity-30" />
                <p className="text-sm font-medium text-foreground/80">{t('pos.cartEmpty')}</p>
                <p className="mt-1 text-xs leading-5">{t('pos.clickProductsToAdd')}</p>
              </div>
            ) : (
              <AnimatePresence>
                {cart.map((item) => {
                  const lineDiscount = calcLineDiscount(item);
                  const lineTotal = calcLineTotal(item);
                  return (
                  <motion.div key={item.product_id} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }} className="space-y-1 rounded-xl border border-border/70 p-1.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-amber-100 text-lg dark:bg-amber-900/30">
                        {item.image_url ? <NextImage src={item.image_url} alt={item.name} width={32} height={32} className="w-full h-full object-cover" /> : <span>{getProductEmoji(item.name)}</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-sm font-medium leading-4">{item.name}</p>
                        <p className="mt-0.5 truncate text-xs leading-4 text-muted-foreground">{currencySymbol}{item.price.toFixed(2)} {t('pos.each')}</p>
                      </div>
                      <div className="min-w-0 shrink-0 text-right">
                        <p className="whitespace-nowrap text-xs font-bold sm:text-sm">{currencySymbol}{lineTotal.toFixed(2)}</p>
                        <button onClick={() => removeFromCart(item.product_id)} className="text-[10px] text-rose-600 hover:text-rose-700 sm:text-xs">{t('common.remove')}</button>
                      </div>
                    </div>
                    {/* Per-item discount control */}
                    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-1">
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQuantity(item.product_id, item.quantity - 1)} aria-label={`Decrease ${item.name} quantity`}><Minus className="h-3.5 w-3.5" /></Button>
                        <span className="min-w-8 text-center text-sm font-medium">{item.quantity}</span>
                        <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQuantity(item.product_id, item.quantity + 1)} aria-label={`Increase ${item.name} quantity`}><Plus className="h-3.5 w-3.5" /></Button>
                      </div>
                      <div className="flex min-w-0 items-center gap-1">
                        <button
                          onClick={() => updateItemDiscount(item.product_id, 'percentage', item.discount_value || 0)}
                          className={`h-7 w-7 rounded-md border text-[10px] font-medium sm:text-xs ${item.discount_type !== 'fixed' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}
                        >%</button>
                        <button
                          onClick={() => updateItemDiscount(item.product_id, 'fixed', item.discount_value || 0)}
                          className={`h-7 w-7 rounded-md border text-[10px] font-medium sm:text-xs ${item.discount_type === 'fixed' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}
                        >{currencySymbol}</button>
                        <Input
                          type="number"
                          value={item.discount_value || ''}
                          onChange={(e) => {
                            const val = Number(e.target.value) || 0;
                            if (item.discount_type === 'percentage' && val > 100) { toast.error(t('pos.discountPercentLimit')); return; }
                            if (item.discount_type === 'fixed' && val * item.quantity > item.price * item.quantity) { toast.error(t('pos.discountAmountLimit')); return; }
                            updateItemDiscount(item.product_id, item.discount_type || 'percentage', val);
                          }}
                          placeholder="0"
                          className="h-7 w-12 px-1 text-xs sm:w-16 sm:px-3"
                        />
                        {lineDiscount > 0 && (
                          <span className="whitespace-nowrap text-xs font-medium text-amber-600 dark:text-amber-400">
                            -{currencySymbol}{lineDiscount.toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>
                  </motion.div>
                  );
                })}
              </AnimatePresence>
            )}
          </div>
        </div>

        {/* Cart totals */}
        <div className="shrink-0 space-y-1 border-t border-border/70 bg-card p-2 sm:space-y-1 sm:p-2">
          <div className="flex items-center justify-between gap-3 text-sm leading-5">
            <span className="text-muted-foreground">{t('pos.subtotal')}</span>
            <span className="whitespace-nowrap font-medium tabular-nums">{currencySymbol}{getSubtotal().toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between gap-3 text-sm leading-5">
            <label htmlFor="discount-input" className="text-muted-foreground">{t('pos.extraDiscount')}</label>
            <div className="flex w-36 items-center gap-1">
              <span className="text-muted-foreground">{currencySymbol}</span>
              <Input
                id="discount-input"
                type="number"
                min="0"
                max={maxExtraDiscount}
                step="0.01"
                value={discount || ''}
                onChange={(e) => setDiscount(Math.min(Number(e.target.value) || 0, maxExtraDiscount))}
                placeholder="0.00"
                className="h-8 text-right"
              />
            </div>
          </div>
          {itemDiscounts > 0 && (
            <div className="flex items-center justify-between gap-3 text-sm leading-5">
              <span className="text-amber-600 dark:text-amber-400">{t('pos.productDiscounts')}</span>
              <span className="whitespace-nowrap font-medium tabular-nums text-amber-600 dark:text-amber-400">-{currencySymbol}{itemDiscounts.toFixed(2)}</span>
            </div>
          )}
          {selectedOffer && offerDiscount > 0 && (
            <div className="flex items-center justify-between gap-3 text-sm leading-5">
              <span className="flex min-w-0 items-center gap-1 text-amber-600 dark:text-amber-400"><Gift className="h-3 w-3 shrink-0" /><span className="truncate">{selectedOffer.name}</span></span>
              <span className="whitespace-nowrap font-medium tabular-nums text-amber-600 dark:text-amber-400">-{currencySymbol}{offerDiscount.toFixed(2)}</span>
            </div>
          )}
          {selectedOffer && Number(selectedOffer.minimum_purchase) > 0 && getSubtotal() < Number(selectedOffer.minimum_purchase) && (
            <div className="rounded-md bg-rose-50 p-2 text-xs leading-4 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400">
              {t('pos.minimumPurchaseRequired', { amount: Number(selectedOffer.minimum_purchase).toFixed(0) })}
            </div>
          )}
          
          <div className="flex items-center justify-between gap-3 text-sm leading-5">
            <span className="text-muted-foreground">{t('pos.taxRate', { rate: String(taxRate) })}</span>
            <span className="whitespace-nowrap font-medium tabular-nums">{currencySymbol}{offerTax.toFixed(2)}</span>
          </div>
          <Separator />
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold sm:text-base">{t('common.total')}</span>
            <span className="whitespace-nowrap text-xl font-bold tabular-nums text-amber-600 dark:text-amber-400 sm:text-xl">{currencySymbol}{grandTotal.toFixed(2)}</span>
          </div>

          {/* Payment method selector */}
          {/* <div className="grid grid-cols-5 gap-1.5">
            {paymentMethods.map((method) => (
              <button key={method.id} onClick={() => setPaymentMethod(method.id)} className={`flex flex-col items-center gap-1 p-2 rounded-lg border transition-all ${paymentMethod === method.id ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted'}`}>
                <method.icon className="w-4 h-4" />
                <span className="text-[10px]">{t(`pos.${method.id}`)}</span>
              </button>
            ))}
          </div> */}

          <Button className="h-10 w-full rounded-lg bg-gradient-to-r from-slate-800 to-black px-2 text-xs font-semibold shadow-sm hover:from-slate-700 hover:to-slate-900 sm:text-sm" size="lg" disabled={cart.length === 0} onClick={() => setCheckoutOpen(true)}>
            <Receipt className="w-4 h-4 mr-2" /> {t('pos.checkout')} · {currencySymbol}{grandTotal.toFixed(2)} (F8)
          </Button>
        </div>
      </Card>

      {/* Checkout dialog */}
      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t('pos.checkout')}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium mb-2">{t('pos.paymentMethod')}</p>
              <div className="grid grid-cols-5 gap-2">
                {paymentMethods.map((method) => (
                  <button key={method.id} onClick={() => setPaymentMethod(method.id)} className={`flex flex-col items-center gap-1 p-3 rounded-lg border transition-all ${paymentMethod === method.id ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted'}`}>
                    <method.icon className="w-5 h-5" />
                    <span className="text-xs">{t(`pos.${method.id}`)}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2 p-4 bg-muted/50 rounded-lg">
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">{t('pos.items')}</span><span>{cart.length}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">{t('pos.subtotal')}</span><span>{currencySymbol}{getSubtotal().toFixed(2)}</span></div>
              {appliedExtraDiscount > 0 && (
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">{t('pos.extraDiscount')}</span><span>-{currencySymbol}{appliedExtraDiscount.toFixed(2)}</span></div>
              )}
              {itemDiscounts > 0 && (
                <div className="flex justify-between text-sm"><span className="text-amber-600 dark:text-amber-400">{t('pos.productDiscounts')}</span><span className="text-amber-600 dark:text-amber-400">-{currencySymbol}{itemDiscounts.toFixed(2)}</span></div>
              )}
              {selectedOffer && offerDiscount > 0 && (
                <div className="flex justify-between text-sm"><span className="text-amber-600 dark:text-amber-400 flex items-center gap-1"><Gift className="w-3 h-3" /> {selectedOffer.name}</span><span className="text-amber-600 dark:text-amber-400">-{currencySymbol}{offerDiscount.toFixed(2)}</span></div>
              )}
              {selectedOffer && Number(selectedOffer.minimum_purchase) > 0 && getSubtotal() < Number(selectedOffer.minimum_purchase) && (
                <div className="text-[10px] text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 rounded p-2">
                  {t('pos.offerMinimumNotMet', { amount: Number(selectedOffer.minimum_purchase).toFixed(0) })}
                </div>
              )}
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">{t('pos.taxRate', { rate: String(taxRate) })}</span><span>{currencySymbol}{offerTax.toFixed(2)}</span></div>
              <Separator />
              <div className="flex justify-between text-lg font-bold"><span>{t('common.total')}</span><span className="text-amber-600 dark:text-amber-400">{currencySymbol}{grandTotal.toFixed(2)}</span></div>
            </div>

            {/* Paid amount with numeric keypad */}
            <div className="space-y-2">
              <Label>{t('pos.paidAmount')}</Label>
              <div className="flex gap-2">
                <Input type="number" value={paidAmount || ''} onChange={(e) => setPaidAmount(Number(e.target.value) || 0)} placeholder={grandTotal.toFixed(2)} className="flex-1" />
                <Button variant="outline" size="sm" onClick={() => setPaidAmount(grandTotal)}>{t('pos.exact')}</Button>
                <Button variant="outline" size="icon" onClick={() => setShowKeypad(!showKeypad)}><Delete className="w-4 h-4" /></Button>
              </div>
              {/* Quick amount buttons */}
              <div className="flex gap-2">
                {quickAmounts.map((amt) => (
                  <Button key={amt} variant="outline" size="sm" className="flex-1" onClick={() => setPaidAmount(amt)}>{currencySymbol}{amt}</Button>
                ))}
              </div>
              {/* Numeric keypad */}
              {showKeypad && (
                <div className="grid grid-cols-3 gap-2 p-3 border rounded-lg">
                  {keypadButtons.map((key) => (
                    <Button key={key} variant="outline" className="h-12 text-lg font-bold" onClick={() => { handleKeypad(key); setPaidAmount(Number(keypadValue) || 0); }}>
                      {key}
                    </Button>
                  ))}
                </div>
              )}
              {paymentMethod === 'due' && (
                <p className="text-sm text-amber-600">{t('pos.dueAmount')}: {currencySymbol}{Math.max(0, grandTotal - paidAmount).toFixed(2)}</p>
              )}
              {paymentMethod === 'cash' && paidAmount > 0 && (
                <p className="text-sm text-emerald-600">{t('pos.change')}: {currencySymbol}{Math.max(0, paidAmount - grandTotal).toFixed(2)}</p>
              )}
            </div>

            <ScrollArea className="max-h-40">
              <div className="space-y-1">
                {cart.map((item) => {
                  const ld = calcLineDiscount(item);
                  const lt = calcLineTotal(item);
                  return (
                  <div key={item.product_id} className="py-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{item.quantity}x {item.name}</span>
                      <span>{currencySymbol}{lt.toFixed(2)}</span>
                    </div>
                    {ld > 0 && (
                      <div className="flex justify-between text-[11px] text-amber-600 dark:text-amber-400 pl-2">
                        <span>{t('pos.discount')} {item.discount_type === 'fixed' ? currencySymbol : ''}{item.discount_value}{item.discount_type === 'percentage' ? '%' : ''}</span>
                        <span>-{currencySymbol}{ld.toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCheckoutOpen(false)}>{t('common.cancel')}</Button>
            <Button className="bg-gradient-to-r from-slate-800 to-black hover:from-slate-700 hover:to-slate-900" onClick={handleCheckout}>
              <CheckCircle2 className="w-4 h-4 mr-2" /> {t('pos.completeSale')} (F9)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receipt dialog */}
      <Dialog open={receiptOpen} onOpenChange={setReceiptOpen}>
        <DialogContent className="max-w-sm max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-center mb-4">
              <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-amber-600 dark:text-amber-400" />
              </div>
            </div>
            <DialogTitle className="text-center">{t('pos.saleCompletedTitle')}</DialogTitle>
          </DialogHeader>
          {lastInvoice && (
            <div className="space-y-3">
              <div className="text-center text-sm text-muted-foreground">
                <p className="font-semibold text-foreground">{lastInvoice.invoice_number}</p>
                <p>{new Date(lastInvoice.sale_date).toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-US')}</p>
              </div>
              <Separator />
              <div className="max-h-40 space-y-1 overflow-y-auto">
                {lastInvoice.items?.map((item: any) => {
                  const ld = calcLineDiscount(item);
                  const lt = calcLineTotal(item);
                  return (
                  <div key={item.product_id} className="py-0.5">
                    <div className="flex justify-between text-sm">
                      <span>{item.quantity}x {item.name}</span>
                      <span>{currencySymbol}{(item.price * item.quantity).toFixed(2)}</span>
                    </div>
                    {ld > 0 && (
                      <div className="flex justify-between text-[11px] text-amber-600 dark:text-amber-400 pl-2">
                        <span>{t('pos.discount')} {item.discount_type === 'fixed' ? currencySymbol : ''}{item.discount_value}{item.discount_type === 'percentage' ? '%' : ''}</span>
                        <span>-{currencySymbol}{ld.toFixed(2)} → {currencySymbol}{lt.toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
              <Separator />
              <div className="space-y-1">
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">{t('pos.subtotal')}</span><span>{lastInvoice.currency_symbol}{Number(lastInvoice.subtotal).toFixed(2)}</span></div>
                {Number(lastInvoice.manual_discount) > 0 && (
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">{t('pos.extraDiscount')}</span><span>-{lastInvoice.currency_symbol}{Number(lastInvoice.manual_discount).toFixed(2)}</span></div>
                )}
                {Number(lastInvoice.item_discounts) > 0 && (
                  <div className="flex justify-between text-sm"><span className="text-amber-600 dark:text-amber-400">{t('pos.productDiscounts')}</span><span className="text-amber-600 dark:text-amber-400">-{lastInvoice.currency_symbol}{Number(lastInvoice.item_discounts).toFixed(2)}</span></div>
                )}
                {lastInvoice.offer && Number(lastInvoice.offer.discount) > 0 && (
                  <div className="flex justify-between text-sm"><span className="text-amber-600 dark:text-amber-400 flex items-center gap-1"><Gift className="w-3 h-3" /> {lastInvoice.offer.name}</span><span className="text-amber-600 dark:text-amber-400">-{lastInvoice.currency_symbol}{Number(lastInvoice.offer.discount).toFixed(2)}</span></div>
                )}
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">{t('pos.tax')}</span><span>{lastInvoice.currency_symbol}{Number(lastInvoice.tax).toFixed(2)}</span></div>
                <div className="flex justify-between text-lg font-bold"><span>{t('common.total')}</span><span className="text-amber-600 dark:text-amber-400">{lastInvoice.currency_symbol}{Number(lastInvoice.total).toFixed(2)}</span></div>
                {Number(lastInvoice.due_amount) > 0 && (
                  <div className="flex justify-between text-sm text-amber-600"><span>{t('pos.due')}</span><span>{lastInvoice.currency_symbol}{Number(lastInvoice.due_amount).toFixed(2)}</span></div>
                )}
              </div>
              <p className="text-center text-xs text-muted-foreground pt-2">{t('pos.thankYou')}</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" className="w-full" onClick={() => window.print()}><Printer className="w-4 h-4 mr-2" /> {t('pos.printReceipt')}</Button>
            <Button className="w-full bg-gradient-to-r from-slate-800 to-black hover:from-slate-700 hover:to-slate-900" onClick={() => setReceiptOpen(false)}>{t('pos.newSale')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Held orders dialog */}
      <Dialog open={heldOrdersOpen} onOpenChange={setHeldOrdersOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t('pos.heldOrders')}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            {heldOrders.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">{t('pos.noHeldOrders')}</p>
            ) : heldOrders.map((order) => (
              <Card key={order.id} className="p-3 flex items-center justify-between hover:bg-muted/50 cursor-pointer" onClick={() => retrieveHeldOrder(order)}>
                <div>
                  <p className="font-medium text-sm">{order.customer_name || 'Walk-in'}</p>
                  <p className="text-xs text-muted-foreground">{new Date(order.hold_time).toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-US')} · {t('pos.itemsCount', { count: order.order_data?.cart?.length || 0 })}</p>
                </div>
                <Button size="sm" variant="outline"><Play className="w-4 h-4 mr-1" /> {t('pos.retrieve')}</Button>
              </Card>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Add customer dialog */}
      <Dialog open={addCustomerOpen} onOpenChange={setAddCustomerOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{t('pos.addNewCustomer')}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>{t('common.name')} *</Label><Input value={newCustomer.name} onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })} placeholder={t('pos.customerName')} /></div>
            <div><Label>{t('common.phone')} *</Label><Input value={newCustomer.phone} onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })} placeholder={t('pos.customerPhone')} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddCustomerOpen(false)}>{t('common.cancel')}</Button>
            <Button className="bg-gradient-to-r from-slate-800 to-black" onClick={handleAddCustomer}><UserPlus className="w-4 h-4 mr-2" /> {t('pos.addCustomer')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {printPortalReady && lastInvoice && storeSettings && createPortal(
        <ThermalReceipt
          sale={lastInvoice}
          items={lastInvoice.items}
          customer={lastInvoice.customer}
          settings={storeSettings}
        />,
        document.body
      )}
      {confirmationDialog}
    </div>
  );
}

function getProductEmoji(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('t-shirt') || lower.includes('polo')) return '👕';
  if (lower.includes('shirt')) return '👔';
  if (lower.includes('jean')) return '👖';
  if (lower.includes('pant') || lower.includes('chino') || lower.includes('cargo')) return '👖';
  if (lower.includes('panjabi')) return '🧕';
  if (lower.includes('hoodie') || lower.includes('sweatshirt')) return '🧥';
  if (lower.includes('jacket') || lower.includes('blazer') || lower.includes('bomber')) return '🧥';
  if (lower.includes('belt')) return '👞';
  if (lower.includes('cap')) return '🧢';
  if (lower.includes('sock')) return '🧦';
  if (lower.includes('watch')) return '⌚';
  return '👕';
}
