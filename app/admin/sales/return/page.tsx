'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, Printer, RotateCcw, LoaderCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ReturnThermalReceipt, type ReturnReceiptData } from '@/components/return-thermal-receipt';
import type { ReceiptSettings } from '@/components/thermal-receipt';
import { useTranslation } from '@/hooks/use-translation';
import { supabase } from '@/lib/supabase';
import type { Sale, SaleItem } from '@/types';

type ReturnSale = Sale & {
  sale_items: SaleItem[];
};

type PriorReturnItem = {
  original_sale_item_id: string | null;
  product_id: string | null;
  quantity: number;
};

type PriorReturn = {
  total: number;
  refund_amount: number;
  due_adjustment: number | null;
  sale_return_items: PriorReturnItem[];
};

type ReturnPreview = {
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  dueAdjustment: number;
  refund: number;
};

const paymentMethods = ['cash', 'card', 'mobile', 'bank', 'store_credit', 'due_adjustment'] as const;
const returnReasons = ['changed_mind', 'wrong_item', 'damaged', 'quality_issue', 'other'] as const;

const money = (value: number, currency: string): string =>
  `${currency}${Number(value || 0).toFixed(2)}`;

function calculatePreview(
  sale: ReturnSale,
  quantities: Record<string, number>,
  dueRemaining: number,
  refundMethod: string
): ReturnPreview {
  const items = sale.sale_items || [];
  const itemDiscounts = items.reduce(
    (sum, item) => sum + Number(item.discount_amount || item.discount || 0),
    0
  );
  const itemRevenue = items.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const billDiscount = Math.max(Number(sale.discount || 0) - itemDiscounts, 0);
  const taxableBase = Math.max(Number(sale.subtotal || 0) - Number(sale.discount || 0), 0);

  const preview = items.reduce(
    (sum, item) => {
      const quantity = Number(quantities[item.id] || 0);
      if (quantity <= 0 || Number(item.quantity) <= 0) return sum;

      const lineRevenue = Number(item.total || 0) * quantity / Number(item.quantity);
      const itemDiscount = Number(item.discount_amount || item.discount || 0) * quantity / Number(item.quantity);
      const billDiscountPart = itemRevenue > 0 ? billDiscount * lineRevenue / itemRevenue : 0;
      const lineTaxable = Math.max(lineRevenue - billDiscountPart, 0);
      const lineTax = taxableBase > 0 ? Number(sale.tax || 0) * lineTaxable / taxableBase : 0;
      const unitPrice = Number(item.unit_price || item.price || 0);

      return {
        subtotal: sum.subtotal + unitPrice * quantity,
        discount: sum.discount + itemDiscount + billDiscountPart,
        tax: sum.tax + lineTax,
        total: sum.total + lineTaxable + lineTax,
      };
    },
    { subtotal: 0, discount: 0, tax: 0, total: 0 }
  );

  const total = Math.round(preview.total * 100) / 100;
  const dueAdjustment = refundMethod === 'due_adjustment'
    ? total
    : Math.min(total, dueRemaining);

  return {
    subtotal: Math.round(preview.subtotal * 100) / 100,
    discount: Math.round(preview.discount * 100) / 100,
    tax: Math.round(preview.tax * 100) / 100,
    total,
    dueAdjustment,
    refund: Math.max(0, total - dueAdjustment),
  };
}

export default function SalesReturnPage() {
  const { t, locale } = useTranslation();
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [sale, setSale] = useState<ReturnSale | null>(null);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [conditions, setConditions] = useState<Record<string, 'good' | 'damaged'>>({});
  const [refundMethod, setRefundMethod] = useState<(typeof paymentMethods)[number]>('cash');
  const [priorReturns, setPriorReturns] = useState<PriorReturn[]>([]);
  const [receipt, setReceipt] = useState<ReturnReceiptData | null>(null);
  const [receiptSettings, setReceiptSettings] = useState<ReceiptSettings | null>(null);
  const [printRequested, setPrintRequested] = useState(false);
  const [printPortalReady, setPrintPortalReady] = useState(false);
  const requestKey = useRef<string | null>(null);

  useEffect(() => setPrintPortalReady(true), []);

  const errorText = useCallback((message: string): string => {
    const key = `salesReturns.errors.${message}`;
    const translated = t(key);
    return translated === key ? `${t('salesReturns.processFailed')}: ${message}` : translated;
  }, [t]);

  const loadSale = useCallback(async (value: string): Promise<void> => {
    const invoice = value.trim();
    if (!invoice) return;

    setLoading(true);
    setSale(null);
    setPriorReturns([]);
    setQuantities({});

    const { data, error } = await supabase
      .from('sales')
      .select('*, sale_items(*), customers(name, phone, address)')
      .eq('invoice_number', invoice)
      .eq('status', 'completed')
      .maybeSingle();

    if (error) {
      toast.error(`${t('salesReturns.loadFailed')} ${error.message}`);
      setLoading(false);
      return;
    }
    if (!data) {
      toast.error(t('salesReturns.noSale'));
      setLoading(false);
      return;
    }

    const loadedSale = data as unknown as ReturnSale;
    const [returnResult, settingsResult] = await Promise.all([
      supabase
        .from('sale_returns')
        .select('total, refund_amount, due_adjustment, sale_return_items(original_sale_item_id, product_id, quantity)')
        .eq('original_sale_id', loadedSale.id)
        .eq('status', 'completed'),
      loadedSale.store_id
        ? supabase
          .from('settings')
          .select('store_name, store_address, store_phone, store_email, currency_symbol, tax_rate, receipt_footer, domain, trade_license_no, tax_no')
          .eq('store_id', loadedSale.store_id)
          .maybeSingle()
        : Promise.resolve({ data: null, error: { message: 'Missing store ID' } }),
    ]);

    if (returnResult.error || settingsResult.error || !settingsResult.data) {
      const error = returnResult.error || settingsResult.error;
      toast.error(error
        ? `${t('salesReturns.loadFailed')} ${error.message}`
        : t('salesReturns.settingsMissing'));
      setLoading(false);
      return;
    }

    setSale(loadedSale);
    setPriorReturns((returnResult.data || []) as unknown as PriorReturn[]);
    setReceiptSettings(settingsResult.data as ReceiptSettings);
    setReasons(Object.fromEntries(
      loadedSale.sale_items.map((item) => [item.id, 'changed_mind'])
    ));
    setConditions(Object.fromEntries(
      loadedSale.sale_items.map((item) => [item.id, 'good'])
    ));
    setLoading(false);
  }, [t]);

  const returnedQuantities = useMemo(() => {
    const exact = new Map<string, number>();
    const legacy = new Map<string, number>();

    priorReturns.forEach((returned) => {
      returned.sale_return_items.forEach((item) => {
        if (item.original_sale_item_id) {
          exact.set(
            item.original_sale_item_id,
            (exact.get(item.original_sale_item_id) || 0) + Number(item.quantity)
          );
        } else if (item.product_id) {
          legacy.set(
            item.product_id,
            (legacy.get(item.product_id) || 0) + Number(item.quantity)
          );
        }
      });
    });

    const result: Record<string, number> = {};
    const legacyRemaining = new Map(legacy);
    [...(sale?.sale_items || [])]
      .sort((left, right) => left.id.localeCompare(right.id))
      .forEach((item) => {
        const exactQuantity = exact.get(item.id) || 0;
        const legacyQuantity = item.product_id
          ? legacyRemaining.get(item.product_id) || 0
          : 0;
        const legacyAllocation = Math.min(
          Math.max(Number(item.quantity) - exactQuantity, 0),
          legacyQuantity
        );
        result[item.id] = exactQuantity + legacyAllocation;
        if (item.product_id) {
          legacyRemaining.set(item.product_id, legacyQuantity - legacyAllocation);
        }
      });
    return result;
  }, [priorReturns, sale]);

  const outstandingDue = useMemo(() => {
    if (!sale) return 0;
    const dueAlreadyAdjusted = priorReturns.reduce(
      (sum, returned) => sum + Number(returned.due_adjustment ?? returned.total),
      0
    );
    return Math.max(0, Number(sale.due_amount || 0) - dueAlreadyAdjusted);
  }, [priorReturns, sale]);

  const preview = useMemo(
    () => sale ? calculatePreview(sale, quantities, outstandingDue, refundMethod) : null,
    [outstandingDue, quantities, refundMethod, sale]
  );

  const handleProcessReturn = async (): Promise<void> => {
    if (!sale) return;
    const selectedItems = sale.sale_items
      .filter((item) => Number(quantities[item.id] || 0) > 0)
      .map((item) => ({
        sale_item_id: item.id,
        quantity: Number(quantities[item.id]),
        reason: reasons[item.id] || 'other',
        condition: conditions[item.id] || 'good',
      }));

    if (!selectedItems.length) {
      toast.error(t('salesReturns.noReturnableItems'));
      return;
    }

    setProcessing(true);
    requestKey.current ||= crypto.randomUUID();
    const { data, error } = await supabase.rpc('complete_sale_return', {
      p_sale_id: sale.id,
      p_items: selectedItems,
      p_refund_method: refundMethod,
      p_idempotency_key: requestKey.current,
    });

    if (error || !data) {
      toast.error(error ? errorText(error.message) : t('salesReturns.processFailed'));
      setProcessing(false);
      return;
    }

    const result = data as {
      id?: string;
      invoice_number?: string;
    };
    if (!result.id || !sale.store_id) {
      toast.error(t('salesReturns.processFailed'));
      setProcessing(false);
      return;
    }
    requestKey.current = null;

    const [{ data: savedReturn, error: savedReturnError }, { data: settings, error: settingsError }] =
      await Promise.all([
        supabase
          .from('sale_returns')
          .select('*, sale_return_items(*)')
          .eq('id', result.id)
          .single(),
        supabase
          .from('settings')
          .select('store_name, store_address, store_phone, store_email, currency_symbol, tax_rate, receipt_footer, domain, trade_license_no, tax_no')
          .eq('store_id', sale.store_id)
          .maybeSingle(),
      ]);

    toast.success(t('salesReturns.returnCompleted'));
    if (savedReturnError || settingsError || !savedReturn || !settings) {
      toast.error(t('salesReturns.settingsMissing'));
    } else {
      const customer = sale.customers;
      const items = (savedReturn.sale_return_items || []).map((item: {
        id: string;
        product_name: string;
        quantity: number;
        price: number;
        discount: number;
        tax: number;
        total: number;
        condition: string;
        reason: string | null;
      }) => ({
        id: item.id,
        product_name: item.product_name,
        quantity: Number(item.quantity),
        price: Number(item.price),
        discount: Number(item.discount),
        tax: Number(item.tax),
        total: Number(item.total),
        condition: item.condition,
        reason: item.reason,
      }));
      setReceipt({
        id: savedReturn.id,
        invoice_number: savedReturn.invoice_number,
        original_invoice_number: sale.invoice_number,
        customer_name: sale.customer_name_snapshot || customer?.name || t('salesReturns.walkInCustomer'),
        customer_phone: sale.customer_phone_snapshot || customer?.phone || null,
        customer_address: sale.customer_address_snapshot || customer?.address || null,
        return_date: savedReturn.return_date,
        subtotal: Number(savedReturn.subtotal),
        discount: Number(savedReturn.discount),
        tax: Number(savedReturn.tax),
        total: Number(savedReturn.total),
        refund_method: savedReturn.refund_method,
        refund_amount: Number(savedReturn.refund_amount),
        due_adjustment: Number(savedReturn.due_adjustment || 0),
        processed_by_name: savedReturn.processed_by_name,
        items,
      });
      setReceiptSettings(settings as ReceiptSettings);
      setPrintRequested(true);
    }

    await loadSale(sale.invoice_number);
    setProcessing(false);
  };

  useEffect(() => {
    if (!receipt || !receiptSettings || !printPortalReady || !printRequested) return;
    const timer = window.setTimeout(() => {
      window.print();
      setPrintRequested(false);
    }, 50);
    return () => window.clearTimeout(timer);
  }, [printPortalReady, printRequested, receipt, receiptSettings]);

  const currency = sale?.currency_symbol_snapshot || receiptSettings?.currency_symbol || '';
  const totalReturned = priorReturns.reduce((sum, item) => sum + Number(item.total), 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold font-heading">{t('salesReturns.title')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('salesReturns.subtitle')}</p>
      </div>

      <Card className="p-4 sm:p-5">
        <form
          className="flex flex-col sm:flex-row gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void loadSale(invoiceNumber);
          }}
        >
          <Input
            value={invoiceNumber}
            onChange={(event) => setInvoiceNumber(event.target.value)}
            placeholder={t('salesReturns.invoicePlaceholder')}
            aria-label={t('salesReturns.searchInvoice')}
            className="min-w-0 flex-1"
          />
          <Button type="submit" disabled={loading || !invoiceNumber.trim()}>
            {loading
              ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
              : <Search className="mr-2 h-4 w-4" />}
            {t('salesReturns.search')}
          </Button>
        </form>
      </Card>

      {sale && (
        <>
          <Card className="p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">{t('salesReturns.originalInvoice')}: {sale.invoice_number}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t('salesReturns.customer')}: {sale.customer_name_snapshot || sale.customers?.name || t('salesReturns.walkInCustomer')}
                  {(sale.customer_phone_snapshot || sale.customers?.phone)
                    ? ` · ${sale.customer_phone_snapshot || sale.customers?.phone}`
                    : ''}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {new Date(sale.sale_date).toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-US')}
                </p>
              </div>
              <Badge variant="outline">{t('salesReturns.completed')}</Badge>
            </div>
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t pt-4 text-sm">
              <span>{t('salesReturns.totalReturn')}: {money(totalReturned, currency)}</span>
              <span>{t('salesReturns.dueAdjustment')}: {money(outstandingDue, currency)}</span>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="px-4 py-3">{t('salesReturns.product')}</th>
                    <th className="px-3 py-3 text-right">{t('salesReturns.unitPrice')}</th>
                    <th className="px-3 py-3 text-right">{t('salesReturns.sold')}</th>
                    <th className="px-3 py-3 text-right">{t('salesReturns.previouslyReturned')}</th>
                    <th className="px-3 py-3 text-right">{t('salesReturns.returnable')}</th>
                    <th className="px-3 py-3">{t('salesReturns.quantity')}</th>
                    <th className="px-3 py-3">{t('salesReturns.condition')}</th>
                    <th className="px-3 py-3">{t('salesReturns.reason')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {sale.sale_items.map((item) => {
                    const returned = returnedQuantities[item.id] || 0;
                    const returnable = Math.max(Number(item.quantity) - returned, 0);
                    return (
                      <tr key={item.id}>
                        <td className="px-4 py-3 font-medium">{item.product_name}</td>
                        <td className="px-3 py-3 text-right">
                          {money(Number(item.unit_price || item.price), currency)}
                        </td>
                        <td className="px-3 py-3 text-right">{Number(item.quantity)}</td>
                        <td className="px-3 py-3 text-right">{returned}</td>
                        <td className="px-3 py-3 text-right font-medium">{returnable}</td>
                        <td className="px-3 py-3">
                          <Input
                            type="number"
                            min="0"
                            max={returnable}
                            step="any"
                            value={quantities[item.id] || ''}
                            disabled={returnable <= 0}
                            onChange={(event) => {
                              const value = Number(event.target.value);
                              setQuantities((current) => ({
                                ...current,
                                [item.id]: Number.isFinite(value)
                                  ? Math.min(Math.max(value, 0), returnable)
                                  : 0,
                              }));
                            }}
                            aria-label={`${t('salesReturns.quantity')}: ${item.product_name}`}
                            className="w-28"
                          />
                        </td>
                        <td className="px-3 py-3">
                          <select
                            className="h-10 rounded-md border bg-background px-2"
                            value={conditions[item.id] || 'good'}
                            disabled={returnable <= 0}
                            onChange={(event) => setConditions((current) => ({
                              ...current,
                              [item.id]: event.target.value as 'good' | 'damaged',
                            }))}
                            aria-label={`${t('salesReturns.condition')}: ${item.product_name}`}
                          >
                            <option value="good">{t('salesReturns.good')}</option>
                            <option value="damaged">{t('salesReturns.damaged')}</option>
                          </select>
                        </td>
                        <td className="px-3 py-3">
                          <select
                            className="h-10 rounded-md border bg-background px-2"
                            value={reasons[item.id] || 'changed_mind'}
                            disabled={returnable <= 0}
                            onChange={(event) => setReasons((current) => ({
                              ...current,
                              [item.id]: event.target.value,
                            }))}
                            aria-label={`${t('salesReturns.reason')}: ${item.product_name}`}
                          >
                            {returnReasons.map((reason) => (
                              <option key={reason} value={reason}>
                                {t(`salesReturns.reasons.${reason}`)}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {sale.sale_items.every((item) =>
              Number(item.quantity) <= (returnedQuantities[item.id] || 0)
            ) && (
              <p className="p-4 text-sm text-muted-foreground">{t('salesReturns.noReturnableItems')}</p>
            )}
          </Card>

          {preview && (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
              <Card className="p-4 sm:p-5">
                <label className="text-sm font-medium" htmlFor="refund-method">
                  {t('salesReturns.refundMethod')}
                </label>
                <select
                  id="refund-method"
                  className="mt-2 h-10 w-full rounded-md border bg-background px-3"
                  value={refundMethod}
                  onChange={(event) => setRefundMethod(event.target.value as (typeof paymentMethods)[number])}
                >
                  {paymentMethods.map((method) => (
                    <option key={method} value={method}>{t(`salesReturns.methods.${method}`)}</option>
                  ))}
                </select>
                {refundMethod === 'store_credit' && !sale.customer_id && (
                  <p className="mt-2 text-sm text-destructive">
                    {t('salesReturns.errors.return_store_credit_customer')}
                  </p>
                )}
                {refundMethod === 'due_adjustment' && preview && preview.total > outstandingDue && (
                  <p className="mt-2 text-sm text-destructive">
                    {t('salesReturns.errors.return_due_exceeded')}
                  </p>
                )}
              </Card>

              <Card className="space-y-3 p-4 sm:p-5">
                <MoneyRow label={t('salesReturns.returnSubtotal')} value={preview.subtotal} currency={currency} />
                <MoneyRow label={t('salesReturns.discount')} value={-preview.discount} currency={currency} />
                <MoneyRow label={t('salesReturns.taxAdjustment')} value={preview.tax} currency={currency} />
                <div className="border-t pt-3">
                  <MoneyRow label={t('salesReturns.totalReturn')} value={preview.total} currency={currency} strong />
                </div>
                <MoneyRow label={t('salesReturns.dueAdjustment')} value={preview.dueAdjustment} currency={currency} />
                <MoneyRow label={t('salesReturns.refundAmount')} value={preview.refund} currency={currency} strong />
                <Button
                  className="w-full"
                  onClick={() => void handleProcessReturn()}
                  disabled={
                    processing ||
                    preview.total <= 0 ||
                    (refundMethod === 'store_credit' && !sale.customer_id) ||
                    (refundMethod === 'due_adjustment' && preview.total > outstandingDue)
                  }
                >
                  {processing
                    ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                    : <RotateCcw className="mr-2 h-4 w-4" />}
                  {processing ? t('salesReturns.processing') : t('salesReturns.processReturn')}
                </Button>
              </Card>
            </div>
          )}
        </>
      )}

      {receipt && receiptSettings && (
        <Button variant="outline" onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" />
          {t('salesReturns.printReceipt')}
        </Button>
      )}

      {printPortalReady && receipt && receiptSettings && createPortal(
        <ReturnThermalReceipt receipt={receipt} settings={receiptSettings} />,
        document.body
      )}
    </div>
  );
}

function MoneyRow({
  label,
  value,
  currency,
  strong = false,
}: {
  label: string;
  value: number;
  currency: string;
  strong?: boolean;
}) {
  return (
    <div className={`flex justify-between gap-3 text-sm ${strong ? 'font-semibold' : ''}`}>
      <span>{label}</span>
      <span>{money(value, currency)}</span>
    </div>
  );
}
