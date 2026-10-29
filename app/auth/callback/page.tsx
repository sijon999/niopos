'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

export default function AuthCallbackPage() {
  const router = useRouter();
  const started = useRef(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const completeAuthentication = async () => {
      const callbackUrl = new URL(window.location.href);
      const providerError =
        callbackUrl.searchParams.get('error_description') ||
        callbackUrl.searchParams.get('error');

      if (providerError) {
        setErrorMessage(providerError);
        return;
      }

      const code = callbackUrl.searchParams.get('code');
      if (!code) {
        setErrorMessage('The confirmation link is missing its authentication code. Request a new confirmation email and try again.');
        return;
      }

      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        setErrorMessage(error.message);
        return;
      }

      toast.success('Email confirmed. You can now sign in.');
      router.replace('/login');
    };

    void completeAuthentication().catch((error: unknown) => {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to complete email confirmation.');
    });
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md space-y-4 text-center">
        {errorMessage ? (
          <>
            <h1 className="text-2xl font-bold">Confirmation link could not be completed</h1>
            <p role="alert" className="text-sm text-destructive">{errorMessage}</p>
            <Button asChild>
              <Link href="/login">Return to sign in</Link>
            </Button>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold">Confirming your email</h1>
            <p className="text-sm text-muted-foreground" role="status">
              Please wait while we verify your email and return you to sign in.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
