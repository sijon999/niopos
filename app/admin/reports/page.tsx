'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  FileBarChart, DollarSign, ShoppingCart, Package, TrendingUp,
  Truck, Receipt, Filter,
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
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { useTranslation } from '@/hooks/use-translation';

type DatePreset = 'today' | 'yesterday' | 'thisWeek' | 'thisMonth' | 'lastMonth' | 'all' | 'custom';
type ReportFilters = {
  datePreset: DatePreset;
  dateFrom: string;
  dateTo: string;
  productIds: string[];
  categoryIds: string[];
  brandIds: string[];
  units: string[];
  customerId: string;
  paymentMethod: string;
  status: string;
  minAmount: string;
  maxAmount: string;
};
type FilterOption = { id: string; name: string };
type ReturnReportSummary = {
  currency_symbol: string | null;
  total_return: number;
  total_refund: number;
  profit_reversal: number;
  daily: { return_day: string; total_return: number }[];
};

const EMPTY_FILTERS: ReportFilters = {
  datePreset: 'all',
  dateFrom: '',
  dateTo: '',
  productIds: [],
  categoryIds: [],
  brandIds: [],
  units: [],
  customerId: 'all',
  paymentMethod: 'all',
  status: 'all',
  minAmount: '',
  maxAmount: '',
};

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

function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
  searchPlaceholder,
}: {
  label: string;
  options: FilterOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  searchPlaceholder: string;
}) {
  const [search, setSearch] = useState('');
  const filteredOptions = options.filter((option) => option.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder={searchPlaceholder}
        aria-label={searchPlaceholder}
      />
      <div className="max-h-36 space-y-1 overflow-y-auto rounded-md border p-2">
        {filteredOptions.length === 0 ? (
          <p className="px-1 py-2 text-sm text-muted-foreground">No options found</p>
        ) : filteredOptions.map((option) => (
          <label key={option.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1.5 text-sm hover:bg-muted">
            <Checkbox
              checked={selected.includes(option.id)}
              onCheckedChange={(checked) => onChange(
                checked ? [...selected, option.id] : selected.filter((id) => id !== option.id)
              )}
            />
            <span className="truncate">{option.name}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [dailyData, setDailyData] = useState<any[]>([]);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [recentSales, setRecentSales] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [totalProfit, setTotalProfit] = useState<number | null>(null);
  const [currencySymbol, setCurrencySymbol] = useState('');
  const [returnSummary, setReturnSummary] = useState<ReturnReportSummary>({
    currency_symbol: null,
    total_return: 0,
    total_refund: 0,
    profit_reversal: 0,
    daily: [],
  });

  const [appliedFilters, setAppliedFilters] = useState<ReportFilters>(() => {
    const range = getPresetRange('thisMonth');
    return { ...EMPTY_FILTERS, datePreset: 'thisMonth', dateFrom: range.from, dateTo: range.to };
  });
  const [draftFilters, setDraftFilters] = useState<ReportFilters>(appliedFilters);
  const [filterOpen, setFilterOpen] = useState(false);
  const [products, setProducts] = useState<FilterOption[]>([]);
  const [categories, setCategories] = useState<FilterOption[]>([]);
  const [brands, setBrands] = useState<FilterOption[]>([]);
  const [units, setUnits] = useState<FilterOption[]>([]);
  const [customers, setCustomers] = useState<FilterOption[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');

  useEffect(() => {
    let active = true;
    void (async () => {
      const [productsRes, categoriesRes, brandsRes, unitsRes, customersRes] = await Promise.all([
        supabase.from('products').select('id, name').order('name').limit(1000),
        supabase.from('categories').select('id, name').order('name').limit(1000),
        supabase.from('brands').select('id, name').order('name').limit(1000),
        supabase.from('units').select('id, name, short_name').order('name').limit(1000),
        supabase.from('customers').select('id, name').order('name').limit(1000),
      ]);
      if (!active) return;
      const failed = [productsRes, categoriesRes, brandsRes, unitsRes, customersRes].find((result) => result.error);
      if (failed?.error) {
        toast.error(`Unable to load report filter options: ${failed.error.message}`);
        return;
      }
      setProducts((productsRes.data || []).map((item) => ({ id: item.id, name: item.name })));
      setCategories((categoriesRes.data || []).map((item) => ({ id: item.id, name: item.name })));
      setBrands((brandsRes.data || []).map((item) => ({ id: item.id, name: item.name })));
      setUnits((unitsRes.data || []).map((item) => ({ id: item.short_name, name: item.name })));
      setCustomers((customersRes.data || []).map((item) => ({ id: item.id, name: item.name })));
    })().catch((error: unknown) => {
      if (!active) return;
      toast.error(`Unable to load report filter options: ${error instanceof Error ? error.message : 'Unexpected error'}`);
    });
    return () => { active = false; };
  }, []);

  const loadReports = useCallback(async () => {
    setLoading(true);
    let salesQuery = supabase.from('sales').select('*, customers(name)').order('sale_date', { ascending: false });
    if (appliedFilters.dateFrom) salesQuery = salesQuery.gte('sale_date', localBoundary(appliedFilters.dateFrom, false));
    if (appliedFilters.dateTo) salesQuery = salesQuery.lte('sale_date', localBoundary(appliedFilters.dateTo, true));
    if (appliedFilters.paymentMethod !== 'all') salesQuery = salesQuery.eq('payment_method', appliedFilters.paymentMethod);
    if (appliedFilters.customerId !== 'all') salesQuery = salesQuery.eq('customer_id', appliedFilters.customerId);
    if (appliedFilters.status !== 'all') salesQuery = salesQuery.eq('status', appliedFilters.status);
    if (appliedFilters.minAmount) salesQuery = salesQuery.gte('total', Number(appliedFilters.minAmount));
    if (appliedFilters.maxAmount) salesQuery = salesQuery.lte('total', Number(appliedFilters.maxAmount));

    let purchaseQuery = supabase.from('purchases').select('*, suppliers(name)').order('purchase_date', { ascending: false });
    if (appliedFilters.dateFrom) purchaseQuery = purchaseQuery.gte('purchase_date', localBoundary(appliedFilters.dateFrom, false));
    if (appliedFilters.dateTo) purchaseQuery = purchaseQuery.lte('purchase_date', localBoundary(appliedFilters.dateTo, true));

    const hasProductConstraints = appliedFilters.productIds.length > 0 ||
      appliedFilters.categoryIds.length > 0 || appliedFilters.brandIds.length > 0 ||
      appliedFilters.units.length > 0;
    let matchingProductIds: string[] | null = null;
    if (hasProductConstraints) {
      let productsQuery = supabase.from('products').select('id');
      if (appliedFilters.productIds.length) productsQuery = productsQuery.in('id', appliedFilters.productIds);
      if (appliedFilters.categoryIds.length) productsQuery = productsQuery.in('category_id', appliedFilters.categoryIds);
      if (appliedFilters.brandIds.length) productsQuery = productsQuery.in('brand_id', appliedFilters.brandIds);
      if (appliedFilters.units.length) productsQuery = productsQuery.in('unit', appliedFilters.units);
      const productsResult = await productsQuery;
      if (productsResult.error) {
        toast.error(`Unable to filter report products: ${productsResult.error.message}`);
        setLoading(false);
        return;
      }
      matchingProductIds = (productsResult.data || []).map((product) => product.id);
      if (matchingProductIds.length) {
        const saleItemsResult = await supabase.from('sale_items')
          .select('sale_id')
          .in('product_id', matchingProductIds);
        if (saleItemsResult.error) {
          toast.error(`Unable to filter report sales: ${saleItemsResult.error.message}`);
          setLoading(false);
          return;
        }
        const matchingSaleIds = Array.from(new Set((saleItemsResult.data || []).map((item) => item.sale_id)));
        if (matchingSaleIds.length) salesQuery = salesQuery.in('id', matchingSaleIds);
        else matchingProductIds = [];
      }
    }

    const [salesRes, purchaseRes, profitRes, returnsRes] = await Promise.all([
      matchingProductIds?.length === 0
        ? Promise.resolve({ data: [], error: null })
        : salesQuery,
      purchaseQuery,
      supabase.rpc('get_sales_profit_summary', {
        p_date_from: appliedFilters.dateFrom ? localBoundary(appliedFilters.dateFrom, false) : null,
        p_date_to: appliedFilters.dateTo ? localBoundary(appliedFilters.dateTo, true) : null,
        p_payment_method: appliedFilters.paymentMethod === 'all' ? null : appliedFilters.paymentMethod,
        p_customer_id: appliedFilters.customerId === 'all' ? null : appliedFilters.customerId,
        p_status: appliedFilters.status,
        p_min_amount: appliedFilters.minAmount ? Number(appliedFilters.minAmount) : null,
        p_max_amount: appliedFilters.maxAmount ? Number(appliedFilters.maxAmount) : null,
        p_product_ids: appliedFilters.productIds,
        p_category_ids: appliedFilters.categoryIds,
        p_brand_ids: appliedFilters.brandIds,
        p_units: appliedFilters.units,
      }),
      supabase.rpc('get_sales_return_report', {
        p_date_from: appliedFilters.dateFrom ? localBoundary(appliedFilters.dateFrom, false) : null,
        p_date_to: appliedFilters.dateTo ? localBoundary(appliedFilters.dateTo, true) : null,
        p_customer_id: appliedFilters.customerId === 'all' ? null : appliedFilters.customerId,
        p_product_ids: appliedFilters.productIds,
        p_category_ids: appliedFilters.categoryIds,
        p_brand_ids: appliedFilters.brandIds,
        p_units: appliedFilters.units,
        p_time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        p_payment_method: appliedFilters.paymentMethod === 'all' ? null : appliedFilters.paymentMethod,
        p_status: appliedFilters.status,
        p_min_amount: appliedFilters.minAmount ? Number(appliedFilters.minAmount) : null,
        p_max_amount: appliedFilters.maxAmount ? Number(appliedFilters.maxAmount) : null,
      }),
    ]);
    if (salesRes.error || purchaseRes.error) {
      toast.error(`Unable to load reports: ${salesRes.error?.message || purchaseRes.error?.message}`);
      setLoading(false);
      return;
    }
    if (returnsRes.error) {
      toast.error(`${t('salesReturns.reportLoadFailed')} ${returnsRes.error.message}`);
      setLoading(false);
      return;
    }
    const returnData = returnsRes.data as unknown as ReturnReportSummary;
    if (!returnData || !Array.isArray(returnData.daily)) {
      toast.error(t('salesReturns.reportLoadFailed'));
      setLoading(false);
      return;
    }
    setReturnSummary(returnData);
    setCurrencySymbol(returnData.currency_symbol || '');

    if (profitRes.error) {
      toast.error(`Unable to load sales profit: ${profitRes.error.message}`);
      setTotalProfit(null);
    } else {
      setTotalProfit(Number(profitRes.data || 0) - Number(returnData.profit_reversal || 0));
    }

    const salesData = (salesRes.data || []).filter((s: any) =>
      appliedFilters.status !== 'all' || s.status !== 'cancelled'
    );
    const purchaseData = (purchaseRes.data || []).filter((p: any) => p.status !== 'cancelled');
    setSales(salesData);
    setPurchases(purchaseData);
    setRecentSales(salesData.slice(0, 10));

    const now = new Date();
    const days: any[] = [];
    const returnsByDay = new Map(
      returnData.daily.map((item) => [item.return_day, Number(item.total_return)])
    );
    for (let i = 29; i >= 0; i--) {
      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const dayEnd = new Date(dayStart.getTime() + 86400000);
      const daySales = salesData.filter((s: any) => new Date(s.sale_date) >= dayStart && new Date(s.sale_date) < dayEnd);
      const dailySales = daySales.reduce((sum: number, s: any) => sum + Number(s.total), 0);
      const dailyReturns = returnsByDay.get(toDateInputValue(dayStart)) || 0;
      days.push({
        date: dayStart.toLocaleDateString('en', { month: 'short', day: 'numeric' }),
        sales: Math.round((dailySales - dailyReturns) * 100) / 100,
        returns: dailyReturns,
        orders: daySales.length,
      });
    }
    setDailyData(days);

    let itemsQuery = supabase.from('sale_items')
      .select('product_name, quantity, total, price, sale_id, product_id')
      .order('total', { ascending: false });
    if (salesData.length) itemsQuery = itemsQuery.in('sale_id', salesData.map((sale: any) => sale.id));
    else itemsQuery = itemsQuery.eq('sale_id', '00000000-0000-0000-0000-000000000000');
    if (matchingProductIds?.length) itemsQuery = itemsQuery.in('product_id', matchingProductIds);
    const itemsRes = await itemsQuery.limit(5000);
    if (itemsRes.error) {
      toast.error(`Unable to load top products: ${itemsRes.error.message}`);
      setLoading(false);
      return;
    }
    const productMap: Record<string, { name: string; quantity: number; revenue: number }> = {};
    (itemsRes.data || []).forEach((item: any) => {
      const key = item.product_name;
      if (!productMap[key]) productMap[key] = { name: key, quantity: 0, revenue: 0 };
      productMap[key].quantity += Number(item.quantity);
      productMap[key].revenue += Number(item.total);
    });
    setTopProducts(Object.values(productMap).sort((a, b) => b.revenue - a.revenue).slice(0, 5));

    setLoading(false);
  }, [appliedFilters, t]);

  useEffect(() => {
    void loadReports().catch((error: unknown) => {
      toast.error(`Unable to load reports: ${error instanceof Error ? error.message : 'Unexpected error'}`);
      setLoading(false);
    });
  }, [loadReports]);

  const totalSalesAmount = sales.reduce((s: number, sale: any) => s + Number(sale.total), 0);
  const netSalesAmount = totalSalesAmount - Number(returnSummary.total_return || 0);
  const totalDiscount = sales.reduce((s: number, sale: any) => s + Number(sale.discount), 0);
  const totalPaid = sales.reduce((s: number, sale: any) => s + Number(sale.paid), 0);
  const totalDue = sales.reduce((s: number, sale: any) => s + Number(sale.due_amount), 0);
  const totalOrders = sales.length;

  const totalPurchaseAmount = purchases.reduce((s: number, p: any) => s + Number(p.total), 0);
  const totalPurchasePaid = purchases.reduce((s: number, p: any) => s + Number(p.paid_amount || 0), 0);
  const totalPurchaseDue = purchases.reduce((s: number, p: any) => s + Number(p.due_amount || 0), 0);
  const totalPurchaseOrders = purchases.length;

  const salesReportCards = [
    { label: t('reports.netSales'), value: `${currencySymbol}${netSalesAmount.toFixed(2)}`, icon: DollarSign, color: 'from-amber-500 to-orange-600' },
    { label: t('reports.totalProfit'), value: totalProfit === null ? '—' : `${currencySymbol}${totalProfit.toFixed(2)}`, icon: Package, color: 'from-emerald-500 to-green-600' },
    { label: 'Total Orders', value: totalOrders.toString(), icon: ShoppingCart, color: 'from-slate-800 to-black' },
    { label: 'Total Discount', value: `৳${totalDiscount.toFixed(2)}`, icon: TrendingUp, color: 'from-blue-500 to-cyan-600' },
    { label: 'Total Due', value: `৳${totalDue.toFixed(2)}`, icon: FileBarChart, color: 'from-rose-500 to-pink-600' },
    { label: t('reports.totalRefund'), value: `${currencySymbol}${Number(returnSummary.total_refund || 0).toFixed(2)}`, icon: Receipt, color: 'from-violet-500 to-purple-600' },
  ];

  const purchaseReportCards = [
    { label: 'Total Purchases', value: `৳${totalPurchaseAmount.toFixed(2)}`, icon: Truck, color: 'from-blue-500 to-cyan-600' },
    { label: 'Purchase Orders', value: totalPurchaseOrders.toString(), icon: Receipt, color: 'from-slate-800 to-black' },
    { label: 'Total Paid', value: `৳${totalPurchasePaid.toFixed(2)}`, icon: DollarSign, color: 'from-emerald-500 to-green-600' },
    { label: 'Total Due', value: `৳${totalPurchaseDue.toFixed(2)}`, icon: FileBarChart, color: 'from-amber-500 to-orange-600' },
  ];

  const activeFilterCount = [
    appliedFilters.dateFrom || appliedFilters.dateTo,
    appliedFilters.productIds.length > 0,
    appliedFilters.categoryIds.length > 0,
    appliedFilters.brandIds.length > 0,
    appliedFilters.units.length > 0,
    appliedFilters.customerId !== 'all',
    appliedFilters.paymentMethod !== 'all',
    appliedFilters.status !== 'all',
    appliedFilters.minAmount !== '' || appliedFilters.maxAmount !== '',
  ].filter(Boolean).length;
  const hasFilters = activeFilterCount > 0;

  const updateDraftDatePreset = (preset: DatePreset) => {
    setDraftFilters((current) => {
      if (preset === 'all') return { ...current, datePreset: preset, dateFrom: '', dateTo: '' };
      if (preset === 'custom') return { ...current, datePreset: preset };
      const range = getPresetRange(preset);
      return { ...current, datePreset: preset, dateFrom: range.from, dateTo: range.to };
    });
  };
  const resetDraftFilters = () => setDraftFilters(EMPTY_FILTERS);
  const filteredCustomers = customers.filter((customer) =>
    customer.name.toLowerCase().includes(customerSearch.toLowerCase())
  );
  const productFilterLabels = [
    ...products.filter((item) => appliedFilters.productIds.includes(item.id)).map((item) => item.name),
    ...categories.filter((item) => appliedFilters.categoryIds.includes(item.id)).map((item) => item.name),
    ...brands.filter((item) => appliedFilters.brandIds.includes(item.id)).map((item) => item.name),
    ...units.filter((item) => appliedFilters.units.includes(item.id)).map((item) => item.name),
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold font-heading">Reports & Analytics</h2>
          <p className="text-sm text-muted-foreground">Sales and purchase performance insights</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/reports/purchase-expense"><Button variant="outline" size="sm">Purchase & Expense Report</Button></Link>
          <Dialog
            open={filterOpen}
            onOpenChange={(open) => {
              if (open) {
                setDraftFilters(appliedFilters);
                setCustomerSearch('');
              }
              setFilterOpen(open);
            }}
          >
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setDraftFilters(appliedFilters);
                setCustomerSearch('');
                setFilterOpen(true);
              }}
            >
              <Filter className="mr-2 h-4 w-4" />
              Advanced Filter{hasFilters ? ` (${activeFilterCount})` : ''}
            </Button>
            <DialogContent className="flex max-h-[90vh] w-[calc(100%-1rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:w-full">
              <DialogHeader className="border-b px-5 py-4 text-left sm:px-6">
                <DialogTitle>Advanced Filter</DialogTitle>
                <DialogDescription>Choose criteria to update the report.</DialogDescription>
              </DialogHeader>
              <div className="space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
                <section className="space-y-3">
                  <Label className="text-sm font-semibold">Date Range</Label>
                  <div className="flex flex-wrap gap-2">
                    {([
                      ['today', 'Today'],
                      ['yesterday', 'Yesterday'],
                      ['thisWeek', 'This Week'],
                      ['thisMonth', 'This Month'],
                      ['custom', 'Custom Date Range'],
                      ['lastMonth', 'Last Month'],
                      ['all', 'All Time'],
                    ] as [DatePreset, string][]).map(([preset, label]) => (
                      <Button
                        key={preset}
                        type="button"
                        size="sm"
                        variant={draftFilters.datePreset === preset ? 'default' : 'outline'}
                        onClick={() => updateDraftDatePreset(preset)}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                  {draftFilters.datePreset === 'custom' && (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="report-from-date">From Date</Label>
                        <Input
                          id="report-from-date"
                          type="date"
                          value={draftFilters.dateFrom}
                          max={draftFilters.dateTo || undefined}
                          onChange={(event) => setDraftFilters((current) => ({ ...current, dateFrom: event.target.value }))}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="report-to-date">To Date</Label>
                        <Input
                          id="report-to-date"
                          type="date"
                          value={draftFilters.dateTo}
                          min={draftFilters.dateFrom || undefined}
                          onChange={(event) => setDraftFilters((current) => ({ ...current, dateTo: event.target.value }))}
                        />
                      </div>
                    </div>
                  )}
                </section>

                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <MultiSelectFilter
                    label="Product"
                    options={products}
                    selected={draftFilters.productIds}
                    onChange={(productIds) => setDraftFilters((current) => ({ ...current, productIds }))}
                    searchPlaceholder="Search products..."
                  />
                  <MultiSelectFilter
                    label="Category"
                    options={categories}
                    selected={draftFilters.categoryIds}
                    onChange={(categoryIds) => setDraftFilters((current) => ({ ...current, categoryIds }))}
                    searchPlaceholder="Search categories..."
                  />
                  <MultiSelectFilter
                    label="Brand"
                    options={brands}
                    selected={draftFilters.brandIds}
                    onChange={(brandIds) => setDraftFilters((current) => ({ ...current, brandIds }))}
                    searchPlaceholder="Search brands..."
                  />
                  <MultiSelectFilter
                    label="Unit"
                    options={units}
                    selected={draftFilters.units}
                    onChange={(selectedUnits) => setDraftFilters((current) => ({ ...current, units: selectedUnits }))}
                    searchPlaceholder="Search units..."
                  />
                </div>

                <section className="space-y-2">
                  <Label htmlFor="report-customer-search">Customer</Label>
                  <Input
                    id="report-customer-search"
                    value={customerSearch}
                    onChange={(event) => setCustomerSearch(event.target.value)}
                    placeholder="Search customers..."
                  />
                  <select
                    value={draftFilters.customerId}
                    onChange={(event) => setDraftFilters((current) => ({ ...current, customerId: event.target.value }))}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="all">All Customers</option>
                    {filteredCustomers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
                  </select>
                </section>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="report-payment-method">Payment Method</Label>
                    <select
                      id="report-payment-method"
                      value={draftFilters.paymentMethod}
                      onChange={(event) => setDraftFilters((current) => ({ ...current, paymentMethod: event.target.value }))}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="all">All</option>
                      <option value="cash">Cash</option>
                      <option value="card">Card</option>
                      <option value="mobile">Mobile</option>
                      <option value="bank">Transfer</option>
                      <option value="due">Due</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="report-sale-status">Order/Sale Status</Label>
                    <select
                      id="report-sale-status"
                      value={draftFilters.status}
                      onChange={(event) => setDraftFilters((current) => ({ ...current, status: event.target.value }))}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="all">All</option>
                      <option value="completed">Completed</option>
                      <option value="pending">Pending</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                </div>

                <section className="space-y-2">
                  <Label>Price/Sales Amount</Label>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="report-min-amount" className="text-xs text-muted-foreground">Minimum amount</Label>
                      <Input
                        id="report-min-amount"
                        type="number"
                        min="0"
                        step="0.01"
                        value={draftFilters.minAmount}
                        onChange={(event) => setDraftFilters((current) => ({ ...current, minAmount: event.target.value }))}
                        placeholder="No minimum"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="report-max-amount" className="text-xs text-muted-foreground">Maximum amount</Label>
                      <Input
                        id="report-max-amount"
                        type="number"
                        min="0"
                        step="0.01"
                        value={draftFilters.maxAmount}
                        onChange={(event) => setDraftFilters((current) => ({ ...current, maxAmount: event.target.value }))}
                        placeholder="No maximum"
                      />
                    </div>
                  </div>
                </section>
              </div>
              <DialogFooter className="border-t px-5 py-4 sm:px-6">
                <Button variant="ghost" onClick={resetDraftFilters}>Reset</Button>
                <Button variant="outline" onClick={() => setFilterOpen(false)}>Cancel</Button>
                <Button
                  onClick={() => {
                    if (draftFilters.minAmount && draftFilters.maxAmount &&
                      Number(draftFilters.minAmount) > Number(draftFilters.maxAmount)) {
                      toast.error('Minimum amount cannot exceed maximum amount.');
                      return;
                    }
                    setAppliedFilters(draftFilters);
                    setFilterOpen(false);
                  }}
                >
                  Apply Filter
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {hasFilters && (
        <div className="flex flex-wrap items-center gap-2">
          {(appliedFilters.dateFrom || appliedFilters.dateTo) && <span className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs">{appliedFilters.dateFrom || 'Start'} – {appliedFilters.dateTo || 'Today'}</span>}
          {appliedFilters.paymentMethod !== 'all' && <span className="rounded-full bg-muted px-3 py-1 text-xs capitalize">Payment: {appliedFilters.paymentMethod === 'bank' ? 'Transfer' : appliedFilters.paymentMethod}</span>}
          {appliedFilters.customerId !== 'all' && <span className="rounded-full bg-muted px-3 py-1 text-xs">Customer: {customers.find((customer) => customer.id === appliedFilters.customerId)?.name || 'Selected'}</span>}
          {appliedFilters.status !== 'all' && <span className="rounded-full bg-muted px-3 py-1 text-xs capitalize">Status: {appliedFilters.status}</span>}
          {productFilterLabels.length > 0 && <span className="rounded-full bg-muted px-3 py-1 text-xs">{productFilterLabels.length} product filter{productFilterLabels.length === 1 ? '' : 's'}</span>}
          {(appliedFilters.minAmount || appliedFilters.maxAmount) && <span className="rounded-full bg-muted px-3 py-1 text-xs">Amount: {appliedFilters.minAmount || '0'} – {appliedFilters.maxAmount || 'Any'}</span>}
        </div>
      )}

      {/* Sales Report Cards */}
      <div>
        <h3 className="text-lg font-semibold mb-3">Sales Report / বিক্রয়</h3>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
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
        <p className="mt-2 text-xs text-muted-foreground">
          Profit uses saved sale-time costs; older sales without cost snapshots are excluded.
        </p>
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
              <Line type="monotone" dataKey="returns" stroke="hsl(0, 72%, 51%)" strokeWidth={2} dot={false} name={t('salesReturns.totalReturn')} />
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
