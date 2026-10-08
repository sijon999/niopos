import { supabase } from '@/lib/supabase';

export type DiscountOffer = {
  id: string;
  name: string;
  description: string | null;
  code: string | null;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  minimum_purchase: number;
  maximum_discount: number;
  start_date: string;
  end_date: string;
  status: 'active' | 'inactive';
  eligibility_type: 'all' | 'selected' | 'group' | 'new' | 'returning';
  max_usage: number | null;
  max_usage_per_customer: number | null;
  usage_count: number;
  unlimited_usage: boolean;
  created_at: string;
  updated_at: string;
};

export type CustomerDiscountOffer = {
  id: string;
  customer_id: string;
  offer_id: string;
  assigned_at: string;
  status: string;
  usage_count: number;
  expires_at: string | null;
  discount_offers?: DiscountOffer | null;
};

export type DiscountOfferUsage = {
  id: string;
  offer_id: string;
  customer_id: string | null;
  sale_id: string | null;
  discount_amount: number;
  discount_value: number;
  discount_type: string;
  used_at: string;
  cashier_id: string | null;
  discount_offers?: { name: string; discount_type: string; discount_value: number } | null;
  sales?: { invoice_number: string; sale_date: string } | null;
  customers?: { name: string } | null;
};

export type EligibleOffer = {
  id: string;
  name: string;
  description: string | null;
  code: string | null;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  minimum_purchase: number;
  maximum_discount: number;
  start_date: string;
  end_date: string;
  eligibility_type: string;
  usage_count: number;
  max_usage: number | null;
  max_usage_per_customer: number | null;
  customer_usage_count: number;
};

export function calculateOfferDiscount(
  offer: Pick<EligibleOffer, 'discount_type' | 'discount_value' | 'maximum_discount'>,
  taxableAmount: number
): number {
  if (taxableAmount <= 0) return 0;
  let discount: number;
  if (offer.discount_type === 'percentage') {
    discount = taxableAmount * (offer.discount_value / 100);
    if (offer.maximum_discount > 0 && discount > offer.maximum_discount) {
      discount = offer.maximum_discount;
    }
  } else {
    discount = offer.discount_value;
    if (offer.maximum_discount > 0 && discount > offer.maximum_discount) {
      discount = offer.maximum_discount;
    }
  }
  return Math.min(Math.max(discount, 0), taxableAmount);
}

export async function fetchEligibleOffers(
  customerId: string | null,
  cartTotal: number
): Promise<EligibleOffer[]> {
  const { data, error } = await supabase.rpc('get_customer_eligible_offers', {
    p_customer_id: customerId as any,
    p_cart_total: cartTotal,
  });
  if (error) return [];
  return (data || []) as EligibleOffer[];
}

export function formatOfferLabel(offer: EligibleOffer): string {
  const discount = offer.discount_type === 'percentage'
    ? `${offer.discount_value}% OFF`
    : `৳${offer.discount_value} OFF`;
  return `${offer.name} - ${discount}`;
}

export function checkMinimumPurchase(
  offer: EligibleOffer,
  subtotal: number
): { valid: boolean; message: string | null } {
  if (offer.minimum_purchase > 0 && subtotal < offer.minimum_purchase) {
    return {
      valid: false,
      message: `This offer requires a minimum purchase of ৳${Number(offer.minimum_purchase).toFixed(0)}.`,
    };
  }
  return { valid: true, message: null };
}
