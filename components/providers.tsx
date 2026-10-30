'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ThemeProviderProps } from 'next-themes/dist/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { Toaster } from '@/components/ui/sonner';
import { supabase } from '@/lib/supabase';
import { loadAuthenticatedProfile } from '@/lib/auth-profile';
import type { AuthProfile } from '@/lib/auth-profile';
import { usePOSStore } from '@/store/pos-store';

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
  const activeUserId = useRef<string | null>(null);
  const hasInitializedAuth = useRef(false);
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

  const loadProfile = useCallback(async (user: User, requestId: number) => {
    try {
      const result = await loadAuthenticatedProfile(user);
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
    let active = true;
    let authEventVersion = 0;

    const applySession = (session: Session | null, updateSameUser = false) => {
      const nextUser = session?.user ?? null;
      const nextUserId = nextUser?.id ?? null;
      const isFirstSession = !hasInitializedAuth.current;
      const userChanged = activeUserId.current !== nextUserId;

      if (isFirstSession || userChanged) {
        setUser(nextUser);
      } else if (updateSameUser && nextUser) {
        setUser(nextUser);
      }
      if (!isFirstSession && !userChanged) return;

      hasInitializedAuth.current = true;
      activeUserId.current = nextUserId;
      usePOSStore.getState().setAuthUserId(nextUserId);
      setProfile(null);
      setProfileError(null);

      if (nextUser) {
        const requestId = ++profileRequest.current;
        setIsAuthLoading(true);
        window.setTimeout(() => {
          if (requestId === profileRequest.current) {
            void loadProfile(nextUser, requestId);
          }
        }, 0);
      } else {
        ++profileRequest.current;
        setIsAuthLoading(false);
      }
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      authEventVersion += 1;
      applySession(session, event === 'USER_UPDATED');
    });

    const initialEventVersion = authEventVersion;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active || authEventVersion !== initialEventVersion) return;
      if (error) {
        setProfileError(`Unable to restore your Supabase session: ${error.message}`);
        setIsAuthLoading(false);
        return;
      }
      applySession(data.session);
    }).catch((error: unknown) => {
      if (!active || authEventVersion !== initialEventVersion) return;
      setProfileError(
        error instanceof Error ? error.message : 'Unable to restore your Supabase session.'
      );
      setIsAuthLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [loadProfile]);

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
