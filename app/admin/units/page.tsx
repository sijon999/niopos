'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Edit2, Trash2, Ruler, Search, Copy, FileSpreadsheet, Printer } from 'lucide-react';
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
import type { Unit } from '@/types';
import { toast } from 'sonner';
import { useTranslation } from '@/hooks/use-translation';
import { useConfirmation } from '@/hooks/use-confirmation';

export default function UnitsPage() {
  const { t, locale } = useTranslation();
  const [units, setUnits] = useState<Unit[]>([]);
  const [filtered, setFiltered] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Unit | null>(null);
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('active');
  const [saving, setSaving] = useState(false);
  const { confirmUpdate, confirmDelete, dialog: confirmationDialog } = useConfirmation();

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const { data } = await supabase.from('units').select('*').order('created_at', { ascending: false });
    setUnits(data || []);
    setFiltered(data || []);
    setLoading(false);
  }

  useEffect(() => {
    if (!search) { setFiltered(units); return; }
    const q = search.toLowerCase();
    setFiltered(units.filter((u) => u.name.toLowerCase().includes(q) || u.short_name.toLowerCase().includes(q)));
  }, [search, units]);

  const openNew = () => {
    setEditing(null);
    setName(''); setShortName(''); setDescription(''); setStatus('active');
    setDialogOpen(true);
  };

  const openEdit = (unit: Unit) => {
    setEditing(unit);
    setName(unit.name); setShortName(unit.short_name); setDescription(unit.description || ''); setStatus(unit.status);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error(t('units.nameRequired')); return; }
    if (!shortName.trim()) { toast.error(t('units.shortNameRequired')); return; }
    const dup = units.find((u) => u.name.toLowerCase() === name.toLowerCase().trim() && u.id !== editing?.id);
    if (dup) { toast.error(t('units.nameExists')); return; }

    if (editing) {
      const unitId = editing.id;
      await confirmUpdate({
        successMessage: t('units.updateSuccess'),
        action: async () => {
          setSaving(true);
          try {
            const { error } = await supabase.from('units').update({ name, short_name: shortName, description, status }).eq('id', unitId);
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
    const { error } = await supabase.from('units').insert({ name, short_name: shortName, description, status });
    if (error) { toast.error(t('common.createFailed')); setSaving(false); return; }
    toast.success(t('units.createSuccess'));
    setSaving(false);
    setDialogOpen(false);
    loadData();
  };

  const handleDelete = async (unit: Unit) => {
    const { data: products, error } = await supabase.from('products').select('id').eq('unit', unit.short_name).limit(1);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (products && products.length > 0) {
      toast.error(t('units.deleteUsedWarning'));
      return;
    }
    await confirmDelete({
      recordName: unit.name,
      successMessage: t('units.deleteSuccess'),
      action: async () => {
        const { error: deleteError } = await supabase.from('units').delete().eq('id', unit.id);
        if (deleteError) throw deleteError;
        await loadData();
      },
    });
  };

  const exportCSV = () => {
    const headers = [t('common.name'), t('units.shortName'), t('common.description'), t('common.status')];
    const rows = filtered.map((u) => [u.name, u.short_name, u.description || '', t(u.status === 'active' ? 'common.active' : 'common.inactive')]);
    const csv = [headers, ...rows].map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');
    const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'units.csv';
    link.click();
    toast.success(t('common.csvDownloaded'));
  };

  const printUnits = () => {
    const win = window.open('', '_blank', 'width=800,height=600');
    if (!win) { toast.error(t('common.allowPopups')); return; }
    const headers = [t('common.name'), t('units.shortName'), t('common.description'), t('common.status')];
    win.document.write(`<html lang="${locale}"><head><meta charset="utf-8"><title>${escapeHtml(t('units.title'))}</title><style>body{font-family:${locale === 'bn' ? "'Noto Sans Bengali',sans-serif" : 'sans-serif'};padding:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f5f5f5}</style></head><body><h2>${escapeHtml(t('units.title'))}</h2><table><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr>${filtered.map((unit) => `<tr><td>${escapeHtml(unit.name)}</td><td>${escapeHtml(unit.short_name)}</td><td>${escapeHtml(unit.description)}</td><td>${escapeHtml(t(unit.status === 'active' ? 'common.active' : 'common.inactive'))}</td></tr>`).join('')}</table></body></html>`);
    win.document.close();
    win.print();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold font-heading">{t('units.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('units.totalCount', { count: units.length })}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV}><Copy className="w-4 h-4 mr-2" /> CSV</Button>
          <Button variant="outline" size="sm" onClick={printUnits}><Printer className="w-4 h-4 mr-2" /> {t('common.print')}</Button>
          <Button size="sm" onClick={openNew} className="bg-indigo-600 hover:bg-indigo-700">
            <Plus className="w-4 h-4 mr-2" /> {t('units.addUnit')}
          </Button>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder={t('units.search')} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">{t('units.serial')}</TableHead>
              <TableHead>{t('units.unitName')}</TableHead>
              <TableHead>{t('units.shortName')}</TableHead>
              <TableHead>{t('common.description')}</TableHead>
              <TableHead>{t('common.status')}</TableHead>
              <TableHead className="text-right">{t('units.actions')}</TableHead>
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
                    <Ruler className="w-12 h-12 mb-3 opacity-50" />
                    <p>{t('units.noUnits')}</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((unit, i) => (
                <motion.tr key={unit.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }} className="hover:bg-muted/50">
                  <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="font-medium">{unit.name}</TableCell>
                  <TableCell><Badge variant="secondary" className="bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">{unit.short_name}</Badge></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{unit.description || '-'}</TableCell>
                  <TableCell>
                    <Badge variant={unit.status === 'active' ? 'secondary' : 'outline'} className={unit.status === 'active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : ''}>
                      {t(unit.status === 'active' ? 'common.active' : 'common.inactive')}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(unit)}><Edit2 className="w-4 h-4" /></Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-rose-600" onClick={() => void handleDelete(unit)}><Trash2 className="w-4 h-4" /></Button>
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
          <DialogHeader><DialogTitle>{editing ? t('units.editUnit') : t('units.addUnit')}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('units.unitName')} *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('units.namePlaceholder')} />
            </div>
            <div className="space-y-2">
              <Label>{t('units.shortName')} *</Label>
              <Input value={shortName} onChange={(e) => setShortName(e.target.value)} placeholder={t('units.shortNamePlaceholder')} />
            </div>
            <div className="space-y-2">
              <Label>{t('common.description')}</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('units.descriptionPlaceholder')} />
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

      {confirmationDialog}
    </div>
  );
}
