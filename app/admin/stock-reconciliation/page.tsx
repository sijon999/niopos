'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  ClipboardCheck,
  Search,
  Download,
  Printer,
  ScanLine,
  History,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Package,
  Loader2,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { useAuthStore } from '@/store/auth-store';
import { useTranslation } from '@/hooks/use-translation';
import { toast } from 'sonner';
import type { Product, StockReconciliation } from '@/types';

type ReconciliationStatus = 'NOT_CHECKED' | 'CHECKED' | 'DIFFERENCE_FOUND';

type ProductWithRecon = Product & {
  latest_reconciliation?: StockReconciliation | null;
};

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const REASON_OPTIONS = [
  'damagedProduct',
  'lostProduct',
  'wrongSalesEntry',
  'wrongPurchaseEntry',
  'expiredProduct',
  'theft',
  'countingError',
  'other',
] as const;

export default function StockReconciliationPage() {
  const { t } = useTranslation();
  const { user } = useAuthStore();

  const [products, setProducts] = useState<ProductWithRecon[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'not_checked' | 'checked' | 'difference_found' | 'today' | 'week' | 'month'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'name' | 'stock' | 'difference' | 'lastChecked' | 'status'>('name');
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Modals
  const [verifyProduct, setVerifyProduct] = useState<ProductWithRecon | null>(null);
  const [physicalQty, setPhysicalQty] = useState('');
  const [reason, setReason] = useState<string>('');
  const [reasonDetails, setReasonDetails] = useState('');
  const [saving, setSaving] = useState(false);

  const [historyProduct, setHistoryProduct] = useState<ProductWithRecon | null>(null);
  const [historyRecords, setHistoryRecords] = useState<StockReconciliation[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [bulkMode, setBulkMode] = useState(false);
  const [bulkQuantities, setBulkQuantities] = useState<Record<string, string>>({});
  const [bulkSaving, setBulkSaving] = useState(false);

  const [scanMode, setScanMode] = useState(false);
  const [scanInput, setScanInput] = useState('');

  const [adjustmentProduct, setAdjustmentProduct] = useState<ProductWithRecon | null>(null);
  const [adjustmentSaving, setAdjustmentSaving] = useState(false);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Load data
  const loadData = useCallback(async () => {
    const showInitialLoading = products.length === 0;
    if (showInitialLoading) setLoading(true);

    try {
      const [prodRes, catRes] = await Promise.all([
        supabase
          .from('products')
          .select('*, brands(name), categories(name)')
          .eq('is_deleted', false)
          .order('name'),
        supabase.from('categories').select('id, name').order('name'),
      ]);

      if (prodRes.error || catRes.error) throw new Error('Unable to load inventory data');

      const baseProducts: ProductWithRecon[] = (prodRes.data || []).map((product) => ({
        ...product,
        latest_reconciliation: null,
      }));
      setProducts(baseProducts);
      setCategories(catRes.data || []);
      if (showInitialLoading) setLoading(false);

      const productIds = baseProducts.map((product) => product.id);
      if (productIds.length === 0) return;

      const reconRes = await supabase
        .from('stock_reconciliations')
        .select('*')
        .in('product_id', productIds)
        .order('checked_at', { ascending: false, nullsFirst: false });

      if (reconRes.error) throw new Error('Unable to load reconciliation data');

      const reconMap: Record<string, StockReconciliation> = {};
      for (const reconciliation of reconRes.data || []) {
        if (!reconMap[reconciliation.product_id]) {
          reconMap[reconciliation.product_id] = reconciliation;
        }
      }

      setProducts(baseProducts.map((product) => ({
        ...product,
        latest_reconciliation: reconMap[product.id] || null,
      })));
    } catch {
      if (showInitialLoading) setLoading(false);
      toast.error(t('reconciliation.verifyError'));
    }
  }, [products.length, t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Determine status for a product
  const getReconStatus = (product: ProductWithRecon): ReconciliationStatus => {
    const recon = product.latest_reconciliation;
    if (!recon || !recon.checked_at) return 'NOT_CHECKED';
    if (Number(recon.difference) === 0) return 'CHECKED';
    return 'DIFFERENCE_FOUND';
  };

  // Filter and sort
  const filteredProducts = useMemo(() => {
    let result = [...products];

    // Search
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.product_code || '').toLowerCase().includes(q) ||
          (p.barcode || '').toLowerCase().includes(q) ||
          (p.sku || '').toLowerCase().includes(q)
      );
    }

    // Category filter
    if (categoryFilter !== 'all') {
      result = result.filter((p) => p.category_id === categoryFilter);
    }

    // Status filter
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    if (statusFilter !== 'all') {
      result = result.filter((p) => {
        const status = getReconStatus(p);
        const recon = p.latest_reconciliation;
        const checkedAt = recon?.checked_at ? new Date(recon.checked_at) : null;

        switch (statusFilter) {
          case 'not_checked':
            return status === 'NOT_CHECKED';
          case 'checked':
            return status === 'CHECKED';
          case 'difference_found':
            return status === 'DIFFERENCE_FOUND';
          case 'today':
            return checkedAt && checkedAt >= startOfToday;
          case 'week':
            return checkedAt && checkedAt >= startOfWeek;
          case 'month':
            return checkedAt && checkedAt >= startOfMonth;
          default:
            return true;
        }
      });
    }

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'stock':
          return Number(b.stock) - Number(a.stock);
        case 'difference': {
          const diffA = a.latest_reconciliation ? Number(a.latest_reconciliation.difference) : 0;
          const diffB = b.latest_reconciliation ? Number(b.latest_reconciliation.difference) : 0;
          return Math.abs(diffB) - Math.abs(diffA);
        }
        case 'lastChecked': {
          const dateA = a.latest_reconciliation?.checked_at ? new Date(a.latest_reconciliation.checked_at).getTime() : 0;
          const dateB = b.latest_reconciliation?.checked_at ? new Date(b.latest_reconciliation.checked_at).getTime() : 0;
          return dateB - dateA;
        }
        case 'status':
          return getReconStatus(a).localeCompare(getReconStatus(b));
        default:
          return 0;
      }
    });

    return result;
  }, [products, debouncedSearch, categoryFilter, statusFilter, sortBy]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedProducts = filteredProducts.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  // Stats
  const stats = useMemo(() => {
    const total = products.length;
    let notChecked = 0;
    let checked = 0;
    let diffFound = 0;

    for (const p of products) {
      const status = getReconStatus(p);
      if (status === 'NOT_CHECKED') notChecked++;
      else if (status === 'CHECKED') checked++;
      else if (status === 'DIFFERENCE_FOUND') diffFound++;
    }

    return { total, notChecked, checked, diffFound };
  }, [products]);

  const progressPercent = stats.total > 0 ? Math.round(((stats.checked + stats.diffFound) / stats.total) * 100) : 0;

  // Verify stock
  const handleOpenVerify = (product: ProductWithRecon) => {
    setVerifyProduct(product);
    setPhysicalQty(String(product.stock));
    setReason('');
    setReasonDetails('');
  };

  const handleSaveVerify = async () => {
    if (!verifyProduct) return;
    const physical = parseFloat(physicalQty);
    if (isNaN(physical) || physical < 0) {
      toast.error(t('reconciliation.verifyError'));
      return;
    }

    const systemQty = Number(verifyProduct.stock);
    const diff = physical - systemQty;
    const status: ReconciliationStatus = diff === 0 ? 'CHECKED' : 'DIFFERENCE_FOUND';

    if (status === 'DIFFERENCE_FOUND' && !reason) {
      toast.error(t('reconciliation.reasonRequired'));
      return;
    }

    setSaving(true);
    try {
      const reasonValue = reason && reason !== 'other' ? t(`reconciliation.${reason}`) : reason === 'other' ? 'Other' : null;

      const { error } = await supabase.from('stock_reconciliations').insert({
        product_id: verifyProduct.id,
        system_quantity: systemQty,
        physical_quantity: physical,
        difference: diff,
        status,
        reason: reasonValue,
        reason_details: reason === 'other' ? reasonDetails : null,
        checked_by: user?.name || user?.email || 'Unknown',
        checked_at: new Date().toISOString(),
      });

      if (error) throw error;

      if (diff === 0) {
        toast.success(t('reconciliation.verifySuccess'));
      } else {
        toast.success(t('reconciliation.verifyDifferenceFound', { diff: diff > 0 ? `+${diff}` : String(diff) }));
      }

      setVerifyProduct(null);
      await loadData();
    } catch {
      toast.error(t('reconciliation.verifyError'));
    } finally {
      setSaving(false);
    }
  };

  // History
  const handleOpenHistory = async (product: ProductWithRecon) => {
    setHistoryProduct(product);
    setHistoryLoading(true);
    try {
      const { data, error } = await supabase
        .from('stock_reconciliations')
        .select('*')
        .eq('product_id', product.id)
        .order('checked_at', { ascending: false, nullsFirst: false });

      if (error) throw error;
      setHistoryRecords(data || []);
    } catch {
      toast.error(t('reconciliation.verifyError'));
    } finally {
      setHistoryLoading(false);
    }
  };

  // Bulk verify
  const handleBulkVerify = async () => {
    const selectedProducts = products.filter((p) => selectedIds.has(p.id));
    if (selectedProducts.length === 0) return;

    setBulkSaving(true);
    let successCount = 0;
    let errorCount = 0;

    try {
      const inserts: any[] = [];
      for (const p of selectedProducts) {
        const qtyStr = bulkQuantities[p.id];
        if (!qtyStr) continue;
        const physical = parseFloat(qtyStr);
        if (isNaN(physical) || physical < 0) continue;

        const systemQty = Number(p.stock);
        const diff = physical - systemQty;
        const status: ReconciliationStatus = diff === 0 ? 'CHECKED' : 'DIFFERENCE_FOUND';

        inserts.push({
          product_id: p.id,
          system_quantity: systemQty,
          physical_quantity: physical,
          difference: diff,
          status,
          checked_by: user?.name || user?.email || 'Unknown',
          checked_at: new Date().toISOString(),
        });
      }

      if (inserts.length > 0) {
        const { error } = await supabase.from('stock_reconciliations').insert(inserts);
        if (error) throw error;
        successCount = inserts.length;
      }

      toast.success(`${successCount} ${t('reconciliation.verified')}`);
      setBulkMode(false);
      setSelectedIds(new Set());
      setBulkQuantities({});
      await loadData();
    } catch {
      toast.error(t('reconciliation.verifyError'));
      errorCount++;
    } finally {
      setBulkSaving(false);
    }
  };

  // Barcode scan
  const handleBarcodeScan = () => {
    if (!scanInput.trim()) return;
    const product = products.find(
      (p) => p.barcode === scanInput.trim() || p.sku === scanInput.trim()
    );
    if (product) {
      setScanInput('');
      setScanMode(false);
      handleOpenVerify(product);
    } else {
      toast.error(t('reconciliation.productNotFound'));
      setScanInput('');
    }
  };

  // Stock adjustment
  const handleApplyAdjustment = async () => {
    if (!adjustmentProduct || !adjustmentProduct.latest_reconciliation) return;
    const recon = adjustmentProduct.latest_reconciliation;
    const currentStock = Number(adjustmentProduct.stock);
    const originalSystem = Number(recon.system_quantity);

    // Warn if stock changed since verification
    if (currentStock !== originalSystem) {
      const proceed = confirm(
        t('reconciliation.stockChangedSinceVerification', {
          original: String(originalSystem),
          current: String(currentStock),
        })
      );
      if (!proceed) return;
    }

    setAdjustmentSaving(true);
    try {
      const newQty = Number(recon.physical_quantity);
      const diff = newQty - currentStock;

      // Update product stock
      const { error: updateError } = await supabase
        .from('products')
        .update({ stock: newQty, updated_at: new Date().toISOString() })
        .eq('id', adjustmentProduct.id);

      if (updateError) throw updateError;

      // Create stock movement record
      await supabase.from('stock_movements').insert({
        product_id: adjustmentProduct.id,
        type: 'adjustment',
        quantity: Math.abs(diff),
        reference: `Reconciliation: ${recon.id}`,
        note: `Stock adjustment from reconciliation. Reason: ${recon.reason || 'N/A'}`,
      });

      // Create stock adjustment record
      await supabase.from('stock_adjustments').insert({
        product_id: adjustmentProduct.id,
        reconciliation_id: recon.id,
        previous_quantity: currentStock,
        new_quantity: newQty,
        difference: diff,
        reason: recon.reason,
        reason_details: recon.reason_details,
        adjusted_by: user?.name || user?.email || 'Unknown',
      });

      // Mark reconciliation as adjusted
      await supabase
        .from('stock_reconciliations')
        .update({
          adjustment_applied: true,
          adjustment_applied_at: new Date().toISOString(),
          adjustment_applied_by: user?.name || user?.email || 'Unknown',
        })
        .eq('id', recon.id);

      toast.success(t('reconciliation.adjustmentApplied'));
      setAdjustmentProduct(null);
      await loadData();
    } catch {
      toast.error(t('reconciliation.verifyError'));
    } finally {
      setAdjustmentSaving(false);
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    const headers = [
      t('products.productName'),
      t('reconciliation.productCode'),
      t('products.barcode'),
      t('reconciliation.softwareStock'),
      t('reconciliation.physicalStock'),
      t('reconciliation.difference'),
      t('common.status'),
      t('reconciliation.reason'),
      t('reconciliation.lastChecked'),
      t('reconciliation.checkedBy'),
    ];
    const rows = filteredProducts.map((p) => {
      const recon = p.latest_reconciliation;
      const status = getReconStatus(p);
      return [
        p.name,
        p.product_code || '',
        p.barcode || '',
        String(p.stock),
        recon?.physical_quantity != null ? String(recon.physical_quantity) : '',
        recon ? String(recon.difference) : '',
        t(`reconciliation.${status === 'NOT_CHECKED' ? 'notCheckedStatus' : status === 'CHECKED' ? 'checkedStatus' : 'differenceFoundStatus'}`),
        recon?.reason || '',
        recon?.checked_at ? new Date(recon.checked_at).toLocaleString() : t('reconciliation.never'),
        recon?.checked_by || '',
      ];
    });
    const csv = [headers, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stock-reconciliation-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Print
  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    const rows = filteredProducts
      .map((p) => {
        const recon = p.latest_reconciliation;
        const status = getReconStatus(p);
        const statusText = t(`reconciliation.${status === 'NOT_CHECKED' ? 'notCheckedStatus' : status === 'CHECKED' ? 'checkedStatus' : 'differenceFoundStatus'}`);
        return `<tr>
          <td>${p.name}</td>
          <td>${p.product_code || ''}</td>
          <td>${p.barcode || ''}</td>
          <td>${p.stock}</td>
          <td>${recon?.physical_quantity != null ? recon.physical_quantity : ''}</td>
          <td>${recon ? recon.difference : ''}</td>
          <td>${statusText}</td>
          <td>${recon?.checked_at ? new Date(recon.checked_at).toLocaleString() : t('reconciliation.never')}</td>
          <td>${recon?.checked_by || ''}</td>
        </tr>`;
      })
      .join('');
    printWindow.document.write(`
      <html><head><title>${t('reconciliation.title')}</title>
      <style>body{font-family:sans-serif} table{width:100%;border-collapse:collapse} th,td{border:1px solid #ddd;padding:8px;text-align:left} th{background:#f5f5f5} h1{margin-bottom:5px}</style>
      </head><body>
      <h1>${t('reconciliation.title')}</h1>
      <p>${t('reconciliation.subtitle')}</p>
      <p>${new Date().toLocaleString()}</p>
      <table><thead><tr>
        <th>${t('products.productName')}</th><th>${t('reconciliation.productCode')}</th><th>${t('products.barcode')}</th>
        <th>${t('reconciliation.softwareStock')}</th><th>${t('reconciliation.physicalStock')}</th><th>${t('reconciliation.difference')}</th>
        <th>${t('common.status')}</th><th>${t('reconciliation.lastChecked')}</th><th>${t('reconciliation.checkedBy')}</th>
      </tr></thead><tbody>${rows}</tbody></table>
      </body></html>`);
    printWindow.document.close();
    printWindow.print();
  };

  // Status badge
  const StatusBadge = ({ status }: { status: ReconciliationStatus }) => {
    if (status === 'NOT_CHECKED')
      return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">{t('reconciliation.notCheckedStatus')}</Badge>;
    if (status === 'CHECKED')
      return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">{t('reconciliation.checkedStatus')}</Badge>;
    return <Badge className="bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400">{t('reconciliation.differenceFoundStatus')}</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold font-heading flex items-center gap-2">
            <ClipboardCheck className="w-6 h-6 text-indigo-600" />
            {t('reconciliation.title')}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">{t('reconciliation.subtitle')}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setScanMode(true)}>
            <ScanLine className="w-4 h-4 mr-2" /> {t('reconciliation.scanBarcode')}
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <Download className="w-4 h-4 mr-2" /> {t('common.export')} CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="w-4 h-4 mr-2" /> {t('reconciliation.printReport')}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: t('reconciliation.totalProducts'), value: stats.total, icon: Package, color: 'from-slate-800 to-black' },
          { label: t('reconciliation.notChecked'), value: stats.notChecked, icon: XCircle, color: 'from-amber-500 to-orange-600' },
          { label: t('reconciliation.checked'), value: stats.checked, icon: CheckCircle2, color: 'from-emerald-500 to-green-600' },
          { label: t('reconciliation.differenceFound'), value: stats.diffFound, icon: AlertTriangle, color: 'from-rose-500 to-pink-600' },
        ].map((stat, i) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${stat.color} flex items-center justify-center shrink-0`}>
                  <stat.icon className="w-5 h-5 text-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground truncate">{stat.label}</p>
                  <p className="text-xl font-bold">{stat.value}</p>
                </div>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Progress Bar */}
      {stats.total > 0 && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">{t('reconciliation.verificationProgress')}</span>
            <span className="text-sm text-muted-foreground">
              {stats.checked + stats.diffFound} / {stats.total} {t('reconciliation.verified')} ({progressPercent}%)
            </span>
          </div>
          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </Card>
      )}

      {/* Filters */}
      <Card className="p-4 space-y-4">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={t('reconciliation.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
            <SelectTrigger className="w-full lg:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('reconciliation.allProducts')}</SelectItem>
              <SelectItem value="not_checked">{t('reconciliation.notChecked')}</SelectItem>
              <SelectItem value="checked">{t('reconciliation.checked')}</SelectItem>
              <SelectItem value="difference_found">{t('reconciliation.differenceFound')}</SelectItem>
              <SelectItem value="today">{t('reconciliation.checkedToday')}</SelectItem>
              <SelectItem value="week">{t('reconciliation.checkedThisWeek')}</SelectItem>
              <SelectItem value="month">{t('reconciliation.checkedThisMonth')}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-full lg:w-40">
              <SelectValue placeholder={t('products.categoryFilter')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('common.all')}</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
            <SelectTrigger className="w-full lg:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">{t('reconciliation.sortName')}</SelectItem>
              <SelectItem value="stock">{t('reconciliation.sortStock')}</SelectItem>
              <SelectItem value="difference">{t('reconciliation.sortDifference')}</SelectItem>
              <SelectItem value="lastChecked">{t('reconciliation.sortLastChecked')}</SelectItem>
              <SelectItem value="status">{t('reconciliation.sortStatus')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Bulk Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          {bulkMode ? (
            <>
              <Button size="sm" onClick={handleBulkVerify} disabled={bulkSaving || selectedIds.size === 0}>
                {bulkSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                {t('reconciliation.verifySelected')} ({selectedIds.size})
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setBulkMode(false); setSelectedIds(new Set()); setBulkQuantities({}); }}>
                {t('common.cancel')}
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setBulkMode(true)}>
              <ClipboardCheck className="w-4 h-4 mr-2" /> {t('reconciliation.bulkVerifyTitle')}
            </Button>
          )}
        </div>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {bulkMode && <TableHead className="w-12"><Checkbox /></TableHead>}
                <TableHead>{t('products.productName')}</TableHead>
                <TableHead className="hidden md:table-cell">{t('reconciliation.productCode')}</TableHead>
                <TableHead className="hidden lg:table-cell">{t('products.barcode')}</TableHead>
                <TableHead className="hidden sm:table-cell">{t('products.category')}</TableHead>
                <TableHead>{t('reconciliation.softwareStock')}</TableHead>
                <TableHead className="hidden sm:table-cell">{t('reconciliation.physicalStock')}</TableHead>
                <TableHead>{t('reconciliation.difference')}</TableHead>
                <TableHead className="hidden md:table-cell">{t('reconciliation.lastChecked')}</TableHead>
                <TableHead className="hidden lg:table-cell">{t('reconciliation.checkedBy')}</TableHead>
                <TableHead>{t('common.status')}</TableHead>
                <TableHead className="text-right">{t('reconciliation.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && products.length === 0 ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: bulkMode ? 12 : 11 }).map((_, j) => (
                      <TableCell key={j}><div className="h-4 bg-muted rounded animate-pulse" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : paginatedProducts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={bulkMode ? 12 : 11} className="text-center py-12 text-muted-foreground">
                    <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>{statusFilter === 'not_checked' ? t('reconciliation.noUncheckedProducts') : t('reconciliation.noProductsToVerify')}</p>
                  </TableCell>
                </TableRow>
              ) : (
                paginatedProducts.map((product) => {
                  const status = getReconStatus(product);
                  const recon = product.latest_reconciliation;
                  const diff = recon ? Number(recon.difference) : null;
                  return (
                    <TableRow key={product.id} className="hover:bg-muted/50">
                      {bulkMode && (
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.has(product.id)}
                            onCheckedChange={(checked) => {
                              const newSet = new Set(selectedIds);
                              if (checked) newSet.add(product.id);
                              else newSet.delete(product.id);
                              setSelectedIds(newSet);
                            }}
                          />
                        </TableCell>
                      )}
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {product.image_url ? (
                            <img src={product.image_url} alt={product.name} className="w-8 h-8 rounded object-cover shrink-0" />
                          ) : (
                            <div className="w-8 h-8 rounded bg-muted flex items-center justify-center shrink-0">
                              <Package className="w-4 h-4 text-muted-foreground" />
                            </div>
                          )}
                          <span className="truncate max-w-[150px]">{product.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm">{product.product_code || '-'}</TableCell>
                      <TableCell className="hidden lg:table-cell text-sm">{product.barcode || '-'}</TableCell>
                      <TableCell className="hidden sm:table-cell text-sm">{product.categories?.name || '-'}</TableCell>
                      <TableCell className="font-medium">{Number(product.stock)} <span className="text-xs text-muted-foreground">{product.unit}</span></TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {recon?.physical_quantity != null ? (
                          <span>{Number(recon.physical_quantity)}</span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {diff !== null ? (
                          <span className={diff === 0 ? 'text-emerald-600 font-medium' : diff > 0 ? 'text-blue-600 font-medium' : 'text-rose-600 font-medium'}>
                            {diff > 0 ? `+${diff}` : diff}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                        {recon?.checked_at ? new Date(recon.checked_at).toLocaleDateString() : t('reconciliation.never')}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                        {recon?.checked_by || '-'}
                      </TableCell>
                      <TableCell><StatusBadge status={status} /></TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => handleOpenVerify(product)} title={t('reconciliation.verifyStock')}>
                            <ClipboardCheck className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => handleOpenHistory(product)} title={t('reconciliation.history')}>
                            <History className="w-4 h-4" />
                          </Button>
                          {status === 'DIFFERENCE_FOUND' && !recon?.adjustment_applied && (
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-amber-600" onClick={() => setAdjustmentProduct(product)} title={t('reconciliation.applyAdjustment')}>
                              <AlertTriangle className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Bulk quantity entry */}
        {bulkMode && selectedIds.size > 0 && (
          <div className="border-t border-border p-4 space-y-3">
            <h3 className="font-semibold text-sm">{t('reconciliation.enterPhysicalQuantities')}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {products.filter((p) => selectedIds.has(p.id)).map((p) => (
                <div key={p.id} className="flex items-center gap-2">
                  <Label className="text-sm truncate flex-1 max-w-[120px]">{p.name}</Label>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{t('reconciliation.softwareStock')}: {p.stock}</span>
                  <Input
                    type="number"
                    min="0"
                    placeholder={String(p.stock)}
                    value={bulkQuantities[p.id] || ''}
                    onChange={(e) => setBulkQuantities({ ...bulkQuantities, [p.id]: e.target.value })}
                    className="w-20 h-8"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pagination */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 border-t border-border">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {t('common.show')}
            <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
              <SelectTrigger className="w-20 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((s) => (
                  <SelectItem key={s} value={String(s)}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {t('common.entries')}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {filteredProducts.length} {t('reconciliation.totalProducts').toLowerCase()}
            </span>
            <Button size="sm" variant="outline" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>
              {t('common.previous')}
            </Button>
            <span className="text-sm">{currentPage} / {totalPages}</span>
            <Button size="sm" variant="outline" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>
              {t('common.next')}
            </Button>
          </div>
        </div>
      </Card>

      {/* Verify Stock Modal */}
      <Dialog open={!!verifyProduct} onOpenChange={(open) => !open && setVerifyProduct(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('reconciliation.verifyStock')}</DialogTitle>
            <DialogDescription>{verifyProduct?.name}</DialogDescription>
          </DialogHeader>
          {verifyProduct && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <Label className="text-muted-foreground">{t('reconciliation.productCode')}</Label>
                  <p className="font-medium">{verifyProduct.product_code || '-'}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">{t('products.barcode')}</Label>
                  <p className="font-medium">{verifyProduct.barcode || '-'}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">{t('reconciliation.softwareStock')}</Label>
                  <p className="font-medium text-lg">{Number(verifyProduct.stock)} {verifyProduct.unit}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">{t('reconciliation.lastChecked')}</Label>
                  <p className="font-medium text-sm">
                    {verifyProduct.latest_reconciliation?.checked_at
                      ? new Date(verifyProduct.latest_reconciliation.checked_at).toLocaleString()
                      : t('reconciliation.never')}
                  </p>
                </div>
              </div>
              <div>
                <Label htmlFor="physicalQty">{t('reconciliation.physicalStock')}</Label>
                <Input
                  id="physicalQty"
                  type="number"
                  min="0"
                  step="any"
                  value={physicalQty}
                  onChange={(e) => setPhysicalQty(e.target.value)}
                  className="mt-1"
                />
              </div>
              {physicalQty !== '' && !isNaN(parseFloat(physicalQty)) && (
                <div className="rounded-lg bg-muted/50 p-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('reconciliation.difference')}</span>
                    <span className={`font-bold ${
                      parseFloat(physicalQty) - Number(verifyProduct.stock) === 0
                        ? 'text-emerald-600'
                        : parseFloat(physicalQty) - Number(verifyProduct.stock) > 0
                        ? 'text-blue-600'
                        : 'text-rose-600'
                    }`}>
                      {(() => {
                        const d = parseFloat(physicalQty) - Number(verifyProduct.stock);
                        return d > 0 ? `+${d}` : String(d);
                      })()}
                      {' '}
                      ({(() => {
                        const d = parseFloat(physicalQty) - Number(verifyProduct.stock);
                        if (d === 0) return t('reconciliation.match');
                        if (d > 0) return t('reconciliation.surplus');
                        return t('reconciliation.shortage');
                      })()})
                    </span>
                  </div>
                </div>
              )}
              {physicalQty !== '' && !isNaN(parseFloat(physicalQty)) && parseFloat(physicalQty) - Number(verifyProduct.stock) !== 0 && (
                <>
                  <div>
                    <Label htmlFor="reason">{t('reconciliation.reason')} *</Label>
                    <Select value={reason} onValueChange={setReason}>
                      <SelectTrigger id="reason" className="mt-1">
                        <SelectValue placeholder={t('reconciliation.reason')} />
                      </SelectTrigger>
                      <SelectContent>
                        {REASON_OPTIONS.map((r) => (
                          <SelectItem key={r} value={r}>{t(`reconciliation.${r}`)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {reason === 'other' && (
                    <div>
                      <Label htmlFor="reasonDetails">{t('reconciliation.reasonDetails')}</Label>
                      <Textarea
                        id="reasonDetails"
                        value={reasonDetails}
                        onChange={(e) => setReasonDetails(e.target.value)}
                        className="mt-1"
                        rows={3}
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setVerifyProduct(null)}>{t('common.cancel')}</Button>
            <Button onClick={handleSaveVerify} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t('reconciliation.verifySave')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History Modal */}
      <Dialog open={!!historyProduct} onOpenChange={(open) => !open && setHistoryProduct(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('reconciliation.history')} - {historyProduct?.name}</DialogTitle>
          </DialogHeader>
          {historyLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : historyRecords.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <History className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>{t('reconciliation.noHistory')}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('common.date')}</TableHead>
                  <TableHead>{t('reconciliation.softwareStock')}</TableHead>
                  <TableHead>{t('reconciliation.physicalStock')}</TableHead>
                  <TableHead>{t('reconciliation.difference')}</TableHead>
                  <TableHead>{t('reconciliation.reason')}</TableHead>
                  <TableHead>{t('reconciliation.checkedBy')}</TableHead>
                  <TableHead>{t('common.status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historyRecords.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm">{r.checked_at ? new Date(r.checked_at).toLocaleString() : '-'}</TableCell>
                    <TableCell>{Number(r.system_quantity)}</TableCell>
                    <TableCell>{Number(r.physical_quantity)}</TableCell>
                    <TableCell className={Number(r.difference) === 0 ? 'text-emerald-600' : Number(r.difference) > 0 ? 'text-blue-600' : 'text-rose-600'}>
                      {Number(r.difference) > 0 ? `+${r.difference}` : String(r.difference)}
                    </TableCell>
                    <TableCell className="text-sm">{r.reason || '-'}</TableCell>
                    <TableCell className="text-sm">{r.checked_by || '-'}</TableCell>
                    <TableCell><StatusBadge status={r.status as ReconciliationStatus} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>

      {/* Barcode Scan Modal */}
      <Dialog open={scanMode} onOpenChange={setScanMode}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('reconciliation.scanBarcode')}</DialogTitle>
            <DialogDescription>{t('reconciliation.searchPlaceholder')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="relative">
              <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                autoFocus
                placeholder={t('pos.scanBarcode')}
                value={scanInput}
                onChange={(e) => setScanInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleBarcodeScan(); }}
                className="pl-9"
              />
            </div>
            <Button onClick={handleBarcodeScan} className="w-full">{t('reconciliation.verifyStock')}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Stock Adjustment Modal */}
      <Dialog open={!!adjustmentProduct} onOpenChange={(open) => !open && setAdjustmentProduct(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              {t('reconciliation.adjustmentConfirm')}
            </DialogTitle>
            <DialogDescription>{adjustmentProduct?.name}</DialogDescription>
          </DialogHeader>
          {adjustmentProduct?.latest_reconciliation && (
            <div className="space-y-3">
              {Number(adjustmentProduct.stock) !== Number(adjustmentProduct.latest_reconciliation.system_quantity) && (
                <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 text-sm text-amber-800 dark:text-amber-200">
                  {t('reconciliation.stockChangedSinceVerification', {
                    original: String(adjustmentProduct.latest_reconciliation.system_quantity),
                    current: String(adjustmentProduct.stock),
                  })}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <Label className="text-muted-foreground">{t('reconciliation.previousQuantity')}</Label>
                  <p className="font-medium text-lg">{Number(adjustmentProduct.stock)} {adjustmentProduct.unit}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">{t('reconciliation.newQuantity')}</Label>
                  <p className="font-medium text-lg">{Number(adjustmentProduct.latest_reconciliation.physical_quantity)} {adjustmentProduct.unit}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">{t('reconciliation.difference')}</Label>
                  <p className="font-medium">
                    {(() => {
                      const d = Number(adjustmentProduct.latest_reconciliation.physical_quantity) - Number(adjustmentProduct.stock);
                      return d > 0 ? `+${d}` : String(d);
                    })()}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">{t('reconciliation.reason')}</Label>
                  <p className="font-medium text-sm">{adjustmentProduct.latest_reconciliation.reason || '-'}</p>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustmentProduct(null)}>{t('common.cancel')}</Button>
            <Button onClick={handleApplyAdjustment} disabled={adjustmentSaving} className="bg-amber-600 hover:bg-amber-700">
              {adjustmentSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t('reconciliation.applyAdjustment')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
