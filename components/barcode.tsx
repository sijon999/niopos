'use client';

import { useLayoutEffect, useRef } from 'react';
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
  const svgRef = useRef<SVGSVGElement>(null);

  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    while (svg.firstChild) svg.removeChild(svg.firstChild);
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    if (!value) return;

    try {
      JsBarcode(svg, value, {
        format,
        width,
        height,
        displayValue,
        fontSize: displayValue ? fontSize : 0,
        textMargin: displayValue ? 2 : 0,
        margin: 4,
        background: '#ffffff',
      });
    } catch (error) {
      console.error('Barcode rendering failed:', error);
    }
  }, [value, format, width, height, displayValue, fontSize]);

  if (!value) return null;

  return <svg ref={svgRef} className={className} />;
}
