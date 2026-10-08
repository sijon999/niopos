'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Search,
  Barcode as BarcodeIcon,
  Printer,
  Download,
  Eye,
  Package,
  Calendar,
  Filter,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';
import { Barcode } from '@/components/barcode';
import type { BarcodeHistory } from '@/types';
import { toast } from 'sonner';

const PAGE_SIZE = 10;

export default function BarcodeHistoryPage() {
  const [history, setHistory] = useState<BarcodeHistory[]>([]);
  const [filtered, setFiltered] = useState<BarcodeHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [formatFilter, setFormatFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [viewItem, setViewItem] = useState<BarcodeHistory | null>(null);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('barcode_history')
        .select('*, products(name, sku, selling_price, discount_price, image_url)')
        .order('generated_date', { ascending: false });
      setHistory(data || []);
      setFiltered(data || []);
      setLoading(false);
    }
    load();
  }, []);

  useEffect(() => {
    let result = history;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((h) =>
        h.product_name?.toLowerCase().includes(q) ||
        h.barcode.includes(q) ||
        h.generated_by?.toLowerCase().includes(q)
      );
    }
    if (formatFilter !== 'all') {
      result = result.filter((h) => h.barcode_format === formatFilter);
    }
    setFiltered(result);
    setPage(0);
  }, [search, formatFilter, history]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageData = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const reprintBarcode = (item: BarcodeHistory) => {
    const win = window.open('', '_blank', 'width=400,height=400');
    if (!win) { toast.error('Please allow popups'); return; }
    win.document.write(`
      <html><head><title>Reprint - ${item.product_name}</title>
      <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>
      </head><body style="font-family:sans-serif;text-align:center;padding:20px;">
      <div style="font-size:13px;font-weight:700;">StyleBazaar</div>
      <div style="font-size:12px;font-weight:600;margin:4px 0;">${item.product_name || ''}</div>
      <svg id="bc"></svg>
      <div style="font-size:10px;color:#666;">Format: ${item.barcode_format}</div>
      <script>window.onload=function(){JsBarcode("#bc","${item.barcode}",{format:"${item.barcode_format}",width:2,height:60,fontSize:14,margin:4});window.print();};</script>
      </body></html>
    `);
    win.document.close();
  };

  const downloadBarcode = (item: BarcodeHistory) => {
    const svg = document.querySelector(`#dl-${item.id} svg`) as SVGElement;
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
      link.download = `barcode-${item.product_name || item.barcode}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      toast.success('Barcode downloaded');
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold font-heading">Barcode History</h2>
        <p className="text-sm text-muted-foreground">Track all barcode generation and printing activity</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Generated', value: history.length, icon: BarcodeIcon, color: 'from-slate-800 to-black' },
          { label: 'Code 128', value: history.filter((h) => h.barcode_format === 'CODE128').length, icon: BarcodeIcon, color: 'from-blue-500 to-cyan-600' },
          { label: 'EAN-13', value: history.filter((h) => h.barcode_format === 'EAN13').length, icon: BarcodeIcon, color: 'from-emerald-500 to-green-600' },
          { label: 'Total Printed', value: history.reduce((sum, h) => sum + h.quantity_printed, 0), icon: Printer, color: 'from-amber-500 to-orange-600' },
        ].map((stat, i) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${stat.color} flex items-center justify-center`}>
                  <stat.icon className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                  <p className="text-xl font-bold">{stat.value}</p>
                </div>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search by product, barcode, or user..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <select value={formatFilter} onChange={(e) => setFormatFilter(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
          <option value="all">All Formats</option>
          <option value="CODE128">Code 128</option>
          <option value="EAN13">EAN-13</option>
          <option value="EAN8">EAN-8</option>
          <option value="UPC">UPC-A</option>
        </select>
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Barcode</TableHead>
              <TableHead>Format</TableHead>
              <TableHead>Generated Date</TableHead>
              <TableHead>Generated By</TableHead>
              <TableHead>Qty</TableHead>
              <TableHead>Branch</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 8 }).map((_, j) => <TableCell key={j}><div className="h-4 bg-muted rounded animate-pulse" /></TableCell>)}
                </TableRow>
              ))
            ) : pageData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8}>
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No barcode history found</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              pageData.map((item, i) => (
                <motion.tr key={item.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }} className="hover:bg-muted/50">
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {item.products?.image_url ? (
                        <img src={item.products.image_url} alt={item.product_name || ''} className="w-8 h-8 rounded-lg object-cover" />
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center"><Package className="w-4 h-4 text-muted-foreground" /></div>
                      )}
                      <span className="line-clamp-1">{item.product_name || 'Unknown'}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <span className="font-mono text-xs">{item.barcode}</span>
                    </div>
                  </TableCell>
                  <TableCell><Badge variant="secondary" className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">{item.barcode_format}</Badge></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{new Date(item.generated_date).toLocaleDateString()} {new Date(item.generated_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</TableCell>
                  <TableCell className="text-sm">{item.generated_by || 'admin'}</TableCell>
                  <TableCell><Badge variant="outline">{item.quantity_printed}</Badge></TableCell>
                  <TableCell className="text-sm">{item.branch}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setViewItem(item)} title="View"><Eye className="w-4 h-4" /></Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => reprintBarcode(item)} title="Reprint"><Printer className="w-4 h-4" /></Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => downloadBarcode(item)} title="Download"><Download className="w-4 h-4" /></Button>
                    </div>
                  </TableCell>
                </motion.tr>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Page {page + 1} of {totalPages} · {filtered.length} records</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>Next</Button>
          </div>
        </div>
      )}

      {/* Hidden barcodes for download */}
      <div className="hidden">
        {history.map((item) => (
          <div key={item.id} id={`dl-${item.id}`}><Barcode value={item.barcode} height={60} fontSize={14} /></div>
        ))}
      </div>

      {/* View dialog */}
      <Dialog open={!!viewItem} onOpenChange={(open) => !open && setViewItem(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Barcode Details</DialogTitle></DialogHeader>
          {viewItem && (
            <div className="space-y-4">
              <div className="p-6 bg-white rounded-lg border flex flex-col items-center gap-2">
                <p className="text-sm font-bold text-slate-900">StyleBazaar</p>
                <p className="text-xs text-slate-700 text-center">{viewItem.product_name}</p>
                <Barcode value={viewItem.barcode} height={60} fontSize={14} />
                <p className="text-xs text-slate-500 font-mono">{viewItem.barcode}</p>
                {viewItem.products && (
                  <p className="text-sm font-bold text-slate-900">৳{viewItem.products.discount_price || viewItem.products.selling_price}</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Format:</span> <span className="font-medium">{viewItem.barcode_format}</span></div>
                <div><span className="text-muted-foreground">Quantity:</span> <span className="font-medium">{viewItem.quantity_printed}</span></div>
                <div><span className="text-muted-foreground">Branch:</span> <span className="font-medium">{viewItem.branch}</span></div>
                <div><span className="text-muted-foreground">By:</span> <span className="font-medium">{viewItem.generated_by || 'admin'}</span></div>
                <div className="col-span-2"><span className="text-muted-foreground">Date:</span> <span className="font-medium">{new Date(viewItem.generated_date).toLocaleString()}</span></div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => reprintBarcode(viewItem)}><Printer className="w-4 h-4 mr-2" /> Reprint</Button>
                <Button variant="outline" className="flex-1" onClick={() => downloadBarcode(viewItem)}><Download className="w-4 h-4 mr-2" /> Download</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
