'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ThemeProviderProps } from 'next-themes/dist/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { Toaster } from '@/components/ui/sonner';
import { supabase } from '@/lib/supabase';
import { loadAuthenticatedProfile } from '@/lib/auth-profile';
import type { AuthProfile } from '@/lib/auth-profile';

export type { AuthProfile } from '@/lib/auth-profile';

type AuthContextValue = {
  user: User | null;
  profile: AuthProfile | null;
  isLoading: boolean;
  profileError: string | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within Providers');
  }
  return context;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const profileRequest = useRef(0);
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  const loadProfile = useCallback(async (userId: string, requestId: number) => {
    try {
      const { data: authResult, error: authError } = await supabase.auth.getUser();
      if (requestId !== profileRequest.current) return;
      if (authError) {
        setProfileError(`Unable to verify the current Auth user: ${authError.message}`);
        setProfile(null);
        return;
      }
      if (!authResult.user || authResult.user.id !== userId) {
        setProfileError('The current Supabase Auth user does not match the active session.');
        setProfile(null);
        return;
      }

      const result = await loadAuthenticatedProfile(authResult.user);
      if (requestId !== profileRequest.current) return;
      setProfile(result.profile);
      setProfileError(null);
      if (result.warning) {
        console.warn(`[Auth] ${result.warning}`);
      }
    } catch (error) {
      if (requestId === profileRequest.current) {
        setProfileError(error instanceof Error ? error.message : 'Unable to load your account profile.');
        setProfile(null);
      }
    } finally {
      if (requestId === profileRequest.current) {
        setIsAuthLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const requestId = ++profileRequest.current;
      setUser(session?.user ?? null);
      setProfile(null);
      setProfileError(null);
      if (session?.user) {
        setIsAuthLoading(true);
        void loadProfile(session.user.id, requestId);
      } else {
        setIsAuthLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [loadProfile]);

  useEffect(() => {
    const refreshProfile = () => {
      if (user) {
        const requestId = ++profileRequest.current;
        setIsAuthLoading(true);
        void loadProfile(user.id, requestId);
      }
    };
    window.addEventListener('focus', refreshProfile);
    return () => window.removeEventListener('focus', refreshProfile);
  }, [loadProfile, user]);

  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
    >
      <QueryClientProvider client={queryClient}>
        <AuthContext.Provider value={{ user, profile, isLoading: isAuthLoading, profileError }}>
          {children}
        </AuthContext.Provider>
        <Toaster richColors position="top-right" />
      </QueryClientProvider>
    </NextThemesProvider>
  );
}
