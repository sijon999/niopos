'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Shirt, Mail, Lock, User, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [storeName, setStoreName] = useState('');
  const [storePhone, setStorePhone] = useState('');
  const [storeAddress, setStoreAddress] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [employeeInviteToken, setEmployeeInviteToken] = useState<string | null>(null);
  const [inviteChecked, setInviteChecked] = useState(false);

  useEffect(() => {
    setEmployeeInviteToken(new URLSearchParams(window.location.search).get('invite'));
    setInviteChecked(true);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteChecked) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: new URL('/auth/callback', window.location.origin).toString(),
          data: {
            full_name: name,
            phone,
            ...(employeeInviteToken
              ? { employee_invite_token: employeeInviteToken }
              : {
                store_name: storeName,
                store_phone: storePhone,
                store_address: storeAddress,
              }),
          },
        },
      });
      if (error) {
        toast.error(error.message);
        return;
      }

      if (data.session) {
        if (employeeInviteToken) {
          toast.success('Employee account created.');
          router.push('/admin/pos');
        } else {
          toast.success('Account created. Your store is awaiting approval.');
          router.push('/pending-approval');
        }
      } else {
        toast.info(
          employeeInviteToken
            ? 'Check your email to confirm your employee account.'
            : 'Check your email to confirm your account. Your store will be reviewed after confirmation.'
        );
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to create your account.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-slate-800 via-slate-900 to-black relative overflow-hidden">
        <div className="absolute top-20 right-20 w-72 h-72 bg-amber-400/10 rounded-full blur-3xl" />
        <div className="absolute bottom-20 left-10 w-96 h-96 bg-amber-300/5 rounded-full blur-3xl" />
        <div className="relative flex flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-amber-500/20 backdrop-blur flex items-center justify-center">
              <Shirt className="w-6 h-6 text-amber-400" />
            </div>
            <span className="text-2xl font-bold font-heading">StyleBazaar</span>
          </div>
          <div className="space-y-6">
            <h1 className="text-4xl font-bold font-heading leading-tight">
              Start selling fashion with the most powerful POS system
            </h1>
            <p className="text-slate-300 text-lg">
              Join hundreds of clothing retailers using StyleBazaar to manage inventory, process sales, and delight customers.
            </p>
          </div>
          <p className="text-sm text-slate-400">© 2026 StyleBazaar. All rights reserved.</p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 bg-gradient-to-b from-amber-50/30 to-white dark:from-amber-950/10 dark:to-background">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-800 to-black flex items-center justify-center">
              <Shirt className="w-5 h-5 text-amber-400" />
            </div>
            <span className="text-xl font-bold font-heading">StyleBazaar</span>
          </div>

          <div className="space-y-2 mb-8">
            <h2 className="text-3xl font-bold font-heading">
              {employeeInviteToken ? 'Join your store team' : 'Create your account'}
            </h2>
            <p className="text-muted-foreground">
              {employeeInviteToken ? 'Create an account to accept your employee invitation' : 'Join StyleBazaar and start managing your store'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input id="name" placeholder="John Smith" value={name} onChange={(e) => setName(e.target.value)} className="pl-10" required />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input id="phone" type="tel" placeholder="Phone number" value={phone} onChange={(e) => setPhone(e.target.value)} required />
            </div>
            {!employeeInviteToken && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="storeName">Store Name</Label>
                  <Input id="storeName" placeholder="Your store name" value={storeName} onChange={(e) => setStoreName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="storePhone">Store Phone (optional)</Label>
                  <Input id="storePhone" type="tel" placeholder="Store phone number" value={storePhone} onChange={(e) => setStorePhone(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="storeAddress">Store Address (optional)</Label>
                  <Input id="storeAddress" placeholder="Store address" value={storeAddress} onChange={(e) => setStoreAddress(e.target.value)} />
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input id="email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-10" required />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input id="password" type={showPassword ? 'text' : 'password'} placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} className="pl-10 pr-10" required />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <input type="checkbox" id="terms" className="rounded border-border mt-1" required />
              <Label htmlFor="terms" className="text-sm font-normal cursor-pointer">
                I agree to the <span className="text-primary hover:underline cursor-pointer">Terms of Service</span> and <span className="text-primary hover:underline cursor-pointer">Privacy Policy</span>
              </Label>
            </div>
            <Button type="submit" className="w-full bg-gradient-to-r from-slate-800 to-black hover:from-slate-700 hover:to-slate-900 shadow-lg shadow-slate-800/30" disabled={loading || !inviteChecked}>
              {loading ? 'Creating account...' : 'Create Account'}
              {!loading && <ArrowRight className="w-4 h-4 ml-2" />}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-6">
            Already have an account? <Link href="/login" className="text-primary font-medium hover:underline">Sign in</Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
