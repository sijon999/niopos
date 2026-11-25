'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Building2, CalendarDays, Mail, MapPin, Phone, RotateCcw, Users, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { supabase } from '@/lib/supabase';
import type { Supplier } from '@/types';
import { useTranslation } from '@/hooks/use-translation';

type SupplierPurchaseItem = {
  id: string;
  product_id: string | null;
  product_name: string | null;
  quantity: number;
  total: number;
};

type SupplierPurchase = {
  id: string;
  po_number: string | null;
  purchase_date: string;
  total: number;
  paid_amount: number;
  due_amount: number;
  payment_status: string | null;
  status: string;
  purchase_items: SupplierPurchaseItem[] | null;
};

type SupplierPayment = {
  id: string;
  purchase_id: string | null;
  applied_to_previous_due: boolean;
  amount: number;
  payment_date: string;
  payment_method: string | null;
  reference_number: string | null;
  note: string | null;
};

type SupplierReturnItem = {
  id: string;
  product_name: string | null;
  quantity: number;
  total: number;
};

type SupplierReturn = {
  id: string;
  po_number: string;
  original_purchase_id: string | null;
  return_date: string;
  total: number;
  status: string;
  reason: string | null;
  notes: string | null;
  purchase_return_items: SupplierReturnItem[] | null;
};

type ProfileTab = 'overview' | 'purchases' | 'products' | 'dues' | 'payments' | 'returns';

type PageError = { message: string; code?: string };
type SelectedDue = { purchaseId: string | null; invoiceNumber: string; remainingDue: number };

function getLocalDateInputValue() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

async function fetchAllPages<T>(
  loadPage: (from: number, to: number) => Promise<{ data: T[] | null; error: PageError | null }>
): Promise<{ data: T[] | null; error: PageError | null }> {
  const pageSize = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await loadPage(from, from + pageSize - 1);
    if (error) return { data: null, error };
    const page = data || [];
    rows.push(...page);
    if (page.length < pageSize) return { data: rows, error: null };
  }
}

export default function SupplierProfilePage() {
  const params = useParams();
  const router = useRouter();
  const supplierId = params.id as string;
  const { t, locale } = useTranslation();
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [purchases, setPurchases] = useState<SupplierPurchase[]>([]);
  const [payments, setPayments] = useState<SupplierPayment[]>([]);
  const [returns, setReturns] = useState<SupplierReturn[]>([]);
  const [activeTab, setActiveTab] = useState<ProfileTab>('overview');
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [selectedDue, setSelectedDue] = useState<SelectedDue | null>(null);
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    method: 'cash',
    date: getLocalDateInputValue(),
    reference: '',
    note: '',
  });
  const [processingPayment, setProcessingPayment] = useState(false);
  const [paymentRetryRequired, setPaymentRetryRequired] = useState(false);
  const paymentIdempotencyKey = useRef<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setNotFound(false);
    setLoadError(null);
    const [supplierResult, purchasesResult, paymentsResult, returnsResult] = await Promise.all([
      supabase.from('suppliers').select('*').eq('id', supplierId).single(),
      fetchAllPages<SupplierPurchase>(async (from, to) => {
        const { data, error } = await supabase
          .from('purchases')
          .select('id, po_number, purchase_date, total, paid_amount, due_amount, payment_status, status, purchase_items(id, product_id, product_name, quantity, total)')
          .eq('supplier_id', supplierId)
          .order('purchase_date', { ascending: false })
          .order('id', { ascending: true })
          .range(from, to);
        return { data: data as unknown as SupplierPurchase[] | null, error };
      }),
      fetchAllPages<SupplierPayment>(async (from, to) => {
        const { data, error } = await supabase
          .from('supplier_payments')
          .select('id, purchase_id, applied_to_previous_due, amount, payment_date, payment_method, reference_number, note')
          .eq('supplier_id', supplierId)
          .order('payment_date', { ascending: false })
          .order('id', { ascending: true })
          .range(from, to);
        return { data: data as SupplierPayment[] | null, error };
      }),
      fetchAllPages<SupplierReturn>(async (from, to) => {
        const { data, error } = await supabase
          .from('purchase_returns')
          .select('id, po_number, original_purchase_id, return_date, total, status, reason, notes, purchase_return_items(id, product_name, quantity, total)')
          .eq('supplier_id', supplierId)
          .order('return_date', { ascending: false })
          .order('id', { ascending: true })
          .range(from, to);
        return { data: data as unknown as SupplierReturn[] | null, error };
      }),
    ]);

    if (supplierResult.error) {
      if (supplierResult.error.code === 'PGRST116') {
        setNotFound(true);
      } else {
        console.error('Could not load supplier profile', supplierResult.error);
        setLoadError(supplierResult.error.message);
      }
      setLoading(false);
      return;
    }

    const transactionError = purchasesResult.error || paymentsResult.error || returnsResult.error;
    if (transactionError) {
      console.error('Could not load supplier transactions', transactionError);
      setLoadError(transactionError.message);
      setLoading(false);
      return;
    }

    setSupplier(supplierResult.data as Supplier);
    setPurchases(purchasesResult.data || []);
    setPayments(paymentsResult.data || []);
    setReturns(returnsResult.data || []);
    setLoading(false);
  }, [supplierId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const money = useCallback((value: number) =>
    `৳${Number(value || 0).toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  [locale]);

  const dateText = useCallback((value: string | null | undefined) => {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(locale === 'bn' ? 'bn-BD' : 'en-US');
  }, [locale]);

  const activePurchases = useMemo(
    () => purchases.filter((purchase) => purchase.status !== 'cancelled'),
    [purchases]
  );
  const duePurchases = useMemo(
    () => activePurchases.filter((purchase) => Number(purchase.due_amount || 0) > 0),
    [activePurchases]
  );
  const completedReturns = useMemo(
    () => returns.filter((returned) => returned.status === 'completed'),
    [returns]
  );
  const completedReturnTotals = useMemo(() => {
    const totals = new Map<string, number>();
    completedReturns.forEach((returned) => {
      if (!returned.original_purchase_id) return;
      totals.set(
        returned.original_purchase_id,
        (totals.get(returned.original_purchase_id) || 0) + Number(returned.total || 0)
      );
    });
    return totals;
  }, [completedReturns]);
  const productHistory = useMemo(() => {
    const products = new Map<string, {
      name: string;
      quantity: number;
      amount: number;
      purchaseIds: Set<string>;
      lastPurchase: string;
    }>();
    activePurchases.forEach((purchase) => (purchase.purchase_items || []).forEach((item) => {
      const key = item.product_id || item.product_name || item.id;
      const current = products.get(key);
      if (current) {
        current.quantity += Number(item.quantity || 0);
        current.amount += Number(item.total || 0);
        current.purchaseIds.add(purchase.id);
        if (purchase.purchase_date > current.lastPurchase) current.lastPurchase = purchase.purchase_date;
      } else {
        products.set(key, {
          name: item.product_name || '—',
          quantity: Number(item.quantity || 0),
          amount: Number(item.total || 0),
          purchaseIds: new Set([purchase.id]),
          lastPurchase: purchase.purchase_date,
        });
      }
    }));
    return Array.from(products.entries())
      .map(([key, product]) => ({ key, ...product }))
      .sort((left, right) => right.lastPurchase.localeCompare(left.lastPurchase));
  }, [activePurchases]);
  const purchaseTotal = activePurchases.reduce((sum, purchase) => sum + Number(purchase.total || 0), 0);
  const purchasePaid = activePurchases.reduce((sum, purchase) => sum + Number(purchase.paid_amount || 0), 0);
  const invoiceDue = activePurchases.reduce((sum, purchase) => sum + Number(purchase.due_amount || 0), 0);
  const returnCredit = activePurchases.reduce((sum, purchase) => {
    const returned = completedReturnTotals.get(purchase.id) || 0;
    const originalDue = Math.max(0, Number(purchase.total || 0) - Number(purchase.paid_amount || 0));
    return sum + Math.max(0, returned - originalDue);
  }, 0);
  const unallocatedPaymentTotal = payments
    .filter((payment) => !payment.purchase_id)
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const previousDuePaid = payments
    .filter((payment) => payment.applied_to_previous_due)
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const totalPaid = purchasePaid + unallocatedPaymentTotal;
  const returnTotal = completedReturns.reduce((sum, returned) => sum + Number(returned.total || 0), 0);
  const previousDueRemaining = Math.max(
    0,
    Number(supplier?.previous_due || 0) - previousDuePaid
  );
  const purchaseDue = invoiceDue + previousDueRemaining;
  const otherUnallocatedPayments = payments
    .filter((payment) => !payment.purchase_id && !payment.applied_to_previous_due)
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const netBalance = purchaseDue - otherUnallocatedPayments - returnCredit;
  const netDue = Math.max(0, purchaseDue - returnCredit);
  const currentOutstanding = Math.max(0, netBalance);
  const supplierCredit = Math.max(0, -netBalance);
  const purchaseInvoiceById = useMemo(
    () => new Map(purchases.map((purchase) => [purchase.id, purchase.po_number || '—'])),
    [purchases]
  );
  const fullAddress = [supplier?.address, supplier?.city, supplier?.country].filter(Boolean).join(', ');
  const paymentMethods = [
    { value: 'cash', label: t('suppliers.profile.cash') },
    { value: 'card', label: t('suppliers.profile.card') },
    { value: 'mobile', label: t('suppliers.profile.mobile') },
    { value: 'bank', label: t('suppliers.profile.bank') },
  ];

  const openDuePayment = (due: SelectedDue) => {
    const retryingSamePayment = paymentIdempotencyKey.current
      && selectedDue?.purchaseId === due.purchaseId;
    if (!retryingSamePayment) {
      paymentIdempotencyKey.current = null;
      setSelectedDue(due);
      setPaymentForm({
        amount: String(due.remainingDue),
        method: 'cash',
        date: getLocalDateInputValue(),
        reference: '',
        note: '',
      });
      setPaymentRetryRequired(false);
    }
    setPaymentOpen(true);
  };

  const collectDuePayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supplier || !selectedDue || processingPayment) return;

    const amount = Number(paymentForm.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > selectedDue.remainingDue) {
      toast.error(`${t('suppliers.profile.invalidPaymentAmount')} ${money(selectedDue.remainingDue)}`);
      return;
    }

    setProcessingPayment(true);
    paymentIdempotencyKey.current ||= crypto.randomUUID();
    try {
      const { data, error } = await supabase.rpc('collect_supplier_due_payment', {
        p_supplier_id: supplier.id,
        p_purchase_id: selectedDue.purchaseId,
        p_amount: amount,
        p_payment_method: paymentForm.method,
        p_payment_date: paymentForm.date,
        p_reference_number: paymentForm.reference.trim() || null,
        p_note: paymentForm.note.trim() || null,
        p_idempotency_key: paymentIdempotencyKey.current,
      });
      if (error) throw error;
      if (!data) throw new Error('Payment could not be recorded');

      paymentIdempotencyKey.current = null;
      setPaymentRetryRequired(false);
      setPaymentOpen(false);
      setSelectedDue(null);
      toast.success(t('suppliers.profile.paymentSuccess'));
      await loadData();
    } catch (error) {
      setPaymentRetryRequired(true);
      console.error('Could not record supplier due payment', error);
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`${t('suppliers.profile.paymentFailed')}: ${message}`);
    } finally {
      setProcessingPayment(false);
    }
  };

  const cancelDuePayment = () => {
    const refreshBalances = Boolean(paymentIdempotencyKey.current);
    paymentIdempotencyKey.current = null;
    setPaymentRetryRequired(false);
    setPaymentOpen(false);
    setSelectedDue(null);
    if (refreshBalances) void loadData();
  };

  const profileTabs: Array<{ id: ProfileTab; label: string }> = [
    { id: 'overview', label: t('suppliers.profile.overview') },
    { id: 'purchases', label: t('suppliers.profile.purchaseHistory') },
    { id: 'products', label: t('suppliers.profile.productHistory') },
    { id: 'dues', label: t('suppliers.profile.dueManagement') },
    { id: 'payments', label: t('suppliers.profile.paymentHistory') },
    { id: 'returns', label: t('suppliers.profile.returns') },
  ];

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-muted-foreground">{t('suppliers.profile.loading')}</div>;
  }

  if (notFound) {
    return (
      <div className="space-y-4 py-16 text-center">
        <p className="text-muted-foreground">{t('suppliers.profile.notFound')}</p>
        <Button onClick={() => router.push('/admin/suppliers')}>{t('suppliers.profile.back')}</Button>
      </div>
    );
  }

  if (loadError || !supplier) {
    return (
      <Card className="space-y-4 p-6 text-center">
        <p className="text-sm text-destructive">{t('suppliers.profile.loadFailed')}{loadError ? `: ${loadError}` : ''}</p>
        <div className="flex justify-center gap-2">
          <Button variant="outline" onClick={() => router.push('/admin/suppliers')}>{t('suppliers.profile.back')}</Button>
          <Button onClick={() => void loadData()}>{t('suppliers.profile.retry')}</Button>
        </div>
      </Card>
    );
  }

  const details = [
    { label: t('suppliers.fatherName'), value: supplier.father_name },
    { label: t('suppliers.nidNumber'), value: supplier.nid_number },
    { label: t('suppliers.dateOfBirth'), value: supplier.date_of_birth ? dateText(supplier.date_of_birth) : null },
    { label: t('suppliers.bankAccount'), value: supplier.bank_account },
    { label: t('suppliers.alternateBankAccount'), value: supplier.alt_bank_account },
    { label: t('suppliers.referralNote'), value: supplier.referral_note },
    { label: t('suppliers.note'), value: supplier.note },
    { label: t('suppliers.imageUrl'), value: supplier.image_url },
  ].filter((detail) => Boolean(detail.value));

  const formatPaymentStatus = (purchase: SupplierPurchase) =>
    purchase.payment_status || (Number(purchase.due_amount || 0) > 0 ? 'due' : 'paid');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" aria-label={t('suppliers.profile.back')} onClick={() => router.push('/admin/suppliers')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <h2 className="break-words text-2xl font-bold font-heading">{supplier.name}</h2>
            <p className="text-sm text-muted-foreground">{t('suppliers.profile.subtitle')}</p>
          </div>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto border-b pb-2" role="tablist" aria-label={t('suppliers.profile.supplierInformation')}>
        {profileTabs.map((tab) => (
          <Button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            variant={activeTab === tab.id ? 'default' : 'ghost'}
            size="sm"
            className="shrink-0"
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-4">
          <Card className="space-y-4 p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-800 to-black text-xl font-bold text-white">
                {supplier.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <h3 className="break-words text-lg font-semibold">{supplier.name}</h3>
                {supplier.company_name && <p className="flex items-center gap-1 text-sm text-muted-foreground"><Building2 className="h-4 w-4" />{supplier.company_name}</p>}
                <Badge variant="secondary" className={`mt-1 capitalize ${supplier.status === 'active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : ''}`}>{t(supplier.status === 'active' ? 'common.active' : 'common.inactive')}</Badge>
              </div>
            </div>
            <Separator />
            <div className="space-y-2 text-sm">
              {supplier.contact_person && <p className="flex items-center gap-2"><Users className="h-4 w-4 text-muted-foreground" />{supplier.contact_person}</p>}
              {supplier.phone && <p className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" />{supplier.phone}</p>}
              {supplier.alt_phone && <p className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" />{supplier.alt_phone}</p>}
              {supplier.email && <p className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" />{supplier.email}</p>}
              {fullAddress && <p className="flex items-center gap-2"><MapPin className="h-4 w-4 text-muted-foreground" />{fullAddress}</p>}
              {!supplier.contact_person && !supplier.phone && !supplier.alt_phone && !supplier.email && !fullAddress && (
                <p className="text-muted-foreground">{t('suppliers.profile.noContact')}</p>
              )}
            </div>
            {(details.length > 0 || supplier.created_at) && <Separator />}
            {(details.length > 0 || supplier.created_at) && (
              <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                {details.map((detail) => (
                  <div key={detail.label} className="min-w-0">
                    <p className="text-xs text-muted-foreground">{detail.label}</p>
                    <p className="break-words font-bold">{detail.value}</p>
                  </div>
                ))}
                {supplier.created_at && (
                  <div>
                    <p className="text-xs text-muted-foreground">{t('suppliers.profile.createdAt')}</p>
                    <p className="flex items-center gap-1 font-bold"><CalendarDays className="h-4 w-4 text-muted-foreground" />{dateText(supplier.created_at)}</p>
                  </div>
                )}
              </div>
            )}
            <Separator />
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-xs text-muted-foreground">{t('suppliers.previousDue')}</p><p className="font-bold">{money(Number(supplier.previous_due || 0))}</p></div>
              <div><p className="text-xs text-muted-foreground">{t('suppliers.balance')}</p><p className="font-bold">{money(netBalance)}</p></div>
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {[
              { label: t('suppliers.profile.purchaseOrders'), value: String(activePurchases.length) },
              { label: t('suppliers.totalPurchases'), value: money(purchaseTotal) },
              { label: t('suppliers.totalPaid'), value: money(totalPaid) },
              { label: t('suppliers.totalDue'), value: money(netDue) },
              { label: t('suppliers.totalReturned'), value: money(returnTotal) },
              { label: t('suppliers.profile.netPurchase'), value: money(Math.max(0, purchaseTotal - returnTotal)) },
              { label: t('suppliers.currentOutstanding'), value: money(currentOutstanding) },
              ...(supplierCredit > 0 ? [{ label: t('suppliers.creditBalance'), value: money(supplierCredit) }] : []),
              { label: t('suppliers.profile.lastPurchase'), value: activePurchases[0] ? dateText(activePurchases[0].purchase_date) : '—' },
            ].map((stat) => (
              <Card key={stat.label} className="p-4">
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                <p className="mt-1 break-words font-bold">{stat.value}</p>
              </Card>
            ))}
          </div>
          <Card className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Wallet className="h-4 w-4 shrink-0" />
            <span>{t('suppliers.profile.balanceNote')}</span>
          </Card>
        </div>
      )}

      {activeTab === 'purchases' && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table className="min-w-[1050px]">
              <TableHeader><TableRow>
                <TableHead>{t('suppliers.profile.purchaseInvoice')}</TableHead>
                <TableHead>{t('suppliers.profile.date')}</TableHead>
                <TableHead>{t('suppliers.profile.items')}</TableHead>
                <TableHead>{t('suppliers.profile.amount')}</TableHead>
                <TableHead>{t('suppliers.profile.paid')}</TableHead>
                <TableHead>{t('suppliers.profile.due')}</TableHead>
                <TableHead>{t('suppliers.profile.paymentStatus')}</TableHead>
                <TableHead>{t('suppliers.profile.status')}</TableHead>
                <TableHead>{t('suppliers.profile.action')}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {purchases.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="py-8 text-center text-muted-foreground">{t('suppliers.profile.noPurchases')}</TableCell></TableRow>
                ) : purchases.map((purchase) => (
                  <TableRow key={purchase.id}>
                    <TableCell className="font-medium">{purchase.po_number || '—'}</TableCell>
                    <TableCell className="whitespace-nowrap">{dateText(purchase.purchase_date)}</TableCell>
                    <TableCell className="max-w-[260px] whitespace-normal">
                      {(purchase.purchase_items || []).map((item) => `${item.product_name || '—'} × ${item.quantity}`).join(', ') || '—'}
                    </TableCell>
                    <TableCell className="font-medium">{money(Number(purchase.total || 0))}</TableCell>
                    <TableCell className="text-emerald-600">{money(Number(purchase.paid_amount || 0))}</TableCell>
                    <TableCell className={Number(purchase.due_amount || 0) > 0 ? 'text-amber-600' : 'text-muted-foreground'}>{money(Number(purchase.due_amount || 0))}</TableCell>
                    <TableCell><Badge variant="outline" className="capitalize">{formatPaymentStatus(purchase)}</Badge></TableCell>
                    <TableCell><Badge variant={purchase.status === 'cancelled' ? 'destructive' : 'secondary'} className="capitalize">{purchase.status}</Badge></TableCell>
                    <TableCell>
                      {purchase.status === 'received' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => window.location.assign(`/admin/purchases?return=${encodeURIComponent(purchase.id)}`)}
                        >
                          <RotateCcw className="mr-1 h-4 w-4" />Return Products
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {activeTab === 'products' && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table className="min-w-[700px]">
              <TableHeader><TableRow>
                <TableHead>{t('suppliers.profile.product')}</TableHead>
                <TableHead>{t('suppliers.profile.quantityPurchased')}</TableHead>
                <TableHead>{t('suppliers.profile.purchaseAmount')}</TableHead>
                <TableHead>{t('suppliers.profile.purchaseOrders')}</TableHead>
                <TableHead>{t('suppliers.profile.lastPurchased')}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {productHistory.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">{t('suppliers.profile.noProducts')}</TableCell></TableRow>
                ) : productHistory.map((product) => (
                  <TableRow key={product.key}>
                    <TableCell className="font-medium">{product.name}</TableCell>
                    <TableCell>{product.quantity}</TableCell>
                    <TableCell>{money(product.amount)}</TableCell>
                    <TableCell>{product.purchaseIds.size}</TableCell>
                    <TableCell className="whitespace-nowrap">{dateText(product.lastPurchase)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {activeTab === 'dues' && (
        <>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <Table className="min-w-[800px]">
                <TableHeader><TableRow>
                  <TableHead>{t('suppliers.profile.purchaseInvoice')}</TableHead>
                  <TableHead>{t('suppliers.profile.date')}</TableHead>
                  <TableHead>{t('suppliers.profile.originalAmount')}</TableHead>
                  <TableHead>{t('suppliers.profile.paid')}</TableHead>
                  <TableHead>{t('suppliers.profile.remainingDue')}</TableHead>
                  <TableHead>{t('suppliers.profile.paymentStatus')}</TableHead>
                  <TableHead>{t('suppliers.profile.action')}</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {previousDueRemaining > 0 && (
                    <TableRow key="previous-due">
                      <TableCell className="font-medium">{t('suppliers.previousDue')}</TableCell>
                      <TableCell>—</TableCell>
                      <TableCell>{money(Number(supplier.previous_due || 0))}</TableCell>
                      <TableCell className="text-emerald-600">{money(previousDuePaid)}</TableCell>
                      <TableCell className="font-semibold text-amber-700">{money(previousDueRemaining)}</TableCell>
                      <TableCell><Badge variant="outline">{t('suppliers.profile.due')}</Badge></TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          onClick={() => openDuePayment({
                            purchaseId: null,
                            invoiceNumber: t('suppliers.previousDue'),
                            remainingDue: previousDueRemaining,
                          })}
                        >
                          <Wallet className="mr-1 h-4 w-4" />{t('suppliers.profile.pay')}
                        </Button>
                      </TableCell>
                    </TableRow>
                  )}
                  {duePurchases.length === 0 && previousDueRemaining === 0 ? (
                    <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">{t('suppliers.profile.noDuePurchases')}</TableCell></TableRow>
                  ) : duePurchases.map((purchase) => (
                    <TableRow key={purchase.id}>
                      <TableCell className="font-medium">{purchase.po_number || '—'}</TableCell>
                      <TableCell className="whitespace-nowrap">{dateText(purchase.purchase_date)}</TableCell>
                      <TableCell>{money(Number(purchase.total || 0))}</TableCell>
                      <TableCell className="text-emerald-600">{money(Number(purchase.paid_amount || 0))}</TableCell>
                      <TableCell className="font-semibold text-amber-700">{money(Number(purchase.due_amount || 0))}</TableCell>
                      <TableCell><Badge variant="outline" className="capitalize">{formatPaymentStatus(purchase)}</Badge></TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          onClick={() => openDuePayment({
                            purchaseId: purchase.id,
                            invoiceNumber: purchase.po_number || '—',
                            remainingDue: Number(purchase.due_amount || 0),
                          })}
                        >
                          <Wallet className="mr-1 h-4 w-4" />{t('suppliers.profile.pay')}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
          <Dialog
            open={paymentOpen}
            onOpenChange={(open) => {
              if (!processingPayment) setPaymentOpen(open);
            }}
          >
            <DialogContent>
              <DialogHeader><DialogTitle>{t('suppliers.profile.paymentDialogTitle')}</DialogTitle></DialogHeader>
              {selectedDue && (
                <form id="supplier-due-payment-form" onSubmit={(event) => void collectDuePayment(event)} className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    {selectedDue.invoiceNumber} · {t('suppliers.profile.remainingDue')}: {money(selectedDue.remainingDue)}
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="supplier-payment-amount">{t('suppliers.profile.amount')}</Label>
                    <Input
                      id="supplier-payment-amount"
                      type="number"
                      min="0.01"
                      max={selectedDue.remainingDue}
                      step="0.01"
                      required
                      value={paymentForm.amount}
                      disabled={processingPayment || paymentRetryRequired}
                      onChange={(event) => setPaymentForm({ ...paymentForm, amount: event.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="supplier-payment-method">{t('suppliers.profile.method')}</Label>
                    <select
                      id="supplier-payment-method"
                      className="h-10 w-full rounded-md border bg-background px-3"
                      value={paymentForm.method}
                      disabled={processingPayment || paymentRetryRequired}
                      onChange={(event) => setPaymentForm({ ...paymentForm, method: event.target.value })}
                    >
                      {paymentMethods.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="supplier-payment-date">{t('suppliers.profile.date')}</Label>
                    <Input
                      id="supplier-payment-date"
                      type="date"
                      required
                      value={paymentForm.date}
                      disabled={processingPayment || paymentRetryRequired}
                      onChange={(event) => setPaymentForm({ ...paymentForm, date: event.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="supplier-payment-reference">{t('suppliers.profile.referenceNumber')}</Label>
                    <Input
                      id="supplier-payment-reference"
                      maxLength={120}
                      value={paymentForm.reference}
                      disabled={processingPayment || paymentRetryRequired}
                      onChange={(event) => setPaymentForm({ ...paymentForm, reference: event.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="supplier-payment-note">{t('suppliers.profile.notes')}</Label>
                    <Input
                      id="supplier-payment-note"
                      maxLength={1000}
                      value={paymentForm.note}
                      disabled={processingPayment || paymentRetryRequired}
                      onChange={(event) => setPaymentForm({ ...paymentForm, note: event.target.value })}
                    />
                  </div>
                </form>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={cancelDuePayment} disabled={processingPayment}>
                  {t('suppliers.profile.cancel')}
                </Button>
                <Button type="submit" form="supplier-due-payment-form" disabled={processingPayment}>
                  {processingPayment ? t('suppliers.profile.processingPayment') : t('suppliers.profile.confirmPayment')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}

      {activeTab === 'payments' && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table className="min-w-[650px]">
              <TableHeader><TableRow>
                <TableHead>{t('suppliers.profile.date')}</TableHead>
                <TableHead>{t('suppliers.profile.purchaseInvoice')}</TableHead>
                <TableHead>{t('suppliers.profile.amount')}</TableHead>
                <TableHead>{t('suppliers.profile.method')}</TableHead>
                <TableHead>{t('suppliers.profile.reference')}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {payments.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">{t('suppliers.profile.noPayments')}</TableCell></TableRow>
                ) : payments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell className="whitespace-nowrap">{dateText(payment.payment_date)}</TableCell>
                    <TableCell>
                      {payment.purchase_id
                        ? purchaseInvoiceById.get(payment.purchase_id) || '—'
                        : payment.applied_to_previous_due ? t('suppliers.previousDue') : '—'}
                    </TableCell>
                    <TableCell className="font-medium text-emerald-600">{money(Number(payment.amount || 0))}</TableCell>
                    <TableCell className="capitalize">{payment.payment_method || '—'}</TableCell>
                    <TableCell className="max-w-[320px] whitespace-normal">{[payment.reference_number, payment.note].filter(Boolean).join(' · ') || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {activeTab === 'returns' && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table className="min-w-[800px]">
              <TableHeader><TableRow>
                <TableHead>{t('suppliers.profile.returnInvoice')}</TableHead>
                <TableHead>{t('suppliers.profile.originalInvoice')}</TableHead>
                <TableHead>{t('suppliers.profile.date')}</TableHead>
                <TableHead>{t('suppliers.profile.items')}</TableHead>
                <TableHead>{t('suppliers.profile.amount')}</TableHead>
                <TableHead>{t('suppliers.profile.reason')}</TableHead>
                <TableHead>{t('suppliers.profile.status')}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {returns.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">{t('suppliers.profile.noReturns')}</TableCell></TableRow>
                ) : returns.map((returned) => (
                  <TableRow key={returned.id}>
                    <TableCell className="font-medium">{returned.po_number || '—'}</TableCell>
                    <TableCell>{returned.original_purchase_id ? purchaseInvoiceById.get(returned.original_purchase_id) || '—' : '—'}</TableCell>
                    <TableCell className="whitespace-nowrap">{dateText(returned.return_date)}</TableCell>
                    <TableCell className="max-w-[280px] whitespace-normal">
                      {(returned.purchase_return_items || []).map((item) => `${item.product_name || '—'} × ${item.quantity}`).join(', ') || '—'}
                    </TableCell>
                    <TableCell className="font-medium">{money(Number(returned.total || 0))}</TableCell>
                    <TableCell className="max-w-[220px] whitespace-normal">{returned.reason || returned.notes || '—'}</TableCell>
                    <TableCell><Badge variant={returned.status === 'completed' ? 'default' : 'secondary'} className="capitalize">{returned.status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}
