'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Clock3, ShieldAlert, CircleX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { useAuth } from '@/components/providers';

type AccountStatusPageProps = {
  status: 'pending' | 'rejected' | 'suspended';
};

const statusContent = {
  pending: {
    icon: Clock3,
    title: 'Approval pending',
    description: 'Your account and store are awaiting review. POS access will be available after approval.',
  },
  rejected: {
    icon: CircleX,
    title: 'Account not approved',
    description: 'Your account application was not approved. Please contact support if you believe this is a mistake.',
  },
  suspended: {
    icon: ShieldAlert,
    title: 'Account suspended',
    description: 'Your account and store are currently suspended. Please contact support for more information.',
  },
};

export function AccountStatusPage({ status }: AccountStatusPageProps) {
  const router = useRouter();
  const { user, profile, isLoading, profileError } = useAuth();
  const [loading, setLoading] = useState(false);
  const content = statusContent[status];
  const Icon = content.icon;

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (!profile || profileError) return;

    if (profile.status === 'pending') {
      router.replace('/pending-approval');
    } else if (profile.status === 'rejected') {
      router.replace('/account-rejected');
    } else if (profile.status === 'suspended') {
      router.replace('/account-suspended');
    } else {
      router.replace('/admin/dashboard');
    }
  }, [isLoading, profile, profileError, router, user]);

  const handleSignOut = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        toast.error(error.message);
        return;
      }
      router.replace('/login');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to sign out.');
    } finally {
      setLoading(false);
    }
  };

  if (isLoading || (!profile && !profileError)) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background p-6" role="status">
        <p className="text-sm text-muted-foreground">Checking your account status...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-b from-amber-50/30 to-white p-6 dark:from-amber-950/10 dark:to-background">
      <Card className="w-full max-w-lg">
        <CardHeader className="items-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
            <Icon className="h-7 w-7" />
          </div>
          <CardTitle>{content.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5 text-center">
          <p className="text-sm text-muted-foreground">
            {profileError ? `Unable to verify your account: ${profileError}` : content.description}
          </p>
          <Button onClick={handleSignOut} disabled={loading}>
            {loading ? 'Signing out...' : 'Sign out'}
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
