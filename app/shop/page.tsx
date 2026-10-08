'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Search,
  ShoppingCart,
  Shirt,
  Menu,
  X,
  Star,
  Heart,
  Plus,
  ChevronRight,
  SlidersHorizontal,
  Truck,
  Shield,
  CheckCircle2,
  Flame,
  Zap,
  Tag,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { usePOSStore } from '@/store/pos-store';
import { useAuthStore } from '@/store/auth-store';
import { supabase } from '@/lib/supabase';
import type { Product, Category } from '@/types';
import { toast } from 'sonner';

export default function ShopPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortBy, setSortBy] = useState('name');
  const [priceRange, setPriceRange] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [showOnlyDeals, setShowOnlyDeals] = useState(false);
  const [countdown, setCountdown] = useState({ hours: 12, minutes: 0, seconds: 0 });
  const addToCart = usePOSStore((s) => s.addToCart);
  const cart = usePOSStore((s) => s.cart);
  const { user, isAdmin, hydrate, logout } = useAuthStore();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        let { hours, minutes, seconds } = prev;
        seconds--;
        if (seconds < 0) { seconds = 59; minutes--; }
        if (minutes < 0) { minutes = 59; hours--; }
        if (hours < 0) { hours = 12; minutes = 0; seconds = 0; }
        return { hours, minutes, seconds };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    async function loadData() {
      const [prodRes, catRes] = await Promise.all([
        supabase
          .from('products')
          .select('*, brands(name), categories(name)')
          .eq('status', 'active')
          .order('name'),
        supabase.from('categories').select('*').eq('status', 'active').is('parent_id', 'null'),
      ]);
      setProducts(prodRes.data || []);
      setCategories(catRes.data || []);
      setLoading(false);
    }
    loadData();
  }, []);

  const filtered = useMemo(() => {
    let result = products.filter((p) => {
      const matchesSearch =
        !search ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.sku?.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = selectedCategory === 'all' || p.category_id === selectedCategory;
      const price = p.discount_price || p.selling_price;
      const matchesPrice =
        priceRange === 'all' ||
        (priceRange === '0-500' && price < 500) ||
        (priceRange === '500-1000' && price >= 500 && price < 1000) ||
        (priceRange === '1000+' && price >= 1000);
      const matchesDeals = !showOnlyDeals || p.discount_price !== null;
      return matchesSearch && matchesCategory && matchesPrice && matchesDeals;
    });

    if (sortBy === 'price-low') result = [...result].sort((a, b) => (a.discount_price || a.selling_price) - (b.discount_price || b.selling_price));
    if (sortBy === 'price-high') result = [...result].sort((a, b) => (b.discount_price || b.selling_price) - (a.discount_price || a.selling_price));
    if (sortBy === 'name') result = [...result].sort((a, b) => a.name.localeCompare(b.name));
    if (sortBy === 'deals') result = [...result].sort((a, b) => (b.discount_price ? 1 : 0) - (a.discount_price ? 1 : 0));

    return result;
  }, [products, search, selectedCategory, priceRange, sortBy, showOnlyDeals]);

  const handleAddToCart = (product: Product) => {
    if (product.stock <= 0) {
      toast.error(`${product.name} is out of stock`);
      return;
    }
    addToCart(product);
    toast.success(`${product.name} added to cart`);
  };

  const pad = (n: number) => String(n).padStart(2, '0');
  const dealsCount = products.filter((p) => p.discount_price).length;

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50/20 via-white to-white dark:from-amber-950/10 dark:via-background dark:to-background">
      {/* Navigation */}
      <header className="sticky top-0 z-50 glass border-b border-border/40">
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <Link href="/" className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-800 to-black flex items-center justify-center shadow-lg shadow-slate-800/30">
                  <Shirt className="w-5 h-5 text-amber-400" />
                </div>
                <span className="text-xl font-bold font-heading">StyleBazaar</span>
              </Link>
            </div>

            <div className="hidden md:flex items-center gap-8">
              <Link href="/" className="text-sm font-medium text-foreground/80 hover:text-primary transition-colors">Home</Link>
              <Link href="/shop" className="text-sm font-medium text-primary">Shop</Link>
              {isAdmin && <Link href="/admin/dashboard" className="text-sm font-medium text-foreground/80 hover:text-primary transition-colors">Dashboard</Link>}
              {isAdmin && <Link href="/admin/pos" className="text-sm font-medium text-foreground/80 hover:text-primary transition-colors">POS</Link>}
              {user ? (
                <button onClick={logout} className="text-sm font-medium text-rose-600 hover:text-rose-700 transition-colors">Logout</button>
              ) : (
                <Link href="/login" className="text-sm font-medium text-foreground/80 hover:text-primary transition-colors">Login</Link>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Button asChild size="sm" variant="ghost" className="relative">
                <Link href="/admin/pos">
                  <ShoppingCart className="w-5 h-5" />
                  {cart.length > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-amber-500 text-white text-xs flex items-center justify-center font-bold animate-pulse">
                      {cart.length}
                    </span>
                  )}
                </Link>
              </Button>
              <button className="md:hidden p-2" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {mobileMenuOpen && (
            <div className="md:hidden py-4 border-t border-border/40 space-y-2">
              <Link href="/" className="block px-4 py-2 text-sm font-medium hover:bg-muted rounded-lg">Home</Link>
              <Link href="/shop" className="block px-4 py-2 text-sm font-medium hover:bg-muted rounded-lg">Shop</Link>
              {isAdmin && <Link href="/admin/dashboard" className="block px-4 py-2 text-sm font-medium hover:bg-muted rounded-lg">Dashboard</Link>}
              {isAdmin && <Link href="/admin/pos" className="block px-4 py-2 text-sm font-medium hover:bg-muted rounded-lg">POS</Link>}
              {user ? (
                <button onClick={logout} className="block w-full text-left px-4 py-2 text-sm font-medium text-rose-600 hover:bg-muted rounded-lg">Logout</button>
              ) : (
                <Link href="/login" className="block px-4 py-2 text-sm font-medium hover:bg-muted rounded-lg">Login</Link>
              )}
            </div>
          )}
        </nav>
      </header>

      {/* Hero banner with flash sale */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-800 to-black">
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-400/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-amber-300/10 rounded-full blur-3xl translate-y-1/2" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <Badge className="bg-amber-400/20 text-amber-300 hover:bg-amber-400/30 border-0 mb-3">
              <Flame className="w-3 h-3 mr-1" /> Flash Sale Live Now
            </Badge>
            <h1 className="text-3xl sm:text-4xl font-bold font-heading text-white mb-2">
              Shop Fashion Online
            </h1>
            <p className="text-slate-300 max-w-lg mb-4">
              Browse our full collection of shirts, pants, panjabi, jeans, and more. Premium quality clothing at prices you'll love.
            </p>
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-400">Sale ends in</span>
                <div className="flex items-center gap-1">
                  <span className="font-bold tabular-nums bg-amber-500 text-white px-2 py-1 rounded text-sm">{pad(countdown.hours)}</span>
                  <span className="font-bold text-amber-400">:</span>
                  <span className="font-bold tabular-nums bg-amber-500 text-white px-2 py-1 rounded text-sm">{pad(countdown.minutes)}</span>
                  <span className="font-bold text-amber-400">:</span>
                  <span className="font-bold tabular-nums bg-amber-500 text-white px-2 py-1 rounded text-sm">{pad(countdown.seconds)}</span>
                </div>
              </div>
              {dealsCount > 0 && (
                <Badge className="bg-rose-500 hover:bg-rose-500 text-white border-0">
                  <Zap className="w-3 h-3 mr-1" /> {dealsCount} items on sale
                </Badge>
              )}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Trust bar */}
      <section className="border-b border-border/40 bg-white/50 dark:bg-card/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="grid grid-cols-3 gap-4">
            {[
              { icon: Truck, title: 'Free Delivery', desc: 'Over ৳2000' },
              { icon: Shield, title: 'Secure Payment', desc: '100% protected' },
              { icon: CheckCircle2, title: 'Easy Returns', desc: '7-day return' },
            ].map((item) => (
              <div key={item.title} className="flex items-center gap-2 sm:gap-3">
                <div className="w-9 h-9 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                  <item.icon className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="hidden sm:block">
                  <p className="font-semibold text-xs">{item.title}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Search and sort bar */}
        <div className="flex gap-3 flex-wrap items-center mb-6">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search products..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="name">Sort: Name</option>
            <option value="price-low">Price: Low to High</option>
            <option value="price-high">Price: High to Low</option>
            <option value="deals">Best Deals First</option>
          </select>
          <Button
            variant={showOnlyDeals ? "default" : "outline"}
            size="sm"
            onClick={() => setShowOnlyDeals(!showOnlyDeals)}
            className={showOnlyDeals ? "bg-rose-500 hover:bg-rose-600 text-white" : ""}
          >
            <Tag className="w-4 h-4 mr-2" /> Deals Only
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)}>
            <SlidersHorizontal className="w-4 h-4 mr-2" /> Filters
          </Button>
        </div>

        <div className="flex gap-6">
          {/* Sidebar filters */}
          <aside className={`w-56 shrink-0 ${showFilters ? 'block' : 'hidden'} lg:block`}>
            <div className="space-y-6 sticky top-24">
              <div>
                <h3 className="font-semibold text-sm mb-3">Categories</h3>
                <div className="space-y-1">
                  <button
                    onClick={() => setSelectedCategory('all')}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                      selectedCategory === 'all' ? 'bg-slate-800 text-white font-medium' : 'hover:bg-muted'
                    }`}
                  >
                    All Products
                  </button>
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedCategory(cat.id)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                        selectedCategory === cat.id ? 'bg-slate-800 text-white font-medium' : 'hover:bg-muted'
                      }`}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-sm mb-3">Price Range</h3>
                <div className="space-y-1">
                  {[
                    { value: 'all', label: 'All Prices' },
                    { value: '0-500', label: 'Under ৳500' },
                    { value: '500-1000', label: '৳500 - ৳1000' },
                    { value: '1000+', label: '৳1000 & above' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setPriceRange(opt.value)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                        priceRange === opt.value ? 'bg-slate-800 text-white font-medium' : 'hover:bg-muted'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </aside>

          {/* Product grid */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-muted-foreground">
                {filtered.length} product{filtered.length !== 1 ? 's' : ''} found
              </p>
              {showOnlyDeals && (
                <Badge className="bg-rose-500 hover:bg-rose-500 text-white">
                  <Zap className="w-3 h-3 mr-1" /> Showing deals only
                </Badge>
              )}
            </div>

            {loading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Card key={i} className="p-4 h-64 animate-pulse bg-muted/50" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                <Search className="w-12 h-12 mb-3 opacity-50" />
                <p>No products found matching your filters</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => { setSearch(''); setSelectedCategory('all'); setPriceRange('all'); setShowOnlyDeals(false); }}
                >
                  Clear filters
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {filtered.map((product, i) => {
                  const discountPercent = product.discount_price
                    ? Math.round(((product.selling_price - product.discount_price) / product.selling_price) * 100)
                    : 0;
                  return (
                    <motion.div
                      key={product.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: i * 0.03 }}
                    >
                      <Card className="group overflow-hidden hover:shadow-xl transition-all duration-300 border-border/60 flex flex-col h-full">
                        <div className="aspect-square bg-gradient-to-br from-slate-50 to-amber-50 dark:from-slate-900/30 dark:to-amber-900/20 flex items-center justify-center relative overflow-hidden">
                          {product.image_url ? (
                            <img src={product.image_url} alt={product.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                          ) : (
                            <span className="text-5xl group-hover:scale-110 transition-transform">
                              {getProductEmoji(product.name, product.categories?.name)}
                            </span>
                          )}
                          {product.discount_price && (
                            <Badge className="absolute top-2 left-2 bg-rose-500 hover:bg-rose-500 text-white font-bold">-{discountPercent}%</Badge>
                          )}
                          {product.stock <= 0 && (
                            <Badge className="absolute top-2 right-2 bg-rose-600">Out of Stock</Badge>
                          )}
                          {product.stock > 0 && product.stock < 10 && (
                            <Badge className="absolute top-2 right-2 bg-amber-500 hover:bg-amber-500">Only {product.stock} left</Badge>
                          )}
                          <button className="absolute bottom-2 right-2 w-8 h-8 rounded-full bg-white/80 dark:bg-card/80 flex items-center justify-center hover:bg-white shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
                            <Heart className="w-4 h-4 text-muted-foreground" />
                          </button>
                        </div>
                        <div className="p-3 space-y-1 flex flex-col flex-1">
                          <p className="text-xs text-muted-foreground">{product.brands?.name || 'StyleBazaar'}</p>
                          <h3 className="font-semibold text-sm line-clamp-1">{product.name}</h3>
                          <div className="flex items-center gap-1">
                            <div className="flex">
                              {Array.from({ length: 5 }).map((_, idx) => (
                                <Star key={idx} className="w-3 h-3 fill-amber-400 text-amber-400" />
                              ))}
                            </div>
                            <span className="text-xs text-muted-foreground ml-1">(24)</span>
                          </div>
                          <div className="flex items-center gap-2 pt-1">
                            <span className="font-bold text-slate-800 dark:text-amber-400">
                              ৳{product.discount_price || product.selling_price}
                            </span>
                            {product.discount_price && (
                              <span className="text-xs text-muted-foreground line-through">
                                ৳{product.selling_price}
                              </span>
                            )}
                          </div>
                          <Button
                            size="sm"
                            className="w-full bg-gradient-to-r from-slate-800 to-black hover:from-slate-700 hover:to-slate-900 mt-2 group/btn"
                            onClick={() => handleAddToCart(product)}
                            disabled={product.stock <= 0}
                          >
                            <ShoppingCart className="w-3.5 h-3.5 mr-1.5 group-hover/btn:scale-110 transition-transform" />
                            {product.stock <= 0 ? 'Sold Out' : 'Add to Cart'}
                          </Button>
                        </div>
                      </Card>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* CTA Banner */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-rose-500 to-orange-500 p-8 sm:p-12 text-center">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          <div className="relative">
            <Badge className="bg-white/20 text-white border-0 mb-4">
              <Tag className="w-3 h-3 mr-1" /> First Order
            </Badge>
            <h2 className="text-2xl sm:text-3xl font-bold font-heading text-white mb-3">
              Get 15% Off Your First Purchase
            </h2>
            <p className="text-white/90 mb-6 max-w-md mx-auto">
              Sign up today and receive an exclusive discount code instantly.
            </p>
            <Button asChild size="lg" className="bg-white text-rose-600 hover:bg-amber-50 group">
              <Link href="/register">
                Sign Up & Save
                <ChevronRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-800 to-black flex items-center justify-center">
                <Shirt className="w-5 h-5 text-amber-400" />
              </div>
              <span className="text-lg font-bold font-heading">StyleBazaar</span>
            </div>
            <p className="text-sm text-muted-foreground">© 2026 StyleBazaar Fashion. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function getProductEmoji(name: string, category?: string): string {
  const lower = name.toLowerCase();
  const cat = (category || '').toLowerCase();
  if (cat.includes('shirt') || lower.includes('shirt')) return '👔';
  if (cat.includes('t-shirt') || lower.includes('t-shirt') || lower.includes('polo')) return '👕';
  if (cat.includes('pant') || lower.includes('pant') || lower.includes('chino') || lower.includes('cargo')) return '👖';
  if (cat.includes('jean') || lower.includes('jean')) return '👖';
  if (cat.includes('panjabi') || lower.includes('panjabi')) return '🧕';
  if (cat.includes('hoodie') || lower.includes('hoodie') || lower.includes('sweatshirt')) return '🧥';
  if (cat.includes('jacket') || lower.includes('jacket') || lower.includes('blazer') || lower.includes('bomber')) return '🧥';
  if (cat.includes('accessor') || lower.includes('belt')) return '👞';
  if (lower.includes('cap')) return '🧢';
  if (lower.includes('sock')) return '🧦';
  if (lower.includes('watch')) return '⌚';
  return '👕';
}
