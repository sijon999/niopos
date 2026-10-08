'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Receipt, Truck, Package, Search, Trash2, Minus, CheckCircle2,
  X, Eye, ArrowLeft, Clock, Printer, Filter, Ban,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { supabase } from '@/lib/supabase';
import type { Purchase, PurchaseItem, Product, Supplier } from '@/types';
import { toast } from 'sonner';

type CartEntry = {
  product_id: string;
  name: string;
  quantity: number;
  cost_price: number;
  total: number;
};

type DatePreset = 'all' | 'today' | 'yesterday' | 'thisWeek' | 'thisMonth' | 'custom';
type StatusFilter = 'all' | 'received' | 'pending' | 'cancelled';

function toDateInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function localBoundary(value: string, end: boolean): string {
  const [y, m, d] = value.split('-').map(Number);
  const date = end ? new Date(y, m - 1, d, 23, 59, 59, 999) : new Date(y, m - 1, d, 0, 0, 0, 0);
  return date.toISOString();
}

function getPresetRange(preset: 'today' | 'yesterday' | 'thisWeek' | 'thisMonth'): { from: string; to: string } {
  const today = startOfDay(new Date());
  switch (preset) {
    case 'today': return { from: toDateInputValue(today), to: toDateInputValue(today) };
    case 'yesterday': { const y = new Date(today); y.setDate(y.getDate() - 1); return { from: toDateInputValue(y), to: toDateInputValue(y) }; }
    case 'thisWeek': { const now = new Date(); const day = now.getDay(); const diff = day === 0 ? 6 : day - 1; const monday = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff)); return { from: toDateInputValue(monday), to: toDateInputValue(today) }; }
    case 'thisMonth': { const from = new Date(today.getFullYear(), today.getMonth(), 1); return { from: toDateInputValue(from), to: toDateInputValue(today) }; }
  }
}

const statusColors: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  received: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  cancelled: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
};

const paymentMethods = [
  { id: 'cash', label: 'Cash' },
  { id: 'card', label: 'Card' },
  { id: 'mobile', label: 'Mobile' },
  { id: 'bank', label: 'Bank' },
  { id: 'due', label: 'Due' },
];

export default function PurchasesPage() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailPurchase, setDetailPurchase] = useState<Purchase | null>(null);
  const [detailItems, setDetailItems] = useState<PurchaseItem[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [cart, setCart] = useState<CartEntry[]>([]);
  const [taxRate, setTaxRate] = useState('0');
  const [discount, setDiscount] = useState('0');
  const [paidAmount, setPaidAmount] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [notes, setNotes] = useState('');

  const [listSearch, setListSearch] = useState('');
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const loadPurchases = useCallback(async (): Promise<void> => {
    setLoading(true);
    let query = supabase
      .from('purchases')
      .select('*, suppliers(name), purchase_items(id)')
      .order('purchase_date', { ascending: false });

    if (dateFrom) query = query.gte('purchase_date', localBoundary(dateFrom, false));
    if (dateTo) query = query.lte('purchase_date', localBoundary(dateTo, true));
    if (statusFilter !== 'all') query = query.eq('status', statusFilter);

    const { data } = await query;
    setPurchases((data as Purchase[]) || []);
    setLoading(false);
  }, [dateFrom, dateTo, statusFilter]);

  useEffect(() => { loadPurchases(); }, [loadPurchases]);

  async function openCreateDialog() {
    const [prodRes, supRes] = await Promise.all([
      supabase.from('products').select('*, brands(name), categories(name)').order('name'),
      supabase.from('suppliers').select('*').eq('status', 'active').order('name'),
    ]);
    setProducts(prodRes.data || []);
    setSuppliers(supRes.data || []);
    setCart([]);
    setSearch('');
    setSelectedSupplier('');
    setTaxRate('0');
    setDiscount('0');
    setPaidAmount('0');
    setPaymentMethod('cash');
    setNotes('');
    setDialogOpen(true);
  }

  const filteredProducts = useMemo(() => {
    if (!search) return products;
    const q = search.toLowerCase();
    return products.filter(
      (p) => p.name.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q) || p.barcode?.includes(q)
    );
  }, [products, search]);

  const filteredPurchases = useMemo(() => {
    const q = listSearch.trim().toLowerCase();
    if (!q) return purchases;
    return purchases.filter((p) => {
      const po = p.po_number?.toLowerCase() || '';
      const supplier = p.suppliers?.name?.toLowerCase() || '';
      const items = (p.purchase_items || []).map((i: any) => i.product_name || '').join(' ').toLowerCase();
      return po.includes(q) || supplier.includes(q) || items.includes(q);
    });
  }, [purchases, listSearch]);

  const addToCart = (product: Product) => {
    const existing = cart.find((c) => c.product_id === product.id);
    if (existing) {
      setCart(cart.map((c) =>
        c.product_id === product.id
          ? { ...c, quantity: c.quantity + 1, total: (c.quantity + 1) * c.cost_price }
          : c
      ));
    } else {
      setCart([...cart, { product_id: product.id, name: product.name, quantity: 1, cost_price: product.cost_price, total: product.cost_price }]);
    }
  };

  const updateQty = (id: string, qty: number) => {
    if (qty < 1) return;
    setCart(cart.map((c) => (c.product_id === id ? { ...c, quantity: qty, total: qty * c.cost_price } : c)));
  };

  const updateCost = (id: string, cost: number) => {
    setCart(cart.map((c) => (c.product_id === id ? { ...c, cost_price: cost, total: c.quantity * cost } : c)));
  };

  const removeFromCart = (id: string) => setCart(cart.filter((c) => c.product_id !== id));

  const subtotal = cart.reduce((s, c) => s + c.total, 0);
  const tax = subtotal * (Number(taxRate) / 100);
  const discountVal = Number(discount) || 0;
  const total = Math.max(0, subtotal + tax - discountVal);
  const paidVal = Number(paidAmount) || 0;
  const dueAmount = paymentMethod === 'due' ? Math.max(0, total - paidVal) : Math.max(0, total - paidVal);
  const effectivePaid = paymentMethod === 'due' ? paidVal : total;

  const handleSave = async () => {
    if (cart.length === 0) { toast.error('Add at least one product'); return; }
    setSaving(true);

    const { data, error } = await supabase.rpc('complete_purchase_order', {
      p_supplier_id: selectedSupplier || null,
      p_cart: cart.map((c) => ({ product_id: c.product_id, quantity: c.quantity, cost_price: c.cost_price })),
      p_tax_rate: Number(taxRate) || 0,
      p_discount: discountVal,
      p_paid_amount: paymentMethod === 'due' ? paidVal : total,
      p_payment_method: paymentMethod,
      p_notes: notes || null,
      p_branch: 'main',
    });

    if (error || !data) {
      toast.error(error?.message?.replace(/^[A-Z]/, (c: string) => c.toLowerCase()) || 'Failed to create purchase');
      setSaving(false);
      return;
    }

    toast.success('Purchase completed and stock updated');
    setDialogOpen(false);
    setSaving(false);
    loadPurchases();
  };

  const viewDetail = async (purchase: Purchase) => {
    setDetailPurchase(purchase);
    setDetailLoading(true);
    const { data } = await supabase
      .from('purchase_items')
      .select('*, products(name, sku)')
      .eq('purchase_id', purchase.id);
    setDetailItems(data || []);
    setDetailLoading(false);
  };

  const handleCancel = async (purchase: Purchase) => {
    setCancellingId(purchase.id);
    const { error } = await supabase.rpc('cancel_purchase_order', { p_purchase_id: purchase.id });
    if (error) {
      toast.error('Failed to cancel purchase');
      setCancellingId(null);
      return;
    }
    toast.success('Purchase cancelled and stock adjusted');
    setDetailPurchase(null);
    setCancellingId(null);
    loadPurchases();
  };

  const handlePresetChange = (preset: DatePreset): void => {
    setDatePreset(preset);
    if (preset === 'all') { setDateFrom(''); setDateTo(''); }
    else if (preset !== 'custom') { const r = getPresetRange(preset); setDateFrom(r.from); setDateTo(r.to); }
  };

  const clearFilters = (): void => {
    setDatePreset('all'); setDateFrom(''); setDateTo('');
    setStatusFilter('all'); setListSearch('');
  };

  const hasFilters = Boolean(dateFrom || dateTo) || statusFilter !== 'all' || Boolean(listSearch.trim());

  const totalValue = filteredPurchases.filter((p) => p.status !== 'cancelled').reduce((s, p) => s + Number(p.total), 0);
  const pendingCount = filteredPurchases.filter((p) => p.status === 'pending').length;
  const receivedCount = filteredPurchases.filter((p) => p.status === 'received').length;
  const totalDue = filteredPurchases.filter((p) => p.status !== 'cancelled').reduce((s, p) => s + Number(p.due_amount || 0), 0);

  if (detailPurchase) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="icon" onClick={() => setDetailPurchase(null)}><ArrowLeft className="w-4 h-4" /></Button>
            <div>
              <h2 className="text-2xl font-bold font-heading">{detailPurchase.po_number}</h2>
              <p className="text-sm text-muted-foreground">
                {new Date(detailPurchase.purchase_date).toLocaleDateString()} · {detailPurchase.suppliers?.name || 'No supplier'}
              </p>
            </div>
          </div>
          <Badge className={statusColors[detailPurchase.status] || statusColors.pending}>{detailPurchase.status}</Badge>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card className="p-4"><p className="text-xs text-muted-foreground mb-1">Subtotal</p><p className="text-lg font-bold">৳{Number(detailPurchase.subtotal).toFixed(2)}</p></Card>
          <Card className="p-4"><p className="text-xs text-muted-foreground mb-1">Tax</p><p className="text-lg font-bold">৳{Number(detailPurchase.tax).toFixed(2)}</p></Card>
          <Card className="p-4"><p className="text-xs text-muted-foreground mb-1">Discount</p><p className="text-lg font-bold text-amber-600">-৳{Number(detailPurchase.discount || 0).toFixed(2)}</p></Card>
          <Card className="p-4"><p className="text-xs text-muted-foreground mb-1">Total</p><p className="text-lg font-bold text-amber-600 dark:text-amber-400">৳{Number(detailPurchase.total).toFixed(2)}</p></Card>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Card className="p-4"><p className="text-xs text-muted-foreground mb-1">Paid Amount</p><p className="text-lg font-bold text-emerald-600">৳{Number(detailPurchase.paid_amount || 0).toFixed(2)}</p></Card>
          <Card className="p-4"><p className="text-xs text-muted-foreground mb-1">Due Amount</p><p className="text-lg font-bold text-amber-600">৳{Number(detailPurchase.due_amount || 0).toFixed(2)}</p></Card>
          <Card className="p-4"><p className="text-xs text-muted-foreground mb-1">Payment Method</p><p className="text-lg font-bold capitalize">{detailPurchase.payment_method || 'cash'}</p></Card>
        </div>

        {detailPurchase.notes && (
          <Card className="p-4"><p className="text-xs text-muted-foreground mb-1">Notes</p><p className="text-sm">{detailPurchase.notes}</p></Card>
        )}

        <Card className="overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h3 className="font-semibold">Order Items</h3>
            <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="w-4 h-4 mr-1" /> Print</Button>
          </div>
          {detailLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading items...</div>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Product</TableHead><TableHead>Qty</TableHead><TableHead>Cost Price</TableHead><TableHead>Total</TableHead></TableRow></TableHeader>
              <TableBody>
                {detailItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.product_name}</TableCell>
                    <TableCell>{item.quantity}</TableCell>
                    <TableCell>৳{Number(item.cost_price).toFixed(2)}</TableCell>
                    <TableCell className="font-bold">৳{Number(item.total).toFixed(2)}</TableCell>
                  </TableRow>
                ))}
                {detailItems.length === 0 && <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No items found</TableCell></TableRow>}
              </TableBody>
            </Table>
          )}
        </Card>

        {detailPurchase.status !== 'cancelled' && (
          <div className="flex gap-3">
            <Button variant="outline" className="text-rose-600 hover:text-rose-700" onClick={() => handleCancel(detailPurchase)} disabled={cancellingId === detailPurchase.id}>
              <Ban className="w-4 h-4 mr-2" /> {cancellingId === detailPurchase.id ? 'Cancelling...' : 'Cancel Purchase & Reverse Stock'}
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold font-heading">Purchase / ক্রয়</h2>
          <p className="text-sm text-muted-foreground">Buy stock from suppliers and manage orders</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link href="/admin/reports/purchase-expense"><Button variant="outline" size="sm">Purchase Report</Button></Link>
          <Button size="sm" className="bg-gradient-to-r from-slate-800 to-black" onClick={openCreateDialog}><Plus className="w-4 h-4 mr-2" /> New Purchase</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Orders', value: filteredPurchases.length, icon: Receipt, color: 'from-slate-800 to-black' },
          { label: 'Received', value: receivedCount, icon: CheckCircle2, color: 'from-emerald-500 to-green-600' },
          { label: 'Total Value', value: `৳${totalValue.toFixed(2)}`, icon: Truck, color: 'from-blue-500 to-cyan-600' },
          { label: 'Total Due', value: `৳${totalDue.toFixed(2)}`, icon: Clock, color: 'from-amber-500 to-orange-600' },
        ].map((stat, i) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${stat.color} flex items-center justify-center`}>
                  <stat.icon className="w-5 h-5 text-white" />
                </div>
                <div><p className="text-xs text-muted-foreground">{stat.label}</p><p className="text-lg font-bold">{stat.value}</p></div>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={listSearch} onChange={(e) => setListSearch(e.target.value)} placeholder="Search by PO number, supplier, product..." className="pl-9" />
          </div>
          <Popover open={filterOpen} onOpenChange={setFilterOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline"><Filter className="w-4 h-4 mr-2" /> Filter {hasFilters && <span className="ml-2 rounded-full bg-primary text-primary-foreground px-2 text-xs">Active</span>}</Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[min(92vw,380px)] p-4">
              <div className="mb-3"><h3 className="font-semibold">Filters</h3></div>
              <div className="flex gap-1 flex-wrap mb-3">
                {(['all', 'today', 'yesterday', 'thisWeek', 'thisMonth'] as DatePreset[]).map((p) => (
                  <Button key={p} size="sm" variant={datePreset === p ? 'default' : 'outline'} className="text-xs whitespace-nowrap" onClick={() => handlePresetChange(p)}>
                    {p === 'all' ? 'All' : p === 'thisWeek' ? 'This Week' : p === 'thisMonth' ? 'This Month' : p.charAt(0).toUpperCase() + p.slice(1)}
                  </Button>
                ))}
              </div>
              {datePreset === 'custom' && (
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div><Label className="text-xs">From</Label><Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></div>
                  <div><Label className="text-xs">To</Label><Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></div>
                </div>
              )}
              <div className="space-y-2">
                <div><Label className="text-xs">Status</Label>
                  <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                    <option value="all">All</option><option value="received">Received</option><option value="pending">Pending</option><option value="cancelled">Cancelled</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-between mt-4">
                <Button variant="ghost" size="sm" onClick={clearFilters}>Clear All</Button>
                <Button size="sm" onClick={() => setFilterOpen(false)}>Apply</Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
        {hasFilters && (
          <div className="flex flex-wrap items-center gap-2">
            {(dateFrom || dateTo) && <button onClick={() => { setDateFrom(''); setDateTo(''); setDatePreset('all'); }} className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs">{dateFrom || 'Start'} – {dateTo || 'Today'}<X className="w-3 h-3" /></button>}
            {statusFilter !== 'all' && <button onClick={() => setStatusFilter('all')} className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs capitalize">{statusFilter}<X className="w-3 h-3" /></button>}
            {listSearch && <button onClick={() => setListSearch('')} className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs">Search: {listSearch}<X className="w-3 h-3" /></button>}
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>PO Number</TableHead><TableHead>Supplier</TableHead><TableHead>Date</TableHead>
              <TableHead>Total</TableHead><TableHead>Paid</TableHead><TableHead>Due</TableHead>
              <TableHead>Payment</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? Array.from({ length: 3 }).map((_, i) => (
              <TableRow key={i}>{Array.from({ length: 9 }).map((_, j) => <TableCell key={j}><div className="h-4 bg-muted rounded animate-pulse" /></TableCell>)}</TableRow>
            )) : filteredPurchases.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                <Receipt className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>No purchase orders found</p>
                <Button size="sm" variant="outline" className="mt-3" onClick={openCreateDialog}>Create your first purchase</Button>
              </TableCell></TableRow>
            ) : filteredPurchases.map((p, i) => (
              <motion.tr key={p.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }} className="hover:bg-muted/50 cursor-pointer" onClick={() => viewDetail(p)}>
                <TableCell className="font-medium">{p.po_number}</TableCell>
                <TableCell className="text-sm">{p.suppliers?.name || '-'}</TableCell>
                <TableCell className="text-sm">{new Date(p.purchase_date).toLocaleDateString()}</TableCell>
                <TableCell className="font-bold">৳{Number(p.total).toFixed(2)}</TableCell>
                <TableCell className="text-sm text-emerald-600">৳{Number(p.paid_amount || 0).toFixed(2)}</TableCell>
                <TableCell className="text-sm text-amber-600">৳{Number(p.due_amount || 0).toFixed(2)}</TableCell>
                <TableCell><Badge variant="outline" className="capitalize">{p.payment_method || 'cash'}</Badge></TableCell>
                <TableCell><Badge className={statusColors[p.status] || statusColors.pending}>{p.status}</Badge></TableCell>
                <TableCell className="text-right">
                  <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); viewDetail(p); }}><Eye className="w-4 h-4" /></Button>
                </TableCell>
              </motion.tr>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Create Purchase Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader><DialogTitle>New Purchase / ক্রয়</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 overflow-hidden">
            <div className="flex flex-col gap-3 overflow-hidden">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Search products by name, SKU, barcode..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
              </div>
              <ScrollArea className="flex-1 min-h-0">
                <div className="space-y-1 pr-2">
                  {filteredProducts.slice(0, 50).map((product) => {
                    const inCart = cart.find((c) => c.product_id === product.id);
                    return (
                      <div key={product.id} className={`flex items-center gap-3 p-2 rounded-lg border transition-all cursor-pointer ${inCart ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'}`} onClick={() => addToCart(product)}>
                        <div className="w-9 h-9 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-lg shrink-0 overflow-hidden">
                          {product.image_url ? <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" /> : <Package className="w-4 h-4 text-muted-foreground" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium line-clamp-1">{product.name}</p>
                          <p className="text-xs text-muted-foreground">Cost: ৳{product.cost_price} · Stock: {product.stock}</p>
                        </div>
                        <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0"><Plus className="w-4 h-4" /></Button>
                      </div>
                    );
                  })}
                  {filteredProducts.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">No products found</p>}
                </div>
              </ScrollArea>
            </div>

            <div className="flex flex-col overflow-hidden">
              <div className="space-y-2 mb-3">
                <Label>Supplier</Label>
                <select value={selectedSupplier} onChange={(e) => setSelectedSupplier(e.target.value)} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">No supplier</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              <ScrollArea className="flex-1 min-h-0">
                <div className="space-y-2 pr-2">
                  {cart.length === 0 ? (
                    <div className="text-center text-sm text-muted-foreground py-8"><Package className="w-10 h-10 mx-auto mb-2 opacity-40" /><p>Click products to add them</p></div>
                  ) : (
                    <AnimatePresence>
                      {cart.map((item) => (
                        <motion.div key={item.product_id} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex items-center gap-2 p-2 rounded-lg border border-border">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium line-clamp-1">{item.name}</p>
                            <div className="flex items-center gap-1 mt-1">
                              <Input type="number" value={item.cost_price} onChange={(e) => updateCost(item.product_id, Number(e.target.value) || 0)} className="h-7 w-20 text-xs" step="0.01" />
                              <span className="text-xs text-muted-foreground">x</span>
                              <div className="flex items-center gap-1">
                                <Button size="icon" variant="outline" className="h-6 w-6" onClick={() => updateQty(item.product_id, item.quantity - 1)}><Minus className="w-3 h-3" /></Button>
                                <span className="w-8 text-center text-sm">{item.quantity}</span>
                                <Button size="icon" variant="outline" className="h-6 w-6" onClick={() => updateQty(item.product_id, item.quantity + 1)}><Plus className="w-3 h-3" /></Button>
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold">৳{item.total.toFixed(2)}</p>
                            <button onClick={() => removeFromCart(item.product_id)} className="text-xs text-rose-600 hover:text-rose-700">Remove</button>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  )}
                </div>
              </ScrollArea>

              {cart.length > 0 && (
                <div className="space-y-2 pt-3 border-t border-border">
                  <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">Subtotal</span><span className="font-medium">৳{subtotal.toFixed(2)}</span></div>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground whitespace-nowrap">Tax %</Label>
                    <Input type="number" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} className="h-7 w-16 text-xs" />
                    <span className="text-sm text-muted-foreground ml-auto">৳{tax.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground whitespace-nowrap">Discount ৳</Label>
                    <Input type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} className="h-7 w-20 text-xs" />
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between"><span className="font-semibold">Total</span><span className="text-lg font-bold text-amber-600 dark:text-amber-400">৳{total.toFixed(2)}</span></div>

                  <div className="grid grid-cols-5 gap-1">
                    {paymentMethods.map((m) => (
                      <button key={m.id} onClick={() => setPaymentMethod(m.id)} className={`flex flex-col items-center gap-0.5 p-1.5 rounded-lg border text-[10px] transition-all ${paymentMethod === m.id ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted'}`}>
                        <span>{m.label}</span>
                      </button>
                    ))}
                  </div>

                  {paymentMethod === 'due' && (
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-muted-foreground whitespace-nowrap">Paid ৳</Label>
                      <Input type="number" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} className="h-7 w-24 text-xs" />
                      <span className="text-xs text-amber-600 ml-auto">Due: ৳{dueAmount.toFixed(2)}</span>
                    </div>
                  )}

                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Notes</Label>
                    <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes..." className="h-8 text-xs" />
                  </div>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button className="bg-gradient-to-r from-slate-800 to-black hover:from-slate-700 hover:to-slate-900" onClick={handleSave} disabled={saving || cart.length === 0}>
              <CheckCircle2 className="w-4 h-4 mr-2" /> {saving ? 'Saving...' : 'Complete Purchase'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
