'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Plus, Edit2, Trash2, CreditCard, Receipt } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';
import type { Expense, ExpenseCategory } from '@/types';
import { toast } from 'sonner';

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [form, setForm] = useState({ category_id: '', description: '', amount: '', date: new Date().toISOString().slice(0, 10) });

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const [expRes, catRes] = await Promise.all([
      supabase.from('expenses').select('*, expense_categories(name)').order('date', { ascending: false }),
      supabase.from('expense_categories').select('*').order('name'),
    ]);
    setExpenses(expRes.data || []);
    setCategories(catRes.data || []);
    setLoading(false);
  }

  const totalThisMonth = expenses
    .filter((e) => new Date(e.date).getMonth() === new Date().getMonth())
    .reduce((sum, e) => sum + Number(e.amount), 0);
  const totalAllTime = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

  const handleSave = async () => {
    if (!form.amount || !form.category_id) { toast.error('Amount and category are required'); return; }
    const payload = { category_id: form.category_id, description: form.description, amount: Number(form.amount), date: form.date };
    if (editing) {
      await supabase.from('expenses').update(payload).eq('id', editing.id);
      toast.success('Expense updated');
    } else {
      await supabase.from('expenses').insert(payload);
      toast.success('Expense created');
    }
    setDialogOpen(false); setEditing(null); setForm({ category_id: '', description: '', amount: '', date: new Date().toISOString().slice(0, 10) });
    loadData();
  };

  const handleDelete = async (id: string) => {
    await supabase.from('expenses').delete().eq('id', id);
    toast.success('Expense deleted');
    loadData();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold font-heading">Expenses</h2>
          <p className="text-sm text-muted-foreground">Track business expenses</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link href="/admin/reports/purchase-expense"><Button variant="outline" size="sm">View Outflow Report</Button></Link>
          <Button size="sm" className="bg-gradient-to-r from-slate-800 to-black" onClick={() => { setEditing(null); setForm({ category_id: '', description: '', amount: '', date: new Date().toISOString().slice(0, 10) }); setDialogOpen(true); }}>
            <Plus className="w-4 h-4 mr-2" /> Add Expense
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'This Month', value: `৳${totalThisMonth.toFixed(2)}`, icon: CreditCard, color: 'from-rose-500 to-pink-600' },
          { label: 'All Time', value: `৳${totalAllTime.toFixed(2)}`, icon: Receipt, color: 'from-amber-500 to-orange-600' },
          { label: 'Categories', value: categories.length, icon: CreditCard, color: 'from-blue-500 to-cyan-600' },
        ].map((stat, i) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${stat.color} flex items-center justify-center`}>
                  <stat.icon className="w-5 h-5 text-white" />
                </div>
                <div><p className="text-xs text-muted-foreground">{stat.label}</p><p className="text-xl font-bold">{stat.value}</p></div>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>{Array.from({ length: 5 }).map((_, j) => <TableCell key={j}><div className="h-4 bg-muted rounded animate-pulse" /></TableCell>)}</TableRow>
            )) : expenses.map((e, i) => (
              <motion.tr key={e.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }} className="hover:bg-muted/50">
                <TableCell className="text-sm">{new Date(e.date).toLocaleDateString()}</TableCell>
                <TableCell><Badge variant="secondary">{e.expense_categories?.name || 'Other'}</Badge></TableCell>
                <TableCell className="text-sm">{e.description || '-'}</TableCell>
                <TableCell className="font-bold text-rose-600">৳${Number(e.amount).toFixed(2)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setEditing(e); setForm({ category_id: e.category_id || '', description: e.description || '', amount: String(e.amount), date: e.date }); setDialogOpen(true); }}>
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-rose-600" onClick={() => handleDelete(e.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </TableCell>
              </motion.tr>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? 'Edit Expense' : 'Add Expense'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Category *</Label>
              <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
                <option value="">Select category</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="space-y-2"><Label>Description</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Amount *</Label><Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
              <div className="space-y-2"><Label>Date</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button className="bg-gradient-to-r from-slate-800 to-black" onClick={handleSave}>{editing ? 'Update' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
