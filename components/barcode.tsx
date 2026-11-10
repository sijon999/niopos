'use client';

import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

type BarcodeProps = {
  value: string;
  format?: string;
  width?: number;
  height?: number;
  displayValue?: boolean;
  fontSize?: number;
  className?: string;
};

export function Barcode({
  value,
  format = 'CODE128',
  width = 2,
  height = 60,
  displayValue = true,
  fontSize = 14,
  className,
}: BarcodeProps) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!ref.current || !value) return;
    try {
      JsBarcode(ref.current, value, {
        format,
        width,
        height,
        displayValue,
        fontSize: displayValue ? fontSize : 0,
        textMargin: displayValue ? undefined : 0,
        margin: 4,
        background: '#ffffff',
      });
    } catch (error) {
      console.error('Barcode rendering failed:', error);
    }
  }, [value, format, width, height, displayValue, fontSize]);

  if (!value) return null;

  return <svg ref={ref} className={className} />;
}
