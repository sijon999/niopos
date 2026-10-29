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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

type TransactionType = 'all' | 'purchase' | 'expense';
type DatePreset = 'all' | 'today' | 'yesterday' | 'last7' | 'lastMonth' | 'thisMonth' | 'lastYear' | 'custom';

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

type AppliedFilters = {
  from: string;
  to: string;
  type: TransactionType;
  payment: string;
  supplier: string;
  category: string;
  search: string;
};

const PAGE_SIZE = 20;
const EMPTY_FILTERS: AppliedFilters = {
  from: '',
  to: '',
  type: 'all',
  payment: 'all',
  supplier: 'all',
  category: 'all',
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

function endOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
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

export default function PurchaseExpenseReportPage() {
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [totalRows, setTotalRows] = useState(0);
  const [summary, setSummary] = useState({ purchase: 0, expense: 0, outflow: 0, count: 0 });
  const [page, setPage] = useState(1);
  const [filterOpen, setFilterOpen] = useState(false);
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [searchInput, setSearchInput] = useState('');
  const [draft, setDraft] = useState<AppliedFilters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<AppliedFilters>(EMPTY_FILTERS);

  useEffect(() => {
    async function loadOptions(): Promise<void> {
      const [supplierResult, categoryResult] = await Promise.all([
        supabase.from('suppliers').select('id, name, phone').eq('status', 'active').order('name'),
        supabase.from('expense_categories').select('id, name').order('name'),
      ]);
      if (supplierResult.error || categoryResult.error) {
        toast.error('Could not load filter options');
        return;
      }
      setSuppliers(supplierResult.data || []);
      setCategories(categoryResult.data || []);
    }
    loadOptions();
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
    let query = supabase
      .from('purchase_expense_report')
      .select('*', { count: 'exact' })
      .order('transaction_date', { ascending: false });

    if (applied.from) query = query.gte('transaction_date', localBoundary(applied.from, false));
    if (applied.to) query = query.lte('transaction_date', localBoundary(applied.to, true));
    if (applied.type !== 'all') query = query.eq('transaction_type', applied.type);
    if (applied.payment !== 'all') query = query.eq('payment_method', applied.payment);
    if (applied.supplier !== 'all') query = query.eq('supplier_id', applied.supplier);
    if (applied.category !== 'all') query = query.eq('category_id', applied.category);
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
      p_category: applied.category === 'all' ? null : applied.category,
      p_search: applied.search || null,
    });
    const [{ data, error, count }, { data: summaryData, error: summaryError }] = await Promise.all([
      query.range(from, from + PAGE_SIZE - 1),
      summaryRequest,
    ]);
    if (error || summaryError) {
      toast.error('Could not load transactions');
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
    loadRows();
  }, [loadRows]);

  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const pageStart = totalRows === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const pageEnd = Math.min(page * PAGE_SIZE, totalRows);

  const draftDirty = draft.from !== applied.from || draft.to !== applied.to || draft.type !== applied.type || draft.payment !== applied.payment || draft.supplier !== applied.supplier || draft.category !== applied.category;
  const hasFilters = Boolean(applied.search || applied.from || applied.to || applied.type !== 'all' || applied.payment !== 'all' || applied.supplier !== 'all' || applied.category !== 'all');

  const updatePreset = (preset: DatePreset): void => {
    setDatePreset(preset);
    if (preset === 'custom') return;
    const range = getPresetRange(preset);
    setDraft((current) => ({ ...current, ...range }));
  };

  const applyFilters = (): void => {
    if (draft.from && draft.to && draft.to < draft.from) {
      toast.error('The end date cannot be earlier than the start date');
      return;
    }
    setApplied((current) => ({ ...draft, search: current.search }));
    setPage(1);
    setFilterOpen(false);
  };

  const cancelFilters = (): void => {
    setDraft(applied);
    setDatePreset(applied.from || applied.to ? 'custom' : 'all');
    setFilterOpen(false);
  };

  const clearAll = (): void => {
    setDraft(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setSearchInput('');
    setDatePreset('all');
    setPage(1);
  };

  const removeFilter = (key: keyof AppliedFilters): void => {
    const next = { ...applied, [key]: key === 'type' || key === 'payment' ? 'all' : '' } as AppliedFilters;
    setApplied(next);
    setDraft(next);
    if (key === 'search') setSearchInput('');
    setPage(1);
  };

  const exportRows = async (): Promise<void> => {
    setExporting(true);
    let query = supabase
      .from('purchase_expense_report')
      .select('*')
      .order('transaction_date', { ascending: false });
    if (applied.from) query = query.gte('transaction_date', localBoundary(applied.from, false));
    if (applied.to) query = query.lte('transaction_date', localBoundary(applied.to, true));
    if (applied.type !== 'all') query = query.eq('transaction_type', applied.type);
    if (applied.payment !== 'all') query = query.eq('payment_method', applied.payment);
    if (applied.supplier !== 'all') query = query.eq('supplier_id', applied.supplier);
    if (applied.category !== 'all') query = query.eq('category_id', applied.category);
    if (applied.search) {
      const value = safeSearch(applied.search);
      query = query.or(`party_name.ilike.%${value}%,party_phone.ilike.%${value}%,reference_no.ilike.%${value}%,category_name.ilike.%${value}%`);
    }
    const { data, error } = await query.limit(10000);
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
      row.payment_method || 'Other',
      Number(row.amount).toFixed(2),
      row.status || '',
    ]);
    const csv = [headers, ...csvRows].map((line) => line.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
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
          <Popover open={filterOpen} onOpenChange={(open) => { setFilterOpen(open); if (open) setDraft(applied); }}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="lg:w-auto"><Filter className="w-4 h-4 mr-2" /> Filter {hasFilters && <span className="ml-2 rounded-full bg-primary text-primary-foreground px-2 text-xs">Active</span>}</Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[min(92vw,420px)] p-4">
              <div className="flex items-center justify-between mb-3">
                <div><h3 className="font-semibold">Advanced Filters</h3><p className="text-xs text-muted-foreground">Narrow down purchases and expenses</p></div>
                <button onClick={cancelFilters} className="text-muted-foreground hover:text-foreground" aria-label="Close filters"><X className="w-4 h-4" /></button>
              </div>
              <div className="flex gap-1 overflow-x-auto pb-1 mb-4">
                {(['today', 'last7', 'thisMonth', 'lastMonth', 'lastYear', 'all'] as DatePreset[]).map((preset) => (
                  <Button key={preset} type="button" size="sm" variant={datePreset === preset ? 'default' : 'outline'} className="whitespace-nowrap text-xs" onClick={() => updatePreset(preset)}>
                    {preset === 'last7' ? 'Last 7 Days' : preset === 'thisMonth' ? 'This Month' : preset === 'lastMonth' ? 'Last Month' : preset === 'lastYear' ? 'Last Year' : preset === 'today' ? 'Today' : 'All Time'}
                  </Button>
                ))}
              </div>
              <div className="grid grid-cols-5 gap-1 mb-4">
                {(['today', 'last7', 'thisMonth', 'quarter', 'year'] as const).map((tab) => (
                  <Button key={tab} type="button" size="sm" variant="ghost" className="text-xs" onClick={() => {
                    if (tab === 'quarter') {
                      const now = new Date();
                      const startMonth = Math.floor(now.getMonth() / 3) * 3;
                      setDatePreset('custom');
                      setDraft((current) => ({ ...current, from: toDateInputValue(new Date(now.getFullYear(), startMonth, 1)), to: toDateInputValue(now) }));
                    } else if (tab === 'year') {
                      const now = new Date();
                      setDatePreset('custom');
                      setDraft((current) => ({ ...current, from: `${now.getFullYear()}-01-01`, to: toDateInputValue(now) }));
                    } else updatePreset(tab === 'today' ? 'today' : tab === 'last7' ? 'last7' : 'thisMonth');
                  }}>{tab[0].toUpperCase() + tab.slice(1)}</Button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label className="text-xs">From Date</Label><Input type="date" value={draft.from} onChange={(event) => { setDatePreset('custom'); setDraft({ ...draft, from: event.target.value }); }} /></div>
                <div className="space-y-1"><Label className="text-xs">To Date</Label><Input type="date" value={draft.to} min={draft.from || undefined} onChange={(event) => { setDatePreset('custom'); setDraft({ ...draft, to: event.target.value }); }} /></div>
              </div>
              <Separator className="my-4" />
              <div className="space-y-3">
                <div className="space-y-1"><Label className="text-xs">Transaction Type</Label><select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as TransactionType })} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"><option value="all">All</option><option value="purchase">Purchase</option><option value="expense">Expense</option></select></div>
                <div className="space-y-1"><Label className="text-xs">Payment Method</Label><select value={draft.payment} onChange={(event) => setDraft({ ...draft, payment: event.target.value })} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"><option value="all">All</option><option value="cash">Cash</option><option value="card">Card</option><option value="mobile">Mobile Banking</option><option value="other">Other</option></select></div>
                {(draft.type === 'all' || draft.type === 'purchase') && <div className="space-y-1"><Label className="text-xs">Supplier</Label><select value={draft.supplier} onChange={(event) => setDraft({ ...draft, supplier: event.target.value })} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"><option value="all">All Suppliers</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></div>}
                {(draft.type === 'all' || draft.type === 'expense') && <div className="space-y-1"><Label className="text-xs">Expense Category</Label><select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"><option value="all">All Categories</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div>}
              </div>
              <div className="flex justify-between gap-2 mt-5"><Button variant="ghost" size="sm" onClick={clearAll}>Clear All</Button><div className="flex gap-2"><Button variant="outline" size="sm" onClick={cancelFilters}>Cancel</Button><Button size="sm" onClick={applyFilters} disabled={!draftDirty && !draft.from && !draft.to}>Apply</Button></div></div>
            </PopoverContent>
          </Popover>
        </div>

        {hasFilters && (
          <div className="flex flex-wrap items-center gap-2">
            {dateChip && <button onClick={() => { removeFilter('from'); setApplied((current) => ({ ...current, to: '' })); }} className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs hover:bg-muted/80"><CalendarDays className="w-3 h-3" />{dateChip}<X className="w-3 h-3" /></button>}
            {applied.search && <button onClick={() => removeFilter('search')} className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs">Search: {applied.search}<X className="w-3 h-3" /></button>}
            {applied.type !== 'all' && <button onClick={() => removeFilter('type')} className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs capitalize">{applied.type}<X className="w-3 h-3" /></button>}
            {applied.supplier !== 'all' && <button onClick={() => removeFilter('supplier')} className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs">{suppliers.find((supplier) => supplier.id === applied.supplier)?.name || 'Supplier'}<X className="w-3 h-3" /></button>}
            {applied.category !== 'all' && <button onClick={() => removeFilter('category')} className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs">{categories.find((category) => category.id === applied.category)?.name || 'Category'}<X className="w-3 h-3" /></button>}
            {applied.payment !== 'all' && <button onClick={() => removeFilter('payment')} className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs capitalize">{applied.payment}<X className="w-3 h-3" /></button>}
            <Button variant="link" size="sm" className="h-auto px-1 text-xs" onClick={clearAll}>Clear All</Button>
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Invoice / Reference</TableHead><TableHead>Supplier / Party</TableHead><TableHead>Phone</TableHead><TableHead>Category</TableHead><TableHead>Payment</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {loading ? Array.from({ length: 6 }).map((_, index) => <TableRow key={index}>{Array.from({ length: 9 }).map((__, cell) => <TableCell key={cell}><div className="h-4 bg-muted rounded animate-pulse" /></TableCell>)}</TableRow>) : rows.length === 0 ? <TableRow><TableCell colSpan={9} className="py-16 text-center"><FileBarChart className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-40" /><p className="font-medium">No transactions found</p><p className="text-sm text-muted-foreground mt-1">Try changing the date, search, or filter options.</p></TableCell></TableRow> : rows.map((row) => <TableRow key={`${row.transaction_type}-${row.id}`} className="hover:bg-muted/50"><TableCell className="text-sm whitespace-nowrap">{formatDate(row.transaction_date)}</TableCell><TableCell><Badge className={row.transaction_type === 'purchase' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'}>{row.transaction_type === 'purchase' ? 'Purchase' : 'Expense'}</Badge></TableCell><TableCell className="font-medium max-w-48 truncate">{row.reference_no || '-'}</TableCell><TableCell>{row.party_name || '-'}</TableCell><TableCell className="text-sm">{row.party_phone || '-'}</TableCell><TableCell>{row.category_name || '-'}</TableCell><TableCell className="capitalize">{row.payment_method || 'Other'}</TableCell><TableCell className="text-right font-bold">{formatMoney(Number(row.amount))}</TableCell><TableCell><Badge variant="outline" className="capitalize">{row.status || 'completed'}</Badge></TableCell></TableRow>)}
            </TableBody>
          </Table>
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-border p-4 text-sm"><p className="text-muted-foreground">Showing {pageStart}–{pageEnd} of {totalRows} transactions</p><div className="flex items-center gap-2"><Button variant="outline" size="sm" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1 || loading}><ChevronLeft className="w-4 h-4 mr-1" /> Previous</Button><span className="min-w-20 text-center">Page {page} of {totalPages}</span><Button variant="outline" size="sm" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages || loading}>Next <ChevronRight className="w-4 h-4 ml-1" /></Button></div></div>
      </Card>
    </div>
  );
}
