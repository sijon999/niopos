'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Gift, Phone, Mail, MapPin, Wallet,
  TrendingUp, Plus, CheckCircle2, Clock, Percent, Tag, Search, Filter,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase';
import type { Customer } from '@/types';
import type { DiscountOffer, DiscountOfferUsage } from '@/lib/discount';
import { toast } from 'sonner';

const today = new Date().toISOString().slice(0, 10);

type DiscountHistoryRow = {
  id: string;
  sale_id: string;
  invoice_number: string;
  product_id: string;
  product_name: string;
  original_price: number;
  quantity: number;
  discount_type: string;
  discount_value: number;
  discount_amount: number;
  final_amount: number;
  cashier: string | null;
  created_at: string;
};

type DiscountSummary = {
  total_purchases: number;
  total_discount: number;
  discounted_orders: number;
  discounted_products: number;
};

export default function CustomerProfilePage() {
  const params = useParams();
  const router = useRouter();
  const customerId = params.id as string;

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [availableOffers, setAvailableOffers] = useState<any[]>([]);
  const [usedOffers, setUsedOffers] = useState<DiscountOfferUsage[]>([]);
  const [expiredOffers, setExpiredOffers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [assignOpen, setAssignOpen] = useState(false);
  const [allOffers, setAllOffers] = useState<DiscountOffer[]>([]);
  const [assignForm, setAssignForm] = useState({ offerId: '', expiresAt: '' });

  const [discountSummary, setDiscountSummary] = useState<DiscountSummary>({ total_purchases: 0, total_discount: 0, discounted_orders: 0, discounted_products: 0 });
  const [discountHistory, setDiscountHistory] = useState<DiscountHistoryRow[]>([]);
  const [filters, setFilters] = useState({ dateFrom: '', dateTo: '', product: '', saleId: '', discountType: '', cashier: '' });
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    if (!customerId) return;
    loadData();
  }, [customerId]);

  const loadData = useCallback(async () => {
    const [custRes, assignedRes, usageRes, allOffersRes, summaryRes, historyRes] = await Promise.all([
      supabase.from('customers').select('*').eq('id', customerId).single(),
      supabase.from('customer_discount_offers').select('*, discount_offers(*)').eq('customer_id', customerId).order('assigned_at', { ascending: false }),
      supabase.from('discount_offer_usage').select('*, discount_offers(name, discount_type, discount_value), sales(invoice_number, sale_date)').eq('customer_id', customerId).order('used_at', { ascending: false }),
      supabase.from('discount_offers').select('*').eq('status', 'active').order('name'),
      supabase.rpc('get_customer_discount_summary', { p_customer_id: customerId }),
      supabase.rpc('get_customer_discount_history', { p_customer_id: customerId }),
    ]);

    if (custRes.data) setCustomer(custRes.data as Customer);

    const assigned = assignedRes.data || [];
    const available = assigned.filter((a: any) => {
      const offer = a.discount_offers;
      if (!offer || offer.status !== 'active') return false;
      if (offer.end_date < today) return false;
      if (a.expires_at && a.expires_at < today) return false;
      return true;
    });
    const expired = assigned.filter((a: any) => {
      const offer = a.discount_offers;
      if (!offer) return false;
      return offer.end_date < today || (a.expires_at && a.expires_at < today);
    });

    setAvailableOffers(available);
    setExpiredOffers(expired);
    setUsedOffers((usageRes.data || []) as DiscountOfferUsage[]);
    setAllOffers((allOffersRes.data || []) as DiscountOffer[]);
    if (summaryRes.data) setDiscountSummary(summaryRes.data as DiscountSummary);
    setDiscountHistory((historyRes.data || []) as DiscountHistoryRow[]);
    setLoading(false);
  }, [customerId]);

  const applyFilters = async () => {
    const { data, error } = await supabase.rpc('get_customer_discount_history', {
      p_customer_id: customerId,
      p_date_from: filters.dateFrom || null,
      p_date_to: filters.dateTo || null,
      p_product_search: filters.product || null,
      p_sale_id: filters.saleId || null,
      p_discount_type: filters.discountType || null,
      p_cashier: filters.cashier || null,
    });
    if (!error) setDiscountHistory((data || []) as DiscountHistoryRow[]);
  };

  const resetFilters = () => {
    setFilters({ dateFrom: '', dateTo: '', product: '', saleId: '', discountType: '', cashier: '' });
    supabase.rpc('get_customer_discount_history', { p_customer_id: customerId }).then(({ data }) => setDiscountHistory((data || []) as DiscountHistoryRow[]));
  };

  const handleAssign = async () => {
    if (!assignForm.offerId) { toast.error('Select an offer to assign'); return; }
    const { error } = await supabase.from('customer_discount_offers').upsert({
      customer_id: customerId,
      offer_id: assignForm.offerId,
      status: 'active',
      expires_at: assignForm.expiresAt || null,
    }, { onConflict: 'customer_id,offer_id' });
    if (error) {
      toast.error('Could not assign offer');
      return;
    }
    toast.success('Offer assigned to customer');
    setAssignOpen(false);
    setAssignForm({ offerId: '', expiresAt: '' });
    loadData();
  };

  const fmtMoney = (n: number) => `৳${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="text-muted-foreground">Loading customer profile...</div></div>;
  }

  if (!customer) {
    return <div className="text-center py-16"><p className="text-muted-foreground">Customer not found</p><Button className="mt-3" onClick={() => router.push('/admin/customers')}>Back to Customers</Button></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={() => router.push('/admin/customers')}><ArrowLeft className="w-4 h-4" /></Button>
        <div>
          <h2 className="text-2xl font-bold font-heading">{customer.name}</h2>
          <p className="text-sm text-muted-foreground">Customer profile, offers & discount history</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-5 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-slate-800 to-black flex items-center justify-center text-white text-xl font-bold">
              {customer.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h3 className="font-semibold text-lg">{customer.name}</h3>
              <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 capitalize">{customer.membership}</Badge>
            </div>
          </div>
          <Separator />
          <div className="space-y-2 text-sm">
            {customer.phone && <p className="flex items-center gap-2"><Phone className="w-4 h-4 text-muted-foreground" />{customer.phone}</p>}
            {customer.email && <p className="flex items-center gap-2"><Mail className="w-4 h-4 text-muted-foreground" />{customer.email}</p>}
            {customer.address && <p className="flex items-center gap-2"><MapPin className="w-4 h-4 text-muted-foreground" />{customer.address}</p>}
          </div>
          <Separator />
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><p className="text-xs text-muted-foreground">Total Purchase</p><p className="font-bold">{fmtMoney(Number(customer.total_buy || 0))}</p></div>
            <div><p className="text-xs text-muted-foreground">Total Due</p><p className="font-bold text-amber-600">{fmtMoney(Number(customer.total_due || 0))}</p></div>
            <div><p className="text-xs text-muted-foreground">Reward Points</p><p className="font-bold">{customer.reward_points}</p></div>
            <div><p className="text-xs text-muted-foreground">Wallet</p><p className="font-bold">{fmtMoney(Number(customer.wallet_balance || 0))}</p></div>
          </div>
        </Card>

        {/* Discount summary cards */}
        <Card className="p-5 lg:col-span-2">
          <h3 className="font-semibold flex items-center gap-2 mb-4"><Percent className="w-5 h-5 text-amber-500" /> Discount Summary</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-lg border p-3 bg-muted/30">
              <p className="text-xs text-muted-foreground">Total Purchases</p>
              <p className="font-bold text-lg">{fmtMoney(discountSummary.total_purchases)}</p>
            </div>
            <div className="rounded-lg border p-3 bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800">
              <p className="text-xs text-muted-foreground">Total Discount Received</p>
              <p className="font-bold text-lg text-amber-600 dark:text-amber-400">{fmtMoney(discountSummary.total_discount)}</p>
            </div>
            <div className="rounded-lg border p-3 bg-muted/30">
              <p className="text-xs text-muted-foreground">Discounted Orders</p>
              <p className="font-bold text-lg">{discountSummary.discounted_orders}</p>
            </div>
            <div className="rounded-lg border p-3 bg-muted/30">
              <p className="text-xs text-muted-foreground">Discounted Products</p>
              <p className="font-bold text-lg">{discountSummary.discounted_products}</p>
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold flex items-center gap-2"><Gift className="w-5 h-5 text-amber-500" /> Discount Offers</h3>
          <Button size="sm" variant="outline" onClick={() => setAssignOpen(true)}><Plus className="w-4 h-4 mr-1" /> Assign Offer</Button>
        </div>
        <Separator />

        <div>
          <p className="text-sm font-medium text-emerald-600 mb-2 flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Available Offers ({availableOffers.length})</p>
          {availableOffers.length === 0 ? <p className="text-sm text-muted-foreground py-3">No available offers</p> : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {availableOffers.map((a: any) => {
                const offer = a.discount_offers;
                return (
                  <div key={a.id} className="border rounded-lg p-3 bg-emerald-50 dark:bg-emerald-900/10">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-sm">{offer.name}</p>
                      <Badge className={offer.discount_type === 'percentage' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'}>
                        {offer.discount_type === 'percentage' ? `${offer.discount_value}%` : `৳${offer.discount_value}`}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Min: ৳{Number(offer.minimum_purchase).toFixed(0)} · Until: {offer.end_date}</p>
                    <p className="text-xs text-muted-foreground">Used: {a.usage_count}{offer.max_usage_per_customer ? `/${offer.max_usage_per_customer}` : ''}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <p className="text-sm font-medium text-rose-600 mb-2 flex items-center gap-1"><Clock className="w-4 h-4" /> Expired Offers ({expiredOffers.length})</p>
          {expiredOffers.length === 0 ? <p className="text-sm text-muted-foreground py-3">No expired offers</p> : (
            <div className="space-y-1">
              {expiredOffers.map((a: any) => {
                const offer = a.discount_offers;
                if (!offer) return null;
                return (
                  <div key={a.id} className="flex items-center justify-between border rounded-lg p-2 opacity-60">
                    <span className="text-sm">{offer.name}</span>
                    <Badge variant="outline">Expired {offer.end_date}</Badge>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      {/* Discount History Table */}
      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold flex items-center gap-2"><TrendingUp className="w-5 h-5 text-blue-500" /> Product Discount History</h3>
          <Button size="sm" variant="outline" onClick={() => setShowFilters(!showFilters)}><Filter className="w-4 h-4 mr-1" /> Filters</Button>
        </div>
        <Separator />

        {showFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-2 p-3 bg-muted/30 rounded-lg">
            <Input type="date" placeholder="From" value={filters.dateFrom} onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })} className="h-8 text-xs" />
            <Input type="date" placeholder="To" value={filters.dateTo} onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })} className="h-8 text-xs" />
            <Input placeholder="Product" value={filters.product} onChange={(e) => setFilters({ ...filters, product: e.target.value })} className="h-8 text-xs" />
            <Input placeholder="Sale ID" value={filters.saleId} onChange={(e) => setFilters({ ...filters, saleId: e.target.value })} className="h-8 text-xs" />
            <select value={filters.discountType} onChange={(e) => setFilters({ ...filters, discountType: e.target.value })} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
              <option value="">All Types</option>
              <option value="percentage">Percentage</option>
              <option value="fixed">Fixed</option>
            </select>
            <div className="flex gap-1">
              <Button size="sm" variant="default" className="h-8 flex-1" onClick={applyFilters}><Search className="w-3 h-3 mr-1" /> Apply</Button>
              <Button size="sm" variant="outline" className="h-8" onClick={resetFilters}>Reset</Button>
            </div>
          </div>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Date</TableHead>
              <TableHead className="text-xs">Sale ID</TableHead>
              <TableHead className="text-xs">Product</TableHead>
              <TableHead className="text-xs">Original Price</TableHead>
              <TableHead className="text-xs">Qty</TableHead>
              <TableHead className="text-xs">Type</TableHead>
              <TableHead className="text-xs">Value</TableHead>
              <TableHead className="text-xs">Discount Amount</TableHead>
              <TableHead className="text-xs">Final Amount</TableHead>
              <TableHead className="text-xs">Cashier</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {discountHistory.length === 0 ? (
              <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">No product discount history</TableCell></TableRow>
            ) : discountHistory.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="text-xs">{new Date(row.created_at).toLocaleDateString()}</TableCell>
                <TableCell className="text-xs font-medium">{row.invoice_number || row.sale_id.slice(0, 8)}</TableCell>
                <TableCell className="text-xs font-medium">{row.product_name}</TableCell>
                <TableCell className="text-xs">{fmtMoney(Number(row.original_price))}</TableCell>
                <TableCell className="text-xs">{row.quantity}</TableCell>
                <TableCell className="text-xs">
                  <Badge variant="outline" className="text-[10px] capitalize">{row.discount_type}</Badge>
                </TableCell>
                <TableCell className="text-xs">
                  {row.discount_type === 'percentage' ? `${row.discount_value}%` : `৳${row.discount_value}`}
                </TableCell>
                <TableCell className="text-xs font-bold text-amber-600">-৳{Number(row.discount_amount).toFixed(2)}</TableCell>
                <TableCell className="text-xs font-medium">৳{Number(row.final_amount).toFixed(2)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{row.cashier || '-'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Card className="p-5 space-y-3">
        <h3 className="font-semibold flex items-center gap-2"><Tag className="w-5 h-5 text-purple-500" /> Offer Usage History</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Offer Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Value</TableHead>
              <TableHead>Discount Amount</TableHead>
              <TableHead>Invoice</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {usedOffers.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No offer usage history</TableCell></TableRow>
            ) : usedOffers.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium text-sm">{u.discount_offers?.name || '-'}</TableCell>
                <TableCell className="text-sm capitalize">{u.discount_type}</TableCell>
                <TableCell className="text-sm">{u.discount_type === 'percentage' ? `${u.discount_value}%` : `৳${u.discount_value}`}</TableCell>
                <TableCell className="font-bold text-amber-600">৳{Number(u.discount_amount).toFixed(2)}</TableCell>
                <TableCell className="text-sm">{u.sales?.invoice_number || '-'}</TableCell>
                <TableCell className="text-sm">{u.sales?.sale_date ? new Date(u.sales.sale_date).toLocaleDateString() : new Date(u.used_at).toLocaleDateString()}</TableCell>
                <TableCell><Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">Used</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Assign Offer Dialog */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Assign Discount Offer</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Select Offer</Label>
              <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={assignForm.offerId} onChange={(e) => setAssignForm({ ...assignForm, offerId: e.target.value })}>
                <option value="">Select an offer...</option>
                {allOffers.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.discount_type === 'percentage' ? `${o.discount_value}%` : `৳${o.discount_value}`})</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Override Expiry (optional)</Label>
              <Input type="date" value={assignForm.expiresAt} onChange={(e) => setAssignForm({ ...assignForm, expiresAt: e.target.value })} />
              <p className="text-xs text-muted-foreground">Leave empty to use the offer's own end date</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)}>Cancel</Button>
            <Button className="bg-gradient-to-r from-slate-800 to-black" onClick={handleAssign}>Assign Offer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
