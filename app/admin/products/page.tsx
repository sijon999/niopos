'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Plus, Search, Edit2, Trash2, Package, Filter, Download, Upload,
  Image as ImageIcon, X, Barcode as BarcodeIcon, Printer, Copy,
  FileSpreadsheet, Eye, Layers, RotateCcw, ChevronLeft, ChevronRight,
  CheckSquare, Square,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/lib/supabase';
import type { Product, Category, Brand, Unit, ProductVariant } from '@/types';
import { toast } from 'sonner';
import { Barcode } from '@/components/barcode';
import { ImportCSVDialog } from '@/components/import-csv-dialog';

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

function generateBarcode(): string {
  const prefix = '890';
  const random = Math.floor(Math.random() * 10000000000).toString().padStart(10, '0');
  return prefix + random.slice(0, 10);
}

function generateProductCode(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

type VariantRow = {
  id?: string;
  variant_sku: string;
  barcode: string;
  size: string;
  color: string;
  material: string;
  weight: string;
  design: string;
  purchase_price: string;
  selling_price: string;
  stock_quantity: string;
  alert_limit: string;
  status: string;
};

const emptyVariant: VariantRow = {
  variant_sku: '', barcode: '', size: '', color: '', material: '', weight: '', design: '',
  purchase_price: '', selling_price: '', stock_quantity: '', alert_limit: '', status: 'active',
};

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');

  // Filters
  const [search, setSearch] = useState('');
  const [brandFilter, setBrandFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [stockFilter, setStockFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  // Pagination
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(0);

  // Dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewProduct, setViewProduct] = useState<Product | null>(null);

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);

  // CSV Import
  const [importOpen, setImportOpen] = useState(false);

  // Bulk
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState('');

  // Form data
  const [formData, setFormData] = useState({
    name: '', product_code: '', sku: '', barcode: '', barcode_format: 'CODE128',
    product_type: 'simple', brand_id: '', category_id: '', unit: 'Pc(s)',
    description: '', short_description: '', product_notes: '',
    cost_price: '', selling_price: '', wholesale_price: '', discount_price: '',
    tax_rate: '0', tax_type: 'exclusive',
    stock: '0', min_stock: '5', warehouse: '', rack_shelf: '',
    image_url: '' as string | null, status: 'active',
  });
  const [variants, setVariants] = useState<VariantRow[]>([]);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const [prodRes, catRes, brandRes, unitRes] = await Promise.all([
      supabase.from('products').select('*, brands(name), categories(name), product_variants(*)').order('created_at', { ascending: false }),
      supabase.from('categories').select('*').order('name'),
      supabase.from('brands').select('*').order('name'),
      supabase.from('units').select('*').eq('status', 'active').order('name'),
    ]);
    setProducts(prodRes.data || []);
    setCategories(catRes.data || []);
    setBrands(brandRes.data || []);
    setUnits(unitRes.data || []);
    setLoading(false);
  }

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (p.is_deleted) return false;
      const q = debouncedSearch.toLowerCase();
      const matchesSearch = !q ||
        p.name.toLowerCase().includes(q) ||
        p.product_code?.includes(q) ||
        p.sku?.toLowerCase().includes(q) ||
        p.barcode?.includes(q) ||
        p.brands?.name?.toLowerCase().includes(q) ||
        p.categories?.name?.toLowerCase().includes(q);
      const matchesBrand = brandFilter === 'all' || p.brand_id === brandFilter;
      const matchesCategory = categoryFilter === 'all' || p.category_id === categoryFilter;
      const matchesType = typeFilter === 'all' || p.product_type === typeFilter;
      let matchesStock = true;
      if (stockFilter === 'in') matchesStock = p.stock > p.min_stock;
      else if (stockFilter === 'low') matchesStock = p.stock > 0 && p.stock <= p.min_stock;
      else if (stockFilter === 'out') matchesStock = p.stock <= 0;
      return matchesSearch && matchesBrand && matchesCategory && matchesType && matchesStock;
    });
  }, [products, debouncedSearch, brandFilter, categoryFilter, stockFilter, typeFilter]);

  const totalPages = Math.ceil(filtered.length / pageSize);
  const pageData = filtered.slice(page * pageSize, (page + 1) * pageSize);

  useEffect(() => { setPage(0); }, [search, brandFilter, categoryFilter, stockFilter, typeFilter, pageSize]);

  const resetFilters = () => {
    setSearch(''); setBrandFilter('all'); setCategoryFilter('all'); setStockFilter('all'); setTypeFilter('all');
  };

  const handleImageUpload = async (file: File) => {
    if (!file) return;
    setUploading(true);
    const ext = file.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from('product-images').upload(fileName, file);
    setUploading(false);
    if (error) { toast.error('ছবি আপলোড ব্যর্থ'); return; }
    const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(fileName);
    setFormData((prev) => ({ ...prev, image_url: urlData.publicUrl }));
    toast.success('ছবি আপলোড হয়েছে');
  };

  const openNew = () => {
    setEditingProduct(null);
    setFormData({
      name: '', product_code: generateProductCode(), sku: '', barcode: '', barcode_format: 'CODE128',
      product_type: 'simple', brand_id: '', category_id: '', unit: 'Pc(s)',
      description: '', short_description: '', product_notes: '',
      cost_price: '', selling_price: '', wholesale_price: '', discount_price: '',
      tax_rate: '0', tax_type: 'exclusive',
      stock: '0', min_stock: '5', warehouse: '', rack_shelf: '',
      image_url: null, status: 'active',
    });
    setVariants([]);
    setDialogOpen(true);
  };

  const openEdit = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      product_code: product.product_code || '',
      sku: product.sku || '',
      barcode: product.barcode || '',
      barcode_format: product.barcode_format || 'CODE128',
      product_type: product.product_type || 'simple',
      brand_id: product.brand_id || '',
      category_id: product.category_id || '',
      unit: product.unit || 'Pc(s)',
      description: product.description || '',
      short_description: product.short_description || '',
      product_notes: product.product_notes || '',
      cost_price: String(product.cost_price),
      selling_price: String(product.selling_price),
      wholesale_price: String(product.wholesale_price || 0),
      discount_price: product.discount_price ? String(product.discount_price) : '',
      tax_rate: String(product.tax_rate),
      tax_type: product.tax_type || 'exclusive',
      stock: String(product.stock),
      min_stock: String(product.min_stock),
      warehouse: product.warehouse || '',
      rack_shelf: product.rack_shelf || '',
      image_url: product.image_url || null,
      status: product.status,
    });
    setVariants((product.product_variants || []).map((v) => ({
      id: v.id,
      variant_sku: v.variant_sku || '',
      barcode: v.barcode || '',
      size: v.size || '',
      color: v.color || '',
      material: v.material || '',
      weight: v.weight || '',
      design: v.design || '',
      purchase_price: String(v.purchase_price),
      selling_price: String(v.selling_price),
      stock_quantity: String(v.stock_quantity),
      alert_limit: String(v.alert_limit),
      status: v.status,
    })));
    setDialogOpen(true);
  };

  const validateForm = (): string | null => {
    if (!formData.name.trim()) return 'পণ্য নাম আবশ্যক';
    if (!formData.selling_price || Number(formData.selling_price) < 0) return 'বিক্রয় মূল্য সঠিক নয়';
    if (formData.cost_price && Number(formData.cost_price) < 0) return 'ক্রয় মূল্য নেতিবাচক হতে পারে না';
    if (Number(formData.stock) < 0) return 'স্টক নেতিবাচক হতে পারে না';
    if (Number(formData.min_stock) < 0) return 'অ্যালার্ট লিমিট নেতিবাচক হতে পারে না';
    return null;
  };

  const handleSave = async () => {
    const error = validateForm();
    if (error) { toast.error(error); return; }

    // Check uniqueness
    if (formData.barcode) {
      const { data: dup } = await supabase.from('products').select('id, name').eq('barcode', formData.barcode).neq('id', editingProduct?.id || '').maybeSingle();
      if (dup) { toast.error(`বারকোড ইতিমধ্যে ব্যবহৃত: ${dup.name}`); return; }
    }
    if (formData.product_code) {
      const { data: dup } = await supabase.from('products').select('id, name').eq('product_code', formData.product_code).neq('id', editingProduct?.id || '').maybeSingle();
      if (dup) { toast.error(`পণ্য কোড ইতিমধ্যে ব্যবহৃত: ${dup.name}`); return; }
    }

    setSaving(true);

    const data: Record<string, any> = {
      name: formData.name,
      product_code: formData.product_code || null,
      sku: formData.sku || null,
      barcode: formData.barcode || null,
      barcode_format: formData.barcode_format || 'CODE128',
      product_type: formData.product_type,
      brand_id: formData.brand_id || null,
      category_id: formData.category_id || null,
      unit: formData.unit,
      description: formData.description || null,
      short_description: formData.short_description || null,
      product_notes: formData.product_notes || null,
      cost_price: Number(formData.cost_price) || 0,
      selling_price: Number(formData.selling_price) || 0,
      wholesale_price: Number(formData.wholesale_price) || 0,
      discount_price: formData.discount_price ? Number(formData.discount_price) : null,
      tax_rate: Number(formData.tax_rate) || 0,
      tax_type: formData.tax_type,
      stock: Number(formData.stock) || 0,
      min_stock: Number(formData.min_stock) || 5,
      warehouse: formData.warehouse || null,
      rack_shelf: formData.rack_shelf || null,
      image_url: formData.image_url || null,
      status: formData.status,
    };

    let productId = editingProduct?.id;

    if (editingProduct) {
      const { error } = await supabase.from('products').update(data).eq('id', editingProduct.id);
      if (error) { toast.error('আপডেট ব্যর্থ'); setSaving(false); return; }
      toast.success('পণ্য সফলভাবে আপডেট হয়েছে');
    } else {
      const { data: newProd, error } = await supabase.from('products').insert(data).select().single();
      if (error) { toast.error('তৈরি ব্যর্থ'); setSaving(false); return; }
      productId = newProd.id;
      toast.success('পণ্য সফলভাবে তৈরি হয়েছে');

      // Log stock movement for opening stock
      if (Number(formData.stock) > 0) {
        await supabase.from('stock_movements').insert({
          product_id: productId,
          type: 'opening',
          quantity: Number(formData.stock),
          reference: 'Opening Stock',
          note: 'Initial stock',
        });
      }
    }

    // Save variants
    if (productId && formData.product_type === 'variant') {
      // Delete removed variants
      if (editingProduct) {
        const existingIds = (editingProduct.product_variants || []).map((v) => v.id);
        const keptIds = variants.filter((v) => v.id).map((v) => v.id);
        const toDelete = existingIds.filter((id) => !keptIds.includes(id));
        if (toDelete.length > 0) {
          await supabase.from('product_variants').delete().in('id', toDelete);
        }
      }

      // Upsert variants
      for (const v of variants) {
        const vData = {
          product_id: productId,
          variant_sku: v.variant_sku || null,
          barcode: v.barcode || null,
          size: v.size || null,
          color: v.color || null,
          material: v.material || null,
          weight: v.weight || null,
          design: v.design || null,
          purchase_price: Number(v.purchase_price) || 0,
          selling_price: Number(v.selling_price) || 0,
          stock_quantity: Number(v.stock_quantity) || 0,
          alert_limit: Number(v.alert_limit) || 0,
          status: v.status,
        };
        if (v.id) {
          await supabase.from('product_variants').update(vData).eq('id', v.id);
        } else {
          await supabase.from('product_variants').insert(vData);
        }
      }
    }

    setSaving(false);
    setDialogOpen(false);
    loadData();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    // Soft delete
    const { error } = await supabase.from('products').update({ is_deleted: true, status: 'inactive' }).eq('id', deleteTarget.id);
    if (error) { toast.error('মুছে ফেলা ব্যর্থ'); return; }
    toast.success('পণ্য সফলভাবে মুছে ফেলা হয়েছে');
    setDeleteTarget(null);
    loadData();
  };

  // Export functions
  const exportCSV = () => {
    const headers = ['নাম', 'কোড', 'SKU', 'বারকোড', 'টাইপ', 'ব্র্যান্ড', 'ক্যাটাগরি', 'পরিমাণ', 'অ্যালার্ট লিমিট', 'ক্রয় মূল্য', 'বিক্রয় মূল্য'];
    const rows = filtered.map((p) => [
      p.name, p.product_code || '', p.sku || '', p.barcode || '',
      p.product_type || 'simple', p.brands?.name || '', p.categories?.name || '',
      `${p.stock} ${p.unit}`, `${p.min_stock} ${p.unit}`,
      String(p.cost_price), String(p.selling_price),
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'products.csv';
    link.click();
    toast.success('CSV ডাউনলোড হয়েছে');
  };

  const exportExcel = () => {
    const headers = ['নাম', 'কোড', 'SKU', 'বারকোড', 'টাইপ', 'ব্র্যান্ড', 'ক্যাটাগরি', 'পরিমাণ', 'অ্যালার্ট লিমিট', 'ক্রয় মূল্য', 'বিক্রয় মূল্য'];
    const rows = filtered.map((p) => [
      p.name, p.product_code || '', p.sku || '', p.barcode || '',
      p.product_type || 'simple', p.brands?.name || '', p.categories?.name || '',
      `${p.stock} ${p.unit}`, `${p.min_stock} ${p.unit}`,
      String(p.cost_price), String(p.selling_price),
    ]);
    const html = `<table><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</table>`;
    const blob = new Blob([`<html><head><meta charset="utf-8"></head><body>${html}</body></html>`], { type: 'application/vnd.ms-excel' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'products.xls';
    link.click();
    toast.success('Excel ডাউনলোড হয়েছে');
  };

  const copyTable = () => {
    const headers = ['নাম', 'কোড', 'টাইপ', 'ব্র্যান্ড', 'ক্যাটাগরি', 'পরিমাণ', 'অ্যালার্ট লিমিট'];
    const rows = filtered.map((p) => [p.name, p.product_code || '', p.product_type || 'simple', p.brands?.name || '', p.categories?.name || '', `${p.stock} ${p.unit}`, `${p.min_stock} ${p.unit}`]);
    const text = [headers.join('\t'), ...rows.map((r) => r.join('\t'))].join('\n');
    navigator.clipboard.writeText(text);
    toast.success('টেবিল কপি হয়েছে');
  };

  const printProducts = () => {
    const win = window.open('', '_blank', 'width=1000,height=700');
    if (!win) { toast.error('পপআপ অনুমোদন করুন'); return; }
    win.document.write(`<html><head><title>পণ্য তালিকা</title><style>body{font-family:sans-serif;padding:20px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #ddd;padding:6px;text-align:left}th{background:#f5f5f5}</style></head><body><h2>পণ্য তালিকা</h2><table><tr><th>ক্রম</th><th>নাম</th><th>কোড</th><th>টাইপ</th><th>ব্র্যান্ড</th><th>ক্যাটাগরি</th><th>পরিমাণ</th><th>অ্যালার্ট লিমিট</th></tr>${filtered.map((p, i) => `<tr><td>${i + 1}</td><td>${p.name}</td><td>${p.product_code || ''}</td><td>${p.product_type || 'simple'}</td><td>${p.brands?.name || ''}</td><td>${p.categories?.name || ''}</td><td>${p.stock} ${p.unit}</td><td>${p.min_stock} ${p.unit}</td></tr>`).join('')}</table></body></html>`);
    win.document.close();
    win.print();
  };

  // Bulk actions
  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === pageData.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pageData.map((p) => p.id)));
    }
  };

  const handleBulkAction = async () => {
    if (!bulkAction || selectedIds.size === 0) { toast.error('অ্যাকশন এবং পণ্য সিলেক্ট করুন'); return; }
    const ids = Array.from(selectedIds);

    if (bulkAction === 'delete') {
      await supabase.from('products').update({ is_deleted: true, status: 'inactive' }).in('id', ids);
      toast.success(`${ids.length} টি পণ্য মুছে ফেলা হয়েছে`);
    } else if (bulkAction === 'export') {
      const selected = filtered.filter((p) => selectedIds.has(p.id));
      const headers = ['নাম', 'কোড', 'SKU', 'বারকোড', 'ব্র্যান্ড', 'ক্যাটাগরি', 'পরিমাণ'];
      const rows = selected.map((p) => [p.name, p.product_code || '', p.sku || '', p.barcode || '', p.brands?.name || '', p.categories?.name || '', `${p.stock} ${p.unit}`]);
      const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'selected-products.csv';
      link.click();
      toast.success('সিলেক্টেড পণ্য এক্সপোর্ট হয়েছে');
    }

    setSelectedIds(new Set());
    setBulkAction('');
    loadData();
  };

  // Profit calculation
  const profitAmount = Number(formData.selling_price) - Number(formData.cost_price || 0);
  const profitMargin = Number(formData.selling_price) > 0 ? ((profitAmount / Number(formData.selling_price)) * 100).toFixed(1) : '0';

  const addVariant = () => setVariants([...variants, { ...emptyVariant }]);
  const removeVariant = (index: number) => setVariants(variants.filter((_, i) => i !== index));
  const updateVariant = (index: number, field: keyof VariantRow, value: string) => {
    setVariants(variants.map((v, i) => i === index ? { ...v, [field]: value } : v));
  };

  const getStockBadge = (p: Product) => {
    if (p.stock <= 0) return <Badge className="bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400">স্টক নেই</Badge>;
    if (p.stock <= p.min_stock) return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">স্বল্প স্টক</Badge>;
    return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">ইন স্টক</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold font-heading">পণ্য তালিকা</h2>
          <p className="text-sm text-muted-foreground">সর্বমোট পণ্য: {products.filter((p) => !p.is_deleted).length} টি</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={copyTable}><Copy className="w-4 h-4 mr-2" /> কপি</Button>
          <Button variant="outline" size="sm" onClick={exportCSV}><Download className="w-4 h-4 mr-2" /> CSV</Button>
          <Button variant="outline" size="sm" onClick={exportExcel}><FileSpreadsheet className="w-4 h-4 mr-2" /> Excel</Button>
          <Button variant="outline" size="sm" onClick={printProducts}><Printer className="w-4 h-4 mr-2" /> প্রিন্ট</Button>
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}><Upload className="w-4 h-4 mr-2" /> Import CSV</Button>
          <Button size="sm" onClick={openNew} className="bg-indigo-600 hover:bg-indigo-700">
            <Plus className="w-4 h-4 mr-2" /> পণ্য যোগ করুন
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4 max-w-md">
          <TabsTrigger value="all">সকল পণ্য</TabsTrigger>
          <TabsTrigger value="category">ক্যাটাগরি</TabsTrigger>
          <TabsTrigger value="brand">ব্র্যান্ড</TabsTrigger>
          <TabsTrigger value="unit">ইউনিট</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4 mt-4">
          {/* Filters */}
          <div className="flex gap-3 flex-wrap items-center">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="নাম বা কোড দিয়ে খুঁজুন..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
            </div>
            <select value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm min-w-[160px]">
              <option value="all">ব্র্যান্ড সিলেক্ট...</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm min-w-[160px]">
              <option value="all">ক্যাটাগরি সিলেক্ট...</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select value={stockFilter} onChange={(e) => setStockFilter(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
              <option value="all">সকল স্টক</option>
              <option value="in">ইন স্টক</option>
              <option value="low">স্বল্প স্টক</option>
              <option value="out">স্টক নেই</option>
            </select>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
              <option value="all">সকল টাইপ</option>
              <option value="simple">সাধারণ পণ্য</option>
              <option value="variant">ভ্যারিয়েন্ট পণ্য</option>
            </select>
            <Button variant="outline" size="sm" onClick={resetFilters}><RotateCcw className="w-4 h-4 mr-2" /> রিসেট</Button>
          </div>

          {/* Bulk actions */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-3 p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg">
              <span className="text-sm font-medium">{selectedIds.size} টি পণ্য সিলেক্টেড</span>
              <select value={bulkAction} onChange={(e) => setBulkAction(e.target.value)} className="h-8 rounded-md border border-input bg-background px-2 text-sm">
                <option value="">অ্যাকশন সিলেক্ট করুন</option>
                <option value="delete">মুছে ফেলুন</option>
                <option value="export">এক্সপোর্ট করুন</option>
              </select>
              <Button size="sm" onClick={handleBulkAction} className="bg-indigo-600 hover:bg-indigo-700">প্রয়োগ করুন</Button>
              <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>বাতিল</Button>
            </div>
          )}

          {/* Table */}
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <button onClick={toggleSelectAll}>
                        {selectedIds.size === pageData.length && pageData.length > 0 ?
                          <CheckSquare className="w-4 h-4 text-indigo-600" /> :
                          <Square className="w-4 h-4 text-muted-foreground" />}
                      </button>
                    </TableHead>
                    <TableHead>ছবি ও নাম</TableHead>
                    <TableHead>কোড</TableHead>
                    <TableHead>টাইপ</TableHead>
                    <TableHead>ব্র্যান্ড</TableHead>
                    <TableHead>ক্যাটাগরি</TableHead>
                    <TableHead>পরিমাণ</TableHead>
                    <TableHead>অ্যালার্ট লিমিট</TableHead>
                    <TableHead className="text-right">অ্যাকশন</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 9 }).map((_, j) => <TableCell key={j}><div className="h-4 bg-muted rounded animate-pulse" /></TableCell>)}
                      </TableRow>
                    ))
                  ) : pageData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9}>
                        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                          <Package className="w-12 h-12 mb-3 opacity-50" />
                          <p>কোন পণ্য পাওয়া যায়নি</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    pageData.map((product, i) => (
                      <motion.tr key={product.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }} className="hover:bg-muted/50">
                        <TableCell>
                          <button onClick={() => toggleSelect(product.id)}>
                            {selectedIds.has(product.id) ?
                              <CheckSquare className="w-4 h-4 text-indigo-600" /> :
                              <Square className="w-4 h-4 text-muted-foreground" />}
                          </button>
                        </TableCell>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-3">
                            {product.image_url ? (
                              <img src={product.image_url} alt={product.name} className="w-10 h-10 rounded-lg object-cover" />
                            ) : (
                              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                                <Package className="w-5 h-5 text-muted-foreground" />
                              </div>
                            )}
                            <button className="hover:text-indigo-600 transition-colors text-left" onClick={() => setViewProduct(product)}>
                              {product.name}
                            </button>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground font-mono">{product.product_code || product.sku || '-'}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={product.product_type === 'variant' ? 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' : 'bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}>
                            {product.product_type === 'variant' ? 'VARIANT' : 'SIMPLE'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{product.brands?.name || '-'}</TableCell>
                        <TableCell className="text-sm">{product.categories?.name || '-'}</TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <span className="text-sm font-medium">{product.stock} {product.unit}</span>
                            {getStockBadge(product)}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{product.min_stock} {product.unit}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setViewProduct(product)} title="দেখুন"><Eye className="w-4 h-4" /></Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(product)} title="সম্পাদনা"><Edit2 className="w-4 h-4" /></Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-rose-600" onClick={() => setDeleteTarget(product)} title="মুছে ফেলুন"><Trash2 className="w-4 h-4" /></Button>
                          </div>
                        </TableCell>
                      </motion.tr>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>

          {/* Pagination */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">দেখাও</span>
              <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="h-8 rounded-md border border-input bg-background px-2 text-sm">
                {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              <span className="text-sm text-muted-foreground">এন্ট্রি</span>
            </div>
            <p className="text-sm text-muted-foreground">মোট {filtered.length} টি পণ্য পাওয়া গেছে</p>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" className="h-8 w-8" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft className="w-4 h-4" /></Button>
                {Array.from({ length: Math.min(totalPages, 5) }).map((_, i) => {
                  const p = Math.max(0, Math.min(totalPages - 5, page - 2)) + i;
                  return (
                    <Button key={p} variant={p === page ? 'default' : 'outline'} size="sm" className="h-8 w-8 p-0" onClick={() => setPage(p)}>{p + 1}</Button>
                  );
                })}
                <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}><ChevronRight className="w-4 h-4" /></Button>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="category">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">ক্যাটাগরি ব্যবস্থাপনার জন্য নিচের পেজে যান</p>
              <a href="/admin/categories" className="text-indigo-600 hover:underline text-sm font-medium">ক্যাটাগরি পেজে যান →</a>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {categories.map((cat, i) => (
                <motion.div key={cat.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                  <Card className="p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center">
                        <Package className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm line-clamp-1">{cat.name}</p>
                        <p className="text-xs text-muted-foreground">{products.filter((p) => p.category_id === cat.id && !p.is_deleted).length} টি পণ্য</p>
                      </div>
                    </div>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>
        </TabsContent>
        <TabsContent value="brand">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">ব্র্যান্ড ব্যবস্থাপনার জন্য নিচের পেজে যান</p>
              <a href="/admin/brands" className="text-indigo-600 hover:underline text-sm font-medium">ব্র্যান্ড পেজে যান →</a>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {brands.map((brand, i) => (
                <motion.div key={brand.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                  <Card className="p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-center gap-3">
                      {brand.logo_url ? (
                        <img src={brand.logo_url} alt={brand.name} className="w-10 h-10 rounded-lg object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center">
                          <Package className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="font-medium text-sm line-clamp-1">{brand.name}</p>
                        <p className="text-xs text-muted-foreground">{products.filter((p) => p.brand_id === brand.id && !p.is_deleted).length} টি পণ্য</p>
                      </div>
                    </div>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>
        </TabsContent>
        <TabsContent value="unit">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">ইউনিট ব্যবস্থাপনার জন্য নিচের পেজে যান</p>
              <a href="/admin/units" className="text-indigo-600 hover:underline text-sm font-medium">ইউনিট পেজে যান →</a>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {units.map((unit, i) => (
                <motion.div key={unit.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                  <Card className="p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center">
                        <Package className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{unit.name}</p>
                        <p className="text-xs text-muted-foreground">{unit.short_name} · {products.filter((p) => p.unit === unit.short_name && !p.is_deleted).length} টি পণ্য</p>
                      </div>
                    </div>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{editingProduct ? 'পণ্য সম্পাদনা' : 'নতুন পণ্য যোগ করুন'}</DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto pr-2">
            <div className="space-y-6">
              {/* Basic Info */}
              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">প্রাথমিক তথ্য</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2 col-span-2">
                    <Label>পণ্যের নাম *</Label>
                    <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="পণ্যের নাম" />
                  </div>
                  <div className="space-y-2">
                    <Label>পণ্য কোড</Label>
                    <div className="flex gap-2">
                      <Input value={formData.product_code} onChange={(e) => setFormData({ ...formData, product_code: e.target.value })} placeholder="1024" className="flex-1" />
                      <Button type="button" variant="outline" size="sm" onClick={() => setFormData({ ...formData, product_code: generateProductCode() })}>অটো</Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>SKU</Label>
                    <Input value={formData.sku} onChange={(e) => setFormData({ ...formData, sku: e.target.value })} placeholder="SKU-001" />
                  </div>
                  <div className="space-y-2 col-span-2">
                    <Label>বারকোড</Label>
                    <div className="flex gap-2">
                      <Input value={formData.barcode} onChange={(e) => setFormData({ ...formData, barcode: e.target.value })} placeholder="8901234500011" className="flex-1" />
                      <Button type="button" variant="outline" size="sm" onClick={() => setFormData({ ...formData, barcode: generateBarcode(), barcode_format: 'EAN13' })}>
                        <BarcodeIcon className="w-4 h-4 mr-1" /> অটো
                      </Button>
                      <select value={formData.barcode_format} onChange={(e) => setFormData({ ...formData, barcode_format: e.target.value })} className="h-9 rounded-md border border-input bg-background px-2 text-xs">
                        <option value="CODE128">Code 128</option>
                        <option value="EAN13">EAN-13</option>
                        <option value="EAN8">EAN-8</option>
                        <option value="UPC">UPC-A</option>
                      </select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>পণ্যের টাইপ</Label>
                    <select value={formData.product_type} onChange={(e) => setFormData({ ...formData, product_type: e.target.value })} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                      <option value="simple">সাধারণ পণ্য</option>
                      <option value="variant">ভ্যারিয়েন্ট পণ্য</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>ব্র্যান্ড</Label>
                    <select value={formData.brand_id} onChange={(e) => setFormData({ ...formData, brand_id: e.target.value })} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                      <option value="">ব্র্যান্ড সিলেক্ট করুন</option>
                      {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>ক্যাটাগরি</Label>
                    <select value={formData.category_id} onChange={(e) => setFormData({ ...formData, category_id: e.target.value })} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                      <option value="">ক্যাটাগরি সিলেক্ট করুন</option>
                      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>ইউনিট</Label>
                    <select value={formData.unit} onChange={(e) => setFormData({ ...formData, unit: e.target.value })} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                      {units.map((u) => <option key={u.id} value={u.short_name}>{u.name} ({u.short_name})</option>)}
                    </select>
                  </div>
                  <div className="space-y-2 col-span-2">
                    <Label>পণ্যের ছবি</Label>
                    {formData.image_url ? (
                      <div className="relative inline-block">
                        <img src={formData.image_url} alt="Product" className="w-32 h-32 rounded-lg object-cover border" />
                        <button type="button" onClick={() => setFormData({ ...formData, image_url: null })} className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-rose-500 text-white flex items-center justify-center hover:bg-rose-600 shadow-md">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <ImageIcon className="w-8 h-8" />
                          <span className="text-sm">{uploading ? 'আপলোড হচ্ছে...' : 'ছবি আপলোড করুন'}</span>
                        </div>
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleImageUpload(file); }} />
                      </label>
                    )}
                  </div>
                </div>
              </div>

              {/* Pricing */}
              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">মূল্য নির্ধারণ</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>ক্রয় মূল্য</Label>
                    <Input type="number" step="0.01" min="0" value={formData.cost_price} onChange={(e) => setFormData({ ...formData, cost_price: e.target.value })} placeholder="৳500" />
                  </div>
                  <div className="space-y-2">
                    <Label>বিক্রয় মূল্য *</Label>
                    <Input type="number" step="0.01" min="0" value={formData.selling_price} onChange={(e) => setFormData({ ...formData, selling_price: e.target.value })} placeholder="৳800" />
                  </div>
                  <div className="space-y-2">
                    <Label>পাইকারি মূল্য</Label>
                    <Input type="number" step="0.01" min="0" value={formData.wholesale_price} onChange={(e) => setFormData({ ...formData, wholesale_price: e.target.value })} placeholder="৳700" />
                  </div>
                  <div className="space-y-2">
                    <Label>ডিসকাউন্ট</Label>
                    <Input type="number" step="0.01" min="0" value={formData.discount_price} onChange={(e) => setFormData({ ...formData, discount_price: e.target.value })} placeholder="৳600" />
                  </div>
                  <div className="space-y-2">
                    <Label>ট্যাক্স/VAT (%)</Label>
                    <Input type="number" step="0.01" min="0" value={formData.tax_rate} onChange={(e) => setFormData({ ...formData, tax_rate: e.target.value })} placeholder="5" />
                  </div>
                  <div className="space-y-2">
                    <Label>ট্যাক্স টাইপ</Label>
                    <select value={formData.tax_type} onChange={(e) => setFormData({ ...formData, tax_type: e.target.value })} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                      <option value="exclusive">এক্সক্লুসিভ</option>
                      <option value="inclusive">ইনক্লুসিভ</option>
                    </select>
                  </div>
                  {Number(formData.selling_price) > 0 && (
                    <div className="col-span-2 p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg flex gap-6">
                      <div>
                        <p className="text-xs text-muted-foreground">লাভ</p>
                        <p className="text-lg font-bold text-indigo-600 dark:text-indigo-400">৳{profitAmount.toFixed(0)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">লাভ মার্জিন</p>
                        <p className="text-lg font-bold text-indigo-600 dark:text-indigo-400">{profitMargin}%</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Inventory */}
              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">ইনভেন্টরি</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>প্রারম্ভিক স্টক</Label>
                    <Input type="number" min="0" value={formData.stock} onChange={(e) => setFormData({ ...formData, stock: e.target.value })} placeholder="0" disabled={!!editingProduct} />
                    {editingProduct && <p className="text-xs text-muted-foreground">স্টক পরিবর্তন ইনভেন্টরি বা ক্রয় থেকে স্বয়ংক্রিয়ভাবে হবে</p>}
                  </div>
                  <div className="space-y-2">
                    <Label>অ্যালার্ট/স্বল্প স্টক লিমিট</Label>
                    <Input type="number" min="0" value={formData.min_stock} onChange={(e) => setFormData({ ...formData, min_stock: e.target.value })} placeholder="5" />
                  </div>
                  <div className="space-y-2">
                    <Label>ওয়্যারহাউস/স্টোর</Label>
                    <Input value={formData.warehouse} onChange={(e) => setFormData({ ...formData, warehouse: e.target.value })} placeholder="মেইন স্টোর" />
                  </div>
                  <div className="space-y-2">
                    <Label>র্যাক/শেল্ফ</Label>
                    <Input value={formData.rack_shelf} onChange={(e) => setFormData({ ...formData, rack_shelf: e.target.value })} placeholder="A-01" />
                  </div>
                </div>
              </div>

              {/* Variants */}
              {formData.product_type === 'variant' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">ভ্যারিয়েন্ট ব্যবস্থাপনা</h4>
                    <Button type="button" variant="outline" size="sm" onClick={addVariant}><Plus className="w-4 h-4 mr-1" /> ভ্যারিয়েন্ট যোগ করুন</Button>
                  </div>
                  {variants.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                      <Layers className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">কোন ভ্যারিয়েন্ট যোগ করা হয়নি</p>
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[300px] overflow-y-auto">
                      {variants.map((v, idx) => (
                        <div key={idx} className="p-3 border rounded-lg space-y-2 bg-muted/30">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium">ভ্যারিয়েন্ট #{idx + 1}</span>
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-rose-600" onClick={() => removeVariant(idx)}><Trash2 className="w-3.5 h-3.5" /></Button>
                          </div>
                          <div className="grid grid-cols-4 gap-2">
                            <Input placeholder="সাইজ" value={v.size} onChange={(e) => updateVariant(idx, 'size', e.target.value)} className="text-sm h-8" />
                            <Input placeholder="কালার" value={v.color} onChange={(e) => updateVariant(idx, 'color', e.target.value)} className="text-sm h-8" />
                            <Input placeholder="ম্যাটেরিয়াল" value={v.material} onChange={(e) => updateVariant(idx, 'material', e.target.value)} className="text-sm h-8" />
                            <Input placeholder="ডিজাইন" value={v.design} onChange={(e) => updateVariant(idx, 'design', e.target.value)} className="text-sm h-8" />
                            <Input placeholder="ভ্যারিয়েন্ট SKU" value={v.variant_sku} onChange={(e) => updateVariant(idx, 'variant_sku', e.target.value)} className="text-sm h-8" />
                            <Input placeholder="বারকোড" value={v.barcode} onChange={(e) => updateVariant(idx, 'barcode', e.target.value)} className="text-sm h-8" />
                            <Input placeholder="ক্রয় মূল্য" type="number" min="0" value={v.purchase_price} onChange={(e) => updateVariant(idx, 'purchase_price', e.target.value)} className="text-sm h-8" />
                            <Input placeholder="বিক্রয় মূল্য" type="number" min="0" value={v.selling_price} onChange={(e) => updateVariant(idx, 'selling_price', e.target.value)} className="text-sm h-8" />
                            <Input placeholder="স্টক" type="number" min="0" value={v.stock_quantity} onChange={(e) => updateVariant(idx, 'stock_quantity', e.target.value)} className="text-sm h-8" />
                            <Input placeholder="অ্যালার্ট লিমিট" type="number" min="0" value={v.alert_limit} onChange={(e) => updateVariant(idx, 'alert_limit', e.target.value)} className="text-sm h-8" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Description */}
              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">বর্ণনা</h4>
                <div className="space-y-2">
                  <Label>সংক্ষিপ্ত বর্ণনা</Label>
                  <Input value={formData.short_description} onChange={(e) => setFormData({ ...formData, short_description: e.target.value })} placeholder="সংক্ষিপ্ত বর্ণনা" />
                </div>
                <div className="space-y-2">
                  <Label>সম্পূর্ণ বর্ণনা</Label>
                  <textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="সম্পূর্ণ বর্ণনা" className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm" />
                </div>
                <div className="space-y-2">
                  <Label>পণ্য নোট</Label>
                  <Input value={formData.product_notes} onChange={(e) => setFormData({ ...formData, product_notes: e.target.value })} placeholder="অভ্যন্তরীণ নোট" />
                </div>
              </div>

              <div className="space-y-2">
                <Label>স্ট্যাটাস</Label>
                <select value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="active">সক্রিয়</option>
                  <option value="inactive">নিষ্ক্রিয়</option>
                </select>
              </div>
            </div>
          </div>

          <DialogFooter className="mt-4 border-t pt-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>বাতিল</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700">{saving ? 'সংরক্ষণ হচ্ছে...' : editingProduct ? 'আপডেট' : 'তৈরি করুন'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>আপনি কি এই পণ্যটি মুছে ফেলতে চান?</AlertDialogTitle>
            <AlertDialogDescription>এই পণ্যটি মুছে ফেললে এর সাথে সম্পর্কিত বিক্রয় রেকর্ড অক্ষুণ্ণ থাকবে, তবে পণ্যটি তালিকা থেকে সরে যাবে।</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>বাতিল</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-rose-600 hover:bg-rose-700">মুছে ফেলুন</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Product details view */}
      <Dialog open={!!viewProduct} onOpenChange={(open) => !open && setViewProduct(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>পণ্যের বিস্তারিত</DialogTitle></DialogHeader>
          {viewProduct && (
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="w-24 h-24 rounded-lg bg-muted flex items-center justify-center overflow-hidden shrink-0">
                  {viewProduct.image_url ? <img src={viewProduct.image_url} alt={viewProduct.name} className="w-full h-full object-cover" /> : <Package className="w-12 h-12 text-muted-foreground" />}
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-lg">{viewProduct.name}</h3>
                  <p className="text-sm text-muted-foreground">{viewProduct.brands?.name || 'কোন ব্র্যান্ড নেই'} · {viewProduct.categories?.name || 'কোন ক্যাটাগরি নেই'}</p>
                  <div className="flex gap-2 mt-2">
                    <Badge variant="outline">কোড: {viewProduct.product_code || 'N/A'}</Badge>
                    <Badge variant="outline">SKU: {viewProduct.sku || 'N/A'}</Badge>
                    <Badge variant="outline">টাইপ: {viewProduct.product_type === 'variant' ? 'ভ্যারিয়েন্ট' : 'সাধারণ'}</Badge>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-muted/50 rounded-lg"><p className="text-xs text-muted-foreground">ক্রয় মূল্য</p><p className="font-bold">৳{viewProduct.cost_price}</p></div>
                <div className="p-3 bg-muted/50 rounded-lg"><p className="text-xs text-muted-foreground">বিক্রয় মূল্য</p><p className="font-bold">৳{viewProduct.selling_price}</p></div>
                <div className="p-3 bg-muted/50 rounded-lg"><p className="text-xs text-muted-foreground">পাইকারি মূল্য</p><p className="font-bold">৳{viewProduct.wholesale_price || 0}</p></div>
                <div className="p-3 bg-muted/50 rounded-lg"><p className="text-xs text-muted-foreground">বর্তমান স্টক</p><p className="font-bold">{viewProduct.stock} {viewProduct.unit}</p></div>
                <div className="p-3 bg-muted/50 rounded-lg"><p className="text-xs text-muted-foreground">অ্যালার্ট লিমিট</p><p className="font-bold">{viewProduct.min_stock} {viewProduct.unit}</p></div>
                <div className="p-3 bg-muted/50 rounded-lg"><p className="text-xs text-muted-foreground">লাভ</p><p className="font-bold text-indigo-600 dark:text-indigo-400">৳{(viewProduct.selling_price - viewProduct.cost_price).toFixed(0)}</p></div>
              </div>
              {viewProduct.barcode && (
                <div className="p-4 bg-white rounded-lg border flex flex-col items-center gap-2">
                  <Barcode value={viewProduct.barcode} height={50} fontSize={12} />
                  <p className="text-xs text-slate-500 font-mono">{viewProduct.barcode}</p>
                </div>
              )}
              {viewProduct.product_variants && viewProduct.product_variants.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">ভ্যারিয়েন্টস</h4>
                  <div className="space-y-1">
                    {viewProduct.product_variants.map((v) => (
                      <div key={v.id} className="flex items-center gap-3 p-2 bg-muted/30 rounded-lg text-sm">
                        <span className="font-medium">{v.size || ''} {v.color || ''}</span>
                        <span className="text-muted-foreground">স্টক: {v.stock_quantity}</span>
                        <span>৳{v.selling_price}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {viewProduct.description && <div><p className="text-xs text-muted-foreground mb-1">বর্ণনা</p><p className="text-sm">{viewProduct.description}</p></div>}
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => { setViewProduct(null); openEdit(viewProduct); }}><Edit2 className="w-4 h-4 mr-2" /> সম্পাদনা</Button>
                <Button variant="outline" onClick={() => setViewProduct(null)}>বন্ধ করুন</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* CSV Import Dialog */}
      <ImportCSVDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        categories={categories}
        brands={brands}
        units={units}
        existingProducts={products}
        onComplete={loadData}
      />
    </div>
  );
}


