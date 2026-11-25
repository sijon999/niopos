'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useTranslation } from '@/hooks/use-translation';
import { supabase } from '@/lib/supabase';

type PurchaseReturnHistoryRecord = {
  id: string;
  po_number: string;
  return_date: string | null;
  total: number;
  status: string;
  suppliers: { name: string } | null;
  purchases: { po_number: string | null } | null;
  purchase_return_items: Array<{
    id: string;
    product_name: string | null;
    quantity: number;
  }> | null;
};

const PAGE_SIZE = 25;

export default function PurchaseReturnHistoryPage() {
  const { t, locale } = useTranslation();
  const [rows, setRows] = useState<PurchaseReturnHistoryRecord[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const loadReturns = useCallback(async () => {
    setLoading(true);
    const from = (page - 1) * PAGE_SIZE;
    const { data, error, count } = await supabase
      .from('purchase_returns')
      .select('id, po_number, original_purchase_id, return_date, total, status, suppliers(name), purchases(po_number), purchase_return_items(id, product_name, quantity)', { count: 'exact' })
      .order('return_date', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error('[PurchaseReturns] Failed to load return history:', error);
      toast.error(`${t('purchaseReturnHistory.loadFailed')}: ${error.message}`);
      setRows([]);
      setTotalCount(0);
      setLoading(false);
      return;
    }

    setRows((data || []) as unknown as PurchaseReturnHistoryRecord[]);
    setTotalCount(count || 0);
    setLoading(false);
  }, [page, t]);

  useEffect(() => {
    void loadReturns();
  }, [loadReturns]);

  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const money = (value: number) =>
    `৳${Number(value || 0).toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const dateText = (value: string | null) =>
    value ? new Date(value).toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-US') : '—';

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-primary/10 p-3 text-primary"><RotateCcw className="h-5 w-5" /></div>
        <div>
          <h1 className="text-2xl font-bold font-heading">{t('purchaseReturnHistory.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('purchaseReturnHistory.subtitle')}</p>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table className="min-w-[900px]">
            <TableHeader>
              <TableRow>
                <TableHead>{t('purchaseReturnHistory.returnInvoice')}</TableHead>
                <TableHead>{t('purchaseReturnHistory.originalInvoice')}</TableHead>
                <TableHead>{t('purchaseReturnHistory.supplier')}</TableHead>
                <TableHead>{t('purchaseReturnHistory.date')}</TableHead>
                <TableHead>{t('purchaseReturnHistory.items')}</TableHead>
                <TableHead className="text-right">{t('purchaseReturnHistory.total')}</TableHead>
                <TableHead>{t('purchaseReturnHistory.status')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((returned) => (
                <TableRow key={returned.id}>
                  <TableCell className="font-medium">{returned.po_number}</TableCell>
                  <TableCell>{returned.purchases?.po_number || '—'}</TableCell>
                  <TableCell>{returned.suppliers?.name || '—'}</TableCell>
                  <TableCell className="whitespace-nowrap">{dateText(returned.return_date)}</TableCell>
                  <TableCell className="max-w-[280px] whitespace-normal">
                    {(returned.purchase_return_items || [])
                      .map((item) => `${item.product_name || '—'} × ${item.quantity}`)
                      .join(', ') || '—'}
                  </TableCell>
                  <TableCell className="text-right font-medium">{money(Number(returned.total))}</TableCell>
                  <TableCell>
                    <Badge variant={returned.status === 'completed' ? 'default' : 'secondary'} className="capitalize">
                      {returned.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && rows.length === 0 && (
                <TableRow><TableCell colSpan={7} className="py-12 text-center text-muted-foreground">{t('purchaseReturnHistory.noReturns')}</TableCell></TableRow>
              )}
              {loading && (
                <TableRow><TableCell colSpan={7} className="py-12 text-center text-muted-foreground">{t('common.loading')}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t p-4">
          <p className="text-sm text-muted-foreground">
            {t('purchaseReturnHistory.page')} {page} {t('purchaseReturnHistory.of')} {pageCount} · {totalCount}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => setPage((current) => current - 1)}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />{t('purchaseReturnHistory.previous')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pageCount || loading}
              onClick={() => setPage((current) => current + 1)}
            >
              {t('purchaseReturnHistory.next')}<ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
