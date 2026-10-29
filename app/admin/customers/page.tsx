'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Edit2, Trash2, Users, Search, Mail, Phone, Award, Wallet, Eye } from 'lucide-react';
import Link from 'next/link';
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
import type { Customer } from '@/types';
import { toast } from 'sonner';

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', address: '', membership: 'regular' });

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const { data } = await supabase.from('customers').select('*').order('name');
    setCustomers(data || []);
    setLoading(false);
  }

  const filtered = customers.filter((c) => !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.email?.toLowerCase().includes(search.toLowerCase()));

  const handleSave = async () => {
    if (!form.name) { toast.error('Name is required'); return; }
    if (editing) {
      await supabase.from('customers').update(form).eq('id', editing.id);
      toast.success('Customer updated');
    } else {
      await supabase.from('customers').insert({ ...form, status: 'active', reward_points: 0, wallet_balance: 0 });
      toast.success('Customer created');
    }
    setDialogOpen(false); setEditing(null); setForm({ name: '', email: '', phone: '', address: '', membership: 'regular' });
    loadData();
  };

  const handleDelete = async (id: string) => {
    await supabase.from('customers').delete().eq('id', id);
    toast.success('Customer deleted');
    loadData();
  };

  const membershipColors: Record<string, string> = {
    regular: 'bg-muted text-muted-foreground',
    silver: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
    gold: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold font-heading">Customers</h2>
          <p className="text-sm text-muted-foreground">Manage customer accounts and loyalty</p>
        </div>
        <Button size="sm" className="bg-gradient-to-r from-slate-800 to-black" onClick={() => { setEditing(null); setForm({ name: '', email: '', phone: '', address: '', membership: 'regular' }); setDialogOpen(true); }}>
          <Plus className="w-4 h-4 mr-2" /> Add Customer
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Customers', value: customers.length, icon: Users, color: 'from-slate-800 to-black' },
          { label: 'Gold Members', value: customers.filter((c) => c.membership === 'gold').length, icon: Award, color: 'from-amber-500 to-orange-600' },
          { label: 'Silver Members', value: customers.filter((c) => c.membership === 'silver').length, icon: Award, color: 'from-slate-500 to-slate-600' },
          { label: 'Total Wallet', value: `৳${customers.reduce((s, c) => s + Number(c.wallet_balance), 0).toFixed(2)}`, icon: Wallet, color: 'from-blue-500 to-cyan-600' },
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

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search customers..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Membership</TableHead>
              <TableHead>Total Purchase</TableHead>
              <TableHead>Total Due</TableHead>
              <TableHead>Reward Points</TableHead>
              <TableHead>Wallet</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>{Array.from({ length: 9 }).map((_, j) => <TableCell key={j}><div className="h-4 bg-muted rounded animate-pulse" /></TableCell>)}</TableRow>
            )) : filtered.map((c, i) => (
              <motion.tr key={c.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }} className="hover:bg-muted/50">
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell>
                  <div className="space-y-0.5">
                    {c.email && <p className="text-xs text-muted-foreground flex items-center gap-1"><Mail className="w-3 h-3" />{c.email}</p>}
                    {c.phone && <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</p>}
                  </div>
                </TableCell>
                <TableCell><Badge className={membershipColors[c.membership] || membershipColors.regular}>{c.membership}</Badge></TableCell>
                <TableCell className="font-medium">৳{Number(c.total_buy || 0).toFixed(2)}</TableCell>
                <TableCell className={Number(c.total_due || 0) > 0 ? 'font-medium text-amber-600' : 'text-muted-foreground'}>৳{Number(c.total_due || 0).toFixed(2)}</TableCell>
                <TableCell>{c.reward_points}</TableCell>
                <TableCell className="font-medium">৳{Number(c.wallet_balance || 0).toFixed(2)}</TableCell>
                <TableCell><Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">{c.status}</Badge></TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Link href={`/admin/customers/${c.id}`}>
                      <Button size="icon" variant="ghost" className="h-8 w-8" title="View profile"><Eye className="w-4 h-4" /></Button>
                    </Link>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setEditing(c); setForm({ name: c.name, email: c.email || '', phone: c.phone || '', address: c.address || '', membership: c.membership }); setDialogOpen(true); }}>
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-rose-600" onClick={() => handleDelete(c.id)}>
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
          <DialogHeader><DialogTitle>{editing ? 'Edit Customer' : 'Add Customer'}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2 col-span-2"><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="space-y-2"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="space-y-2"><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="space-y-2 col-span-2"><Label>Address</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
            <div className="space-y-2"><Label>Membership</Label>
              <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={form.membership} onChange={(e) => setForm({ ...form, membership: e.target.value })}>
                <option value="regular">Regular</option>
                <option value="silver">Silver</option>
                <option value="gold">Gold</option>
              </select>
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
