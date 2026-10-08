'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Save, Store, Receipt, Percent, Globe, Mail } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase';
import type { Settings } from '@/types';
import { toast } from 'sonner';

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadSettings() {
      const { data } = await supabase.from('settings').select('*').limit(1).maybeSingle();
      if (data) setSettings(data);
      setLoading(false);
    }
    loadSettings();
  }, []);

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    const { error } = await supabase.from('settings').update({
      store_name: settings.store_name,
      store_email: settings.store_email,
      store_phone: settings.store_phone,
      store_address: settings.store_address,
      currency: settings.currency,
      currency_symbol: settings.currency_symbol,
      tax_rate: settings.tax_rate,
      receipt_footer: settings.receipt_footer,
    }).eq('id', settings.id);
    setSaving(false);
    if (error) { toast.error('Failed to save settings'); return; }
    toast.success('Settings saved successfully');
  };

  if (loading || !settings) {
    return <div className="space-y-6"><Card className="p-6 h-96 animate-pulse bg-muted/50" /></div>;
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-2xl font-bold font-heading">Settings</h2>
        <p className="text-sm text-muted-foreground">Configure your store</p>
      </div>

      {/* Store Information */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-slate-800 to-black flex items-center justify-center">
              <Store className="w-4 h-4 text-white" />
            </div>
            <h3 className="font-semibold font-heading">Store Information</h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2 col-span-2"><Label>Store Name</Label><Input value={settings.store_name} onChange={(e) => setSettings({ ...settings, store_name: e.target.value })} /></div>
            <div className="space-y-2"><Label>Email</Label><Input type="email" value={settings.store_email} onChange={(e) => setSettings({ ...settings, store_email: e.target.value })} /></div>
            <div className="space-y-2"><Label>Phone</Label><Input value={settings.store_phone} onChange={(e) => setSettings({ ...settings, store_phone: e.target.value })} /></div>
            <div className="space-y-2 col-span-2"><Label>Address</Label><Input value={settings.store_address} onChange={(e) => setSettings({ ...settings, store_address: e.target.value })} /></div>
          </div>
        </Card>
      </motion.div>

      {/* Currency & Tax */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center">
              <Percent className="w-4 h-4 text-white" />
            </div>
            <h3 className="font-semibold font-heading">Currency & Tax</h3>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2"><Label>Currency</Label><Input value={settings.currency} onChange={(e) => setSettings({ ...settings, currency: e.target.value })} /></div>
            <div className="space-y-2"><Label>Symbol</Label><Input value={settings.currency_symbol} onChange={(e) => setSettings({ ...settings, currency_symbol: e.target.value })} /></div>
            <div className="space-y-2"><Label>Tax Rate (%)</Label><Input type="number" step="0.01" value={settings.tax_rate} onChange={(e) => setSettings({ ...settings, tax_rate: Number(e.target.value) })} /></div>
          </div>
        </Card>
      </motion.div>

      {/* Receipt Settings */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
              <Receipt className="w-4 h-4 text-white" />
            </div>
            <h3 className="font-semibold font-heading">Receipt Settings</h3>
          </div>
          <div className="space-y-2"><Label>Receipt Footer Message</Label><Input value={settings.receipt_footer} onChange={(e) => setSettings({ ...settings, receipt_footer: e.target.value })} /></div>
        </Card>
      </motion.div>

      {/* Save button */}
      <div className="flex justify-end">
        <Button className="bg-gradient-to-r from-slate-800 to-black hover:from-slate-700 hover:to-slate-900 shadow-lg shadow-slate-800/30" onClick={handleSave} disabled={saving}>
          <Save className="w-4 h-4 mr-2" />
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
}
