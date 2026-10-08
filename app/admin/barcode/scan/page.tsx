'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ScanLine,
  Search,
  Package,
  ShoppingCart,
  X,
  Camera,
  Keyboard,
  CheckCircle2,
  AlertCircle,
  MapPin,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase';
import { Barcode } from '@/components/barcode';
import type { Product } from '@/types';
import { toast } from 'sonner';

export default function ScanBarcodePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [scanInput, setScanInput] = useState('');
  const [manualInput, setManualInput] = useState('');
  const [foundProduct, setFoundProduct] = useState<Product | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [scanHistory, setScanHistory] = useState<{ product: Product; time: Date }[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'scanner' | 'manual'>('scanner');
  const scanRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('products')
        .select('*, brands(name), categories(name)')
        .eq('status', 'active')
        .order('name');
      setProducts(data || []);
      setLoading(false);
    }
    load();
    setTimeout(() => scanRef.current?.focus(), 200);
  }, []);

  const handleScan = useCallback((value: string) => {
    if (!value) return;
    const product = products.find((p) => p.barcode === value || p.sku === value);
    if (product) {
      setFoundProduct(product);
      setNotFound(false);
      setScanHistory((prev) => [{ product, time: new Date() }, ...prev].slice(0, 10));
      toast.success(`${product.name} found`);
    } else {
      setFoundProduct(null);
      setNotFound(true);
      toast.error('Product not found');
    }
    setScanInput('');
    setManualInput('');
  }, [products]);

  const handleScanKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleScan(scanInput);
    }
  };

  const handleManualKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleScan(manualInput);
    }
  };

  const handleAddToCart = () => {
    if (!foundProduct) return;
    if (foundProduct.stock <= 0) {
      toast.error(`${foundProduct.name} is out of stock`);
      return;
    }
    toast.success(`${foundProduct.name} added to POS cart`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold font-heading">Scan Barcode</h2>
        <p className="text-sm text-muted-foreground">Scan or enter a barcode to find products instantly</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Scan input */}
        <div className="space-y-4">
          {/* Mode toggle */}
          <div className="flex gap-2">
            <Button variant={mode === 'scanner' ? 'default' : 'outline'} size="sm" onClick={() => setMode('scanner')} className={mode === 'scanner' ? 'bg-gradient-to-r from-slate-800 to-black' : ''}>
              <ScanLine className="w-4 h-4 mr-2" /> Scanner Input
            </Button>
            <Button variant={mode === 'manual' ? 'default' : 'outline'} size="sm" onClick={() => setMode('manual')} className={mode === 'manual' ? 'bg-gradient-to-r from-slate-800 to-black' : ''}>
              <Keyboard className="w-4 h-4 mr-2" /> Manual Entry
            </Button>
          </div>

          <Card className="p-6">
            {mode === 'scanner' ? (
              <div className="space-y-4">
                <div className="text-center py-8">
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-slate-800 to-black mx-auto flex items-center justify-center mb-4">
                    <ScanLine className="w-10 h-10 text-amber-400" />
                  </div>
                  <h3 className="font-semibold mb-1">Ready to Scan</h3>
                  <p className="text-sm text-muted-foreground">Use your USB or Bluetooth scanner. The cursor is focused below — just scan.</p>
                </div>
                <div>
                  <Label>Scanner Input (auto-detects Enter)</Label>
                  <div className="relative">
                    <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input ref={scanRef} value={scanInput} onChange={(e) => setScanInput(e.target.value)} onKeyDown={handleScanKey} placeholder="Scan barcode here..." className="pl-10 font-mono text-lg h-12" autoFocus />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground text-center">USB scanners send input as keyboard strokes followed by Enter — just scan and the product appears.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-center py-8">
                  <div className="w-20 h-20 rounded-full bg-muted mx-auto flex items-center justify-center mb-4">
                    <Keyboard className="w-10 h-10 text-muted-foreground" />
                  </div>
                  <h3 className="font-semibold mb-1">Manual Entry</h3>
                  <p className="text-sm text-muted-foreground">Type or paste a barcode or SKU number</p>
                </div>
                <div>
                  <Label>Barcode / SKU</Label>
                  <div className="flex gap-2">
                    <Input value={manualInput} onChange={(e) => setManualInput(e.target.value)} onKeyDown={handleManualKey} placeholder="Enter barcode or SKU..." className="font-mono" />
                    <Button onClick={() => handleScan(manualInput)} className="bg-gradient-to-r from-slate-800 to-black"><Search className="w-4 h-4" /></Button>
                  </div>
                </div>
              </div>
            )}
          </Card>

          {/* Scan history */}
          {scanHistory.length > 0 && (
            <Card className="p-4">
              <h4 className="text-sm font-semibold mb-3">Recent Scans</h4>
              <div className="space-y-2">
                {scanHistory.map((entry, i) => (
                  <div key={i} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium line-clamp-1">{entry.product.name}</p>
                      <p className="text-xs text-muted-foreground">{entry.product.barcode} · {entry.time.toLocaleTimeString()}</p>
                    </div>
                    <span className="text-sm font-bold">৳{entry.product.discount_price || entry.product.selling_price}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* Result */}
        <Card className="p-6">
          <AnimatePresence mode="wait">
            {foundProduct ? (
              <motion.div key="found" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-5">
                <div className="flex items-center gap-2 text-emerald-600">
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="font-semibold">Product Found</span>
                </div>

                {/* Product info */}
                <div className="flex items-start gap-4 pb-4 border-b">
                  <div className="w-20 h-20 rounded-lg bg-muted flex items-center justify-center overflow-hidden shrink-0">
                    {foundProduct.image_url ? <img src={foundProduct.image_url} alt={foundProduct.name} className="w-full h-full object-cover" /> : <Package className="w-10 h-10 text-muted-foreground" />}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg">{foundProduct.name}</h3>
                    <p className="text-sm text-muted-foreground">{foundProduct.brands?.name || 'No brand'} · {foundProduct.categories?.name || 'No category'}</p>
                    <div className="flex gap-3 mt-2">
                      <Badge variant="secondary" className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">SKU: {foundProduct.sku || 'N/A'}</Badge>
                      <Badge variant={foundProduct.stock > 0 ? 'secondary' : 'destructive'} className={foundProduct.stock > 0 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : ''}>
                        Stock: {foundProduct.stock} {foundProduct.unit}
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* Price & branch */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground">Selling Price</p>
                    <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">৳{foundProduct.discount_price || foundProduct.selling_price}</p>
                  </div>
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" /> Branch</p>
                    <p className="text-lg font-semibold">Main Branch</p>
                  </div>
                </div>

                {/* Barcode display */}
                <div className="p-4 bg-white rounded-lg border flex flex-col items-center gap-2">
                  <Barcode value={foundProduct.barcode || ''} height={50} fontSize={12} />
                  <p className="text-xs text-slate-500 font-mono">{foundProduct.barcode}</p>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <Button onClick={handleAddToCart} className="flex-1 bg-gradient-to-r from-slate-800 to-black">
                    <ShoppingCart className="w-4 h-4 mr-2" /> Add to POS Cart
                  </Button>
                  <Button variant="outline" onClick={() => { setFoundProduct(null); scanRef.current?.focus(); }}>
                    <X className="w-4 h-4 mr-2" /> Clear
                  </Button>
                </div>
              </motion.div>
            ) : notFound ? (
              <motion.div key="notfound" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="flex flex-col items-center justify-center h-[400px] text-center">
                <div className="w-20 h-20 rounded-full bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center mb-4">
                  <AlertCircle className="w-10 h-10 text-rose-500" />
                </div>
                <h3 className="font-semibold text-lg mb-1">Product Not Found</h3>
                <p className="text-sm text-muted-foreground max-w-xs">No product matches this barcode or SKU. Try scanning again or use manual entry to search by name.</p>
                <Button variant="outline" className="mt-4" onClick={() => { setNotFound(false); scanRef.current?.focus(); }}>Scan Again</Button>
              </motion.div>
            ) : (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center justify-center h-[400px] text-center text-muted-foreground">
                <Camera className="w-16 h-16 mb-4 opacity-30" />
                <p className="text-lg font-medium">No scan yet</p>
                <p className="text-sm">Scan a barcode to see product details here</p>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>
      </div>
    </div>
  );
}
