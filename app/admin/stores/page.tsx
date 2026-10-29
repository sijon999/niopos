'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw, Store } from 'lucide-react';
import { useAuth } from '@/components/providers';
import type { AuthProfile } from '@/components/providers';
import { AccountStatusActions } from '@/components/admin/account-status-actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { supabase } from '@/lib/supabase';

type StoreRecord = {
  id: string;
  owner_id: string;
  store_name: string;
  store_phone: string | null;
  store_address: string | null;
  created_at: string;
};

type OwnerRecord = Pick<AuthProfile, 'id' | 'full_name' | 'email' | 'phone' | 'status' | 'role' | 'created_at'>;
type StoreAccount = {
  owner: OwnerRecord;
  stores: StoreRecord[];
};

const statusClasses: Record<AuthProfile['status'], string> = {
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  approved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  rejected: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300',
  suspended: 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200',
};

export default function StoresPage() {
  const { profile } = useAuth();
  const [accounts, setAccounts] = useState<StoreAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { data: ownerRows, error: ownersError } = await supabase
        .from('profiles')
        .select('id, full_name, email, phone, status, role, created_at')
        .in('role', ['admin', 'store_owner'])
        .order('created_at', { ascending: false });
      if (ownersError) {
        setLoadError(`Unable to load signup accounts: ${ownersError.message}`);
        return;
      }

      const owners = (ownerRows || []) as OwnerRecord[];
      if (owners.length === 0) {
        setAccounts([]);
        return;
      }

      const { data: storeRows, error: storesError } = await supabase
        .from('stores')
        .select('id, owner_id, store_name, store_phone, store_address, created_at')
        .in('owner_id', owners.map((owner) => owner.id))
        .order('created_at', { ascending: false });
      if (storesError) {
        setAccounts(owners.map((owner) => ({ owner, stores: [] })));
        setLoadError(`Signup accounts loaded, but store details could not be loaded: ${storesError.message}`);
        return;
      }

      const storesByOwner = ((storeRows || []) as StoreRecord[]).reduce<Record<string, StoreRecord[]>>(
        (result, store) => {
          (result[store.owner_id] ||= []).push(store);
          return result;
        },
        {}
      );
      setAccounts(owners.map((owner) => ({ owner, stores: storesByOwner[owner.id] || [] })));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Unable to load signup accounts.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (profile?.role === 'super_admin' && profile.status === 'approved') {
      void loadData();
    }
  }, [loadData, profile]);

  if (profile?.role !== 'super_admin' || profile.status !== 'approved') {
    return <p className="p-6 text-sm text-muted-foreground">Super Admin access is required.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-slate-800 to-black text-white">
            <Store className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-2xl font-bold font-heading">Stores</h2>
            <p className="text-sm text-muted-foreground">View signup accounts and store details, and manage account status.</p>
          </div>
        </div>
        <Button variant="outline" onClick={() => void loadData()} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {loadError && (
        <div role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/40 p-4 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4" /> {loadError}
        </div>
      )}

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Store</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Address</TableHead>
              <TableHead>Registration date</TableHead>
              <TableHead>Account type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">Loading signup accounts...</TableCell></TableRow>
            ) : accounts.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">No signup accounts found.</TableCell></TableRow>
            ) : accounts.map(({ owner, stores }) => {
              const status = owner.status;
              return (
                <TableRow key={owner.id}>
                  <TableCell className="font-medium">{stores.map((store) => store.store_name).join(', ') || 'Store details unavailable'}</TableCell>
                  <TableCell>{owner.full_name || '—'}</TableCell>
                  <TableCell>{owner.email}</TableCell>
                  <TableCell>{stores.map((store) => store.store_phone).filter(Boolean).join(', ') || owner.phone || '—'}</TableCell>
                  <TableCell>{stores.map((store) => store.store_address).filter(Boolean).join(', ') || '—'}</TableCell>
                  <TableCell>{new Date(owner.created_at).toLocaleDateString()}</TableCell>
                  <TableCell>{owner.role}</TableCell>
                  <TableCell><Badge className={statusClasses[status]}>{status}</Badge></TableCell>
                  <TableCell>
                    <AccountStatusActions userId={owner.id} status={status} onUpdated={() => void loadData()} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
