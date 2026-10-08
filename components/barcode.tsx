'use client';

import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

type BarcodeProps = {
  value: string;
  width?: number;
  height?: number;
  displayValue?: boolean;
  fontSize?: number;
  className?: string;
};

export function Barcode({
  value,
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
        format: 'CODE128',
        width,
        height,
        displayValue,
        fontSize,
        margin: 4,
        background: '#ffffff',
      });
    } catch {
      // invalid barcode value — render nothing
    }
  }, [value, width, height, displayValue, fontSize]);

  if (!value) return null;

  return <svg ref={ref} className={className} />;
}
