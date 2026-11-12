'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Edit2, Trash2, Tags, Search, Copy, FileSpreadsheet, Printer, AlertTriangle } from 'lucide-react';
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
import { supabase } from '@/lib/supabase';
import { escapeCsvCell, escapeHtml } from '@/lib/safe-export';
import type { Category } from '@/types';
import { toast } from 'sonner';
import { useTranslation } from '@/hooks/use-translation';
import { useConfirmation } from '@/hooks/use-confirmation';

export default function CategoriesPage() {
  const { t, locale } = useTranslation();
  const [categories, setCategories] = useState<Category[]>([]);
  const [filtered, setFiltered] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('active');
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [deleteInfo, setDeleteInfo] = useState<{ productCount: number; loading: boolean } | null>(null);
  const [reassignTarget, setReassignTarget] = useState<string>('');
  const { confirmUpdate, confirmDelete, dialog: confirmationDialog } = useConfirmation();

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const { data } = await supabase.from('categories').select('*').order('created_at', { ascending: false });
    setCategories(data || []);
    setFiltered(data || []);
    setLoading(false);
  }

  useEffect(() => {
    if (!search) { setFiltered(categories); return; }
    const q = search.toLowerCase();
    setFiltered(categories.filter((c) => c.name.toLowerCase().includes(q) || c.description?.toLowerCase().includes(q)));
  }, [search, categories]);

  const openNew = () => {
    setEditing(null);
    setName(''); setDescription(''); setStatus('active');
    setDialogOpen(true);
  };

  const openEdit = (cat: Category) => {
    setEditing(cat);
    setName(cat.name); setDescription(cat.description || ''); setStatus(cat.status);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error(t('categories.nameRequired')); return; }
    const dup = categories.find((c) => c.name.toLowerCase() === name.toLowerCase().trim() && c.id !== editing?.id);
    if (dup) { toast.error(t('categories.nameExists')); return; }

    if (editing) {
      const categoryId = editing.id;
      await confirmUpdate({
        successMessage: t('categories.updateSuccess'),
        action: async () => {
          setSaving(true);
          try {
            const { error } = await supabase.from('categories').update({ name, description, status }).eq('id', categoryId);
            if (error) throw error;
            setDialogOpen(false);
            await loadData();
          } finally {
            setSaving(false);
          }
        },
      });
      return;
    }

    setSaving(true);
    const { error } = await supabase.from('categories').insert({ name, description, status });
    if (error) { toast.error(t('common.createFailed')); setSaving(false); return; }
    toast.success(t('categories.createSuccess'));
    setSaving(false);
    setDialogOpen(false);
    loadData();
  };

  const handleDeleteCheck = async (cat: Category) => {
    setDeleteTarget(cat);
    setDeleteInfo({ productCount: 0, loading: true });
    setReassignTarget('');
    const { count, error } = await supabase.from('products').select('*', { count: 'exact', head: true }).eq('category_id', cat.id).eq('is_deleted', false);
    if (error) {
      toast.error(error.message);
      setDeleteTarget(null);
      setDeleteInfo(null);
      return;
    }
    setDeleteInfo({ productCount: count || 0, loading: false });
    if (!count) {
      setDeleteTarget(null);
      setDeleteInfo(null);
      await confirmDelete({
        recordName: cat.name,
        successMessage: t('categories.deleteSuccess'),
        action: async () => {
          const { error: deleteError } = await supabase.from('categories').delete().eq('id', cat.id);
          if (deleteError) throw deleteError;
          await loadData();
        },
      });
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    const category = deleteTarget;
    const productCount = deleteInfo?.productCount || 0;
    setDeleteTarget(null);
    setDeleteInfo(null);
    await confirmDelete({
      recordName: category.name,
      warning: productCount
        ? `Delete “${category.name}”? ${productCount} products use this category${reassignTarget ? ` and will be reassigned to ${categories.find((item) => item.id === reassignTarget)?.name || 'the selected category'}` : ' and will become uncategorized'}.`
        : `Are you sure you want to delete “${category.name}”? This action cannot be undone.`,
      successMessage: t('categories.deleteSuccess'),
      action: async () => {
        if (productCount > 0 && reassignTarget) {
          const { error: productError } = await supabase.from('products').update({ category_id: reassignTarget }).eq('category_id', category.id);
          if (productError) throw productError;
        }
        const { error: deleteError } = await supabase.from('categories').delete().eq('id', category.id);
        if (deleteError) throw deleteError;
        setReassignTarget('');
        await loadData();
      },
    });
  };

  const exportCSV = () => {
    const headers = [t('categories.categoryName'), t('common.description'), t('common.status'), t('common.date')];
    const rows = filtered.map((c) => [c.name, c.description || '', t(c.status === 'active' ? 'common.active' : 'common.inactive'), new Date(c.created_at).toLocaleDateString(locale === 'bn' ? 'bn-BD' : 'en-US')]);
    const csv = [headers, ...rows].map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');
    const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'categories.csv';
    link.click();
    toast.success(t('common.csvDownloaded'));
  };

  const printCategories = () => {
    const win = window.open('', '_blank', 'width=800,height=600');
    if (!win) { toast.error(t('common.allowPopups')); return; }
    const headers = [t('categories.serial'), t('categories.categoryName'), t('common.description'), t('common.date')];
    win.document.write(`<html lang="${locale}"><head><meta charset="utf-8"><title>${escapeHtml(t('categories.title'))}</title><style>body{font-family:${locale === 'bn' ? "'Noto Sans Bengali',sans-serif" : 'sans-serif'};padding:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f5f5f5}</style></head><body><h2>${escapeHtml(t('categories.title'))}</h2><table><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr>${filtered.map((category, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(category.name)}</td><td>${escapeHtml(category.description)}</td><td>${escapeHtml(new Date(category.created_at).toLocaleDateString(locale === 'bn' ? 'bn-BD' : 'en-US'))}</td></tr>`).join('')}</table></body></html>`);
    win.document.close();
    win.print();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold font-heading">{t('categories.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('categories.totalCategories')}: {categories.length}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV}><Copy className="w-4 h-4 mr-2" /> CSV</Button>
          <Button variant="outline" size="sm" onClick={printCategories}><Printer className="w-4 h-4 mr-2" /> {t('common.print')}</Button>
          <Button size="sm" onClick={openNew} className="bg-indigo-600 hover:bg-indigo-700">
            <Plus className="w-4 h-4 mr-2" /> {t('categories.addCategory')}
          </Button>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder={t('categories.search')} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">{t('categories.serial')}</TableHead>
              <TableHead>{t('categories.categoryName')}</TableHead>
              <TableHead>{t('common.description')}</TableHead>
              <TableHead>{t('common.date')}</TableHead>
              <TableHead>{t('common.status')}</TableHead>
              <TableHead className="text-right">{t('common.action')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((_, j) => <TableCell key={j}><div className="h-4 bg-muted rounded animate-pulse" /></TableCell>)}
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Tags className="w-12 h-12 mb-3 opacity-50" />
                    <p>{t('categories.noCategories')}</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((cat, i) => (
                <motion.tr key={cat.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }} className="hover:bg-muted/50">
                  <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center">
                        <Tags className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      </div>
                      {cat.name}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{cat.description || '-'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{new Date(cat.created_at).toLocaleDateString(locale === 'bn' ? 'bn-BD' : 'en-US')}</TableCell>
                  <TableCell>
                    <Badge variant={cat.status === 'active' ? 'secondary' : 'outline'} className={cat.status === 'active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : ''}>
                      {t(cat.status === 'active' ? 'common.active' : 'common.inactive')}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(cat)}><Edit2 className="w-4 h-4" /></Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-rose-600" onClick={() => handleDeleteCheck(cat)}><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  </TableCell>
                </motion.tr>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? t('categories.editCategory') : t('categories.addCategory')}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('categories.categoryName')} *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('categories.exampleCategory')} />
            </div>
            <div className="space-y-2">
              <Label>{t('common.description')}</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('categories.descriptionPlaceholder')} />
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

      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) { setDeleteTarget(null); setDeleteInfo(null); setReassignTarget(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('categories.deleteConfirm')}</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {deleteInfo?.loading ? t('common.checking') :
               deleteInfo && deleteInfo.productCount > 0 ?
                t('categories.deleteUsedWarning', { count: deleteInfo.productCount })
                : t('common.irreversibleAction')}
            </p>
          </DialogHeader>
          {deleteInfo && deleteInfo.productCount > 0 && (
            <div className="space-y-2 py-2">
              <Label>{t('categories.reassignProducts')} ({t('common.optional')})</Label>
              <select value={reassignTarget} onChange={(e) => setReassignTarget(e.target.value)} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                <option value="">-- {t('categories.selectCategory')} --</option>
                {categories.filter((c) => c.id !== deleteTarget?.id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteTarget(null); setDeleteInfo(null); setReassignTarget(''); }}>{t('common.cancel')}</Button>
            <Button onClick={() => void handleDeleteConfirm()} disabled={deleteInfo?.loading}>Continue</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {confirmationDialog}
    </div>
  );
}
