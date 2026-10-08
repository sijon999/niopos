'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
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
import type { Product } from '@/types';
import { toast } from 'sonner';

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
  const [storeName, setStoreName] = useState('StyleBazaar');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('products')
        .select('*, brands(name), categories(name)')
        .eq('status', 'active')
        .order('name');
      setProducts(data || []);
      setFiltered(data || []);
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
    const { data: dup } = await supabase
      .from('products')
      .select('id, name')
      .eq('barcode', barcodeValue)
      .neq('id', selected.id)
      .maybeSingle();
    if (dup) {
      toast.error(`Barcode already used by: ${dup.name}`);
      setSaving(false);
      return;
    }
    const { error } = await supabase
      .from('products')
      .update({ barcode: barcodeValue, barcode_format: barcodeFormat })
      .eq('id', selected.id);
    if (error) {
      toast.error('Failed to save barcode');
      setSaving(false);
      return;
    }
    await supabase.from('barcode_history').insert({
      product_id: selected.id,
      product_name: selected.name,
      barcode: barcodeValue,
      barcode_format: barcodeFormat,
      quantity_printed: quantity,
      branch: 'main',
      generated_by: 'admin',
    });
    setProducts((prev) => prev.map((p) => p.id === selected.id ? { ...p, barcode: barcodeValue, barcode_format: barcodeFormat } : p));
    toast.success('Barcode saved and logged to history');
    setSaving(false);
  };

  const downloadBarcodePNG = () => {
    if (!barcodeValue) return;
    const svg = document.querySelector('#barcode-preview svg') as SVGElement;
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width * 2;
      canvas.height = img.height * 2;
      if (ctx) {
        ctx.scale(2, 2);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
      }
      const link = document.createElement('a');
      link.download = `barcode-${selected?.name || barcodeValue}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      toast.success('Barcode downloaded');
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  const printBarcode = () => {
    if (!barcodeValue || !selected) return;
    const win = window.open('', '_blank', 'width=400,height=500');
    if (!win) { toast.error('Please allow popups'); return; }
    win.document.write(`
      <html><head><title>Barcode Label - ${selected.name}</title>
      <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>
      <style>
        body { font-family: sans-serif; text-align: center; padding: 20px; }
        .label { display: inline-block; border: 1px solid #ddd; border-radius: 6px; padding: 12px; margin: 1px; }
        .store { font-size: 13px; font-weight: 700; margin-bottom: 2px; }
        .name { font-size: 12px; font-weight: 600; margin-bottom: 2px; max-width: 200px; }
        .price { font-size: 14px; font-weight: 700; margin-top: 4px; }
        .sku { font-size: 10px; color: #666; }
      </style></head><body>
      ${Array.from({ length: quantity }).map(() => `
        <div class="label">
          <div class="store">${storeName}</div>
          <div class="name">${selected.name}</div>
          <div class="price"> PRICE: ৳${selected.discount_price || selected.selling_price}</div>
          <svg id="bc"></svg>        
          
        </div>
      `).join('')}
      <script>
      window.onload = function() {
        document.querySelectorAll('#bc').forEach(function(el) {
          JsBarcode(el, "${barcodeValue}", { format: "${barcodeFormat}", width: 2, height: 30, fontSize: 14, margin: 2 });
        });
        window.print();
      };
      </script></body></html>
    `);
    win.document.close();
  };
  
{/* <div class="sku">SKU: ${selected.sku || 'N/A'}</div> */}


    const printBulk = () => {
  const toPrint = products.filter(
    (p) => selectedProducts.has(p.id) && p.barcode
  );

  if (toPrint.length === 0) {
    toast.error('Select products with barcodes');
    return;
  }

  const win = window.open('', '_blank', 'width=600,height=800');

  if (!win) {
    toast.error('Please allow popups to print');
    return;
  }

  const escapeHtml = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

  const labels = toPrint
    .map((product, index) => {
      const productName = escapeHtml(product.name || 'Product');
      const barcodeValue = escapeHtml(String(product.barcode || ''));

      const price =
        product.discount_price || product.selling_price || 0;

      return `
        <div class="label">

          <div class="store">
            ${escapeHtml(storeName || 'VIBE')}
          </div>

          <div class="product-name">
            ${productName}
          </div>

          <div class="price">
            PRICE: ৳ ${Number(price).toLocaleString('en-US')}
          </div>

          <div class="barcode-container">
            <svg id="barcode-${index}"></svg>
          </div>

          <div class="barcode-number">
            ${barcodeValue}
          </div>

        </div>
      `;
    })
    .join('');

  const barcodeScripts = toPrint
    .map((product, index) => {
      const barcodeValue = String(product.barcode || '')
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"');

      const format = product.barcode_format || 'CODE128';

      return `
        JsBarcode("#barcode-${index}", "${barcodeValue}", {
          format: "${format}",
          width: 1.5,
          height: 35,
          displayValue: false,
          margin: 0,
          lineColor: "#000000",
          background: "#ffffff"
        });
      `;
    })
    .join('');

  win.document.open();

  win.document.write(`
    <!DOCTYPE html>

    <html>
      <head>

        <meta charset="UTF-8">

        <title>Bulk Barcode Print</title>

        <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>

        <style>

          @page {
            size: 50mm 30mm;
            margin: 0;
          }

          * {
            box-sizing: border-box;
          }

          html,
          body {
            width: 50mm;
            margin: 0;
            padding: 0;
            background: #ffffff;
          }

          body {
            font-family: Arial, Helvetica, sans-serif;
          }

          /* =========================
             SAME SINGLE LABEL DESIGN
          ========================= */

          .label {
            width: 50mm;
            height: 30mm;

            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: flex-start;

            text-align: center;

            padding: 2.2mm 2mm 1.2mm;

            margin: 0;

            overflow: hidden;

            background: #ffffff;

            page-break-after: always;
            break-after: page;
          }

          /* VIBE */

          .store {
            width: 100%;

            font-size: 11px;
            font-weight: 800;

            line-height: 1;

            margin: 0 0 0.8mm;

            color: #000000;

            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          /* PANJABI / PRODUCT NAME */

          .product-name {
            width: 100%;

            font-size: 10px;
            font-weight: 700;

            line-height: 1;

            margin: 0 0 0.8mm;

            color: #000000;

            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          /* PRICE */

          .price {
            width: 100%;

            font-size: 10px;
            font-weight: 800;

            line-height: 1;

            margin: 0 0 1mm;

            color: #000000;
          }

          /* BARCODE */

          .barcode-container {
            width: 45mm;
            height: 10mm;

            display: flex;
            align-items: center;
            justify-content: center;

            overflow: hidden;

            margin: 0;
            padding: 0;
          }

          .barcode-container svg {
            width: 44mm;
            height: 9mm;

            display: block;
          }

          /* 1093 / BARCODE NUMBER */

          .barcode-number {
            font-size: 9px;
            font-weight: 500;

            line-height: 1;

            margin-top: 0.5mm;

            color: #000000;

            letter-spacing: 0.5px;
          }

          @media print {

            html,
            body {
              width: 50mm;
              margin: 0;
              padding: 0;
            }

            .label {
              width: 50mm;
              height: 30mm;

              margin: 0;

              border: none;

              page-break-after: always;
              break-after: page;
            }

          }

        </style>

      </head>

      <body>

        ${labels}

        <script>

          window.onload = function () {

            try {

              ${barcodeScripts}

              setTimeout(function () {
                window.focus();
                window.print();
              }, 500);

            } catch (error) {

              console.error(
                'Bulk barcode rendering failed:',
                error
              );

              alert(
                'Unable to generate barcode labels.'
              );

            }

          };

        </script>

      </body>
    </html>
  `);

  win.document.close();
  };
          // <div class="sku">SKU: ${p.sku || 'N/A'}</div>
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
                        {product.image_url ? <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" /> : <Package className="w-5 h-5 text-muted-foreground" />}
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
          {!bulkMode ? (
            selected ? (
              <div className="space-y-5">
                {/* Product info */}
                <div className="flex items-start gap-4 pb-4 border-b">
                  <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center overflow-hidden shrink-0">
                    {selected.image_url ? <img src={selected.image_url} alt={selected.name} className="w-full h-full object-cover" /> : <Package className="w-8 h-8 text-muted-foreground" />}
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
                  <Input value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder="Store name" />
                </div>

                {/* Preview */}
                <div id="barcode-preview" className="p-6 bg-white rounded-lg border flex flex-col items-center gap-2">
                  <p className="text-sm font-bold text-slate-900">{storeName}</p>
                  <p className="text-xs text-slate-700 text-center max-w-[144px]">{selected.name}</p>
                  <p className="text-sm font-bold text-slate-900"> PRICE: ৳{selected.discount_price || selected.selling_price}</p>
                  {barcodeValue && <Barcode value={barcodeValue} height={30} fontSize={14} />}
                  {/* <p className="text-xs text-slate-500">SKU: {selected.sku || 'N/A'}</p> */}
                  
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
                <Input value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder="Store name" />
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
