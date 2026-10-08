import './globals.css';
import type { Metadata } from 'next';
import { Inter, Plus_Jakarta_Sans, Noto_Sans_Bengali } from 'next/font/google';
import { Providers } from '@/components/providers';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
});
const notoBengali = Noto_Sans_Bengali({
  subsets: ['bengali'],
  variable: '--font-bengali',
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'StyleBazaar POS — Clothing Store Management System',
  description:
    'Complete point of sale and inventory management system for clothing stores. Manage products, track inventory, process sales, and analyze your business.',
  keywords: ['clothing POS', 'fashion POS', 'inventory management', 'point of sale', 'retail'],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${jakarta.variable} ${notoBengali.variable} font-sans antialiased`} suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
