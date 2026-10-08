'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Boxes,
  AlertTriangle,
  PackageX,
  PackageCheck,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowLeftRight,
  History,
  TrendingDown,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { supabase } from '@/lib/supabase';
import type { Product, StockMovement } from '@/types';
import { toast } from 'sonner';

export default function InventoryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'movements'>('overview');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const [prodRes, moveRes] = await Promise.all([
      supabase.from('products').select('*, brands(name), categories(name)').order('name'),
      supabase.from('stock_movements').select('*, products(name)').order('created_at', { ascending: false }).limit(20),
    ]);
    setProducts(prodRes.data || []);
    setMovements(moveRes.data || []);
    setLoading(false);
  }

  const lowStock = products.filter((p) => p.stock > 0 && p.stock < p.min_stock);
  const outOfStock = products.filter((p) => p.stock <= 0);
  const totalValue = products.reduce((sum, p) => sum + Number(p.cost_price) * Number(p.stock), 0);
  const totalStock = products.reduce((sum, p) => sum + Number(p.stock), 0);

  const handleStockAdjust = async (product: Product, delta: number, type: string) => {
    const newStock = Math.max(0, Number(product.stock) + delta);
    await supabase.from('products').update({ stock: newStock }).eq('id', product.id);
    await supabase.from('stock_movements').insert({
      product_id: product.id,
      type,
      quantity: Math.abs(delta),
      note: type === 'in' ? 'Stock received' : type === 'out' ? 'Stock removed' : 'Adjustment',
    });
    toast.success('Stock updated');
    loadData();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold font-heading">Inventory Management</h2>
        <p className="text-sm text-muted-foreground">Track stock levels, movements, and alerts</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Products', value: products.length, icon: Boxes, color: 'from-slate-800 to-black' },
          { label: 'Total Stock Value', value: `৳${totalValue.toFixed(2)}`, icon: PackageCheck, color: 'from-blue-500 to-cyan-600' },
          { label: 'Low Stock', value: lowStock.length, icon: AlertTriangle, color: 'from-amber-500 to-orange-600' },
          { label: 'Out of Stock', value: outOfStock.length, icon: PackageX, color: 'from-rose-500 to-pink-600' },
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

      {/* Quick actions */}
      <div className="flex gap-2 flex-wrap">
        <Button size="sm" variant="outline"><ArrowDownToLine className="w-4 h-4 mr-2" /> Stock In</Button>
        <Button size="sm" variant="outline"><ArrowUpFromLine className="w-4 h-4 mr-2" /> Stock Out</Button>
        <Button size="sm" variant="outline"><ArrowLeftRight className="w-4 h-4 mr-2" /> Transfer</Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border">
        <button
          onClick={() => setTab('overview')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === 'overview' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          Stock Overview
        </button>
        <button
          onClick={() => setTab('movements')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === 'movements' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          Stock Movements
        </button>
      </div>

      {tab === 'overview' ? (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Current Stock</TableHead>
                <TableHead>Min Stock</TableHead>
                <TableHead>Stock Value</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <TableCell key={j}><div className="h-4 bg-muted rounded animate-pulse" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                products.map((product, i) => (
                  <motion.tr key={product.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }} className="hover:bg-muted/50">
                    <TableCell className="font-medium">{product.name}</TableCell>
                    <TableCell className="text-sm">{product.categories?.name || '-'}</TableCell>
                    <TableCell>
                      <span className="font-medium">{product.stock}</span> {product.unit}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{product.min_stock}</TableCell>
                    <TableCell className="font-medium">${(Number(product.cost_price) * Number(product.stock)).toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge className={
                        product.stock <= 0 ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400' :
                        product.stock < product.min_stock ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                        'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                      }>
                        {product.stock <= 0 ? 'Out of Stock' : product.stock < product.min_stock ? 'Low Stock' : 'In Stock'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" className="h-8" onClick={() => handleStockAdjust(product, 10, 'in')}>
                          <ArrowDownToLine className="w-3 h-3 mr-1" /> +10
                        </Button>
                        <Button size="sm" variant="outline" className="h-8" onClick={() => handleStockAdjust(product, -1, 'out')}>
                          <ArrowUpFromLine className="w-3 h-3 mr-1" /> -1
                        </Button>
                      </div>
                    </TableCell>
                  </motion.tr>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="p-4 border-b border-border flex items-center gap-2">
            <History className="w-4 h-4 text-muted-foreground" />
            <h3 className="font-semibold text-sm">Recent Stock Movements</h3>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Quantity</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movements.map((m) => (
                <TableRow key={m.id} className="hover:bg-muted/50">
                  <TableCell className="font-medium">{m.products?.name || 'Unknown'}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={
                      m.type === 'in' ? 'border-emerald-500 text-emerald-600' :
                      m.type === 'out' ? 'border-rose-500 text-rose-600' :
                      'border-blue-500 text-blue-600'
                    }>
                      {m.type === 'in' ? 'Stock In' : m.type === 'out' ? 'Stock Out' : 'Adjustment'}
                    </Badge>
                  </TableCell>
                  <TableCell>{m.quantity}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{m.reference || '-'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{new Date(m.created_at).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {movements.length === 0 && !loading && (
            <div className="py-12 text-center text-muted-foreground">
              <History className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No stock movements yet</p>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
