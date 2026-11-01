'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  DollarSign,
  ShoppingCart,
  TrendingUp,
  Package,
  Users,
  AlertTriangle,
  Receipt,
  CreditCard,
  Shirt,
  Truck,
  RotateCcw,
  Wallet,
  HandCoins,
  Banknote,
  UserCheck,
  FileText,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/providers';
import { toast } from 'sonner';
import { useTranslation } from '@/hooks/use-translation';

const fmt = (n: number) => `৳${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type StatBox = {
  labelKey: string;
  value: string;
  icon: any;
  color: string;
};

export default function DashboardPage() {
  const [stats, setStats] = useState<StatBox[]>([]);
  const [sales30Chart, setSales30Chart] = useState<any[]>([]);
  const [financialYearChart, setFinancialYearChart] = useState<any[]>([]);
  const [categoryData, setCategoryData] = useState<any[]>([]);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [recentSales, setRecentSales] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { t, locale } = useTranslation();

  useEffect(() => {
    async function loadDashboard() {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const last30Start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const fyStart = new Date(now.getFullYear(), 6, 1).toISOString(); // July 1 fiscal year start (Bangladesh)
      if (now.getMonth() < 6) {
        // Before July, fiscal year started previous July
      }

      const [
        todaySalesRes, todayDueSalesRes, expensesRes, incomeRes,
        purchasesRes, duePurchasesRes,
        saleReturnsRes, purchaseReturnsRes,
        todayCollectionsRes, todayPaymentsRes,
        productsRes, customersRes, suppliersRes,
        invoicesRes, customerDueRes, supplierDueRes,
        stockRes,
        recentSalesRes,
        todayProfitRes,
      ] = await Promise.all([
        supabase.from('sales').select('total, sale_date').gte('sale_date', todayStart),
        supabase.from('sales').select('total, due_amount').eq('payment_status', 'due').gte('sale_date', todayStart),
        supabase.from('expenses').select('amount').gte('date', todayStart),
        supabase.from('customer_payments').select('amount').gte('payment_date', todayStart),
        supabase.from('purchases').select('total').gte('purchase_date', todayStart),
        supabase.from('purchases').select('total, due_amount').eq('payment_status', 'due').gte('purchase_date', todayStart),
        supabase.from('sale_returns').select('total').gte('return_date', todayStart),
        supabase.from('purchase_returns').select('total').gte('return_date', todayStart),
        supabase.from('customer_payments').select('amount').gte('payment_date', todayStart),
        supabase.from('supplier_payments').select('amount').gte('payment_date', todayStart),
        supabase.from('products').select('id, cost_price, stock', { count: 'exact', head: false }),
        supabase.from('customers').select('id', { count: 'exact', head: true }),
        supabase.from('suppliers').select('id', { count: 'exact', head: true }),
        supabase.from('sales').select('id', { count: 'exact', head: true }),
        supabase.from('customers').select('total_due'),
        supabase.from('suppliers').select('total_due'),
        supabase.from('products').select('stock, cost_price, selling_price'),
        supabase.from('sales').select('*, customers(name), employees(name), sale_items(*)').order('sale_date', { ascending: false }).limit(5),
        supabase.rpc('get_sales_profit_summary', {
          p_date_from: todayStart,
          p_date_to: null,
          p_payment_method: null,
          p_customer_id: null,
          p_status: 'completed',
          p_min_amount: null,
          p_max_amount: null,
          p_product_ids: [],
          p_category_ids: [],
          p_brand_ids: [],
          p_units: [],
        }),
      ]);

      const todaySales = todaySalesRes.data?.reduce((sum, s) => sum + Number(s.total), 0) || 0;
      const todayDueSales = todayDueSalesRes.data?.reduce((sum, s) => sum + Number(s.due_amount || s.total), 0) || 0;
      const expenses = expensesRes.data?.reduce((sum, e) => sum + Number(e.amount), 0) || 0;
      const income = incomeRes.data?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;
      const totalPurchases = purchasesRes.data?.reduce((sum, p) => sum + Number(p.total), 0) || 0;
      const duePurchases = duePurchasesRes.data?.reduce((sum, p) => sum + Number(p.due_amount || p.total), 0) || 0;
      const saleReturns = saleReturnsRes.data?.reduce((sum, r) => sum + Number(r.total), 0) || 0;
      const purchaseReturns = purchaseReturnsRes.data?.reduce((sum, r) => sum + Number(r.total), 0) || 0;
      const todayCollections = todayCollectionsRes.data?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;
      const todayPayments = todayPaymentsRes.data?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;
      const stockCount = stockRes.data?.reduce((sum, p) => sum + Number(p.stock || 0), 0) || 0;
      const stockValue = stockRes.data?.reduce((sum, p) => sum + Number(p.stock || 0) * Number(p.cost_price || 0), 0) || 0;
      const totalCustomerDue = customerDueRes.data?.reduce((sum, c) => sum + Number(c.total_due || 0), 0) || 0;
      const totalSupplierDue = supplierDueRes.data?.reduce((sum, s) => sum + Number(s.total_due || 0), 0) || 0;

      if (todayProfitRes.error) {
        toast.error(`${t('dashboard.profitLoadFailed')}: ${todayProfitRes.error.message}`);
      }
      const netProfit = todayProfitRes.error
        ? null
        : Number(todayProfitRes.data || 0) + income - expenses;

      const statBoxes: StatBox[] = [
        { labelKey: 'dashboard.totalSales', value: fmt(todaySales), icon: ShoppingCart, color: 'from-slate-800 to-black' },
        { labelKey: 'dashboard.netProfit', value: netProfit === null ? '—' : fmt(netProfit), icon: TrendingUp, color: 'from-emerald-500 to-green-600' },
        { labelKey: 'dashboard.dueSales', value: fmt(todayDueSales), icon: CreditCard, color: 'from-amber-500 to-orange-600' },
        { labelKey: 'dashboard.expenses', value: fmt(expenses), icon: CreditCard, color: 'from-rose-500 to-pink-600' },
        { labelKey: 'dashboard.income', value: fmt(income), icon: HandCoins, color: 'from-teal-500 to-cyan-600' },
        { labelKey: 'dashboard.totalPurchases', value: fmt(totalPurchases), icon: Truck, color: 'from-blue-500 to-indigo-600' },
        { labelKey: 'dashboard.duePurchases', value: fmt(duePurchases), icon: Truck, color: 'from-violet-500 to-purple-600' },
        { labelKey: 'dashboard.salesReturns', value: fmt(saleReturns), icon: RotateCcw, color: 'from-orange-500 to-red-600' },
        { labelKey: 'dashboard.purchaseReturns', value: fmt(purchaseReturns), icon: RotateCcw, color: 'from-red-500 to-rose-600' },
        { labelKey: 'dashboard.todayCollections', value: fmt(todayCollections), icon: Wallet, color: 'from-green-500 to-emerald-600' },
        { labelKey: 'dashboard.todayPayments', value: fmt(todayPayments), icon: Banknote, color: 'from-cyan-500 to-blue-600' },
        { labelKey: 'dashboard.stockQuantity', value: stockCount.toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-US'), icon: Package, color: 'from-amber-600 to-yellow-600' },
        { labelKey: 'dashboard.stockValue', value: fmt(stockValue), icon: DollarSign, color: 'from-lime-500 to-green-600' },
        { labelKey: 'dashboard.totalCustomers', value: (customersRes.count || 0).toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-US'), icon: Users, color: 'from-teal-600 to-cyan-700' },
        { labelKey: 'dashboard.totalSuppliers', value: (suppliersRes.count || 0).toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-US'), icon: Truck, color: 'from-indigo-500 to-blue-600' },
        { labelKey: 'dashboard.totalInvoices', value: (invoicesRes.count || 0).toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-US'), icon: FileText, color: 'from-slate-600 to-gray-700' },
        { labelKey: 'dashboard.totalCustomerDue', value: fmt(totalCustomerDue), icon: UserCheck, color: 'from-pink-500 to-rose-600' },
      ];

      setStats(statBoxes);
      setRecentSales(recentSalesRes.data || []);

      // Sales last 30 days chart
      const sales30Res = await supabase
        .from('sales')
        .select('total, sale_date')
        .gte('sale_date', last30Start)
        .order('sale_date', { ascending: true });

      const days30: any[] = [];
      for (let i = 29; i >= 0; i--) {
        const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
        const daySales = (sales30Res.data || []).filter(
          (s) => new Date(s.sale_date) >= dayStart && new Date(s.sale_date) < dayEnd
        );
        const dayTotal = daySales.reduce((sum, s) => sum + Number(s.total), 0);
        days30.push({
          date: dayStart.toLocaleDateString(locale === 'bn' ? 'bn-BD' : 'en-US', { day: 'numeric', month: 'short' }),
          sales: Math.round(dayTotal * 100) / 100,
        });
      }
      setSales30Chart(days30);

      // Sales current financial year chart (monthly)
      const fyRes = await supabase
        .from('sales')
        .select('total, sale_date')
        .gte('sale_date', fyStart)
        .order('sale_date', { ascending: true });

      const months = Array.from({ length: 12 }, (_, index) =>
        new Date(now.getFullYear(), 6 + index, 1).toLocaleDateString(locale === 'bn' ? 'bn-BD' : 'en-US', { month: 'short' })
      );
      const fyData: any[] = months.map((month) => ({ month, sales: 0 }));
      (fyRes.data || []).forEach((s) => {
        const d = new Date(s.sale_date);
        let mIdx = d.getMonth() - 6; // July = 0
        if (mIdx < 0) mIdx += 12;
        if (mIdx >= 0 && mIdx < 12) {
          fyData[mIdx].sales += Number(s.total);
        }
      });
      setFinancialYearChart(fyData);

      // Category distribution
      const catRes = await supabase.from('products').select('categories(name), stock');
      const catMap: Record<string, number> = {};
      (catRes.data || []).forEach((p: any) => {
        const catName = p.categories?.name || 'Other';
        catMap[catName] = (catMap[catName] || 0) + Number(p.stock || 0);
      });
      const colors = ['hsl(142, 71%, 45%)', 'hsl(173, 58%, 39%)', 'hsl(197, 37%, 24%)', 'hsl(43, 74%, 66%)', 'hsl(27, 87%, 67%)', 'hsl(0, 84%, 60%)', 'hsl(280, 65%, 60%)', 'hsl(210, 80%, 56%)'];
      setCategoryData(
        Object.entries(catMap).map(([name, value], i) => ({ name, value, color: colors[i % colors.length] }))
      );

      // Top products by revenue
      const topProdRes = await supabase
        .from('sale_items')
        .select('product_name, quantity, total')
        .order('total', { ascending: false })
        .limit(5);
      setTopProducts(
        (topProdRes.data || []).map((item: any) => ({
          name: item.product_name,
          quantity: Number(item.quantity),
          revenue: Number(item.total),
        }))
      );

      setLoading(false);
    }
    loadDashboard();
  }, [locale, t]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="p-4 h-24 animate-pulse bg-muted/50" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-6 h-80 animate-pulse bg-muted/50" />
          <Card className="p-6 h-80 animate-pulse bg-muted/50" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome banner */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-800 to-black p-6 sm:p-8"
      >
        <div className="absolute top-0 right-0 w-64 h-64 bg-amber-400/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="relative flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Shirt className="w-5 h-5 text-amber-400" />
              <span className="text-amber-400 text-sm font-medium">StyleBazaar Fashion POS</span>
            </div>
            <h2 className="text-2xl font-bold font-heading text-white mb-1">
              {t('dashboard.welcomeName', { name: typeof user?.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : user?.email || t('dashboard.there') })}
            </h2>
            <p className="text-slate-300">
              {t('dashboard.storeToday')}
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" className="bg-white/10 text-white hover:bg-white/20 border-0">
              {t('dashboard.viewReports')}
            </Button>
            <Button className="bg-amber-500 text-slate-900 hover:bg-amber-400">
              {t('dashboard.newSale')}
            </Button>
          </div>
        </div>
      </motion.div>

      {/* 17 Stat Boxes */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.labelKey}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: i * 0.03 }}
          >
            <Card className="p-4 hover:shadow-lg transition-shadow">
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${stat.color} flex items-center justify-center shrink-0`}>
                  <stat.icon className="w-5 h-5 text-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground truncate">{t(stat.labelKey)}</p>
                  <p className="text-lg font-bold font-heading mt-0.5">{stat.value}</p>
                </div>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Sales Last 30 Days */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
        >
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold font-heading">{t('dashboard.salesLast30Days')}</h3>
              </div>
              <Badge variant="secondary" className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                {t('dashboard.days30')}
              </Badge>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={sales30Chart}>
                <defs>
                  <linearGradient id="color30Sales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(38, 92%, 50%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(38, 92%, 50%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={10} interval={4} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                />
                <Area type="monotone" dataKey="sales" stroke="hsl(38, 92%, 50%)" strokeWidth={2} fill="url(#color30Sales)" />
              </AreaChart>
            </ResponsiveContainer>
          </Card>
        </motion.div>

        {/* Sales Current Financial Year */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.35 }}
        >
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold font-heading">{t('dashboard.financialYearSales')}</h3>
              </div>
              <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                {t('dashboard.annual')}
              </Badge>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={financialYearChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                />
                <Bar dataKey="sales" fill="hsl(142, 71%, 45%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </motion.div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Stock by Category */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.4 }}
        >
          <Card className="p-6">
            <h3 className="font-semibold font-heading mb-1">{t('dashboard.stockByCategory')}</h3>
            <p className="text-sm text-muted-foreground mb-4">{t('dashboard.inventoryDistribution')}</p>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={categoryData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={3} dataKey="value">
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-1.5 mt-2">
              {categoryData.slice(0, 5).map((cat) => (
                <div key={cat.name} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />
                    <span className="text-muted-foreground">{cat.name}</span>
                  </div>
                  <span className="font-medium">{cat.value}</span>
                </div>
              ))}
              {categoryData.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">{t('common.noData')}</p>}
            </div>
          </Card>
        </motion.div>

        {/* Top Selling Products */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.45 }}
        >
          <Card className="p-6">
            <h3 className="font-semibold font-heading mb-4">{t('dashboard.topProducts')}</h3>
            {topProducts.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={topProducts} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis dataKey="name" type="category" stroke="hsl(var(--muted-foreground))" fontSize={10} width={90} tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                  <Bar dataKey="revenue" fill="hsl(38, 92%, 50%)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[240px] text-muted-foreground text-sm">{t('dashboard.noSalesData')}</div>
            )}
          </Card>
        </motion.div>

        {/* Recent Sales */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.5 }}
        >
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold font-heading">{t('dashboard.recentSales')}</h3>
              <Button variant="ghost" size="sm" className="text-primary">{t('dashboard.viewAll')}</Button>
            </div>
            <div className="space-y-3">
              {recentSales.length > 0 ? recentSales.map((sale) => (
                <div key={sale.id} className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                      <ShoppingCart className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{sale.invoice_number}</p>
                      <p className="text-xs text-muted-foreground">
                        {sale.customers?.name || t('pos.walkInCustomer')} · {t('dashboard.itemsCount', { count: sale.sale_items?.length || 0 })}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold">{fmt(Number(sale.total))}</p>
                    <p className="text-xs text-muted-foreground capitalize">{sale.payment_method}</p>
                  </div>
                </div>
              )) : (
                <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">{t('dashboard.noSalesYet')}</div>
              )}
            </div>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
