'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShoppingBag,
  Search,
  Eye,
  X,
  CheckCircle2,
  Calendar,
  DollarSign,
  Receipt,
  Printer,
  Ban,
  Filter,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';
import type { Sale, SaleItem } from '@/types';
import { toast } from 'sonner';

type DatePreset = 'all' | 'today' | 'yesterday' | 'thisWeek' | 'thisMonth' | 'custom';
type PaymentFilter = 'all' | 'cash' | 'card' | 'mobile' | 'bank' | 'due';
type StatusFilter = 'all' | 'completed' | 'cancelled';

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function localBoundary(value: string, end: boolean): string {
  const [year, month, day] = value.split('-').map(Number);
  const date = end
    ? new Date(year, month - 1, day, 23, 59, 59, 999)
    : new Date(year, month - 1, day, 0, 0, 0, 0);
  return date.toISOString();
}

function getPresetRange(
  preset: 'today' | 'yesterday' | 'thisWeek' | 'thisMonth'
): { from: string; to: string } {
  const today = startOfDay(new Date());
  switch (preset) {
    case 'today':
      return { from: toDateInputValue(today), to: toDateInputValue(today) };
    case 'yesterday': {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return { from: toDateInputValue(yesterday), to: toDateInputValue(yesterday) };
    }
    case 'thisWeek': {
      const now = new Date();
      const day = now.getDay();
      const diff = day === 0 ? 6 : day - 1;
      const monday = startOfDay(
        new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff)
      );
      return { from: toDateInputValue(monday), to: toDateInputValue(today) };
    }
    case 'thisMonth': {
      const from = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: toDateInputValue(from), to: toDateInputValue(today) };
    }
  }
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatMoney(value: number): string {
  return `৳${Number(value).toFixed(2)}`;
}

function isSameDay(value: string): boolean {
  const date = new Date(value);
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

const statusBadgeClass = (status: string): string =>
  status === 'completed'
    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
    : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400';

const payStatusBadgeClass = (paymentStatus: string): string =>
  paymentStatus === 'paid'
    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';

export default function SalesPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const [detailSale, setDetailSale] = useState<Sale | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const loadSales = useCallback(async (): Promise<void> => {
    setLoading(true);
    let query = supabase
      .from('sales')
      .select('*, sale_items(*), customers(name, phone)')
      .order('sale_date', { ascending: false });

    if (dateFrom) query = query.gte('sale_date', localBoundary(dateFrom, false));
    if (dateTo) query = query.lte('sale_date', localBoundary(dateTo, true));
    if (paymentMethod !== 'all') query = query.eq('payment_method', paymentMethod);
    if (statusFilter !== 'all') query = query.eq('status', statusFilter);

    const { data, error } = await query;
    if (error) {
      toast.error('Could not load sales');
      setSales([]);
    } else {
      setSales((data as Sale[]) || []);
    }
    setLoading(false);
  }, [dateFrom, dateTo, paymentMethod, statusFilter]);

  useEffect(() => {
    loadSales();
  }, [loadSales]);

  const filteredSales = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return sales;
    return sales.filter((sale) => {
      const invoice = sale.invoice_number.toLowerCase();
      const customerName = (sale.customers?.name || '').toLowerCase();
      return invoice.includes(query) || customerName.includes(query);
    });
  }, [sales, search]);

  const completedSales = useMemo(
    () => filteredSales.filter((sale) => sale.status === 'completed'),
    [filteredSales]
  );

  const totalSales = useMemo(
    () => completedSales.reduce((sum, sale) => sum + Number(sale.total), 0),
    [completedSales]
  );

  const todaySales = useMemo(
    () =>
      completedSales
        .filter((sale) => isSameDay(sale.sale_date))
        .reduce((sum, sale) => sum + Number(sale.total), 0),
    [completedSales]
  );

  const totalDue = useMemo(
    () => completedSales.reduce((sum, sale) => sum + Number(sale.due_amount), 0),
    [completedSales]
  );

  const totalOrders = filteredSales.length;

  const productDiscounts = useMemo(
    () =>
      (detailSale?.sale_items || []).reduce(
        (sum, item) => sum + Number(item.discount_amount),
        0
      ),
    [detailSale]
  );

  const handlePresetChange = (preset: DatePreset): void => {
    setDatePreset(preset);
    if (preset === 'all') {
      setDateFrom('');
      setDateTo('');
    } else if (preset !== 'custom') {
      const range = getPresetRange(preset);
      setDateFrom(range.from);
      setDateTo(range.to);
    }
  };

  const openDetail = (sale: Sale): void => {
    setDetailSale(sale);
  };

  const handlePrint = (): void => {
    window.print();
  };

  const handleCancel = async (sale: Sale): Promise<void> => {
    setCancellingId(sale.id);
    const { error } = await supabase.rpc('cancel_sale', { p_sale_id: sale.id });
    if (error) {
      toast.error('Failed to cancel sale');
      setCancellingId(null);
      return;
    }
    toast.success('Sale cancelled and stock restored');
    setDetailSale(null);
    setCancellingId(null);
    loadSales();
  };

  const clearFilters = (): void => {
    setDatePreset('all');
    setDateFrom('');
    setDateTo('');
    setPaymentMethod('all');
    setStatusFilter('all');
    setSearch('');
  };

  const hasFilters =
    Boolean(dateFrom || dateTo) ||
    paymentMethod !== 'all' ||
    statusFilter !== 'all' ||
    Boolean(search.trim());

  const stats = [
    { label: 'Total Sales', value: formatMoney(totalSales), icon: DollarSign, color: 'from-amber-500 to-orange-600' },
    { label: "Today's Sales", value: formatMoney(todaySales), icon: Calendar, color: 'from-blue-500 to-cyan-600' },
    { label: 'Total Orders', value: totalOrders, icon: Receipt, color: 'from-slate-800 to-black' },
    { label: 'Total Due', value: formatMoney(totalDue), icon: ShoppingBag, color: 'from-rose-500 to-pink-600' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-slate-800 to-black flex items-center justify-center">
            <ShoppingBag className="w-6 h-6 text-amber-500" />
          </div>
          <div>
            <h2 className="text-2xl font-bold font-heading">
              Sales / বিক্রয়
            </h2>
            <p className="text-sm text-muted-foreground">
              View all completed transactions
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
          >
            <Card className="p-4">
              <div
                className={`w-10 h-10 rounded-lg bg-gradient-to-br ${stat.color} mb-3 flex items-center justify-center`}
              >
                <stat.icon className="w-5 h-5 text-white" />
              </div>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className="text-xl font-bold mt-1">{stat.value}</p>
            </Card>
          </motion.div>
        ))}
      </div>

      <Card className="p-4 space-y-4">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search invoice number or customer name..."
              className="pl-9"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <select
                value={datePreset}
                onChange={(event) => handlePresetChange(event.target.value as DatePreset)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="all">All Time</option>
                <option value="today">Today</option>
                <option value="yesterday">Yesterday</option>
                <option value="thisWeek">This Week</option>
                <option value="thisMonth">This Month</option>
                <option value="custom">Custom Range</option>
              </select>
            </div>

            {datePreset === 'custom' && (
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(event) => setDateFrom(event.target.value)}
                  className="h-9 w-auto text-sm"
                />
                <span className="text-muted-foreground text-sm">to</span>
                <Input
                  type="date"
                  value={dateTo}
                  min={dateFrom || undefined}
                  onChange={(event) => setDateTo(event.target.value)}
                  className="h-9 w-auto text-sm"
                />
              </div>
            )}

            <select
              value={paymentMethod}
              onChange={(event) => setPaymentMethod(event.target.value as PaymentFilter)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm capitalize"
            >
              <option value="all">All Payments</option>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="mobile">Mobile</option>
              <option value="bank">Bank</option>
              <option value="due">Due</option>
            </select>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="all">All Status</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>

            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Clear
              </Button>
            )}
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-center">Items</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Payment Method</TableHead>
                <TableHead>Pay Status</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 6 }).map((_, rowIndex) => (
                  <TableRow key={rowIndex}>
                    {Array.from({ length: 9 }).map((_, cellIndex) => (
                      <TableCell key={cellIndex}>
                        <div className="h-4 bg-muted rounded animate-pulse" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : filteredSales.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-16 text-center">
                    <ShoppingBag className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-40" />
                    <p className="font-medium">No sales found</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Try adjusting the search or filter options.
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                <AnimatePresence>
                  {filteredSales.map((sale, index) => (
                    <motion.tr
                      key={sale.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ delay: index * 0.02 }}
                      className="hover:bg-muted/50 cursor-pointer"
                      onClick={() => openDetail(sale)}
                    >
                      <TableCell className="font-medium">{sale.invoice_number}</TableCell>
                      <TableCell className="text-sm">
                        {sale.customers?.name || 'Walk-in Customer'}
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {formatDateTime(sale.sale_date)}
                      </TableCell>
                      <TableCell className="text-center text-sm">
                        {sale.sale_items?.length ?? 0}
                      </TableCell>
                      <TableCell className="text-right font-bold">
                        {formatMoney(Number(sale.total))}
                      </TableCell>
                      <TableCell className="text-sm capitalize">
                        {sale.payment_method}
                      </TableCell>
                      <TableCell>
                        <Badge className={payStatusBadgeClass(sale.payment_status)}>
                          {sale.payment_status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={statusBadgeClass(sale.status)}>
                          {sale.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={(event) => {
                              event.stopPropagation();
                              openDetail(sale);
                            }}
                            aria-label="View sale"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          {sale.status === 'completed' && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-rose-600 hover:text-rose-700"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleCancel(sale);
                              }}
                              disabled={cancellingId === sale.id}
                              aria-label="Cancel sale"
                            >
                              <Ban className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={Boolean(detailSale)} onOpenChange={(open) => !open && setDetailSale(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          {detailSale && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-amber-500" />
                  <DialogTitle>{detailSale.invoice_number}</DialogTitle>
                </div>
                <p className="text-sm text-muted-foreground">
                  {formatDateTime(detailSale.sale_date)}
                  {detailSale.customers?.name
                    ? ` · ${detailSale.customers.name}`
                    : ' · Walk-in Customer'}
                </p>
              </DialogHeader>

              <div className="flex flex-wrap gap-2">
                <Badge className={statusBadgeClass(detailSale.status)}>
                  {detailSale.status}
                </Badge>
                <Badge className={payStatusBadgeClass(detailSale.payment_status)}>
                  {detailSale.payment_status === 'paid' && (
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                  )}
                  {detailSale.payment_status}
                </Badge>
                <Badge variant="outline" className="capitalize">
                  {detailSale.payment_method}
                </Badge>
              </div>

              <ScrollArea className="flex-1 min-h-0 max-h-[40vh]">
                <div className="pr-2">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-center">Qty</TableHead>
                        <TableHead className="text-right">Unit Price</TableHead>
                        <TableHead className="text-right">Discount</TableHead>
                        <TableHead className="text-right">Line Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(detailSale.sale_items || []).map((item: SaleItem) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">
                            {item.product_name}
                          </TableCell>
                          <TableCell className="text-center">
                            {Number(item.quantity)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatMoney(Number(item.unit_price))}
                          </TableCell>
                          <TableCell className="text-right">
                            {Number(item.discount_amount) > 0 ? (
                              <span className="text-rose-600 dark:text-rose-400">
                                {item.discount_type === 'percentage'
                                  ? `${Number(item.discount_value)}%`
                                  : item.discount_type === 'fixed'
                                  ? formatMoney(Number(item.discount_value))
                                  : '-'}
                                <span className="block text-xs text-muted-foreground">
                                  -{formatMoney(Number(item.discount_amount))}
                                </span>
                              </span>
                            ) : (
                              '-'
                            )}
                          </TableCell>
                          <TableCell className="text-right font-bold">
                            {formatMoney(Number(item.total))}
                          </TableCell>
                        </TableRow>
                      ))}
                      {(!detailSale.sale_items || detailSale.sale_items.length === 0) && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                            No items found
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </ScrollArea>

              <Separator />

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium">
                    {formatMoney(Number(detailSale.subtotal))}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Product Discounts</span>
                  <span className="font-medium text-rose-600 dark:text-rose-400">
                    -{formatMoney(productDiscounts)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Tax</span>
                  <span className="font-medium">{formatMoney(Number(detailSale.tax))}</span>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="font-semibold">Total</span>
                  <span className="text-lg font-bold text-amber-600 dark:text-amber-400">
                    {formatMoney(Number(detailSale.total))}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Paid</span>
                  <span className="font-medium text-emerald-600 dark:text-emerald-400">
                    {formatMoney(Number(detailSale.paid))}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Change</span>
                  <span className="font-medium">{formatMoney(Number(detailSale.change))}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Due</span>
                  <span className="font-medium text-amber-600 dark:text-amber-400">
                    {formatMoney(Number(detailSale.due_amount))}
                  </span>
                </div>
              </div>

              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={handlePrint}>
                  <Printer className="w-4 h-4 mr-2" /> Print Receipt
                </Button>
                {detailSale.status === 'completed' && (
                  <Button
                    variant="outline"
                    className="text-rose-600 hover:text-rose-700 border-rose-300 hover:border-rose-400 dark:border-rose-900/50"
                    onClick={() => handleCancel(detailSale)}
                    disabled={cancellingId === detailSale.id}
                  >
                    <Ban className="w-4 h-4 mr-2" />
                    {cancellingId === detailSale.id ? 'Cancelling...' : 'Cancel Sale'}
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
