'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Edit2, Trash2, Store, Search, Copy, Printer, Image as ImageIcon, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
import type { Brand } from '@/types';
import { toast } from 'sonner';

const PAGE_SIZE = 10;

export default function BrandsPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [filtered, setFiltered] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Brand | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('active');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Brand | null>(null);
  const [deleteInfo, setDeleteInfo] = useState<{ productCount: number; loading: boolean } | null>(null);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const { data } = await supabase.from('brands').select('*').order('created_at', { ascending: false });
    setBrands(data || []);
    setFiltered(data || []);
    setLoading(false);
  }

  useEffect(() => {
    if (!search) { setFiltered(brands); return; }
    const q = search.toLowerCase();
    setFiltered(brands.filter((b) => b.name.toLowerCase().includes(q) || b.description?.toLowerCase().includes(q)));
    setPage(0);
  }, [search, brands]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageData = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const openNew = () => {
    setEditing(null);
    setName(''); setDescription(''); setStatus('active'); setLogoUrl(null);
    setDialogOpen(true);
  };

  const openEdit = (brand: Brand) => {
    setEditing(brand);
    setName(brand.name); setDescription(brand.description || ''); setStatus(brand.status); setLogoUrl(brand.logo_url || null);
    setDialogOpen(true);
  };

  const handleLogoUpload = async (file: File) => {
    if (!file) return;
    setUploading(true);
    const ext = file.name.split('.').pop();
    const fileName = `brand-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from('product-images').upload(fileName, file);
    setUploading(false);
    if (error) { toast.error('লোগো আপলোড ব্যর্থ'); return; }
    const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(fileName);
    setLogoUrl(urlData.publicUrl);
    toast.success('লোগো আপলোড হয়েছে');
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error('ব্র্যান্ড নাম আবশ্যক'); return; }
    setSaving(true);

    const dup = brands.find((b) => b.name.toLowerCase() === name.toLowerCase().trim() && b.id !== editing?.id);
    if (dup) { toast.error('এই নামের ব্র্যান্ড ইতিমধ্যে বিদ্যমান'); setSaving(false); return; }

    if (editing) {
      const { error } = await supabase.from('brands').update({ name, description, status, logo_url: logoUrl }).eq('id', editing.id);
      if (error) { toast.error('আপডেট ব্যর্থ'); setSaving(false); return; }
      toast.success('ব্র্যান্ড সফলভাবে আপডেট হয়েছে');
    } else {
      const { error } = await supabase.from('brands').insert({ name, description, status, logo_url: logoUrl });
      if (error) { toast.error('তৈরি ব্যর্থ'); setSaving(false); return; }
      toast.success('ব্র্যান্ড সফলভাবে তৈরি হয়েছে');
    }
    setSaving(false);
    setDialogOpen(false);
    loadData();
  };

  const handleDeleteCheck = async (brand: Brand) => {
    setDeleteTarget(brand);
    setDeleteInfo({ productCount: 0, loading: true });
    const { count } = await supabase.from('products').select('*', { count: 'exact', head: true }).eq('brand_id', brand.id).eq('is_deleted', false);
    setDeleteInfo({ productCount: count || 0, loading: false });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    if (deleteInfo && deleteInfo.productCount > 0) {
      toast.error(`এই ব্র্যান্ড ${deleteInfo.productCount} টি পণ্যে ব্যবহৃত হচ্ছে, মুছে ফেলা যাবে না`);
      return;
    }
    await supabase.from('brands').delete().eq('id', deleteTarget.id);
    toast.success('ব্র্যান্ড সফলভাবে মুছে ফেলা হয়েছে');
    setDeleteTarget(null);
    setDeleteInfo(null);
    loadData();
  };

  const exportCSV = () => {
    const headers = ['ব্র্যান্ড নাম', 'বর্ণনা', 'স্ট্যাটাস', 'তারিখ'];
    const rows = filtered.map((b) => [b.name, b.description || '', b.status, new Date(b.created_at).toLocaleDateString()]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'brands.csv';
    link.click();
    toast.success('CSV ডাউনলোড হয়েছে');
  };

  const printBrands = () => {
    const win = window.open('', '_blank', 'width=800,height=600');
    if (!win) { toast.error('পপআপ অনুমোদন করুন'); return; }
    win.document.write(`<html><head><title>ব্র্যান্ড তালিকা</title><style>body{font-family:sans-serif;padding:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f5f5f5}</style></head><body><h2>ব্র্যান্ড তালিকা</h2><table><tr><th>ক্রম</th><th>ব্র্যান্ড নাম</th><th>বর্ণনা</th><th>তারিখ</th></tr>${filtered.map((b, i) => `<tr><td>${i + 1}</td><td>${b.name}</td><td>${b.description || ''}</td><td>${new Date(b.created_at).toLocaleDateString()}</td></tr>`).join('')}</table></body></html>`);
    win.document.close();
    win.print();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold font-heading">ব্র্যান্ড ব্যবস্থাপনা</h2>
          <p className="text-sm text-muted-foreground">সর্বমোট ব্র্যান্ড: {brands.length} টি</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV}><Copy className="w-4 h-4 mr-2" /> CSV</Button>
          <Button variant="outline" size="sm" onClick={printBrands}><Printer className="w-4 h-4 mr-2" /> প্রিন্ট</Button>
          <Button size="sm" onClick={openNew} className="bg-indigo-600 hover:bg-indigo-700">
            <Plus className="w-4 h-4 mr-2" /> ব্র্যান্ড যোগ করুন
          </Button>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="নাম দিয়ে খুঁজুন..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">ক্রম</TableHead>
              <TableHead>ব্র্যান্ড নাম</TableHead>
              <TableHead>বর্ণনা</TableHead>
              <TableHead>তারিখ</TableHead>
              <TableHead>স্ট্যাটাস</TableHead>
              <TableHead className="text-right">অ্যাকশন</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((_, j) => <TableCell key={j}><div className="h-4 bg-muted rounded animate-pulse" /></TableCell>)}
                </TableRow>
              ))
            ) : pageData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Store className="w-12 h-12 mb-3 opacity-50" />
                    <p>কোন ব্র্যান্ড পাওয়া যায়নি</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              pageData.map((brand, i) => (
                <motion.tr key={brand.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }} className="hover:bg-muted/50">
                  <TableCell className="text-muted-foreground">{page * PAGE_SIZE + i + 1}</TableCell>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-3">
                      {brand.logo_url ? (
                        <img src={brand.logo_url} alt={brand.name} className="w-8 h-8 rounded-lg object-cover" />
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center">
                          <Store className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                        </div>
                      )}
                      {brand.name}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{brand.description || '-'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{new Date(brand.created_at).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Badge variant={brand.status === 'active' ? 'secondary' : 'outline'} className={brand.status === 'active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : ''}>
                      {brand.status === 'active' ? 'সক্রিয়' : 'নিষ্ক্রিয়'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(brand)}><Edit2 className="w-4 h-4" /></Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-rose-600" onClick={() => handleDeleteCheck(brand)}><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  </TableCell>
                </motion.tr>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">পৃষ্ঠা {page + 1} / {totalPages}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>পূর্ববর্তী</Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>পরবর্তী</Button>
          </div>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? 'ব্র্যান্ড সম্পাদনা' : 'নতুন ব্র্যান্ড যোগ করুন'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>লোগো</Label>
              {logoUrl ? (
                <div className="relative inline-block">
                  <img src={logoUrl} alt="Logo" className="w-20 h-20 rounded-lg object-cover border" />
                  <button type="button" onClick={() => setLogoUrl(null)} className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-rose-500 text-white flex items-center justify-center hover:bg-rose-600 shadow-md">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center w-20 h-20 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                  <div className="flex flex-col items-center gap-1 text-muted-foreground">
                    <ImageIcon className="w-6 h-6" />
                    <span className="text-xs">{uploading ? '...' : 'লোগো'}</span>
                  </div>
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleLogoUpload(file); }} />
                </label>
              )}
            </div>
            <div className="space-y-2">
              <Label>ব্র্যান্ড নাম *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="যেমন: NSvely" />
            </div>
            <div className="space-y-2">
              <Label>বর্ণনা</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="ব্র্যান্ডের বর্ণনা" />
            </div>
            <div className="space-y-2">
              <Label>স্ট্যাটাস</Label>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                <option value="active">সক্রিয়</option>
                <option value="inactive">নিষ্ক্রিয়</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>বাতিল</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700">{saving ? 'সংরক্ষণ হচ্ছে...' : editing ? 'আপডেট' : 'তৈরি করুন'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) { setDeleteTarget(null); setDeleteInfo(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>আপনি কি এই ব্র্যান্ডটি মুছে ফেলতে চান?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteInfo?.loading ? 'যাচাই হচ্ছে...' :
               deleteInfo && deleteInfo.productCount > 0 ?
                `এই ব্র্যান্ড বর্তমানে ${deleteInfo.productCount} টি পণ্যে ব্যবহৃত হচ্ছে। মুছে ফেলা যাবে না।`
                : 'এই কাজটি ফিরিয়ে আনা যাবে না।'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>বাতিল</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-rose-600 hover:bg-rose-700">মুছে ফেলুন</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
