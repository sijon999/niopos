'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Boxes,
  Tags,
  Users,
  Truck,
  FileBarChart,
  Receipt,
  ShoppingBag,
  Settings,
  Shirt,
  Menu,
  X,
  ChevronDown,
  Moon,
  Sun,
  Bell,
  Search,
  UserCog,
  CreditCard,
  Store,
  Barcode as BarcodeIcon,
  ChevronRight,
  Ruler,
  Globe,
  ClipboardCheck,
  Gift,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useTheme } from 'next-themes';
import { useAuthStore } from '@/store/auth-store';
import { useTranslation } from '@/hooks/use-translation';
import type { Locale } from '@/store/i18n-store';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const { user, isAdmin, hydrate, logout } = useAuthStore();
  const { t, locale, setLocale } = useTranslation();

  useEffect(() => {
    setMounted(true);
    hydrate();
  }, [hydrate]);

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const navItems = [
    { href: '/admin/dashboard', labelKey: 'navigation.dashboard', icon: LayoutDashboard, adminOnly: false },
    { href: '/admin/pos', labelKey: 'navigation.pos', icon: ShoppingCart, adminOnly: false },
    { href: '/admin/products', labelKey: 'navigation.products', icon: Package, adminOnly: false },
    { href: '/admin/inventory', labelKey: 'navigation.inventory', icon: Boxes, adminOnly: false },
    { href: '/admin/stock-reconciliation', labelKey: 'navigation.stockReconciliation', icon: ClipboardCheck, adminOnly: false },
    { href: '/admin/barcode', labelKey: 'navigation.barcode', icon: BarcodeIcon, adminOnly: false, children: [
      { href: '/admin/barcode/generate', labelKey: 'navigation.generateBarcode' },
      { href: '/admin/barcode/scan', labelKey: 'navigation.scanBarcode' },
      { href: '/admin/barcode/history', labelKey: 'navigation.barcodeHistory' },
    ] },
    { href: '/admin/categories', labelKey: 'navigation.categories', icon: Tags, adminOnly: true },
    { href: '/admin/brands', labelKey: 'navigation.brands', icon: Store, adminOnly: true },
    { href: '/admin/units', labelKey: 'navigation.units', icon: Ruler, adminOnly: true },
    { href: '/admin/customers', labelKey: 'navigation.customers', icon: Users, adminOnly: false },
    { href: '/admin/discount-offers', labelKey: 'navigation.discountOffers', icon: Gift, adminOnly: true },
    { href: '/admin/suppliers', labelKey: 'navigation.suppliers', icon: Truck, adminOnly: true },
    { href: '/admin/employees', labelKey: 'navigation.employees', icon: UserCog, adminOnly: true },
    { href: '/admin/purchases', labelKey: 'navigation.purchases', icon: Receipt, adminOnly: true },
    { href: '/admin/sales', labelKey: 'navigation.sales', icon: ShoppingBag, adminOnly: true },
    { href: '/admin/expenses', labelKey: 'navigation.expenses', icon: CreditCard, adminOnly: true },
    { href: '/admin/reports', labelKey: 'navigation.reports', icon: FileBarChart, adminOnly: true },
    { href: '/admin/settings', labelKey: 'navigation.settings', icon: Settings, adminOnly: true },
  ].filter((item) => !item.adminOnly || isAdmin);

  const currentPage = navItems.find((item) => pathname === item.href || pathname.startsWith(item.href + '/'));
  const barcodeExpanded = pathname.startsWith('/admin/barcode');
  const [barcodeOpen, setBarcodeOpen] = useState(false);
  useEffect(() => { if (barcodeExpanded) setBarcodeOpen(true); }, [barcodeExpanded]);

  const switchLanguage = (newLocale: Locale) => {
    setLocale(newLocale);
    setLangMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-50 h-screen w-64 bg-card border-r border-border transition-transform duration-300 lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between h-16 px-5 border-b border-border">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-slate-800 to-black flex items-center justify-center shadow-lg shadow-slate-800/20">
              <Shirt className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <span className="text-lg font-bold font-heading">StyleBazaar</span>
              <p className="text-xs text-muted-foreground">{t('navigation.pos')}</p>
            </div>
          </Link>
          <button
            className="lg:hidden p-1 hover:bg-muted rounded-lg"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="p-3 space-y-1 overflow-y-auto h-[calc(100vh-4rem)] scrollbar-thin">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.children ? pathname.startsWith(item.href + '/') : pathname.startsWith(item.href + '/'));
            if (item.children) {
              return (
                <div key={item.href}>
                  <button
                    onClick={() => setBarcodeOpen(!barcodeOpen)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all w-full ${
                      barcodeExpanded
                        ? 'bg-gradient-to-r from-slate-800 to-black text-white shadow-md shadow-slate-800/20'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    <item.icon className="w-4 h-4 shrink-0" />
                    {t(item.labelKey)}
                    <ChevronRight className={`w-4 h-4 ml-auto transition-transform ${barcodeOpen ? 'rotate-90' : ''}`} />
                  </button>
                  {barcodeOpen && (
                    <div className="ml-4 mt-1 space-y-0.5">
                      {item.children.map((child) => {
                        const childActive = pathname === child.href;
                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            onClick={() => setSidebarOpen(false)}
                            className={`flex items-center gap-2 pl-4 pr-3 py-2 rounded-lg text-sm transition-all ${
                              childActive
                                ? 'bg-primary/10 text-primary font-medium'
                                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                            }`
                            }
                          >
                            <span className="w-1 h-1 rounded-full bg-current opacity-50" />
                            {t(child.labelKey)}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-gradient-to-r from-slate-800 to-black text-white shadow-md shadow-slate-800/20'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <item.icon className="w-4 h-4 shrink-0" />
                {t(item.labelKey)}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top bar */}
        <header className="sticky top-0 z-30 h-16 glass border-b border-border/40">
          <div className="flex items-center justify-between h-full px-4 sm:px-6">
            <div className="flex items-center gap-3">
              <button
                className="lg:hidden p-2 hover:bg-muted rounded-lg"
                onClick={() => setSidebarOpen(true)}
              >
                <Menu className="w-5 h-5" />
              </button>
              <h1 className="text-lg font-semibold font-heading hidden sm:block">
                {currentPage ? t(currentPage.labelKey) : t('navigation.dashboard')}
              </h1>
              {user && (
                <Badge variant="secondary" className="hidden sm:flex bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 capitalize">
                  {user.role}
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <div className="hidden md:block relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder={t('common.search') + '...'} className="pl-9 h-9 bg-muted/50 border-0" />
              </div>

              {/* Language Switcher */}
              <div className="relative">
                <button
                  onClick={() => setLangMenuOpen(!langMenuOpen)}
                  className="flex items-center gap-1.5 px-2 h-9 rounded-lg hover:bg-muted transition-colors text-sm font-medium"
                >
                  <Globe className="w-4 h-4" />
                  <span className="hidden sm:inline">{locale === 'bn' ? 'বাংলা' : 'English'}</span>
                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
                <AnimatePresence>
                  {langMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 top-full mt-2 w-40 bg-card border border-border rounded-xl shadow-xl py-1 z-50"
                    >
                      <button
                        onClick={() => switchLanguage('en')}
                        className={`flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted rounded-lg mx-1 w-[calc(100%-8px)] ${locale === 'en' ? 'font-semibold text-indigo-600' : ''}`}
                      >
                        <span className="text-base">🇬🇧</span> English
                        {locale === 'en' && <span className="ml-auto text-indigo-600">✓</span>}
                      </button>
                      <button
                        onClick={() => switchLanguage('bn')}
                        className={`flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted rounded-lg mx-1 w-[calc(100%-8px)] ${locale === 'bn' ? 'font-semibold text-indigo-600' : ''}`}
                      >
                        <span className="text-base">🇧🇩</span> বাংলা
                        {locale === 'bn' && <span className="ml-auto text-indigo-600">✓</span>}
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              >
                {mounted && theme === 'dark' ? (
                  <Sun className="w-4 h-4" />
                ) : (
                  <Moon className="w-4 h-4" />
                )}
              </Button>

              <Button variant="ghost" size="icon" className="h-9 w-9 relative">
                <Bell className="w-4 h-4" />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500" />
              </Button>

              <div className="relative">
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-2 p-1 pr-2 hover:bg-muted rounded-lg transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-800 to-black flex items-center justify-center text-white text-sm font-bold">
                    {user?.name?.charAt(0).toUpperCase() || 'A'}
                  </div>
                  <div className="hidden sm:block text-left">
                    <div className="text-sm font-medium">{user?.name || 'Admin User'}</div>
                    <div className="text-xs text-muted-foreground capitalize">{user?.role || 'administrator'}</div>
                  </div>
                  <ChevronDown className="w-4 h-4 text-muted-foreground hidden sm:block" />
                </button>
                <AnimatePresence>
                  {userMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 top-full mt-2 w-56 bg-card border border-border rounded-xl shadow-xl py-2 z-50"
                    >
                      <div className="px-3 py-2 border-b border-border">
                        <div className="font-semibold text-sm">{user?.name || 'Admin User'}</div>
                        <div className="text-xs text-muted-foreground">{user?.email || 'admin@stylebazaar.com'}</div>
                        <Badge variant="secondary" className="mt-1 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 capitalize">
                          {user?.role || 'administrator'}
                        </Badge>
                      </div>
                      <div className="py-1">
                        {isAdmin && (
                          <Link href="/admin/settings" className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted rounded-lg mx-1">
                            <Settings className="w-4 h-4" /> {t('navigation.settings')}
                          </Link>
                        )}
                        <Link href="/shop" className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted rounded-lg mx-1">
                          <Shirt className="w-4 h-4" /> {t('navigation.viewShop')}
                        </Link>
                        <button onClick={handleLogout} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted rounded-lg mx-1 text-rose-600 w-full">
                          <X className="w-4 h-4" /> {t('navigation.signOut')}
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
