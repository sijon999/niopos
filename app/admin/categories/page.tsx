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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/lib/supabase';
import type { Category } from '@/types';
import { toast } from 'sonner';

export default function CategoriesPage() {
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
    if (!name.trim()) { toast.error('ক্যাটাগরি নাম আবশ্যক'); return; }
    setSaving(true);

    const dup = categories.find((c) => c.name.toLowerCase() === name.toLowerCase().trim() && c.id !== editing?.id);
    if (dup) { toast.error('এই নামের ক্যাটাগরি ইতিমধ্যে বিদ্যমান'); setSaving(false); return; }

    if (editing) {
      const { error } = await supabase.from('categories').update({ name, description, status }).eq('id', editing.id);
      if (error) { toast.error('আপডেট ব্যর্থ'); setSaving(false); return; }
      toast.success('ক্যাটাগরি সফলভাবে আপডেট হয়েছে');
    } else {
      const { error } = await supabase.from('categories').insert({ name, description, status });
      if (error) { toast.error('তৈরি ব্যর্থ'); setSaving(false); return; }
      toast.success('ক্যাটাগরি সফলভাবে তৈরি হয়েছে');
    }
    setSaving(false);
    setDialogOpen(false);
    loadData();
  };

  const handleDeleteCheck = async (cat: Category) => {
    setDeleteTarget(cat);
    setDeleteInfo({ productCount: 0, loading: true });
    const { count } = await supabase.from('products').select('*', { count: 'exact', head: true }).eq('category_id', cat.id).eq('is_deleted', false);
    setDeleteInfo({ productCount: count || 0, loading: false });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    if (deleteInfo && deleteInfo.productCount > 0 && reassignTarget) {
      await supabase.from('products').update({ category_id: reassignTarget }).eq('category_id', deleteTarget.id);
    }
    await supabase.from('categories').delete().eq('id', deleteTarget.id);
    toast.success('ক্যাটাগরি সফলভাবে মুছে ফেলা হয়েছে');
    setDeleteTarget(null);
    setDeleteInfo(null);
    setReassignTarget('');
    loadData();
  };

  const exportCSV = () => {
    const headers = ['ক্যাটাগরি নাম', 'বর্ণনা', 'স্ট্যাটাস', 'তারিখ'];
    const rows = filtered.map((c) => [c.name, c.description || '', c.status, new Date(c.created_at).toLocaleDateString()]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'categories.csv';
    link.click();
    toast.success('CSV ডাউনলোড হয়েছে');
  };

  const printCategories = () => {
    const win = window.open('', '_blank', 'width=800,height=600');
    if (!win) { toast.error('পপআপ অনুমোদন করুন'); return; }
    win.document.write(`<html><head><title>ক্যাটাগরি তালিকা</title><style>body{font-family:sans-serif;padding:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f5f5f5}</style></head><body><h2>পণ্যের ক্যাটাগরি</h2><table><tr><th>ক্রম</th><th>ক্যাটাগরি নাম</th><th>বর্ণনা</th><th>তারিখ</th></tr>${filtered.map((c, i) => `<tr><td>${i + 1}</td><td>${c.name}</td><td>${c.description || ''}</td><td>${new Date(c.created_at).toLocaleDateString()}</td></tr>`).join('')}</table></body></html>`);
    win.document.close();
    win.print();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold font-heading">পণ্যের ক্যাটাগরি</h2>
          <p className="text-sm text-muted-foreground">সর্বমোট ক্যাটাগরি: {categories.length} টি</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV}><Copy className="w-4 h-4 mr-2" /> CSV</Button>
          <Button variant="outline" size="sm" onClick={printCategories}><Printer className="w-4 h-4 mr-2" /> প্রিন্ট</Button>
          <Button size="sm" onClick={openNew} className="bg-indigo-600 hover:bg-indigo-700">
            <Plus className="w-4 h-4 mr-2" /> পণ্যের ক্যাটাগরি
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
              <TableHead>ক্যাটাগরি নাম</TableHead>
              <TableHead>বর্ণনা</TableHead>
              <TableHead>তারিখ</TableHead>
              <TableHead>এখন</TableHead>
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
                    <Tags className="w-12 h-12 mb-3 opacity-50" />
                    <p>কোন ক্যাটাগরি পাওয়া যায়নি</p>
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
                  <TableCell className="text-sm text-muted-foreground">{new Date(cat.created_at).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Badge variant={cat.status === 'active' ? 'secondary' : 'outline'} className={cat.status === 'active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : ''}>
                      {cat.status === 'active' ? 'সক্রিয়' : 'নিষ্ক্রিয়'}
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
          <DialogHeader><DialogTitle>{editing ? 'ক্যাটাগরি সম্পাদনা' : 'নতুন ক্যাটাগরি যোগ করুন'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>ক্যাটাগরি নাম *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="যেমন: Panjabi" />
            </div>
            <div className="space-y-2">
              <Label>বর্ণনা</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="ক্যাটাগরির বর্ণনা" />
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

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) { setDeleteTarget(null); setDeleteInfo(null); setReassignTarget(''); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>আপনি কি এই ক্যাটাগরিটি মুছে ফেলতে চান?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteInfo?.loading ? 'যাচাই হচ্ছে...' :
               deleteInfo && deleteInfo.productCount > 0 ?
                `এই ক্যাটাগরি বর্তমানে ${deleteInfo.productCount} টি পণ্যে ব্যবহৃত হচ্ছে। মুছে ফেলার আগে পণ্যগুলো অন্য ক্যাটাগরিতে সরিয়ে নিন অথবা শুধু ক্যাটাগরি মুছে ফেলুন।`
                : 'এই কাজটি ফিরিয়ে আনা যাবে না।'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteInfo && deleteInfo.productCount > 0 && (
            <div className="space-y-2 py-2">
              <Label>পণ্য সরিয়ে নিন (ঐচ্ছিক)</Label>
              <select value={reassignTarget} onChange={(e) => setReassignTarget(e.target.value)} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                <option value="">-- ক্যাটাগরি সিলেক্ট করুন --</option>
                {categories.filter((c) => c.id !== deleteTarget?.id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>বাতিল</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-rose-600 hover:bg-rose-700">মুছে ফেলুন</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
