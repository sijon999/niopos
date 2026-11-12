'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Edit2, Trash2, UserCog, Mail, Phone } from 'lucide-react';
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
import type { Employee } from '@/types';
import { toast } from 'sonner';
import EmployeeAccessPanel from './employee-access-panel';
import { useTranslation } from '@/hooks/use-translation';
import { useConfirmation } from '@/hooks/use-confirmation';

const roleColors: Record<string, string> = {
  super_admin: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
  store_manager: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  cashier: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  inventory_manager: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  customer: 'bg-muted text-muted-foreground',
};

export default function EmployeesPage() {
  const { t, locale } = useTranslation();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', role: 'cashier', salary: '' });
  const { confirmUpdate, confirmDelete, dialog: confirmationDialog } = useConfirmation();

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const { data } = await supabase.from('employees').select('*').order('name');
    setEmployees(data || []);
    setLoading(false);
  }

  const handleSave = async () => {
    if (!form.name) { toast.error(t('employees.nameRequired')); return; }
    const payload = { ...form, salary: Number(form.salary) || 0 };
    if (editing) {
      const employeeId = editing.id;
      await confirmUpdate({
        successMessage: t('employees.updateSuccess'),
        action: async () => {
          const { error } = await supabase.from('employees').update(payload).eq('id', employeeId);
          if (error) throw error;
          setDialogOpen(false);
          setEditing(null);
          setForm({ name: '', email: '', phone: '', role: 'cashier', salary: '' });
          await loadData();
        },
      });
      return;
    } else {
      const { error: insertError } = await supabase
        .from('employees')
        .insert({ ...payload, status: 'active' });
      if (insertError) {
        toast.error(t('common.createFailed'));
        return;
      }
      toast.success(t('employees.createSuccess'));
    }
    setDialogOpen(false); setEditing(null); setForm({ name: '', email: '', phone: '', role: 'cashier', salary: '' });
    loadData();
  };

  const handleDelete = async (id: string) => {
    const employee = employees.find((item) => item.id === id);
    await confirmDelete({
      recordName: employee?.name || id,
      successMessage: t('employees.deleteSuccess'),
      action: async () => {
        const { error } = await supabase.from('employees').delete().eq('id', id);
        if (error) throw error;
        await loadData();
      },
    });
  };

  return (
    <div className="space-y-6">
      <EmployeeAccessPanel />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold font-heading">{t('employees.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('employees.subtitle')}</p>
        </div>
        <Button size="sm" className="bg-gradient-to-r from-slate-800 to-black" onClick={() => { setEditing(null); setForm({ name: '', email: '', phone: '', role: 'cashier', salary: '' }); setDialogOpen(true); }}>
          <Plus className="w-4 h-4 mr-2" /> {t('employees.addEmployee')}
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: t('employees.totalStaff'), value: employees.length, color: 'from-slate-800 to-black' },
          { label: t('employees.managers'), value: employees.filter((e) => e.role === 'store_manager').length, color: 'from-blue-500 to-cyan-600' },
          { label: t('employees.cashiers'), value: employees.filter((e) => e.role === 'cashier').length, color: 'from-amber-500 to-orange-600' },
          { label: t('employees.totalPayroll'), value: `৳${employees.reduce((s, e) => s + Number(e.salary), 0).toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-US')}`, color: 'from-rose-500 to-pink-600' },
        ].map((stat, i) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${stat.color} flex items-center justify-center`}>
                  <UserCog className="w-5 h-5 text-white" />
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
              <TableHead>{t('common.name')}</TableHead>
              <TableHead>{t('common.contact')}</TableHead>
              <TableHead>{t('employees.role')}</TableHead>
              <TableHead>{t('employees.salary')}</TableHead>
              <TableHead>{t('common.status')}</TableHead>
              <TableHead className="text-right">{t('common.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>{Array.from({ length: 6 }).map((_, j) => <TableCell key={j}><div className="h-4 bg-muted rounded animate-pulse" /></TableCell>)}</TableRow>
            )) : employees.map((e, i) => (
              <motion.tr key={e.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }} className="hover:bg-muted/50">
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-800 to-black flex items-center justify-center text-white text-xs font-bold">
                      {e.name.charAt(0)}
                    </div>
                    {e.name}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="space-y-0.5">
                    {e.email && <p className="text-xs text-muted-foreground flex items-center gap-1"><Mail className="w-3 h-3" />{e.email}</p>}
                    {e.phone && <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" />{e.phone}</p>}
                  </div>
                </TableCell>
                <TableCell><Badge className={roleColors[e.role] || roleColors.cashier}>{t(`employees.roles.${e.role}`)}</Badge></TableCell>
                <TableCell className="font-medium">৳${Number(e.salary).toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-US')}</TableCell>
                <TableCell><Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">{t(e.status === 'active' ? 'common.active' : 'common.inactive')}</Badge></TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setEditing(e); setForm({ name: e.name, email: e.email || '', phone: e.phone || '', role: e.role, salary: String(e.salary) }); setDialogOpen(true); }}>
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
          <DialogHeader><DialogTitle>{editing ? t('employees.editEmployee') : t('employees.addEmployee')}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2 col-span-2"><Label>{t('common.name')} *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="space-y-2"><Label>{t('common.email')}</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="space-y-2"><Label>{t('common.phone')}</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="space-y-2"><Label>{t('employees.role')}</Label>
              <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="cashier">{t('employees.roles.cashier')}</option>
                <option value="store_manager">{t('employees.roles.store_manager')}</option>
                <option value="inventory_manager">{t('employees.roles.inventory_manager')}</option>
                <option value="super_admin">{t('employees.roles.super_admin')}</option>
              </select>
            </div>
            <div className="space-y-2"><Label>{t('employees.salary')}</Label><Input type="number" value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })} /></div>
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
