'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  Eye,
  History,
  PackageCheck,
  PackageX,
  Search,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/lib/supabase';
import type { Category, Product, StockMovement } from '@/types';
import { toast } from 'sonner';
import { useTranslation } from '@/hooks/use-translation';

type StockDirection = 'in' | 'out';
type StockFilter = 'all' | 'in_stock' | 'low_stock' | 'out_of_stock';

const PAGE_SIZE = 10;
const HISTORY_PAGE_SIZE = 20;

const stockInReasons = [
  ['Opening Stock', 'inventory.openingStockReason'],
  ['New Stock Received', 'inventory.newStockReceivedReason'],
  ['Purchase Return', 'inventory.purchaseReturnReason'],
  ['Manual Adjustment', 'inventory.manualAdjustmentReason'],
  ['Other', 'inventory.otherReason'],
] as const;

const stockOutReasons = [
  ['Damaged Product', 'inventory.damagedProductReason'],
  ['Expired Product', 'inventory.expiredProductReason'],
  ['Lost / Missing', 'inventory.lostMissingReason'],
  ['Internal Use', 'inventory.internalUseReason'],
  ['Manual Adjustment', 'inventory.manualAdjustmentReason'],
  ['Other', 'inventory.otherReason'],
] as const;

function unitAllowsDecimalQuantity(unit: string | null | undefined): boolean {
  return /^(kg|g|gram|grams|liter|litre|l|ml|meter|metre|m|cm|mm)$/i.test((unit || '').trim());
}

function getStockStatus(product: Product, t: (key: string) => string) {
  if (Number(product.stock) <= 0) {
    return { label: t('inventory.outOfStock'), className: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400' };
  }
  if (Number(product.min_stock) > 0 && Number(product.stock) <= Number(product.min_stock)) {
    return { label: t('inventory.lowStock'), className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' };
  }
  return { label: t('inventory.inStock'), className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' };
}

export default function InventoryPage() {
  const { t, locale } = useTranslation();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [currencySymbol, setCurrencySymbol] = useState('৳');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'movements'>('overview');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [page, setPage] = useState(0);

  const [adjustmentDirection, setAdjustmentDirection] = useState<StockDirection | null>(null);
  const [adjustmentProductId, setAdjustmentProductId] = useState('');
  const [adjustmentQuantity, setAdjustmentQuantity] = useState('');
  const [adjustmentPurchasePrice, setAdjustmentPurchasePrice] = useState('');
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const [adjustmentNotes, setAdjustmentNotes] = useState('');
  const [savingAdjustment, setSavingAdjustment] = useState(false);

  const [viewProduct, setViewProduct] = useState<Product | null>(null);
  const [historyProduct, setHistoryProduct] = useState<Product | null>(null);
  const [historyRows, setHistoryRows] = useState<StockMovement[]>([]);
  const [historyCount, setHistoryCount] = useState(0);
  const [historyPage, setHistoryPage] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadData = useCallback(async () => {
    const [productResult, categoryResult, movementResult, settingsResult] = await Promise.all([
      supabase
        .from('products')
        .select('*, brands(name), categories(name)')
        .eq('is_deleted', false)
        .eq('status', 'active')
        .order('name'),
      supabase.from('categories').select('*').eq('status', 'active').order('name'),
      supabase
        .from('stock_movements')
        .select('*, products(id, name)')
        .order('created_at', { ascending: false })
        .limit(30),
      supabase.from('settings').select('currency, currency_symbol').maybeSingle(),
    ]);

    const failedResult = [
      ['products', productResult.error],
      ['categories', categoryResult.error],
      ['stock movements', movementResult.error],
      ['store settings', settingsResult.error],
    ].find((entry) => entry[1]);
    if (failedResult) {
      console.error(`[Inventory] Failed to load ${failedResult[0]}:`, failedResult[1]);
      toast.error(`${t('dashboard.metricsLoadFailed')}: ${failedResult[0]}`);
      setLoading(false);
      return;
    }

    setProducts((productResult.data || []) as Product[]);
    setCategories((categoryResult.data || []) as Category[]);
    setMovements((movementResult.data || []).map(({ products: relatedProducts, ...movement }) => ({
      ...movement,
      products: relatedProducts?.[0] || null,
    })));
    setCurrencySymbol(
      settingsResult.data?.currency_symbol?.trim()
        || (settingsResult.data?.currency === 'BDT' ? '৳' : settingsResult.data?.currency || '৳')
    );
    setLoading(false);
  }, [t]);

  useEffect(() => {
    void loadData();
    let refreshTimeout: number | null = null;
    const scheduleRefresh = () => {
      if (refreshTimeout !== null) window.clearTimeout(refreshTimeout);
      refreshTimeout = window.setTimeout(() => {
        refreshTimeout = null;
        void loadData();
      }, 250);
    };
    const channel = supabase.channel('inventory-management');
    ['products', 'stock_movements'].forEach((table) => {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, scheduleRefresh);
    });
    channel.subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.error('[Inventory] Realtime subscription failed:', status);
      }
    });
    return () => {
      if (refreshTimeout !== null) window.clearTimeout(refreshTimeout);
      void supabase.removeChannel(channel);
    };
  }, [loadData]);

  useEffect(() => {
    if (!historyProduct) return;
    let active = true;
    setHistoryLoading(true);
    const from = historyPage * HISTORY_PAGE_SIZE;
    void supabase
      .from('stock_movements')
      .select('*, products(id, name)', { count: 'exact' })
      .eq('product_id', historyProduct.id)
      .order('created_at', { ascending: false })
      .range(from, from + HISTORY_PAGE_SIZE - 1)
      .then(({ data, error, count }) => {
        if (!active) return;
        if (error) {
          console.error('[Inventory] Failed to load product stock history:', error);
          toast.error(t('inventory.historyLoadFailed'));
        } else {
          setHistoryRows((data || []).map(({ products: relatedProducts, ...movement }) => ({
            ...movement,
            products: relatedProducts?.[0] || null,
          })));
          setHistoryCount(count || 0);
        }
        setHistoryLoading(false);
      });
    return () => { active = false; };
  }, [historyProduct, historyPage, t]);

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return products.filter((product) => {
      const matchesSearch = !query
        || product.name.toLowerCase().includes(query)
        || (product.sku || '').toLowerCase().includes(query)
        || (product.barcode || '').toLowerCase().includes(query);
      const matchesCategory = categoryFilter === 'all' || product.category_id === categoryFilter;
      const stock = Number(product.stock);
      const matchesStock = stockFilter === 'all'
        || (stockFilter === 'out_of_stock' && stock <= 0)
        || (stockFilter === 'low_stock' && stock > 0 && Number(product.min_stock) > 0 && stock <= Number(product.min_stock))
        || (stockFilter === 'in_stock' && stock > 0 && !(Number(product.min_stock) > 0 && stock <= Number(product.min_stock)));
      return matchesSearch && matchesCategory && matchesStock;
    });
  }, [products, search, categoryFilter, stockFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const paginatedProducts = filteredProducts.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const lowStock = products.filter((product) => Number(product.min_stock) > 0 && Number(product.stock) > 0 && Number(product.stock) <= Number(product.min_stock));
  const outOfStock = products.filter((product) => Number(product.stock) <= 0);
  const totalValue = products.reduce((sum, product) => sum + Number(product.cost_price || 0) * Number(product.stock || 0), 0);
  const totalStock = products.reduce((sum, product) => sum + Number(product.stock || 0), 0);
  const numberLocale = locale === 'bn' ? 'bn-BD' : 'en-US';
  const formatMoney = (value: number) => `${currencySymbol}${value.toLocaleString(numberLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const formatDate = (value: string) => new Date(value).toLocaleString(numberLocale);

  const openAdjustment = (direction: StockDirection, product?: Product) => {
    setAdjustmentDirection(direction);
    setAdjustmentProductId(product?.id || '');
    setAdjustmentQuantity('');
    setAdjustmentPurchasePrice('');
    setAdjustmentReason(direction === 'in' ? stockInReasons[0][0] : stockOutReasons[0][0]);
    setAdjustmentNotes('');
  };

  const selectedProduct = products.find((product) => product.id === adjustmentProductId) || null;

  const submitAdjustment = async () => {
    const quantity = Number(adjustmentQuantity);
    if (!selectedProduct || !adjustmentDirection || !Number.isFinite(quantity) || quantity <= 0) {
      toast.error(t('inventory.adjustmentFailed'));
      return;
    }
    if (!unitAllowsDecimalQuantity(selectedProduct.unit) && !Number.isInteger(quantity)) {
      toast.error(t('inventory.adjustmentFailed'));
      return;
    }
    if (adjustmentDirection === 'out' && quantity > Number(selectedProduct.stock)) {
      toast.error(t('inventory.stockOutInsufficient'));
      return;
    }
    const purchasePrice = adjustmentPurchasePrice.trim() === '' ? null : Number(adjustmentPurchasePrice);
    if (purchasePrice !== null && (!Number.isFinite(purchasePrice) || purchasePrice < 0)) {
      toast.error(t('inventory.adjustmentFailed'));
      return;
    }

    setSavingAdjustment(true);
    try {
      const { error } = await supabase.rpc('adjust_inventory_stock', {
        p_product_id: selectedProduct.id,
        p_direction: adjustmentDirection,
        p_quantity: quantity,
        p_reason: adjustmentReason,
        p_note: adjustmentNotes || null,
        p_purchase_price: purchasePrice,
      });
      if (error) throw error;

      toast.success(t('inventory.adjustmentSuccess'));
      setAdjustmentDirection(null);
      await loadData();
    } catch (error) {
      console.error('[Inventory] Stock adjustment failed:', error);
      toast.error(error instanceof Error ? error.message : t('inventory.adjustmentFailed'));
    } finally {
      setSavingAdjustment(false);
    }
  };

  const openHistory = (product: Product) => {
    setHistoryPage(0);
    setHistoryProduct(product);
  };

  const stockStatusFilterValue = (stockFilter: StockFilter) => stockFilter;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold font-heading">{t('inventory.managementTitle')}</h2>
          <p className="text-sm text-muted-foreground">{t('inventory.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => openAdjustment('in')}>
            <ArrowDownToLine className="mr-2 h-4 w-4" />{t('inventory.stockIn')}
          </Button>
          <Button size="sm" variant="outline" onClick={() => openAdjustment('out')}>
            <ArrowUpFromLine className="mr-2 h-4 w-4" />{t('inventory.stockOut')}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: t('products.totalProducts'), value: products.length.toLocaleString(numberLocale), icon: Boxes, color: 'from-slate-800 to-black' },
          { label: t('inventory.totalStockValue'), value: formatMoney(totalValue), icon: PackageCheck, color: 'from-blue-500 to-cyan-600' },
          { label: t('inventory.lowStock'), value: lowStock.length.toLocaleString(numberLocale), icon: PackageCheck, color: 'from-amber-500 to-orange-600' },
          { label: t('inventory.outOfStock'), value: outOfStock.length.toLocaleString(numberLocale), icon: PackageX, color: 'from-rose-500 to-pink-600' },
        ].map((stat, index) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br ${stat.color}`}>
                  <stat.icon className="h-5 w-5 text-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                  <p className="truncate text-xl font-bold">{stat.value}</p>
                </div>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="flex gap-2 border-b border-border">
        <button onClick={() => setTab('overview')} className={`border-b-2 px-4 py-2 text-sm font-medium ${tab === 'overview' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
          {t('inventory.overview')}
        </button>
        <button onClick={() => setTab('movements')} className={`border-b-2 px-4 py-2 text-sm font-medium ${tab === 'movements' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
          {t('inventory.movements')}
        </button>
      </div>

      {tab === 'overview' ? (
        <Card className="overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-border p-4 md:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} placeholder={t('inventory.search')} className="pl-9" />
            </div>
            <select value={categoryFilter} onChange={(event) => { setCategoryFilter(event.target.value); setPage(0); }} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
              <option value="all">{t('inventory.allCategories')}</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
            <select value={stockStatusFilterValue(stockFilter)} onChange={(event) => { setStockFilter(event.target.value as StockFilter); setPage(0); }} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
              <option value="all">{t('inventory.allStockStatuses')}</option>
              <option value="in_stock">{t('inventory.inStock')}</option>
              <option value="low_stock">{t('inventory.lowStock')}</option>
              <option value="out_of_stock">{t('inventory.outOfStock')}</option>
            </select>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('inventory.product')}</TableHead>
                  <TableHead>{t('inventory.skuBarcode')}</TableHead>
                  <TableHead>{t('inventory.category')}</TableHead>
                  <TableHead>{t('inventory.currentStock')}</TableHead>
                  <TableHead>{t('products.purchasePrice')}</TableHead>
                  <TableHead>{t('inventory.sellingPrice')}</TableHead>
                  <TableHead>{t('inventory.value')}</TableHead>
                  <TableHead>{t('inventory.stockStatus')}</TableHead>
                  <TableHead className="text-right">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, row) => (
                    <TableRow key={row}>{Array.from({ length: 9 }).map((__, cell) => <TableCell key={cell}><div className="h-4 animate-pulse rounded bg-muted" /></TableCell>)}</TableRow>
                  ))
                ) : paginatedProducts.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="py-10 text-center text-muted-foreground">{t('inventory.noProductsFound')}</TableCell></TableRow>
                ) : paginatedProducts.map((product) => {
                  const status = getStockStatus(product, t);
                  return (
                    <TableRow key={product.id}>
                      <TableCell className="font-medium">{product.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{product.sku || product.barcode || '-'}</TableCell>
                      <TableCell>{product.categories?.name || '-'}</TableCell>
                      <TableCell>{Number(product.stock)} {product.unit}</TableCell>
                      <TableCell>{formatMoney(Number(product.cost_price || 0))}</TableCell>
                      <TableCell>{formatMoney(Number(product.selling_price || 0))}</TableCell>
                      <TableCell className="font-medium">{formatMoney(Number(product.stock || 0) * Number(product.cost_price || 0))}</TableCell>
                      <TableCell><Badge className={status.className}>{status.label}</Badge></TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="outline" onClick={() => openAdjustment('in', product)} title={t('inventory.stockIn')}>
                            <ArrowDownToLine className="mr-1 h-3.5 w-3.5" />+
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => openAdjustment('out', product)} title={t('inventory.stockOut')}>
                            <ArrowUpFromLine className="mr-1 h-3.5 w-3.5" />-
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => openHistory(product)} title={t('inventory.stockHistory')}>
                            <History className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => setViewProduct(product)} title={t('inventory.viewProduct')}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between border-t border-border p-3 text-sm">
            <span className="text-muted-foreground">{filteredProducts.length.toLocaleString(numberLocale)} · {t('inventory.currentStock')}</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>{t('inventory.previous')}</Button>
              <span>{currentPage + 1} / {totalPages}</span>
              <Button variant="outline" size="sm" disabled={currentPage + 1 >= totalPages} onClick={() => setPage(currentPage + 1)}>{t('inventory.next')}</Button>
            </div>
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border p-4">
            <History className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">{t('inventory.recentMovements')}</h3>
          </div>
          <MovementTable movements={movements} locale={numberLocale} formatMoney={formatMoney} t={t} />
          {movements.length === 0 && !loading && <div className="py-12 text-center text-muted-foreground">{t('inventory.noMovements')}</div>}
        </Card>
      )}

      <Dialog open={adjustmentDirection !== null} onOpenChange={(open) => !open && setAdjustmentDirection(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t(adjustmentDirection === 'in' ? 'inventory.stockInTitle' : 'inventory.stockOutTitle')}</DialogTitle>
            <DialogDescription>{t('inventory.currentStock')}: {selectedProduct ? `${Number(selectedProduct.stock)} ${selectedProduct.unit}` : '-'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('inventory.selectProduct')}</Label>
              <select value={adjustmentProductId} onChange={(event) => setAdjustmentProductId(event.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">{t('inventory.selectProduct')}</option>
                {products.map((product) => <option key={product.id} value={product.id}>{product.name} · {Number(product.stock)} {product.unit}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label>{t(adjustmentDirection === 'in' ? 'inventory.quantityToAdd' : 'inventory.quantityToRemove')}</Label>
              <Input type="number" min="0" step={unitAllowsDecimalQuantity(selectedProduct?.unit) ? 'any' : '1'} value={adjustmentQuantity} onChange={(event) => setAdjustmentQuantity(event.target.value)} />
            </div>
            {adjustmentDirection === 'in' && (
              <div className="space-y-2">
                <Label>{t('inventory.purchasePriceOptional')}</Label>
                <Input type="number" min="0" step="0.01" value={adjustmentPurchasePrice} onChange={(event) => setAdjustmentPurchasePrice(event.target.value)} placeholder={selectedProduct ? String(selectedProduct.cost_price || 0) : ''} />
              </div>
            )}
            <div className="space-y-2">
              <Label>{t('inventory.reason')}</Label>
              <select value={adjustmentReason} onChange={(event) => setAdjustmentReason(event.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                {(adjustmentDirection === 'in' ? stockInReasons : stockOutReasons).map(([reason, translation]) => <option key={reason} value={reason}>{t(translation)}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label>{t('inventory.notes')}</Label>
              <Textarea value={adjustmentNotes} onChange={(event) => setAdjustmentNotes(event.target.value)} maxLength={1000} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustmentDirection(null)}>{t('common.cancel')}</Button>
            <Button onClick={submitAdjustment} disabled={savingAdjustment || !selectedProduct || !adjustmentQuantity}>
              {savingAdjustment ? t('inventory.saving') : t('inventory.confirmAdjustment')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={historyProduct !== null} onOpenChange={(open) => !open && setHistoryProduct(null)}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('inventory.stockHistory')}{historyProduct ? ` — ${historyProduct.name}` : ''}</DialogTitle>
          </DialogHeader>
          {historyLoading ? (
            <div className="py-12 text-center text-muted-foreground">{t('inventory.saving')}</div>
          ) : historyRows.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">{t('inventory.noMovements')}</div>
          ) : (
            <MovementTable movements={historyRows} locale={numberLocale} formatMoney={formatMoney} t={t} />
          )}
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" disabled={historyPage === 0 || historyLoading} onClick={() => setHistoryPage((current) => current - 1)}>{t('inventory.previous')}</Button>
            <span className="text-sm">{historyCount === 0 ? 0 : historyPage + 1} / {Math.max(1, Math.ceil(historyCount / HISTORY_PAGE_SIZE))}</span>
            <Button variant="outline" size="sm" disabled={(historyPage + 1) * HISTORY_PAGE_SIZE >= historyCount || historyLoading} onClick={() => setHistoryPage((current) => current + 1)}>{t('inventory.next')}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={viewProduct !== null} onOpenChange={(open) => !open && setViewProduct(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{viewProduct?.name}</DialogTitle></DialogHeader>
          {viewProduct && (
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><p className="text-muted-foreground">{t('inventory.skuBarcode')}</p><p>{viewProduct.sku || viewProduct.barcode || '-'}</p></div>
              <div><p className="text-muted-foreground">{t('inventory.category')}</p><p>{viewProduct.categories?.name || '-'}</p></div>
              <div><p className="text-muted-foreground">{t('inventory.currentStock')}</p><p>{Number(viewProduct.stock)} {viewProduct.unit}</p></div>
              <div><p className="text-muted-foreground">{t('products.purchasePrice')}</p><p>{formatMoney(Number(viewProduct.cost_price || 0))}</p></div>
              <div><p className="text-muted-foreground">{t('inventory.sellingPrice')}</p><p>{formatMoney(Number(viewProduct.selling_price || 0))}</p></div>
              <div><p className="text-muted-foreground">{t('inventory.value')}</p><p>{formatMoney(Number(viewProduct.stock || 0) * Number(viewProduct.cost_price || 0))}</p></div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MovementTable({
  movements,
  locale,
  formatMoney,
  t,
}: {
  movements: StockMovement[];
  locale: string;
  formatMoney: (value: number) => string;
  t: (key: string) => string;
}) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('inventory.product')}</TableHead>
            <TableHead>{t('inventory.previousStock')}</TableHead>
            <TableHead>{t('inventory.type')}</TableHead>
            <TableHead>{t('common.quantity')}</TableHead>
            <TableHead>{t('inventory.newStock')}</TableHead>
            <TableHead>{t('inventory.reason')}</TableHead>
            <TableHead>{t('products.purchasePrice')}</TableHead>
            <TableHead>{t('inventory.performedBy')}</TableHead>
            <TableHead>{t('common.date')}</TableHead>
            <TableHead>{t('inventory.notes')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {movements.map((movement) => {
            const isIncrease = movement.type === 'in';
            const isDecrease = movement.type === 'out';
            return (
              <TableRow key={movement.id}>
                <TableCell className="font-medium">{movement.products?.name || t('inventory.unknown')}</TableCell>
                <TableCell>{movement.previous_stock == null ? '-' : Number(movement.previous_stock)}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={isIncrease ? 'border-emerald-500 text-emerald-600' : isDecrease ? 'border-rose-500 text-rose-600' : 'border-blue-500 text-blue-600'}>
                    {isIncrease ? 'IN' : isDecrease ? 'OUT' : movement.type}
                  </Badge>
                </TableCell>
                <TableCell>{Number(movement.quantity)}</TableCell>
                <TableCell>{movement.new_stock == null ? '-' : Number(movement.new_stock)}</TableCell>
                <TableCell>{movement.reason || movement.reference || '-'}</TableCell>
                <TableCell>{movement.purchase_price == null ? '-' : formatMoney(Number(movement.purchase_price))}</TableCell>
                <TableCell className="font-mono text-xs">{movement.performed_by ? movement.performed_by.slice(0, 8) : '-'}</TableCell>
                <TableCell className="whitespace-nowrap">{new Date(movement.created_at).toLocaleString(locale)}</TableCell>
                <TableCell className="max-w-48 truncate">{movement.note || '-'}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
