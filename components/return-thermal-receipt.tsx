'use client';

import { Barcode } from '@/components/barcode';
import type { ReceiptSettings } from '@/components/thermal-receipt';
import { useTranslation } from '@/hooks/use-translation';

export type ReturnReceiptItem = {
  id: string;
  product_name: string;
  quantity: number;
  price: number;
  discount: number;
  tax: number;
  total: number;
  condition: string;
  reason: string | null;
};

export type ReturnReceiptData = {
  id: string;
  invoice_number: string;
  original_invoice_number: string;
  customer_name: string;
  customer_phone: string | null;
  customer_address: string | null;
  return_date: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  refund_method: string;
  refund_amount: number;
  due_adjustment: number;
  processed_by_name: string | null;
  items: ReturnReceiptItem[];
};

export function ReturnThermalReceipt({
  receipt,
  settings,
}: {
  receipt: ReturnReceiptData;
  settings: ReceiptSettings;
}) {
  const { t, locale } = useTranslation();
  const currency = settings.currency_symbol || '';

  return (
    <article className="thermal-receipt" aria-label={t('salesReturns.printReceipt')}>
      <header className="receipt-center receipt-store">
        {settings.store_name && <h1>{settings.store_name}</h1>}
        {settings.store_address && <p>{settings.store_address}</p>}
        {settings.store_phone && <p>{settings.store_phone}</p>}
        {settings.domain?.trim() && <p>{settings.domain.trim()}</p>}
        {settings.trade_license_no?.trim() && (
          <p>{t('settings.tradeLicenseNo')}: {settings.trade_license_no.trim()}</p>
        )}
        {settings.tax_no?.trim() && <p>{t('settings.taxNo')}: {settings.tax_no.trim()}</p>}
      </header>

      <div className="receipt-center receipt-title">{t('salesReturns.title')}</div>
      <div className="receipt-rule" />
      <p><strong>{t('salesReturns.returnInvoice')}:</strong> {receipt.invoice_number}</p>
      <div className="receipt-center receipt-barcode">
        <Barcode
          value={receipt.invoice_number || receipt.id}
          width={1.5}
          height={42}
          displayValue
          fontSize={11}
          className="receipt-barcode-svg"
        />
      </div>
      <p><strong>{t('salesReturns.originalInvoice')}:</strong> {receipt.original_invoice_number}</p>
      <p>
        <strong>{t('salesReturns.date')}:</strong>{' '}
        {new Date(receipt.return_date).toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-US')}
      </p>
      <p><strong>{t('salesReturns.customer')}:</strong> {receipt.customer_name}</p>
      {receipt.customer_phone && <p><strong>{t('common.phone')}:</strong> {receipt.customer_phone}</p>}
      {receipt.customer_address && <p><strong>{t('common.address')}:</strong> {receipt.customer_address}</p>}
      {receipt.processed_by_name && (
        <p><strong>{t('salesReturns.processedBy')}:</strong> {receipt.processed_by_name}</p>
      )}

      <div className="receipt-rule" />
      <div className="receipt-items">
        {receipt.items.map((item) => (
          <div className="receipt-item" key={item.id}>
            <div className="receipt-row receipt-item-name">
              <span>{item.product_name}</span>
              <span>{currency}{Number(item.total).toFixed(2)}</span>
            </div>
            <div className="receipt-row receipt-muted">
              <span>{item.quantity} x {currency}{Number(item.price).toFixed(2)}</span>
              {Number(item.discount) > 0 && (
                <span>-{currency}{Number(item.discount).toFixed(2)}</span>
              )}
            </div>
            <div className="receipt-muted">
              {t('salesReturns.condition')}: {t(`salesReturns.${item.condition}`)}
              {item.reason && ` · ${t(`salesReturns.reasons.${item.reason}`)}`}
            </div>
          </div>
        ))}
      </div>
      <div className="receipt-rule" />

      <div className="receipt-totals">
        <div className="receipt-row">
          <span>{t('salesReturns.returnSubtotal')}</span>
          <span>{currency}{Number(receipt.subtotal).toFixed(2)}</span>
        </div>
        {Number(receipt.discount) > 0 && (
          <div className="receipt-row">
            <span>{t('salesReturns.discount')}</span>
            <span>-{currency}{Number(receipt.discount).toFixed(2)}</span>
          </div>
        )}
        <div className="receipt-row">
          <span>{t('salesReturns.taxAdjustment')}</span>
          <span>{currency}{Number(receipt.tax).toFixed(2)}</span>
        </div>
        <div className="receipt-row receipt-total">
          <strong>{t('salesReturns.totalReturn')}</strong>
          <strong>{currency}{Number(receipt.total).toFixed(2)}</strong>
        </div>
        <div className="receipt-row">
          <span>{t('salesReturns.refundAmount')}</span>
          <span>{currency}{Number(receipt.refund_amount).toFixed(2)}</span>
        </div>
        {Number(receipt.due_adjustment) > 0 && (
          <div className="receipt-row">
            <span>{t('salesReturns.dueAdjustment')}</span>
            <span>{currency}{Number(receipt.due_adjustment).toFixed(2)}</span>
          </div>
        )}
        <div className="receipt-row">
          <span>{t('salesReturns.refundMethod')}</span>
          <span>{t(`salesReturns.methods.${receipt.refund_method}`)}</span>
        </div>
      </div>
      <div className="receipt-rule" />
      {settings.receipt_footer && <p className="receipt-center receipt-footer">{settings.receipt_footer}</p>}
    </article>
  );
}
