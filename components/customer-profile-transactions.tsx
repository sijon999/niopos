'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Printer, RotateCcw, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { useConfirmation } from '@/hooks/use-confirmation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { supabase } from '@/lib/supabase';

export type CustomerFinancialSummary = {
  totalOrders: number;
  totalPurchase: number;
  totalPaid: number;
  totalDue: number;
  totalReturned: number;
  totalRefunded: number;
  netPurchase: number;
  lastPurchase: string | null;
};

type SaleItem = {
  id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  price: number;
  unit_price: number | null;
  total: number;
  discount: number;
  discount_amount: number | null;
};

type Sale = {
  id: string;
  invoice_number: string;
  sale_date: string;
  total: number;
  paid: number;
  due_amount: number;
  payment_status: string;
  status: string;
  cashier: string | null;
  sale_items: SaleItem[];
};

type CustomerPayment = {
  id: string;
  sale_id: string | null;
  amount: number;
  payment_date: string;
  payment_method: string;
  reference_number: string | null;
  note: string | null;
};

type ReturnItem = {
  id: string;
  product_name: string;
  quantity: number;
  total: number;
  condition: 'good' | 'damaged';
  reason: string | null;
};

type SaleReturn = {
  id: string;
  invoice_number: string;
  original_sale_id: string;
  return_date: string;
  total: number;
  refund_method: string;
  refund_amount: number;
  due_adjustment: number | null;
  processed_by_name: string | null;
  status: string;
  reason: string | null;
  sale_return_items: ReturnItem[];
};

type PaymentReceipt = {
  id: string;
  invoiceNumber: string;
  amount: number;
  date: string;
  method: string;
  reference: string;
  remainingDue: number;
  note: string;
};

type ProfileTab = 'overview' | 'purchase' | 'products' | 'dues' | 'payments' | 'returns' | 'discount';

const today = new Date().toISOString().slice(0, 10);
const paymentMethods = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'mobile', label: 'Mobile Banking' },
  { value: 'bank', label: 'Bank Transfer' },
] as const;

const money = (value: number): string =>
  `৳${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const dateText = (value: string | null | undefined): string =>
  value ? new Date(value).toLocaleDateString() : '-';

function printableText(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] || character);
}

function printReceipt(title: string, rows: Array<[string, string]>, items: string[] = []): void {
  const printWindow = window.open('', '_blank', 'width=520,height=720');
  if (!printWindow) {
    toast.error('Allow pop-ups to print the receipt');
    return;
  }
  const receiptRows = rows.map(([label, value]) =>
    `<p><strong>${printableText(label)}:</strong> ${printableText(value)}</p>`
  ).join('');
  const receiptItems = items.map((item) => `<li>${printableText(item)}</li>`).join('');
  printWindow.document.write(
    `<!doctype html><html><head><title>${printableText(title)}</title>` +
    '<meta charset="utf-8"><style>body{font:14px Arial,sans-serif;max-width:420px;margin:24px auto;color:#111}h1{text-align:center;font-size:20px}p{margin:8px 0}hr{border:0;border-top:1px dashed #555}li{margin:6px 0}@media print{body{margin:0 auto}}</style></head>' +
    `<body><h1>${printableText(title)}</h1><hr>${receiptRows}${receiptItems ? `<hr><ul>${receiptItems}</ul>` : ''}</body></html>`
  );
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

export function CustomerProfileTransactions({
  customerId,
  activeTab,
  onSummary,
  onRefreshCustomer,
}: {
  customerId: string;
  activeTab: ProfileTab;
  onSummary: (summary: CustomerFinancialSummary) => void;
  onRefreshCustomer: () => Promise<void>;
}) {
  const [sales, setSales] = useState<Sale[]>([]);
  const [payments, setPayments] = useState<CustomerPayment[]>([]);
  const [returns, setReturns] = useState<SaleReturn[]>([]);
  const [loading, setLoading] = useState(true);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    method: 'cash',
    date: today,
    reference: '',
    note: '',
  });
  const [processingPayment, setProcessingPayment] = useState(false);
  const [selectedReturn, setSelectedReturn] = useState<SaleReturn | null>(null);
  const [paymentReceipt, setPaymentReceipt] = useState<PaymentReceipt | null>(null);
  const { confirmAction, dialog: confirmationDialog } = useConfirmation();
  const idempotencyKey = useRef<string | null>(null);

  const loadTransactions = useCallback(async () => {
    setLoading(true);
    const [salesResult, paymentsResult, returnsResult, customerResult] = await Promise.all([
      supabase
        .from('sales')
        .select('id, invoice_number, sale_date, total, paid, due_amount, payment_status, status, cashier, sale_items(id, product_id, product_name, quantity, price, unit_price, total, discount, discount_amount)')
        .eq('customer_id', customerId)
        .eq('status', 'completed')
        .order('sale_date', { ascending: false }),
      supabase
        .from('customer_payments')
        .select('id, sale_id, amount, payment_date, payment_method, reference_number, note')
        .eq('customer_id', customerId)
        .order('payment_date', { ascending: false }),
      supabase
        .from('sale_returns')
        .select('id, invoice_number, original_sale_id, return_date, total, refund_method, refund_amount, due_adjustment, processed_by_name, status, reason, sale_return_items(id, product_name, quantity, total, condition, reason)')
        .eq('customer_id', customerId)
        .eq('status', 'completed')
        .order('return_date', { ascending: false }),
      supabase
        .from('customers')
        .select('previous_due')
        .eq('id', customerId)
        .single(),
    ]);

    const error = salesResult.error || paymentsResult.error || returnsResult.error || customerResult.error;
    if (error) {
      toast.error(`Could not load customer transactions: ${error.message}`);
      setLoading(false);
      return;
    }

    const loadedSales = (salesResult.data || []) as unknown as Sale[];
    const loadedPayments = (paymentsResult.data || []) as unknown as CustomerPayment[];
    const loadedReturns = (returnsResult.data || []) as unknown as SaleReturn[];
    setSales(loadedSales);
    setPayments(loadedPayments);
    setReturns(loadedReturns);

    const totalPurchase = loadedSales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
    const totalPaid = loadedSales.reduce((sum, sale) => sum + Number(sale.paid || 0), 0)
      + loadedPayments
        .filter((payment) => !payment.sale_id)
        .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const dueAdjustmentsBySale = new Map<string, number>();
    loadedReturns.forEach((returned) => {
      dueAdjustmentsBySale.set(
        returned.original_sale_id,
        (dueAdjustmentsBySale.get(returned.original_sale_id) || 0)
          + Number(returned.due_adjustment ?? returned.total ?? 0)
      );
    });
    const totalDue = loadedSales.reduce((sum, sale) =>
      sum + Math.max(0, Number(sale.due_amount || 0) - (dueAdjustmentsBySale.get(sale.id) || 0)), 0
    ) + Number(customerResult.data?.previous_due || 0) + loadedPayments
      .filter((payment) => !payment.sale_id)
      .reduce((sum, payment) => sum - Number(payment.amount || 0), 0);
    const totalReturned = loadedReturns.reduce((sum, returned) => sum + Number(returned.total || 0), 0);
    const totalRefunded = loadedReturns.reduce((sum, returned) => sum + Number(returned.refund_amount || 0), 0);
    onSummary({
      totalOrders: loadedSales.length,
      totalPurchase,
      totalPaid,
      totalDue: Math.max(0, totalDue),
      totalReturned,
      totalRefunded,
      netPurchase: Math.max(0, totalPurchase - totalReturned),
      lastPurchase: loadedSales[0]?.sale_date || null,
    });
    setLoading(false);
  }, [customerId, onSummary]);

  useEffect(() => {
    void loadTransactions();
  }, [loadTransactions]);

  const dueBySale = useMemo(() => {
    const adjustments = new Map<string, number>();
    returns.forEach((returned) => {
      adjustments.set(
        returned.original_sale_id,
        (adjustments.get(returned.original_sale_id) || 0)
          + Number(returned.due_adjustment ?? returned.total ?? 0)
      );
    });
    return new Map(sales.map((sale) => [
      sale.id,
      Math.max(0, Number(sale.due_amount || 0) - (adjustments.get(sale.id) || 0)),
    ]));
  }, [returns, sales]);

  const openPayment = (sale: Sale) => {
    setSelectedSale(sale);
    setPaymentForm({
      amount: String(dueBySale.get(sale.id) || 0),
      method: 'cash',
      date: today,
      reference: '',
      note: '',
    });
    setPaymentOpen(true);
  };

  const collectPayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedSale || processingPayment) return;
    const amount = Number(paymentForm.amount);
    const remaining = dueBySale.get(selectedSale.id) || 0;
    if (!Number.isFinite(amount) || amount <= 0 || amount > remaining) {
      toast.error(`Enter an amount between 0.01 and ${money(remaining)}`);
      return;
    }

    const sale = selectedSale;
    const paymentDetails = { ...paymentForm };
    await confirmAction({
      title: 'Receive payment',
      description: `Receive ${money(amount)} for invoice ${sale.invoice_number}?`,
      confirmLabel: 'Yes, Receive Payment',
      successMessage: 'Payment received',
      action: async () => {
        setProcessingPayment(true);
        idempotencyKey.current ||= crypto.randomUUID();
        try {
          const { data, error } = await supabase.rpc('collect_customer_invoice_payment', {
            p_sale_id: sale.id,
            p_amount: amount,
            p_payment_method: paymentDetails.method,
            p_payment_date: paymentDetails.date,
            p_reference_number: paymentDetails.reference.trim() || null,
            p_note: paymentDetails.note.trim() || null,
            p_idempotency_key: idempotencyKey.current,
          });
          if (error) throw error;
          if (!data) throw new Error('Could not receive payment');

          const payment = data as { id: string; remaining_due: number };
          idempotencyKey.current = null;
          setPaymentOpen(false);
          setPaymentReceipt({
            id: payment.id,
            invoiceNumber: sale.invoice_number,
            amount,
            date: paymentDetails.date,
            method: paymentMethods.find((method) => method.value === paymentDetails.method)?.label || paymentDetails.method,
            reference: paymentDetails.reference || '-',
            remainingDue: Number(payment.remaining_due),
            note: paymentDetails.note || '-',
          });
          await Promise.all([loadTransactions(), onRefreshCustomer()]);
        } finally {
          setProcessingPayment(false);
        }
      },
    });
  };

  const productHistory = useMemo(() => {
    const productMap = new Map<string, {
      key: string;
      name: string;
      quantity: number;
      amount: number;
      orders: number;
      lastPurchase: string;
    }>();
    sales.forEach((sale) => sale.sale_items.forEach((item) => {
      const key = item.product_id || item.product_name;
      const current = productMap.get(key);
      if (current) {
        current.quantity += Number(item.quantity || 0);
        current.amount += Number(item.total || 0);
        current.orders += 1;
        if (sale.sale_date > current.lastPurchase) current.lastPurchase = sale.sale_date;
      } else {
        productMap.set(key, {
          key,
          name: item.product_name,
          quantity: Number(item.quantity || 0),
          amount: Number(item.total || 0),
          orders: 1,
          lastPurchase: sale.sale_date,
        });
      }
    }));
    return Array.from(productMap.values()).sort((left, right) => right.lastPurchase.localeCompare(left.lastPurchase));
  }, [sales]);

  const invoiceById = useMemo(() =>
    new Map(sales.map((sale) => [sale.id, sale.invoice_number])), [sales]
  );

  const startReturn = (sale: Sale) => {
    window.location.assign(`/admin/sales/return?invoice=${encodeURIComponent(sale.invoice_number)}`);
  };

  if (loading) {
    return <Card className="p-8 text-center text-sm text-muted-foreground">Loading customer transactions...</Card>;
  }

  if (activeTab === 'overview' || activeTab === 'discount') return null;

  if (activeTab === 'purchase') {
    return (
      <>
        <Card className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Invoice</TableHead><TableHead>Date</TableHead><TableHead>Items</TableHead>
              <TableHead>Total</TableHead><TableHead>Paid</TableHead><TableHead>Due</TableHead><TableHead>Action</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {!sales.length ? <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">No completed purchases</TableCell></TableRow>
                : sales.map((sale) => (
                  <TableRow key={sale.id}>
                    <TableCell className="font-medium">{sale.invoice_number}</TableCell>
                    <TableCell>{dateText(sale.sale_date)}</TableCell>
                    <TableCell>{sale.sale_items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)}</TableCell>
                    <TableCell>{money(Number(sale.total))}</TableCell>
                    <TableCell>{money(Number(sale.paid))}</TableCell>
                    <TableCell>{money(dueBySale.get(sale.id) || 0)}</TableCell>
                    <TableCell><Button size="sm" variant="outline" onClick={() => startReturn(sale)}><RotateCcw className="mr-1 h-4 w-4" />Return Products</Button></TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </Card>
      </>
    );
  }

  if (activeTab === 'products') {
    return (
      <Card className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Product</TableHead><TableHead>Quantity Purchased</TableHead><TableHead>Purchase Amount</TableHead><TableHead>Orders</TableHead><TableHead>Last Purchased</TableHead></TableRow></TableHeader>
          <TableBody>
            {!productHistory.length ? <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No product history</TableCell></TableRow>
              : productHistory.map((product) => (
                <TableRow key={product.key}><TableCell className="font-medium">{product.name}</TableCell><TableCell>{product.quantity}</TableCell><TableCell>{money(product.amount)}</TableCell><TableCell>{product.orders}</TableCell><TableCell>{dateText(product.lastPurchase)}</TableCell></TableRow>
              ))}
          </TableBody>
        </Table>
      </Card>
    );
  }

  if (activeTab === 'dues') {
    const unpaidSales = sales.filter((sale) => (dueBySale.get(sale.id) || 0) > 0);
    return (
      <>
        <Card className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Invoice</TableHead><TableHead>Date</TableHead><TableHead>Original Amount</TableHead><TableHead>Paid</TableHead><TableHead>Remaining Due</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {!unpaidSales.length ? <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No unpaid invoices</TableCell></TableRow>
                : unpaidSales.map((sale) => (
                  <TableRow key={sale.id}>
                    <TableCell className="font-medium">{sale.invoice_number}</TableCell><TableCell>{dateText(sale.sale_date)}</TableCell>
                    <TableCell>{money(Number(sale.total))}</TableCell><TableCell>{money(Number(sale.paid))}</TableCell>
                    <TableCell className="font-semibold text-amber-700">{money(dueBySale.get(sale.id) || 0)}</TableCell>
                    <TableCell><Button size="sm" onClick={() => openPayment(sale)}><Wallet className="mr-1 h-4 w-4" />Receive Payment</Button></TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </Card>
        <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Confirm Receive Payment</DialogTitle></DialogHeader>
            {selectedSale && <form id="receive-payment-form" onSubmit={(event) => void collectPayment(event)} className="space-y-4">
              <p className="text-sm text-muted-foreground">{selectedSale.invoice_number} · Remaining due {money(dueBySale.get(selectedSale.id) || 0)}</p>
              <div className="space-y-2"><Label htmlFor="payment-amount">Amount</Label><Input id="payment-amount" type="number" min="0.01" max={dueBySale.get(selectedSale.id) || 0} step="0.01" required value={paymentForm.amount} onChange={(event) => setPaymentForm({ ...paymentForm, amount: event.target.value })} /></div>
              <div className="space-y-2"><Label htmlFor="payment-method">Payment Method</Label><select id="payment-method" className="h-10 w-full rounded-md border bg-background px-3" value={paymentForm.method} onChange={(event) => setPaymentForm({ ...paymentForm, method: event.target.value })}>{paymentMethods.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}</select></div>
              <div className="space-y-2"><Label htmlFor="payment-date">Payment Date</Label><Input id="payment-date" type="date" required value={paymentForm.date} onChange={(event) => setPaymentForm({ ...paymentForm, date: event.target.value })} /></div>
              <div className="space-y-2"><Label htmlFor="payment-reference">Reference Number (optional)</Label><Input id="payment-reference" maxLength={120} value={paymentForm.reference} onChange={(event) => setPaymentForm({ ...paymentForm, reference: event.target.value })} /></div>
              <div className="space-y-2"><Label htmlFor="payment-note">Notes</Label><Input id="payment-note" maxLength={1000} value={paymentForm.note} onChange={(event) => setPaymentForm({ ...paymentForm, note: event.target.value })} /></div>
            </form>}
            <DialogFooter><Button variant="outline" onClick={() => setPaymentOpen(false)} disabled={processingPayment}>Cancel</Button><Button type="submit" form="receive-payment-form" disabled={processingPayment}>{processingPayment ? 'Receiving...' : 'Confirm Payment'}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={!!paymentReceipt} onOpenChange={(open) => !open && setPaymentReceipt(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Payment Receipt</DialogTitle></DialogHeader>
            {paymentReceipt && <div className="space-y-2 text-sm">
              <p><strong>Receipt ID:</strong> {paymentReceipt.id}</p>
              <p><strong>Invoice:</strong> {paymentReceipt.invoiceNumber}</p>
              <p><strong>Payment Date:</strong> {dateText(paymentReceipt.date)}</p>
              <p><strong>Amount Received:</strong> {money(paymentReceipt.amount)}</p>
              <p><strong>Method:</strong> {paymentReceipt.method}</p>
              <p><strong>Reference:</strong> {paymentReceipt.reference}</p>
              <p><strong>Remaining Due:</strong> {money(paymentReceipt.remainingDue)}</p>
              <p><strong>Notes:</strong> {paymentReceipt.note}</p>
            </div>}
            <DialogFooter>
              <Button variant="outline" onClick={() => setPaymentReceipt(null)}>Close</Button>
              <Button onClick={() => paymentReceipt && printReceipt('Payment Receipt', [
                ['Receipt ID', paymentReceipt.id],
                ['Invoice', paymentReceipt.invoiceNumber],
                ['Payment Date', dateText(paymentReceipt.date)],
                ['Amount Received', money(paymentReceipt.amount)],
                ['Payment Method', paymentReceipt.method],
                ['Reference', paymentReceipt.reference],
                ['Remaining Due', money(paymentReceipt.remainingDue)],
                ['Notes', paymentReceipt.note],
              ])}><Printer className="mr-2 h-4 w-4" />Print Receipt</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {confirmationDialog}
      </>
    );
  }

  if (activeTab === 'payments') {
    return (
      <Card className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Invoice</TableHead><TableHead>Amount</TableHead><TableHead>Method</TableHead><TableHead>Reference</TableHead><TableHead>Notes</TableHead></TableRow></TableHeader>
          <TableBody>
            {!payments.length ? <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No payment history</TableCell></TableRow>
              : payments.map((payment) => (
                <TableRow key={payment.id}><TableCell>{dateText(payment.payment_date)}</TableCell><TableCell>{payment.sale_id ? invoiceById.get(payment.sale_id) || '-' : 'Customer balance'}</TableCell><TableCell className="font-medium">{money(Number(payment.amount))}</TableCell><TableCell className="capitalize">{paymentMethods.find((method) => method.value === payment.payment_method)?.label || payment.payment_method}</TableCell><TableCell>{payment.reference_number || '-'}</TableCell><TableCell>{payment.note || '-'}</TableCell></TableRow>
              ))}
          </TableBody>
        </Table>
      </Card>
    );
  }

  return (
    <>
      <Card className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Return ID</TableHead><TableHead>Original Invoice</TableHead><TableHead>Product</TableHead><TableHead>Quantity</TableHead><TableHead>Return Amount</TableHead><TableHead>Condition</TableHead><TableHead>Refund</TableHead><TableHead>Reason</TableHead><TableHead>Date</TableHead><TableHead>Processed By</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {!returns.length ? <TableRow><TableCell colSpan={11} className="py-8 text-center text-muted-foreground">No sales returns</TableCell></TableRow>
              : returns.flatMap((returned) => returned.sale_return_items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{returned.invoice_number}</TableCell><TableCell>{invoiceById.get(returned.original_sale_id) || '-'}</TableCell><TableCell>{item.product_name}</TableCell><TableCell>{item.quantity}</TableCell><TableCell>{money(Number(item.total))}</TableCell>
                  <TableCell><Badge variant={item.condition === 'good' ? 'default' : 'destructive'} className="capitalize">{item.condition}</Badge></TableCell>
                  <TableCell>{money(returned.refund_amount * Number(item.total) / Math.max(Number(returned.total), 1))} ({returned.refund_method})</TableCell><TableCell>{item.reason || returned.reason || '-'}</TableCell><TableCell>{dateText(returned.return_date)}</TableCell><TableCell>{returned.processed_by_name || '-'}</TableCell>
                  <TableCell><Button size="sm" variant="outline" onClick={() => setSelectedReturn(returned)}><Printer className="mr-1 h-4 w-4" />View / Print</Button></TableCell>
                </TableRow>
              )))}
          </TableBody>
        </Table>
      </Card>
      <Dialog open={!!selectedReturn} onOpenChange={(open) => !open && setSelectedReturn(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Sales Return Receipt</DialogTitle></DialogHeader>
          {selectedReturn && <div className="space-y-2 text-sm">
            <p><strong>Return ID:</strong> {selectedReturn.invoice_number}</p>
            <p><strong>Original Invoice:</strong> {invoiceById.get(selectedReturn.original_sale_id) || '-'}</p>
            <p><strong>Date:</strong> {dateText(selectedReturn.return_date)}</p>
            <p><strong>Returned Amount:</strong> {money(Number(selectedReturn.total))}</p>
            <p><strong>Refund:</strong> {money(Number(selectedReturn.refund_amount))} in cash</p>
            <p><strong>Due Adjustment:</strong> {money(Number(selectedReturn.due_adjustment || 0))}</p>
            <p><strong>Processed By:</strong> {selectedReturn.processed_by_name || '-'}</p>
            <ul className="list-disc space-y-1 pl-5">{selectedReturn.sale_return_items.map((item) => <li key={item.id}>{item.product_name} — {item.quantity} × {money(Number(item.total) / Math.max(Number(item.quantity), 1))}; {item.condition}; {item.reason || selectedReturn.reason || 'No reason provided'}</li>)}</ul>
          </div>}
          <DialogFooter><Button variant="outline" onClick={() => setSelectedReturn(null)}>Close</Button><Button onClick={() => selectedReturn && printReceipt('Sales Return Receipt', [
            ['Return ID', selectedReturn.invoice_number],
            ['Original Invoice', invoiceById.get(selectedReturn.original_sale_id) || '-'],
            ['Return Date', dateText(selectedReturn.return_date)],
            ['Return Amount', money(Number(selectedReturn.total))],
            ['Cash Refund', money(Number(selectedReturn.refund_amount))],
            ['Refund Method', selectedReturn.refund_method],
            ['Due Adjustment', money(Number(selectedReturn.due_adjustment || 0))],
            ['Processed By', selectedReturn.processed_by_name || '-'],
          ], selectedReturn.sale_return_items.map((item) => `${item.product_name} — ${item.quantity}; ${item.condition}; ${item.reason || selectedReturn.reason || '-'}`))}><Printer className="mr-2 h-4 w-4" />Print Receipt</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
