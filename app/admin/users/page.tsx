'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw, Users } from 'lucide-react';
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

type ApprovalProfile = Pick<AuthProfile, 'id' | 'email' | 'full_name' | 'phone' | 'role' | 'status' | 'created_at'> & {
  store_names: string[];
};

type ApprovalProfileRow = Omit<ApprovalProfile, 'store_names'>;
type ApprovalStoreRow = { owner_id: string; store_name: string; created_at: string };

const statusClasses: Record<AuthProfile['status'], string> = {
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  approved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  rejected: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300',
  suspended: 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200',
};

export default function UserApprovalsPage() {
  const { user, profile, isLoading: authLoading } = useAuth();
  const [profiles, setProfiles] = useState<ApprovalProfile[]>([]);
  const [storesByOwner, setStoresByOwner] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { data: authResult, error: authError } = await supabase.auth.getUser();
      if (authError) {
        throw new Error(`Unable to verify your Supabase session: ${authError.message}`);
      }
      if (
        !authResult.user ||
        authResult.user.id !== user?.id ||
        profile?.id !== authResult.user.id ||
        profile.role !== 'super_admin' ||
        profile.status !== 'approved'
      ) {
        throw new Error('Your verified Super Admin session is unavailable. Sign in again and retry.');
      }

      const { data: profileRows, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email, full_name, phone, role, status, created_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (profilesError) {
        throw new Error(`Unable to load pending profiles: ${profilesError.message}`);
      }

      const pendingProfiles = (profileRows || []) as ApprovalProfileRow[];
      if (pendingProfiles.length === 0) {
        setProfiles([]);
        setStoresByOwner({});
        return;
      }

      setProfiles(pendingProfiles.map((row) => ({ ...row, store_names: [] })));
      setStoresByOwner({});

      const { data: storeRows, error: storesError } = await supabase
        .from('stores')
        .select('owner_id, store_name, created_at')
        .in('owner_id', pendingProfiles.map((row) => row.id))
        .order('created_at', { ascending: true });
      if (storesError) {
        setLoadError(`Pending profiles loaded, but their store details could not be loaded: ${storesError.message}`);
        return;
      }

      const storeNamesByOwner = ((storeRows || []) as ApprovalStoreRow[]).reduce<Record<string, string[]>>(
        (result, store) => {
          (result[store.owner_id] ||= []).push(store.store_name);
          return result;
        },
        {}
      );
      setProfiles(pendingProfiles.map((row) => ({ ...row, store_names: storeNamesByOwner[row.id] || [] })));
      setStoresByOwner(storeNamesByOwner);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Unable to load pending user approvals.');
    } finally {
      setLoading(false);
    }
  }, [profile, user?.id]);

  useEffect(() => {
    if (!authLoading && profile?.role === 'super_admin' && profile.status === 'approved' && profile.id === user?.id) {
      void loadData();
      const channel = supabase
        .channel('admin-pending-user-approvals')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'profiles' },
          () => void loadData()
        )
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            setLoadError('Live signup updates are unavailable. Refresh the page to check for new users.');
          }
        });

      return () => {
        void supabase.removeChannel(channel);
      };
    }
  }, [authLoading, loadData, profile?.id, profile?.role, profile?.status, user?.id]);

  if (authLoading) {
    return <p className="p-6 text-sm text-muted-foreground">Verifying your account...</p>;
  }

  if (
    !user ||
    profile?.id !== user.id ||
    profile.role !== 'super_admin' ||
    profile.status !== 'approved'
  ) {
    return <p className="p-6 text-sm text-muted-foreground">Super Admin access is required.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-slate-800 to-black text-white">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-2xl font-bold font-heading">User Approvals</h2>
            <p className="text-sm text-muted-foreground">Review pending user registrations and account status.</p>
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
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Store</TableHead>
              <TableHead>Registration date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Loading users...</TableCell></TableRow>
            ) : loadError && profiles.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-destructive">Unable to load pending users. See the error above.</TableCell></TableRow>
            ) : profiles.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No pending users found.</TableCell></TableRow>
            ) : profiles.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">{user.full_name || '—'}</TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>{user.phone || '—'}</TableCell>
                <TableCell>{(storesByOwner[user.id] || []).join(', ') || '—'}</TableCell>
                <TableCell>{new Date(user.created_at).toLocaleDateString()}</TableCell>
                <TableCell>
                  <Badge className={statusClasses[user.status]}>{user.status}</Badge>
                </TableCell>
                <TableCell>
                  <AccountStatusActions userId={user.id} status={user.status} onUpdated={() => void loadData()} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
