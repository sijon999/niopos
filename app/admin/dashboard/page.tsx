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

function formatStockValue(value: number, currencySymbol: string, locale: string) {
  const numberLocale = locale === 'bn' ? 'bn-BD' : 'en-US';
  return `${currencySymbol}${value.toLocaleString(numberLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function sumRows<T>(
  result: { data: T[] | null; error: { message: string } | null },
  getValue: (row: T) => unknown
): number | null {
  if (result.error) return null;
  return (result.data || []).reduce((sum, row) => sum + Number(getValue(row) || 0), 0);
}

function getMetricError(name: string, error: { message: string } | null) {
  return error ? { name, message: error.message } : null;
}

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
  const { user, isLoading: authLoading } = useAuth();
  const { t, locale } = useTranslation();
  const userId = user?.id;

  useEffect(() => {
    if (authLoading) return;
    if (!userId) {
      setLoading(false);
      return;
    }

    let active = true;
    let requestInFlight = false;
    let refreshAfterCurrentLoad = false;

    async function loadDashboard() {
      if (requestInFlight) {
        refreshAfterCurrentLoad = true;
        return;
      }
      requestInFlight = true;
      try {
      const now = new Date();
      const todayStartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const tomorrowStartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      const todayStart = todayStartDate.toISOString();
      const tomorrowStart = tomorrowStartDate.toISOString();
      const todayEnd = new Date(tomorrowStartDate.getTime() - 1).toISOString();
      const todayDate = [
        todayStartDate.getFullYear(),
        String(todayStartDate.getMonth() + 1).padStart(2, '0'),
        String(todayStartDate.getDate()).padStart(2, '0'),
      ].join('-');
      const last30Start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const financialYearStartYear = now.getFullYear() - (now.getMonth() < 6 ? 1 : 0);
      const fyStart = new Date(financialYearStartYear, 6, 1).toISOString();

      const [
        todaySalesRes, todayDueSalesRes, expensesRes,
        purchasesRes, duePurchasesRes,
        saleReturnsRes, purchaseReturnsRes,
        todayCollectionsRes, todayPaymentsRes,
        customersRes, suppliersRes,
        invoicesRes, customerDueRes,
        inventoryTotalsRes, settingsRes,
        recentSalesRes,
        todayProfitRes,
      ] = await Promise.all([
        supabase.from('sales').select('total, sale_date').eq('status', 'completed').gte('sale_date', todayStart).lt('sale_date', tomorrowStart),
        supabase.from('sales').select('total, due_amount').eq('status', 'completed').gt('due_amount', 0).gte('sale_date', todayStart).lt('sale_date', tomorrowStart),
        supabase.from('expenses').select('amount').eq('date', todayDate),
        supabase.from('purchases').select('total').gte('purchase_date', todayStart).lt('purchase_date', tomorrowStart),
        supabase.from('purchases').select('total, due_amount').eq('payment_status', 'due').gte('purchase_date', todayStart).lt('purchase_date', tomorrowStart),
        supabase.rpc('get_sales_return_report', {
          p_date_from: todayStart,
          p_date_to: todayEnd,
          p_customer_id: null,
          p_product_ids: [],
          p_category_ids: [],
          p_brand_ids: [],
          p_units: [],
          p_time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        }),
        supabase.from('purchase_returns').select('total').gte('return_date', todayStart).lt('return_date', tomorrowStart),
        supabase.from('customer_payments').select('amount').gte('payment_date', todayStart).lt('payment_date', tomorrowStart),
        supabase.from('supplier_payments').select('amount').gte('payment_date', todayStart).lt('payment_date', tomorrowStart),
        supabase.from('customers').select('id', { count: 'exact', head: true }),
        supabase.from('suppliers').select('id', { count: 'exact', head: true }),
        supabase.from('sales').select('id', { count: 'exact', head: true }),
        supabase.from('customers').select('total_due'),
        supabase.rpc('get_dashboard_inventory_totals'),
        supabase.from('settings').select('currency, currency_symbol').maybeSingle(),
        supabase.from('sales').select('*, customers(name), employees(name), sale_items(*)').order('sale_date', { ascending: false }).limit(5),
        supabase.rpc('get_sales_profit_summary', {
          p_date_from: todayStart,
          p_date_to: todayEnd,
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

      if (!active) return;
      const metricErrors = [
        getMetricError('sales', todaySalesRes.error),
        getMetricError('due sales', todayDueSalesRes.error),
        getMetricError('expenses', expensesRes.error),
        getMetricError('collections', todayCollectionsRes.error),
        getMetricError('purchases', purchasesRes.error),
        getMetricError('due purchases', duePurchasesRes.error),
        getMetricError('sales returns', saleReturnsRes.error),
        getMetricError('purchase returns', purchaseReturnsRes.error),
        getMetricError('customer payments', todayPaymentsRes.error),
        getMetricError('customers', customersRes.error),
        getMetricError('suppliers', suppliersRes.error),
        getMetricError('invoices', invoicesRes.error),
        getMetricError('customer balances', customerDueRes.error),
        getMetricError('inventory totals', inventoryTotalsRes.error),
        getMetricError('store currency', settingsRes.error),
        getMetricError('recent sales', recentSalesRes.error),
        getMetricError('sales profit', todayProfitRes.error),
      ].filter((entry): entry is { name: string; message: string } => entry !== null);
      if (metricErrors.length > 0) {
        console.error('[Dashboard] Failed to load metrics:', metricErrors);
        toast.error(`${t('dashboard.metricsLoadFailed')}: ${metricErrors[0].name} — ${metricErrors[0].message}`);
      }

      const todaySales = sumRows(todaySalesRes, (sale) => sale.total);
      const todayDueSales = sumRows(todayDueSalesRes, (sale) => sale.due_amount);
      const expenses = sumRows(expensesRes, (expense) => expense.amount);
      const income = sumRows(todayCollectionsRes, (payment) => payment.amount);
      const totalPurchases = sumRows(purchasesRes, (purchase) => purchase.total);
      const duePurchases = sumRows(duePurchasesRes, (purchase) => purchase.due_amount || purchase.total);
      const returnReport = saleReturnsRes.error
        ? null
        : saleReturnsRes.data as {
          total_return: number;
          profit_reversal: number;
        } | null;
      const saleReturns = returnReport ? Number(returnReport.total_return || 0) : null;
      const purchaseReturns = sumRows(purchaseReturnsRes, (row) => row.total);
      const todayCollections = income;
      const todayPayments = sumRows(todayPaymentsRes, (payment) => payment.amount);
      const stockCount = inventoryTotalsRes.error
        ? null
        : Number(inventoryTotalsRes.data?.[0]?.stock_quantity ?? 0);
      const stockValue = inventoryTotalsRes.error
        ? null
        : Number(inventoryTotalsRes.data?.[0]?.stock_value ?? 0);
      const currencySymbol = settingsRes.data?.currency_symbol?.trim()
        || (settingsRes.data?.currency === 'BDT' ? '৳' : settingsRes.data?.currency || '৳');
      const totalCustomerDue = sumRows(customerDueRes, (customer) => customer.total_due);
      const netProfit = todayProfitRes.error
        ? null
        : returnReport
          && expenses !== null
          ? Number(todayProfitRes.data || 0) - Number(returnReport.profit_reversal || 0) - expenses
          : null;

      const statBoxes: StatBox[] = [
        { labelKey: 'dashboard.todayTotalSales', value: todaySales === null ? '—' : fmt(todaySales), icon: ShoppingCart, color: 'from-amber-500 to-orange-600' },
        { labelKey: 'dashboard.netSales', value: saleReturns === null || todaySales === null ? '—' : fmt(todaySales - saleReturns), icon: ShoppingCart, color: 'from-slate-800 to-black' },
        { labelKey: 'dashboard.netProfit', value: netProfit === null ? '—' : fmt(netProfit), icon: TrendingUp, color: 'from-emerald-500 to-green-600' },
        { labelKey: 'dashboard.dueSales', value: todayDueSales === null ? '—' : fmt(todayDueSales), icon: CreditCard, color: 'from-amber-500 to-orange-600' },
        { labelKey: 'dashboard.expenses', value: expenses === null ? '—' : fmt(expenses), icon: CreditCard, color: 'from-rose-500 to-pink-600' },
        { labelKey: 'dashboard.income', value: income === null ? '—' : fmt(income), icon: HandCoins, color: 'from-teal-500 to-cyan-600' },
        { labelKey: 'dashboard.totalPurchases', value: totalPurchases === null ? '—' : fmt(totalPurchases), icon: Truck, color: 'from-blue-500 to-indigo-600' },
        { labelKey: 'dashboard.duePurchases', value: duePurchases === null ? '—' : fmt(duePurchases), icon: Truck, color: 'from-violet-500 to-purple-600' },
        { labelKey: 'dashboard.salesReturns', value: saleReturns === null ? '—' : fmt(saleReturns), icon: RotateCcw, color: 'from-orange-500 to-red-600' },
        { labelKey: 'dashboard.purchaseReturns', value: purchaseReturns === null ? '—' : fmt(purchaseReturns), icon: RotateCcw, color: 'from-red-500 to-rose-600' },
        { labelKey: 'dashboard.todayCollections', value: todayCollections === null ? '—' : fmt(todayCollections), icon: Wallet, color: 'from-green-500 to-emerald-600' },
        { labelKey: 'dashboard.todayPayments', value: todayPayments === null ? '—' : fmt(todayPayments), icon: Banknote, color: 'from-cyan-500 to-blue-600' },
        { labelKey: 'dashboard.stockQuantity', value: stockCount === null ? '—' : stockCount.toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-US'), icon: Package, color: 'from-amber-600 to-yellow-600' },
        { labelKey: 'dashboard.stockValue', value: stockValue === null ? '—' : formatStockValue(stockValue, currencySymbol, locale), icon: DollarSign, color: 'from-lime-500 to-green-600' },
        { labelKey: 'dashboard.totalCustomers', value: customersRes.error ? '—' : (customersRes.count || 0).toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-US'), icon: Users, color: 'from-teal-600 to-cyan-700' },
        { labelKey: 'dashboard.totalSuppliers', value: suppliersRes.error ? '—' : (suppliersRes.count || 0).toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-US'), icon: Truck, color: 'from-indigo-500 to-blue-600' },
        { labelKey: 'dashboard.totalInvoices', value: invoicesRes.error ? '—' : (invoicesRes.count || 0).toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-US'), icon: FileText, color: 'from-slate-600 to-gray-700' },
        { labelKey: 'dashboard.totalCustomerDue', value: totalCustomerDue === null ? '—' : fmt(totalCustomerDue), icon: UserCheck, color: 'from-pink-500 to-rose-600' },
      ];

      if (!active) return;
      setStats(statBoxes);
      setRecentSales(recentSalesRes.data || []);

      // Sales last 30 days chart
      const sales30Res = await supabase
        .from('sales')
        .select('total, sale_date')
        .gte('sale_date', last30Start)
        .order('sale_date', { ascending: true });
      if (!active) return;
      if (sales30Res.error) {
        console.error('[Dashboard] Failed to load 30-day sales chart:', sales30Res.error);
        toast.error(`${t('dashboard.metricsLoadFailed')}: ${sales30Res.error.message}`);
      }

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
      if (!active) return;
      if (fyRes.error) {
        console.error('[Dashboard] Failed to load financial year chart:', fyRes.error);
        toast.error(`${t('dashboard.metricsLoadFailed')}: ${fyRes.error.message}`);
      }

      const months = Array.from({ length: 12 }, (_, index) =>
        new Date(financialYearStartYear, 6 + index, 1).toLocaleDateString(locale === 'bn' ? 'bn-BD' : 'en-US', { month: 'short' })
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
      if (!active) return;
      if (catRes.error) {
        console.error('[Dashboard] Failed to load category chart:', catRes.error);
        toast.error(`${t('dashboard.metricsLoadFailed')}: ${catRes.error.message}`);
      }
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
      if (!active) return;
      if (topProdRes.error) {
        console.error('[Dashboard] Failed to load top products:', topProdRes.error);
        toast.error(`${t('dashboard.metricsLoadFailed')}: ${topProdRes.error.message}`);
      }
      setTopProducts(
        (topProdRes.data || []).map((item: any) => ({
          name: item.product_name,
          quantity: Number(item.quantity),
          revenue: Number(item.total),
        }))
      );

      } finally {
        requestInFlight = false;
        if (active) {
          setLoading(false);
          if (refreshAfterCurrentLoad) {
            refreshAfterCurrentLoad = false;
            void loadDashboard();
          }
        }
      }
    }
    void loadDashboard();
    let refreshTimeout: number | null = null;
    const scheduleDashboardRefresh = () => {
      if (refreshTimeout !== null) window.clearTimeout(refreshTimeout);
      refreshTimeout = window.setTimeout(() => {
        refreshTimeout = null;
        void loadDashboard();
      }, 400);
    };
    const channel = supabase.channel(`dashboard-${userId}`);
    [
      'sales',
      'sale_items',
      'expenses',
      'customer_payments',
      'purchases',
      'supplier_payments',
      'sale_returns',
      'purchase_returns',
      'products',
      'stock_reconciliations',
      'stock_adjustments',
      'settings',
      'customers',
      'suppliers',
      'categories',
      'employees',
    ].forEach((table) => {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, scheduleDashboardRefresh);
    });
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        scheduleDashboardRefresh();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.error('[Dashboard] Realtime refresh subscription failed:', status);
      }
    });
    const intervalId = window.setInterval(() => void loadDashboard(), 60_000);
    const handleFocus = () => { void loadDashboard(); };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void loadDashboard();
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      active = false;
      window.clearInterval(intervalId);
      if (refreshTimeout !== null) window.clearTimeout(refreshTimeout);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      void supabase.removeChannel(channel);
    };
  }, [authLoading, userId, locale, t]);

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
              <span className="text-amber-400 text-sm font-medium">Nirvul POS</span>
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

      {/* Dashboard stat boxes */}
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
