'use client';

import { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Plus, Edit2, Trash2, Search, Gift, Percent, DollarSign,
  Power, Eye, X, Users, CheckCircle2,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';
import type { DiscountOffer } from '@/lib/discount';
import type { Customer } from '@/types';
import { toast } from 'sonner';

type OfferUsage = {
  id: string;
  offer_id: string;
  customer_id: string | null;
  sale_id: string | null;
  discount_amount: number;
  discount_value: number;
  discount_type: string;
  used_at: string;
  discount_offers?: { name: string } | null;
  customers?: { name: string } | null;
  sales?: { invoice_number: string; sale_date: string } | null;
};

const emptyForm = {
  name: '', description: '', code: '',
  discount_type: 'percentage', discount_value: '',
  minimum_purchase: '', maximum_discount: '',
  start_date: new Date().toISOString().slice(0, 10),
  end_date: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
  status: 'active',
  eligibility_type: 'all',
  max_usage: '', max_usage_per_customer: '',
  unlimited_usage: false,
};

export default function DiscountOffersPage() {
  const [offers, setOffers] = useState<DiscountOffer[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [assignedCustomerIds, setAssignedCustomerIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [eligibilityFilter, setEligibilityFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DiscountOffer | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [customerSearch, setCustomerSearch] = useState('');
  const [detailOffer, setDetailOffer] = useState<DiscountOffer | null>(null);
  const [usageRecords, setUsageRecords] = useState<OfferUsage[]>([]);
  const [usageLoading, setUsageLoading] = useState(false);

  useEffect(() => { loadOffers(); loadCustomers(); }, []);

  async function loadOffers() {
    const { data } = await supabase.from('discount_offers').select('*').order('created_at', { ascending: false });
    setOffers((data || []) as DiscountOffer[]);
    setLoading(false);
  }

  async function loadCustomers() {
    const { data } = await supabase.from('customers').select('*').order('name');
    setCustomers(data || []);
  }

  async function loadAssignedCustomers(offerId: string) {
    const { data } = await supabase.from('customer_discount_offers').select('customer_id').eq('offer_id', offerId);
    setAssignedCustomerIds((data || []).map((r: any) => r.customer_id));
  }

  const today = new Date().toISOString().slice(0, 10);

  const filtered = useMemo(() => {
    return offers.filter((o) => {
      if (search && !o.name.toLowerCase().includes(search.toLowerCase()) && !o.code?.toLowerCase().includes(search.toLowerCase())) return false;
      if (statusFilter !== 'all') {
        if (statusFilter === 'active' && o.status !== 'active') return false;
        if (statusFilter === 'inactive' && o.status !== 'inactive') return false;
        if (statusFilter === 'expired' && o.end_date >= today) return false;
        if (statusFilter === 'upcoming' && o.start_date <= today) return false;
      }
      if (typeFilter !== 'all' && o.discount_type !== typeFilter) return false;
      if (eligibilityFilter !== 'all' && o.eligibility_type !== eligibilityFilter) return false;
      return true;
    });
  }, [offers, search, statusFilter, typeFilter, eligibilityFilter, today]);

  const stats = useMemo(() => {
    const active = offers.filter((o) => o.status === 'active' && o.end_date >= today && o.start_date <= today).length;
    const expired = offers.filter((o) => o.end_date < today).length;
    const upcoming = offers.filter((o) => o.start_date > today).length;
    const totalUsage = offers.reduce((s, o) => s + o.usage_count, 0);
    return { total: offers.length, active, expired, upcoming, totalUsage };
  }, [offers, today]);

  const filteredCustomers = useMemo(() => {
    if (!customerSearch) return customers;
    const q = customerSearch.toLowerCase();
    return customers.filter((c) => c.name.toLowerCase().includes(q) || c.phone?.includes(customerSearch));
  }, [customers, customerSearch]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setAssignedCustomerIds([]);
    setCustomerSearch('');
    setDialogOpen(true);
  };

  const openEdit = (offer: DiscountOffer) => {
    setEditing(offer);
    setForm({
      name: offer.name, description: offer.description || '', code: offer.code || '',
      discount_type: offer.discount_type, discount_value: String(offer.discount_value),
      minimum_purchase: String(offer.minimum_purchase), maximum_discount: String(offer.maximum_discount),
      start_date: offer.start_date, end_date: offer.end_date,
      status: offer.status, eligibility_type: offer.eligibility_type,
      max_usage: offer.max_usage ? String(offer.max_usage) : '',
      max_usage_per_customer: offer.max_usage_per_customer ? String(offer.max_usage_per_customer) : '',
      unlimited_usage: offer.unlimited_usage,
    });
    loadAssignedCustomers(offer.id);
    setCustomerSearch('');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.discount_value) { toast.error('Name and discount value are required'); return; }
    if (form.end_date < form.start_date) { toast.error('End date cannot be before start date'); return; }

    const payload: any = {
      name: form.name, description: form.description || null, code: form.code || null,
      discount_type: form.discount_type,
      discount_value: Number(form.discount_value),
      minimum_purchase: Number(form.minimum_purchase) || 0,
      maximum_discount: Number(form.maximum_discount) || 0,
      start_date: form.start_date, end_date: form.end_date,
      status: form.status, eligibility_type: form.eligibility_type,
      max_usage: form.max_usage ? Number(form.max_usage) : null,
      max_usage_per_customer: form.max_usage_per_customer ? Number(form.max_usage_per_customer) : null,
      unlimited_usage: form.unlimited_usage,
    };

    let offerId = editing?.id;
    if (editing) {
      await supabase.from('discount_offers').update(payload).eq('id', editing.id);
      toast.success('Offer updated');
    } else {
      const { data } = await supabase.from('discount_offers').insert(payload).select().single();
      if (data) offerId = data.id;
      toast.success('Offer created');
    }

    if (offerId && form.eligibility_type === 'selected') {
      await supabase.from('customer_discount_offers').delete().eq('offer_id', offerId);
      if (assignedCustomerIds.length > 0) {
        const assignments = assignedCustomerIds.map((cid) => ({
          customer_id: cid, offer_id: offerId, status: 'active',
        }));
        await supabase.from('customer_discount_offers').insert(assignments);
      }
    } else if (offerId && editing && form.eligibility_type !== 'selected') {
      await supabase.from('customer_discount_offers').delete().eq('offer_id', offerId);
    }

    setDialogOpen(false);
    setEditing(null);
    setForm(emptyForm);
    setAssignedCustomerIds([]);
    loadOffers();
  };

  const handleDelete = async (id: string) => {
    await supabase.from('discount_offers').delete().eq('id', id);
    toast.success('Offer deleted');
    loadOffers();
  };

  const toggleStatus = async (offer: DiscountOffer) => {
    const newStatus = offer.status === 'active' ? 'inactive' : 'active';
    await supabase.from('discount_offers').update({ status: newStatus }).eq('id', offer.id);
    toast.success(`Offer ${newStatus === 'active' ? 'activated' : 'deactivated'}`);
    loadOffers();
  };

  const viewDetail = async (offer: DiscountOffer) => {
    setDetailOffer(offer);
    setUsageLoading(true);
    const { data } = await supabase
      .from('discount_offer_usage')
      .select('*, discount_offers(name), customers(name), sales(invoice_number, sale_date)')
      .eq('offer_id', offer.id)
      .order('used_at', { ascending: false });
    setUsageRecords((data || []) as OfferUsage[]);
    setUsageLoading(false);
  };

  const toggleCustomer = (id: string) => {
    setAssignedCustomerIds((prev) => prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold font-heading">Discount Offers</h2>
          <p className="text-sm text-muted-foreground">Create and manage promotional offers for customers</p>
        </div>
        <Button size="sm" className="bg-gradient-to-r from-slate-800 to-black" onClick={openCreate}>
          <Plus className="w-4 h-4 mr-2" /> Create Offer
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Total Offers', value: stats.total, icon: Gift, color: 'from-slate-800 to-black' },
          { label: 'Active', value: stats.active, icon: CheckCircle2, color: 'from-emerald-500 to-green-600' },
          { label: 'Expired', value: stats.expired, icon: X, color: 'from-rose-500 to-pink-600' },
          { label: 'Upcoming', value: stats.upcoming, icon: Percent, color: 'from-blue-500 to-cyan-600' },
          { label: 'Total Usage', value: stats.totalUsage, icon: Users, color: 'from-amber-500 to-orange-600' },
          { label: 'Total Discount', value: `৳${usageRecords.reduce((s, r) => s + Number(r.discount_amount), 0).toFixed(0)}`, icon: DollarSign, color: 'from-violet-500 to-purple-600' },
        ].map((stat, i) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card className="p-4">
              <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${stat.color} mb-2 flex items-center justify-center`}>
                <stat.icon className="w-4 h-4 text-white" />
              </div>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className="text-lg font-bold">{stat.value}</p>
            </Card>
          </motion.div>
        ))}
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search offers by name or code..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="expired">Expired</option>
            <option value="upcoming">Upcoming</option>
          </select>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
            <option value="all">All Types</option>
            <option value="percentage">Percentage</option>
            <option value="fixed">Fixed Amount</option>
          </select>
          <select value={eligibilityFilter} onChange={(e) => setEligibilityFilter(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
            <option value="all">All Eligibility</option>
            <option value="all_customers">All Customers</option>
            <option value="selected">Selected</option>
            <option value="group">Group</option>
            <option value="new">New</option>
            <option value="returning">Returning</option>
          </select>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Offer Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Discount</TableHead>
                <TableHead>Min Purchase</TableHead>
                <TableHead>Max Discount</TableHead>
                <TableHead>Eligibility</TableHead>
                <TableHead>Valid Period</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Usage</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 10 }).map((_, j) => <TableCell key={j}><div className="h-4 bg-muted rounded animate-pulse" /></TableCell>)}</TableRow>
              )) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="py-12 text-center text-muted-foreground">
                    <Gift className="w-12 h-12 mx-auto mb-3 opacity-40" />
                    <p>No offers found</p>
                    <Button size="sm" variant="outline" className="mt-3" onClick={openCreate}>Create your first offer</Button>
                  </TableCell>
                </TableRow>
              ) : filtered.map((offer, i) => {
                const isExpired = offer.end_date < today;
                const isUpcoming = offer.start_date > today;
                const statusBadge = isExpired ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400' : isUpcoming ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : offer.status === 'active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-muted text-muted-foreground';
                const statusText = isExpired ? 'Expired' : isUpcoming ? 'Upcoming' : offer.status;
                return (
                  <motion.tr key={offer.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }} className="hover:bg-muted/50">
                    <TableCell className="font-medium">{offer.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{offer.code || '-'}</TableCell>
                    <TableCell>
                      <Badge className={offer.discount_type === 'percentage' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'}>
                        {offer.discount_type === 'percentage' ? `${offer.discount_value}%` : `৳${offer.discount_value}`}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">৳{Number(offer.minimum_purchase).toFixed(0)}</TableCell>
                    <TableCell className="text-sm">{Number(offer.maximum_discount) > 0 ? `৳${Number(offer.maximum_discount).toFixed(0)}` : '-'}</TableCell>
                    <TableCell className="text-sm capitalize">{offer.eligibility_type === 'all' ? 'All Customers' : offer.eligibility_type}</TableCell>
                    <TableCell className="text-sm whitespace-nowrap">{offer.start_date} → {offer.end_date}</TableCell>
                    <TableCell><Badge className={statusBadge}>{statusText}</Badge></TableCell>
                    <TableCell className="text-sm">{offer.usage_count}{offer.max_usage ? `/${offer.max_usage}` : ''}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => viewDetail(offer)} title="View details"><Eye className="w-4 h-4" /></Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => toggleStatus(offer)} title="Toggle status"><Power className="w-4 h-4" /></Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(offer)} title="Edit"><Edit2 className="w-4 h-4" /></Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-rose-600" onClick={() => handleDelete(offer.id)} title="Delete"><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    </TableCell>
                  </motion.tr>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Create/Edit Offer Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Discount Offer' : 'Create Discount Offer'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 col-span-2"><Label>Offer Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Eid Special 15%" /></div>
              <div className="space-y-2 col-span-2"><Label>Description</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Offer description" /></div>
              <div className="space-y-2"><Label>Offer Code (optional)</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="EID15" /></div>
              <div className="space-y-2"><Label>Status</Label><select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Discount Type</Label><select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={form.discount_type} onChange={(e) => setForm({ ...form, discount_type: e.target.value })}><option value="percentage">Percentage (%)</option><option value="fixed">Fixed Amount (৳)</option></select></div>
              <div className="space-y-2"><Label>Discount Value *</Label><Input type="number" step="0.01" value={form.discount_value} onChange={(e) => setForm({ ...form, discount_value: e.target.value })} placeholder={form.discount_type === 'percentage' ? '15' : '500'} /></div>
              <div className="space-y-2"><Label>Minimum Purchase (৳)</Label><Input type="number" step="0.01" value={form.minimum_purchase} onChange={(e) => setForm({ ...form, minimum_purchase: e.target.value })} placeholder="0" /></div>
              <div className="space-y-2"><Label>Maximum Discount (৳)</Label><Input type="number" step="0.01" value={form.maximum_discount} onChange={(e) => setForm({ ...form, maximum_discount: e.target.value })} placeholder="0 = no cap" /></div>
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Start Date</Label><Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
              <div className="space-y-2"><Label>End Date</Label><Input type="date" value={form.end_date} min={form.start_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></div>
            </div>

            <Separator />

            <div className="space-y-2"><Label>Customer Eligibility</Label>
              <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={form.eligibility_type} onChange={(e) => setForm({ ...form, eligibility_type: e.target.value })}>
                <option value="all">All Customers</option>
                <option value="selected">Selected Customers</option>
                <option value="group">Customer Groups</option>
                <option value="new">New Customers</option>
                <option value="returning">Returning Customers</option>
              </select>
            </div>

            {form.eligibility_type === 'selected' && (
              <div className="space-y-2 border rounded-lg p-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="Search customers to assign..." value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} className="pl-9" />
                </div>
                <ScrollArea className="h-48 border rounded-md">
                  <div className="p-2 space-y-1">
                    {filteredCustomers.map((c) => (
                      <label key={c.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer">
                        <input type="checkbox" checked={assignedCustomerIds.includes(c.id)} onChange={() => toggleCustomer(c.id)} className="w-4 h-4 rounded" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{c.name}</p>
                          <p className="text-xs text-muted-foreground">{c.phone || 'No phone'}</p>
                        </div>
                        <span className="text-xs text-muted-foreground">৳{Number(c.total_buy || 0).toFixed(0)}</span>
                      </label>
                    ))}
                    {filteredCustomers.length === 0 && <p className="text-center text-sm text-muted-foreground py-4">No customers found</p>}
                  </div>
                </ScrollArea>
                {assignedCustomerIds.length > 0 && <p className="text-xs text-muted-foreground">{assignedCustomerIds.length} customer(s) selected</p>}
              </div>
            )}

            <Separator />

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2"><Label>Max Total Usage</Label><Input type="number" value={form.max_usage} onChange={(e) => setForm({ ...form, max_usage: e.target.value })} placeholder="Empty = unlimited" disabled={form.unlimited_usage} /></div>
              <div className="space-y-2"><Label>Max Per Customer</Label><Input type="number" value={form.max_usage_per_customer} onChange={(e) => setForm({ ...form, max_usage_per_customer: e.target.value })} placeholder="Empty = unlimited" /></div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={form.unlimited_usage} onChange={(e) => setForm({ ...form, unlimited_usage: e.target.checked })} className="w-4 h-4 rounded" />
                  Unlimited Usage
                </label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button className="bg-gradient-to-r from-slate-800 to-black" onClick={handleSave}>{editing ? 'Update Offer' : 'Create Offer'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Offer Detail / Usage History Dialog */}
      <Dialog open={!!detailOffer} onOpenChange={(open) => { if (!open) setDetailOffer(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Offer Details & Usage</DialogTitle></DialogHeader>
          {detailOffer && (
            <div className="space-y-4">
              <Card className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-lg">{detailOffer.name}</h3>
                    {detailOffer.code && <Badge variant="outline" className="mt-1">{detailOffer.code}</Badge>}
                  </div>
                  <Badge className={detailOffer.discount_type === 'percentage' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'}>
                    {detailOffer.discount_type === 'percentage' ? `${detailOffer.discount_value}% OFF` : `৳${detailOffer.discount_value} OFF`}
                  </Badge>
                </div>
                {detailOffer.description && <p className="text-sm text-muted-foreground">{detailOffer.description}</p>}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <div><p className="text-xs text-muted-foreground">Min Purchase</p><p className="font-medium">৳{Number(detailOffer.minimum_purchase).toFixed(0)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Max Discount</p><p className="font-medium">{Number(detailOffer.maximum_discount) > 0 ? `৳${Number(detailOffer.maximum_discount).toFixed(0)}` : '-'}</p></div>
                  <div><p className="text-xs text-muted-foreground">Eligibility</p><p className="font-medium capitalize">{detailOffer.eligibility_type === 'all' ? 'All' : detailOffer.eligibility_type}</p></div>
                  <div><p className="text-xs text-muted-foreground">Usage</p><p className="font-medium">{detailOffer.usage_count}{detailOffer.max_usage ? `/${detailOffer.max_usage}` : ''}</p></div>
                </div>
                <div className="text-sm"><span className="text-muted-foreground">Valid: </span>{detailOffer.start_date} → {detailOffer.end_date}</div>
              </Card>

              <div>
                <h4 className="font-semibold mb-2">Usage History</h4>
                {usageLoading ? (
                  <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-12 bg-muted rounded animate-pulse" />)}</div>
                ) : usageRecords.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground py-8">No usage records yet</p>
                ) : (
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader><TableRow><TableHead>Customer</TableHead><TableHead>Invoice</TableHead><TableHead>Discount</TableHead><TableHead>Date</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {usageRecords.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell className="text-sm">{r.customers?.name || '-'}</TableCell>
                            <TableCell className="text-sm">{r.sales?.invoice_number || '-'}</TableCell>
                            <TableCell className="font-bold text-amber-600">৳{Number(r.discount_amount).toFixed(2)}</TableCell>
                            <TableCell className="text-sm">{new Date(r.used_at).toLocaleDateString()}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setDetailOffer(null)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
