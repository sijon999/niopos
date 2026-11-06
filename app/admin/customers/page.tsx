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
import { useTranslation } from '@/hooks/use-translation';
import { useConfirmation } from '@/hooks/use-confirmation';

export default function CustomersPage() {
  const { t, locale } = useTranslation();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', address: '', membership: 'regular' });
  const { confirmUpdate, confirmDelete, dialog: confirmationDialog } = useConfirmation();

  const normalizePhone = (phone: string) => phone.replace(/[^0-9]/g, '');

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const { data } = await supabase.from('customers').select('*').order('name');
    setCustomers(data || []);
    setLoading(false);
  }

  const filtered = customers.filter((c) => !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.email?.toLowerCase().includes(search.toLowerCase()));

  const handleSave = async () => {
    if (!form.name) { toast.error(t('customers.nameRequired')); return; }
    const { data: storeId, error: storeError } = await supabase.rpc('get_my_store_id');
    if (storeError || !storeId) {
      console.error('Could not determine the current store for customer validation', storeError);
      toast.error('Could not verify this customer for the current store. Please try again.');
      return;
    }

    const normalizedPhone = normalizePhone(form.phone);
    const shouldCheckPhone = normalizedPhone
      && (!editing || normalizedPhone !== normalizePhone(editing.phone || ''));
    if (shouldCheckPhone) {
      let duplicateQuery = supabase
        .from('customers')
        .select('id')
        .eq('store_id', storeId)
        .eq('phone_normalized', normalizedPhone);
      if (editing) duplicateQuery = duplicateQuery.neq('id', editing.id);

      const { data: duplicate, error: duplicateError } = await duplicateQuery.limit(1).maybeSingle();
      if (duplicateError) {
        console.error('Could not check for duplicate customer mobile number', duplicateError);
        toast.error('Could not verify this mobile number. Please try again.');
        return;
      }
      if (duplicate) {
        toast.error('This mobile number is already registered with another customer.');
        return;
      }
    }

    if (editing) {
      const customerIdToUpdate = editing.id;
      await confirmUpdate({
        successMessage: t('customers.updateSuccess'),
        action: async () => {
          const { error } = await supabase.from('customers').update(form).eq('id', customerIdToUpdate).eq('store_id', storeId);
          if (error) {
            if (error.code === '23505' && error.message.includes('customers_store_phone_normalized_uidx')) {
              throw new Error('This mobile number is already registered with another customer.');
            }
            console.error('Could not update customer', error);
            throw new Error('Could not update customer. Please try again.');
          }
          setDialogOpen(false);
          setEditing(null);
          setForm({ name: '', email: '', phone: '', address: '', membership: 'regular' });
          await loadData();
        },
      });
      return;
    } else {
      const { error } = await supabase.from('customers').insert({ ...form, store_id: storeId, status: 'active', reward_points: 0, wallet_balance: 0 });
      if (error) {
        if (error.code === '23505' && error.message.includes('customers_store_phone_normalized_uidx')) {
          toast.error('This mobile number is already registered with another customer.');
        } else {
          console.error('Could not create customer', error);
          toast.error('Could not create customer. Please try again.');
        }
        return;
      }
      toast.success(t('customers.createSuccess'));
    }
    setDialogOpen(false); setEditing(null); setForm({ name: '', email: '', phone: '', address: '', membership: 'regular' });
    loadData();
  };

  const handleDelete = async (id: string) => {
    const customer = customers.find((item) => item.id === id);
    await confirmDelete({
      recordName: customer?.name || id,
      successMessage: t('customers.deleteSuccess'),
      action: async () => {
        const { error } = await supabase.from('customers').delete().eq('id', id);
        if (error) throw error;
        await loadData();
      },
    });
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
          <h2 className="text-2xl font-bold font-heading">{t('customers.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('customers.subtitle')}</p>
        </div>
        <Button size="sm" className="bg-gradient-to-r from-slate-800 to-black" onClick={() => { setEditing(null); setForm({ name: '', email: '', phone: '', address: '', membership: 'regular' }); setDialogOpen(true); }}>
          <Plus className="w-4 h-4 mr-2" /> {t('customers.addCustomer')}
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: t('dashboard.totalCustomers'), value: customers.length, icon: Users, color: 'from-slate-800 to-black' },
          { label: t('customers.goldMembers'), value: customers.filter((c) => c.membership === 'gold').length, icon: Award, color: 'from-amber-500 to-orange-600' },
          { label: t('customers.silverMembers'), value: customers.filter((c) => c.membership === 'silver').length, icon: Award, color: 'from-slate-500 to-slate-600' },
          { label: t('customers.totalWallet'), value: `৳${customers.reduce((s, c) => s + Number(c.wallet_balance), 0).toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: Wallet, color: 'from-blue-500 to-cyan-600' },
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
        <Input placeholder={t('customers.search')} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('common.name')}</TableHead>
              <TableHead>{t('common.contact')}</TableHead>
              <TableHead>{t('customers.membership')}</TableHead>
              <TableHead>{t('customers.totalPurchases')}</TableHead>
              <TableHead>{t('customers.totalDue')}</TableHead>
              <TableHead>{t('customers.rewardPoints')}</TableHead>
              <TableHead>{t('customers.wallet')}</TableHead>
              <TableHead>{t('common.status')}</TableHead>
              <TableHead className="text-right">{t('common.actions')}</TableHead>
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
                <TableCell><Badge className={membershipColors[c.membership] || membershipColors.regular}>{t(`customers.membershipLevels.${c.membership}`)}</Badge></TableCell>
                <TableCell className="font-medium">৳{Number(c.total_buy || 0).toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                <TableCell className={Number(c.total_due || 0) > 0 ? 'font-medium text-amber-600' : 'text-muted-foreground'}>৳{Number(c.total_due || 0).toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                <TableCell>{c.reward_points}</TableCell>
                <TableCell className="font-medium">৳{Number(c.wallet_balance || 0).toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                <TableCell><Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">{t(c.status === 'active' ? 'common.active' : 'common.inactive')}</Badge></TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Link href={`/admin/customers/${c.id}`}>
                      <Button size="icon" variant="ghost" className="h-8 w-8" title={t('customers.viewProfile')}><Eye className="w-4 h-4" /></Button>
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
          <DialogHeader><DialogTitle>{editing ? t('customers.editCustomer') : t('customers.addCustomer')}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2 col-span-2"><Label>{t('common.name')} *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="space-y-2"><Label>{t('common.email')}</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="space-y-2"><Label>{t('common.phone')}</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="space-y-2 col-span-2"><Label>{t('common.address')}</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
            <div className="space-y-2"><Label>{t('customers.membership')}</Label>
              <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={form.membership} onChange={(e) => setForm({ ...form, membership: e.target.value })}>
                <option value="regular">{t('customers.membershipLevels.regular')}</option>
                <option value="silver">{t('customers.membershipLevels.silver')}</option>
                <option value="gold">{t('customers.membershipLevels.gold')}</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('common.cancel')}</Button>
            <Button className="bg-gradient-to-r from-slate-800 to-black" onClick={handleSave}>{editing ? t('common.update') : t('common.create')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {confirmationDialog}
    </div>
  );
}
