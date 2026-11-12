'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  FileBarChart,
  Filter,
  Search,
  X,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { supabase } from '@/lib/supabase';
import { escapeCsvCell } from '@/lib/safe-export';
import { fetchAllPages } from '@/lib/supabase-pagination';
import { toast } from 'sonner';

type TransactionType = 'all' | 'purchase' | 'expense';
type DatePreset = 'all' | 'today' | 'yesterday' | 'thisWeek' | 'last7' | 'lastMonth' | 'thisMonth' | 'lastYear' | 'custom';

type ReportRow = {
  id: string;
  transaction_type: 'purchase' | 'expense';
  transaction_date: string;
  reference_no: string | null;
  party_name: string | null;
  party_phone: string | null;
  category_name: string | null;
  payment_method: string | null;
  amount: number;
  status: string | null;
  created_at: string;
  supplier_id: string | null;
  category_id: string | null;
};

type SupplierOption = { id: string; name: string; phone: string | null };
type CategoryOption = { id: string; name: string };
type ProductOption = { id: string; name: string };
type BrandOption = { id: string; name: string };

type AppliedFilters = {
  from: string;
  to: string;
  type: TransactionType;
  payment: string;
  supplier: string;
  productIds: string[];
  productCategory: string;
  brand: string;
  expenseCategory: string;
  status: string;
  minAmount: string;
  maxAmount: string;
  search: string;
};

const PAGE_SIZE = 20;
const EMPTY_FILTERS: AppliedFilters = {
  from: '',
  to: '',
  type: 'all',
  payment: 'all',
  supplier: 'all',
  productIds: [],
  productCategory: 'all',
  brand: 'all',
  expenseCategory: 'all',
  status: 'all',
  minAmount: '',
  maxAmount: '',
  search: '',
};

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

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatMoney(value: number): string {
  return `৳${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function safeSearch(value: string): string {
  return value.trim().replace(/[%,()]/g, ' ');
}

function getPresetRange(preset: Exclude<DatePreset, 'custom'>): { from: string; to: string } {
  const today = startOfDay(new Date());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  switch (preset) {
    case 'today':
      return { from: toDateInputValue(today), to: toDateInputValue(today) };
    case 'yesterday':
      return { from: toDateInputValue(yesterday), to: toDateInputValue(yesterday) };
    case 'thisWeek': {
      const monday = new Date(today);
      monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
      return { from: toDateInputValue(monday), to: toDateInputValue(today) };
    }
    case 'last7': {
      const from = new Date(today);
      from.setDate(from.getDate() - 6);
      return { from: toDateInputValue(from), to: toDateInputValue(today) };
    }
    case 'lastMonth': {
      const from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const to = new Date(today.getFullYear(), today.getMonth(), 0);
      return { from: toDateInputValue(from), to: toDateInputValue(to) };
    }
    case 'thisMonth': {
      const from = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: toDateInputValue(from), to: toDateInputValue(today) };
    }
    case 'lastYear': {
      return {
        from: `${today.getFullYear() - 1}-01-01`,
        to: `${today.getFullYear() - 1}-12-31`,
      };
    }
    default:
      return { from: '', to: '' };
  }
}

function MultiSelectOptions({
  label,
  options,
  selected,
  onChange,
  searchPlaceholder,
}: {
  label: string;
  options: { id: string; name: string }[];
  selected: string[];
  onChange: (selected: string[]) => void;
  searchPlaceholder: string;
}) {
  const [search, setSearch] = useState('');
  const visibleOptions = options.filter((option) => option.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={searchPlaceholder} />
      <div className="max-h-36 space-y-1 overflow-y-auto rounded-md border p-2">
        {visibleOptions.length === 0 ? (
          <p className="px-1 py-2 text-sm text-muted-foreground">No options found</p>
        ) : visibleOptions.map((option) => (
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

async function findMatchingPurchaseIds(
  filters: Pick<AppliedFilters, 'type' | 'productIds' | 'productCategory' | 'brand'>
): Promise<{ ids: string[] | null; error: string | null }> {
  if (filters.type !== 'purchase' ||
    (filters.productIds.length === 0 && filters.productCategory === 'all' && filters.brand === 'all')) {
    return { ids: null, error: null };
  }

  let productQuery = supabase.from('products').select('id');
  if (filters.productIds.length) productQuery = productQuery.in('id', filters.productIds);
  if (filters.productCategory !== 'all') productQuery = productQuery.eq('category_id', filters.productCategory);
  if (filters.brand !== 'all') productQuery = productQuery.eq('brand_id', filters.brand);
  const { data: matchingProducts, error: productError } = await productQuery;
  if (productError) return { ids: null, error: `Could not filter products: ${productError.message}` };
  if (!matchingProducts?.length) return { ids: [], error: null };

  const { data: purchaseItems, error: purchaseItemsError } = await supabase
    .from('purchase_items')
    .select('purchase_id')
    .in('product_id', matchingProducts.map((product) => product.id))
    .not('purchase_id', 'is', null);
  if (purchaseItemsError) return { ids: null, error: `Could not filter purchase items: ${purchaseItemsError.message}` };
  return {
    ids: Array.from(new Set((purchaseItems || []).map((item) => item.purchase_id))),
    error: null,
  };
}

export default function PurchaseExpenseReportPage() {
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [productCategories, setProductCategories] = useState<CategoryOption[]>([]);
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [totalRows, setTotalRows] = useState(0);
  const [summary, setSummary] = useState({ purchase: 0, expense: 0, outflow: 0, count: 0 });
  const [page, setPage] = useState(1);
  const [filterOpen, setFilterOpen] = useState(false);
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [appliedDatePreset, setAppliedDatePreset] = useState<DatePreset>('all');
  const [supplierSearch, setSupplierSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [draft, setDraft] = useState<AppliedFilters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<AppliedFilters>(EMPTY_FILTERS);

  useEffect(() => {
    async function loadOptions(): Promise<void> {
      const [supplierResult, categoryResult, productCategoryResult, brandResult, productResult] = await Promise.all([
        supabase.from('suppliers').select('id, name, phone').eq('status', 'active').order('name'),
        supabase.from('expense_categories').select('id, name').order('name'),
        supabase.from('categories').select('id, name').order('name'),
        supabase.from('brands').select('id, name').order('name'),
        supabase.from('products').select('id, name').order('name').limit(1000),
      ]);
      const failed = [supplierResult, categoryResult, productCategoryResult, brandResult, productResult].find((result) => result.error);
      if (failed?.error) {
        toast.error(`Could not load filter options: ${failed.error.message}`);
        return;
      }
      setSuppliers(supplierResult.data || []);
      setCategories(categoryResult.data || []);
      setProductCategories(productCategoryResult.data || []);
      setBrands(brandResult.data || []);
      setProducts(productResult.data || []);
    }
    loadOptions().catch((error: unknown) => {
      toast.error(`Could not load filter options: ${error instanceof Error ? error.message : 'Unexpected error'}`);
    });
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const nextSearch = safeSearch(searchInput);
      if (nextSearch !== applied.search) {
        setApplied((current) => ({ ...current, search: nextSearch }));
        setPage(1);
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [searchInput, applied.search]);

  const loadRows = useCallback(async (): Promise<void> => {
    setLoading(true);
    const { ids: matchingPurchaseIds, error: productFilterError } = await findMatchingPurchaseIds(applied);
    if (productFilterError) {
      toast.error(productFilterError);
      setLoading(false);
      return;
    }

    let query = supabase
      .from('purchase_expense_report')
      .select('*', { count: 'exact' })
      .order('transaction_date', { ascending: false })
      .order('transaction_type', { ascending: true })
      .order('id', { ascending: true });

    if (applied.from) query = query.gte('transaction_date', localBoundary(applied.from, false));
    if (applied.to) query = query.lte('transaction_date', localBoundary(applied.to, true));
    if (applied.type !== 'all') query = query.eq('transaction_type', applied.type);
    if (applied.payment !== 'all') query = query.eq('payment_method', applied.payment);
    if (applied.supplier !== 'all') query = query.eq('supplier_id', applied.supplier);
    if (applied.expenseCategory !== 'all') query = query.eq('category_id', applied.expenseCategory);
    if (applied.status !== 'all') query = query.eq('status', applied.status);
    if (applied.minAmount) query = query.gte('amount', Number(applied.minAmount));
    if (applied.maxAmount) query = query.lte('amount', Number(applied.maxAmount));
    if (matchingPurchaseIds?.length) query = query.in('id', matchingPurchaseIds);
    else if (matchingPurchaseIds && matchingPurchaseIds.length === 0) query = query.eq('id', '00000000-0000-0000-0000-000000000000');
    if (applied.search) {
      const value = safeSearch(applied.search);
      query = query.or(`party_name.ilike.%${value}%,party_phone.ilike.%${value}%,reference_no.ilike.%${value}%,category_name.ilike.%${value}%`);
    }

    const from = (page - 1) * PAGE_SIZE;
    const summaryRequest = supabase.rpc('get_purchase_expense_report_summary', {
      p_from: applied.from ? localBoundary(applied.from, false) : null,
      p_to: applied.to ? localBoundary(applied.to, true) : null,
      p_type: applied.type,
      p_payment: applied.payment,
      p_supplier: applied.supplier === 'all' ? null : applied.supplier,
      p_category: applied.expenseCategory === 'all' ? null : applied.expenseCategory,
      p_search: applied.search || null,
      p_status: applied.status,
      p_min_amount: applied.minAmount ? Number(applied.minAmount) : null,
      p_max_amount: applied.maxAmount ? Number(applied.maxAmount) : null,
      p_purchase_ids: matchingPurchaseIds,
    });
    const [{ data, error, count }, { data: summaryData, error: summaryError }] = await Promise.all([
      query.range(from, from + PAGE_SIZE - 1),
      summaryRequest,
    ]);
    if (error || summaryError) {
      toast.error(`Could not load transactions: ${error?.message || summaryError?.message || 'Unknown error'}`);
      setRows([]);
      setTotalRows(0);
      setSummary({ purchase: 0, expense: 0, outflow: 0, count: 0 });
    } else {
      setRows((data || []) as ReportRow[]);
      setTotalRows(count || 0);
      const aggregate = summaryData?.[0];
      setSummary({
        purchase: Number(aggregate?.total_purchase || 0),
        expense: Number(aggregate?.total_expense || 0),
        outflow: Number(aggregate?.total_outflow || 0),
        count: Number(aggregate?.transaction_count || 0),
      });
    }
    setLoading(false);
  }, [applied, page]);

  useEffect(() => {
    loadRows().catch((error: unknown) => {
      toast.error(`Could not load transactions: ${error instanceof Error ? error.message : 'Unexpected error'}`);
      setLoading(false);
    });
  }, [loadRows]);

  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const pageStart = totalRows === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const pageEnd = Math.min(page * PAGE_SIZE, totalRows);

  const activeFilterCount = [
    applied.search,
    applied.from || applied.to,
    applied.type !== 'all',
    applied.payment !== 'all',
    applied.supplier !== 'all',
    applied.productIds.length > 0,
    applied.productCategory !== 'all',
    applied.brand !== 'all',
    applied.expenseCategory !== 'all',
    applied.status !== 'all',
    applied.minAmount !== '' || applied.maxAmount !== '',
  ].filter(Boolean).length;
  const hasFilters = activeFilterCount > 0;

  const updatePreset = (preset: DatePreset): void => {
    setDatePreset(preset);
    if (preset === 'custom') return;
    const range = getPresetRange(preset);
    setDraft((current) => ({ ...current, ...range }));
  };

  const setDraftType = (type: TransactionType): void => {
    setDraft((current) => ({
      ...current,
      type,
      ...(type === 'purchase'
        ? { expenseCategory: 'all' }
        : type === 'expense'
          ? {
              payment: 'all',
              supplier: 'all',
              productIds: [],
              productCategory: 'all',
              brand: 'all',
              status: 'all',
            }
          : {
              payment: 'all',
              supplier: 'all',
              productIds: [],
              productCategory: 'all',
              brand: 'all',
              expenseCategory: 'all',
              status: 'all',
            }),
    }));
  };

  const resetDraftFilters = (): void => {
    setDraft(EMPTY_FILTERS);
    setDatePreset('all');
  };

  const applyFilters = (): void => {
    if (draft.from && draft.to && draft.to < draft.from) {
      toast.error('The end date cannot be earlier than the start date');
      return;
    }
    if (draft.minAmount && Number(draft.minAmount) < 0 ||
      draft.maxAmount && Number(draft.maxAmount) < 0) {
      toast.error('Amounts cannot be negative');
      return;
    }
    if (draft.minAmount && draft.maxAmount && Number(draft.minAmount) > Number(draft.maxAmount)) {
      toast.error('Minimum amount cannot exceed maximum amount');
      return;
    }
    setApplied(draft);
    setSearchInput(draft.search);
    setAppliedDatePreset(datePreset);
    setPage(1);
    setFilterOpen(false);
  };

  const cancelFilters = (): void => {
    setDraft(applied);
    setDatePreset(appliedDatePreset);
    setFilterOpen(false);
  };

  const clearAll = (): void => {
    setDraft(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setSearchInput('');
    setDatePreset('all');
    setAppliedDatePreset('all');
    setPage(1);
  };

  const removeFilter = (key: keyof AppliedFilters): void => {
    const next: AppliedFilters = key === 'type'
      ? {
          ...applied,
          type: 'all',
          payment: 'all',
          supplier: 'all',
          productIds: [],
          productCategory: 'all',
          brand: 'all',
          expenseCategory: 'all',
          status: 'all',
        }
      : {
          ...applied,
          [key]: key === 'payment' || key === 'supplier' || key === 'productCategory' ||
            key === 'brand' || key === 'expenseCategory' || key === 'status'
            ? 'all'
            : key === 'productIds' ? [] : '',
        };
    setApplied(next);
    setDraft(next);
    if (key === 'search') setSearchInput('');
    if (key === 'from' || key === 'to') {
      setDatePreset('all');
      setAppliedDatePreset('all');
    }
    setPage(1);
  };

  const exportRows = async (): Promise<void> => {
    setExporting(true);
    const { ids: matchingPurchaseIds, error: productFilterError } = await findMatchingPurchaseIds(applied);
    if (productFilterError) {
      toast.error(productFilterError);
      setExporting(false);
      return;
    }
    let query = supabase
      .from('purchase_expense_report')
      .select('*')
      .order('transaction_date', { ascending: false });
    if (applied.from) query = query.gte('transaction_date', localBoundary(applied.from, false));
    if (applied.to) query = query.lte('transaction_date', localBoundary(applied.to, true));
    if (applied.type !== 'all') query = query.eq('transaction_type', applied.type);
    if (applied.payment !== 'all') query = query.eq('payment_method', applied.payment);
    if (applied.supplier !== 'all') query = query.eq('supplier_id', applied.supplier);
    if (applied.expenseCategory !== 'all') query = query.eq('category_id', applied.expenseCategory);
    if (applied.status !== 'all') query = query.eq('status', applied.status);
    if (applied.minAmount) query = query.gte('amount', Number(applied.minAmount));
    if (applied.maxAmount) query = query.lte('amount', Number(applied.maxAmount));
    if (matchingPurchaseIds?.length) query = query.in('id', matchingPurchaseIds);
    else if (matchingPurchaseIds && matchingPurchaseIds.length === 0) query = query.eq('id', '00000000-0000-0000-0000-000000000000');
    if (applied.search) {
      const value = safeSearch(applied.search);
      query = query.or(`party_name.ilike.%${value}%,party_phone.ilike.%${value}%,reference_no.ilike.%${value}%,category_name.ilike.%${value}%`);
    }
    const { data, error } = await fetchAllPages((from, to) => query.range(from, to));
    if (error) {
      toast.error('Could not export transactions');
      setExporting(false);
      return;
    }

    const headers = ['Date', 'Type', 'Reference', 'Supplier/Party', 'Phone', 'Category', 'Payment Method', 'Amount', 'Status'];
    const csvRows = (data as ReportRow[]).map((row) => [
      formatDate(row.transaction_date),
      row.transaction_type === 'purchase' ? 'Purchase' : 'Expense',
      row.reference_no || '',
      row.party_name || '',
      row.party_phone || '',
      row.category_name || '',
      row.payment_method === 'bank' ? 'Transfer' : row.payment_method || 'Other',
      Number(row.amount).toFixed(2),
      row.status || '',
    ]);
    const csv = [headers, ...csvRows]
      .map((row) => row.map(escapeCsvCell).join(','))
      .join('\r\n');
    const url = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `purchase-expense-report-${toDateInputValue(new Date())}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setExporting(false);
  };

  const dateChip = applied.from || applied.to ? `${applied.from || 'Start'} – ${applied.to || 'Today'}` : '';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Link href="/admin/reports">
            <Button variant="outline" size="icon" aria-label="Back to reports"><ArrowLeft className="w-4 h-4" /></Button>
          </Link>
          <div>
            <h2 className="text-2xl font-bold font-heading">Purchase & Expense Report</h2>
            <p className="text-sm text-muted-foreground">Analyze every business outflow from the existing records</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={exportRows} disabled={exporting}>
          <Download className="w-4 h-4 mr-2" /> {exporting ? 'Exporting...' : 'Export CSV'}
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Purchase', value: summary.purchase, color: 'from-blue-500 to-cyan-600' },
          { label: 'Total Expense', value: summary.expense, color: 'from-rose-500 to-pink-600' },
          { label: 'Total Outflow', value: summary.outflow, color: 'from-slate-800 to-black' },
          { label: 'Transactions', value: summary.count, color: 'from-amber-500 to-orange-600', count: true },
        ].map((stat) => (
          <Card key={stat.label} className="p-4">
            <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${stat.color} mb-3 flex items-center justify-center`}>
              <FileBarChart className="w-5 h-5 text-white" />
            </div>
            <p className="text-xs text-muted-foreground">{stat.label}</p>
            <p className="text-xl font-bold mt-1">{stat.count ? stat.value : formatMoney(stat.value)}</p>
          </Card>
        ))}
      </div>

      <Card className="p-4 space-y-4">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search supplier, phone, invoice, PO or reference..." className="pl-9" />
          </div>
          <Dialog
            open={filterOpen}
            onOpenChange={(open) => {
              if (open) {
                setDraft(applied);
                setDatePreset(appliedDatePreset);
                setSupplierSearch('');
                setFilterOpen(true);
              } else cancelFilters();
            }}
          >
            <Button
              variant="outline"
              className="lg:w-auto"
              onClick={() => {
                setDraft(applied);
                setDatePreset(appliedDatePreset);
                setSupplierSearch('');
                setFilterOpen(true);
              }}
            >
              <Filter className="mr-2 h-4 w-4" /> Advanced Filter{activeFilterCount ? ` (${activeFilterCount})` : ''}
            </Button>
            <DialogContent className="flex max-h-[90vh] w-[calc(100%-1rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:w-full">
              <DialogHeader className="border-b px-5 py-4 text-left sm:px-6">
                <DialogTitle>Advanced Filter</DialogTitle>
                <DialogDescription>Filter purchase and expense transactions.</DialogDescription>
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
                    ] as [DatePreset, string][]).map(([preset, label]) => (
                      <Button key={preset} type="button" size="sm" variant={datePreset === preset ? 'default' : 'outline'} onClick={() => updatePreset(preset)}>
                        {label}
                      </Button>
                    ))}
                  </div>
                  {datePreset === 'custom' && (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="outflow-from-date">From Date</Label>
                        <Input id="outflow-from-date" type="date" value={draft.from} max={draft.to || undefined} onChange={(event) => { setDatePreset('custom'); setDraft((current) => ({ ...current, from: event.target.value })); }} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="outflow-to-date">To Date</Label>
                        <Input id="outflow-to-date" type="date" value={draft.to} min={draft.from || undefined} onChange={(event) => { setDatePreset('custom'); setDraft((current) => ({ ...current, to: event.target.value })); }} />
                      </div>
                    </div>
                  )}
                </section>

                <div className="space-y-2">
                  <Label htmlFor="outflow-type">Report Type</Label>
                  <select id="outflow-type" value={draft.type} onChange={(event) => setDraftType(event.target.value as TransactionType)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option value="all">Purchase & Expense</option>
                    <option value="purchase">Purchase</option>
                    <option value="expense">Expense</option>
                  </select>
                </div>

                {(draft.type === 'all' || draft.type === 'purchase') && (
                  <>
                    <Separator />
                    <h3 className="font-semibold">Purchase Filters</h3>
                    <div className="space-y-2">
                      <Label htmlFor="supplier-search">Supplier</Label>
                      <Input id="supplier-search" value={supplierSearch} onChange={(event) => setSupplierSearch(event.target.value)} placeholder="Search suppliers..." />
                      <select value={draft.supplier} onChange={(event) => setDraft((current) => ({ ...current, ...(event.target.value === 'all' ? {} : { type: 'purchase' as const, expenseCategory: 'all' }), supplier: event.target.value }))} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                        <option value="all">All Suppliers</option>
                        {suppliers.filter((supplier) => supplier.name.toLowerCase().includes(supplierSearch.toLowerCase())).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                      </select>
                    </div>
                    <MultiSelectOptions
                      label="Product"
                      options={products}
                      selected={draft.productIds}
                      onChange={(productIds) => setDraft((current) => ({ ...current, ...(productIds.length ? { type: 'purchase' as const, expenseCategory: 'all' } : {}), productIds }))}
                      searchPlaceholder="Search products..."
                    />
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="purchase-category">Category</Label>
                        <select id="purchase-category" value={draft.productCategory} onChange={(event) => setDraft((current) => ({ ...current, ...(event.target.value === 'all' ? {} : { type: 'purchase' as const, expenseCategory: 'all' }), productCategory: event.target.value }))} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                          <option value="all">All Categories</option>
                          {productCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="purchase-brand">Brand</Label>
                        <select id="purchase-brand" value={draft.brand} onChange={(event) => setDraft((current) => ({ ...current, ...(event.target.value === 'all' ? {} : { type: 'purchase' as const, expenseCategory: 'all' }), brand: event.target.value }))} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                          <option value="all">All Brands</option>
                          {brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="outflow-payment">Payment Method</Label>
                        <select id="outflow-payment" value={draft.payment} onChange={(event) => setDraft((current) => ({ ...current, ...(event.target.value === 'all' ? {} : { type: 'purchase' as const, expenseCategory: 'all' }), payment: event.target.value }))} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                          <option value="all">All</option><option value="cash">Cash</option><option value="card">Card</option><option value="mobile">Mobile</option><option value="bank">Transfer</option><option value="due">Due</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="purchase-status">Purchase Status</Label>
                        <select id="purchase-status" value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, ...(event.target.value === 'all' ? {} : { type: 'purchase' as const, expenseCategory: 'all' }), status: event.target.value }))} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                          <option value="all">All</option><option value="received">Completed</option><option value="pending">Pending</option><option value="cancelled">Cancelled</option>
                        </select>
                      </div>
                    </div>
                  </>
                )}

                {(draft.type === 'all' || draft.type === 'expense') && (
                  <>
                    <Separator />
                    <h3 className="font-semibold">Expense Filters</h3>
                    <div className="space-y-2">
                      <Label htmlFor="expense-category">Expense Category / Type</Label>
                      <select id="expense-category" value={draft.expenseCategory} onChange={(event) => setDraft((current) => ({
                        ...current,
                        ...(event.target.value === 'all' ? {} : {
                          type: 'expense' as const,
                          payment: 'all',
                          supplier: 'all',
                          productIds: [],
                          productCategory: 'all',
                          brand: 'all',
                          status: 'all',
                        }),
                        expenseCategory: event.target.value,
                      }))} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                        <option value="all">All Categories</option>
                        {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="expense-payment">Payment Method</Label>
                      <select id="expense-payment" value="all" disabled className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60">
                        <option value="all">All</option><option value="cash">Cash</option><option value="card">Card</option><option value="mobile">Mobile</option><option value="bank">Transfer</option><option value="cash">Cash</option><option value="card">Card</option><option value="mobile">Mobile</option><option value="bank">Transfer</option>
                      </select>
                      <p className="text-xs text-muted-foreground">Payment method is not stored for expense records, so this filter applies to purchase records only.</p>
                    </div>
                    <p className="text-xs text-muted-foreground">Added-by information is not available in the expense records.</p>
                  </>
                )}

                <section className="space-y-2">
                  <Label>Amount</Label>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="outflow-min-amount" className="text-xs text-muted-foreground">Minimum Amount</Label>
                      <Input id="outflow-min-amount" type="number" min="0" step="0.01" value={draft.minAmount} onChange={(event) => setDraft((current) => ({ ...current, minAmount: event.target.value }))} placeholder="No minimum" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="outflow-max-amount" className="text-xs text-muted-foreground">Maximum Amount</Label>
                      <Input id="outflow-max-amount" type="number" min="0" step="0.01" value={draft.maxAmount} onChange={(event) => setDraft((current) => ({ ...current, maxAmount: event.target.value }))} placeholder="No maximum" />
                    </div>
                  </div>
                </section>
              </div>
              <DialogFooter className="border-t px-5 py-4 sm:px-6">
                <Button variant="ghost" onClick={resetDraftFilters}>Reset</Button>
                <Button variant="outline" onClick={cancelFilters}>Cancel</Button>
                <Button onClick={applyFilters}>Apply Filter</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {hasFilters && (
          <div className="flex flex-wrap items-center gap-2">
            {dateChip && <button onClick={() => { removeFilter('from'); setApplied((current) => ({ ...current, to: '' })); }} className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs hover:bg-muted/80"><CalendarDays className="w-3 h-3" />{dateChip}<X className="w-3 h-3" /></button>}
            {applied.search && <button onClick={() => removeFilter('search')} className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs">Search: {applied.search}<X className="w-3 h-3" /></button>}
            {applied.type !== 'all' && <button onClick={() => removeFilter('type')} className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs capitalize">{applied.type}<X className="w-3 h-3" /></button>}
            {applied.supplier !== 'all' && <button onClick={() => removeFilter('supplier')} className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs">{suppliers.find((supplier) => supplier.id === applied.supplier)?.name || 'Supplier'}<X className="w-3 h-3" /></button>}
            {applied.productIds.length > 0 && <button onClick={() => removeFilter('productIds')} className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs">{applied.productIds.length} product{applied.productIds.length === 1 ? '' : 's'}<X className="w-3 h-3" /></button>}
            {applied.productCategory !== 'all' && <button onClick={() => removeFilter('productCategory')} className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs">{productCategories.find((category) => category.id === applied.productCategory)?.name || 'Product Category'}<X className="w-3 h-3" /></button>}
            {applied.brand !== 'all' && <button onClick={() => removeFilter('brand')} className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs">{brands.find((brand) => brand.id === applied.brand)?.name || 'Brand'}<X className="w-3 h-3" /></button>}
            {applied.expenseCategory !== 'all' && <button onClick={() => removeFilter('expenseCategory')} className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs">{categories.find((category) => category.id === applied.expenseCategory)?.name || 'Expense Category'}<X className="w-3 h-3" /></button>}
            {applied.payment !== 'all' && <button onClick={() => removeFilter('payment')} className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs capitalize">{applied.payment === 'bank' ? 'Transfer' : applied.payment}<X className="w-3 h-3" /></button>}
            {applied.status !== 'all' && <button onClick={() => removeFilter('status')} className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs capitalize">{applied.status === 'received' ? 'Completed' : applied.status}<X className="w-3 h-3" /></button>}
            {(applied.minAmount || applied.maxAmount) && <button onClick={() => { removeFilter('minAmount'); setApplied((current) => ({ ...current, maxAmount: '' })); setDraft((current) => ({ ...current, maxAmount: '' })); }} className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs">Amount: {applied.minAmount || '0'} – {applied.maxAmount || 'Any'}<X className="w-3 h-3" /></button>}
            <Button variant="link" size="sm" className="h-auto px-1 text-xs" onClick={clearAll}>Clear All</Button>
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Invoice / Reference</TableHead><TableHead>Supplier / Party</TableHead><TableHead>Phone</TableHead><TableHead>Category</TableHead><TableHead>Payment</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {loading ? Array.from({ length: 6 }).map((_, index) => <TableRow key={index}>{Array.from({ length: 9 }).map((__, cell) => <TableCell key={cell}><div className="h-4 bg-muted rounded animate-pulse" /></TableCell>)}</TableRow>) : rows.length === 0 ? <TableRow><TableCell colSpan={9} className="py-16 text-center"><FileBarChart className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-40" /><p className="font-medium">No transactions found</p><p className="text-sm text-muted-foreground mt-1">Try changing the date, search, or filter options.</p></TableCell></TableRow> : rows.map((row) => <TableRow key={`${row.transaction_type}-${row.id}`} className="hover:bg-muted/50"><TableCell className="text-sm whitespace-nowrap">{formatDate(row.transaction_date)}</TableCell><TableCell><Badge className={row.transaction_type === 'purchase' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'}>{row.transaction_type === 'purchase' ? 'Purchase' : 'Expense'}</Badge></TableCell><TableCell className="font-medium max-w-48 truncate">{row.reference_no || '-'}</TableCell><TableCell>{row.party_name || '-'}</TableCell><TableCell className="text-sm">{row.party_phone || '-'}</TableCell><TableCell>{row.category_name || '-'}</TableCell><TableCell className="capitalize">{row.payment_method === 'bank' ? 'Transfer' : row.payment_method || 'Other'}</TableCell><TableCell className="text-right font-bold">{formatMoney(Number(row.amount))}</TableCell><TableCell><Badge variant="outline" className="capitalize">{row.status === 'received' ? 'Completed' : row.status || 'completed'}</Badge></TableCell></TableRow>)}
            </TableBody>
          </Table>
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-border p-4 text-sm"><p className="text-muted-foreground">Showing {pageStart}–{pageEnd} of {totalRows} transactions</p><div className="flex items-center gap-2"><Button variant="outline" size="sm" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1 || loading}><ChevronLeft className="w-4 h-4 mr-1" /> Previous</Button><span className="min-w-20 text-center">Page {page} of {totalPages}</span><Button variant="outline" size="sm" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages || loading}>Next <ChevronRight className="w-4 h-4 ml-1" /></Button></div></div>
      </Card>
    </div>
  );
}
