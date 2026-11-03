'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronLeft, ChevronRight, Printer, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { ReturnThermalReceipt, type ReturnReceiptData } from '@/components/return-thermal-receipt';
import type { ReceiptSettings } from '@/components/thermal-receipt';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useTranslation } from '@/hooks/use-translation';
import { supabase } from '@/lib/supabase';

type ReturnHistoryRecord = ReturnReceiptData & {
  store_id: string;
  original_sale_id: string;
  customer_id: string | null;
  status: string;
  processed_by_name: string | null;
  due_adjustment: number;
};

type ReturnHistoryResponse = {
  rows: ReturnHistoryRecord[];
  total_count: number;
};

type Breakdown = {
  product_id?: string | null;
  product_name?: string;
  quantity?: number;
  customer_name?: string;
  return_day?: string;
  return_month?: string;
  total_return: number;
  total_refund?: number;
  profit_reversal?: number;
  return_count: number;
};

type ReturnReport = {
  currency_symbol: string | null;
  return_count: number;
  total_return: number;
  total_refund: number;
  total_due_adjustment: number;
  profit_reversal: number;
  daily: Breakdown[];
  monthly: Breakdown[];
  products: Breakdown[];
  customers: Breakdown[];
};

const PAGE_SIZE = 20;

function dateBoundary(value: string, end: boolean): string | null {
  if (!value) return null;
  return new Date(`${value}T${end ? '23:59:59.999' : '00:00:00.000'}`).toISOString();
}

function formatDate(value: string, locale: 'en' | 'bn'): string {
  return new Date(value).toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatMoney(value: number, currency: string): string {
  return `${currency}${Number(value || 0).toFixed(2)}`;
}

const EMPTY_REPORT: ReturnReport = {
  currency_symbol: null,
  return_count: 0,
  total_return: 0,
  total_refund: 0,
  total_due_adjustment: 0,
  profit_reversal: 0,
  daily: [],
  monthly: [],
  products: [],
  customers: [],
};

export default function ReturnHistoryPage() {
  const { t, locale } = useTranslation();
  const [rows, setRows] = useState<ReturnHistoryRecord[]>([]);
  const [report, setReport] = useState<ReturnReport>(EMPTY_REPORT);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [status, setStatus] = useState('all');
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  const [receipt, setReceipt] = useState<ReturnReceiptData | null>(null);
  const [receiptSettings, setReceiptSettings] = useState<ReceiptSettings | null>(null);
  const [currencySymbol, setCurrencySymbol] = useState('');
  const [printPortalReady, setPrintPortalReady] = useState(false);

  useEffect(() => setPrintPortalReady(true), []);

  const loadData = useCallback(async (): Promise<void> => {
    setLoading(true);
    const [historyResult, reportResult] = await Promise.all([
      supabase.rpc('get_sale_return_history', {
        p_search: search || null,
        p_date_from: dateBoundary(dateFrom, false),
        p_date_to: dateBoundary(dateTo, true),
        p_status: status,
        p_limit: PAGE_SIZE,
        p_offset: (page - 1) * PAGE_SIZE,
      }),
      supabase.rpc('get_sales_return_report', {
        p_date_from: dateBoundary(dateFrom, false),
        p_date_to: dateBoundary(dateTo, true),
        p_time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      }),
    ]);

    if (historyResult.error) {
      toast.error(`${t('salesReturns.historyLoadFailed')} ${historyResult.error.message}`);
      setRows([]);
      setTotalCount(0);
      setLoading(false);
      return;
    }
    if (reportResult.error) {
      toast.error(`${t('salesReturns.reportLoadFailed')} ${reportResult.error.message}`);
      setReport(EMPTY_REPORT);
      setLoading(false);
      return;
    }

    const history = historyResult.data as unknown as ReturnHistoryResponse;
    if (!history || !Array.isArray(history.rows) || typeof history.total_count !== 'number') {
      toast.error(t('salesReturns.historyLoadFailed'));
      setRows([]);
      setTotalCount(0);
    } else {
      setRows(history.rows);
      setTotalCount(history.total_count);
      const storeId = history.rows[0]?.store_id;
      if (storeId && !currencySymbol) {
        const { data: settings, error: settingsError } = await supabase
          .from('settings')
          .select('currency_symbol')
          .eq('store_id', storeId)
          .maybeSingle();
        if (settingsError) {
          toast.error(`${t('salesReturns.settingsMissing')} ${settingsError.message}`);
        } else {
          setCurrencySymbol(settings?.currency_symbol || '');
        }
      }
    }
    const reportData = (reportResult.data as unknown as ReturnReport) || EMPTY_REPORT;
    setReport(reportData);
    setCurrencySymbol(reportData.currency_symbol || '');
    setLoading(false);
  }, [currencySymbol, dateFrom, dateTo, page, search, status, t]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currency = currencySymbol || receiptSettings?.currency_symbol || '';

  const printReturn = async (item: ReturnHistoryRecord): Promise<void> => {
    if (!item.store_id) {
      toast.error(t('salesReturns.settingsMissing'));
      return;
    }
    setPrinting(true);
    const { data, error } = await supabase
      .from('settings')
      .select('store_name, store_address, store_phone, store_email, currency_symbol, tax_rate, receipt_footer, domain, trade_license_no, tax_no')
      .eq('store_id', item.store_id)
      .maybeSingle();
    if (error || !data) {
      toast.error(t('salesReturns.settingsMissing'));
      setPrinting(false);
      return;
    }
    setReceipt(item);
    setReceiptSettings(data as ReceiptSettings);
    setCurrencySymbol(data.currency_symbol || '');
    setPrinting(false);
  };

  useEffect(() => {
    if (!receipt || !receiptSettings || !printPortalReady) return;
    const timer = window.setTimeout(() => window.print(), 50);
    return () => window.clearTimeout(timer);
  }, [printPortalReady, receipt, receiptSettings]);

  const summaryCards = useMemo(() => [
    { label: t('salesReturns.returnCount'), value: String(report.return_count) },
    { label: t('salesReturns.totalReturn'), value: formatMoney(report.total_return, currency) },
    { label: t('salesReturns.totalRefund'), value: formatMoney(report.total_refund, currency) },
    { label: t('salesReturns.totalDueAdjustment'), value: formatMoney(report.total_due_adjustment, currency) },
    { label: t('salesReturns.profitReversal'), value: formatMoney(report.profit_reversal, currency) },
  ], [currency, report, t]);

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-primary/10 p-3 text-primary"><RotateCcw className="h-5 w-5" /></div>
        <div>
          <h1 className="text-2xl font-bold font-heading">{t('salesReturns.historyTitle')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('salesReturns.subtitle')}</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <Card className="p-4" key={card.label}>
            <p className="text-sm text-muted-foreground">{card.label}</p>
            <p className="mt-2 text-xl font-semibold">{card.value}</p>
          </Card>
        ))}
      </div>

      <Card className="p-4">
        <form
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_170px_170px_170px_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            setSearch(searchInput.trim());
          }}
        >
          <Input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder={t('salesReturns.searchReturns')}
            aria-label={t('salesReturns.searchReturns')}
          />
          <label className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <Input type="date" value={dateFrom} aria-label={t('salesReturns.dateFrom')} onChange={(event) => {
              setPage(1);
              setDateFrom(event.target.value);
            }} />
          </label>
          <label className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <Input type="date" value={dateTo} aria-label={t('salesReturns.dateTo')} onChange={(event) => {
              setPage(1);
              setDateTo(event.target.value);
            }} />
          </label>
          <select
            value={status}
            onChange={(event) => {
              setPage(1);
              setStatus(event.target.value);
            }}
            className="h-10 rounded-md border bg-background px-3 text-sm"
            aria-label={t('salesReturns.status')}
          >
            <option value="all">{t('salesReturns.allStatuses')}</option>
            <option value="completed">{t('salesReturns.completed')}</option>
            <option value="cancelled">{t('salesReturns.cancelled')}</option>
          </select>
          <Button type="submit">{t('salesReturns.search')}</Button>
        </form>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[950px] text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-4 py-3">{t('salesReturns.returnInvoice')}</th>
                <th className="px-3 py-3">{t('salesReturns.originalInvoice')}</th>
                <th className="px-3 py-3">{t('salesReturns.customer')}</th>
                <th className="px-3 py-3">{t('salesReturns.date')}</th>
                <th className="px-3 py-3 text-right">{t('salesReturns.totalReturn')}</th>
                <th className="px-3 py-3">{t('salesReturns.refundMethod')}</th>
                <th className="px-3 py-3">{t('salesReturns.processedBy')}</th>
                <th className="px-3 py-3">{t('salesReturns.status')}</th>
                <th className="px-3 py-3">{t('salesReturns.printReceipt')}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3 font-medium">{item.invoice_number}</td>
                  <td className="px-3 py-3">{item.original_invoice_number || '—'}</td>
                  <td className="px-3 py-3">{item.customer_name || t('salesReturns.walkInCustomer')}</td>
                  <td className="px-3 py-3 whitespace-nowrap">{formatDate(item.return_date, locale)}</td>
                  <td className="px-3 py-3 text-right font-semibold">{formatMoney(item.total, currency)}</td>
                  <td className="px-3 py-3">
                    {item.refund_method ? t(`salesReturns.methods.${item.refund_method}`) : '—'}
                  </td>
                  <td className="px-3 py-3">{item.processed_by_name || '—'}</td>
                  <td className="px-3 py-3">
                    <Badge variant={item.status === 'completed' ? 'default' : 'secondary'}>
                      {t(`salesReturns.${item.status}`)}
                    </Badge>
                  </td>
                  <td className="px-3 py-3">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={printing}
                      onClick={() => void printReturn(item)}
                      aria-label={`${t('salesReturns.printReceipt')} ${item.invoice_number}`}
                    >
                      <Printer className="mr-2 h-4 w-4" />
                      {t('salesReturns.printReceipt')}
                    </Button>
                  </td>
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
                    {t('salesReturns.noReturns')}
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
                    {t('common.loading')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t p-4">
          <p className="text-sm text-muted-foreground">
            {t('salesReturns.page')} {page} {t('salesReturns.of')} {pageCount} · {totalCount}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => setPage((current) => current - 1)}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />{t('salesReturns.previous')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pageCount || loading}
              onClick={() => setPage((current) => current + 1)}
            >
              {t('salesReturns.next')}<ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <BreakdownCard
          title={t('salesReturns.productReport')}
          rows={report.products}
          nameKey="product_name"
          nameLabel={t('salesReturns.product')}
          valueLabel={t('salesReturns.totalReturn')}
          currency={currency}
          t={t}
        />
        <BreakdownCard
          title={t('salesReturns.customerReport')}
          rows={report.customers}
          nameKey="customer_name"
          nameLabel={t('salesReturns.customer')}
          valueLabel={t('salesReturns.totalReturn')}
          currency={currency}
          t={t}
        />
        <BreakdownCard
          title={t('salesReturns.dailyReport')}
          rows={report.daily}
          nameKey="return_day"
          nameLabel={t('salesReturns.date')}
          valueLabel={t('salesReturns.totalReturn')}
          currency={currency}
          t={t}
        />
        <BreakdownCard
          title={t('salesReturns.monthlyReport')}
          rows={report.monthly}
          nameKey="return_month"
          nameLabel={t('salesReturns.date')}
          valueLabel={t('salesReturns.totalReturn')}
          currency={currency}
          t={t}
        />
      </div>

      {printPortalReady && receipt && receiptSettings && createPortal(
        <ReturnThermalReceipt receipt={receipt} settings={receiptSettings} />,
        document.body
      )}
    </div>
  );
}

function BreakdownCard({
  title,
  rows,
  nameKey,
  nameLabel,
  valueLabel,
  currency,
  t,
}: {
  title: string;
  rows: Breakdown[];
  nameKey: 'product_name' | 'customer_name' | 'return_day' | 'return_month';
  nameLabel: string;
  valueLabel: string;
  currency: string;
  t: (key: string) => string;
}) {
  return (
    <Card className="overflow-hidden">
      <h2 className="border-b px-4 py-3 font-semibold">{title}</h2>
      {rows.length ? (
        <div className="max-h-72 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-2">{nameLabel}</th>
                <th className="px-3 py-2 text-right">{t('salesReturns.quantity')}</th>
                <th className="px-3 py-2 text-right">{valueLabel}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row, index) => (
                <tr key={`${row[nameKey] || 'row'}-${index}`}>
                  <td className="px-4 py-2">{row[nameKey] || t('salesReturns.walkInCustomer')}</td>
                  <td className="px-3 py-2 text-right">
                    {row.quantity ?? row.return_count}
                  </td>
                  <td className="px-3 py-2 text-right font-medium">
                    {formatMoney(row.total_return, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">{t('salesReturns.noReturns')}</p>
      )}
    </Card>
  );
}
