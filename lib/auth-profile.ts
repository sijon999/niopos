import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

export type AuthProfile = {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  role: 'super_admin' | 'admin' | 'store_owner' | 'manager' | 'cashier';
  status: 'pending' | 'approved' | 'rejected' | 'suspended';
  created_at: string;
};

export async function loadAuthenticatedProfile(user: User): Promise<{
  profile: AuthProfile;
  warning: string | null;
}> {
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, email, full_name, phone, role, status, created_at')
    .eq('id', user.id)
    .maybeSingle();

  if (!profileError && profile) {
    if (profile.id !== user.id) {
      throw new Error('The loaded profile does not match your authenticated account.');
    }
    return { profile: profile as AuthProfile, warning: null };
  }

  const { data: fallbackProfiles, error: fallbackError } =
    await supabase.rpc('get_authenticated_profile', {
      expected_user_id: user.id,
    });

  if (fallbackError) {
    const reason = profileError
      ? `Profile query failed: ${profileError.message}. Secure profile lookup also failed: ${fallbackError.message}`
      : `Profile query returned no visible row. Secure profile lookup failed: ${fallbackError.message}`;
    throw new Error(reason);
  }

  const fallbackProfile = Array.isArray(fallbackProfiles)
    ? fallbackProfiles[0] as AuthProfile | undefined
    : undefined;

  if (!fallbackProfile) {
    if (profileError) {
      throw new Error(`Profile query failed: ${profileError.message}`);
    }
    throw new Error(
      `No profile exists for the verified authenticated user ID ${user.id}.`
    );
  }

  if (fallbackProfile.id !== user.id) {
    throw new Error('Secure profile lookup returned a different authenticated user ID.');
  }

  return {
    profile: fallbackProfile,
    warning: profileError
      ? `Direct profile query failed; loaded your own profile through the secure function instead: ${profileError.message}`
      : 'The profile exists, but direct profile access returned no row; loaded your own profile through the secure function.',
  };
}
