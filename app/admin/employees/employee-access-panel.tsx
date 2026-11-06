'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/components/providers';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { useTranslation } from '@/hooks/use-translation';
import { useConfirmation } from '@/hooks/use-confirmation';

type TeamMember = {
  user_id: string;
  email: string;
  full_name: string | null;
  role: 'cashier';
  status: 'approved' | 'suspended' | 'rejected' | 'pending';
  permissions: string[];
  created_at: string;
};

type TeamInvitation = {
  invitation_id: string;
  email: string;
  role: 'cashier';
  permissions: string[];
  created_at: string;
  expires_at: string;
};

export default function EmployeeAccessPanel() {
  const { profile } = useAuth();
  const { t, locale } = useTranslation();
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [invitations, setInvitations] = useState<TeamInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitationLink, setInvitationLink] = useState('');
  const [inviting, setInviting] = useState(false);
  const { confirmAction, dialog: confirmationDialog } = useConfirmation();
  const isOwner = profile?.role === 'admin' || profile?.role === 'store_owner';

  const loadTeam = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const [membersResult, invitationsResult] = await Promise.all([
        supabase.rpc('get_store_team_members'),
        supabase.rpc('get_store_invitations'),
      ]);
      const error = membersResult.error || invitationsResult.error;
      if (error) {
        setErrorMessage(error.message);
        return;
      }
      const members = (membersResult.data || []) as TeamMember[];
      setTeamMembers(members);
      setInvitations((invitationsResult.data || []) as TeamInvitation[]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('employees.teamLoadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadTeam();
  }, [loadTeam]);

  const createInvitation = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setInviting(true);
    setInvitationLink('');
    try {
      const { data, error } = await supabase.rpc('create_store_invitation', {
        target_email: inviteEmail.trim(),
        target_role: 'cashier',
        target_permissions: ['pos'],
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      const created = Array.isArray(data) ? data[0] : null;
      if (!created?.invitation_token) {
        toast.error(t('employees.invitationTokenMissing'));
        return;
      }
      const url = new URL('/register', window.location.origin);
      url.searchParams.set('invite', created.invitation_token);
      const link = url.toString();
      setInvitationLink(link);
      try {
        await navigator.clipboard.writeText(link);
        toast.success(t('employees.invitationCopied'));
      } catch {
        toast.success(t('employees.invitationCreated'));
      }
      setInviteEmail('');
      await loadTeam();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('employees.invitationFailed'));
    } finally {
      setInviting(false);
    }
  };

  const updateMember = async (member: TeamMember, status: TeamMember['status']) => {
    const shouldSuspend = status === 'suspended';
    await confirmAction({
      title: shouldSuspend ? t('employees.suspend') : t('employees.reactivate'),
      description: `${shouldSuspend ? t('employees.suspend') : t('employees.reactivate')} ${member.full_name || member.email}?`,
      confirmLabel: shouldSuspend ? t('employees.suspend') : t('employees.reactivate'),
      destructive: shouldSuspend,
      successMessage: status === 'approved' ? t('employees.memberReactivated') : t('employees.memberStatusUpdated'),
      action: async () => {
        const { error } = await supabase.rpc('manage_store_member', {
        target_user_id: member.user_id,
        target_status: status,
        target_role: 'cashier',
        target_permissions: ['pos'],
      });
        if (error) throw error;
        await loadTeam();
      },
    });
  };

  const revokeInvitation = async (invitationId: string) => {
    const invitation = invitations.find((item) => item.invitation_id === invitationId);
    await confirmAction({
      title: t('employees.revoke'),
      description: `Revoke the invitation for ${invitation?.email || invitationId}?`,
      confirmLabel: t('employees.revoke'),
      destructive: true,
      successMessage: t('employees.invitationRevoked'),
      action: async () => {
        const { error } = await supabase.rpc('revoke_store_invitation', {
          target_invitation_id: invitationId,
        });
        if (error) throw error;
        await loadTeam();
      },
    });
  };

  if (profile?.role !== 'admin' && profile?.role !== 'store_owner') return null;

  return (
    <Card className="space-y-5 p-5">
      <div>
        <h2 className="text-xl font-bold font-heading">{t('employees.storeAccess')}</h2>
        <p className="text-sm text-muted-foreground">
          {t('employees.storeAccessDescription')}
        </p>
      </div>

      {errorMessage && (
        <p role="alert" className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">
          {errorMessage}
        </p>
      )}

      <form onSubmit={createInvitation} className="space-y-4 rounded-md border p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <Input
            aria-label={t('employees.employeeEmail')}
            type="email"
            placeholder={t('employees.employeeEmail')}
            value={inviteEmail}
            onChange={(event) => setInviteEmail(event.target.value)}
            required
          />
          <Button type="submit" disabled={inviting || !isOwner}>
            {inviting ? t('employees.creatingLink') : t('employees.createInvitation')}
          </Button>
        </div>
      </form>

      {invitationLink && (
        <div className="space-y-1">
          <Label htmlFor="invitation-link">{t('employees.shareInvitationLink')}</Label>
          <Input
            id="invitation-link"
            readOnly
            value={invitationLink}
            onFocus={(event) => event.target.select()}
          />
        </div>
      )}

      <section className="space-y-3">
        <h3 className="font-semibold">{t('employees.teamMembers')}</h3>
        {loading ? (
          <p className="text-sm text-muted-foreground">{t('employees.loadingTeam')}</p>
        ) : teamMembers.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('employees.noTeamMembers')}</p>
        ) : teamMembers.map((member) => {
          return (
            <div key={member.user_id} className="space-y-3 rounded-md border p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{member.full_name || member.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {member.email} · {t(`employees.roles.${member.role}`)} · {t(`employees.memberStatuses.${member.status}`)}
                  </p>
                </div>
                <div className="flex gap-2">
                  {member.status === 'approved' ? (
                    <Button size="sm" variant="outline" onClick={() => void updateMember(member, 'suspended')}>
                      {t('employees.suspend')}
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => void updateMember(member, 'approved')}>
                      {t('employees.reactivate')}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </section>

      <section className="space-y-3">
        <h3 className="font-semibold">{t('employees.pendingInvitations')}</h3>
        {invitations.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('employees.noPendingInvitations')}</p>
        ) : invitations.map((invitation) => (
          <div key={invitation.invitation_id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
            <div>
              <p className="font-medium">{invitation.email} · {invitation.role}</p>
              <p className="text-xs text-muted-foreground">
                {t('employees.expires')} {new Date(invitation.expires_at).toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-US')}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => void revokeInvitation(invitation.invitation_id)}>
              {t('employees.revoke')}
            </Button>
          </div>
        ))}
      </section>
      {confirmationDialog}
    </Card>
  );
}
