'use client';

import { Barcode } from '@/components/barcode';
import { useTranslation } from '@/hooks/use-translation';
import type { Customer, Settings } from '@/types';

export type ReceiptSettings = Pick<
  Settings,
  | 'store_name'
  | 'store_address'
  | 'store_phone'
  | 'store_email'
  | 'currency_symbol'
  | 'tax_rate'
  | 'receipt_footer'
  | 'domain'
  | 'trade_license_no'
  | 'tax_no'
>;

export type ReceiptSale = {
  id: string;
  invoice_number: string;
  customer_id?: string | null;
  sale_date: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paid: number;
  change: number;
  due_amount: number;
  payment_method: string;
  tax_rate_snapshot?: number | null;
  currency_symbol_snapshot?: string | null;
  cashier?: string | null;
  salesman?: string | null;
};

export type ReceiptItem = {
  id: string;
  name: string;
  sku: string | null;
  quantity: number;
  price: number;
  discount_amount: number;
  total: number;
};

export type ReceiptCustomer = Pick<Customer, 'name' | 'phone' | 'address'>;

type ThermalReceiptProps = {
  sale: ReceiptSale;
  items: ReceiptItem[];
  customer: ReceiptCustomer | null;
  settings: ReceiptSettings;
};

export function ThermalReceipt({
  sale,
  items,
  customer,
  settings,
}: ThermalReceiptProps) {
  const { t, locale } = useTranslation();
  const currency = sale.currency_symbol_snapshot ?? settings.currency_symbol ?? '';
  const taxRate = sale.tax_rate_snapshot ?? settings.tax_rate;

  return (
    <article className="thermal-receipt" aria-label={t('pos.printReceipt')}>
      <header className="receipt-center receipt-store">
        {settings.store_name && <h1>{settings.store_name}</h1>}
        {settings.store_address && <p>{settings.store_address}</p>}
        {settings.store_phone && <p>{settings.store_phone}</p>}
        {settings.store_email && <p>{settings.store_email}</p>}
        {settings.domain?.trim() && <p>{settings.domain.trim()}</p>}
        {settings.trade_license_no?.trim() && <p>{t('settings.tradeLicenseNo')}: {settings.trade_license_no.trim()}</p>}
        {settings.tax_no?.trim() && <p>{t('settings.taxNo')}: {settings.tax_no.trim()}</p>}
      </header>

      <div className="receipt-center receipt-title">TAX INVOICE / RECEIPT</div>
      <div className="receipt-rule" />
      <p><strong>Invoice No:</strong> {sale.invoice_number}</p>
      <div className="receipt-center receipt-barcode">
        <Barcode
          value={sale.invoice_number || sale.id}
          width={1.5}
          height={42}
          displayValue
          fontSize={11}
          className="receipt-barcode-svg"
        />
      </div>
      {customer?.name ? (
        <p><strong>{t('pos.customer')}:</strong> {customer.name}</p>
      ) : sale.customer_id == null ? (
        <p><strong>{t('pos.customer')}:</strong> {t('pos.walkInCustomer')}</p>
      ) : null}
      {customer?.phone?.trim() && <p><strong>{t('common.phone')}:</strong> {customer.phone.trim()}</p>}
      {customer?.address?.trim() && <p><strong>{t('common.address')}:</strong> {customer.address.trim()}</p>}
      <p>
        <strong>{t('common.date')}:</strong>{' '}
        {new Date(sale.sale_date).toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-US')}
      </p>
      {sale.salesman?.trim() && <p><strong>Salesperson:</strong> {sale.salesman.trim()}</p>}
      {sale.cashier?.trim() && <p><strong>Cashier:</strong> {sale.cashier.trim()}</p>}

      <div className="receipt-rule" />
      <div className="receipt-items">
        {items.map((item) => (
          <div className="receipt-item" key={item.id}>
            <div className="receipt-row receipt-item-name">
              <span>{item.name}</span>
              <span>{currency}{Number(item.total).toFixed(2)}</span>
            </div>
            {item.sku?.trim() && <div className="receipt-muted">SKU: {item.sku.trim()}</div>}
            <div className="receipt-row receipt-muted">
              <span>{item.quantity} x {currency}{Number(item.price).toFixed(2)}</span>
              {Number(item.discount_amount) > 0 && (
                <span>-{currency}{Number(item.discount_amount).toFixed(2)}</span>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="receipt-rule" />

      <div className="receipt-totals">
        <div className="receipt-row"><span>{t('pos.subtotal')}</span><span>{currency}{Number(sale.subtotal).toFixed(2)}</span></div>
        {Number(sale.discount) > 0 && (
          <div className="receipt-row">
            <span>{t('pos.discount')}</span>
            <span>-{currency}{Number(sale.discount).toFixed(2)}</span>
          </div>
        )}
        <div className="receipt-row">
          <span>{t('pos.taxRate', { rate: String(taxRate) })}</span>
          <span>{currency}{Number(sale.tax).toFixed(2)}</span>
        </div>
        <div className="receipt-row receipt-total">
          <strong>{t('common.total')}</strong>
          <strong>{currency}{Number(sale.total).toFixed(2)}</strong>
        </div>
        <div className="receipt-row"><span>{t('pos.paidAmount')}</span><span>{currency}{Number(sale.paid).toFixed(2)}</span></div>
        {Number(sale.due_amount) > 0 && (
          <div className="receipt-row"><span>{t('pos.due')}</span><span>{currency}{Number(sale.due_amount).toFixed(2)}</span></div>
        )}
        {Number(sale.change) > 0 && (
          <div className="receipt-row"><span>{t('pos.change')}</span><span>{currency}{Number(sale.change).toFixed(2)}</span></div>
        )}
        <div className="receipt-row"><span>{t('pos.paymentMethod')}</span><span className="capitalize">{sale.payment_method}</span></div>
      </div>

      <div className="receipt-rule" />
      {settings.receipt_footer && <p className="receipt-center receipt-footer">{settings.receipt_footer}</p>}
    </article>
  );
}
