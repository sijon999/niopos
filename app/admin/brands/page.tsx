'use client';

import { useEffect, useState } from 'react';
import NextImage from 'next/image';
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
import { useTranslation } from '@/hooks/use-translation';

const PAGE_SIZE = 10;

export default function BrandsPage() {
  const { t, locale } = useTranslation();
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
    const { data: storeId, error: storeError } = await supabase.rpc('get_my_store_id');
    if (storeError || !storeId) {
      setUploading(false);
      toast.error(t('brands.storeMissing'));
      return;
    }
    const ext = file.name.split('.').pop();
    const fileName = `${storeId}/brand-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from('product-images').upload(fileName, file);
    setUploading(false);
    if (error) { toast.error(t('brands.logoUploadFailed')); return; }
    const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(fileName);
    setLogoUrl(urlData.publicUrl);
    toast.success(t('brands.logoUploaded'));
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error(t('brands.nameRequired')); return; }
    setSaving(true);

    const dup = brands.find((b) => b.name.toLowerCase() === name.toLowerCase().trim() && b.id !== editing?.id);
    if (dup) { toast.error(t('brands.nameExists')); setSaving(false); return; }

    if (editing) {
      const { error } = await supabase.from('brands').update({ name, description, status, logo_url: logoUrl }).eq('id', editing.id);
      if (error) { toast.error(t('common.updateFailed')); setSaving(false); return; }
      toast.success(t('brands.updateSuccess'));
    } else {
      const { error } = await supabase.from('brands').insert({ name, description, status, logo_url: logoUrl });
      if (error) { toast.error(t('common.createFailed')); setSaving(false); return; }
      toast.success(t('brands.createSuccess'));
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
      toast.error(t('brands.deleteUsedWarning', { count: deleteInfo.productCount }));
      return;
    }
    await supabase.from('brands').delete().eq('id', deleteTarget.id);
    toast.success(t('brands.deleteSuccess'));
    setDeleteTarget(null);
    setDeleteInfo(null);
    loadData();
  };

  const exportCSV = () => {
    const headers = [t('brands.brandName'), t('common.description'), t('common.status'), t('common.date')];
    const rows = filtered.map((b) => [b.name, b.description || '', t(b.status === 'active' ? 'common.active' : 'common.inactive'), new Date(b.created_at).toLocaleDateString(locale === 'bn' ? 'bn-BD' : 'en-US')]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'brands.csv';
    link.click();
    toast.success(t('common.csvDownloaded'));
  };

  const printBrands = () => {
    const win = window.open('', '_blank', 'width=800,height=600');
    if (!win) { toast.error(t('common.allowPopups')); return; }
    win.document.write(`<html lang="${locale}"><head><title>${t('brands.title')}</title><style>body{font-family:${locale === 'bn' ? "'Noto Sans Bengali',sans-serif" : 'sans-serif'};padding:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f5f5f5}</style></head><body><h2>${t('brands.title')}</h2><table><tr><th>${t('brands.serial')}</th><th>${t('brands.brandName')}</th><th>${t('common.description')}</th><th>${t('common.date')}</th></tr>${filtered.map((b, i) => `<tr><td>${i + 1}</td><td>${b.name}</td><td>${b.description || ''}</td><td>${new Date(b.created_at).toLocaleDateString(locale === 'bn' ? 'bn-BD' : 'en-US')}</td></tr>`).join('')}</table></body></html>`);
    win.document.close();
    win.print();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold font-heading">{t('brands.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('brands.totalCount', { count: brands.length })}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV}><Copy className="w-4 h-4 mr-2" /> CSV</Button>
          <Button variant="outline" size="sm" onClick={printBrands}><Printer className="w-4 h-4 mr-2" /> {t('common.print')}</Button>
          <Button size="sm" onClick={openNew} className="bg-indigo-600 hover:bg-indigo-700">
            <Plus className="w-4 h-4 mr-2" /> {t('brands.addBrand')}
          </Button>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder={t('brands.search')} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">{t('brands.serial')}</TableHead>
              <TableHead>{t('brands.brandName')}</TableHead>
              <TableHead>{t('common.description')}</TableHead>
              <TableHead>{t('common.date')}</TableHead>
              <TableHead>{t('common.status')}</TableHead>
              <TableHead className="text-right">{t('brands.actions')}</TableHead>
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
                    <p>{t('brands.noBrands')}</p>
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
                        <NextImage src={brand.logo_url} alt={brand.name} width={32} height={32} className="w-8 h-8 rounded-lg object-cover" />
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center">
                          <Store className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                        </div>
                      )}
                      {brand.name}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{brand.description || '-'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{new Date(brand.created_at).toLocaleDateString(locale === 'bn' ? 'bn-BD' : 'en-US')}</TableCell>
                  <TableCell>
                    <Badge variant={brand.status === 'active' ? 'secondary' : 'outline'} className={brand.status === 'active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : ''}>
                      {t(brand.status === 'active' ? 'common.active' : 'common.inactive')}
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
          <p className="text-sm text-muted-foreground">{t('common.page')} {page + 1} {t('common.of')} {totalPages}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>{t('common.previous')}</Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>{t('common.next')}</Button>
          </div>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? t('brands.editBrand') : t('brands.addBrand')}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('brands.logo')}</Label>
              {logoUrl ? (
                <div className="relative inline-block">
                  <NextImage src={logoUrl} alt={t('brands.logo')} width={80} height={80} className="w-20 h-20 rounded-lg object-cover border" />
                  <button type="button" onClick={() => setLogoUrl(null)} className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-rose-500 text-white flex items-center justify-center hover:bg-rose-600 shadow-md">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center w-20 h-20 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                  <div className="flex flex-col items-center gap-1 text-muted-foreground">
                    <ImageIcon className="w-6 h-6" />
                    <span className="text-xs">{uploading ? '...' : t('brands.logoPlaceholder')}</span>
                  </div>
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleLogoUpload(file); }} />
                </label>
              )}
            </div>
            <div className="space-y-2">
              <Label>{t('brands.brandName')} *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('brands.namePlaceholder')} />
            </div>
            <div className="space-y-2">
              <Label>{t('common.description')}</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('brands.descriptionPlaceholder')} />
            </div>
            <div className="space-y-2">
              <Label>{t('common.status')}</Label>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                <option value="active">{t('common.active')}</option>
                <option value="inactive">{t('common.inactive')}</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700">{saving ? t('common.saving') : editing ? t('common.update') : t('common.create')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) { setDeleteTarget(null); setDeleteInfo(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('brands.deleteConfirm')}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteInfo?.loading ? t('common.checking') :
               deleteInfo && deleteInfo.productCount > 0 ?
                t('brands.deleteUsedWarning', { count: deleteInfo.productCount })
                : t('common.irreversibleAction')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-rose-600 hover:bg-rose-700">{t('common.delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
