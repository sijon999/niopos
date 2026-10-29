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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/lib/supabase';
import type { Unit } from '@/types';
import { toast } from 'sonner';

export default function UnitsPage() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [filtered, setFiltered] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Unit | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Unit | null>(null);
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('active');
  const [saving, setSaving] = useState(false);

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
    if (!name.trim()) { toast.error('ইউনিট নাম আবশ্যক'); return; }
    if (!shortName.trim()) { toast.error('সংক্ষিপ্ত নাম আবশ্যক'); return; }
    setSaving(true);

    const dup = units.find((u) => u.name.toLowerCase() === name.toLowerCase().trim() && u.id !== editing?.id);
    if (dup) { toast.error('এই নামের ইউনিট ইতিমধ্যে বিদ্যমান'); setSaving(false); return; }

    if (editing) {
      const { error } = await supabase.from('units').update({ name, short_name: shortName, description, status }).eq('id', editing.id);
      if (error) { toast.error('আপডেট ব্যর্থ'); setSaving(false); return; }
      toast.success('ইউনিট সফলভাবে আপডেট হয়েছে');
    } else {
      const { error } = await supabase.from('units').insert({ name, short_name: shortName, description, status });
      if (error) { toast.error('তৈরি ব্যর্থ'); setSaving(false); return; }
      toast.success('ইউনিট সফলভাবে তৈরি হয়েছে');
    }
    setSaving(false);
    setDialogOpen(false);
    loadData();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { data: products } = await supabase.from('products').select('id').eq('unit', deleteTarget.short_name).limit(1);
    if (products && products.length > 0) {
      toast.error('এই ইউনিট বর্তমানে পণ্যে ব্যবহৃত হচ্ছে, মুছে ফেলা যাবে না');
      setDeleteTarget(null);
      return;
    }
    await supabase.from('units').delete().eq('id', deleteTarget.id);
    toast.success('ইউনিট সফলভাবে মুছে ফেলা হয়েছে');
    setDeleteTarget(null);
    loadData();
  };

  const exportCSV = () => {
    const headers = ['নাম', 'সংক্ষিপ্ত নাম', 'বর্ণনা', 'স্ট্যাটাস'];
    const rows = filtered.map((u) => [u.name, u.short_name, u.description || '', u.status]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'units.csv';
    link.click();
    toast.success('CSV ডাউনলোড হয়েছে');
  };

  const printUnits = () => {
    const win = window.open('', '_blank', 'width=800,height=600');
    if (!win) { toast.error('পপআপ অনুমোদন করুন'); return; }
    win.document.write(`<html><head><title>ইউনিট তালিকা</title><style>body{font-family:sans-serif;padding:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f5f5f5}</style></head><body><h2>ইউনিট তালিকা</h2><table><tr><th>নাম</th><th>সংক্ষিপ্ত নাম</th><th>বর্ণনা</th><th>স্ট্যাটাস</th></tr>${filtered.map((u) => `<tr><td>${u.name}</td><td>${u.short_name}</td><td>${u.description || ''}</td><td>${u.status}</td></tr>`).join('')}</table></body></html>`);
    win.document.close();
    win.print();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold font-heading">ইউনিট ব্যবস্থাপনা</h2>
          <p className="text-sm text-muted-foreground">সর্বমোট ইউনিট: {units.length} টি</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV}><Copy className="w-4 h-4 mr-2" /> CSV</Button>
          <Button variant="outline" size="sm" onClick={printUnits}><Printer className="w-4 h-4 mr-2" /> প্রিন্ট</Button>
          <Button size="sm" onClick={openNew} className="bg-indigo-600 hover:bg-indigo-700">
            <Plus className="w-4 h-4 mr-2" /> ইউনিট যোগ করুন
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
              <TableHead>ইউনিট নাম</TableHead>
              <TableHead>সংক্ষিপ্ত নাম</TableHead>
              <TableHead>বর্ণনা</TableHead>
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
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Ruler className="w-12 h-12 mb-3 opacity-50" />
                    <p>কোন ইউনিট পাওয়া যায়নি</p>
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
                      {unit.status === 'active' ? 'সক্রিয়' : 'নিষ্ক্রিয়'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(unit)}><Edit2 className="w-4 h-4" /></Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-rose-600" onClick={() => setDeleteTarget(unit)}><Trash2 className="w-4 h-4" /></Button>
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
          <DialogHeader><DialogTitle>{editing ? 'ইউনিট সম্পাদনা' : 'নতুন ইউনিট যোগ করুন'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>ইউনিট নাম *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="যেমন: Piece" />
            </div>
            <div className="space-y-2">
              <Label>সংক্ষিপ্ত নাম *</Label>
              <Input value={shortName} onChange={(e) => setShortName(e.target.value)} placeholder="যেমন: Pc(s)" />
            </div>
            <div className="space-y-2">
              <Label>বর্ণনা</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="ইউনিটের বর্ণনা" />
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

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>আপনি কি এই ইউনিটটি মুছে ফেলতে চান?</AlertDialogTitle>
            <AlertDialogDescription>এই কাজটি ফিরিয়ে আনা যাবে না। যদি এই ইউনিট কোন পণ্যে ব্যবহৃত হয়, তবে মুছে ফেলা যাবে না।</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>বাতিল</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-rose-600 hover:bg-rose-700">মুছে ফেলুন</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
