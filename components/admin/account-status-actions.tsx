'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import type { AuthProfile } from '@/components/providers';
import { useConfirmation } from '@/hooks/use-confirmation';

type AccountStatus = AuthProfile['status'];
type ActionStatus = Extract<AccountStatus, 'approved' | 'rejected' | 'suspended'>;

const actionsByStatus: Record<AccountStatus, { status: ActionStatus; label: string }[]> = {
  pending: [
    { status: 'approved', label: 'Approve' },
    { status: 'rejected', label: 'Reject' },
    { status: 'suspended', label: 'Suspend' },
  ],
  approved: [{ status: 'suspended', label: 'Suspend' }],
  rejected: [
    { status: 'approved', label: 'Approve' },
    { status: 'suspended', label: 'Suspend' },
  ],
  suspended: [{ status: 'approved', label: 'Reactivate' }],
};

export function AccountStatusActions({
  userId,
  status,
  onUpdated,
}: {
  userId: string;
  status: AccountStatus;
  onUpdated: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const { confirmAction, dialog: confirmationDialog } = useConfirmation();

  const updateStatus = async (nextStatus: ActionStatus) => {
    const label = nextStatus === 'approved' ? 'Approve' : nextStatus === 'rejected' ? 'Reject' : 'Suspend';
    await confirmAction({
      title: `${label} account`,
      description: `Are you sure you want to ${label.toLowerCase()} this account?`,
      confirmLabel: `Yes, ${label}`,
      destructive: nextStatus !== 'approved',
      successMessage: `Account ${nextStatus === 'approved' ? 'approved' : nextStatus}.`,
      action: async () => {
        setSaving(true);
        try {
          const { error } = await supabase.rpc('set_store_owner_status', {
            target_user_id: userId,
            requested_status: nextStatus,
          });
          if (error) throw error;
          onUpdated();
        } finally {
          setSaving(false);
        }
      },
    });
  };

  return (
    <div className="flex justify-end gap-2">
      {actionsByStatus[status].map((action) => (
        <Button
          key={action.status}
          size="sm"
          variant={action.status === 'rejected' || action.status === 'suspended' ? 'outline' : 'default'}
          disabled={saving}
          onClick={() => updateStatus(action.status)}
        >
          {saving ? 'Saving...' : action.label}
        </Button>
      ))}
      {confirmationDialog}
    </div>
  );
}
