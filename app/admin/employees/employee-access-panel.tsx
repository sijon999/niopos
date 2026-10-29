'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/components/providers';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

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
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [invitations, setInvitations] = useState<TeamInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitationLink, setInvitationLink] = useState('');
  const [inviting, setInviting] = useState(false);
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
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load the store team.');
    } finally {
      setLoading(false);
    }
  }, []);

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
        toast.error('Invitation was created but no registration token was returned.');
        return;
      }
      const url = new URL('/register', window.location.origin);
      url.searchParams.set('invite', created.invitation_token);
      const link = url.toString();
      setInvitationLink(link);
      try {
        await navigator.clipboard.writeText(link);
        toast.success('Invitation link created and copied.');
      } catch {
        toast.success('Invitation link created. Copy it from the field below.');
      }
      setInviteEmail('');
      await loadTeam();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to create an invitation.');
    } finally {
      setInviting(false);
    }
  };

  const updateMember = async (member: TeamMember, status: TeamMember['status']) => {
    try {
      const { error } = await supabase.rpc('manage_store_member', {
        target_user_id: member.user_id,
        target_status: status,
        target_role: 'cashier',
        target_permissions: ['pos'],
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success(status === 'approved' ? 'Team member reactivated.' : `Team member ${status}.`);
      await loadTeam();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to update team member.');
    }
  };

  const revokeInvitation = async (invitationId: string) => {
    try {
      const { error } = await supabase.rpc('revoke_store_invitation', {
        target_invitation_id: invitationId,
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success('Invitation revoked.');
      await loadTeam();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to revoke invitation.');
    }
  };

  if (profile?.role !== 'admin' && profile?.role !== 'store_owner') return null;

  return (
    <Card className="space-y-5 p-5">
      <div>
        <h2 className="text-xl font-bold font-heading">Store access</h2>
        <p className="text-sm text-muted-foreground">
          Invite cashiers who can use the POS to complete sales. They cannot access inventory, reports, purchases, or employee management. Invitation links expire after seven days and can only be used once.
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
            aria-label="Employee email"
            type="email"
            placeholder="Employee email"
            value={inviteEmail}
            onChange={(event) => setInviteEmail(event.target.value)}
            required
          />
          <Button type="submit" disabled={inviting || !isOwner}>
            {inviting ? 'Creating link...' : 'Create invitation'}
          </Button>
        </div>
      </form>

      {invitationLink && (
        <div className="space-y-1">
          <Label htmlFor="invitation-link">Share this one-time invitation link</Label>
          <Input
            id="invitation-link"
            readOnly
            value={invitationLink}
            onFocus={(event) => event.target.select()}
          />
        </div>
      )}

      <section className="space-y-3">
        <h3 className="font-semibold">Team members</h3>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading team...</p>
        ) : teamMembers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No invited team accounts yet.</p>
        ) : teamMembers.map((member) => {
          return (
            <div key={member.user_id} className="space-y-3 rounded-md border p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{member.full_name || member.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {member.email} · {member.role} · {member.status}
                  </p>
                </div>
                <div className="flex gap-2">
                  {member.status === 'approved' ? (
                    <Button size="sm" variant="outline" onClick={() => void updateMember(member, 'suspended')}>
                      Suspend
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => void updateMember(member, 'approved')}>
                      Reactivate
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </section>

      <section className="space-y-3">
        <h3 className="font-semibold">Pending invitations</h3>
        {invitations.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pending invitations.</p>
        ) : invitations.map((invitation) => (
          <div key={invitation.invitation_id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
            <div>
              <p className="font-medium">{invitation.email} · {invitation.role}</p>
              <p className="text-xs text-muted-foreground">
                Expires {new Date(invitation.expires_at).toLocaleString()}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => void revokeInvitation(invitation.invitation_id)}>
              Revoke
            </Button>
          </div>
        ))}
      </section>
    </Card>
  );
}
