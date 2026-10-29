'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  FileBarChart, DollarSign, ShoppingCart, Package, TrendingUp, Download,
  Truck, Receipt, Filter, X,
} from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { supabase } from '@/lib/supabase';

type DatePreset = 'today' | 'yesterday' | 'thisWeek' | 'thisMonth' | 'lastMonth' | 'all' | 'custom';

function toDateInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function startOfDay(date: Date): Date { return new Date(date.getFullYear(), date.getMonth(), date.getDate()); }
function localBoundary(value: string, end: boolean): string {
  const [y, m, d] = value.split('-').map(Number);
  const date = end ? new Date(y, m - 1, d, 23, 59, 59, 999) : new Date(y, m - 1, d, 0, 0, 0, 0);
  return date.toISOString();
}
function getPresetRange(preset: Exclude<DatePreset, 'all' | 'custom'>): { from: string; to: string } {
  const today = startOfDay(new Date());
  switch (preset) {
    case 'today': return { from: toDateInputValue(today), to: toDateInputValue(today) };
    case 'yesterday': { const y = new Date(today); y.setDate(y.getDate() - 1); return { from: toDateInputValue(y), to: toDateInputValue(y) }; }
    case 'thisWeek': { const now = new Date(); const day = now.getDay(); const diff = day === 0 ? 6 : day - 1; const monday = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff)); return { from: toDateInputValue(monday), to: toDateInputValue(today) }; }
    case 'thisMonth': { const from = new Date(today.getFullYear(), today.getMonth(), 1); return { from: toDateInputValue(from), to: toDateInputValue(today) }; }
    case 'lastMonth': { const from = new Date(today.getFullYear(), today.getMonth() - 1, 1); const to = new Date(today.getFullYear(), today.getMonth(), 0); return { from: toDateInputValue(from), to: toDateInputValue(to) }; }
  }
}

export default function ReportsPage() {
  const [loading, setLoading] = useState(true);
  const [dailyData, setDailyData] = useState<any[]>([]);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [recentSales, setRecentSales] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [purchases, setPurchases] = useState<any[]>([]);

  const [datePreset, setDatePreset] = useState<DatePreset>('thisMonth');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('all');
  const [filterOpen, setFilterOpen] = useState(false);

  useEffect(() => {
    if (datePreset !== 'all' && datePreset !== 'custom') {
      const r = getPresetRange(datePreset);
      setDateFrom(r.from);
      setDateTo(r.to);
    } else if (datePreset === 'all') {
      setDateFrom('');
      setDateTo('');
    }
  }, [datePreset]);

  const loadReports = useCallback(async () => {
    setLoading(true);
    let salesQuery = supabase.from('sales').select('*, customers(name)').order('sale_date', { ascending: false });
    if (dateFrom) salesQuery = salesQuery.gte('sale_date', localBoundary(dateFrom, false));
    if (dateTo) salesQuery = salesQuery.lte('sale_date', localBoundary(dateTo, true));
    if (paymentMethod !== 'all') salesQuery = salesQuery.eq('payment_method', paymentMethod);

    let purchaseQuery = supabase.from('purchases').select('*, suppliers(name)').order('purchase_date', { ascending: false });
    if (dateFrom) purchaseQuery = purchaseQuery.gte('purchase_date', localBoundary(dateFrom, false));
    if (dateTo) purchaseQuery = purchaseQuery.lte('purchase_date', localBoundary(dateTo, true));

    const [salesRes, purchaseRes] = await Promise.all([salesQuery, purchaseQuery]);

    const salesData = (salesRes.data || []).filter((s: any) => s.status !== 'cancelled');
    const purchaseData = (purchaseRes.data || []).filter((p: any) => p.status !== 'cancelled');
    setSales(salesData);
    setPurchases(purchaseData);
    setRecentSales(salesData.slice(0, 10));

    const now = new Date();
    const days: any[] = [];
    for (let i = 29; i >= 0; i--) {
      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const dayEnd = new Date(dayStart.getTime() + 86400000);
      const daySales = salesData.filter((s: any) => new Date(s.sale_date) >= dayStart && new Date(s.sale_date) < dayEnd);
      days.push({
        date: dayStart.toLocaleDateString('en', { month: 'short', day: 'numeric' }),
        sales: Math.round(daySales.reduce((sum: number, s: any) => sum + Number(s.total), 0) * 100) / 100,
        orders: daySales.length,
      });
    }
    setDailyData(days);

    const itemsRes = await supabase.from('sale_items').select('product_name, quantity, total, price').order('total', { ascending: false }).limit(20);
    const productMap: Record<string, { name: string; quantity: number; revenue: number }> = {};
    (itemsRes.data || []).forEach((item: any) => {
      const key = item.product_name;
      if (!productMap[key]) productMap[key] = { name: key, quantity: 0, revenue: 0 };
      productMap[key].quantity += Number(item.quantity);
      productMap[key].revenue += Number(item.total);
    });
    setTopProducts(Object.values(productMap).sort((a, b) => b.revenue - a.revenue).slice(0, 5));

    setLoading(false);
  }, [dateFrom, dateTo, paymentMethod]);

  useEffect(() => { loadReports(); }, [loadReports]);

  const totalSalesAmount = sales.reduce((s: number, sale: any) => s + Number(sale.total), 0);
  const totalDiscount = sales.reduce((s: number, sale: any) => s + Number(sale.discount), 0);
  const totalPaid = sales.reduce((s: number, sale: any) => s + Number(sale.paid), 0);
  const totalDue = sales.reduce((s: number, sale: any) => s + Number(sale.due_amount), 0);
  const totalOrders = sales.length;

  const totalPurchaseAmount = purchases.reduce((s: number, p: any) => s + Number(p.total), 0);
  const totalPurchasePaid = purchases.reduce((s: number, p: any) => s + Number(p.paid_amount || 0), 0);
  const totalPurchaseDue = purchases.reduce((s: number, p: any) => s + Number(p.due_amount || 0), 0);
  const totalPurchaseOrders = purchases.length;

  const salesReportCards = [
    { label: 'Total Sales', value: `৳${totalSalesAmount.toFixed(2)}`, icon: DollarSign, color: 'from-amber-500 to-orange-600' },
    { label: 'Total Orders', value: totalOrders.toString(), icon: ShoppingCart, color: 'from-slate-800 to-black' },
    { label: 'Total Discount', value: `৳${totalDiscount.toFixed(2)}`, icon: TrendingUp, color: 'from-blue-500 to-cyan-600' },
    { label: 'Total Due', value: `৳${totalDue.toFixed(2)}`, icon: FileBarChart, color: 'from-rose-500 to-pink-600' },
  ];

  const purchaseReportCards = [
    { label: 'Total Purchases', value: `৳${totalPurchaseAmount.toFixed(2)}`, icon: Truck, color: 'from-blue-500 to-cyan-600' },
    { label: 'Purchase Orders', value: totalPurchaseOrders.toString(), icon: Receipt, color: 'from-slate-800 to-black' },
    { label: 'Total Paid', value: `৳${totalPurchasePaid.toFixed(2)}`, icon: DollarSign, color: 'from-emerald-500 to-green-600' },
    { label: 'Total Due', value: `৳${totalPurchaseDue.toFixed(2)}`, icon: FileBarChart, color: 'from-amber-500 to-orange-600' },
  ];

  const hasFilters = Boolean(dateFrom || dateTo) || paymentMethod !== 'all';

  const clearFilters = () => { setDatePreset('all'); setDateFrom(''); setDateTo(''); setPaymentMethod('all'); };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold font-heading">Reports & Analytics</h2>
          <p className="text-sm text-muted-foreground">Sales and purchase performance insights</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/reports/purchase-expense"><Button variant="outline" size="sm">Purchase & Expense Report</Button></Link>
          <Popover open={filterOpen} onOpenChange={setFilterOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm"><Filter className="w-4 h-4 mr-2" /> Filter {hasFilters && <span className="ml-1 rounded-full bg-primary text-primary-foreground px-1.5 text-[10px]">Active</span>}</Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[min(92vw,380px)] p-4">
              <div className="mb-3"><h3 className="font-semibold">Report Filters</h3></div>
              <div className="flex gap-1 flex-wrap mb-3">
                {(['today', 'yesterday', 'thisWeek', 'thisMonth', 'lastMonth', 'all'] as DatePreset[]).map((p) => (
                  <Button key={p} size="sm" variant={datePreset === p ? 'default' : 'outline'} className="text-xs whitespace-nowrap" onClick={() => setDatePreset(p)}>
                    {p === 'thisWeek' ? 'This Week' : p === 'thisMonth' ? 'This Month' : p === 'lastMonth' ? 'Last Month' : p.charAt(0).toUpperCase() + p.slice(1)}
                  </Button>
                ))}
              </div>
              {datePreset === 'custom' && (
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div><Label className="text-xs">From</Label><Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></div>
                  <div><Label className="text-xs">To</Label><Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></div>
                </div>
              )}
              <div><Label className="text-xs">Payment Method</Label>
                <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="all">All Methods</option><option value="cash">Cash</option><option value="card">Card</option><option value="mobile">Mobile</option><option value="bank">Bank</option><option value="due">Due</option>
                </select>
              </div>
              <div className="flex justify-between mt-4">
                <Button variant="ghost" size="sm" onClick={clearFilters}>Clear All</Button>
                <Button size="sm" onClick={() => setFilterOpen(false)}>Apply</Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {hasFilters && (
        <div className="flex flex-wrap items-center gap-2">
          {(dateFrom || dateTo) && <span className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs">{dateFrom || 'Start'} – {dateTo || 'Today'}</span>}
          {paymentMethod !== 'all' && <span className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs capitalize">Payment: {paymentMethod}<button onClick={() => setPaymentMethod('all')}><X className="w-3 h-3" /></button></span>}
        </div>
      )}

      {/* Sales Report Cards */}
      <div>
        <h3 className="text-lg font-semibold mb-3">Sales Report / বিক্রয়</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {salesReportCards.map((stat, i) => (
            <motion.div key={stat.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center shadow-md`}>
                    <stat.icon className="w-5 h-5 text-white" />
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
                <p className="text-2xl font-bold font-heading mt-1">{stat.value}</p>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Purchase Report Cards */}
      <div>
        <h3 className="text-lg font-semibold mb-3">Purchase Report / ক্রয়</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {purchaseReportCards.map((stat, i) => (
            <motion.div key={stat.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center shadow-md`}>
                    <stat.icon className="w-5 h-5 text-white" />
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
                <p className="text-2xl font-bold font-heading mt-1">{stat.value}</p>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Sales trend chart */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold font-heading">Sales Trend (30 Days)</h3>
              <p className="text-sm text-muted-foreground">Daily sales and order count</p>
            </div>
            <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">Monthly</Badge>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={dailyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} interval={4} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
              <Legend />
              <Line type="monotone" dataKey="sales" stroke="hsl(142, 71%, 45%)" strokeWidth={2} dot={false} name="Sales (৳)" />
              <Line type="monotone" dataKey="orders" stroke="hsl(173, 58%, 39%)" strokeWidth={2} dot={false} name="Orders" />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card className="p-6">
            <h3 className="font-semibold font-heading mb-4">Top Products by Revenue</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={topProducts} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis dataKey="name" type="category" stroke="hsl(var(--muted-foreground))" fontSize={11} width={120} tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                <Bar dataKey="revenue" fill="hsl(142, 71%, 45%)" radius={[0, 4, 4, 0]} name="Revenue (৳)" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
          <Card className="p-6">
            <h3 className="font-semibold font-heading mb-4">Recent Transactions</h3>
            <Table>
              <TableHeader><TableRow><TableHead>Invoice</TableHead><TableHead>Customer</TableHead><TableHead>Amount</TableHead><TableHead>Method</TableHead></TableRow></TableHeader>
              <TableBody>
                {recentSales.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No transactions found</TableCell></TableRow>
                ) : recentSales.map((sale) => (
                  <TableRow key={sale.id} className="hover:bg-muted/50">
                    <TableCell className="text-sm font-medium">{sale.invoice_number}</TableCell>
                    <TableCell className="text-sm">{sale.customers?.name || 'Walk-in'}</TableCell>
                    <TableCell className="font-bold">৳{Number(sale.total).toFixed(2)}</TableCell>
                    <TableCell><Badge variant="outline" className="capitalize">{sale.payment_method}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </motion.div>
      </div>

      {/* Purchase transactions table */}
      <Card className="overflow-hidden">
        <div className="p-4 border-b border-border"><h3 className="font-semibold">Recent Purchases</h3></div>
        <Table>
          <TableHeader><TableRow><TableHead>PO Number</TableHead><TableHead>Supplier</TableHead><TableHead>Date</TableHead><TableHead>Total</TableHead><TableHead>Paid</TableHead><TableHead>Due</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {purchases.slice(0, 10).map((p) => (
              <TableRow key={p.id} className="hover:bg-muted/50">
                <TableCell className="text-sm font-medium">{p.po_number}</TableCell>
                <TableCell className="text-sm">{p.suppliers?.name || '-'}</TableCell>
                <TableCell className="text-sm">{new Date(p.purchase_date).toLocaleDateString()}</TableCell>
                <TableCell className="font-bold">৳{Number(p.total).toFixed(2)}</TableCell>
                <TableCell className="text-sm text-emerald-600">৳{Number(p.paid_amount || 0).toFixed(2)}</TableCell>
                <TableCell className="text-sm text-amber-600">৳{Number(p.due_amount || 0).toFixed(2)}</TableCell>
                <TableCell><Badge variant="outline" className="capitalize">{p.status}</Badge></TableCell>
              </TableRow>
            ))}
            {purchases.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No purchases found</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
