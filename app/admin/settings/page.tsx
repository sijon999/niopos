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
import { useTranslation } from '@/hooks/use-translation';
import { useConfirmation } from '@/hooks/use-confirmation';

export default function SettingsPage() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { confirmUpdate, dialog: confirmationDialog } = useConfirmation();

  useEffect(() => {
    let current = true;

    async function loadSettings() {
      try {
        const { data, error } = await supabase.from('settings').select('*').maybeSingle();
        if (!current) return;
        if (error) {
          setSettingsError(error.message);
        } else if (!data) {
          setSettingsError(t('settings.notConfigured'));
        } else {
          setSettings(data);
        }
      } catch (error) {
        if (!current) return;
        setSettingsError(error instanceof Error ? error.message : t('settings.loadFailed'));
      } finally {
        if (current) setLoading(false);
      }
    }

    void loadSettings();
    return () => {
      current = false;
    };
  }, [t]);

  const handleSave = async () => {
    if (!settings) return;
    await confirmUpdate({
      successMessage: t('settings.settingsSaved'),
      action: async () => {
        setSaving(true);
        try {
      const { error } = await supabase.from('settings').update({
        store_name: settings.store_name,
        store_email: settings.store_email,
        store_phone: settings.store_phone,
        store_address: settings.store_address,
        currency: settings.currency,
        currency_symbol: settings.currency_symbol,
        tax_rate: settings.tax_rate,
        receipt_footer: settings.receipt_footer,
        domain: settings.domain?.trim() || null,
        trade_license_no: settings.trade_license_no?.trim() || null,
        tax_no: settings.tax_no?.trim() || null,
      }).eq('id', settings.id);
          if (error) throw error;
        } finally {
          setSaving(false);
        }
      },
    });
  };

  if (loading) {
    return <div className="space-y-6"><Card className="p-6 h-96 animate-pulse bg-muted/50" /></div>;
  }

  if (settingsError || !settings) {
    return (
      <Card className="max-w-3xl p-6">
        <p className="text-sm text-destructive" role="alert">
          {settingsError ?? t('settings.loadFailed')}
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-2xl font-bold font-heading">{t('settings.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('settings.configureStore')}</p>
      </div>

      {/* Store Information */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-slate-800 to-black flex items-center justify-center">
              <Store className="w-4 h-4 text-white" />
            </div>
            <h3 className="font-semibold font-heading">{t('settings.storeInformation')}</h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2 col-span-2"><Label>{t('settings.storeName')}</Label><Input value={settings.store_name} onChange={(e) => setSettings({ ...settings, store_name: e.target.value })} /></div>
            <div className="space-y-2"><Label>{t('common.email')}</Label><Input type="email" value={settings.store_email} onChange={(e) => setSettings({ ...settings, store_email: e.target.value })} /></div>
            <div className="space-y-2"><Label>{t('common.phone')}</Label><Input value={settings.store_phone} onChange={(e) => setSettings({ ...settings, store_phone: e.target.value })} /></div>
            <div className="space-y-2 col-span-2"><Label>{t('common.address')}</Label><Input value={settings.store_address} onChange={(e) => setSettings({ ...settings, store_address: e.target.value })} /></div>
            <div className="space-y-2 col-span-2"><Label>{t('settings.domain')} <span className="text-muted-foreground">({t('common.optional')})</span></Label><Input value={settings.domain || ''} onChange={(e) => setSettings({ ...settings, domain: e.target.value })} /></div>
            <div className="space-y-2"><Label>{t('settings.tradeLicenseNo')} <span className="text-muted-foreground">({t('common.optional')})</span></Label><Input value={settings.trade_license_no || ''} onChange={(e) => setSettings({ ...settings, trade_license_no: e.target.value })} /></div>
            <div className="space-y-2"><Label>{t('settings.taxNo')} <span className="text-muted-foreground">({t('common.optional')})</span></Label><Input value={settings.tax_no || ''} onChange={(e) => setSettings({ ...settings, tax_no: e.target.value })} /></div>
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
            <h3 className="font-semibold font-heading">{t('settings.currencyTax')}</h3>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2"><Label>{t('settings.currency')}</Label><Input value={settings.currency} onChange={(e) => setSettings({ ...settings, currency: e.target.value })} /></div>
            <div className="space-y-2"><Label>{t('settings.currencySymbol')}</Label><Input value={settings.currency_symbol} onChange={(e) => setSettings({ ...settings, currency_symbol: e.target.value })} /></div>
            <div className="space-y-2"><Label>{t('settings.taxRate')}</Label><Input type="number" step="0.01" value={settings.tax_rate} onChange={(e) => setSettings({ ...settings, tax_rate: Number(e.target.value) })} /></div>
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
            <h3 className="font-semibold font-heading">{t('settings.receiptSettings')}</h3>
          </div>
          <div className="space-y-2"><Label>{t('settings.receiptFooter')}</Label><Input value={settings.receipt_footer} onChange={(e) => setSettings({ ...settings, receipt_footer: e.target.value })} /></div>
        </Card>
      </motion.div>

      {/* Save button */}
      <div className="flex justify-end">
        <Button className="bg-gradient-to-r from-slate-800 to-black hover:from-slate-700 hover:to-slate-900 shadow-lg shadow-slate-800/30" onClick={handleSave} disabled={saving}>
          <Save className="w-4 h-4 mr-2" />
          {saving ? t('common.saving') : t('settings.saveSettings')}
        </Button>
      </div>
      {confirmationDialog}
    </div>
  );
}
