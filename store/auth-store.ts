import { create } from 'zustand';

type UserRole = 'administrator' | 'user' | null;

type AuthUser = {
  name: string;
  email: string;
  role: UserRole;
};

type AuthState = {
  user: AuthUser | null;
  isAdmin: boolean;
  login: (user: AuthUser) => void;
  logout: () => void;
  hydrate: () => void;
};

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAdmin: false,
  login: (user) => {
    const isAdmin = user.role === 'administrator';
    set({ user, isAdmin });
    if (typeof window !== 'undefined') {
      localStorage.setItem('stylebazaar_auth', JSON.stringify({ user, isAdmin }));
    }
  },
  logout: () => {
    set({ user: null, isAdmin: false });
    if (typeof window !== 'undefined') {
      localStorage.removeItem('stylebazaar_auth');
    }
  },
  hydrate: () => {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem('stylebazaar_auth');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        set({ user: parsed.user, isAdmin: parsed.isAdmin });
      } catch {
        localStorage.removeItem('stylebazaar_auth');
      }
    }
  },
}));
