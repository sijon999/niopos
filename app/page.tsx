'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ShoppingCart,
  Search,
  Menu,
  X,
  Shirt,
  Truck,
  Shield,
  Clock,
  Star,
  ChevronRight,
  ArrowRight,
  Heart,
  Plus,
  Minus,
  Trash2,
  Zap,
  Flame,
  Tag,
  CheckCircle2,
  Sparkles,
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

export default function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [cartOpen, setCartOpen] = useState(false);
  const [countdown, setCountdown] = useState({ hours: 12, minutes: 0, seconds: 0 });
  const addToCart = usePOSStore((s) => s.addToCart);
  const cart = usePOSStore((s) => s.cart);
  const updateQuantity = usePOSStore((s) => s.updateQuantity);
  const removeFromCart = usePOSStore((s) => s.removeFromCart);
  const getSubtotal = usePOSStore((s) => s.getSubtotal);
  const { user, isAdmin, hydrate, logout } = useAuthStore();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    async function loadData() {
      const [prodRes, catRes] = await Promise.all([
        supabase
          .from('products')
          .select('*, brands(name), categories(name)')
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(8),
        supabase.from('categories').select('*').eq('status', 'active').is('parent_id', 'null'),
      ]);
      setProducts(prodRes.data || []);
      setCategories(catRes.data || []);
      setLoading(false);
    }
    loadData();
  }, []);

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

  const handleAddToCart = (product: Product) => {
    addToCart(product);
    toast.success(`${product.name} added to cart`);
  };

  const onSaleProducts = products.filter((p) => p.discount_price).slice(0, 4);
  const featuredCategories = [
    { name: 'Shirts', icon: '👔', color: 'from-blue-400 to-indigo-600' },
    { name: 'T-Shirts', icon: '👕', color: 'from-cyan-400 to-blue-600' },
    { name: 'Pants', icon: '👖', color: 'from-slate-400 to-slate-600' },
    { name: 'Jeans', icon: '🩳', color: 'from-indigo-400 to-blue-700' },
    { name: 'Panjabi', icon: '🧑‍🦱', color: 'from-amber-400 to-orange-600' },
    { name: 'Hoodies', icon: '🧥', color: 'from-rose-400 to-pink-600' },
    { name: 'Jackets', icon: '🧥', color: 'from-teal-400 to-cyan-600' },
    { name: 'Accessories', icon: '⌚', color: 'from-yellow-400 to-amber-600' },
  ];

  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50/20 via-white to-white dark:from-amber-950/10 dark:via-background dark:to-background">
      {/* Navigation */}
      <header className="sticky top-0 z-50 glass border-b border-border/40">
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-800 to-black flex items-center justify-center shadow-lg shadow-slate-800/30">
                <Shirt className="w-5 h-5 text-amber-400" />
              </div>
              <span className="text-xl font-bold font-heading">StyleBazaar</span>
            </div>

            <div className="hidden md:flex items-center gap-8">
              <Link href="/" className="text-sm font-medium text-foreground/80 hover:text-primary transition-colors">Home</Link>
              <Link href="/shop" className="text-sm font-medium text-foreground/80 hover:text-primary transition-colors">Shop</Link>
              {isAdmin && <Link href="/admin/dashboard" className="text-sm font-medium text-foreground/80 hover:text-primary transition-colors">Dashboard</Link>}
              {isAdmin && <Link href="/admin/pos" className="text-sm font-medium text-foreground/80 hover:text-primary transition-colors">POS</Link>}
              {user ? (
                <button onClick={logout} className="text-sm font-medium text-rose-600 hover:text-rose-700 transition-colors">Logout</button>
              ) : (
                <Link href="/login" className="text-sm font-medium text-foreground/80 hover:text-primary transition-colors">Login</Link>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Button size="sm" variant="ghost" className="relative hidden sm:flex" onClick={() => setCartOpen(true)}>
                <ShoppingCart className="w-5 h-5" />
                {cart.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-amber-500 text-white text-xs flex items-center justify-center font-bold animate-pulse">
                    {cart.length}
                  </span>
                )}
              </Button>
              <Button asChild size="sm" className="hidden sm:flex bg-gradient-to-r from-slate-800 to-black hover:from-slate-700 hover:to-slate-900">
                <Link href={user ? (isAdmin ? '/admin/dashboard' : '/shop') : '/login'}>
                  {user ? (isAdmin ? 'Dashboard' : 'My Account') : 'Get Started'}
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

      {/* Flash Sale Banner */}
      <div className="bg-gradient-to-r from-rose-500 to-orange-500 text-white text-center py-2.5 px-4 text-sm font-medium">
        <div className="max-w-7xl mx-auto flex items-center justify-center gap-2 flex-wrap">
          <Flame className="w-4 h-4" />
          <span>Flash Sale ends in</span>
          <span className="font-bold tabular-nums bg-white/20 px-2 py-0.5 rounded">{pad(countdown.hours)}:{pad(countdown.minutes)}:{pad(countdown.seconds)}</span>
          <span className="hidden sm:inline">— Up to 30% off select items!</span>
        </div>
      </div>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-amber-50/30 to-transparent dark:from-slate-950/30 dark:via-amber-950/10" />
        <div className="absolute top-20 right-10 w-72 h-72 bg-amber-300/20 rounded-full blur-3xl" />
        <div className="absolute bottom-10 left-10 w-96 h-96 bg-slate-300/10 rounded-full blur-3xl" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-28">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="space-y-6">
              <Badge variant="secondary" className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                <Sparkles className="w-3 h-3 mr-1" />
                New collection arriving weekly
              </Badge>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold font-heading leading-tight">
                Fashion that fits
                <br />
                <span className="bg-gradient-to-r from-slate-800 to-amber-600 bg-clip-text text-transparent">
                  your style
                </span>
              </h1>
              <p className="text-lg text-muted-foreground max-w-md">
                Shop shirts, pants, panjabi, jeans, and more. Premium quality clothing at prices you'll love. Free delivery on orders over ৳2000.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button asChild size="lg" className="w-full sm:w-auto bg-gradient-to-r from-slate-800 to-black hover:from-slate-700 hover:to-slate-900 shadow-lg shadow-slate-800/30 group">
                  <Link href="/shop">
                    Shop Now
                    <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                  </Link>
                </Button>
                {isAdmin && (
                  <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
                    <Link href="/admin/dashboard">Admin Dashboard</Link>
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-6 pt-4">
                <div>
                  <div className="text-2xl font-bold">10k+</div>
                  <div className="text-sm text-muted-foreground">Happy Customers</div>
                </div>
                <div className="w-px h-10 bg-border" />
                <div>
                  <div className="text-2xl font-bold">500+</div>
                  <div className="text-sm text-muted-foreground">Fashion Products</div>
                </div>
                <div className="w-px h-10 bg-border" />
                <div>
                  <div className="text-2xl font-bold">48h</div>
                  <div className="text-sm text-muted-foreground">Fast Delivery</div>
                </div>
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, delay: 0.2 }} className="relative">
              <div className="grid grid-cols-2 gap-4">
                {[
                  { emoji: '👔', label: 'Oxford Shirt', price: '৳1,290', bg: 'from-blue-100 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30' },
                  { emoji: '👖', label: 'Slim Jeans', price: '৳1,890', bg: 'from-indigo-100 to-blue-100 dark:from-indigo-900/30 dark:to-blue-900/30' },
                  { emoji: '🧑‍🦱', label: 'Silk Panjabi', price: '৳1,690', bg: 'from-amber-100 to-orange-100 dark:from-amber-900/30 dark:to-orange-900/30' },
                  { emoji: '🧥', label: 'Denim Jacket', price: '৳2,290', bg: 'from-teal-100 to-cyan-100 dark:from-teal-900/30 dark:to-cyan-900/30' },
                ].map((item, i) => (
                  <motion.div
                    key={item.label}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.3 + i * 0.1 }}
                    className={`bg-gradient-to-br ${item.bg} rounded-2xl p-6 flex flex-col items-center justify-center gap-2 shadow-sm hover:shadow-md transition-shadow cursor-pointer`}
                  >
                    <span className="text-5xl">{item.emoji}</span>
                    <span className="font-semibold text-sm">{item.label}</span>
                    <span className="text-lg font-bold text-slate-700 dark:text-amber-400">{item.price}</span>
                  </motion.div>
                ))}
              </div>
              <div className="absolute -bottom-6 -right-6 bg-white dark:bg-card rounded-2xl shadow-xl p-4 flex items-center gap-3 border border-border">
                <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
                  <Truck className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <div className="text-sm font-semibold">Free Delivery</div>
                  <div className="text-xs text-muted-foreground">On orders over ৳2000</div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Features Bar */}
      <section className="border-y border-border/40 bg-white/50 dark:bg-card/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { icon: Truck, title: 'Fast Delivery', desc: '48 hours or free' },
              { icon: Shirt, title: 'Premium Quality', desc: 'Curated fashion' },
              { icon: Shield, title: 'Secure Payment', desc: 'Protected checkout' },
              { icon: Clock, title: '24/7 Support', desc: 'Always here for you' },
            ].map((feature) => (
              <div key={feature.title} className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                  <feature.icon className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <div className="font-semibold text-sm">{feature.title}</div>
                  <div className="text-xs text-muted-foreground">{feature.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold font-heading">Shop by Category</h2>
            <p className="text-muted-foreground text-sm mt-1">Browse our wide selection of fashion products</p>
          </div>
          <Link href="/shop" className="text-sm font-medium text-primary hover:underline flex items-center gap-1">
            View all <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
          {featuredCategories.map((cat, i) => (
            <motion.div key={cat.name} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.3, delay: i * 0.05 }} className="group cursor-pointer">
              <Link href="/shop">
                <div className={`aspect-square rounded-2xl bg-gradient-to-br ${cat.color} flex items-center justify-center mb-2 shadow-sm group-hover:shadow-md group-hover:scale-105 transition-all`}>
                  <span className="text-3xl">{cat.icon}</span>
                </div>
                <p className="text-sm font-medium text-center">{cat.name}</p>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Flash Sale Products */}
      {onSaleProducts.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="rounded-3xl bg-gradient-to-br from-rose-50 to-orange-50 dark:from-rose-950/20 dark:to-orange-950/20 border border-rose-200/50 dark:border-rose-900/30 p-6 sm:p-8">
            <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500 to-orange-500 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold font-heading">Flash Sale</h2>
                  <p className="text-muted-foreground text-sm">Limited time deals — grab them fast!</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground hidden sm:inline">Ends in</span>
                <div className="flex items-center gap-1">
                  <span className="font-bold tabular-nums bg-rose-500 text-white px-2 py-1 rounded text-sm">{pad(countdown.hours)}</span>
                  <span className="font-bold text-rose-500">:</span>
                  <span className="font-bold tabular-nums bg-rose-500 text-white px-2 py-1 rounded text-sm">{pad(countdown.minutes)}</span>
                  <span className="font-bold text-rose-500">:</span>
                  <span className="font-bold tabular-nums bg-rose-500 text-white px-2 py-1 rounded text-sm">{pad(countdown.seconds)}</span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {onSaleProducts.map((product, i) => {
                const discountPercent = product.discount_price
                  ? Math.round(((product.selling_price - product.discount_price) / product.selling_price) * 100)
                  : 0;
                return (
                  <motion.div key={product.id} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.3, delay: i * 0.05 }}>
                    <Card className="group overflow-hidden hover:shadow-xl transition-all duration-300 border-rose-200/50 dark:border-rose-900/30">
                      <div className="aspect-square bg-gradient-to-br from-slate-50 to-amber-50 dark:from-slate-900/30 dark:to-amber-900/20 flex items-center justify-center relative overflow-hidden">
                        {product.image_url ? (
                          <img src={product.image_url} alt={product.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                        ) : (
                          <span className="text-5xl group-hover:scale-110 transition-transform">
                            {getProductEmoji(product.name, product.categories?.name)}
                          </span>
                        )}
                        <Badge className="absolute top-2 left-2 bg-rose-500 hover:bg-rose-500 text-white font-bold">-{discountPercent}%</Badge>
                      </div>
                      <div className="p-3 space-y-1">
                        <h3 className="font-semibold text-sm line-clamp-1">{product.name}</h3>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-rose-600 dark:text-rose-400">৳{product.discount_price}</span>
                          <span className="text-xs text-muted-foreground line-through">৳{product.selling_price}</span>
                        </div>
                        <Button
                          size="sm"
                          className="w-full bg-gradient-to-r from-rose-500 to-orange-500 hover:from-rose-600 hover:to-orange-600 text-white mt-2"
                          onClick={() => handleAddToCart(product)}
                          disabled={product.stock <= 0}
                        >
                          <ShoppingCart className="w-3.5 h-3.5 mr-1" />
                          {product.stock <= 0 ? 'Sold Out' : 'Add to Cart'}
                        </Button>
                      </div>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Featured Products */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold font-heading">Featured Products</h2>
            <p className="text-muted-foreground text-sm mt-1">Handpicked fashion items just for you</p>
          </div>
          <Link href="/shop" className="text-sm font-medium text-primary hover:underline flex items-center gap-1">
            View all <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {loading ? Array.from({ length: 8 }).map((_, i) => <Card key={i} className="p-4 h-64 animate-pulse bg-muted/50" />) :
            products.map((product, i) => (
              <motion.div key={product.id} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.3, delay: i * 0.05 }}>
                <Card className="group overflow-hidden hover:shadow-xl transition-all duration-300 border-border/60 flex flex-col h-full">
                  <div className="aspect-square bg-gradient-to-br from-slate-50 to-amber-50 dark:from-slate-900/30 dark:to-amber-900/20 flex items-center justify-center relative overflow-hidden">
                    {product.image_url ? (
                      <img src={product.image_url} alt={product.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                    ) : (
                      <span className="text-5xl group-hover:scale-110 transition-transform">
                        {getProductEmoji(product.name, product.categories?.name)}
                      </span>
                    )}
                    {product.discount_price && <Badge className="absolute top-2 left-2 bg-rose-500 hover:bg-rose-500">Sale</Badge>}
                    {product.stock > 0 && product.stock < 10 && (
                      <Badge className="absolute top-2 right-2 bg-amber-500 hover:bg-amber-500">Only {product.stock} left</Badge>
                    )}
                    <button className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/80 dark:bg-card/80 flex items-center justify-center hover:bg-white shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
                      <Heart className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </div>
                  <div className="p-3 space-y-1 flex flex-col flex-1">
                    <p className="text-xs text-muted-foreground">{product.brands?.name || 'StyleBazaar'}</p>
                    <h3 className="font-semibold text-sm line-clamp-1">{product.name}</h3>
                    <div className="flex items-center gap-1">
                      <div className="flex">
                        {Array.from({ length: 5 }).map((_, idx) => <Star key={idx} className="w-3 h-3 fill-amber-400 text-amber-400" />)}
                      </div>
                      <span className="text-xs text-muted-foreground ml-1">(24)</span>
                    </div>
                    <div className="flex items-center justify-between pt-1 mt-auto">
                      <div className="flex items-center gap-1">
                        <span className="font-bold text-slate-800 dark:text-amber-400">৳{product.discount_price || product.selling_price}</span>
                        {product.discount_price && <span className="text-xs text-muted-foreground line-through">৳{product.selling_price}</span>}
                      </div>
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
            ))}
        </div>
      </section>

      {/* Social Proof / Testimonials */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center mb-10">
          <Badge variant="secondary" className="mb-3">
            <Star className="w-3 h-3 mr-1 fill-amber-400 text-amber-400" />
            Rated 4.8/5 by 2,000+ customers
          </Badge>
          <h2 className="text-2xl font-bold font-heading">What Our Customers Say</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { name: 'Rahim Ahmed', text: 'The quality of shirts is amazing. Delivery was super fast and the packaging was premium. Will buy again!', rating: 5 },
            { name: 'Sadia Islam', text: 'Love the panjabi collection! Prices are very reasonable compared to other stores. Highly recommended.', rating: 5 },
            { name: 'Karim Hassan', text: 'Best online fashion store in Bangladesh. The jeans fit perfectly and the customer service is excellent.', rating: 5 },
          ].map((review, i) => (
            <motion.div key={review.name} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.3, delay: i * 0.1 }}>
              <Card className="p-6 h-full">
                <div className="flex items-center gap-1 mb-3">
                  {Array.from({ length: review.rating }).map((_, idx) => (
                    <Star key={idx} className="w-4 h-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="text-sm text-muted-foreground mb-4 italic">&ldquo;{review.text}&rdquo;</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center text-white font-bold text-sm">
                    {review.name.charAt(0)}
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{review.name}</p>
                    <p className="text-xs text-muted-foreground">Verified Buyer</p>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-800 to-black p-8 sm:p-12 lg:p-16">
          <div className="absolute top-0 right-0 w-64 h-64 bg-amber-400/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-amber-300/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
          <div className="relative max-w-2xl">
            <Badge className="bg-amber-400/20 text-amber-300 border-0 mb-4">
              <Tag className="w-3 h-3 mr-1" /> Special Offer
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-bold font-heading text-white mb-4">
              Get 15% off your first order
            </h2>
            <p className="text-slate-300 text-lg mb-6">
              Sign up today and receive an exclusive discount code. Plus, manage your fashion store with StyleBazaar POS — complete point of sale, inventory, analytics, and more.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              {isAdmin ? (
                <Button asChild size="lg" variant="secondary" className="w-full sm:w-auto group">
                  <Link href="/admin/dashboard">
                    Go to Dashboard <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                  </Link>
                </Button>
              ) : (
                <Button asChild size="lg" variant="secondary" className="w-full sm:w-auto group">
                  <Link href="/register">
                    Claim Your Discount <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                  </Link>
                </Button>
              )}
              <Button asChild size="lg" className="w-full sm:w-auto bg-amber-500 text-slate-900 hover:bg-amber-400 group">
                <Link href="/shop">
                  Browse Shop
                  <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Newsletter / Trust badges */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {[
            { icon: CheckCircle2, title: 'Easy Returns', desc: '7-day hassle-free returns' },
            { icon: Shield, title: 'Secure Checkout', desc: 'Your data is always protected' },
            { icon: Truck, title: 'Nationwide Delivery', desc: 'Free on orders over ৳2000' },
          ].map((item) => (
            <div key={item.title} className="flex items-center gap-3 p-4 rounded-2xl border border-border/40 bg-white/50 dark:bg-card/30">
              <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                <item.icon className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="font-semibold text-sm">{item.title}</p>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="col-span-2">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-800 to-black flex items-center justify-center">
                  <Shirt className="w-5 h-5 text-amber-400" />
                </div>
                <span className="text-xl font-bold font-heading">StyleBazaar</span>
              </div>
              <p className="text-sm text-muted-foreground max-w-sm">
                Your one-stop shop for premium fashion. Shirts, pants, panjabi, jeans, and more — quality clothing delivered with care.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-sm mb-3">Quick Links</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link href="/shop" className="hover:text-primary">Shop</Link></li>
                <li><Link href="/login" className="hover:text-primary">Login</Link></li>
                <li><Link href="/register" className="hover:text-primary">Register</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-sm mb-3">Support</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>Contact Us</li>
                <li>FAQ</li>
                <li>Shipping Info</li>
                <li>Returns</li>
              </ul>
            </div>
          </div>
          <div className="border-t border-border/40 mt-8 pt-8 text-center text-sm text-muted-foreground">
            © 2026 StyleBazaar. All rights reserved.
          </div>
        </div>
      </footer>

      {/* Cart Drawer */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setCartOpen(false)} />
          <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} className="relative w-full max-w-sm bg-card shadow-2xl flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="font-semibold">Shopping Cart ({cart.length})</h3>
              <Button size="icon" variant="ghost" onClick={() => setCartOpen(false)}><X className="w-5 h-5" /></Button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {cart.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <ShoppingCart className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Your cart is empty</p>
                  <Button asChild variant="outline" size="sm" className="mt-4">
                    <Link href="/shop" onClick={() => setCartOpen(false)}>Start Shopping</Link>
                  </Button>
                </div>
              ) : cart.map((item) => (
                <div key={item.product_id} className="flex items-center gap-3 p-2 rounded-lg border border-border/40">
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.name} className="w-10 h-10 rounded-lg object-cover shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-xl shrink-0">
                      {getProductEmoji(item.name)}
                    </div>
                  )}
                  <div className="flex-1">
                    <p className="text-sm font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">৳{item.price}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQuantity(item.product_id, item.quantity - 1)}><Minus className="w-3 h-3" /></Button>
                    <span className="w-8 text-center text-sm">{item.quantity}</span>
                    <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQuantity(item.product_id, item.quantity + 1)}><Plus className="w-3 h-3" /></Button>
                  </div>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-rose-600" onClick={() => removeFromCart(item.product_id)}><Trash2 className="w-3 h-3" /></Button>
                </div>
              ))}
            </div>
            {cart.length > 0 && (
              <div className="p-4 border-t border-border space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Subtotal</span>
                  <span className="font-bold">৳{getSubtotal().toFixed(2)}</span>
                </div>
                <Button asChild className="w-full bg-gradient-to-r from-slate-800 to-black hover:from-slate-700 hover:to-slate-900 group">
                  <Link href="/admin/pos" onClick={() => setCartOpen(false)}>
                    Checkout
                    <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                  </Link>
                </Button>
              </div>
            )}
          </motion.div>
        </div>
      )}
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
