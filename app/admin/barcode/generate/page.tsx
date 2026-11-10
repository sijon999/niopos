'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import NextImage from 'next/image';
import { motion } from 'framer-motion';
import {
  Search,
  Package,
  Download,
  Printer,
  Barcode as BarcodeIcon,
  RefreshCw,
  Check,
  Layers,
  Store,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/lib/supabase';
import { Barcode } from '@/components/barcode';
import JsBarcode from 'jsbarcode';
import type { Product } from '@/types';
import { toast } from 'sonner';
import { useConfirmation } from '@/hooks/use-confirmation';

const DEFAULT_LABEL_WIDTH_MM = 40;
const DEFAULT_LABEL_HEIGHT_MM = 25;
const LABEL_SAFE_PADDING_MM = 1;
const BARCODE_QUIET_ZONE_PX = 4;
const MAX_BARCODE_MODULE_WIDTH_PX = 2.1;
const MIN_BARCODE_MODULE_WIDTH_PX = 0.75;

type BarcodePrintLabel = {
  name: string;
  barcode: string;
  format: string;
  price: number;
};

type BarcodeLabelSize = {
  widthMm: number;
  heightMm: number;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderPrintBarcode(value: string, format: string, maxWidthMm: number): string {
  const namespace = 'http://www.w3.org/2000/svg';
  const probe = document.createElementNS(namespace, 'svg');
  JsBarcode(probe, value, {
    format,
    width: 1,
    height: 1,
    displayValue: false,
    fontSize: 0,
    textMargin: 0,
    margin: 0,
    background: '#ffffff',
  });

  // A 1px render reveals the encoded module count without scaling the final barcode.
  const moduleCount = Number.parseFloat(probe.getAttribute('width') || '');
  const maxWidthPx = (maxWidthMm * 96) / 25.4;
  const availableBarWidthPx = maxWidthPx - BARCODE_QUIET_ZONE_PX * 2;
  let moduleWidth = Math.min(MAX_BARCODE_MODULE_WIDTH_PX, availableBarWidthPx / moduleCount);
  if (!Number.isFinite(moduleCount) || moduleCount <= 0 || moduleWidth < MIN_BARCODE_MODULE_WIDTH_PX) {
    throw new Error('This barcode is too long to print reliably at this label width.');
  }

  const svg = document.createElementNS(namespace, 'svg');
  const render = () => JsBarcode(svg, value, {
      format,
      width: moduleWidth,
      height: 30,
      displayValue: false,
      fontSize: 0,
      textMargin: 0,
      margin: 0,
      marginTop: 0,
      marginBottom: 0,
      marginLeft: BARCODE_QUIET_ZONE_PX,
      marginRight: BARCODE_QUIET_ZONE_PX,
      lineColor: '#000000',
      background: '#ffffff',
    });

  render();
  for (let attempt = 0; attempt < 3; attempt++) {
    const renderedWidthPx = Number.parseFloat(svg.getAttribute('width') || '');
    if (renderedWidthPx <= maxWidthPx) break;

    const renderedBarsWidthPx = renderedWidthPx - BARCODE_QUIET_ZONE_PX * 2;
    moduleWidth = Math.floor(
      (moduleWidth * (availableBarWidthPx / renderedBarsWidthPx)) * 100
    ) / 100;
    if (moduleWidth < MIN_BARCODE_MODULE_WIDTH_PX) {
      throw new Error('This barcode is too long to print reliably at this label width.');
    }
    render();
  }
  if (Number.parseFloat(svg.getAttribute('width') || '') > maxWidthPx) {
    throw new Error('This barcode cannot fit within the selected label width.');
  }
  return new XMLSerializer().serializeToString(svg);
}

function printBarcodeLabels(
  labels: BarcodePrintLabel[],
  storeName: string,
  labelSize: BarcodeLabelSize
): boolean {
  const win = window.open('', '_blank', 'width=600,height=800');
  if (!win) return false;

  let labelMarkup: string;
  try {
    const maxBarcodeWidthMm = labelSize.widthMm - LABEL_SAFE_PADDING_MM * 2;
    labelMarkup = labels.map((label) => `
    <div class="label">
      <div class="store">${escapeHtml(storeName.trim())}</div>
      <div class="product-name">${escapeHtml(label.name || 'Product')}</div>
      <div class="price">Price: ৳${Number(label.price).toLocaleString('en-US', { maximumFractionDigits: 2 })}</div>
      <div class="barcode-container">${renderPrintBarcode(label.barcode, label.format || 'CODE128', maxBarcodeWidthMm)}</div>
      <div class="sku">${escapeHtml(label.barcode)}</div>
    </div>
    `).join('');
  } catch (error) {
    win.close();
    throw error;
  }

  win.document.open();
  win.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Barcode Labels</title>
        <style>
          @page { size: ${labelSize.widthMm}mm ${labelSize.heightMm}mm; margin: 0; }
          * { box-sizing: border-box; }
          html, body {
            width: ${labelSize.widthMm}mm; min-width: 0; margin: 0; padding: 0;
            background: #fff; color: #000;
          }
          body { font-family: Arial, Helvetica, sans-serif; }
          .label {
            width: ${labelSize.widthMm}mm; height: ${labelSize.heightMm}mm;
            display: grid;
            grid-template-rows: 3mm 3mm 3.5mm minmax(0, 1fr) 3mm;
            row-gap: 0.2mm; align-items: center; justify-items: stretch;
            padding: ${LABEL_SAFE_PADDING_MM}mm; margin: 0; overflow: hidden;
            background: #fff; page-break-inside: avoid; break-inside: avoid;
          }
          .store, .product-name, .price {
            width: 100%; line-height: 1; white-space: nowrap;
            overflow: hidden; text-overflow: ellipsis; color: #000; text-align: center;
          }
          .store { font-size: 8pt; font-weight: 700; }
          .product-name { font-size: 8pt; font-weight: 600; }
          .price { font-size: 9pt; font-weight: 700; }
          .barcode-container {
            width: 100%; height: 100%; display: flex; align-items: center;
            justify-content: center; overflow: hidden; margin: 0; padding: 0;
          }
          .barcode-container svg {
            width: auto; height: auto; max-width: 100%; max-height: 8mm; display: block;
          }
          .sku {
            width: 100%; font-size: 8pt; font-weight: 500; line-height: 1;
            text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          }
          .store:empty { visibility: hidden; }
          .label:not(:last-child) { page-break-after: always; break-after: page; }
          @media print {
            html, body { width: ${labelSize.widthMm}mm; margin: 0; padding: 0; }
            .label {
              width: ${labelSize.widthMm}mm; height: ${labelSize.heightMm}mm;
              margin: 0; border: none; print-color-adjust: exact;
              -webkit-print-color-adjust: exact;
            }
          }
        </style>
      </head>
      <body>
        ${labelMarkup}
      </body>
    </html>
  `);
  win.document.close();
  win.focus();
  win.setTimeout(() => win.print(), 250);
  return true;
}

function generateCode128(): string {
  const prefix = 'SB';
  const random = Math.floor(Math.random() * 1e4).toString().padStart(4, '0');
  return prefix + random;
}

function generateEAN13(): string {
  const prefix = '890';
  let code = prefix;
  for (let i = 0; i < 4; i++) code += Math.floor(Math.random() * 6).toString();
  let sum = 0;
  for (let i = 0; i < 4; i++) sum += parseInt(code[i]) * (i % 2 === 0 ? 1 : 3);
  const checksum = (6 - (sum % 6)) % 6;
  code += checksum.toString();
  return code;
}

export default function GenerateBarcodePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [filtered, setFiltered] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Product | null>(null);
  const [barcodeValue, setBarcodeValue] = useState('');
  const [barcodeFormat, setBarcodeFormat] = useState('CODE128');
  const [quantity, setQuantity] = useState(1);
  const [storeName, setStoreName] = useState('');
  const [labelWidthMm, setLabelWidthMm] = useState(DEFAULT_LABEL_WIDTH_MM);
  const [labelHeightMm, setLabelHeightMm] = useState(DEFAULT_LABEL_HEIGHT_MM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);
  const { confirmUpdate, dialog: confirmationDialog } = useConfirmation();
  const previewRef = useRef<HTMLDivElement>(null);
  const storeNameEdited = useRef(false);

  useEffect(() => {
    async function load() {
      const [productsResult, settingsResult] = await Promise.all([
        supabase
          .from('products')
          .select('*, brands(name), categories(name)')
          .eq('status', 'active')
          .order('name'),
        supabase.from('settings').select('store_name').maybeSingle(),
      ]);
      if (productsResult.error) {
        toast.error(`Failed to load products: ${productsResult.error.message}`);
      } else {
        setProducts(productsResult.data || []);
        setFiltered(productsResult.data || []);
      }
      if (settingsResult.error) {
        toast.error(`Failed to load store name: ${settingsResult.error.message}`);
      } else if (settingsResult.data?.store_name && !storeNameEdited.current) {
        setStoreName(settingsResult.data.store_name);
      }
      setLoading(false);
    }
    load();
  }, []);

  useEffect(() => {
    if (!search) { setFiltered(products); return; }
    const q = search.toLowerCase();
    setFiltered(products.filter((p) =>
      p.name.toLowerCase().includes(q) ||
      p.sku?.toLowerCase().includes(q) ||
      p.barcode?.includes(q)
    ));
  }, [search, products]);

  const handleSelectProduct = (product: Product) => {
    setSelected(product);
    if (product.barcode) {
      setBarcodeValue(product.barcode);
      setBarcodeFormat(product.barcode_format || 'CODE128');
    } else {
      setBarcodeValue(generateCode128());
      setBarcodeFormat('CODE128');
    }
  };

  const handleGenerateNew = () => {
    if (barcodeFormat === 'EAN13') {
      setBarcodeValue(generateEAN13());
    } else {
      setBarcodeValue(generateCode128());
    }
  };

  const handleGenerateFromSKU = () => {
    if (!selected?.sku) {
      toast.error('This product has no SKU');
      return;
    }
    const skuNum = selected.sku.replace(/\D/g, '').padStart(8, '0').slice(0, 8);
    if (skuNum.length >= 8) {
      let code = skuNum.slice(0, 8);
      let sum = 0;
      for (let i = 0; i < 8; i++) sum += parseInt(code[i]) * (i % 2 === 0 ? 1 : 3);
      const checksum = (10 - (sum % 10)) % 10;
      code += checksum.toString();
      setBarcodeValue(code);
      setBarcodeFormat('EAN13');
    } else {
      setBarcodeValue('SB' + selected.sku.replace(/\s/g, '').toUpperCase().padEnd(6, '0'));
      setBarcodeFormat('CODE128');
    }
  };

  const handleSaveBarcode = async () => {
    if (!selected || !barcodeValue) {
      toast.error('Select a product and generate a barcode first');
      return;
    }
    setSaving(true);
    const { data: dup, error: duplicateError } = await supabase
      .from('products')
      .select('id, name')
      .eq('barcode', barcodeValue)
      .neq('id', selected.id)
      .maybeSingle();
    if (duplicateError) {
      toast.error(duplicateError.message);
      setSaving(false);
      return;
    }
    if (dup) {
      toast.error(`Barcode already used by: ${dup.name}`);
      setSaving(false);
      return;
    }
    setSaving(false);
    await confirmUpdate({
      successMessage: 'Barcode saved and logged to history',
      action: async () => {
        setSaving(true);
        try {
          const { error } = await supabase
            .from('products')
            .update({ barcode: barcodeValue, barcode_format: barcodeFormat })
            .eq('id', selected.id);
          if (error) throw error;
          const { error: historyError } = await supabase.from('barcode_history').insert({
            product_id: selected.id,
            product_name: selected.name,
            barcode: barcodeValue,
            barcode_format: barcodeFormat,
            quantity_printed: quantity,
            branch: storeName.trim() || 'main',
            generated_by: 'admin',
          });
          if (historyError) throw historyError;
          setProducts((prev) => prev.map((p) => p.id === selected.id ? { ...p, barcode: barcodeValue, barcode_format: barcodeFormat } : p));
        } finally {
          setSaving(false);
        }
      },
    });
  };

  const downloadBarcodePNG = () => {
    if (!barcodeValue) return;
    const svg = document.querySelector('#barcode-preview svg') as SVGElement;
    if (!svg) {
      toast.error('Barcode preview is unavailable');
      return;
    }
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      toast.error('Unable to prepare the barcode image for download');
      return;
    }
    const img = new Image();
    img.onload = () => {
      try {
        canvas.width = img.width * 2;
        canvas.height = img.height * 2;
        ctx.scale(2, 2);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        const link = document.createElement('a');
        link.download = `barcode-${selected?.name || barcodeValue}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        toast.success('Barcode downloaded');
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Unable to download the barcode image');
      }
    };
    img.onerror = () => toast.error('Unable to render the barcode image for download');
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  const printBarcode = () => {
    if (!barcodeValue || !selected) return;
    const labels = Array.from({ length: quantity }, () => ({
      name: selected.name,
      barcode: barcodeValue,
      format: barcodeFormat,
      price: selected.discount_price ?? selected.selling_price,
    }));
    try {
      if (!printBarcodeLabels(labels, storeName, { widthMm: labelWidthMm, heightMm: labelHeightMm })) {
        toast.error('Please allow popups to print');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to print barcode labels.');
    }
  };

  const printBulk = () => {
    const toPrint = products.filter(
    (p) => selectedProducts.has(p.id) && p.barcode
  );

  if (toPrint.length === 0) {
    toast.error('Select products with barcodes');
    return;
  }

    const labels: BarcodePrintLabel[] = toPrint.map((product) => ({
      name: product.name,
      barcode: String(product.barcode),
      format: product.barcode_format || 'CODE128',
      price: product.discount_price ?? product.selling_price,
    }));
    try {
      if (!printBarcodeLabels(labels, storeName, { widthMm: labelWidthMm, heightMm: labelHeightMm })) {
        toast.error('Please allow popups to print');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to print barcode labels.');
    }
  };

  const toggleProduct = (id: string) => {
    const next = new Set(selectedProducts);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedProducts(next);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold font-heading">Generate Barcode</h2>
          <p className="text-sm text-muted-foreground">Create, print, and download product barcodes</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setBulkMode(!bulkMode)}>
            <Layers className="w-4 h-4 mr-2" /> {bulkMode ? 'Single Mode' : 'Bulk Mode'}
          </Button>
          {bulkMode && (
            <Button size="sm" onClick={printBulk} className="bg-gradient-to-r from-slate-800 to-black">
              <Printer className="w-4 h-4 mr-2" /> Print Selected ({selectedProducts.size})
            </Button>
          )}
        </div>
        {confirmationDialog}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Product list */}
        <Card className="p-4">
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search products by name, SKU, or barcode..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
          </div>
          <ScrollArea className="h-[500px]">
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-16 bg-muted/50 rounded-lg animate-pulse" />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Package className="w-10 h-10 mb-2 opacity-50" />
                <p>No products found</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.map((product, i) => (
                  <motion.div key={product.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}>
                    <div
                      onClick={() => bulkMode ? toggleProduct(product.id) : handleSelectProduct(product)}
                      className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all ${
                        bulkMode && selectedProducts.has(product.id) ? 'bg-primary/10 border border-primary/30' :
                        !bulkMode && selected?.id === product.id ? 'bg-primary/10 border border-primary/30' :
                        'hover:bg-muted/50 border border-transparent'
                      }`}
                    >
                      {bulkMode && (
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${selectedProducts.has(product.id) ? 'bg-primary border-primary' : 'border-muted-foreground/30'}`}>
                          {selectedProducts.has(product.id) && <Check className="w-3 h-3 text-white" />}
                        </div>
                      )}
                      <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                        {product.image_url ? <NextImage src={product.image_url} alt={product.name} width={40} height={40} className="w-full h-full object-cover" /> : <Package className="w-5 h-5 text-muted-foreground" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium line-clamp-1">{product.name}</p>
                        <p className="text-xs text-muted-foreground">{product.sku || 'No SKU'} · {product.categories?.name || 'No category'}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold">৳{product.discount_price || product.selling_price}</p>
                        <Badge variant="secondary" className={product.barcode ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}>
                          {product.barcode ? 'Has barcode' : 'No barcode'}
                        </Badge>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </ScrollArea>
        </Card>

        {/* Barcode preview & controls */}
        <Card className="p-6">
          <div className="grid grid-cols-2 gap-3 mb-5">
            <div className="space-y-2">
              <Label htmlFor="label-width">Label width (mm)</Label>
              <Input
                id="label-width"
                type="number"
                min={20}
                max={100}
                step={0.5}
                value={labelWidthMm}
                onChange={(event) => setLabelWidthMm(Math.max(20, Math.min(100, Number(event.target.value) || DEFAULT_LABEL_WIDTH_MM)))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="label-height">Label height (mm)</Label>
              <Input
                id="label-height"
                type="number"
                min={20}
                max={100}
                step={0.5}
                value={labelHeightMm}
                onChange={(event) => setLabelHeightMm(Math.max(20, Math.min(100, Number(event.target.value) || DEFAULT_LABEL_HEIGHT_MM)))}
              />
            </div>
          </div>
          {!bulkMode ? (
            selected ? (
              <div className="space-y-5">
                {/* Product info */}
                <div className="flex items-start gap-4 pb-4 border-b">
                  <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center overflow-hidden shrink-0">
                    {selected.image_url ? <NextImage src={selected.image_url} alt={selected.name} width={64} height={64} className="w-full h-full object-cover" /> : <Package className="w-8 h-8 text-muted-foreground" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold">{selected.name}</h3>
                    <p className="text-sm text-muted-foreground">{selected.brands?.name || 'No brand'} · {selected.categories?.name || 'No category'}</p>
                    <div className="flex gap-4 mt-1 text-sm">
                      <span><span className="text-muted-foreground">SKU:</span> {selected.sku || 'N/A'}</span>
                      <span><span className="text-muted-foreground">Stock:</span> {selected.stock} {selected.unit}</span>
                      <span><span className="text-muted-foreground">Price:</span> ৳{selected.discount_price || selected.selling_price}</span>
                    </div>
                  </div>
                </div>

                {/* Barcode format */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Barcode Format</Label>
                    <select value={barcodeFormat} onChange={(e) => setBarcodeFormat(e.target.value)} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                      <option value="CODE128">Code 128</option>
                      <option value="EAN13">EAN-13</option>
                      <option value="EAN8">EAN-8</option>
                      <option value="UPC">UPC-A</option>
                    </select>
                  </div>
                  <div>
                    <Label>Print Quantity</Label>
                    <Input type="number" min={1} max={100} value={quantity} onChange={(e) => setQuantity(Math.max(1, Math.min(100, Number(e.target.value) || 1)))} />
                  </div>
                </div>

                {/* Barcode value */}
                <div>
                  <Label>Barcode Value</Label>
                  <div className="flex gap-2">
                    <Input value={barcodeValue} onChange={(e) => setBarcodeValue(e.target.value)} placeholder="Enter or generate barcode" className="flex-1 font-mono" />
                    <Button variant="outline" size="sm" onClick={handleGenerateNew}><RefreshCw className="w-4 h-4 mr-1" /> Auto</Button>
                    <Button variant="outline" size="sm" onClick={handleGenerateFromSKU} title="Generate from SKU">From SKU</Button>
                  </div>
                </div>

                {/* Store name for label */}
                <div>
                  <Label>Store / Branch Name (on label)</Label>
                  <Input
                    value={storeName}
                    onChange={(e) => {
                      storeNameEdited.current = true;
                      setStoreName(e.target.value);
                    }}
                    placeholder="Store name"
                  />
                </div>

                {/* Preview */}
                <div
                  id="barcode-preview"
                  className="mx-auto grid max-w-full justify-items-stretch gap-[0.2mm] overflow-hidden border bg-white p-[1mm] text-center text-black"
                  style={{
                    width: `${labelWidthMm}mm`,
                    height: `${labelHeightMm}mm`,
                    gridTemplateRows: '3mm 3mm 3.5mm minmax(0, 1fr) 3mm',
                  }}
                >
                  <p className="w-full truncate text-[8pt] font-bold leading-none">{storeName || '\u00a0'}</p>
                  <p className="w-full truncate text-[8pt] font-semibold leading-none">{selected.name}</p>
                  <p className="w-full truncate text-[9pt] font-bold leading-none">Price: ৳{(selected.discount_price ?? selected.selling_price).toLocaleString('en-US', { maximumFractionDigits: 2 })}</p>
                  {barcodeValue && (
                    <div className="flex h-full w-full items-center justify-center overflow-hidden">
                      <Barcode
                        value={barcodeValue}
                        format={barcodeFormat}
                        width={2.1}
                        height={30}
                        displayValue={false}
                        className="block h-auto max-h-[8mm] max-w-full"
                      />
                    </div>
                  )}
                  <p className="w-full truncate text-[8pt] font-medium leading-none">{barcodeValue}</p>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <Button onClick={handleSaveBarcode} disabled={saving} className="flex-1 bg-gradient-to-r from-slate-800 to-black">
                    <BarcodeIcon className="w-4 h-4 mr-2" /> {saving ? 'Saving...' : 'Save & Log'}
                  </Button>
                  <Button variant="outline" onClick={downloadBarcodePNG}><Download className="w-4 h-4 mr-2" /> PNG</Button>
                  <Button variant="outline" onClick={printBarcode}><Printer className="w-4 h-4 mr-2" /> Print</Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-[500px] text-muted-foreground">
                <BarcodeIcon className="w-16 h-16 mb-4 opacity-30" />
                <p className="text-lg font-medium">Select a product</p>
                <p className="text-sm">Choose a product from the list to generate its barcode</p>
              </div>
            )
          ) : (
            <div className="space-y-4">
              <div>
                <Label>Store / Branch Name (on labels)</Label>
                <Input
                  value={storeName}
                  onChange={(e) => {
                    storeNameEdited.current = true;
                    setStoreName(e.target.value);
                  }}
                  placeholder="Store name"
                />
              </div>
              <div className="p-4 bg-muted/50 rounded-lg">
                <p className="text-sm font-medium mb-2">Selected: {selectedProducts.size} products</p>
                <p className="text-xs text-muted-foreground">Only products with existing barcodes will be printed. Use single mode to generate barcodes for products that don&apos;t have one yet.</p>
              </div>
              <Button onClick={printBulk} disabled={selectedProducts.size === 0} className="w-full bg-gradient-to-r from-slate-800 to-black">
                <Printer className="w-4 h-4 mr-2" /> Print {selectedProducts.size} Barcode Labels
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
